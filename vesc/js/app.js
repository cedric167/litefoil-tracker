import { Vesc } from './vesc.js';
import { BleTransport, SerialTransport } from './transport.js';
import { SimTransport } from './sim.js';
import { COMM, Writer } from './protocol.js';
import {
  T, definitionForFw, definitionForSignature, displayValue, fromDisplayValue, displayRange, loadIndex,
} from './config.js';
import { showDiagnostic } from './diag.js';
import { initEssentials } from './essentials.js';
import { initRemote } from './remote.js';
import { initSession } from './session.js';
import { PROFILES, savedProfile } from './profiles.js';
import { $, $$, toast, fmt, fmtInt, clamp, download, pickFile, el, setKv, haptic } from './ui.js';

const state = {
  vesc: null,
  fw: null,
  configs: { mcconf: null, appconf: null },
  readSnap: { mcconf: null, appconf: null },
  page: 'home',
};
const hold = { timer: null };
const inputs = { running: false, timer: null };

const connected = () => !!state.vesc && state.linkUp;

function requireConn() {
  if (state.vesc && !state.linkUp) {
    toast('Reconnexion en cours, patiente…', true);
    return false;
  }
  if (!connected()) {
    toast("Connecte d'abord le contrôleur", true);
    showPage('home');
    return false;
  }
  return true;
}

// Garde l'écran allumé tant que le contrôleur est connecté (envoi de firmware, détection…).
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* refusé : sans conséquence */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHold();
  else if (connected()) keepAwake(true);
});

// ---------------------------------------------------------------- jauges SVG (mêmes formes que ../index.html)

const RING_C = 2 * Math.PI * 48;

function updateRing(container, pct, big, small, color) {
  const p = Number.isFinite(pct) ? clamp(pct, 0, 1) : 0;
  let fg = container.querySelector('.ring-fg');
  if (!fg) {
    container.innerHTML = '<svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="48"/>'
      + '<circle class="ring-fg" cx="60" cy="60" r="48" stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="'
      + RING_C.toFixed(1) + '"/><text class="ring-big" x="60" y="64"></text><text class="ring-small" x="60" y="82"></text></svg>';
    fg = container.querySelector('.ring-fg');
  }
  fg.setAttribute('stroke-dashoffset', (RING_C * (1 - p)).toFixed(1));
  fg.setAttribute('stroke', color);
  container.querySelector('.ring-big').textContent = big;
  container.querySelector('.ring-small').textContent = small;
}

function sparkSVG(values, color) {
  if (values.length < 2) return '';
  const w = 300;
  const h = 40;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) { max += 1; min -= 1; }
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / (max - min)) * h]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const id = 'sg' + color.slice(1);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="' + id
    + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".28"/><stop offset="1" stop-color="'
    + color + '" stop-opacity="0"/></linearGradient></defs><path d="' + line + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="url(#' + id
    + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
}

const tempClass = (t, warn, bad) => (t >= bad ? 'bad-c' : t >= warn ? 'warn-c' : '');

// ================================================================ navigation

function showPage(page) {
  if (!$('#page-' + page)) return;
  state.page = page;
  for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.page === page);
  for (const s of $$('.page')) s.classList.toggle('active', s.id === 'page-' + page);
  $('#tabs button.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  if (page !== 'control') stopHold();
  if (page !== 'inputs') stopInputs();
  updateSaveBar();
  if (page === 'realtime') requestAnimationFrame(drawCharts);
  if (page === 'essentials') essentials.render();
  if (page === 'remote') remote.render(); else remote.stop();
  if (page === 'sessions') session.onShow();
  if (page === 'firmware') updateFwGate();
  history.replaceState(null, '', '#' + page);
  telemetry.kick();
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) showPage(b.dataset.page);
});
$('#connPill').addEventListener('click', () => showPage('home'));

// ================================================================ connexion

if (!BleTransport.supported) {
  const b = $('#bleSupport');
  b.hidden = false;
  b.textContent = "Ce navigateur ne gère pas le Bluetooth web. Utilise Chrome sur Android ou un ordinateur. "
    + "Sur iPhone, l'application Bluefy permet d'ouvrir cette page.";
  $('#btnBle').disabled = true;
}
if (!SerialTransport.supported) $('#btnUsb').hidden = true;

$('#btnBle').onclick = () => connect(new BleTransport());
$('#btnUsb').onclick = () => connect(new SerialTransport());
$('#btnDemo').onclick = () => connect(new SimTransport());
$('#btnDisconnect').onclick = () => disconnect();
$('#btnDiag').onclick = () => showDiagnostic();

function setConn(text, cls) {
  $('#connText').textContent = text;
  $('#lamp').className = 'lamp' + (cls ? ' ' + cls : '');
  $('#connPill').classList.toggle('on', cls === 'on');
}

async function connect(transport, device = null) {
  if (state.vesc) await disconnect();
  const vesc = new Vesc(transport);
  setConn('Connexion…', 'busy');
  try {
    await vesc.open(device);
  } catch (e) {
    setConn('Hors ligne', '');
    if (e.name !== 'NotFoundError') {
      toast('Connexion impossible : ' + e.message, true);
      showDiagnostic(e.message);
    }
    return;
  }
  state.vesc = vesc;
  state.linkUp = true;
  vesc.addEventListener('close', () => onLinkLost(vesc));
  vesc.addEventListener('print', (e) => termAppend(e.detail));
  setConn('En ligne', 'on');
  haptic(30);
  keepAwake(true);
  $('#connectCard').hidden = true;
  $('#homeLive').hidden = false;
  try {
    await loadTarget();
    backupAll('Connexion');
    toast('Connecté à ' + transport.name + (transport.profile ? ' (' + transport.profile + ')' : ''));
  } catch (e) {
    toast('Connecté au module, mais le contrôleur ne répond pas', true);
    showDiagnostic(e.message);
  }
  telemetry.kick();
}

// Coupure radio : on garde l'état (et les modifications non écrites) et on réessaie tout seul.
async function onLinkLost(vesc) {
  if (state.vesc !== vesc || !state.linkUp) return;
  state.linkUp = false;
  stopHold();
  if (!vesc.transport.canReconnect) { onDisconnected(); return; }
  setConn('Reconnexion…', 'busy');
  toast('Liaison perdue, reconnexion…', true);
  haptic([60, 40, 60]);
  const delays = [500, 1000, 2000, 3000, 5000, 5000, 8000, 10000, 15000, 20000];
  for (const d of delays) {
    await new Promise((r) => setTimeout(r, d));
    if (state.vesc !== vesc || !vesc.transport.canReconnect) return;
    if (document.hidden) continue;
    try {
      await vesc.transport.reconnect();
      vesc.decoder.reset();
      await vesc.getFwVersion();
      state.linkUp = true;
      setConn('En ligne', 'on');
      toast('Reconnecté ✓');
      haptic(30);
      if (session.rec) session.mark('Reconnexion');
      telemetry.kick();
      return;
    } catch (e) { /* on réessaie */ }
  }
  onDisconnected();
}

async function disconnect() {
  if (!state.vesc) return;
  stopHold();
  const v = state.vesc;
  onDisconnected(true);
  await v.close();
}

function onDisconnected(manual = false) {
  if (!state.vesc) return;
  state.vesc = null;
  state.linkUp = false;
  stopHold();
  stopInputs();
  keepAwake(false);
  setConn('Hors ligne', '');
  $('#connectCard').hidden = false;
  $('#homeLive').hidden = true;
  $('#infoCard').hidden = true;
  $('#devLabel').hidden = true;
  $('#topSub').textContent = 'Contrôleur moteur';
  canDevs.length = 0;
  refreshLastDevice();
  if (!manual) toast('Contrôleur déconnecté', true);
}

