// Protocole de communication VESC : trames, CRC et (dé)sérialisation binaire.
// Port en JavaScript de packet.cpp et vbytearray.cpp de VESC Tool (GPL-3.0).

export const COMM = Object.freeze({
  FW_VERSION: 0,
  JUMP_TO_BOOTLOADER: 1,
  ERASE_NEW_APP: 2,
  WRITE_NEW_APP_DATA: 3,
  GET_VALUES: 4,
  SET_DUTY: 5,
  SET_CURRENT: 6,
  SET_CURRENT_BRAKE: 7,
  SET_RPM: 8,
  SET_POS: 9,
  SET_HANDBRAKE: 10,
  SET_DETECT: 11,
  SET_SERVO_POS: 12,
  SET_MCCONF: 13,
  GET_MCCONF: 14,
  GET_MCCONF_DEFAULT: 15,
  SET_APPCONF: 16,
  GET_APPCONF: 17,
  GET_APPCONF_DEFAULT: 18,
  SAMPLE_PRINT: 19,
  TERMINAL_CMD: 20,
  PRINT: 21,
  ROTOR_POSITION: 22,
  EXPERIMENT_SAMPLE: 23,
  DETECT_MOTOR_PARAM: 24,
  DETECT_MOTOR_R_L: 25,
  DETECT_MOTOR_FLUX_LINKAGE: 26,
  DETECT_ENCODER: 27,
  DETECT_HALL_FOC: 28,
  REBOOT: 29,
  ALIVE: 30,
  GET_DECODED_PPM: 31,
  GET_DECODED_ADC: 32,
  GET_DECODED_CHUK: 33,
  FORWARD_CAN: 34,
  SET_CHUCK_DATA: 35,
  CUSTOM_APP_DATA: 36,
  NRF_START_PAIRING: 37,
  GET_VALUES_SETUP: 47,
  SET_MCCONF_TEMP: 48,
  SET_MCCONF_TEMP_SETUP: 49,
  GET_VALUES_SELECTIVE: 50,
  GET_VALUES_SETUP_SELECTIVE: 51,
  DETECT_MOTOR_FLUX_LINKAGE_OPENLOOP: 57,
  DETECT_APPLY_ALL_FOC: 58,
  JUMP_TO_BOOTLOADER_ALL_CAN: 59,
  ERASE_NEW_APP_ALL_CAN: 60,
  WRITE_NEW_APP_DATA_ALL_CAN: 61,
  PING_CAN: 62,
  APP_DISABLE_OUTPUT: 63,
  TERMINAL_CMD_SYNC: 64,
  GET_IMU_DATA: 65,
  ERASE_BOOTLOADER: 73,
  ERASE_BOOTLOADER_ALL_CAN: 74,
  SET_BATTERY_CUT: 86,
  SET_BLE_NAME: 87,
  SET_BLE_PIN: 88,
  GET_MCCONF_TEMP: 91,
  GET_CUSTOM_CONFIG_XML: 92,
  GET_STATS: 128,
  RESET_STATS: 129,
  LISP_PRINT: 135,
  SET_APPCONF_NO_STORE: 149,
  SHUTDOWN: 156,
  MOTOR_ESTOP: 159,
});

export const FAULTS = [
  'NONE', 'OVER_VOLTAGE', 'UNDER_VOLTAGE', 'DRV', 'ABS_OVER_CURRENT',
  'OVER_TEMP_FET', 'OVER_TEMP_MOTOR', 'GATE_DRIVER_OVER_VOLTAGE',
  'GATE_DRIVER_UNDER_VOLTAGE', 'MCU_UNDER_VOLTAGE', 'BOOTING_FROM_WATCHDOG_RESET',
  'ENCODER_SPI', 'ENCODER_SINCOS_BELOW_MIN_AMPLITUDE',
  'ENCODER_SINCOS_ABOVE_MAX_AMPLITUDE', 'FLASH_CORRUPTION',
  'HIGH_OFFSET_CURRENT_SENSOR_1', 'HIGH_OFFSET_CURRENT_SENSOR_2',
  'HIGH_OFFSET_CURRENT_SENSOR_3', 'UNBALANCED_CURRENTS', 'BRK', 'RESOLVER_LOT',
  'RESOLVER_DOS', 'RESOLVER_LOS', 'FLASH_CORRUPTION_APP_CFG',
  'FLASH_CORRUPTION_MC_CFG', 'ENCODER_NO_MAGNET', 'ENCODER_MAGNET_TOO_STRONG',
  'PHASE_FILTER', 'ENCODER_FAULT', 'LV_OUTPUT_FAULT', 'ENCODER_SLIP', 'OVERSPEED',
  'UNDERSPEED', 'ABS_OVERSPEED',
];

