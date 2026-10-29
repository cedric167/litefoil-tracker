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
import { Geolocation } from '@capacitor/geolocation';

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

  // --- mémoire des appareils déjà appairés (pour getDevices / reconnexion auto) ---
  const DEVS_KEY = '__lf_native_ble_devs';
  const loadDevs = () => { try { return JSON.parse(localStorage.getItem(DEVS_KEY) || '[]') || []; } catch (e) { return []; } };
  const rememberDevice = (id, name) => {
    try { const l = loadDevs().filter((x) => x.id !== id); l.push({ id, name: name || '' });
      localStorage.setItem(DEVS_KEY, JSON.stringify(l.slice(-10))); } catch (e) {}
  };

  // --- navigator.bluetooth.requestDevice ---
  async function requestDevice(options = {}) {
    await BleClient.initialize({ androidNeverForLocation: true });
    const optional = new Set((options.optionalServices || []).map(norm));
    const services = new Set();
    const names = new Set();
    const prefixes = new Set();
    if (Array.isArray(options.filters)) {
      for (const f of options.filters) {
        if (f.services) f.services.forEach((s) => { services.add(norm(s)); optional.add(norm(s)); });
        if (f.name) names.add(f.name);
        if (f.namePrefix) prefixes.add(f.namePrefix);
      }
    }
    // Web Bluetooth : `filters` est un OU d'éléments (chaque élément = ET de ses
    // conditions). Le plugin natif ne sait exprimer qu'UN seul jeu : des services
    // (en OU entre eux) ET un `name` ET un `namePrefix`. On ne pose donc un filtre
    // que lorsqu'il est NON AMBIGU ; dès qu'on a un vrai OU (mélange services +
    // noms/préfixes, ou plusieurs noms/préfixes), on ne filtre pas et on laisse le
    // plugin scanner tous les appareils (l'utilisateur choisit dans la liste), afin
    // de ne JAMAIS exclure un appareil qui aurait matché sur le web (batterie, VESC).
    const opt = {};
    if (services.size && !names.size && !prefixes.size) {
      opt.services = [...services];            // uniquement des services -> OU natif
    } else if (!services.size && names.size === 1 && !prefixes.size) {
      opt.name = [...names][0];                // un seul nom exact (tracker, télécommande)
    } else if (!services.size && !names.size && prefixes.size === 1) {
      opt.namePrefix = [...prefixes][0];       // un seul préfixe
    }
    // sinon : aucun filtre -> scan de tous les appareils (cas OU : batterie, VESC)
    if (optional.size) opt.optionalServices = [...optional];
    const d = await BleClient.requestDevice(opt);
    rememberDevice(d.deviceId, d.name);
    return new LFDevice(d.deviceId, d.name);
  }

  if (!navigator.bluetooth) navigator.bluetooth = {};
  navigator.bluetooth.requestDevice = requestDevice;
  navigator.bluetooth.getAvailability = async () => true;
  // reconnexion auto : renvoie les appareils déjà appairés sur cette app (connexion par id, sans re-scan)
  navigator.bluetooth.getDevices = async () => loadDevs().map((x) => new LFDevice(x.id, x.name));

  console.log('[Lite Foil] Pont Bluetooth natif actif.');
}

/*
 * App native : on masque les textes réservés au web (classe .web-only, ex. « Chrome sur Android »)
 * et on fait passer navigator.geolocation par le plugin natif @capacitor/geolocation.
 * Sans ça, la WebView iOS ajoute sa propre demande « localhost would like to use your
 * current location » après l'autorisation iOS.
 */
if (isNative && !window.__LF_NATIVE_GEO__) {
  window.__LF_NATIVE_GEO__ = true;

  document.documentElement.classList.add('lf-native');
  const css = document.createElement('style');
  css.textContent = '.lf-native .web-only{display:none!important}';
  document.head.appendChild(css);

  // Position native -> objet au format Web (GeolocationPosition)
  const toWebPosition = (p) => ({
    timestamp: p.timestamp,
    coords: {
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      accuracy: p.coords.accuracy,
      altitude: p.coords.altitude ?? null,
      altitudeAccuracy: p.coords.altitudeAccuracy ?? null,
      heading: p.coords.heading ?? null,
      speed: p.coords.speed ?? null,
    },
  });
  // Erreur native -> GeolocationPositionError (1 refus, 2 indisponible, 3 délai dépassé)
  const toWebError = (e) => {
    const message = String((e && e.message) || e || 'Position indisponible');
    const code = /denied|permission|refus/i.test(message) ? 1 : /timeout|time out|délai/i.test(message) ? 3 : 2;
    return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  };
  const toNativeOptions = (o = {}) => ({
    enableHighAccuracy: !!o.enableHighAccuracy,
    timeout: o.timeout,
    maximumAge: o.maximumAge,
  });

  let nextWatchId = 1;
  const watches = new Map(); // id Web (nombre) -> promesse de l'id natif

  const geo = {
    getCurrentPosition(success, error, options) {
      Geolocation.getCurrentPosition(toNativeOptions(options))
        .then((p) => success && success(toWebPosition(p)))
        .catch((e) => error && error(toWebError(e)));
    },
    watchPosition(success, error, options) {
      const id = nextWatchId++;
      watches.set(id, Geolocation.watchPosition(toNativeOptions(options), (p, e) => {
        if (e) { if (error) error(toWebError(e)); return; }
        if (p && success) success(toWebPosition(p));
      }));
      return id;
    },
    clearWatch(id) {
      const pending = watches.get(id);
      if (!pending) return;
      watches.delete(id);
      pending.then((nativeId) => Geolocation.clearWatch({ id: nativeId })).catch(() => {});
    },
  };

  try {
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  } catch (e) {
    // propriété non redéfinissable : on remplace les méthodes de l'objet existant
    Object.assign(navigator.geolocation, geo);
  }

  console.log('[Lite Foil] Position native active.');
}