// Bouton « Reconnecter <module> » : reprend le dernier module sans passer par la liste.
async function refreshLastDevice() {
  const btn = $('#btnLast');
  const dev = BleTransport.supported ? await BleTransport.lastDevice() : null;
  btn.hidden = !dev;
  if (!dev) return;
  btn.querySelector('span').textContent = 'Reconnecter ' + (dev.name || 'le dernier module');
  btn.onclick = () => connect(new BleTransport(), dev);
}
refreshLastDevice();

// Lit les informations et les configurations du VESC ciblé (local ou CAN).
async function loadTarget() {
  const v = state.vesc;
  const fw = await v.getFwVersion();
  state.fw = fw;
  const ver = fw.major + '.' + String(fw.minor).padStart(2, '0');
  $('#devName').textContent = fw.hw || 'VESC';
  $('#devSub').textContent = 'Firmware ' + ver + (fw.isTestFw ? ' (test ' + fw.isTestFw + ')' : '')
    + (v.canId >= 0 ? ' · CAN ' + v.canId : ' · ' + v.transport.name);
  $('#topSub').textContent = (fw.hw || 'VESC') + ' · ' + ver;
  setKv($('#fwInfo'), [
    ['Firmware', ver],
    ['Matériel', fw.hw || '?'],
    ['Liaison', v.transport.profile || v.transport.name],
    ['Appairé', fw.isPaired ? 'oui' : 'non'],
    ['UUID', fw.uuid || '?', { full: true, mono: true }],
  ]);
  $('#fwHwName').textContent = fw.hw || '?';
  showMotorCard();
  $('#infoCard').hidden = false;
  $('#devLabel').hidden = false;
  renderCanChips();

  if (fw.hwType && fw.hwType !== 0) {
    state.configs = { mcconf: null, appconf: null };
    renderConfigPages();
    return;
  }
  await readConfig('mcconf', false, true);
  await readConfig('appconf', false, true);
  warnVersion(fw, ver);
}

// Carte « Ton moteur » de l'accueil : photo et nom du profil choisi dans la page Essentiel.
function showMotorCard() {
  const p = PROFILES[savedProfile()];
  $('#motorImg').src = p ? p.img : 'img/propeller.webp';
  $('#motorName').textContent = p ? p.name : 'Choisir un profil';
  $('#motorSub').textContent = p ? p.specs.slice(0, 2).map((s) => s[1]).join(' · ') : 'Réglages essentiels et détection';
}
$('#motorCard').onclick = () => showPage('essentials');

// Versions qui ne figurent pas dans VESC Tool : source fréquente de détections ratées sur les forums.
async function warnVersion(fw, ver) {
  const index = await loadIndex();
  const known = index.some((e) => (e.fw || [e.folder]).includes(ver));
  const box = $('#verWarn');
  box.hidden = known && !fw.isTestFw && fw.major >= 5;
  if (fw.major < 5) box.textContent = 'Firmware ' + ver + ' ancien : une mise à jour corrige beaucoup de soucis de détection et de Bluetooth.';
  else box.textContent = 'Firmware ' + ver + (fw.isTestFw ? ' de test' : '') + ' non répertorié par VESC Tool : réglages lus avec les définitions '
    + (state.configs.mcconf?.folder || '?') + ' (même signature). Vérifie la page Essentiel.';
}

const canDevs = [];
function renderCanChips() {
  const list = $('#canList');
  list.replaceChildren();
  if (!canDevs.length) return;
  const cur = state.vesc?.canId ?? -1;
  for (const id of [-1, ...canDevs]) {
    const c = el('button', 'chip' + (id === cur ? ' on' : ''), id < 0 ? 'Local' : 'CAN ' + id);
    c.onclick = () => selectTarget(id);
    list.append(c);
  }
}

async function selectTarget(id) {
  if (!state.vesc || state.vesc.canId === id) return;
  if (dirtyCount() && !confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return;
  state.vesc.canId = id;
  try {
    await loadTarget();
    toast(id < 0 ? 'Cible : contrôleur local' : 'Cible : CAN ' + id);
  } catch (e) {
    toast('Lecture impossible : ' + e.message, true);
  }
}

$('#btnScanCan').onclick = async () => {
  if (!requireConn()) return;
  try {
    const devs = await state.vesc.pingCan();
    canDevs.splice(0, canDevs.length, ...devs);
    renderCanChips();
    if (state.page === 'essentials') essentials.render();
    toast(devs.length ? devs.length + ' contrôleur(s) sur le CAN' : 'Aucun autre contrôleur sur le CAN');
  } catch (e) {
    toast('Scan CAN : ' + e.message, true);
  }
};

$('#btnReboot').onclick = () => {
  if (requireConn() && confirm('Redémarrer le contrôleur ?')) state.vesc.reboot();
};

// ================================================================ sauvegardes locales

const BACKUP_KEY = 'lf-vesc-backups';
const BACKUP_MAX = 20;

function loadBackups() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || []; } catch (e) { return []; }
}

function saveBackups(list) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, BACKUP_MAX))); } catch (e) { /* stockage plein ou bloqué */ }
}

function backupAll(reason) {
  for (const kind of ['mcconf', 'appconf']) {
    if (state.configs[kind] && state.readSnap[kind]) backup(kind, reason, state.readSnap[kind]);
  }
}

function backup(kind, reason, snap) {
  const list = loadBackups();
  const fw = state.fw || {};
  const can = state.vesc?.canId ?? -1;
  const prev = list.find((b) => b.kind === kind && b.uuid === fw.uuid && b.can === can);
  // Inutile de garder deux copies identiques à la suite.
  if (prev && JSON.stringify(prev.values) === JSON.stringify(snap)) return;
  list.unshift({ t: Date.now(), kind, reason, hw: fw.hw, uuid: fw.uuid, can, folder: state.configs[kind].folder, values: snap });
  saveBackups(list);
  renderBackups();
}