export function faultToStr(code) {
  return code in FAULTS ? 'FAULT_CODE_' + FAULTS[code] : 'Défaut inconnu (' + code + ')';
}

const CRC16_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    t[i] = crc;
  }
  return t;
})();

// CRC16 CCITT (XModem), comme Packet::crc16.
export function crc16(data) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC16_TABLE[((crc >> 8) ^ data[i]) & 0xFF] ^ (crc << 8)) & 0xFFFF;
  }
  return crc;
}

// CRC32C (Castagnoli), comme Utility::crc32c ; sert à la signature des configurations.
export function crc32c(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0x82F63B78 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

// Encapsule une charge utile dans une trame VESC.
export function packPayload(payload) {
  const len = payload.length;
  let header;
  if (len <= 255) {
    header = [2, len];
  } else if (len <= 65535) {
    header = [3, len >> 8, len & 0xFF];
  } else {
    header = [4, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF];
  }
  const crc = crc16(payload);
  const out = new Uint8Array(header.length + len + 3);
  out.set(header, 0);
  out.set(payload, header.length);
  out[header.length + len] = crc >> 8;
  out[header.length + len + 1] = crc & 0xFF;
  out[header.length + len + 2] = 3;
  return out;
}

// Réassemble les trames à partir d'un flux d'octets fragmenté (BLE envoie par blocs de 20 octets).
export class PacketDecoder {
  constructor(onPacket, maxLen = 1 << 20) {
    this.onPacket = onPacket;
    this.maxLen = maxLen;
    this.buf = new Uint8Array(0);
  }

  reset() {
    this.buf = new Uint8Array(0);
  }

  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    for (;;) {
      const res = this._tryDecode();
      if (res === 0) break;
      // res > 0 : trame décodée, res < 0 : octet invalide à sauter.
      this.buf = this.buf.subarray(Math.abs(res));
    }
  }

  _tryDecode() {
    const b = this.buf;
    if (b.length === 0) return 0;
    const start = b[0];
    if (start < 2 || start > 4) return -1;
    const hl = start; // 2, 3 ou 4 octets d'en-tête
    if (b.length < hl) return 0;
    let len = 0;
    for (let i = 1; i < hl; i++) len = (len << 8) | b[i];
    if (len === 0 || len > this.maxLen) return -1;
    if (start === 3 && len < 256) return -1;
    if (start === 4 && len < 65536) return -1;
    const total = hl + len + 3;
    if (b.length < total) return 0;
    if (b[total - 1] !== 3) return -1;
    const payload = b.slice(hl, hl + len);
    const crc = (b[hl + len] << 8) | b[hl + len + 1];
    if (crc16(payload) !== crc) return -1;
    this.onPacket(payload);
    return total;
  }
}

