// Page « Essentiel » : la dizaine de réglages qui comptent sur un eFoil, expliqués en français,
// avec des vérifications de cohérence (les pièges relevés sur les forums VESC) et la gestion des
// doubles contrôleurs sur le bus CAN.

import { $, el, fmt, toast } from './ui.js';
import { loadIndex } from './config.js';

const SECTIONS = [
  ['Batterie', 'mcconf', [
    ['si_battery_cells', 'Nombre de cellules en série', 'Le « S » de ta batterie (12S = 12).',
      "Sert au calcul du niveau de batterie et des coupures. Une batterie 12S chargée fait 50,4 V (4,2 V par cellule)."],
    ['si_battery_ah', 'Capacité', 'En ampères-heures (Ah).', "Sert à l'estimation d'autonomie."],
    ['l_battery_cut_start', 'Début de la coupure douce', 'Le contrôleur commence à réduire la puissance.',
      "Règle habituelle Li-ion : 3,4 à 3,5 V par cellule (12S : 41 V). Trop haut, la puissance chute tôt ; trop bas, la batterie s'use."],
    ['l_battery_cut_end', 'Coupure complète', 'Plus aucune puissance sous cette tension.',
      "Règle habituelle Li-ion : 3,0 à 3,2 V par cellule (12S : 37 V). Ne descends pas sous 3,0 V par cellule."],
    ['l_in_current_max', 'Courant batterie max', 'Limite tirée sur la batterie, par contrôleur.',
      "À régler d'après la batterie (décharge max de ses cellules × nombre en parallèle). Avec deux contrôleurs, chacun prend cette valeur : le total est doublé."],
    ['l_in_current_min', 'Courant de recharge max', 'Freinage régénératif vers la batterie (négatif).',
      "Sur un eFoil on freine peu : une petite valeur (−5 à −10 A) suffit."],
  ]],
  ['Moteur', 'mcconf', [
    ['l_current_max', 'Courant moteur max', 'Couple maximal du moteur.',
      "Donné par la détection FOC. Les riders eFoil restent en général sous 70 A sur un moteur 65161 ; plus fait chauffer le moteur sans gain réel."],
    ['l_current_min', 'Courant de frein max', 'Freinage moteur (négatif).', 'Peu utilisé sur un eFoil.'],
    ['l_abs_current_max', 'Courant absolu max', 'Sécurité matérielle : coupure immédiate au-delà.',
      "Doit rester nettement au-dessus du courant moteur max (environ 1,5 fois) pour éviter des coupures en pleine accélération."],
    ['l_max_duty', 'Gaz maximum', 'Rapport cyclique maximal.',
      "95 % par défaut. Une valeur plus basse bride la vitesse de pointe : c'est un piège fréquent."],
    ['l_watt_max', 'Puissance max', 'Limite en watts, par contrôleur.', 'Laisse très haut si tu ne veux pas brider la puissance.'],
  ]],
  ['Températures', 'mcconf', [
    ['l_temp_fet_start', 'Contrôleur : réduction dès', 'La puissance baisse au-dessus de cette température.', ''],
    ['l_temp_motor_start', 'Moteur : réduction dès', 'Ne marche que si le moteur a une sonde.', ''],
    ['m_motor_temp_sens_type', 'Sonde du moteur', "Type de thermistance du moteur, ou « Disabled » s'il n'y en a pas.", ''],
  ]],
];

