import { Bms, BleBms, SimBms, SETTINGS, settingList, valueToReg } from './protocol.js';
import { $, $$, toast, fmt, fmtInt, clamp, download, pickFile, el, setKv, haptic, sheet } from '../../vesc/js/ui.js';

const state = {
  bms: null,
  linkUp: false,
  page: 'home',
  last: null,
  settings: null, // { clé: { raw, value } } tel que lu
  edits: {}, // clé -> nouvelle valeur affichée
  unlocked: false,
  info: null,
  hist: [],
  alarmLog: [],
};

const connected = () => !!state.bms && state.linkUp;

function requireConn() {
  if (state.bms && !state.linkUp) { toast('Reconnexion en cours, patiente…', true); return false; }
  if (!connected()) { toast("Connecte d'abord la batterie", true); showPage('home'); return false; }
  return true;
}

// ================================================================ navigation

function showPage(page) {
  if (!$('#page-' + page)) return;
  state.page = page;
  for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.page === page);
  for (const s of $$('.page')) s.classList.toggle('active', s.id === 'page-' + page);
  $('#tabs button.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  history.replaceState(null, '', '#' + page);
  if (page === 'settings') renderSettings();
  if (page === 'info') loadInfo();
  if (page === 'cells') requestAnimationFrame(drawDiff);
  updateSaveBar();
  if (state.last) render(state.last);
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) showPage(b.dataset.page);
});
$('#connPill').onclick = () => showPage('home');

// ================================================================ connexion

function setConn(text, cls) {
  $('#connText').textContent = text;
  $('#lamp').className = 'lamp' + (cls ? ' ' + cls : '');
  $('#connPill').classList.toggle('on', cls === 'on');
}

if (!BleBms.supported) {
  const b = $('#bleSupport');
  b.hidden = false;
  b.textContent = "Ce navigateur ne gère pas le Bluetooth web. Utilise Chrome sur Android, ou l'appli Bluefy sur iPhone.";
  $('#btnBle').disabled = true;
}

$('#btnBle').onclick = () => connect(new BleBms());
$('#btnDemo').onclick = () => connect(new SimBms());
$('#btnDisconnect').onclick = () => disconnect();

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* refusé */ }
}

async function connect(transport, device = null) {
  if (state.bms) await disconnect();
  const bms = new Bms(transport);
  setConn('Connexion…', 'busy');
  try {
    await bms.open(device);
  } catch (e) {
    setConn('Hors ligne', '');
    if (e.name !== 'NotFoundError') {
      sheet('Connexion impossible', [el('div', 'banner bad', e.message),
        el('p', 'muted', "Vérifie que la batterie est allumée, que l'appli du fabricant est fermée, et que le BMS n'est pas appairé dans les réglages Bluetooth du téléphone (« Oublier »). "
          + "Certains BMS s'endorment au repos : branche le chargeur ou tire un peu de courant pour les réveiller.")]);
    }
    try { await bms.close(); } catch (e2) { /* déjà fermé */ }
    return;
  }
  state.bms = bms;
  state.linkUp = true;
  state.settings = null;
  state.edits = {};
  state.unlocked = false;
  state.info = null;
  bms.addEventListener('close', () => onLinkLost(bms));
  setConn('En ligne', 'on');
  haptic(30);
  keepAwake(true);
  $('#connectCard').hidden = true;
  $('#homeLive').hidden = false;
  $('#infoCard').hidden = false;
  $('#devLabel').hidden = false;
  $('#devName').textContent = transport.name;
  $('#devSub').textContent = bms.proto === 'd2' ? 'Protocole Modbus · réglages disponibles' : 'Ancien protocole (A5) · lecture, MOS et charge seulement';
  $('#topSub').textContent = transport.name;
  toast('Connecté à ' + transport.name);
  if (bms.proto === 'd2') {
    try {
      state.settings = await bms.readSettings();
      backupLocal('Connexion');
    } catch (e) { /* relu plus tard sur la page Protections */ }
  }
  loop();
  if (state.page === 'settings') renderSettings();
}

async function disconnect() {
  const b = state.bms;
  if (!b) return;
  onDisconnected(true);
  await b.close();
}

