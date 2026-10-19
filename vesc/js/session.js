// Sessions : télémétrie du VESC + position GPS du téléphone, tracées sur la carte (couleur = puissance),
// conservées sur le téléphone (IndexedDB) et exportables en CSV ou GPX. C'est ce que les riders
// allaient chercher dans des boîtiers d'enregistrement à part.

import { $, el, fmt, fmtInt, fmtDuration, toast, download, haptic, setKv } from './ui.js';

const DB_NAME = 'lf-vesc';
const STORE = 'sessions';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDo(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const res = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(res?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const dbPut = (s) => dbDo('readwrite', (st) => st.put(s));
const dbGet = (id) => dbDo('readonly', (st) => st.get(id));
const dbDel = (id) => dbDo('readwrite', (st) => st.delete(id));
const dbAll = () => dbDo('readonly', (st) => st.getAll());

// Distance en mètres entre deux points GPS (haversine).
function dist(a, b) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function powerColor(w, max) {
  const x = Math.max(0, Math.min(1, w / (max || 1)));
  // cyan Lite Foil → jaune → rouge
  const stops = [[90, 205, 209], [245, 199, 106], [209, 52, 63]];
  const i = x < 0.5 ? 0 : 1;
  const t = x < 0.5 ? x * 2 : (x - 0.5) * 2;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * t));
  return 'rgb(' + c.join(',') + ')';
}

export function summarize(points) {
  let d = 0;
  let maxSpd = 0;
  let maxPow = 0;
  let maxTf = -Infinity;
  let maxTm = -Infinity;
  let prev = null;
  for (const p of points) {
    if (p.lat != null) {
      if (prev && (!p.acc || p.acc < 30)) d += dist(prev, p);
      if (!p.acc || p.acc < 30) prev = p;
      if (p.spd != null) maxSpd = Math.max(maxSpd, p.spd);
    }
    if (p.power != null) maxPow = Math.max(maxPow, p.power);
    if (p.temp_mos != null) maxTf = Math.max(maxTf, p.temp_mos);
    if (p.temp_motor != null) maxTm = Math.max(maxTm, p.temp_motor);
  }
  const withWh = points.filter((p) => p.wh != null);
  const wh = withWh.length > 1 ? withWh[withWh.length - 1].wh - withWh[0].wh : NaN;
  const dur = points.length > 1 ? points[points.length - 1].t - points[0].t : 0;
  return { dist: d, maxSpd, maxPow, maxTf, maxTm, wh, dur, whKm: d > 100 ? wh / (d / 1000) : NaN };
}