export function initEssentials(ctx) {
  const page = $('#page-essentials');

  function render() {
    page.replaceChildren();
    const mc = ctx.state.configs.mcconf;
    if (!mc) {
      const empty = el('div', 'card cfg-empty');
      empty.append(el('div', 'cfg-title', 'Réglages essentiels'),
        el('p', 'muted', 'Connecte le contrôleur (ou la démo) : cette page regroupe les réglages qui comptent sur un eFoil, expliqués simplement.'));
      page.append(empty);
      return;
    }

    page.append(el('div', 'section-label', 'Vérifications'));
    const checks = el('div', 'card checks');
    checks.id = 'essChecks';
    page.append(checks);

    const can = ctx.canDevs();
    if (can.length) {
      const card = el('div', 'card dual');
      const n = can.length + 1;
      card.append(el('div', 'm-label', n + ' contrôleurs sur le bus CAN'),
        el('p', 'muted small-text', "Chaque contrôleur se règle séparément : les courants batterie et la puissance s'additionnent. "
          + 'Le bouton ci-dessous recopie les réglages de cette page sur les autres contrôleurs.'));
      const total = el('div', 'kv-grid');
      total.id = 'essDual';
      const btn = el('button', 'btn small', 'Appliquer à tous les contrôleurs');
      btn.onclick = () => applyToAll(btn);
      card.append(total, btn);
      page.append(card);
    }

    for (const [title, kind, items] of SECTIONS) {
      const cfg = ctx.state.configs[kind];
      if (!cfg) continue;
      page.append(el('div', 'section-label', title));
      const list = el('div', 'params');
      for (const [name, label, hint, help] of items) {
        if (!cfg.has(name)) continue;
        list.append(ctx.makeParamRow(cfg, name, { label, hint, help }).el);
      }
      page.append(list);
    }
    refresh();
  }

  async function refresh() {
    const box = $('#essChecks');
    if (!box) return;
    const items = await computeChecks(ctx);
    box.replaceChildren();
    for (const [level, title, text] of items) {
      const row = el('div', 'check ' + level);
      const ic = el('span', 'check-ic', level === 'ok' ? '✓' : level === 'info' ? 'i' : '!');
      const tx = el('div');
      tx.append(el('b', '', title), el('span', '', text));
      row.append(ic, tx);
      box.append(row);
    }
    const dual = $('#essDual');
    const mc = ctx.state.configs.mcconf;
    if (dual && mc) {
      const n = ctx.canDevs().length + 1;
      dual.replaceChildren();
      for (const [k, label, unit] of [['l_in_current_max', 'Batterie total', 'A'], ['l_current_max', 'Moteur, chacun', 'A']]) {
        const v = mc.get(k) * (k === 'l_in_current_max' ? n : 1);
        const b = el('div', 'kv');
        b.append(el('div', 'k', label), el('div', 'v', fmt(v, 0) + ' ' + unit));
        dual.append(b);
      }
    }
  }

  // Recopie les réglages de cette page (moteur) sur chaque contrôleur du bus CAN.
  async function applyToAll(btn) {
    const v = ctx.state.vesc;
    const mc = ctx.state.configs.mcconf;
    if (!ctx.requireConn() || !mc) return;
    if (ctx.dirtyCount('mcconf')) { toast("Écris d'abord tes modifications sur ce contrôleur", true); return; }
    const names = SECTIONS.filter((s) => s[1] === 'mcconf').flatMap((s) => s[2].map((i) => i[0])).filter((n) => mc.has(n));
    const ids = ctx.canDevs().filter((id) => id !== v.canId);
    if (!confirm('Recopier ' + names.length + ' réglages sur ' + ids.length + ' autre(s) contrôleur(s) ?')) return;
    btn.disabled = true;
    const home = v.canId;
    let done = 0;
    try {
      for (const id of ids) {
        v.canId = id;
        const other = await ctx.readOther('mcconf');
        for (const n of names) if (other.has(n)) other.set(n, mc.get(n), true);
        await v.setConfig(other);
        done++;
      }
      toast('Réglages recopiés sur ' + done + ' contrôleur(s) ✓');
    } catch (e) {
      toast('Arrêt après ' + done + ' contrôleur(s) : ' + e.message, true);
    } finally {
      v.canId = home;
      btn.disabled = false;
    }
  }

  return { render, refresh };
}