async function onLinkLost(bms) {
  if (state.bms !== bms || !state.linkUp || bms.closing) return;
  state.linkUp = false;
  if (!bms.t.canReconnect) { onDisconnected(); return; }
  setConn('Reconnexion…', 'busy');
  toast('Liaison perdue, reconnexion…', true);
  for (const d of [500, 1000, 2000, 3000, 5000, 8000, 10000, 15000]) {
    await new Promise((r) => setTimeout(r, d));
    if (state.bms !== bms) return;
    if (document.hidden) continue;
    try {
      await bms.t.reconnect();
      bms.rx = [];
      state.linkUp = true;
      setConn('En ligne', 'on');
      toast('Reconnecté ✓');
      loop();
      return;
    } catch (e) { /* on réessaie */ }
  }
  onDisconnected();
}

function onDisconnected(manual = false) {
  if (!state.bms) return;
  state.bms = null;
  state.linkUp = false;
  clearTimeout(pollTimer);
  keepAwake(false);
  setConn('Hors ligne', '');
  $('#connectCard').hidden = false;
  $('#homeLive').hidden = true;
  $('#infoCard').hidden = true;
  $('#devLabel').hidden = true;
  $('#topSub').textContent = 'BMS';
  refreshLast();
  if (!manual) toast('Batterie déconnectée', true);
}

async function refreshLast() {
  const dev = BleBms.supported ? await BleBms.lastDevice() : null;
  const btn = $('#btnLast');
  btn.hidden = !dev;
  if (!dev) return;
  btn.querySelector('span').textContent = 'Reconnecter ' + (dev.name || 'la batterie');
  btn.onclick = () => connect(new BleBms(), dev);
}
refreshLast();

// ================================================================ mesures

let pollTimer = null;
async function loop() {
  clearTimeout(pollTimer);
  if (!connected()) return;
  try {
    const v = await state.bms.poll();
    v.t = Date.now();
    state.last = v;
    state.hist.push(v);
    if (state.hist.length > 200) state.hist.shift();
    logAlarms(v.faults);
    render(v);
  } catch (e) { /* pas de réponse : on réessaie */ }
  pollTimer = setTimeout(loop, state.bms?.proto === 'a5' ? 1500 : 1000);
}

// Même tracé que l'anneau de ../index.html et de l'atelier VESC.
function ring(container, pct, big, small, color) {
  const C = 2 * Math.PI * 48;
  let fg = container.querySelector('.ring-fg');
  if (!fg) {
    container.innerHTML = '<svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="48"/><circle class="ring-fg" cx="60" cy="60" r="48" stroke-dasharray="'
      + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/><text class="ring-big" x="60" y="64"></text><text class="ring-small" x="60" y="82"></text></svg>';
    fg = container.querySelector('.ring-fg');
  }
  fg.setAttribute('stroke-dashoffset', (C * (1 - clamp(pct || 0, 0, 1))).toFixed(1));
  fg.setAttribute('stroke', color);
  container.querySelector('.ring-big').textContent = big;
  container.querySelector('.ring-small').textContent = small;
}

function spark(values, color) {
  if (values.length < 2) return '';
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) { max += 1; min -= 1; }
  const pts = values.map((v, i) => ((i / (values.length - 1)) * 300).toFixed(1) + ' ' + (40 - ((v - min) / (max - min)) * 40).toFixed(1));
  return '<svg viewBox="0 0 300 40" preserveAspectRatio="none"><path d="M' + pts.join(' L') + '" fill="none" stroke="' + color
    + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
}

function chipState(id, on, label) {
  const c = $(id);
  c.classList.toggle('on', !!on);
  c.classList.toggle('off', !on);
  c.lastChild.textContent = label;
}

