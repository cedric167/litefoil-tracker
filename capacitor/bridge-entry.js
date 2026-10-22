/*
 * Pont Web Bluetooth -> Bluetooth natif (Capacitor @capacitor-community/bluetooth-le).
 * Objectif : le code existant qui utilise navigator.bluetooth.* continue de marcher
 * TEL QUEL sur iOS et Android natif (où Web Bluetooth n'existe pas / n'est pas idéal).
 *
 * Ce fichier est bundlé par esbuild en www/ble-bridge.js (IIFE) et chargé en tout
 * premier dans <head>. Il ne s'active QUE sur app native ; sur le web normal il ne
 * touche à rien (navigator.bluetooth du navigateur reste utilisé).
 */
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

const Cap = window.Capacitor;
const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

if (isNative && !window.__LF_NATIVE_BLE__) {
  window.__LF_NATIVE_BLE__ = true;

  // --- utilitaires UUID / données ---
  const norm = (u) => {
    if (typeof u === 'number') return numberToUUID(u);
    if (typeof u === 'string') {
      const s = u.toLowerCase();
      if (/^0x[0-9a-f]+$/.test(s)) return numberToUUID(parseInt(s, 16));
      if (/^[0-9a-f]{4}$/.test(s)) return numberToUUID(parseInt(s, 16));
      if (/^[0-9a-f]{8}$/.test(s)) return numberToUUID(parseInt(s, 16));
      return s;
    }
    return u;
  };
  const toDataView = (val) => {
    if (val instanceof DataView) return val;
    if (val instanceof ArrayBuffer) return new DataView(val);
    if (ArrayBuffer.isView(val)) return new DataView(val.buffer, val.byteOffset, val.byteLength);
    if (Array.isArray(val)) return new DataView(new Uint8Array(val).buffer);
    return new DataView(new ArrayBuffer(0));
  };

  // --- Caractéristique (façade Web Bluetooth) ---
  class LFCharacteristic extends EventTarget {
    constructor(device, serviceUuid, charUuid) {
      super();
      this._dev = device;
      this._svc = serviceUuid;
      this.uuid = charUuid;
      this.value = null;
      this._notifying = false;
    }
    get service() { return { uuid: this._svc, device: this._dev }; }

    async readValue() {
      const dv = await BleClient.read(this._dev.id, this._svc, this.uuid);
      this.value = dv;
      return dv;
    }
    async writeValue(data) {
      await BleClient.write(this._dev.id, this._svc, this.uuid, toDataView(data));
    }
    async writeValueWithResponse(data) {
      await BleClient.write(this._dev.id, this._svc, this.uuid, toDataView(data));
    }
    async writeValueWithoutResponse(data) {
      await BleClient.writeWithoutResponse(this._dev.id, this._svc, this.uuid, toDataView(data));
    }
    async startNotifications() {
      if (!this._notifying) {
        await BleClient.startNotifications(this._dev.id, this._svc, this.uuid, (dv) => {
          this.value = dv;
          // L'event Web Bluetooth : event.target.value == DataView
          this.dispatchEvent(new Event('characteristicvaluechanged'));
          if (typeof this.oncharacteristicvaluechanged === 'function') {
            try { this.oncharacteristicvaluechanged({ target: this }); } catch (e) {}
          }
        });
        this._notifying = true;
      }
      return this;
    }
    async stopNotifications() {
      if (this._notifying) {
        try { await BleClient.stopNotifications(this._dev.id, this._svc, this.uuid); } catch (e) {}
        this._notifying = false;
      }
      return this;
    }
  }

  // --- Service ---
  class LFService {
    constructor(device, uuid) { this._dev = device; this.uuid = uuid; this.device = device; }
    async getCharacteristic(uuid) { return new LFCharacteristic(this._dev, this.uuid, norm(uuid)); }
    async getCharacteristics() {
      const svcs = await BleClient.getServices(this._dev.id);
      const s = svcs.find((x) => x.uuid === this.uuid);
      return (s ? s.characteristics : []).map((c) => new LFCharacteristic(this._dev, this.uuid, c.uuid));
    }
  }

  // --- Serveur GATT ---
  class LFGatt {
    constructor(device) { this.device = device; this.connected = false; }
    async connect() {
      await BleClient.connect(this.device.id, () => {
        this.connected = false;
        this.device.dispatchEvent(new Event('gattserverdisconnected'));
      });
      this.connected = true;
      return this;
    }
    async disconnect() {
      try { await BleClient.disconnect(this.device.id); } catch (e) {}
      this.connected = false;
    }
    async getPrimaryService(uuid) { return new LFService(this.device, norm(uuid)); }
    async getPrimaryServices() {
      const svcs = await BleClient.getServices(this.device.id);
      return svcs.map((s) => new LFService(this.device, s.uuid));
    }
  }

  // --- Device ---
  class LFDevice extends EventTarget {
    constructor(id, name) {
      super();
      this.id = id;
      this.name = name || '';
      this.gatt = new LFGatt(this);
    }
  }

  // --- navigator.bluetooth.requestDevice ---
  async function requestDevice(options = {}) {
    await BleClient.initialize({ androidNeverForLocation: true });
    const opt = {};
    const optional = new Set((options.optionalServices || []).map(norm));
    const services = new Set();
    if (Array.isArray(options.filters)) {
      for (const f of options.filters) {
        if (f.services) f.services.forEach((s) => { services.add(norm(s)); optional.add(norm(s)); });
        if (f.namePrefix) opt.namePrefix = f.namePrefix;
        if (f.name) opt.name = f.name;
      }
    }
    if (services.size) opt.services = [...services];
    if (optional.size) opt.optionalServices = [...optional];
    const d = await BleClient.requestDevice(opt);
    return new LFDevice(d.deviceId, d.name);
  }

  if (!navigator.bluetooth) navigator.bluetooth = {};
  navigator.bluetooth.requestDevice = requestDevice;
  navigator.bluetooth.getAvailability = async () => true;

  console.log('[Lite Foil] Pont Bluetooth natif actif.');
}
