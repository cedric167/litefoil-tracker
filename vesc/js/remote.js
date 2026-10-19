// Page « Télécommande » : mode d'entrée (avec ou sans UART), courbe de gaz, zone morte, rampes et
// calibration PPM, avec la position de la gâchette en direct. Ce sont les réglages que les riders
// trouvent « difficiles à atteindre » dans VESC Tool.

import { $, el, fmt, toast, clamp, haptic } from './ui.js';

// Même calcul que utils_throttle_curve() du firmware (bldc/util/utils_math.c).
export function throttleCurve(val, accel, brake, mode) {
  val = clamp(val, -1, 1);
  const a = Math.abs(val);
  const c = val >= 0 ? accel : brake;
  let r;
  if (mode === 0) r = c >= 0 ? 1 - Math.pow(1 - a, 1 + c) : Math.pow(a, 1 - c);
  else if (mode === 1) {
    if (Math.abs(c) < 1e-10) r = a;
    else r = c >= 0 ? 1 - (Math.exp(c * (1 - a)) - 1) / (Math.exp(c) - 1) : (Math.exp(-c * a) - 1) / (Math.exp(-c) - 1);
  } else if (mode === 2) r = c >= 0 ? 1 - (1 - a) / (1 + c * a) : a / (1 - c * (1 - a));
  else r = a;
  return val < 0 ? -r : r;
}

// Zone morte, comme utils_deadband() : 0 sous le seuil, puis remise à l'échelle jusqu'à 1.
function deadband(x, tres) {
  if (Math.abs(x) < tres) return 0;
  return Math.sign(x) * (Math.abs(x) - tres) / (1 - tres);
}

// Quelle configuration d'entrée correspond à « APP to Use ».
function inputPrefix(useName) {
  if (useName.startsWith('PPM')) return 'app_ppm_conf';
  if (useName.startsWith('ADC')) return 'app_adc_conf';
  return 'app_chuk_conf'; // UART, NRF, Nunchuk : télécommandes VESC par UART
}

const FIELDS = [
  ['ctrl_type', 'Mode de commande', 'Courant = sensation naturelle (recommandé sur eFoil). « No Reverse » interdit la marche arrière.'],
  ['hyst', 'Zone morte', "Course de gâchette ignorée autour du neutre, pour éviter que l'hélice tourne au repos."],
  ['throttle_exp_mode', 'Forme de la courbe', 'Exponentielle, naturelle ou polynomiale : voir le graphique.'],
  ['throttle_exp', 'Courbe des gaz', 'Négatif = départ plus doux et plus de précision à bas régime ; positif = plus réactif.'],
  ['throttle_exp_brake', 'Courbe du frein', 'Même principe pour le frein.'],
  ['ramp_time_pos', 'Rampe d\'accélération', 'Temps pour passer de 0 à plein gaz : plus long = démarrages plus doux.'],
  ['ramp_time_neg', 'Rampe de relâchement', 'Temps pour revenir à 0 quand tu relâches.'],
  ['safe_start', 'Démarrage sécurisé', 'Le moteur ne démarre pas si la gâchette est déjà enfoncée à la mise sous tension.'],
  ['multi_esc', 'Plusieurs contrôleurs', 'Envoie la commande aux autres contrôleurs du bus CAN.'],
];
const PULSES = [
  ['pulse_start', 'Impulsion minimum', 'Gâchette relâchée à fond (frein).'],
  ['pulse_center', 'Impulsion neutre', 'Gâchette au repos.'],
  ['pulse_end', 'Impulsion maximum', 'Plein gaz.'],
];