function render(v) {
  const soc = v.soc ?? NaN;
  const col = soc < 15 ? '#d1343f' : soc < 30 ? '#c97d00' : '#1a9c55';
  const cells = (v.cells || []).filter((x) => x > 0);
  const mx = cells.length ? Math.max(...cells) : v.cellMax;
  const mn = cells.length ? Math.min(...cells) : v.cellMin;
  const diff = v.diff ?? (mx && mn ? mx - mn : NaN);
  const tMax = v.temps?.length ? Math.max(...v.temps) : v.tMax;
  const severe = (v.faults || []).filter((f) => f.severe);

  if (state.page === 'home') {
    ring($('#socRing'), soc / 100, Number.isFinite(soc) ? Math.round(soc) + '%' : '—', 'charge', col);
    const a = v.a ?? 0;
    $('#flowLabel').textContent = a > 0.3 ? 'En charge' : a < -0.3 ? 'En décharge' : 'Au repos';
    $('#hW').textContent = fmtInt(Math.abs((v.v ?? 0) * a));
    const remain = v.cap != null ? fmt(v.cap, 1) + ' Ah restants' : '';
    const t = a < -0.5 && v.cap ? ' · ≈ ' + Math.round((v.cap / Math.abs(a)) * 60) + ' min à ce rythme' : '';
    $('#hRemain').textContent = remain + t;
    $('#hV').textContent = fmt(v.v, 2);
    $('#hA').textContent = fmt(a, 1);
    $('#hDiff').textContent = fmtInt(diff);
    $('#hDiff').className = diff > 80 ? 'bad-c' : diff > 40 ? 'warn-c' : '';
    $('#hMinMax').textContent = mn && mx ? fmt(mn / 1000, 3) + ' → ' + fmt(mx / 1000, 3) + ' V' : '—';
    $('#hT').textContent = fmt(tMax, 0);
    $('#hCyc').textContent = v.cycles != null ? v.cycles + ' cycles' : '';
    $('#vSpark').innerHTML = spark(state.hist.slice(-60).map((x) => x.v), '#148a90');
    $('#aSpark').innerHTML = spark(state.hist.slice(-60).map((x) => x.a), '#e8833a');
    chipState('#chC', v.mosC, 'Charge ' + (v.mosC ? 'autorisée' : 'coupée'));
    chipState('#chD', v.mosD, 'Décharge ' + (v.mosD ? 'autorisée' : 'coupée'));
    chipState('#chB', v.bal, 'Équilibrage ' + (v.bal ? 'actif' : 'inactif'));
    const mini = $('#miniCells');
    mini.replaceChildren();
    for (const c of v.cells || []) {
      const i = el('i');
      i.style.height = clamp((c / 1000 - 3.0) / 1.2, 0.05, 1) * 100 + '%';
      i.className = c === mx ? 'hi' : c === mn ? 'lo' : '';
      mini.append(i);
    }
    const ft = $('#faultTop');
    ft.hidden = !severe.length;
    ft.textContent = severe.length ? '⚠ ' + severe.map((f) => f.label).join(' · ') : '';
  }

  if (state.page === 'cells') {
    setKv($('#cellStats'), [
      ['Cellule haute', mx ? fmt(mx / 1000, 3) + ' V' : '—'],
      ['Cellule basse', mn ? fmt(mn / 1000, 3) + ' V' : '—'],
      ['Écart', fmtInt(diff) + ' mV', { cls: diff > 80 ? 'bad-c' : diff > 40 ? 'warn-c' : 'good' }],
      ['Moyenne', v.avg ? fmt(v.avg / 1000, 3) + ' V' : '—'],
    ]);
    const bars = $('#cellBars');
    bars.replaceChildren();
    (v.cells || []).forEach((c, i) => {
      const row = el('div', 'cell-row' + (c === mx ? ' hi' : c === mn ? ' lo' : ''));
      const bar = el('div', 'cell-bar');
      const fill = el('i');
      fill.style.width = clamp((c / 1000 - 3.0) / 1.2, 0.03, 1) * 100 + '%';
      bar.append(fill);
      const balancing = v.balCells?.[i];
      row.append(el('span', 'cell-n', 'C' + (i + 1)), bar, el('span', 'cell-v', fmt(c / 1000, 3) + (balancing ? ' ⚡' : '')));
      bars.append(row);
    });
    setKv($('#tempList'), (v.temps || []).map((tt, i) => ['Sonde ' + (i + 1), fmt(tt, 0) + ' °C']));
    drawDiff();
  }

  if (state.page === 'alarms') renderAlarms(v);

  if (state.page === 'control') {
    if (document.activeElement !== $('#swCharge')) $('#swCharge').checked = !!v.mosC;
    if (document.activeElement !== $('#swDischarge')) $('#swDischarge').checked = !!v.mosD;
    if (document.activeElement !== $('#socIn') && Number.isFinite(soc)) $('#socIn').placeholder = fmt(soc, 1);
    $('#advCmds').hidden = state.bms?.proto !== 'd2';
  }
}

