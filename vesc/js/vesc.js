// Commandes VESC (port de commands.cpp de VESC Tool) au-dessus d'un transport.

import { COMM, PacketDecoder, Reader, Writer, packPayload, crc16, faultToStr } from './protocol.js';

// Commandes qui ne doivent jamais être relayées sur le bus CAN.
const NO_FORWARD = new Set([COMM.FORWARD_CAN, COMM.PING_CAN]);

export class Vesc extends EventTarget {
  constructor(transport) {
    super();
    this.transport = transport;
    this.canId = -1; // -1 : VESC local, sinon identifiant CAN cible
    this.pending = new Map();
    this.fw = null;
    this.decoder = new PacketDecoder((p) => this._onPacket(p));
    transport.onData = (d) => this.decoder.push(d);
    transport.onClose = () => this.dispatchEvent(new Event('close'));
  }

  async open() {
    await this.transport.open();
  }

  async close() {
    for (const list of this.pending.values()) {
      for (const p of list) p.reject(new Error('Déconnecté'));
    }
    this.pending.clear();
    await this.transport.close();
  }

  send(payload) {
    let data = payload;
    if (this.canId >= 0 && !NO_FORWARD.has(payload[0])) {
      data = new Uint8Array(payload.length + 2);
      data[0] = COMM.FORWARD_CAN;
      data[1] = this.canId;
      data.set(payload, 2);
    }
    this.dispatchEvent(new CustomEvent('tx', { detail: data }));
    return this.transport.write(packPayload(data));
  }

