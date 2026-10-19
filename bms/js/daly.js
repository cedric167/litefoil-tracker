// BMS Daly par Bluetooth (service fff0, notification fff1, écriture fff2), deux générations :
// - Modbus (trames 0xD2, BMS H/K/M/S récents) : mesures, réglages et commandes ;
// - « A5 » (anciens modules) : mesures, MOS et état de charge seulement.
// Références : « dalyModbusProtocol.xlsx » de Daly (repris par syssi/esphome-daly-bms) et
// « Daly UART/485 Communications Protocol V1.2 ».

const SVC = '0000fff0-0000-1000-8000-00805f9b34fb';
const CH_NOTIFY = '0000fff1-0000-1000-8000-00805f9b34fb';
const CH_WRITE = '0000fff2-0000-1000-8000-00805f9b34fb';
const LAST_KEY = 'lf-bms-last-device';

export function modbusCrc(bytes) {
  let c = 0xFFFF;
  for (const x of bytes) {
    c ^= x;
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >> 1) ^ 0xA001 : c >> 1;
  }
  return c & 0xFFFF;
}

function withCrc(f) {
  const c = modbusCrc(f);
  return Uint8Array.from([...f, c & 0xFF, c >> 8]);
}

export const d2Read = (reg, count) => withCrc([0xD2, 0x03, reg >> 8, reg & 0xFF, count >> 8, count & 0xFF]);
export const d2Write = (reg, value) => withCrc([0xD2, 0x06, reg >> 8, reg & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);

export function a5Frame(cmd, data = []) {
  // 0x80 : adresse « appli Bluetooth » du protocole Daly.
  const f = [0xA5, 0x80, cmd, 0x08, 0, 0, 0, 0, 0, 0, 0, 0];
  data.forEach((b, i) => { f[4 + i] = b; });
  let sum = 0;
  for (const x of f) sum = (sum + x) & 0xFF;
  f.push(sum);
  return Uint8Array.from(f);
}

// ---------------------------------------------------------------- défauts (registres 0x3A-0x3C ou commande A5 0x98)

const FAULTS = [
  // octet 0
  ['Cellule trop haute (niveau 1)', 'Cellule trop haute (niveau 2)', 'Cellule trop basse (niveau 1)', 'Cellule trop basse (niveau 2)',
    'Pack trop haut (niveau 1)', 'Pack trop haut (niveau 2)', 'Pack trop bas (niveau 1)', 'Pack trop bas (niveau 2)'],
  // octet 1
  ['Température de charge trop haute (1)', 'Température de charge trop haute (2)', 'Température de charge trop basse (1)', 'Température de charge trop basse (2)',
    'Température de décharge trop haute (1)', 'Température de décharge trop haute (2)', 'Température de décharge trop basse (1)', 'Température de décharge trop basse (2)'],
  // octet 2
  ['Courant de charge trop fort (1)', 'Courant de charge trop fort (2)', 'Courant de décharge trop fort (1)', 'Courant de décharge trop fort (2)',
    'Charge trop haute (1)', 'Charge trop haute (2)', 'Charge trop basse (1)', 'Charge trop basse (2)'],
  // octet 3
  ['Écart entre cellules trop grand (1)', 'Écart entre cellules trop grand (2)', 'Écart de température trop grand (1)', 'Écart de température trop grand (2)'],
  // octet 4
  ['MOS de charge trop chaud', 'MOS de décharge trop chaud', 'Sonde du MOS de charge en panne', 'Sonde du MOS de décharge en panne',
    'MOS de charge collé', 'MOS de décharge collé', 'MOS de charge : circuit ouvert', 'MOS de décharge : circuit ouvert'],
  // octet 5
  ['Puce de mesure (AFE) en panne', 'Mesure de tension perdue', 'Sonde de température en panne', 'Mémoire EEPROM en panne',
    'Horloge en panne', 'Précharge ratée', 'Communication véhicule en panne', 'Communication interne en panne'],
  // octet 6 (A5 seulement)
  ['Module de courant en panne', 'Mesure de tension pack en panne', 'Protection court-circuit', 'Charge interdite (tension trop basse)'],
];

// Niveau 2 = protection active (le BMS coupe), niveau 1 = simple alerte.
export function decodeFaults(bytes) {
  const out = [];
  bytes.forEach((b, i) => {
    for (let bit = 0; bit < 8; bit++) {
      if (!(b & (1 << bit)) || !FAULTS[i]?.[bit]) continue;
      const label = FAULTS[i][bit];
      const severe = i >= 4 || /\(2\)|niveau 2/.test(label);
      out.push({ label, severe });
    }
  });
  return out;
}

// ---------------------------------------------------------------- réglages (Modbus 0x80-0xA8)

// [registre, clé, libellé, explication, unité, conversion]
// conversions : 'mv' (mV ↔ V), 'dv' (0,1 V), 'da' (0,1 A, décalage 30000), 'dah' (0,1 Ah), 't40' (°C, décalage 40), 'raw'
export const SETTINGS = [
  ['Batterie', [
    [0x80, 'capacity', 'Capacité nominale', "Capacité réelle du pack : sert au calcul du pourcentage. À régler en premier.", 'Ah', 'dah'],
    [0x89, 'type', 'Chimie', 'Li-ion (ternaire) pour la plupart des batteries eFoil.', '', 'enum', ['LiFePO4', 'Li-ion (ternaire)', 'Titanate (LTO)']],
    [0x81, 'cellRef', 'Tension de référence cellule', 'Tension nominale d’une cellule.', 'V', 'mv'],
    [0x8A, 'sleep', 'Mise en veille après', 'Temps sans courant avant que le BMS s’endorme.', 's', 'raw'],
  ]],
  ['Tension des cellules', [
    [0x8B, 'cellHigh1', 'Cellule haute : alerte', 'Alerte quand une cellule dépasse cette tension.', 'V', 'mv'],
    [0x8C, 'cellHigh2', 'Cellule haute : coupure charge', 'La charge est coupée au-delà (Li-ion : 4,20 à 4,25 V).', 'V', 'mv'],
    [0x8D, 'cellLow1', 'Cellule basse : alerte', 'Alerte sous cette tension.', 'V', 'mv'],
    [0x8E, 'cellLow2', 'Cellule basse : coupure décharge', 'La décharge est coupée en dessous (Li-ion : 2,8 à 3,0 V).', 'V', 'mv'],
  ]],
  ['Tension du pack', [
    [0x8F, 'packHigh1', 'Pack haut : alerte', '', 'V', 'dv'],
    [0x90, 'packHigh2', 'Pack haut : coupure charge', '', 'V', 'dv'],
    [0x91, 'packLow1', 'Pack bas : alerte', '', 'V', 'dv'],
    [0x92, 'packLow2', 'Pack bas : coupure décharge', '', 'V', 'dv'],
  ]],
  ['Courants', [
    [0x93, 'chgCur1', 'Courant de charge : alerte', '', 'A', 'da'],
    [0x94, 'chgCur2', 'Courant de charge : coupure', 'Au-delà, le BMS coupe la charge.', 'A', 'da'],
    [0x95, 'dsgCur1', 'Courant de décharge : alerte', '', 'A', 'da'],
    [0x96, 'dsgCur2', 'Courant de décharge : coupure', 'Au-delà, le BMS coupe la décharge. Doit dépasser le courant batterie max du VESC.', 'A', 'da'],
  ]],
  ['Températures', [
    [0x97, 'chgTHigh1', 'Charge : trop chaud (alerte)', '', '°C', 't40'],
    [0x98, 'chgTHigh2', 'Charge : trop chaud (coupure)', '', '°C', 't40'],
    [0x99, 'chgTLow1', 'Charge : trop froid (alerte)', 'Charger un Li-ion sous 0 °C l’abîme.', '°C', 't40'],
    [0x9A, 'chgTLow2', 'Charge : trop froid (coupure)', '', '°C', 't40'],
    [0x9B, 'dsgTHigh1', 'Décharge : trop chaud (alerte)', '', '°C', 't40'],
    [0x9C, 'dsgTHigh2', 'Décharge : trop chaud (coupure)', '', '°C', 't40'],
    [0x9D, 'dsgTLow1', 'Décharge : trop froid (alerte)', '', '°C', 't40'],
    [0x9E, 'dsgTLow2', 'Décharge : trop froid (coupure)', '', '°C', 't40'],
    [0xA8, 'mosT', 'MOS : protection température', '', '°C', 't40'],
  ]],
  ['Écarts et équilibrage', [
    [0x9F, 'diffV1', 'Écart cellules : alerte', 'Différence entre la cellule la plus haute et la plus basse.', 'mV', 'raw'],
    [0xA0, 'diffV2', 'Écart cellules : coupure', '', 'mV', 'raw'],
    [0xA1, 'diffT1', 'Écart de température : alerte', '', '°C', 'raw'],
    [0xA2, 'diffT2', 'Écart de température : coupure', '', '°C', 'raw'],
    [0xA3, 'balV', 'Équilibrage dès', 'L’équilibrage démarre au-dessus de cette tension de cellule.', 'V', 'mv'],
    [0xA4, 'balDiff', 'Équilibrage si écart >', 'Écart minimal entre cellules pour équilibrer.', 'mV', 'raw'],
  ]],
];

export function settingList() {
  return SETTINGS.flatMap(([, items]) => items);
}

export function regToValue(conv, raw) {
  switch (conv) {
    case 'mv': return raw / 1000;
    case 'dv': return raw / 10;
    case 'dah': return raw / 10;
    case 'da': return Math.abs(raw - 30000) / 10;
    case 't40': return raw - 40;
    default: return raw;
  }
}

// `prevRaw` garde le signe des courants (la doc Daly ne précise pas lequel est utilisé).
export function valueToReg(conv, v, prevRaw) {
  switch (conv) {
    case 'mv': return Math.round(v * 1000);
    case 'dv': return Math.round(v * 10);
    case 'dah': return Math.round(v * 10);
    case 'da': return 30000 + (prevRaw < 30000 ? -1 : 1) * Math.round(Math.abs(v) * 10);
    case 't40': return Math.round(v) + 40;
    default: return Math.round(v);
  }
}

const ascii = (regs) => regs.map((r) => String.fromCharCode(r >> 8, r & 0xFF)).join('').replace(/[^\x20-\x7E]/g, '').trim();

// ---------------------------------------------------------------- liaison

export class DalyBms extends EventTarget {
  constructor(transport) {
    super();
    this.t = transport;
    this.proto = null; // 'd2' ou 'a5'
    this.rx = [];
    this.pending = null; // { kind, reg, count, resolve, reject, timer }
    this.queue = Promise.resolve();
    this.st = {};
    this.a5cells = [];
    this.a5temps = [];
    transport.onData = (d) => this._onData(d);
    transport.onClose = () => this.dispatchEvent(new Event('close'));
  }

  async open(device = null) {
    await this.t.open(device);
    await this.detect();
  }

  async close() {
    this.closing = true;
    await this.t.close();
  }

  // Modbus d'abord, repli sur le protocole A5 (comme l'onglet Batterie).
  async detect() {
    this.proto = null;
    try {
      await this.readRegs(0x00, 0x3E, 1800);
      this.proto = 'd2';
    } catch (e) {
      this.proto = 'a5';
      const ok = await this._a5Exchange(0x90, 1500).then(() => true, () => false);
      if (!ok) throw new Error('le BMS ne répond ni en Modbus ni en A5');
    }
    return this.proto;
  }

  _send(bytes) {
    return this.t.write(bytes);
  }

  // Une seule requête à la fois : le BMS ne sait pas en traiter plusieurs.
  _exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  readRegs(reg, count, timeout = 2500) {
    return this._exclusive(() => new Promise((resolve, reject) => {
      this.pending = { kind: 'read', reg, count, resolve, reject };
      this.pending.timer = setTimeout(() => { this.pending = null; reject(new Error('pas de réponse du BMS')); }, timeout);
      this._send(d2Read(reg, count));
    }));
  }

  writeReg(reg, value, timeout = 2500) {
    return this._exclusive(() => new Promise((resolve, reject) => {
      this.pending = { kind: 'write', reg, value, resolve, reject };
      this.pending.timer = setTimeout(() => { this.pending = null; reject(new Error("le BMS n'a pas confirmé l'écriture")); }, timeout);
      this._send(d2Write(reg, value));
    }));
  }

  _a5Exchange(cmd, timeout = 1200, data = []) {
    return this._exclusive(() => new Promise((resolve, reject) => {
      this.pending = { kind: 'a5', cmd, resolve, reject };
      this.pending.timer = setTimeout(() => { this.pending = null; reject(new Error('pas de réponse du BMS')); }, timeout);
      this._send(a5Frame(cmd, data));
    }));
  }

  _done(value) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    p.resolve(value);
  }

  _onData(chunk) {
    for (const b of chunk) this.rx.push(b);
    for (let guard = 0; guard < 40 && this.rx.length; guard++) {
      const rx = this.rx;
      if (rx[0] === 0xA5) {
        if (rx.length < 13) return;
        const f = rx.splice(0, 13);
        this._onA5(f);
      } else if (rx[0] === 0xD2) {
        if (rx.length < 3) return;
        const fn = rx[1];
        const total = fn === 0x03 ? 3 + rx[2] + 2 : 8;
        if (rx.length < total) return;
        const f = rx.slice(0, total);
        const crc = modbusCrc(f.slice(0, total - 2));
        if ((f[total - 2] | (f[total - 1] << 8)) !== crc) { rx.shift(); continue; }
        rx.splice(0, total);
        this._onD2(f);
      } else {
        rx.shift();
      }
    }
  }

  _onD2(f) {
    const p = this.pending;
    if (f[1] === 0x03 && p?.kind === 'read') {
      const regs = [];
      for (let i = 0; i < f[2] / 2; i++) regs.push((f[3 + 2 * i] << 8) | f[4 + 2 * i]);
      if (regs.length === p.count) this._done(regs);
    } else if ((f[1] === 0x06 || f[1] === 0x10) && p?.kind === 'write') {
      this._done(true);
    }
  }

  _onA5(f) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum = (sum + f[i]) & 0xFF;
    if (sum !== f[12]) return;
    const cmd = f[2];
    const d = f.slice(4, 12);
    const u16 = (i) => (d[i] << 8) | d[i + 1];
    const st = this.st;
    if (cmd === 0x90) { st.v = u16(0) / 10; st.a = (u16(4) - 30000) / 10; st.soc = u16(6) / 10; }
    else if (cmd === 0x91) { st.cellMax = u16(0); st.cellMaxNo = d[2]; st.cellMin = u16(3); st.cellMinNo = d[5]; }
    else if (cmd === 0x92) { st.tMax = d[0] - 40; st.tMin = d[2] - 40; }
    else if (cmd === 0x93) { st.state = d[0]; st.mosC = !!d[1]; st.mosD = !!d[2]; st.cycles = d[3]; st.cap = ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) / 1000; }
    else if (cmd === 0x94) { st.cellCount = d[0]; st.tempCount = d[1]; st.charger = !!d[2]; st.load = !!d[3]; }
    else if (cmd === 0x95 && d[0] >= 1 && d[0] !== 0xFF) {
      const base = (d[0] - 1) * 3;
      for (let k = 0; k < 3; k++) this.a5cells[base + k] = u16(1 + 2 * k);
    } else if (cmd === 0x96 && d[0] >= 1 && d[0] !== 0xFF) {
      const base = (d[0] - 1) * 7;
      for (let k = 0; k < 7; k++) this.a5temps[base + k] = d[1 + k] - 40;
    } else if (cmd === 0x97) {
      st.balCells = [];
      for (let i = 0; i < 48; i++) st.balCells.push(!!(d[i >> 3] & (1 << (i & 7))));
      st.bal = st.balCells.some(Boolean);
    } else if (cmd === 0x98) {
      st.faults = decodeFaults(Array.from(d.slice(0, 7)));
      st.faultCode = d[7];
    }
    if (this.pending?.kind === 'a5' && this.pending.cmd === cmd) this._done(true);
  }

  // Mesures complètes, dans un format commun aux deux protocoles.
  async poll() {
    if (this.proto === 'd2') {
      const r = await this.readRegs(0x00, 0x3E);
      const cellCount = Math.min(32, r[0x31] || 0);
      const tempCount = Math.min(8, r[0x32] || 0);
      return {
        v: r[0x28] / 10,
        a: (r[0x29] - 30000) / 10,
        soc: r[0x2A] / 10,
        cellMax: r[0x2B], cellMin: r[0x2C],
        tMax: r[0x2D] - 40, tMin: r[0x2E] - 40,
        state: r[0x2F],
        cap: r[0x30] / 10,
        cellCount, tempCount,
        cycles: r[0x33],
        bal: r[0x34] !== 0,
        mosC: r[0x35] !== 0, mosD: r[0x36] !== 0,
        avg: r[0x37], diff: r[0x38], power: r[0x39],
        cells: r.slice(0, cellCount),
        temps: r.slice(0x20, 0x20 + (tempCount || 8)).map((x) => x - 40).filter((t) => t > -40 && t < 120),
        faults: decodeFaults([r[0x3A] & 0xFF, r[0x3A] >> 8, r[0x3B] & 0xFF, r[0x3B] >> 8, r[0x3C] & 0xFF, r[0x3C] >> 8]),
      };
    }
    for (const c of [0x90, 0x91, 0x92, 0x93, 0x94, 0x98]) await this._a5Exchange(c).catch(() => {});
    // Les tensions de cellules arrivent en plusieurs trames pour une seule requête.
    await this._a5Exchange(0x95).catch(() => {});
    await new Promise((r) => setTimeout(r, 250));
    await this._a5Exchange(0x96).catch(() => {});
    await this._a5Exchange(0x97).catch(() => {});
    const st = this.st;
    const n = st.cellCount || this.a5cells.filter(Boolean).length;
    const cells = this.a5cells.slice(0, n).map((x) => x || 0);
    const temps = this.a5temps.slice(0, st.tempCount || this.a5temps.length).filter((t) => t != null && t > -40);
    const valid = cells.filter((x) => x > 0);
    return {
      ...st,
      cells, temps, cellCount: n,
      diff: valid.length ? Math.max(...valid) - Math.min(...valid) : null,
      avg: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
      power: st.v != null && st.a != null ? Math.abs(st.v * st.a) : null,
      faults: st.faults || [],
    };
  }

  // Réglages (Modbus) : valeurs brutes et converties.
  async readSettings() {
    if (this.proto !== 'd2') throw new Error('réglages non disponibles avec ce BMS (ancien protocole)');
    const raw = await this.readRegs(0x80, 0x29); // 0x80 à 0xA8
    const out = {};
    for (const [reg, key, , , , conv] of settingList()) out[key] = { raw: raw[reg - 0x80], value: regToValue(conv, raw[reg - 0x80]) };
    return out;
  }

  async readInfo() {
    if (this.proto !== 'd2') return {};
    const r = await this.readRegs(0xA9, 0x25); // 0xA9 à 0xCD
    const at = (reg, n) => r.slice(reg - 0xA9, reg - 0xA9 + n);
    const date = at(0xCC, 2);
    const yy = date[0] >> 8;
    const mm = date[0] & 0xFF;
    const dd = date[1] >> 8;
    return {
      software: ascii(at(0xA9, 8)),
      hardware: ascii(at(0xB1, 8)),
      code: ascii(at(0xB9, 16)),
      password: ascii(at(0xC9, 3)),
      date: yy || mm ? '20' + String(yy).padStart(2, '0') + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0') : '',
    };
  }

  // Commandes
  async setMos(which, on) {
    if (this.proto === 'd2') return this.writeReg(which === 'charge' ? 0xA5 : 0xA6, on ? 1 : 0);
    // Les anciens BMS ne confirment pas toujours : l'état réel se relit au tour de mesure suivant.
    return this._a5Exchange(which === 'charge' ? 0xDA : 0xD9, 1500, [on ? 1 : 0]).catch(() => true);
  }

  async setSoc(percent) {
    const v = Math.max(0, Math.min(1000, Math.round(percent * 10)));
    if (this.proto === 'd2') return this.writeReg(0xA7, v);
    const data = [0, 0, 0, 0, 0, 0, v >> 8, v & 0xFF];
    return this._a5Exchange(0x21, 1500, data).catch(() => true);
  }

  restart() { return this.writeReg(0xF0, 1); }
  zeroCurrent() { return this.writeReg(0xF2, 1); }
}