function drawDiff() {
  const canvas = $('#diffChart');
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const data = state.hist.map((x) => x.diff ?? NaN).filter(Number.isFinite);
  const max = Math.max(50, ...data) * 1.15;
  c.strokeStyle = '#eef2f5';
  c.fillStyle = '#9aa6b0';
  c.font = '11px "Instrument Sans", system-ui, sans-serif';
  for (const v of [0, max / 2, max]) {
    const y = H - 6 - (v / max) * (H - 12);
    c.beginPath(); c.moveTo(34, y); c.lineTo(W, y); c.stroke();
    c.fillText(Math.round(v), 0, y + 4);
  }
  // seuil d'attention à 40 mV
  const y40 = H - 6 - (40 / max) * (H - 12);
  c.setLineDash([4, 4]); c.strokeStyle = '#c97d00';
  c.beginPath(); c.moveTo(34, y40); c.lineTo(W, y40); c.stroke(); c.setLineDash([]);
  if (data.length > 1) {
    c.strokeStyle = '#148a90';
    c.lineWidth = 2;
    c.beginPath();
    data.forEach((d, i) => {
      const x = 34 + (i / (200 - 1)) * (W - 34);
      const y = H - 6 - (d / max) * (H - 12);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    });
    c.stroke();
  }
  $('#diffLeg').textContent = data.length ? data[data.length - 1] + ' mV' : '';
}

// ================================================================ alarmes

function logAlarms(faults) {
  const now = new Set((faults || []).map((f) => f.label));
  const prev = state.activeAlarms || new Set();
  for (const f of faults || []) {
    if (!prev.has(f.label)) {
      state.alarmLog.unshift({ t: Date.now(), label: f.label, severe: f.severe });
      if (f.severe) haptic([80, 60, 80]);
    }
  }
  state.activeAlarms = now;
  state.alarmLog = state.alarmLog.slice(0, 50);
}

function renderAlarms(v) {
  const box = $('#alarmList');
  box.replaceChildren();
  const faults = v.faults || [];
  const items = faults.length ? faults.map((f) => [f.severe ? 'bad' : 'warn', f.label, f.severe ? 'Protection active : le BMS coupe.' : 'Avertissement.'])
    : [['ok', 'Aucune alarme', 'Le BMS ne signale aucun défaut.']];
  for (const [lvl, title, text] of items) {
    const row = el('div', 'check ' + lvl);
    const tx = el('div');
    tx.append(el('b', '', title), el('span', '', text));
    row.append(el('span', 'check-ic', lvl === 'ok' ? '✓' : '!'), tx);
    box.append(row);
  }
  const log = $('#alarmLog');
  log.replaceChildren();
  for (const a of state.alarmLog) {
    const it = el('div', 'item');
    const ic = el('span', 'ic', '!');
    ic.style.background = a.severe ? '#d1343f' : '#c97d00';
    const lb = el('div', 'lb');
    lb.append(el('b', '', a.label), el('span', '', new Date(a.t).toLocaleTimeString('fr-FR')));
    it.append(ic, lb);
    log.append(it);
  }
}

// ================================================================ protections (réglages Modbus)

function settingsChecks(vals) {
  const out = [];
  const g = (k) => vals[k];
  const cells = state.last?.cellCount;
  const liion = g('type') === 1;
  if (liion && g('cellHigh2') > 4.25) out.push(['bad', 'Coupure de charge trop haute', fmt(g('cellHigh2'), 3) + ' V par cellule : au-delà de 4,25 V, une cellule Li-ion se dégrade et devient dangereuse.']);
  if (liion && g('cellLow2') < 2.7) out.push(['warn', 'Coupure de décharge très basse', fmt(g('cellLow2'), 3) + ' V par cellule : sous 2,8 V, les cellules Li-ion s’usent vite.']);
  if (g('cellHigh1') > g('cellHigh2')) out.push(['warn', 'Alertes cellule haute inversées', "L'alerte (niveau 1) devrait être sous la coupure (niveau 2)."]);
  if (g('cellLow1') < g('cellLow2')) out.push(['warn', 'Alertes cellule basse inversées', "L'alerte (niveau 1) devrait être au-dessus de la coupure (niveau 2)."]);
  if (cells && Math.abs(g('packHigh2') - g('cellHigh2') * cells) > cells * 0.15) {
    out.push(['info', 'Tensions pack et cellules différentes', 'Coupure pack ' + fmt(g('packHigh2'), 1) + ' V pour ' + cells + ' × ' + fmt(g('cellHigh2'), 2) + ' V = ' + fmt(g('cellHigh2') * cells, 1) + ' V.']);
  }
  if (liion && g('balV') < 3.5) out.push(['info', 'Équilibrage très tôt', "Démarrer l'équilibrage sous 3,5 V use l'énergie de la batterie au repos ; 3,9 à 4,0 V est courant en Li-ion."]);
  if (g('dsgCur2') < 30) out.push(['warn', 'Coupure de décharge basse', fmt(g('dsgCur2'), 0) + " A : le BMS risque de couper en pleine accélération. Elle doit dépasser le courant batterie max du VESC."]);
  if (!out.length) out.push(['ok', 'Protections cohérentes', 'Aucune incohérence détectée.']);
  return out;
}

