// Transports : Bluetooth Low Energy (service UART Nordic, comme bleuart.cpp) et USB (Web Serial).

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // écriture vers le VESC
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notifications du VESC
// Modules HM-10 / HMSoft : une seule caractéristique pour lire et écrire.
const HM10_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const HM10_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb';

const LAST_DEVICE_KEY = 'lf-vesc-last-device';

function withTimeout(promise, ms, msg) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

export class BleTransport {
  constructor() {
    this.name = 'Bluetooth';
    this.profile = '';
    this.onData = () => {};
    this.onClose = () => {};
    this.device = null;
    this.rx = null;
    this.queue = Promise.resolve();
    this.chunk = 20; // même taille de bloc que VESC Tool
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async open(device = null) {
    this.device = device || await navigator.bluetooth.requestDevice({
      filters: [{ services: [NUS_SERVICE] }, { services: [HM10_SERVICE] }, { namePrefix: 'VESC' }, { namePrefix: 'HMSoft' }],
      optionalServices: [NUS_SERVICE, HM10_SERVICE],
    });
    this.name = this.device.name || 'VESC';
    this.device.addEventListener('gattserverdisconnected', () => this.onClose());
    try { localStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id: this.device.id, name: this.name })); } catch (e) { /* stockage bloqué */ }
    await this._setup();
  }

  get canReconnect() {
    return !!this.device;
  }

  // Reprend le même module après une coupure, sans repasser par la liste du navigateur.
  async reconnect() {
    await this._setup();
  }

  async _setup() {
    const server = await withTimeout(this.device.gatt.connect(), 10000, 'module injoignable');
    let tx;
    try {
      const service = await server.getPrimaryService(NUS_SERVICE);
      this.rx = await service.getCharacteristic(NUS_RX);
      tx = await service.getCharacteristic(NUS_TX);
      this.profile = 'Nordic UART';
    } catch (e) {
      try {
        const service = await server.getPrimaryService(HM10_SERVICE);
        tx = await service.getCharacteristic(HM10_CHAR);
        this.rx = tx;
        this.profile = 'HM-10';
      } catch (e2) {
        server.disconnect();
        throw new Error('aucun service UART connu sur ce module');
      }
    }
    this.queue = Promise.resolve();
    if (this.tx !== tx) {
      tx.addEventListener('characteristicvaluechanged', (ev) => {
        const v = ev.target.value;
        this.onData(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      this.tx = tx;
    }
    await tx.startNotifications();
  }

  // Dernier module utilisé, s'il est encore autorisé pour cette page (Chrome : navigator.bluetooth.getDevices).
  static async lastDevice() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_DEVICE_KEY) || 'null');
      if (!last || !navigator.bluetooth?.getDevices) return null;
      const devices = await navigator.bluetooth.getDevices();
      return devices.find((d) => d.id === last.id) || null;
    } catch (e) {
      return null;
    }
  }

  write(data) {
    // Les écritures GATT doivent être sérialisées, sinon le navigateur refuse « operation already in progress ».
    this.queue = this.queue.then(async () => {
      for (let i = 0; i < data.length; i += this.chunk) {
        const part = data.subarray(i, i + this.chunk);
        if (this.rx.writeValueWithoutResponse) await this.rx.writeValueWithoutResponse(part);
        else await this.rx.writeValue(part);
      }
    }).catch((e) => console.warn('BLE write', e));
    return this.queue;
  }

  async close() {
    const d = this.device;
    this.device = null; // plus de reconnexion après une déconnexion voulue
    if (d?.gatt?.connected) d.gatt.disconnect();
  }
}

export class SerialTransport {
  constructor() {
    this.name = 'USB';
    this.onData = () => {};
    this.onClose = () => {};
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  async open() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this._loop();
  }

  async _loop() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.onData(value);
      }
    } catch (e) {
      console.warn('Serial read', e);
    }
    this.onClose();
  }

  write(data) {
    return this.writer.write(data);
  }

  async close() {
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port?.close();
    } catch (e) {
      console.warn('Serial close', e);
    }
  }
}