// ---------------------------------------------------------------- transports

function withTimeout(promise, ms, msg) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

export class BleBms {
  constructor() {
    this.name = 'BMS';
    this.onData = () => {};
    this.onClose = () => {};
    this.device = null;
    this.w = null;
    this.wq = Promise.resolve();
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async open(device = null) {
    this.device = device || await navigator.bluetooth.requestDevice({
      filters: [{ services: [0xfff0] }, { namePrefix: 'DL' }, { namePrefix: 'BMS' }, { namePrefix: 'DALY' }],
      optionalServices: [SVC],
    });
    this.name = this.device.name || 'BMS';
    this.device.addEventListener('gattserverdisconnected', () => this.onClose());
    try { localStorage.setItem(LAST_KEY, this.device.id); } catch (e) { /* stockage bloqué */ }
    await this.reconnect();
  }

  get canReconnect() { return !!this.device; }

  async reconnect() {
    const server = await withTimeout(this.device.gatt.connect(), 10000, 'BMS injoignable');
    const svc = await server.getPrimaryService(SVC);
    const n = await svc.getCharacteristic(CH_NOTIFY);
    this.w = await svc.getCharacteristic(CH_WRITE);
    if (this.n !== n) {
      n.addEventListener('characteristicvaluechanged', (ev) => {
        const v = ev.target.value;
        this.onData(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      this.n = n;
    }
    await n.startNotifications();
  }

  write(bytes) {
    this.wq = this.wq.then(async () => {
      if (!this.w) return;
      if (this.w.writeValueWithoutResponse) await this.w.writeValueWithoutResponse(bytes);
      else await this.w.writeValue(bytes);
    }).catch((e) => console.warn('BMS write', e));
    return this.wq;
  }

  async close() {
    const d = this.device;
    this.device = null;
    if (d?.gatt?.connected) d.gatt.disconnect();
  }

  static async lastDevice() {
    try {
      const id = localStorage.getItem(LAST_KEY);
      if (!id || !navigator.bluetooth?.getDevices) return null;
      return (await navigator.bluetooth.getDevices()).find((d) => d.id === id) || null;
    } catch (e) {
      return null;
    }
  }
}

// BMS Modbus simulé (12S Li-ion) pour essayer l'atelier sans batterie.
export class SimBms {
  constructor() {
    this.name = 'BMS simulé';
    this.onData = () => {};
    this.onClose = () => {};
    this.t0 = Date.now();
    this.regs = new Array(0x100).fill(0);
    const set = (reg, v) => { this.regs[reg] = v; };
    const cells = [4012, 4015, 4009, 4018, 4011, 3998, 4013, 4016, 4010, 4014, 4012, 4017];
    cells.forEach((v, i) => set(i, v));
    [26, 27, 25].forEach((t, i) => set(0x20 + i, t + 40));
    set(0x31, 12); set(0x32, 3); set(0x33, 37); set(0x35, 1); set(0x36, 1);
    const s = { 0x80: 300, 0x81: 3700, 0x82: 1, 0x83: 12, 0x86: 3, 0x89: 1, 0x8A: 3600, 0x8B: 4200, 0x8C: 4250, 0x8D: 3100, 0x8E: 2800,
      0x8F: 504, 0x90: 510, 0x91: 372, 0x92: 336, 0x93: 30000 - 200, 0x94: 30000 - 300, 0x95: 30000 + 1200, 0x96: 30000 + 1500,
      0x97: 50 + 40, 0x98: 55 + 40, 0x99: 0 + 40, 0x9A: -5 + 40, 0x9B: 60 + 40, 0x9C: 65 + 40, 0x9D: -10 + 40, 0x9E: -20 + 40,
      0x9F: 200, 0xA0: 300, 0xA1: 10, 0xA2: 15, 0xA3: 3900, 0xA4: 30, 0xA5: 1, 0xA6: 1, 0xA8: 80 + 40 };
    for (const [k, v] of Object.entries(s)) set(Number(k), v);
    const str = (reg, text, n) => { for (let i = 0; i < n; i++) set(reg + i, ((text.charCodeAt(2 * i) || 0) << 8) | (text.charCodeAt(2 * i + 1) || 0)); };
    str(0xA9, '20240512-1.32', 8); str(0xB1, 'DL-H12S-150A', 8); str(0xB9, 'DEMO000123456789', 16); str(0xC9, '123456', 3);
    set(0xCC, (24 << 8) | 5); set(0xCD, 12 << 8);
    this.soc = 78.4;
  }

  static get supported() { return true; }
  get canReconnect() { return true; }
  async open() {}
  async reconnect() {}
  async close() { this.onClose(); }

  _tick() {
    const t = (Date.now() - this.t0) / 1000;
    const a = this.regs[0xA6] ? -(18 + 14 * Math.sin(t / 3)) : 0;
    this.soc = Math.max(0, this.soc + a / 3600 / 30 * 100 * 0.2);
    const r = this.regs;
    for (let i = 0; i < 12; i++) r[i] = Math.round(3600 + this.soc * 6 + [12, 15, 9, 18, 11, -2, 13, 16, 10, 14, 12, 17][i] + a * 0.4);
    const cells = r.slice(0, 12);
    r[0x28] = Math.round(cells.reduce((x, y) => x + y, 0) / 100);
    r[0x29] = 30000 + Math.round(a * 10);
    r[0x2A] = Math.round(this.soc * 10);
    r[0x2B] = Math.max(...cells); r[0x2C] = Math.min(...cells);
    r[0x2D] = 27 + 40; r[0x2E] = 25 + 40;
    r[0x2F] = a < 0 ? 2 : 0;
    r[0x30] = Math.round(this.soc * 3);
    r[0x34] = Math.max(...cells) > r[0xA3] ? 1 : 0;
    r[0x35] = r[0xA5]; r[0x36] = r[0xA6];
    r[0x37] = Math.round(cells.reduce((x, y) => x + y, 0) / 12);
    r[0x38] = Math.max(...cells) - Math.min(...cells);
    r[0x39] = Math.round(Math.abs(a) * r[0x28] / 10);
  }

  write(bytes) {
    const f = Array.from(bytes);
    setTimeout(() => {
      if (f[0] !== 0xD2) return;
      this._tick();
      if (f[1] === 0x03) {
        const reg = (f[2] << 8) | f[3];
        const n = (f[4] << 8) | f[5];
        const out = [0xD2, 0x03, n * 2];
        for (let i = 0; i < n; i++) out.push(this.regs[reg + i] >> 8, this.regs[reg + i] & 0xFF);
        const c = modbusCrc(out);
        const frame = Uint8Array.from([...out, c & 0xFF, c >> 8]);
        for (let i = 0; i < frame.length; i += 20) this.onData(frame.subarray(i, i + 20));
      } else if (f[1] === 0x06) {
        const reg = (f[2] << 8) | f[3];
        const v = (f[4] << 8) | f[5];
        if (reg === 0xA7) this.soc = v / 10; else this.regs[reg] = v;
        this.onData(Uint8Array.from(f));
      }
    }, 30);
    return Promise.resolve();
  }
}