function currentValues() {
  const vals = {};
  for (const [k, s] of Object.entries(state.settings || {})) vals[k] = k in state.edits ? state.edits[k] : s.value;
  return vals;
}

async function renderSettings() {
  const page = $('#page-settings');
  page.replaceChildren();
  if (!connected()) {
    const c = el('div', 'card cfg-empty');
    c.append(el('div', 'cfg-title', 'Protections du BMS'), el('p', 'muted', 'Connecte la batterie (ou la démo) pour afficher et régler les protections.'));
    page.append(c);
    return;
  }
  if (state.bms.proto !== 'd2') {
    const c = el('div', 'card cfg-empty');
    c.append(el('div', 'cfg-title', 'Réglages non disponibles'),
      el('p', 'muted', "Ce BMS utilise l'ancien protocole (A5), qui ne permet pas de changer les protections par Bluetooth de façon documentée. Les commandes (MOS, charge) restent disponibles."));
    page.append(c);
    return;
  }
  if (!state.settings) {
    try { state.settings = await state.bms.readSettings(); } catch (e) { page.append(el('div', 'banner bad', 'Lecture impossible : ' + e.message)); return; }
  }
  if (!state.unlocked) {
    const c = el('div', 'card lock-card');
    c.append(el('div', 'cfg-title', 'Mot de passe des réglages'),
      el('p', 'muted small-text', "Comme dans l'appli du fabricant : le mot de passe des paramètres (123456 par défaut) protège contre les changements par erreur."));
    const inp = el('input');
    inp.type = 'password';
    inp.inputMode = 'numeric';
    inp.placeholder = 'Mot de passe';
    inp.autocomplete = 'off';
    const btn = el('button', 'btn primary wide', 'Déverrouiller');
    const unlock = async () => {
      if (!state.info) state.info = await state.bms.readInfo().catch(() => ({}));
      const pw = state.info.password || '123456';
      if (inp.value.trim() === pw) { state.unlocked = true; renderSettings(); haptic(20); }
      else { toast('Mot de passe incorrect', true); inp.value = ''; }
    };
    btn.onclick = unlock;
    inp.onkeydown = (e) => { if (e.key === 'Enter') unlock(); };
    c.append(inp, btn);
    page.append(c);
    return;
  }

  const checks = el('div', 'card checks');
  checks.id = 'setChecks';
  page.append(el('div', 'section-label', 'Vérifications'), checks);
  const acts = el('div', 'cfg-actions');
  const reread = el('button', 'btn small', 'Relire');
  reread.onclick = async () => { state.settings = await state.bms.readSettings(); state.edits = {}; renderSettings(); toast('Protections relues'); };
  const saveBtn = el('button', 'btn small primary', 'Enregistrer');
  saveBtn.onclick = () => {
    if (!Object.keys(state.edits).length) { toast('Aucune modification à enregistrer'); return; }
    $('#saveWrite').click();
  };
  acts.append(saveBtn, reread);
  page.append(acts);

  for (const [group, items] of SETTINGS) {
    page.append(el('div', 'section-label', group));
    const list = el('div', 'params');
    for (const [, key, label, hint, unit, conv, opts] of items) {
      const s = state.settings[key];
      if (!s) continue;
      const row = el('div', 'param' + (key in state.edits ? ' mod' : ''));
      const name = el('div', 'name', label);
      if (hint) name.append(el('small', 'hint', hint));
      const edit = el('div', 'edit');
      const shown = key in state.edits ? state.edits[key] : s.value;
      if (conv === 'enum') {
        const sel = el('select');
        opts.forEach((o, i) => sel.append(new Option(o, String(i))));
        sel.value = String(shown);
        sel.onchange = () => setEdit(key, Number(sel.value), row);
        edit.append(sel);
      } else {
        const wrap = el('div', 'input-unit');
        const inp = el('input');
        inp.type = 'number';
        inp.inputMode = 'decimal';
        inp.step = conv === 'mv' ? '0.001' : conv === 'dv' || conv === 'da' || conv === 'dah' ? '0.1' : '1';
        inp.value = String(Number(shown.toFixed(3)));
        inp.onchange = () => {
          const v = Number(inp.value);
          if (!Number.isFinite(v) || inp.value === '') { inp.value = String(shown); return; }
          setEdit(key, v, row);
        };
        wrap.append(inp);
        if (unit) wrap.append(el('i', '', unit));
        edit.append(wrap);
      }
      row.append(name, edit);
      list.append(row);
    }
    page.append(list);
  }
  refreshChecks();
}