export function initSession(ctx) {
  const s = {
    rec: null, // session en cours
    watch: null,
    fix: null,
    map: null,
    layers: null,
    shown: null,
  };

  function ensureMap() {
    if (!s.map && !window.L) {
      const box = $('#sesMap');
      if (!box.textContent) box.append(el('div', 'map-off', 'Carte indisponible hors ligne : la session est quand même enregistrée.'));
      return null;
    }
    if (s.map) return s.map;
    s.map = L.map($('#sesMap'), { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 5);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' }).addTo(s.map);
    s.layers = L.layerGroup().addTo(s.map);
    return s.map;
  }

  function drawTrack(points, fit) {
    if (!ensureMap()) return;
    s.layers.clearLayers();
    const geo = points.filter((p) => p.lat != null && (!p.acc || p.acc < 30));
    if (!geo.length) return;
    const maxPow = Math.max(1, ...points.map((p) => p.power || 0));
    // Segments regroupés par tranche de puissance, pour rester léger avec des milliers de points.
    let seg = [geo[0]];
    let col = powerColor(geo[0].power || 0, maxPow);
    for (let i = 1; i < geo.length; i++) {
      const c = powerColor(geo[i].power || 0, maxPow);
      seg.push(geo[i]);
      if (c !== col || i === geo.length - 1) {
        L.polyline(seg.map((p) => [p.lat, p.lon]), { color: col, weight: 5, opacity: 0.95 }).addTo(s.layers);
        seg = [geo[i]];
        col = c;
      }
    }
    const last = geo[geo.length - 1];
    L.circleMarker([last.lat, last.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#0b0d10', fillOpacity: 1 }).addTo(s.layers);
    if (fit) s.map.fitBounds(L.latLngBounds(geo.map((p) => [p.lat, p.lon])), { padding: [24, 24], maxZoom: 17 });
    else s.map.panTo([last.lat, last.lon]);
  }

  function showStats(points) {
    const m = summarize(points);
    setKv($('#sesStats'), [
      ['Durée', fmtDuration(m.dur)],
      ['Distance', m.dist >= 1000 ? fmt(m.dist / 1000, 2) + ' km' : fmtInt(m.dist) + ' m'],
      ['Vitesse max', fmt(m.maxSpd * 3.6, 1) + ' km/h'],
      ['Puissance max', fmtInt(m.maxPow) + ' W'],
      ['Énergie', fmt(m.wh, 1) + ' Wh'],
      ['Conso', Number.isFinite(m.whKm) ? fmt(m.whKm, 1) + ' Wh/km' : '—'],
      ['Contrôleur max', Number.isFinite(m.maxTf) ? fmt(m.maxTf, 0) + ' °C' : '—'],
      ['Moteur max', Number.isFinite(m.maxTm) ? fmt(m.maxTm, 0) + ' °C' : '—'],
    ]);
  }

  async function start() {
    if (!navigator.geolocation) { toast("Pas de GPS sur cet appareil : la session n'aura que la télémétrie", true); }
    s.rec = { id: Date.now(), start: Date.now(), hw: ctx.state.fw?.hw || null, points: [], marks: [] };
    s.shown = null;
    s.fix = null;
    if (navigator.geolocation) {
      let gpsErr = false;
      s.watch = navigator.geolocation.watchPosition((pos) => {
        const c = pos.coords;
        const fix = { lat: c.latitude, lon: c.longitude, spd: c.speed, acc: c.accuracy, t: pos.timestamp };
        // Certains téléphones ne donnent pas la vitesse : on la déduit des deux dernières positions.
        if ((fix.spd == null || Number.isNaN(fix.spd)) && s.fix && fix.t - s.fix.t >= 500) {
          fix.spd = dist(s.fix, fix) / ((fix.t - s.fix.t) / 1000);
        }
        // Un saut de GPS ne doit pas devenir une vitesse max : au-delà de 90 km/h, on l'ignore.
        if (fix.spd > 25) fix.spd = null;
        s.fix = fix;
        // Sans contrôleur connecté, on enregistre quand même la trace GPS.
        if (!ctx.connected()) add({});
      }, (err) => {
        if (gpsErr) return;
        gpsErr = true;
        const why = { 1: 'autorisation refusée', 2: 'position indisponible', 3: 'pas de signal pour le moment' }[err.code] || err.message;
        toast('GPS : ' + why, err.code === 1);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    ctx.keepAwake(true);
    haptic(30);
    $('#btnSes').textContent = 'Arrêter la session';
    $('#btnSes').classList.add('stop');
    $('#sesLive').hidden = false;
    toast("Session lancée : garde l'écran allumé et le téléphone près de la planche");
    ctx.kickTelemetry();
    tick();
  }

  async function stopRec() {
    if (!s.rec) return;
    if (s.watch != null) navigator.geolocation.clearWatch(s.watch);
    s.watch = null;
    const rec = s.rec;
    s.rec = null;
    clearTimeout(s.tickTimer);
    $('#btnSes').textContent = 'Démarrer une session';
    $('#btnSes').classList.remove('stop');
    $('#sesLive').hidden = true;
    if (!ctx.connected()) ctx.keepAwake(false);
    if (rec.points.length < 2) { toast('Session trop courte, non enregistrée'); return; }
    rec.end = Date.now();
    rec.summary = summarize(rec.points);
    try {
      await dbPut(rec);
      toast('Session enregistrée ✓');
    } catch (e) {
      toast("Impossible d'enregistrer la session : " + e.message, true);
    }
    haptic([30, 60, 30]);
    renderList();
    open(rec);
  }

  function add(v) {
    if (!s.rec) return;
    const f = s.fix && Date.now() - s.fix.t < 5000 ? s.fix : null;
    s.rec.points.push({
      t: Date.now(),
      lat: f?.lat ?? null, lon: f?.lon ?? null, spd: f?.spd ?? null, acc: f ? Math.round(f.acc) : null,
      v_in: v.v_in, current_in: v.current_in, current_motor: v.current_motor, power: v.power,
      duty: v.duty_now, rpm: v.rpm, temp_mos: v.temp_mos, temp_motor: v.temp_motor, wh: v.watt_hours, fault: v.fault_code,
    });
  }

  // Rafraîchit l'affichage en direct une fois par seconde (pas à chaque mesure).
  function tick() {
    if (!s.rec) return;
    const pts = s.rec.points;
    const last = pts[pts.length - 1] || {};
    $('#sesSpd').textContent = last.spd != null ? fmt(last.spd * 3.6, 1) : '—';
    $('#sesPow').textContent = fmtInt(last.power);
    $('#sesGps').textContent = s.fix ? 'GPS ±' + Math.round(s.fix.acc) + ' m' : 'GPS en attente…';
    if (ctx.state.page === 'sessions') {
      showStats(pts);
      drawTrack(pts, pts.filter((p) => p.lat != null).length < 3);
    }
    s.tickTimer = setTimeout(tick, 1000);
  }

  function mark(label) {
    if (s.rec) s.rec.marks.push({ t: Date.now(), label });
  }

  async function open(rec) {
    s.shown = rec;
    ensureMap();
    setTimeout(() => s.map?.invalidateSize(), 50);
    showStats(rec.points);
    drawTrack(rec.points, true);
    $('#sesTitle').textContent = new Date(rec.start).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function renderList() {
    const box = $('#sesList');
    let all = [];
    try { all = await dbAll(); } catch (e) { /* IndexedDB indisponible */ }
    all.sort((a, b) => b.start - a.start);
    box.replaceChildren();
    if (!all.length) {
      box.append(el('div', 'item muted small-text', 'Aucune session enregistrée pour le moment.'));
      return;
    }
    for (const r of all) {
      const m = r.summary || {};
      const item = el('div', 'item');
      const ic = el('span', 'ic', '▶');
      ic.style.background = '#148a90';
      const lb = el('div', 'lb');
      lb.append(el('b', '', new Date(r.start).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })),
        el('span', '', fmtDuration(m.dur || 0) + ' · ' + (m.dist >= 1000 ? fmt(m.dist / 1000, 1) + ' km' : fmtInt(m.dist || 0) + ' m')
          + ' · ' + fmt(m.wh, 0) + ' Wh'));
      const acts = el('div', 'acts');
      const bOpen = el('button', '', 'Voir');
      bOpen.onclick = async () => { open(await dbGet(r.id)); $('#sesMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      const bCsv = el('button', '', 'CSV');
      bCsv.onclick = async () => exportCsv(await dbGet(r.id));
      const bGpx = el('button', '', 'GPX');
      bGpx.onclick = async () => exportGpx(await dbGet(r.id));
      const bDel = el('button', '', '✕');
      bDel.onclick = async () => {
        if (!confirm('Supprimer cette session ?')) return;
        await dbDel(r.id);
        renderList();
      };
      acts.append(bOpen, bCsv, bGpx, bDel);
      item.append(ic, lb, acts);
      box.append(item);
    }
  }

  function stamp(rec) {
    return new Date(rec.start).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  function exportCsv(rec) {
    const cols = ['t', 'lat', 'lon', 'spd', 'acc', 'v_in', 'current_in', 'current_motor', 'power', 'duty', 'rpm', 'temp_mos', 'temp_motor', 'wh', 'fault'];
    const rows = rec.points.map((p) => cols.map((c) => (c === 't' ? new Date(p.t).toISOString() : p[c] ?? '')).join(';'));
    download('session_' + stamp(rec) + '.csv', [cols.join(';')].concat(rows).join('\n'), 'text/csv');
  }

  function exportGpx(rec) {
    const pts = rec.points.filter((p) => p.lat != null);
    if (!pts.length) { toast('Pas de position GPS dans cette session', true); return; }
    const trk = pts.map((p) => '      <trkpt lat="' + p.lat.toFixed(7) + '" lon="' + p.lon.toFixed(7) + '"><time>' + new Date(p.t).toISOString()
      + '</time><extensions><power>' + Math.round(p.power || 0) + '</power></extensions></trkpt>').join('\n');
    const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Lite Foil · Atelier VESC" xmlns="http://www.topografix.com/GPX/1/1">\n'
      + '  <trk><name>Session Lite Foil ' + new Date(rec.start).toLocaleString('fr-FR') + '</name><trkseg>\n' + trk + '\n  </trkseg></trk>\n</gpx>\n';
    download('session_' + stamp(rec) + '.gpx', gpx, 'application/gpx+xml');
  }

  function onShow() {
    ensureMap();
    setTimeout(() => s.map?.invalidateSize(), 60);
    if (s.rec) { showStats(s.rec.points); drawTrack(s.rec.points, true); } else if (s.shown) open(s.shown);
    renderList();
  }

  $('#btnSes').onclick = () => (s.rec ? stopRec() : start());
  window.addEventListener('beforeunload', (e) => { if (s.rec) { e.preventDefault(); e.returnValue = ''; } });

  return {
    get rec() { return s.rec; },
    add, mark, onShow, renderList,
  };
}