  // Envoie une commande et attend la réponse portant l'identifiant attendu.
  request(payload, expectId = payload[0], timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      entry.timer = setTimeout(() => {
        const list = this.pending.get(expectId);
        if (list) {
          const i = list.indexOf(entry);
          if (i >= 0) list.splice(i, 1);
        }
        reject(new Error('Délai dépassé (commande ' + expectId + ')'));
      }, timeoutMs);
      if (!this.pending.has(expectId)) this.pending.set(expectId, []);
      this.pending.get(expectId).push(entry);
      this.send(payload);
    });
  }

  _onPacket(payload) {
    const id = payload[0];
    const body = payload.subarray(1);
    this.dispatchEvent(new CustomEvent('rx', { detail: payload }));

    if (id === COMM.PRINT || id === COMM.LISP_PRINT) {
      const txt = new TextDecoder('latin1').decode(body);
      this.dispatchEvent(new CustomEvent('print', { detail: txt }));
      return;
    }

    const list = this.pending.get(id);
    if (list && list.length) {
      const entry = list.shift();
      clearTimeout(entry.timer);
      entry.resolve(new Reader(body));
      return;
    }
    this.dispatchEvent(new CustomEvent('unsolicited', { detail: { id, body } }));
  }

  // --- Informations ---

  async getFwVersion() {
    const r = await this.request(Uint8Array.of(COMM.FW_VERSION));
    const fw = {};
    if (r.remaining >= 2) {
      fw.major = r.int8();
      fw.minor = r.int8();
      fw.hw = r.string();
    }
    if (r.remaining >= 12) fw.uuid = [...r.bytes(12)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (r.remaining >= 1) fw.isPaired = !!r.int8();
    if (r.remaining >= 1) fw.isTestFw = r.int8();
    if (r.remaining >= 1) fw.hwType = r.int8();
    if (r.remaining >= 1) fw.customConfigNum = r.int8();
    if (r.remaining >= 1) fw.hasPhaseFilters = !!r.int8();
    if (r.remaining >= 2) {
      fw.qmlHw = r.int8();
      fw.qmlApp = r.int8();
    }
    if (r.remaining >= 1) fw.nrfFlags = r.uint8();
    if (r.remaining >= 1) fw.fwName = r.string();
    if (r.remaining >= 4) fw.hwConfCrc = r.uint32();
    if (this.canId < 0) this.fw = fw;
    return fw;
  }

  async getValues() {
    const r = await this.request(Uint8Array.of(COMM.GET_VALUES), COMM.GET_VALUES, 1000);
    const v = {};
    v.temp_mos = r.double16(1e1);
    v.temp_motor = r.double16(1e1);
    v.current_motor = r.double32(1e2);
    v.current_in = r.double32(1e2);
    v.id = r.double32(1e2);
    v.iq = r.double32(1e2);
    v.duty_now = r.double16(1e3);
    v.rpm = r.double32(1e0);
    v.v_in = r.double16(1e1);
    v.amp_hours = r.double32(1e4);
    v.amp_hours_charged = r.double32(1e4);
    v.watt_hours = r.double32(1e4);
    v.watt_hours_charged = r.double32(1e4);
    v.tachometer = r.int32();
    v.tachometer_abs = r.int32();
    v.fault_code = r.int8();
    v.fault_str = faultToStr(v.fault_code);
    v.position = r.remaining >= 4 ? r.double32(1e6) : -1;
    v.vesc_id = r.remaining >= 1 ? r.uint8() : 255;
    if (r.remaining >= 6) {
      v.temp_mos_1 = r.double16(1e1);
      v.temp_mos_2 = r.double16(1e1);
      v.temp_mos_3 = r.double16(1e1);
    }
    if (r.remaining >= 8) {
      v.vd = r.double32(1e3);
      v.vq = r.double32(1e3);
    }
    if (r.remaining >= 1) {
      const st = r.uint8();
      v.has_timeout = !!(st & 1);
      v.kill_sw_active = !!((st >> 1) & 1);
    }
    return v;
  }

  async getValuesSetup() {
    const r = await this.request(Uint8Array.of(COMM.GET_VALUES_SETUP), COMM.GET_VALUES_SETUP, 1000);
    const v = {};
    v.temp_mos = r.double16(1e1);
    v.temp_motor = r.double16(1e1);
    v.current_motor = r.double32(1e2);
    v.current_in = r.double32(1e2);
    v.duty_now = r.double16(1e3);
    v.rpm = r.double32(1e0);
    v.speed = r.double32(1e3);
    v.v_in = r.double16(1e1);
    v.battery_level = r.double16(1e3);
    v.amp_hours = r.double32(1e4);
    v.amp_hours_charged = r.double32(1e4);
    v.watt_hours = r.double32(1e4);
    v.watt_hours_charged = r.double32(1e4);
    v.tachometer = r.double32(1e3);
    v.tachometer_abs = r.double32(1e3);
    v.position = r.double32(1e6);
    v.fault_code = r.int8();
    v.fault_str = faultToStr(v.fault_code);
    v.vesc_id = r.uint8();
    v.num_vescs = r.uint8();
    v.battery_wh = r.double32(1e3);
    v.odometer = r.uint32();
    v.uptime_ms = r.uint32();
    return v;
  }

  async getImuData() {
    const w = new Writer().uint8(COMM.GET_IMU_DATA).uint16(0xFFFF);
    const r = await this.request(w.toBytes(), COMM.GET_IMU_DATA, 1000);
    const mask = r.uint16();
    const v = {};
    const names = ['roll', 'pitch', 'yaw', 'accX', 'accY', 'accZ', 'gyroX', 'gyroY', 'gyroZ',
      'magX', 'magY', 'magZ', 'q0', 'q1', 'q2', 'q3'];
    names.forEach((n, i) => {
      if (mask & (1 << i)) v[n] = r.double32Auto();
    });
    return v;
  }

  async getDecodedPpm() {
    const r = await this.request(Uint8Array.of(COMM.GET_DECODED_PPM), COMM.GET_DECODED_PPM, 1000);
    return { value: r.double32(1e6), lastLen: r.double32(1e6) };
  }

  async getDecodedAdc() {
    const r = await this.request(Uint8Array.of(COMM.GET_DECODED_ADC), COMM.GET_DECODED_ADC, 1000);
    return { adc: r.double32(1e6), voltage: r.double32(1e6), adc2: r.double32(1e6), voltage2: r.double32(1e6) };
  }

  async pingCan() {
    const r = await this.request(Uint8Array.of(COMM.PING_CAN), COMM.PING_CAN, 5000);
    const devs = [];
    while (r.remaining > 0) devs.push(r.uint8());
    return devs;
  }

  // --- Configuration ---

  async getConfigBytes(kind, defaults = false) {
    const id = kind === 'mcconf'
      ? (defaults ? COMM.GET_MCCONF_DEFAULT : COMM.GET_MCCONF)
      : (defaults ? COMM.GET_APPCONF_DEFAULT : COMM.GET_APPCONF);
    const r = await this.request(Uint8Array.of(id), id, 4000);
    return r.rest();
  }

  async setConfig(config) {
    const id = config.kind === 'mcconf' ? COMM.SET_MCCONF : COMM.SET_APPCONF;
    const body = config.serialize();
    const payload = new Uint8Array(body.length + 1);
    payload[0] = id;
    payload.set(body, 1);
    await this.request(payload, id, 5000);
  }

  // --- Contrôle moteur (doit être répété, le VESC coupe après son délai d'expiration) ---

  setDuty(d) { return this.send(new Writer().uint8(COMM.SET_DUTY).double32(d, 1e5).toBytes()); }
  setCurrent(a) { return this.send(new Writer().uint8(COMM.SET_CURRENT).double32(a, 1e3).toBytes()); }
  setCurrentBrake(a) { return this.send(new Writer().uint8(COMM.SET_CURRENT_BRAKE).double32(a, 1e3).toBytes()); }
  setRpm(rpm) { return this.send(new Writer().uint8(COMM.SET_RPM).int32(Math.round(rpm)).toBytes()); }
  setPos(deg) { return this.send(new Writer().uint8(COMM.SET_POS).double32(deg, 1e6).toBytes()); }
  setHandbrake(a) { return this.send(new Writer().uint8(COMM.SET_HANDBRAKE).double32(a, 1e3).toBytes()); }
  sendAlive() { return this.send(Uint8Array.of(COMM.ALIVE)); }
  stop() { return this.setCurrent(0); }

  // --- Terminal et système ---

  sendTerminal(cmd) {
    const w = new Writer().uint8(COMM.TERMINAL_CMD);
    for (let i = 0; i < cmd.length; i++) w.uint8(cmd.charCodeAt(i));
    return this.send(w.toBytes());
  }

  reboot() { return this.send(Uint8Array.of(COMM.REBOOT)); }

  // --- Détection moteur ---

  async detectAllFoc({ detectCan, maxPowerLoss, minCurrentIn, maxCurrentIn, openloopRpm, slErpm }) {
    const w = new Writer()
      .uint8(COMM.DETECT_APPLY_ALL_FOC)
      .int8(detectCan ? 1 : 0)
      .double32(maxPowerLoss, 1e3)
      .double32(minCurrentIn, 1e3)
      .double32(maxCurrentIn, 1e3)
      .double32(openloopRpm, 1e3)
      .double32(slErpm, 1e3);
    const r = await this.request(w.toBytes(), COMM.DETECT_APPLY_ALL_FOC, 180000);
    return r.int16();
  }

  async detectRL() {
    const r = await this.request(Uint8Array.of(COMM.DETECT_MOTOR_R_L), COMM.DETECT_MOTOR_R_L, 30000);
    const res = { r: r.double32(1e6), l: r.double32(1e3) };
    res.ldLqDiff = r.remaining >= 4 ? r.double32(1e3) : 0;
    return res;
  }

  async detectFluxOpenloop(current, erpmPerSec, duty, resistance, inductance) {
    const w = new Writer()
      .uint8(COMM.DETECT_MOTOR_FLUX_LINKAGE_OPENLOOP)
      .double32(current, 1e3)
      .double32(erpmPerSec, 1e3)
      .double32(duty, 1e3)
      .double32(resistance, 1e6)
      .double32(inductance, 1e8);
    const r = await this.request(w.toBytes(), COMM.DETECT_MOTOR_FLUX_LINKAGE_OPENLOOP, 60000);
    const res = { linkage: r.double32(1e7) };
    if (r.remaining >= 9) {
      res.encOffset = r.double32(1e6);
      res.encRatio = r.double32(1e6);
      res.encInverted = r.int8();
    }
    return res;
  }

  async detectHallFoc(current) {
    const w = new Writer().uint8(COMM.DETECT_HALL_FOC).double32(current, 1e3);
    const r = await this.request(w.toBytes(), COMM.DETECT_HALL_FOC, 60000);
    const table = [];
    for (let i = 0; i < 8; i++) table.push(r.uint8());
    return { table, res: r.uint8() };
  }

  // --- Mise à jour du firmware (port de VescInterface::fwUpload, sans compression) ---

  async uploadFirmware(fwBytes, { allCan = false, onProgress = () => {}, isCancelled = () => false } = {}) {
    let fw = removeFirmwareHeader(fwBytes);
    if (fw.compressed) {
      throw new Error('Fichier compressé (heatshrink) : non pris en charge ici, utilise VESC Tool.');
    }
    fw = fw.data;
    if (fw.length > 393208) {
      throw new Error('Firmware trop gros pour un envoi non compressé (' + fw.length + ' octets). Utilise VESC Tool.');
    }

    onProgress('Effacement de la mémoire tampon…', 0);
    const er = await this.request(
      new Writer().uint8(allCan ? COMM.ERASE_NEW_APP_ALL_CAN : COMM.ERASE_NEW_APP).uint32(fw.length).toBytes(),
      allCan ? COMM.ERASE_NEW_APP_ALL_CAN : COMM.ERASE_NEW_APP, 20000);
    if (!er.uint8()) throw new Error("L'effacement a échoué");

    // En-tête : taille + CRC16 du firmware, comme VESC Tool.
    const crc = crc16(fw);
    const data = new Uint8Array(fw.length + 6);
    new DataView(data.buffer).setUint32(0, fw.length);
    new DataView(data.buffer).setUint16(4, crc);
    data.set(fw, 6);

    const writeId = allCan ? COMM.WRITE_NEW_APP_DATA_ALL_CAN : COMM.WRITE_NEW_APP_DATA;
    const chunkSize = 384;
    for (let addr = 0; addr < data.length; addr += chunkSize) {
      if (isCancelled()) throw new Error('Envoi annulé');
      const chunk = data.subarray(addr, Math.min(addr + chunkSize, data.length));
      if (chunk.every((b) => b === 0xFF)) continue;
      const payload = new Writer().uint8(writeId).uint32(addr).bytes(chunk).toBytes();
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const r = await this.request(payload, writeId, 3000);
          if (!r.int8()) throw new Error("Échec d'écriture à l'adresse " + addr);
          ok = true;
        } catch (e) {
          if (!String(e.message).startsWith('Délai')) throw e;
        }
      }
      if (!ok) throw new Error("Délai dépassé pendant l'envoi du firmware");
      onProgress('Envoi du firmware…', Math.min(1, (addr + chunk.length) / data.length));
    }

    onProgress('Redémarrage sur le nouveau firmware…', 1);
    await this.send(Uint8Array.of(allCan ? COMM.JUMP_TO_BOOTLOADER_ALL_CAN : COMM.JUMP_TO_BOOTLOADER));
  }
}

// Comme Utility::removeFirmwareHeader : retire l'en-tête taille + CRC s'il est présent et valide.
export function removeFirmwareHeader(bytes) {
  if (bytes.length <= 6) return { data: bytes, compressed: false };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = dv.getUint32(0);
  const crc = dv.getUint16(4);
  const body = bytes.subarray(6);
  if (crc16(body) === crc) {
    return { data: body, compressed: (size >>> 24) === 0xCC };
  }
  return { data: bytes, compressed: false };
}