function setEdit(key, v, row) {
  const s = state.settings[key];
  if (Math.abs(v - s.value) < 1e-9) delete state.edits[key];
  else state.edits[key] = v;
  row.classList.toggle('mod', key in state.edits);
  refreshChecks();
  updateSaveBar();
}

function refreshChecks() {
  const box = $('#setChecks');
  if (!box) return;
  box.replaceChildren();
  for (const [lvl, title, text] of settingsChecks(currentValues())) {
    const row = el('div', 'check ' + lvl);
    const tx = el('div');
    tx.append(el('b', '', title), el('span', '', text));
    row.append(el('span', 'check-ic', lvl === 'ok' ? '✓' : lvl === 'info' ? 'i' : '!'), tx);
    box.append(row);
  }
}

function updateSaveBar() {
  const n = Object.keys(state.edits).length;
  $('#saveBar').hidden = !(n && state.page === 'settings');
  $('#saveText').textContent = n + ' modification' + (n > 1 ? 's' : '') + ' non enregistrée' + (n > 1 ? 's' : '');
}
$('#saveUndo').onclick = () => { state.edits = {}; renderSettings(); updateSaveBar(); };
$('#saveWrite').onclick = async () => {
  if (!requireConn()) return;
  const list = settingList().filter(([, key]) => key in state.edits);
  const rows = list.map(([, key, label, , unit]) => {
    const r = el('div', 'd');
    const right = el('span');
    right.append(el('span', 'old', fmt(state.settings[key].value, 3).replace(/\.?0+$/, '') + ' ' + unit), document.createTextNode('  →  '),
      el('span', 'new', fmt(state.edits[key], 3).replace(/\.?0+$/, '') + ' ' + unit));
    r.append(el('span', '', label), right);
    return r;
  });
  const box = el('div', 'diff-list');
  box.append(...rows);
  const ok = await sheet(list.length + ' changement' + (list.length > 1 ? 's' : '') + ' à enregistrer', [box],
    [{ label: 'Annuler', value: 'no' }, { label: 'Enregistrer', value: 'ok', cls: 'primary' }]);
  if (ok !== 'ok') return;
  backupLocal('Avant écriture');
  let done = 0;
  try {
    for (const [reg, key, , , , conv] of list) {
      await state.bms.writeReg(reg, valueToReg(conv, state.edits[key], state.settings[key].raw));
      done++;
    }
    state.settings = await state.bms.readSettings();
    state.edits = {};
    haptic([20, 40, 20]);
    toast('Paramètres enregistrés dans le BMS ✓');
  } catch (e) {
    toast('Arrêt après ' + done + ' écriture(s) : ' + e.message, true);
  }
  renderSettings();
  updateSaveBar();
};

// ================================================================ sauvegardes

const BK = 'lf-bms-backups';
function backupLocal(reason) {
  if (!state.settings) return;
  try {
    const list = JSON.parse(localStorage.getItem(BK) || '[]');
    const values = Object.fromEntries(Object.entries(state.settings).map(([k, s]) => [k, s.value]));
    if (list[0] && JSON.stringify(list[0].values) === JSON.stringify(values)) return;
    list.unshift({ t: Date.now(), reason, name: state.bms?.t.name, values });
    localStorage.setItem(BK, JSON.stringify(list.slice(0, 20)));
  } catch (e) { /* stockage plein ou bloqué */ }
}

