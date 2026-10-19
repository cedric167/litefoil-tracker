// Profils moteur : réglages de départ pour les moteurs eFoil courants, remplis dans la configuration
// (rien n'est écrit sans passer par la barre « Écrire »). La détection FOC reste indispensable :
// résistance, inductance et flux varient d'un moteur à l'autre, même de même modèle.

import { el, fmt, toast } from './ui.js';

export const PROFILES = {
  maytech6579: {
    name: 'Maytech 6579 110KV',
    img: 'img/motors/maytech_6579.svg',
    // Fiche Maytech (MTO6579-110-WPC) : 110 KV, 24N20P (10 paires de pôles), 150 A nominal,
    // 24-48 V avec l'hélice repliable MICP27F, environ 1,1 kg.
    specs: [['KV', '110 tr/min/V'], ['Pôles', '20 (24N20P)'], ['Courant nominal', '150 A'], ['Tension', '24–48 V (hélice MICP27F)']],
    kv: 110,
    poles: 20,
    maxVolt: 48,
    // Préréglage de détection FOC : entre « Outrunner moyen » et « Gros outrunner » de VESC Tool (≈ 1,1 kg).
    detect: { loss: 150, openloop: 700, sensorless: 4000 },
    // Points de départ selon le poids du rider (guide eFoil PacificMeister, foil.zone).
    riders: [
      { label: '< 70 kg', motor: 60, brake: -40, batt: 40, regen: -12 },
      { label: '70–90 kg', motor: 80, brake: -50, batt: 50, regen: -15 },
      { label: '> 90 kg', motor: 100, brake: -60, batt: 60, regen: -18 },
    ],
  },
};

// Flux magnétique attendu (Wb) d'après le KV et le nombre de pôles : λ = 60 / (√3 · π · pôles · KV).
export function expectedFlux(p) {
  return 60 / (Math.sqrt(3) * Math.PI * p.poles * p.kv);
}

const KEY = 'lf-vesc-motor-profile';
export function savedProfile() {
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
}
function saveProfile(id) {
  try { localStorage.setItem(KEY, id); } catch (e) { /* stockage bloqué */ }
}

// Valeurs du profil pour un rider et une batterie donnés.
export function profileValues(p, rider, cells) {
  const r = p.riders[rider];
  return {
    si_motor_poles: p.poles,
    si_gear_ratio: 1,
    si_battery_cells: cells,
    l_battery_cut_start: Number((cells * 3.4).toFixed(1)),
    l_battery_cut_end: Number((cells * 3.1).toFixed(1)),
    l_current_max: r.motor,
    l_current_min: r.brake,
    l_in_current_max: r.batt,
    l_in_current_min: r.regen,
    l_abs_current_max: 150,
    l_max_duty: 0.95,
  };
}