// Liste de [niveau, titre, explication] ; niveau : ok, info, warn, bad.
async function computeChecks(ctx) {
  const out = [];
  const { state } = ctx;
  const mc = state.configs.mcconf;
  const app = state.configs.appconf;
  const fw = state.fw;
  const vin = state.lastValues?.v_in;

  // Version du firmware
  if (fw) {
    const ver = fw.major + '.' + String(fw.minor).padStart(2, '0');
    const index = await loadIndex();
    const known = index.some((e) => (e.fw || [e.folder]).includes(ver));
    if (fw.major < 5) out.push(['warn', 'Firmware ancien (' + ver + ')', "Les firmwares 5 et 6 corrigent beaucoup de problèmes de détection et de Bluetooth. Mets à jour si possible."]);
    else if (!known || fw.isTestFw) out.push(['info', 'Firmware ' + ver + (fw.isTestFw ? ' de test' : '') + ' non répertorié',
      'Les réglages sont lus avec les définitions ' + (mc?.folder || '?') + ', reconnues par leur signature : la lecture est fiable, mais les nouveautés de cette version peuvent manquer.']);
    else out.push(['ok', 'Firmware ' + ver, 'Version reconnue, toutes les définitions de réglages sont à jour.']);
  }
  if (!mc) return out;

  const cells = mc.has('si_battery_cells') ? mc.get('si_battery_cells') : NaN;
  const cutS = mc.get('l_battery_cut_start');
  const cutE = mc.get('l_battery_cut_end');

  if (Number.isFinite(cells) && Number.isFinite(vin) && vin > 5) {
    if (vin > cells * 4.25) out.push(['bad', 'Nombre de cellules trop bas', fmt(vin) + ' V mesurés, impossible avec ' + cells + ' cellules (max ' + fmt(cells * 4.2) + ' V). Ta batterie a sans doute ' + Math.round(vin / 3.8) + ' cellules.']);
    else if (vin < cells * 2.9) out.push(['bad', 'Nombre de cellules trop haut', fmt(vin) + ' V mesurés, trop peu pour ' + cells + ' cellules. Vérifie le « S » de ta batterie.']);
    else out.push(['ok', cells + ' cellules', fmt(vin) + ' V mesurés, soit ' + fmt(vin / cells, 2) + ' V par cellule.']);
  }
  if (Number.isFinite(cells)) {
    if (cutS <= cutE) out.push(['bad', 'Coupures inversées', 'Le début de coupure (' + fmt(cutS) + ' V) doit être au-dessus de la coupure complète (' + fmt(cutE) + ' V).']);
    if (cutE < cells * 2.95) out.push(['bad', 'Coupure trop basse', fmt(cutE) + ' V = ' + fmt(cutE / cells, 2) + ' V par cellule : risque de décharge profonde. Vise environ ' + fmt(cells * 3.1) + ' V.']);
    else if (cutS > cells * 3.65) out.push(['warn', 'Coupure très haute', 'La puissance baissera dès ' + fmt(cutS / cells, 2) + ' V par cellule : tu perds de l\'autonomie. Vise environ ' + fmt(cells * 3.45) + ' V.']);
    else if (cutS > cutE) out.push(['ok', 'Coupures batterie', fmt(cutS / cells, 2) + ' → ' + fmt(cutE / cells, 2) + ' V par cellule.']);
  }
  const duty = mc.get('l_max_duty');
  if (duty < 0.9) out.push(['warn', 'Vitesse bridée', 'Le gaz maximum est à ' + Math.round(duty * 100) + ' % : la vitesse de pointe est limitée. 95 % est la valeur normale.']);
  const iMax = mc.get('l_current_max');
  const iAbs = mc.get('l_abs_current_max');
  if (iAbs < iMax * 1.25) out.push(['warn', 'Courant absolu trop proche', 'À ' + fmt(iAbs, 0) + ' A pour ' + fmt(iMax, 0) + ' A de courant moteur, des coupures (ABS_OVER_CURRENT) peuvent arriver en accélération. Vise ' + fmt(iMax * 1.5, 0) + ' A.']);
  const iIn = mc.get('l_in_current_max');
  if (iIn > iMax) out.push(['info', 'Courant batterie > courant moteur', 'Ce n\'est pas dangereux, mais la limite batterie ne servira jamais : elle est au-dessus du courant moteur.']);
  if (mc.has('m_motor_temp_sens_type')) {
    const names = mc.params.m_motor_temp_sens_type.e || [];
    if ((names[mc.get('m_motor_temp_sens_type')] || '').startsWith('Disabled')) out.push(['info', 'Pas de sonde moteur', 'La protection en température du moteur est inactive.']);
  }
  if (app && app.has('app_to_use')) {
    const names = app.params.app_to_use.e || [];
    const use = names[app.get('app_to_use')] || '';
    const permanent = app.has('permanent_uart_enabled') && app.get('permanent_uart_enabled');
    if (!use.includes('UART') && !permanent) out.push(['warn', 'UART désactivé', '« APP to Use » vaut « ' + use + ' » : le module Bluetooth risque de ne plus parler au contrôleur. Choisis une option avec UART (page Télécommande).']);
  }
  if (!out.some((c) => c[0] === 'warn' || c[0] === 'bad')) out.push(['ok', 'Rien à signaler', 'Les réglages essentiels sont cohérents.']);
  return out;
}