$('#btnBackup').onclick = () => {
  if (!state.settings) { toast('Protections non lues (BMS Modbus connecté requis)', true); return; }
  const values = Object.fromEntries(Object.entries(state.settings).map(([k, s]) => [k, s.value]));
  download('protections_bms_' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify({ app: 'lite-foil-bms', version: 1, date: new Date().toISOString(), name: state.bms?.t.name, info: state.info, values }, null, 1), 'application/json');
  toast('Sauvegarde téléchargée ✓');
};
$('#btnRestore').onclick = async () => {
  if (!state.settings) { toast('Connecte d’abord un BMS Modbus', true); return; }
  const f = await pickFile('.json');
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'lite-foil-bms') throw new Error("ce fichier n'est pas une sauvegarde de BMS Lite Foil");
    let n = 0;
    for (const [k, v] of Object.entries(data.values)) {
      if (state.settings[k] && Math.abs(state.settings[k].value - v) > 1e-9) { state.edits[k] = v; n++; }
    }
    showPage('settings');
    toast(n ? n + ' réglages chargés : vérifie puis « Enregistrer »' : 'Identique aux réglages actuels');
  } catch (e) {
    toast('Import impossible : ' + e.message, true);
  }
};

// ================================================================ commandes

async function toggleMos(which, input) {
  if (!requireConn()) { input.checked = !input.checked; return; }
  const on = input.checked;
  if (!on && which === 'discharge' && !confirm('Couper la décharge arrête immédiatement la planche. Continuer ?')) { input.checked = true; return; }
  try {
    await state.bms.setMos(which, on);
    haptic(20);
    toast((which === 'charge' ? 'Charge ' : 'Décharge ') + (on ? 'autorisée' : 'coupée'));
  } catch (e) {
    input.checked = !on;
    toast('Commande refusée : ' + e.message, true);
  }
}
$('#swCharge').onchange = (e) => toggleMos('charge', e.target);
$('#swDischarge').onchange = (e) => toggleMos('discharge', e.target);
$('#btnSoc100').onclick = () => { $('#socIn').value = '100'; };
$('#btnSoc').onclick = async () => {
  if (!requireConn()) return;
  const v = Number($('#socIn').value);
  if ($('#socIn').value === '' || !Number.isFinite(v) || v < 0 || v > 100) { toast('Entre une valeur entre 0 et 100 %', true); return; }
  try {
    await state.bms.setSoc(v);
    toast('Charge recalée à ' + fmt(v, 1) + ' %');
  } catch (e) {
    toast('Commande refusée : ' + e.message, true);
  }
};
$('#btnZero').onclick = async () => {
  if (!requireConn() || !confirm('Batterie au repos, rien de branché ? Le courant mesuré sera pris comme zéro.')) return;
  try { await state.bms.zeroCurrent(); toast('Courant remis à zéro ✓'); } catch (e) { toast(e.message, true); }
};
$('#btnRestart').onclick = async () => {
  if (!requireConn() || !confirm('Redémarrer le BMS ? La batterie coupera quelques secondes.')) return;
  try { await state.bms.restart(); toast('Redémarrage…'); } catch (e) { toast(e.message, true); }
};

// ================================================================ infos

async function loadInfo() {
  const box = $('#infoList');
  if (!connected()) { setKv(box, [['État', 'non connecté']]); return; }
  if (!state.info && state.bms.proto === 'd2') state.info = await state.bms.readInfo().catch(() => ({}));
  const i = state.info || {};
  const v = state.last || {};
  setKv(box, [
    ['Bluetooth', state.bms.t.name],
    ['Protocole', state.bms.proto === 'd2' ? 'Modbus (récent)' : 'A5 (ancien)'],
    ['Cellules', v.cellCount ? v.cellCount + 'S' : '—'],
    ['Sondes', v.temps ? String(v.temps.length) : '—'],
    ['Cycles', v.cycles != null ? String(v.cycles) : '—'],
    ['Fabrication', i.date || '—'],
    ['Logiciel', i.software || '—', { full: true, mono: true }],
    ['Matériel', i.hardware || '—', { full: true, mono: true }],
    ['Code machine', i.code || '—', { full: true, mono: true }],
  ]);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && connected()) { keepAwake(true); loop(); }
});

const initial = location.hash.slice(1);
if (initial) showPage(initial);