export function initRemote(ctx) {
  const page = $('#page-remote');
  const live = { timer: null, value: null, cal: null };

  function prefix() {
    const app = ctx.state.configs.appconf;
    const names = app.params.app_to_use?.e || [];
    return inputPrefix(names[app.get('app_to_use')] || '');
  }

  function render() {
    stop();
    page.replaceChildren();
    const app = ctx.state.configs.appconf;
    if (!app || !app.has('app_to_use')) {
      const empty = el('div', 'card cfg-empty');
      empty.append(el('div', 'cfg-title', 'Télécommande'),
        el('p', 'muted', 'Connecte le contrôleur (ou la démo) pour régler la courbe de gaz et la télécommande.'));
      page.append(empty);
      return;
    }
    const pre = prefix();

    const curveCard = el('div', 'card');
    const head = el('div', 'ch-head');
    const liveTxt = el('span', 'hm-max', pre === 'app_chuk_conf' ? 'position non disponible en UART' : 'gâchette —');
    liveTxt.id = 'rmLive';
    head.append(el('span', 'm-label', 'Courbe de gaz'), liveTxt);
    const canvas = el('canvas', 'curve');
    canvas.id = 'rmCurve';
    curveCard.append(head, canvas, el('p', 'muted small-text', "Horizontal : position de la gâchette. Vertical : commande envoyée au moteur. Le point montre ta gâchette en direct."));
    page.append(curveCard);

    page.append(el('div', 'section-label', "Mode d'entrée"));
    const inImg = el('div', 'wiz-usage');
    const pic = el('img');
    pic.src = 'img/input_' + (pre === 'app_ppm_conf' ? 'ppm' : pre === 'app_adc_conf' ? 'adc' : 'uart') + '.webp';
    pic.alt = '';
    inImg.append(pic, el('span', '', pre === 'app_ppm_conf' ? 'Récepteur radio (PPM) : la télécommande envoie une impulsion de 1 à 2 ms.'
      : pre === 'app_adc_conf' ? 'Gâchette analogique (ADC) : une tension entre 0 et 3,3 V.'
        : 'Télécommande série (UART) : la commande arrive par le câble COMM.'));
    page.append(inImg);
    const modeList = el('div', 'params');
    modeList.append(ctx.makeParamRow(app, 'app_to_use', {
      label: 'Entrée utilisée',
      hint: 'Garde une option « … and UART » pour que le Bluetooth fonctionne.',
      help: "PPM : récepteur radio classique. ADC : gâchette analogique. UART : télécommande VESC série. Avec « PPM and UART », la télécommande radio et le module Bluetooth marchent ensemble.",
    }).el);
    if (app.has('permanent_uart_enabled')) {
      modeList.append(ctx.makeParamRow(app, 'permanent_uart_enabled', { label: 'UART toujours actif', hint: 'Garde le Bluetooth même si « Entrée utilisée » est sans UART.' }).el);
    }
    page.append(modeList);

    page.append(el('div', 'section-label', 'Réglages de la gâchette'));
    const list = el('div', 'params');
    for (const [k, label, hint] of FIELDS) {
      const name = pre + '.' + k;
      if (app.has(name)) list.append(ctx.makeParamRow(app, name, { label, hint }).el);
    }
    page.append(list);

    if (pre === 'app_ppm_conf') {
      page.append(el('div', 'section-label', 'Calibration du récepteur'));
      const cal = el('div', 'params');
      for (const [k, label, hint] of PULSES) {
        const name = pre + '.' + k;
        if (app.has(name)) cal.append(ctx.makeParamRow(app, name, { label, hint }).el);
      }
      page.append(cal);
      const btn = el('button', 'btn wide', 'Calibrer la gâchette');
      btn.style.marginTop = '10px';
      btn.onclick = () => calibrate(btn);
      page.append(btn);
    }
    const save = el('button', 'btn primary wide page-save', 'Enregistrer les réglages');
    save.onclick = () => ctx.save();
    page.append(save);
    drawCurve();
    start();
  }

  function drawCurve() {
    const canvas = $('#rmCurve');
    const app = ctx.state.configs.appconf;
    if (!canvas || !app) return;
    const pre = prefix();
    const g = (k, d) => (app.has(pre + '.' + k) ? app.get(pre + '.' + k) : d);
    const accel = g('throttle_exp', 0);
    const brake = g('throttle_exp_brake', 0);
    const mode = g('throttle_exp_mode', 3);
    const hyst = g('hyst', 0);
    const out = (x) => throttleCurve(deadband(x, hyst), accel, brake, mode);

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 10;
    const X = (x) => pad + ((x + 1) / 2) * (W - 2 * pad);
    const Y = (y) => H - pad - ((y + 1) / 2) * (H - 2 * pad);

    c.strokeStyle = '#eef2f5';
    c.lineWidth = 1;
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      c.beginPath(); c.moveTo(X(v), Y(-1)); c.lineTo(X(v), Y(1)); c.stroke();
      c.beginPath(); c.moveTo(X(-1), Y(v)); c.lineTo(X(1), Y(v)); c.stroke();
    }
    // zone morte
    c.fillStyle = 'rgba(90, 205, 209, .12)';
    c.fillRect(X(-hyst), Y(1), X(hyst) - X(-hyst), Y(-1) - Y(1));
    // linéaire de référence
    c.setLineDash([4, 4]);
    c.strokeStyle = '#c5ccd3';
    c.beginPath(); c.moveTo(X(-1), Y(-1)); c.lineTo(X(1), Y(1)); c.stroke();
    c.setLineDash([]);
    // courbe
    c.strokeStyle = '#148a90';
    c.lineWidth = 2.5;
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = -1 + (2 * i) / 200;
      if (i) c.lineTo(X(x), Y(out(x))); else c.moveTo(X(x), Y(out(x)));
    }
    c.stroke();
    c.fillStyle = '#9aa6b0';
    c.font = '11px "Instrument Sans", system-ui, sans-serif';
    c.fillText('frein', X(-1) + 2, Y(0) - 6);
    c.fillText('gaz', X(1) - 22, Y(0) - 6);
    if (Number.isFinite(live.value)) {
      const x = clamp(live.value, -1, 1);
      c.fillStyle = '#e8833a';
      c.beginPath(); c.arc(X(x), Y(out(x)), 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    }
  }

  // Lecture de la gâchette en direct (PPM ou ADC décodés par le VESC).
  function start() {
    stop();
    const pre = prefix();
    if (pre === 'app_chuk_conf') return;
    const loop = async () => {
      if (ctx.state.page !== 'remote' || !ctx.connected()) { live.timer = null; return; }
      try {
        if (pre === 'app_ppm_conf') {
          const r = await ctx.state.vesc.getDecodedPpm();
          live.value = r.value;
          if (live.cal) live.cal.push(r.lastLen);
          $('#rmLive').textContent = 'gâchette ' + fmt(r.value * 100, 0) + ' % · ' + fmt(r.lastLen * 1000, 0) + ' µs';
        } else {
          const r = await ctx.state.vesc.getDecodedAdc();
          live.value = r.adc;
          $('#rmLive').textContent = 'gâchette ' + fmt(r.adc * 100, 0) + ' % · ' + fmt(r.voltage, 2) + ' V';
        }
        drawCurve();
      } catch (e) { /* pas de signal : on réessaie */ }
      live.timer = setTimeout(loop, 120);
    };
    live.timer = setTimeout(loop, 50);
  }

  function stop() {
    clearTimeout(live.timer);
    live.timer = null;
  }

  // Calibration PPM : on relève le neutre, puis les extrêmes pendant que le rider bouge la gâchette.
  async function calibrate(btn) {
    if (!ctx.requireConn()) return;
    const app = ctx.state.configs.appconf;
    if (!confirm("Laisse la gâchette au repos, appuie sur OK, puis pendant 8 secondes va à fond dans les deux sens. L'hélice ne tournera pas pendant la mesure.")) return;
    btn.disabled = true;
    // Coupe la sortie moteur pendant la mesure (comme l'assistant de VESC Tool), sur tout le bus CAN.
    await ctx.disableOutput(11000);
    live.cal = [];
    await new Promise((r) => setTimeout(r, 600));
    const center = live.cal.slice().sort((a, b) => a - b)[Math.floor(live.cal.length / 2)];
    for (let s = 8; s > 0; s--) {
      btn.textContent = 'Bouge la gâchette… ' + s + ' s';
      await new Promise((r) => setTimeout(r, 1000));
    }
    const samples = live.cal.filter((x) => x > 0.5 && x < 2.6);
    live.cal = null;
    btn.textContent = 'Calibrer la gâchette';
    btn.disabled = false;
    if (samples.length < 10 || !center) { toast('Pas de signal PPM : vérifie le récepteur', true); return; }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    if (max - min < 0.3) { toast("Course trop courte : va bien à fond dans les deux sens", true); return; }
    app.set('app_ppm_conf.pulse_start', Number(min.toFixed(3)));
    app.set('app_ppm_conf.pulse_end', Number(max.toFixed(3)));
    app.set('app_ppm_conf.pulse_center', Number(center.toFixed(3)));
    haptic([20, 40, 20]);
    toast('Calibré : ' + fmt(min * 1000, 0) + ' / ' + fmt(center * 1000, 0) + ' / ' + fmt(max * 1000, 0) + ' µs. « Enregistrer » pour enregistrer.');
  }

  return { render, drawCurve, start, stop };
}