// Lecture séquentielle big-endian, comme VByteArray::vbPopFront*.
export class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }

  get remaining() {
    return this.b.length - this.pos;
  }

  _take(n) {
    if (this.remaining < n) {
      this.pos = this.b.length;
      return -1;
    }
    const p = this.pos;
    this.pos += n;
    return p;
  }

  int8() { const p = this._take(1); return p < 0 ? 0 : this.dv.getInt8(p); }
  uint8() { const p = this._take(1); return p < 0 ? 0 : this.dv.getUint8(p); }
  int16() { const p = this._take(2); return p < 0 ? 0 : this.dv.getInt16(p); }
  uint16() { const p = this._take(2); return p < 0 ? 0 : this.dv.getUint16(p); }
  int32() { const p = this._take(4); return p < 0 ? 0 : this.dv.getInt32(p); }
  uint32() { const p = this._take(4); return p < 0 ? 0 : this.dv.getUint32(p); }
  double16(scale) { return this.int16() / scale; }
  double32(scale) { return this.int32() / scale; }

  double32Auto() {
    const res = this.uint32();
    let e = (res >>> 23) & 0xFF;
    const fr = res & 0x7FFFFF;
    const negative = (res & 0x80000000) !== 0;
    let f = 0;
    if (e !== 0 || fr !== 0) {
      f = fr / (8388608.0 * 2.0) + 0.5;
      e -= 126;
    }
    if (negative) f = -f;
    return Math.fround(f * Math.pow(2, e));
  }

  string() {
    let end = this.pos;
    while (end < this.b.length && this.b[end] !== 0) end++;
    const s = latin1(this.b.subarray(this.pos, end));
    this.pos = Math.min(end + 1, this.b.length);
    return s;
  }

  bytes(n) {
    const p = this._take(n);
    return p < 0 ? new Uint8Array(0) : this.b.slice(p, p + n);
  }

  rest() {
    const r = this.b.slice(this.pos);
    this.pos = this.b.length;
    return r;
  }
}

function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// Arrondi comme Utility::roundDouble (demi vers l'extérieur).
function roundDouble(x) {
  return x < 0 ? Math.ceil(x - 0.5) : Math.floor(x + 0.5);
}

// Écriture séquentielle big-endian, comme VByteArray::vbAppend*.
export class Writer {
  constructor() {
    this.parts = [];
    this.len = 0;
  }

  _num(n, setter) {
    const b = new Uint8Array(n);
    setter(new DataView(b.buffer));
    this.parts.push(b);
    this.len += n;
    return this;
  }

  int8(v) { return this._num(1, (d) => d.setInt8(0, ((v << 24) >> 24))); }
  uint8(v) { return this._num(1, (d) => d.setUint8(0, v & 0xFF)); }
  int16(v) { return this._num(2, (d) => d.setInt16(0, ((v << 16) >> 16))); }
  uint16(v) { return this._num(2, (d) => d.setUint16(0, v & 0xFFFF)); }
  int32(v) { return this._num(4, (d) => d.setInt32(0, v | 0)); }
  uint32(v) { return this._num(4, (d) => d.setUint32(0, v >>> 0)); }
  double16(v, scale) { return this.int16(roundDouble(v * scale)); }
  double32(v, scale) { return this.int32(roundDouble(v * scale)); }

  double32Auto(number) {
    if (Math.abs(number) < 1.5e-38) number = 0.0;
    number = Math.fround(number);
    let e = 0;
    let fr = 0;
    if (number !== 0 && Number.isFinite(number)) {
      e = Math.floor(Math.log2(Math.abs(number))) + 1;
      fr = number / Math.pow(2, e);
      // Corrige les erreurs d'arrondi de log2 pour rester dans [0.5, 1[.
      if (Math.abs(fr) >= 1) { fr /= 2; e += 1; }
      if (Math.abs(fr) < 0.5) { fr *= 2; e -= 1; }
    }
    const frAbs = Math.abs(fr);
    let frS = 0;
    if (frAbs >= 0.5) {
      frS = Math.floor(Math.fround((frAbs - 0.5) * 2.0 * 8388608.0));
      e += 126;
    }
    let res = ((e & 0xFF) << 23) | (frS & 0x7FFFFF);
    if (fr < 0) res |= 0x80000000;
    return this.uint32(res >>> 0);
  }

  string(s) {
    const b = new Uint8Array(s.length + 1);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    this.parts.push(b);
    this.len += b.length;
    return this;
  }

  bytes(arr) {
    const b = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
    this.parts.push(b);
    this.len += b.length;
    return this;
  }

  toBytes() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}