function renderBackups() {
  const box = $('#backupList');
  box.replaceChildren();
  for (const [i, b] of loadBackups().entries()) {
    const item = el('div', 'item');
    const ic = el('span', 'ic', b.kind === 'mcconf' ? 'MOT' : 'APP');
    ic.style.background = b.kind === 'mcconf' ? '#148a90' : '#0a84ff';
    const lb = el('div', 'lb');
    lb.append(el('b', '', (b.kind === 'mcconf' ? 'Moteur' : 'App') + ' · ' + (b.hw || 'VESC') + (b.can >= 0 ? ' · CAN ' + b.can : '')),
      el('span', '', new Date(b.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + b.reason));
    const acts = el('div', 'acts');
    const load = el('button', '', 'Charger');
    load.onclick = () => restoreBackup(b);
    const del = el('button', '', '✕');
    del.title = 'Supprimer';
    del.onclick = () => {
      const list = loadBackups();
      list.splice(i, 1);
      saveBackups(list);
      renderBackups();
    };
    acts.append(load, del);
    item.append(ic, lb, acts);
    box.append(item);
  }
}

function restoreBackup(b) {
  const cfg = state.configs[b.kind];
  if (!cfg) { toast("Connecte d'abord le contrôleur", true); return; }
  if (b.uuid && state.fw?.uuid && b.uuid !== state.fw.uuid
    && !confirm("Cette sauvegarde vient d'un autre contrôleur. La charger quand même ?")) return;
  const values = Object.fromEntries(Object.entries(b.values).filter(([k]) => cfg.has(k)));
  cfg.restore(values);
  showPage(b.kind);
  toast(Object.keys(values).length + ' paramètres chargés. Vérifie puis « Enregistrer ».');
}

renderBackups();

// Fichier de sauvegarde complet : les deux configurations, en valeurs et en XML VESC Tool.
function downloadFullBackup() {
  const fw = state.fw || {};
  const configs = {};
  for (const kind of ['mcconf', 'appconf']) {
    const cfg = state.configs[kind];
    const snap = state.readSnap[kind];
    if (!cfg || !snap) continue;
    // On sauvegarde ce qui est dans le contrôleur (dernière lecture), pas les modifications en cours.
    const cur = cfg.snapshot();
    cfg.restore(snap);
    configs[kind] = { folder: cfg.folder, values: snap, xml: cfg.toXml() };
    cfg.restore(cur);
  }
  if (!Object.keys(configs).length) { toast('Rien à sauvegarder : configuration non lue', true); return false; }
  const data = { app: 'lite-foil-vesc', version: 1, date: new Date().toISOString(), hw: fw.hw, uuid: fw.uuid,
    firmware: fw.major + '.' + String(fw.minor).padStart(2, '0'), can: state.vesc?.canId ?? -1, configs };
  download('sauvegarde_vesc_' + (fw.hw || 'vesc') + '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json',
    JSON.stringify(data, null, 1), 'application/json');
  toast('Sauvegarde téléchargée ✓');
  return true;
}

$('#btnBackupDl').onclick = () => { if (requireConn()) downloadFullBackup(); };
$('#btnBackupImport').onclick = async () => {
  const f = await pickFile('.json,.xml');
  if (!f) return;
  try {
    const text = await f.text();
    if (f.name.endsWith('.xml')) {
      const kind = text.includes('<MCConfiguration') ? 'mcconf' : 'appconf';
      if (!state.configs[kind]) throw new Error("connecte d'abord le contrôleur");
      const n = state.configs[kind].fromXml(text);
      showPage(kind);
      toast(n + ' paramètres importés. Vérifie puis « Enregistrer ».');
      return;
    }
    const data = JSON.parse(text);
    if (data.app !== 'lite-foil-vesc' || !data.configs) throw new Error("ce fichier n'est pas une sauvegarde Lite Foil");
    let n = 0;
    for (const [kind, c] of Object.entries(data.configs)) {
      const cfg = state.configs[kind];
      if (!cfg) continue;
      const values = Object.fromEntries(Object.entries(c.values).filter(([k]) => cfg.has(k)));
      cfg.restore(values);
      n += Object.keys(values).length;
    }
    if (!n) throw new Error("connecte d'abord le contrôleur");
    showPage('essentials');
    toast(n + ' paramètres chargés depuis la sauvegarde. Vérifie puis « Enregistrer ».');
  } catch (e) {
    toast('Import impossible : ' + e.message, true);
  }
};

// ================================================================ configurations

async function readConfig(kind, defaults = false, quiet = false) {
  if (!requireConn()) return;
  const bytes = await state.vesc.getConfigBytes(kind, defaults);
  const sig = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  let cfg = state.configs[kind];
  if (!cfg || cfg.signature !== sig) {
    cfg = await definitionForSignature(kind, sig);
    if (!cfg && state.fw) cfg = await definitionForFw(kind, state.fw.major, state.fw.minor);
    if (!cfg || cfg.signature !== sig) {
      state.configs[kind] = null;
      renderConfigPage(kind);
      throw new Error('version de configuration inconnue (signature ' + sig + ')');
    }
  }
  cfg.deserialize(bytes);
  state.configs[kind] = cfg;
  if (!cfg.pageHooked) {
    cfg.pageHooked = true;
    cfg.onChange((name) => {
      if (state.page === 'essentials') essentials.refresh();
      if (state.page === 'remote') {
        if (name === 'app_to_use' || name === null) remote.render(); else remote.drawCurve();
      }
      updateSaveBar();
    });
  }
  if (!defaults) state.readSnap[kind] = cfg.snapshot();
  renderConfigPage(kind);
  if (state.page === 'essentials') essentials.render();
  if (state.page === 'remote') remote.render();
  updateSaveBar();
  if (!quiet) toast(defaults ? 'Valeurs par défaut chargées — « Enregistrer » pour les appliquer' : 'Configuration relue');
}

function dirtyCount(kind) {
  let n = 0;
  for (const k of kind ? [kind] : ['mcconf', 'appconf']) {
    const cfg = state.configs[k];
    if (cfg && state.readSnap[k]) n += cfg.diff(state.readSnap[k]).length;
  }
  return n;
}

function valueText(p, v) {
  if (p.t === T.ENUM) return P(p.e?.[v]) ?? String(v);
  if (p.t === T.BOOL) return v ? 'oui' : 'non';
  const unit = p.pct ? ' %' : (p.u ? ' ' + p.u.trim() : '');
  if (p.t === T.DOUBLE) return String(Number(displayValue({ ...p, value: v }).toFixed(4))) + unit;
  return String(v) + unit;
}

// Pages qui éditent des configurations : quelles configurations la barre « Enregistrer » concerne.
const PAGE_KINDS = { mcconf: ['mcconf'], appconf: ['appconf'], essentials: ['mcconf', 'appconf'], remote: ['appconf'] };

// Montre les changements avant écriture ; résout true si l'utilisateur confirme.
function confirmDiff(kinds) {
  const list = $('#diffList');
  list.replaceChildren();
  let total = 0;
  for (const kind of kinds) {
    const cfg = state.configs[kind];
    const snap = state.readSnap[kind];
    if (!cfg || !snap) continue;
    for (const n of cfg.diff(snap)) {
      const p = cfg.params[n];
      const row = el('div', 'd');
      const right = el('span');
      right.append(el('span', 'old', valueText(p, snap[n])), document.createTextNode('  →  '), el('span', 'new', valueText(p, p.value)));
      row.append(el('span', '', P(p.n) || n), right, el('small', '', (kind === 'mcconf' ? 'moteur · ' : 'app · ') + n));
      list.append(row);
      total++;
    }
  }
  $('#diffTitle').textContent = total ? total + ' changement' + (total > 1 ? 's' : '') + ' à enregistrer' : 'Enregistrer la configuration ?';
  if (!total) list.append(el('div', 'empty', 'Aucun paramètre modifié depuis la dernière lecture.'));
  const dlg = $('#diffDialog');
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

async function writeConfig(kinds) {
  if (typeof kinds === 'string') kinds = [kinds];
  if (!requireConn()) return false;
  // Sans modification, on écrit quand même la configuration de la page (comme VESC Tool).
  const dirty = kinds.filter((k) => state.configs[k] && dirtyCount(k));
  const todo = dirty.length ? dirty : kinds.filter((k) => state.configs[k]);
  if (!todo.length || !(await confirmDiff(todo))) return false;
  let ok = true;
  for (const kind of todo) {
    const cfg = state.configs[kind];
    if (state.readSnap[kind]) backup(kind, 'Avant écriture', state.readSnap[kind]);
    try {
      await state.vesc.setConfig(cfg);
      // Relit pour vérifier, comme VESC Tool.
      const wanted = cfg.snapshot();
      await readConfig(kind, false, true);
      const diff = cfg.diff(wanted);
      if (diff.length) {
        ok = false;
        toast('Écrit, mais le contrôleur a corrigé : ' + diff.slice(0, 4).join(', ') + (diff.length > 4 ? '…' : ''), true);
      }
    } catch (e) {
      ok = false;
      toast("Échec de l'écriture : " + e.message, true);
    }
  }
  if (ok) {
    haptic([20, 40, 20]);
    toast('Paramètres enregistrés dans le VESC ✓');
  }
  return ok;
}

function updateSaveBar() {
  const kinds = PAGE_KINDS[state.page] || [];
  const n = kinds.reduce((a, k) => a + dirtyCount(k), 0);
  $('#saveBar').hidden = !n;
  if (n) $('#saveText').textContent = n + ' modification' + (n > 1 ? 's' : '') + ' non enregistrée' + (n > 1 ? 's' : '');
}
$('#saveWrite').onclick = () => writeConfig(PAGE_KINDS[state.page] || []);
$('#saveUndo').onclick = () => {
  for (const k of PAGE_KINDS[state.page] || []) {
    if (state.configs[k] && state.readSnap[k] && dirtyCount(k)) state.configs[k].restore(state.readSnap[k]);
  }
};

window.addEventListener('beforeunload', (e) => {
  if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; }
});

const viewState = { mcconf: { group: 0, sub: 0, search: '' }, appconf: { group: 0, sub: 0, search: '' } };
const unsubscribers = { mcconf: null, appconf: null };

function renderConfigPages() {
  renderConfigPage('mcconf');
  renderConfigPage('appconf');
}

const GEAR_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

function renderConfigPage(kind) {
  const page = $('#page-' + kind);
  const cfg = state.configs[kind];
  page.replaceChildren();
  if (unsubscribers[kind]) unsubscribers[kind]();
  unsubscribers[kind] = null;

  if (!cfg) {
    const empty = el('div', 'card cfg-empty');
    empty.innerHTML = GEAR_ICON;
    empty.append(el('div', 'cfg-title', kind === 'mcconf' ? 'Configuration moteur' : "Configuration de l'app"),
      el('p', 'muted', connected() ? 'Pas de configuration pour ce matériel.' : 'Connecte le contrôleur (ou la démo) pour afficher ses réglages.'));
    if (!connected()) {
      const b = el('button', 'btn primary', 'Se connecter');
      b.onclick = () => showPage('home');
      empty.append(b);
    }
    page.append(empty);
    return;
  }

  const vs = viewState[kind];
  if (vs.group >= cfg.groups.length) { vs.group = 0; vs.sub = 0; }

  // En-tête collant : recherche, groupes, sous-groupes
  const top = el('div', 'cfg-top');
  const search = el('label', 'cfg-search');
  search.innerHTML = SEARCH_ICON;
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Rechercher un réglage (courant, batterie, ppm…)';
  input.value = vs.search;
  search.append(input);
  const groups = el('div', 'chips scroll cfg-groups');
  const subs = el('div', 'chips scroll cfg-subs');
  top.append(search, groups, subs);

  const actions = el('div', 'cfg-actions');
  const act = (label, cls, fn) => {
    const b = el('button', 'btn small ' + cls, label);
    b.onclick = fn;
    actions.append(b);
  };
  act('Enregistrer', 'primary', () => writeConfig(kind));
  act('Relire', '', () => readConfig(kind).catch((e) => toast(e.message, true)));
  act('Valeurs par défaut', '', () => {
    if (confirm('Charger les valeurs par défaut du firmware ? Rien ne sera écrit tant que tu ne cliques pas sur « Enregistrer ».')) {
      readConfig(kind, true).catch((e) => toast(e.message, true));
    }
  });
  act('Exporter', 'ghost', () => download(kind + '_' + (state.fw?.hw || 'vesc') + '_' + new Date().toISOString().slice(0, 10) + '.xml',
    cfg.toXml(), 'application/xml'));
  act('Importer', 'ghost', async () => {
    const f = await pickFile('.xml');
    if (!f) return;
    try {
      const n = cfg.fromXml(await f.text());
      toast(n + ' paramètres importés. Vérifie puis « Enregistrer ».');
    } catch (e) {
      toast('Import impossible : ' + e.message, true);
    }
  });

  const title = el('div', 'cfg-title');
  const list = el('div', 'params');
  page.append(top, actions, title, list);

  let rows = new Map();

  const modsSet = () => new Set(state.readSnap[kind] ? cfg.diff(state.readSnap[kind]) : []);

  function drawNav() {
    groups.replaceChildren();
    subs.replaceChildren();
    const mods = modsSet();
    cfg.groups.forEach(([gname, gsubs], gi) => {
      const names = gsubs.flatMap((s) => s[1]);
      const c = el('button', 'chip' + (gi === vs.group && !vs.search ? ' on' : '') + (names.some((n) => mods.has(n)) ? ' mod' : ''), P(gname));
      c.onclick = () => { vs.group = gi; vs.sub = 0; vs.search = ''; input.value = ''; drawNav(); drawParams(); };
      groups.append(c);
    });
    if (vs.search) return;
    cfg.groups[vs.group][1].forEach(([sname, names], si) => {
      const c = el('button', 'chip' + (si === vs.sub ? ' on' : '') + (names.some((n) => mods.has(n)) ? ' mod' : ''), P(sname));
      c.onclick = () => { vs.sub = si; drawNav(); drawParams(); };
      subs.append(c);
    });
  }

  function drawParams() {
    list.replaceChildren();
    rows = new Map();
    let names;
    if (vs.search) {
      const q = vs.search.toLowerCase();
      names = Object.keys(cfg.params).filter((n) => n.toLowerCase().includes(q) || (cfg.params[n].n || '').toLowerCase().includes(q)
        || (P(cfg.params[n].n) || '').toLowerCase().includes(q));
      title.textContent = names.length + ' résultat' + (names.length > 1 ? 's' : '');
    } else {
      const [sname, sn] = cfg.groups[vs.group][1][vs.sub];
      names = sn;
      title.textContent = P(sname);
    }
    for (const name of names) {
      if (name.startsWith('::sep::')) {
        list.append(el('div', 'sep', P(name.slice(7))));
        continue;
      }
      if (!cfg.has(name)) continue;
      const row = makeParamRow(cfg, name);
      rows.set(name, row);
      list.append(row.el);
    }
    if (!list.children.length) list.append(el('div', 'cfg-empty', 'Aucun réglage trouvé.'));
    refreshMods();
  }

  function refreshMods() {
    const mods = modsSet();
    for (const [name, row] of rows) row.el.classList.toggle('mod', mods.has(name));
  }

  input.oninput = () => { vs.search = input.value.trim(); drawNav(); drawParams(); };

  unsubscribers[kind] = cfg.onChange((name) => {
    if (name === null) for (const row of rows.values()) row.update();
    else rows.get(name)?.update();
    refreshMods();
    drawNav();
    updateSaveBar();
  });

  drawNav();
  drawParams();
}

function makeParamRow(cfg, name, opts = {}) {
  const p = cfg.params[name];
  const row = el('div', 'param');
  const label = el('div', 'name', opts.label || P(p.n) || name);
  label.append(el('small', opts.hint ? 'hint' : '', opts.hint || name));
  const edit = el('div', 'edit');
  let update = () => {};

  switch (p.t) {
    case T.DOUBLE:
    case T.INT: {
      const wrap = el('div', 'input-unit');
      const input = el('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      const [min, max] = displayRange(p);
      input.min = String(min);
      input.max = String(max);
      input.step = p.t === T.DOUBLE ? (p.pct ? '0.1' : String(Math.pow(10, -(p.dec ?? 2)))) : String(p.step ?? 1);
      update = () => {
        const v = displayValue(p);
        input.value = p.t === T.DOUBLE ? String(Number(v.toFixed(p.pct ? 1 : Math.max(p.dec ?? 2, 4)))) : String(v);
      };
      input.onchange = () => {
        const v = Number(input.value);
        if (input.value === '' || !Number.isFinite(v)) { update(); return; }
        const c = clamp(v, min, max);
        if (c !== v) toast('Limité à ' + c + ' (plage ' + min + ' … ' + max + ')');
        cfg.set(name, fromDisplayValue(p, c));
        update();
      };
      wrap.append(input);
      const unit = p.pct ? '%' : (p.u || '').trim();
      if (unit) wrap.append(el('i', '', unit));
      edit.append(wrap);
      break;
    }
    case T.ENUM: {
      const sel = el('select');
      (p.e || []).forEach((n, i) => sel.append(new Option(P(n), String(i))));
      update = () => { sel.value = String(p.value); };
      sel.onchange = () => cfg.set(name, Number(sel.value));
      edit.append(sel);
      break;
    }
    case T.BOOL: {
      const sw = el('label', 'switch');
      sw.style.margin = '0';
      const cb = el('input');
      cb.type = 'checkbox';
      sw.append(cb, el('span'));
      update = () => { cb.checked = !!p.value; };
      cb.onchange = () => cfg.set(name, cb.checked ? 1 : 0);
      edit.append(sw);
      break;
    }
    case T.BITFIELD: {
      const box = el('div', 'bits');
      const cbs = (p.e || []).map((n, i) => {
        const l = el('label');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.onchange = () => {
          const v = p.value & 0xFF;
          cfg.set(name, cb.checked ? v | (1 << i) : v & ~(1 << i));
        };
        l.append(cb, P(n));
        box.append(l);
        return cb;
      });
      update = () => cbs.forEach((cb, i) => { cb.checked = !!((p.value >> i) & 1); });
      edit.append(box);
      break;
    }
    case T.STRING: {
      const input = el('input');
      input.type = 'text';
      if (p.ml) input.maxLength = p.ml;
      update = () => { input.value = p.value; };
      input.onchange = () => cfg.set(name, input.value);
      edit.append(input);
      break;
    }
    default:
      edit.textContent = '—';
  }

  const help = el('button', 'help-btn', '?');
  help.title = 'Aide';
  help.onclick = () => {
    $('#helpTitle').textContent = opts.label || P(p.n) || name;
    $('#helpName').textContent = name + (p.n && P(p.n) !== p.n ? ' · ' + p.n : '');
    $('#helpBody').textContent = (opts.help ? opts.help + '\n\nDescription VESC Tool :\n' : '')
      + (P(p.d) || 'Pas de description pour ce réglage.');
    $('#helpDialog').showModal();
  };

  row.append(label, edit, help);
  update();
  return { el: row, update };
}

// Noms et explications des réglages VESC Tool (anglais d'origine) traduits selon la langue choisie :
// vesc/config/tr/fr.json et es.json, { "texte anglais": "traduction" }. En anglais : textes d'origine.
let paramTr = new Map();
function P(s) {
  return (s && paramTr.get(s)) || s;
}
async function loadParamTr() {
  const lang = window.LF_I18N?.lang || 'fr';
  paramTr = new Map();
  if (lang === 'en') return;
  try {
    const r = await fetch('config/tr/' + lang + '.json');
    if (r.ok) paramTr = new Map(Object.entries(await r.json()));
  } catch (e) { /* hors ligne sans cache : textes d'origine */ }
}
await loadParamTr();
window.LF_I18N?.onChange(async () => {
  await loadParamTr();
  renderConfigPages();
  if (state.page === 'essentials') essentials.render();
  if (state.page === 'remote') remote.render();
});

renderConfigPages();

// ================================================================ télémétrie (une seule boucle partagée)

const TILES = [
  ['v_in', 'Tension', 'V', 1],
  ['current_in', 'Courant batterie', 'A', 1],
  ['current_motor', 'Courant moteur', 'A', 1],
  ['power', 'Puissance', 'W', 0],
  ['duty_now', 'Gaz', '%', 0],
  ['rpm', 'Régime', 'ERPM', 0],
  ['temp_mos', 'Temp. contrôleur', '°C', 1],
  ['temp_motor', 'Temp. moteur', '°C', 1],
  ['watt_hours', 'Consommé', 'Wh', 1],
  ['watt_hours_charged', 'Régénéré', 'Wh', 1],
  ['amp_hours', 'Consommé', 'Ah', 2],
  ['tachometer_abs', 'Tachymètre', '', 0],
];

const SERIES = [
  { id: 'pow', label: 'Puissance', on: true, keys: [['power', 'Puissance', 'W', '#148a90']] },
  { id: 'cur', label: 'Courants', on: true, keys: [['current_in', 'Batterie', 'A', '#148a90'], ['current_motor', 'Moteur', 'A', '#e8833a']] },
  { id: 'rpm', label: 'Régime', on: true, keys: [['rpm', 'ERPM', '', '#0a84ff']] },
  { id: 'duty', label: 'Gaz', on: false, keys: [['duty_now', 'Gaz', '%', '#7c5cd6']] },
  { id: 'v', label: 'Tension', on: false, keys: [['v_in', 'Tension', 'V', '#1a9c55']] },
  { id: 'temp', label: 'Températures', on: false, keys: [['temp_mos', 'Contrôleur', '°C', '#e8833a'], ['temp_motor', 'Moteur', '°C', '#d1343f']] },
  { id: 'dq', label: 'Id / Iq', on: false, keys: [['id', 'Id', 'A', '#0a84ff'], ['iq', 'Iq', 'A', '#e8833a']] },
];

const rt = { history: [], paused: false, recording: null, maxPoints: 300, powMax: 0, rate: 200 };

const telemetry = {
  timer: null,
  running: false,
  wanted() {
    return connected() && (!!rt.recording || !!session.rec || (!rt.paused && ['home', 'realtime', 'control', 'essentials'].includes(state.page)));
  },
  kick() {
    if (this.running || !this.wanted()) return;
    this.running = true;
    this.loop();
  },
  async loop() {
    if (!this.wanted()) { this.running = false; return; }
    const t0 = performance.now();
    try {
      const v = await state.vesc.getValues();
      v.power = v.v_in * v.current_in;
      v.duty_now *= 100;
      v.t = Date.now();
      onValues(v);
    } catch (e) { /* délai dépassé : on réessaie */ }
    const period = state.page === 'realtime' || rt.recording || session.rec ? rt.rate : state.page === 'essentials' ? 2000 : 250;
    this.timer = setTimeout(() => this.loop(), Math.max(20, period - (performance.now() - t0)));
  },
};

const tileEls = {};
for (const [key, label, unit] of TILES) {
  const t = el('div', 'tile');
  const line = el('div');
  const v = el('span', 'v', '—');
  line.append(v, el('span', 'u', unit));
  t.append(el('div', 'k', label), line);
  tileEls[key] = v;
  $('#rtTiles').append(t);
}

// Une carte par graphique
const chartEls = {};
for (const s of SERIES) {
  const chip = el('button', 'chip' + (s.on ? ' on' : ''), s.label);
  chip.onclick = () => {
    s.on = !s.on;
    chip.classList.toggle('on', s.on);
    chartEls[s.id].card.hidden = !s.on;
    drawCharts();
  };
  $('#chartSeries').append(chip);
  const card = el('div', 'card chart-card');
  card.hidden = !s.on;
  const head = el('div', 'ch-head');
  const leg = el('div', 'ch-leg');
  head.append(el('span', 'm-label', s.label), leg);
  const canvas = el('canvas');
  card.append(head, canvas);
  $('#charts').append(card);
  chartEls[s.id] = { card, canvas, leg };
}

// Niveau de batterie estimé d'après la tension et les réglages batterie du VESC.
function batteryLevel(vin) {
  const mc = state.configs.mcconf;
  if (!mc || !mc.has('si_battery_cells') || !mc.has('l_battery_cut_end')) return NaN;
  const empty = mc.get('l_battery_cut_end');
  const full = mc.get('si_battery_cells') * 4.2;
  if (!(full > empty)) return NaN;
  return clamp((vin - empty) / (full - empty), 0, 1);
}

function onValues(v) {
  const first = !state.lastValues;
  state.lastValues = v;
  if (session.rec) session.add(v);
  if (state.page === 'essentials' && first) essentials.refresh();
  rt.history.push(v);
  if (rt.history.length > rt.maxPoints) rt.history.shift();
  if (rt.recording) rt.recording.push(v);
  rt.powMax = Math.max(rt.powMax, v.power);

  if (state.page === 'home') {
    $('#hPow').textContent = fmtInt(v.power);
    $('#hPowMax').textContent = 'max ' + fmtInt(rt.powMax) + ' W';
    $('#hPowSpark').innerHTML = sparkSVG(rt.history.slice(-80).map((x) => x.power), '#148a90');
    const lvl = batteryLevel(v.v_in);
    const known = Number.isFinite(lvl);
    updateRing($('#hBatRing'), known ? lvl : 0, known ? Math.round(lvl * 100) + '%' : fmt(v.v_in) + 'V',
      known ? fmt(v.v_in) + ' V' : 'tension', !known ? '#9aa6b0' : lvl < 0.2 ? '#d1343f' : lvl < 0.4 ? '#c97d00' : '#1a9c55');
    $('#hBatSub').textContent = fmt(v.watt_hours, 1) + ' Wh consommés';
    const d = Math.abs(v.duty_now) / 100;
    updateRing($('#hDutyRing'), d, Math.round(v.duty_now) + '%', 'gaz', d > 0.9 ? '#d1343f' : '#5acdd1');
    $('#hRpmSub').textContent = fmtInt(v.rpm) + ' ERPM';
    $('#hTf').textContent = fmt(v.temp_mos);
    $('#hTf').className = tempClass(v.temp_mos, 65, 80);
    $('#hTm').textContent = fmt(v.temp_motor);
    $('#hTm').className = tempClass(v.temp_motor, 75, 90);
    $('#hTfBar').style.width = clamp(v.temp_mos / 100, 0, 1) * 100 + '%';
    $('#hTmBar').style.width = clamp(v.temp_motor / 120, 0, 1) * 100 + '%';
    const hf = $('#hFault');
    hf.hidden = !v.fault_code;
    hf.textContent = v.fault_code ? '⚠ ' + v.fault_str : '';
  }

  if (state.page === 'realtime') {
    for (const [key, , , dec] of TILES) {
      const e = tileEls[key];
      e.textContent = dec === 0 ? fmtInt(v[key]) : fmt(v[key], dec);
      if (key === 'temp_mos') e.className = 'v ' + tempClass(v[key], 65, 80);
      if (key === 'temp_motor') e.className = 'v ' + tempClass(v[key], 75, 90);
    }
    const fb = $('#faultBanner');
    fb.hidden = !v.fault_code;
    fb.textContent = v.fault_code ? '⚠ ' + v.fault_str : '';
    drawCharts();
  }

  if (state.page === 'control') {
    $('#ctlRpm').textContent = fmtInt(v.rpm);
    $('#ctlDuty').textContent = 'gaz ' + Math.round(v.duty_now) + ' %';
    $('#ctlCur').textContent = fmt(v.current_motor) + ' A';
    $('#ctlVin').textContent = fmt(v.v_in) + ' V';
    $('#ctlFault').textContent = v.fault_code ? '⚠ ' + v.fault_str : '';
    $('#ctlFault').className = v.fault_code ? 'bad-c' : '';
  }
}

function drawCharts() {
  if (state.page !== 'realtime') return;
  const data = rt.history;
  const dpr = window.devicePixelRatio || 1;
  for (const s of SERIES) {
    if (!s.on) continue;
    const { canvas, leg } = chartEls[s.id];
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W) continue;
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    let min = Infinity;
    let max = -Infinity;
    for (const d of data) for (const [k] of s.keys) { min = Math.min(min, d[k]); max = Math.max(max, d[k]); }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    if (min > 0 && s.id !== 'v' && s.id !== 'temp') min = 0;
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const top = 6;
    const bottom = H - 6;
    const left = 38;
    const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
    const xs = (i) => left + (i / (rt.maxPoints - 1)) * (W - left);

    ctx.font = '11px "Instrument Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) {
      const v = min + ((max - min) * i) / 2;
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = '#eef2f5';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(W, yy); ctx.stroke();
      ctx.fillStyle = '#9aa6b0';
      ctx.fillText(Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), 0, yy);
    }

    leg.replaceChildren();
    for (const [k, label, unit, color] of s.keys) {
      const last = data.length ? data[data.length - 1][k] : NaN;
      const span = el('span');
      const sw = el('i');
      sw.style.background = color;
      const val = Number.isFinite(last) ? (Math.abs(last) >= 100 ? fmtInt(last) : last.toFixed(1)) : '—';
      span.append(sw, document.createTextNode(label + ' ' + val + (unit ? ' ' + unit : '')));
      leg.append(span);
      if (data.length < 2) continue;
      ctx.beginPath();
      data.forEach((d, i) => (i ? ctx.lineTo(xs(i), y(d[k])) : ctx.moveTo(xs(i), y(d[k]))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (s.keys.length === 1) {
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, color + '40');
        g.addColorStop(1, color + '00');
        ctx.lineTo(xs(data.length - 1), bottom);
        ctx.lineTo(xs(0), bottom);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
  }
}
window.addEventListener('resize', drawCharts);

$('#btnRtStream').textContent = 'Pause';
$('#btnRtStream').onclick = () => {
  rt.paused = !rt.paused;
  $('#btnRtStream').textContent = rt.paused ? 'Reprendre' : 'Pause';
  telemetry.kick();
};
for (const b of $$('#rtRate button')) {
  b.onclick = () => {
    rt.rate = Number(b.dataset.v);
    for (const x of $$('#rtRate button')) x.classList.toggle('on', x === b);
  };
}
$('#btnRtRecord').onclick = () => {
  const b = $('#btnRtRecord');
  if (!rt.recording) {
    if (!requireConn()) return;
    rt.recording = [];
    b.classList.add('rec');
    b.querySelector('span').textContent = 'Stop';
    toast('Enregistrement du journal…');
    telemetry.kick();
    return;
  }
  const rows = rt.recording;
  rt.recording = null;
  b.classList.remove('rec');
  b.querySelector('span').textContent = 'CSV';
  if (!rows.length) return;
  const cols = ['t', 'v_in', 'current_motor', 'current_in', 'id', 'iq', 'power', 'duty_now', 'rpm', 'temp_mos', 'temp_motor',
    'amp_hours', 'amp_hours_charged', 'watt_hours', 'watt_hours_charged', 'tachometer', 'tachometer_abs', 'fault_code'];
  const csv = [cols.join(';')].concat(rows.map((r) => cols.map((c) => r[c]).join(';'))).join('\n');
  download('vesc_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.csv', csv, 'text/csv');
  toast(rows.length + ' mesures enregistrées');
};

// ================================================================ détection FOC

const MOTORS = [
  // Nom, poids, pertes max (W), openloop ERPM, sensorless ERPM, image (préréglages de l'assistant VESC Tool)
  ['Maytech 6579', 'eFoil · ~1,1 kg', 150, 700, 4000, 'maytech_6579.svg'],
  ['Mini outrunner', '~75 g', 20, 1400, 4000, 'outrunner_mini.webp'],
  ['Petit outrunner', '~200 g', 50, 1400, 4000, 'outrunner_small.webp'],
  ['Outrunner moyen', '~750 g', 120, 700, 4000, '6374.webp'],
  ['Gros outrunner', '~2 kg', 400, 700, 4000, 'outrunner_large.svg'],
  ['Petit inrunner', '~200 g', 50, 1400, 4000, 'inrunner_small.webp'],
  ['Inrunner moyen', '~750 g', 140, 1400, 4000, 'inrunner_medium.webp'],
  ['Gros inrunner', '~2 kg', 400, 1000, 4000, 'inrunner_large.svg'],
  ['Moteur moyeu DD', '~6 kg', 150, 300, 2000, 'ebike_dd_1kw.webp'],
  ['Petit EDF', '~200 g', 110, 1400, 4000, 'edf_small.webp'],
];

let motorSel = 0;
function drawMotors() {
  const box = $('#wizMotor');
  box.replaceChildren();
  MOTORS.forEach(([n, w, , , , img], i) => {
    const b = el('button', i === motorSel ? 'on' : '');
    const pic = el('img');
    pic.src = 'img/motors/' + img;
    pic.alt = '';
    pic.loading = 'lazy';
    b.append(pic, el('span', '', n), el('small', '', w));
    b.onclick = () => { motorSel = i; drawMotors(); applyMotor(); };
    box.append(b);
  });
}
function applyMotor() {
  const m = MOTORS[motorSel];
  $('#wizLoss').value = m[2];
  $('#wizOl').value = m[3];
  $('#wizSl').value = m[4];
}
drawMotors();
applyMotor();

const DETECT_ERRORS = {
  '-1': 'Défaut persistant : regarde la page Direct.',
  '-10': 'La détection du flux magnétique a échoué.',
  '-50': 'Délai dépassé pour la détection CAN.',
  '-51': 'La détection CAN a échoué.',
  '-100': 'Pas de défaut, échec pour une raison inconnue.',
};

function wizShow(kind, title, pairs, loading = false) {
  $('#wizResultCard').hidden = false;
  const b = $('#wizBadge');
  b.className = 'badge ' + kind;
  b.textContent = kind === 'ok' ? '✓' : kind === 'err' ? '!' : '';
  $('#wizTitle').textContent = title;
  setKv($('#wizResult'), pairs);
  $('#wizLoader').hidden = !loading;
  $('#wizResultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('#btnDetect').onclick = async () => {
  if (!requireConn()) return;
  if (!confirm('Le moteur va tourner. Hélice démontée ou planche calée ?')) return;
  const btn = $('#btnDetect');
  btn.disabled = true;
  wizShow('run', 'Détection en cours…', [['Durée', "jusqu'à 3 min"], ['Moteur', MOTORS[motorSel][0]]], true);
  const v = state.vesc;
  try {
    if (state.readSnap.mcconf) backup('mcconf', 'Avant détection', state.readSnap.mcconf);
    // Usage « Propeller » de l'assistant VESC Tool (mobile/SetupWizardFoc.qml), écrit avant la détection.
    const mc = state.configs.mcconf;
    if (mc && !dirtyCount('mcconf')) {
      const usage = { l_duty_start: 1.0, m_fault_stop_time_ms: 500, 'bms.limit_mode': 3 };
      for (const [k, val] of Object.entries(usage)) if (mc.has(k)) mc.set(k, val, true);
      if (dirtyCount('mcconf')) {
        await v.setConfig(mc);
        await readConfig('mcconf', false, true);
      }
    }
    // Comme VESC Tool : coupe la sortie des apps (télécommande) pendant la détection.
    await v.send(new Writer().uint8(COMM.APP_DISABLE_OUTPUT).int8(1).int32(180000).toBytes());
    const res = await v.detectAllFoc({
      detectCan: $('#wizCan').checked,
      maxPowerLoss: Number($('#wizLoss').value),
      minCurrentIn: -Math.abs(Number($('#wizImin').value)),
      maxCurrentIn: Number($('#wizImax').value),
      openloopRpm: Number($('#wizOl').value),
      slErpm: Number($('#wizSl').value),
    });
    if (res >= 0) {
      await readConfig('mcconf', false, true);
      await readConfig('appconf', false, true);
      const mc = state.configs.mcconf;
      const app = state.configs.appconf;
      haptic([30, 60, 30]);
      wizShow('ok', 'Détection réussie', [
        ['Courant moteur', fmt(mc.get('l_current_max'), 1) + ' A'],
        ['Résistance', fmt(mc.get('foc_motor_r') * 1e3, 2) + ' mΩ'],
        ['Inductance', fmt(mc.get('foc_motor_l') * 1e6, 2) + ' µH'],
        ['Flux', fmt(mc.get('foc_motor_flux_linkage') * 1e3, 2) + ' mWb'],
        ...(mc.has('foc_motor_ld_lq_diff') ? [['Lq − Ld', fmt(mc.get('foc_motor_ld_lq_diff') * 1e6, 2) + ' µH']] : []),
        ['Capteurs', P(mc.params.foc_sensor_mode?.e?.[mc.get('foc_sensor_mode')]) ?? '?'],
        ['Compensation temp.', mc.get('foc_temp_comp') ? 'oui' : 'non'],
        ['ID CAN', String(app?.get('controller_id') ?? '?')],
      ]);
    } else {
      const reason = DETECT_ERRORS[res] || (res <= -100 && res > -200 ? 'Défaut ' + (res + 100) + ' pendant la détection.' : 'Erreur ' + res);
      wizShow('err', 'Détection impossible', [['Raison', reason, { full: true }]]);
    }
  } catch (e) {
    wizShow('err', 'Détection interrompue', [['Erreur', e.message, { full: true }]]);
  } finally {
    btn.disabled = false;
  }
};

$('#btnDetectRL').onclick = async () => {
  if (!requireConn()) return;
  wizShow('run', 'Mesure de R et L…', [], true);
  try {
    const r = await state.vesc.detectRL();
    wizShow('ok', 'Mesure terminée', [['Résistance', fmt(r.r * 1e3, 3) + ' mΩ'], ['Inductance', fmt(r.l, 2) + ' µH'],
      ['Ld − Lq', fmt(r.ldLqDiff, 2) + ' µH']]);
  } catch (e) {
    wizShow('err', 'Mesure impossible', [['Erreur', e.message, { full: true }]]);
  }
};

// ================================================================ pilotage

const MODES = {
  duty: { min: -95, max: 95, step: 1, val: 10, unit: '%', send: (v, x) => v.setDuty(x / 100) },
  current: { min: -60, max: 60, step: 0.5, val: 5, unit: 'A', send: (v, x) => v.setCurrent(x) },
  rpm: { min: -40000, max: 40000, step: 100, val: 3000, unit: 'ERPM', send: (v, x) => v.setRpm(x) },
  brake: { min: 0, max: 60, step: 0.5, val: 5, unit: 'A', send: (v, x) => v.setCurrentBrake(x) },
};
let ctlMode = 'duty';
const range = $('#ctlRange');

function syncRange() {
  const m = MODES[ctlMode];
  range.style.setProperty('--p', ((Number(range.value) - m.min) / (m.max - m.min)) * 100 + '%');
  $('#ctlValue').textContent = Number(range.value).toLocaleString('fr-FR');
}

function setMode(mode) {
  stopHold();
  MODES[ctlMode].val = Number(range.value);
  ctlMode = mode;
  const m = MODES[mode];
  range.min = m.min;
  range.max = m.max;
  range.step = m.step;
  range.value = m.val;
  $('#ctlUnit').textContent = m.unit;
  $('#ctlMin').textContent = m.min.toLocaleString('fr-FR');
  $('#ctlMax').textContent = m.max.toLocaleString('fr-FR');
  for (const b of $$('#ctlMode button')) b.classList.toggle('on', b.dataset.mode === mode);
  syncRange();
}
for (const b of $$('#ctlMode button')) b.onclick = () => setMode(b.dataset.mode);
range.oninput = syncRange;
setMode('duty');

const holdBtn = $('#btnHold');
holdBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  holdBtn.setPointerCapture?.(e.pointerId);
  startHold();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) holdBtn.addEventListener(ev, stopHold);
holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

function startHold() {
  if (!requireConn()) return;
  stopHold();
  holdBtn.classList.add('active');
  haptic(15);
  const tick = () => state.vesc && MODES[ctlMode].send(state.vesc, Number(range.value));
  tick();
  hold.timer = setInterval(tick, 100);
}

function stopHold() {
  if (!hold.timer) return;
  clearInterval(hold.timer);
  hold.timer = null;
  holdBtn.classList.remove('active');
  state.vesc?.setCurrent(0);
}

$('#btnStop').onclick = () => {
  stopHold();
  state.vesc?.setCurrent(0);
  haptic(40);
};

// ================================================================ entrées

function stopInputs() {
  inputs.running = false;
  clearTimeout(inputs.timer);
  $('#btnInStream').textContent = 'Démarrer';
}
$('#btnInStream').onclick = () => {
  if (inputs.running) { stopInputs(); return; }
  if (!requireConn()) return;
  inputs.running = true;
  $('#btnInStream').textContent = 'Arrêter';
  const loop = async () => {
    if (!inputs.running || !state.vesc) return;
    const v = state.vesc;
    const [ppm, adc, imu] = await Promise.allSettled([v.getDecodedPpm(), v.getDecodedAdc(), v.getImuData()]);
    if (ppm.status === 'fulfilled') {
      const x = clamp(ppm.value.value, -1, 1);
      const bar = $('#inPpmBar');
      bar.style.left = (x < 0 ? 50 + x * 50 : 50) + '%';
      bar.style.width = Math.abs(x) * 50 + '%';
      setKv($('#inPpm'), [['Commande', fmt(x * 100, 1) + ' %'], ['Impulsion', fmt(ppm.value.lastLen * 1000, 0) + ' µs']]);
    }
    if (adc.status === 'fulfilled') {
      const a = adc.value;
      $('#inAdcBar').style.width = clamp(a.adc, 0, 1) * 100 + '%';
      setKv($('#inAdc'), [['ADC 1', fmt(a.adc * 100, 1) + ' %'], ['Tension 1', fmt(a.voltage, 2) + ' V'],
        ['ADC 2', fmt(a.adc2 * 100, 1) + ' %'], ['Tension 2', fmt(a.voltage2, 2) + ' V']]);
    }
    if (imu.status === 'fulfilled') {
      const m = imu.value;
      const deg = (r) => r * 180 / Math.PI;
      $('#inHorizon').style.transform = 'translateY(' + clamp(deg(m.pitch), -45, 45) * 1.2 + 'px) rotate(' + (-deg(m.roll)) + 'deg)';
      setKv($('#inImu'), [['Roulis', fmt(deg(m.roll)) + '°'], ['Tangage', fmt(deg(m.pitch)) + '°'], ['Cap', fmt(deg(m.yaw)) + '°'],
        ['Accél.', [m.accX, m.accY, m.accZ].map((x) => fmt(x, 2)).join(' / ') + ' g']]);
    }
    inputs.timer = setTimeout(loop, 150);
  };
  loop();
};

// ================================================================ terminal

const termOut = $('#termOut');
function termAppend(text, cls) {
  termOut.append(el('span', cls || '', text.endsWith('\n') ? text : text + '\n'));
  termOut.scrollTop = termOut.scrollHeight;
}
function termSend(cmd) {
  if (!cmd || !requireConn()) return;
  termAppend('› ' + cmd, 'cmd');
  state.vesc.sendTerminal(cmd);
}
$('#termForm').onsubmit = (e) => {
  e.preventDefault();
  termSend($('#termIn').value.trim());
  $('#termIn').value = '';
};
for (const b of $$('[data-cmd]')) b.onclick = () => termSend(b.dataset.cmd);
$('#btnTermClear').onclick = () => termOut.replaceChildren();

// ================================================================ firmware

const fwState = { bytes: null, cancel: false, backedUp: new Set() };

// L'envoi n'est possible qu'après avoir téléchargé une sauvegarde de CE contrôleur
// (un avis App Store raconte une config perdue après une mise à jour sans sauvegarde).
function fwBackupKey() {
  return (state.fw?.uuid || '?') + ':' + (state.vesc?.canId ?? -1);
}
function updateFwGate() {
  const done = fwState.backedUp.has(fwBackupKey());
  $('#fwStep1').classList.toggle('done', done);
  $('#fwBackupTxt').textContent = done ? 'Sauvegarde téléchargée ✓' : 'Obligatoire : une mise à jour peut remettre les réglages à zéro.';
  $('#btnFwUpload').disabled = !fwState.bytes || !done;
}
$('#btnFwBackup').onclick = () => {
  if (!requireConn()) return;
  if (downloadFullBackup()) {
    fwState.backedUp.add(fwBackupKey());
    updateFwGate();
  }
};

$('#fwFile').onchange = async (e) => {
  const f = e.target.files[0];
  fwState.bytes = f ? new Uint8Array(await f.arrayBuffer()) : null;
  updateFwGate();
  $('#fwFileName').textContent = f ? f.name + ' · ' + Math.round(fwState.bytes.length / 1024) + ' Ko' : 'Choisir un fichier .bin';
  $('.file-drop').classList.toggle('has', !!f);
};

$('#btnFwUpload').onclick = async () => {
  if (!requireConn() || !fwState.bytes) return;
  if (!fwState.backedUp.has(fwBackupKey())) { toast("Télécharge d'abord la sauvegarde (étape 1)", true); return; }
  if (!confirm('Envoyer ce firmware au contrôleur ' + (state.fw?.hw || '?') + ' ?\nNe coupe pas l\'alimentation pendant l\'envoi.')) return;
  fwState.cancel = false;
  const bar = $('.progress');
  bar.hidden = false;
  $('#btnFwUpload').disabled = true;
  $('#btnFwCancel').hidden = false;
  const t0 = Date.now();
  try {
    await state.vesc.uploadFirmware(fwState.bytes, {
      allCan: $('#fwAllCan').checked,
      isCancelled: () => fwState.cancel,
      onProgress: (msg, p) => {
        bar.firstElementChild.style.width = (p * 100).toFixed(1) + '%';
        const s = (Date.now() - t0) / 1000;
        const left = p > 0.02 && p < 1 ? Math.round(s / p - s) : null;
        $('#fwStatus').textContent = msg + ' ' + Math.round(p * 100) + ' %'
          + (left !== null ? ' · encore ' + (left >= 60 ? Math.floor(left / 60) + ' min ' : '') + (left % 60) + ' s' : '');
      },
    });
    haptic([30, 60, 30]);
    $('#fwStatus').textContent = 'Firmware envoyé ✓ Le contrôleur redémarre (environ 10 s), reconnecte-le ensuite.';
  } catch (e) {
    $('#fwStatus').textContent = 'Erreur : ' + e.message;
    toast(e.message, true);
  } finally {
    updateFwGate();
    $('#btnFwCancel').hidden = true;
  }
};
$('#btnFwCancel').onclick = () => { fwState.cancel = true; };

// ================================================================ pages complémentaires

const ctx = {
  state,
  connected,
  requireConn,
  makeParamRow,
  dirtyCount,
  keepAwake,
  save: () => writeConfig(PAGE_KINDS[state.page] || []),
  onProfile: () => showMotorCard(),
  canDevs: () => canDevs,
  kickTelemetry: () => telemetry.kick(),
  disableOutput: (ms) => state.vesc?.send(new Writer().uint8(COMM.APP_DISABLE_OUTPUT).int8(1).int32(ms).toBytes()),
  // Lit la configuration du contrôleur ciblé dans une instance séparée (recopie vers le bus CAN).
  async readOther(kind) {
    const bytes = await state.vesc.getConfigBytes(kind);
    const sig = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const cfg = await definitionForSignature(kind, sig);
    if (!cfg || !cfg.deserialize(bytes)) throw new Error('configuration illisible');
    return cfg;
  },
};
const essentials = initEssentials(ctx);
window.lfVesc = state; // inspection depuis la console du navigateur
const remote = initRemote(ctx);
const session = initSession(ctx);

// ================================================================ démarrage

const initial = location.hash.slice(1);
if (initial) showPage(initial);