// Carte « Profil moteur » de la page Essentiel.
export function profileCard(ctx, onApplied) {
  const p = PROFILES.maytech6579;
  const card = el('div', 'card profile');
  const head = el('div', 'profile-head');
  const img = el('img');
  img.src = p.img;
  img.alt = p.name;
  const t = el('div');
  t.append(el('div', 'm-label', 'Profil moteur'), el('div', 'dev-name', p.name));
  head.append(img, t);
  card.append(head);

  const specs = el('div', 'kv-grid');
  for (const [k, v] of p.specs) {
    const b = el('div', 'kv');
    b.append(el('div', 'k', k), el('div', 'v', v));
    specs.append(b);
  }
  card.append(specs);

  const mc = ctx.state.configs.mcconf;
  const vin = ctx.state.lastValues?.v_in;
  // La tension seule ne tranche pas (48 V = 12S chargée ou 13S à mi-charge) : on garde le réglage actuel
  // s'il est cohérent, sinon 12S (recommandation Maytech) si possible, sinon le plus petit nombre possible.
  const fits = (n) => !Number.isFinite(vin) || vin < 20 || (vin <= n * 4.25 && vin >= n * 2.9);
  let cells = mc?.has('si_battery_cells') ? mc.get('si_battery_cells') : 12;
  if (cells < 10 || cells > 14 || !fits(cells)) cells = fits(12) ? 12 : Math.min(14, Math.max(10, Math.ceil(vin / 4.2)));
  let rider = 1;

  card.append(el('div', 'section-label', 'Ton poids'));
  const seg = el('div', 'seg wide');
  p.riders.forEach((r, i) => {
    const b = el('button', i === rider ? 'on' : '', r.label);
    b.onclick = () => { rider = i; for (const x of seg.children) x.classList.toggle('on', x === b); preview(); };
    seg.append(b);
  });
  card.append(seg);

  const cellRow = el('label', 'field');
  const cellSel = el('select');
  for (let n = 10; n <= 14; n++) cellSel.append(new Option(n + 'S · ' + fmt(n * 4.2, 1) + ' V chargée', String(n)));
  cellSel.value = String(cells);
  cellSel.onchange = () => { cells = Number(cellSel.value); preview(); };
  cellRow.append(el('span', '', 'Batterie'), cellSel);
  card.append(cellRow);

  const out = el('div', 'kv-grid profile-values');
  const warn = el('div', 'banner warn');
  card.append(out, warn);

  function preview() {
    const v = profileValues(p, rider, cells);
    out.replaceChildren();
    for (const [k, label, txt] of [
      ['l_current_max', 'Courant moteur', v.l_current_max + ' A'],
      ['l_in_current_max', 'Courant batterie', v.l_in_current_max + ' A'],
      ['l_battery_cut_start', 'Coupure douce', fmt(v.l_battery_cut_start, 1) + ' V'],
      ['l_battery_cut_end', 'Coupure complète', fmt(v.l_battery_cut_end, 1) + ' V'],
    ]) {
      const b = el('div', 'kv');
      b.append(el('div', 'k', label), el('div', 'v', txt));
      b.dataset.k = k;
      out.append(b);
    }
    const full = cells * 4.2;
    warn.hidden = full <= p.maxVolt + 3;
    warn.textContent = 'Batterie chargée à ' + fmt(full, 1) + ' V : Maytech annonce 24–48 V avec l\'hélice MICP27F. '
      + 'Au-delà, l\'hélice tourne plus vite que prévu et le moteur chauffe ; reste en 12S sauf hélice plus petite.';
  }
  preview();

  const btn = el('button', 'btn primary wide', 'Appliquer ce profil');
  btn.onclick = () => {
    const cfg = ctx.state.configs.mcconf;
    if (!ctx.requireConn() || !cfg) return;
    const v = profileValues(p, rider, cells);
    let n = 0;
    for (const [k, val] of Object.entries(v)) if (cfg.has(k)) { cfg.set(k, val, true); n++; }
    cfg._emit(null);
    saveProfile('maytech6579');
    toast(n + ' réglages préremplis. Vérifie puis « Écrire ». Lance ensuite la détection FOC.');
    onApplied?.();
  };
  card.append(btn, el('p', 'muted small-text',
    'Points de départ (fiche Maytech, guides eFoil). La détection FOC reste indispensable : elle mesure ton moteur. '
    + "Sur la télécommande Maytech : 10 paires de pôles, rapport 1,0, mode « Surfboard »."));
  return card;
}

// Vérification après détection : le flux mesuré doit être proche de la valeur théorique du profil.
export function profileChecks(mc) {
  const id = savedProfile();
  const p = id && PROFILES[id];
  if (!p || !mc?.has('foc_motor_flux_linkage')) return [];
  const flux = mc.get('foc_motor_flux_linkage');
  const exp = expectedFlux(p);
  if (!(flux > 0)) return [];
  const err = Math.abs(flux - exp) / exp;
  if (err > 0.2) {
    return [['warn', 'Flux moteur inhabituel', 'Mesuré ' + fmt(flux * 1e3, 2) + ' mWb, attendu environ ' + fmt(exp * 1e3, 2)
      + ' mWb pour un ' + p.name + '. Refais la détection (hélice démontée, batterie chargée).']];
  }
  return [['ok', 'Flux moteur cohérent', fmt(flux * 1e3, 2) + ' mWb mesurés, ' + fmt(exp * 1e3, 2) + ' mWb attendus pour un ' + p.name + '.']];
}
