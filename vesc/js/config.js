// Paramètres de configuration (mcconf / appconf) : port de configparams.cpp de VESC Tool.

import { Reader, Writer, crc32c } from './protocol.js';

export const T = Object.freeze({ UNDEFINED: 0, DOUBLE: 1, INT: 2, STRING: 3, ENUM: 4, BOOL: 5, BITFIELD: 6 });
export const TX = Object.freeze({
  UNDEFINED: 0, UINT8: 1, INT8: 2, UINT16: 3, INT16: 4, UINT32: 5, INT32: 6,
  DOUBLE16: 7, DOUBLE32: 8, DOUBLE32_AUTO: 9,
});

const CONFIG_BASE = new URL('../config/', import.meta.url);
let indexPromise = null;
const cache = new Map();

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(new URL('index.json', CONFIG_BASE)).then((r) => r.json());
  }
  return indexPromise;
}

async function loadDefinition(folder, kind) {
  const key = folder + '_' + kind;
  if (!cache.has(key)) {
    cache.set(key, fetch(new URL(key + '.json', CONFIG_BASE)).then((r) => {
      if (!r.ok) throw new Error('Définition introuvable : ' + key);
      return r.json();
    }));
  }
  return cache.get(key);
}

// Trouve les définitions qui correspondent à une signature reçue du VESC.
export async function definitionForSignature(kind, signature) {
  const index = await loadIndex();
  const entry = [...index].reverse().find((e) => e[kind] === signature);
  if (!entry) return null;
  const def = await loadDefinition(entry.folder, kind);
  return new ConfigParams(kind, def, entry.folder);
}

// Choisit le dossier de définitions le plus proche d'une version de firmware.
export async function definitionForFw(kind, major, minor) {
  const index = await loadIndex();
  const v = major + minor / 100;
  let best = null;
  for (const e of index) {
    const supported = (e.fw || [e.folder]).map(Number);
    if (supported.some((s) => Math.abs(s - v) < 1e-6)) best = e;
  }
  if (!best) {
    for (const e of index) if (Number(e.folder) <= v + 1e-6) best = e;
  }
  if (!best) return null;
  const def = await loadDefinition(best.folder, kind);
  return new ConfigParams(kind, def, best.folder);
}

export class ConfigParams {
  constructor(kind, def, folder) {
    this.kind = kind;
    this.folder = folder;
    this.signature = def.signature;
    this.ser = def.ser;
    this.groups = def.groups;
    this.params = {};
    for (const [name, p] of Object.entries(def.params)) {
      this.params[name] = { ...p, value: p.v !== undefined ? p.v : (p.t === T.STRING ? '' : 0) };
    }
    this.listeners = new Set();
  }

  get xmlName() {
    return this.kind === 'mcconf' ? 'MCConfiguration' : 'APPConfiguration';
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(name) {
    for (const fn of this.listeners) fn(name);
  }

  has(name) {
    return name in this.params;
  }

  get(name) {
    return this.params[name]?.value;
  }

  set(name, value, silent = false) {
    const p = this.params[name];
    if (!p) return;
    if (p.t === T.STRING) {
      p.value = String(value);
    } else if (p.t === T.DOUBLE) {
      p.value = Number(value);
    } else {
      p.value = Math.trunc(Number(value));
    }
    if (!silent) this._emit(name);
  }

  computeSignature() {
    let s = '';
    for (const name of this.ser) {
      s += name;
      const p = this.params[name];
      if (p) s += String(p.t) + String(p.tx) + (p.e || []).join('');
    }
    return crc32c(new TextEncoder().encode(s));
  }

  serialize() {
    const w = new Writer();
    w.uint32(this.signature);
    for (const name of this.ser) {
      const p = this.params[name];
      if (!p) continue;
      switch (p.t) {
        case T.DOUBLE:
          if (p.tx === TX.DOUBLE16) w.double16(p.value, p.sc ?? 1);
          else if (p.tx === TX.DOUBLE32) w.double32(p.value, p.sc ?? 1);
          else if (p.tx === TX.DOUBLE32_AUTO) w.double32Auto(p.value);
          break;
        case T.INT:
          switch (p.tx) {
            case TX.UINT8: w.uint8(p.value); break;
            case TX.INT8: w.int8(p.value); break;
            case TX.UINT16: w.uint16(p.value); break;
            case TX.INT16: w.int16(p.value); break;
            case TX.UINT32: w.uint32(p.value); break;
            case TX.INT32: w.int32(p.value); break;
            default: break;
          }
          break;
        case T.STRING:
          w.string(p.value);
          break;
        case T.ENUM:
        case T.BOOL:
        case T.BITFIELD:
          w.int8(p.value);
          break;
        default:
          break;
      }
    }
    return w.toBytes();
  }

  // Retourne false si la signature ne correspond pas à ces définitions.
  deserialize(bytes) {
    const r = bytes instanceof Reader ? bytes : new Reader(bytes);
    const sig = r.uint32();
    if (sig !== this.signature) return false;
    for (const name of this.ser) {
      const p = this.params[name];
      if (!p) continue;
      switch (p.t) {
        case T.DOUBLE:
          if (p.tx === TX.DOUBLE16) p.value = r.double16(p.sc ?? 1);
          else if (p.tx === TX.DOUBLE32) p.value = r.double32(p.sc ?? 1);
          else if (p.tx === TX.DOUBLE32_AUTO) p.value = r.double32Auto();
          break;
        case T.INT:
          switch (p.tx) {
            case TX.UINT8: p.value = r.uint8(); break;
            case TX.INT8: p.value = r.int8(); break;
            case TX.UINT16: p.value = r.uint16(); break;
            case TX.INT16: p.value = r.int16(); break;
            case TX.UINT32: p.value = r.uint32(); break;
            case TX.INT32: p.value = r.int32(); break;
            default: break;
          }
          break;
        case T.STRING:
          p.value = r.string();
          break;
        case T.ENUM:
        case T.BITFIELD:
          p.value = r.uint8();
          break;
        case T.BOOL:
          p.value = r.int8() ? 1 : 0;
          break;
        default:
          break;
      }
    }
    this._emit(null);
    return true;
  }

  snapshot() {
    const out = {};
    for (const [k, p] of Object.entries(this.params)) out[k] = p.value;
    return out;
  }

  restore(snap) {
    for (const [k, v] of Object.entries(snap)) if (this.params[k]) this.params[k].value = v;
    this._emit(null);
  }

  // Liste des paramètres qui diffèrent d'un instantané (même tolérance que VESC Tool).
  diff(snap) {
    const res = [];
    for (const [k, p] of Object.entries(this.params)) {
      if (!(k in snap)) continue;
      if (p.t === T.DOUBLE) {
        const eps = p.tx === TX.DOUBLE16 ? 0.01 : 0.0001;
        if (!almostEqual(p.value, snap[k], eps)) res.push(k);
      } else if (p.value !== snap[k]) {
        res.push(k);
      }
    }
    return res;
  }

  // Export XML au format de VESC Tool (« Enregistrer la configuration »).
  toXml() {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let s = '<?xml version="1.0" encoding="UTF-8"?>\n<' + this.xmlName + '>\n';
    s += '    <ConfigVersion>4</ConfigVersion>\n';
    for (const [k, p] of Object.entries(this.params)) {
      if (p.t === T.UNDEFINED) continue;
      const v = p.t === T.DOUBLE ? qtNumber(p.value) : p.value;
      s += '    <' + k + '>' + esc(v) + '</' + k + '>\n';
    }
    s += '</' + this.xmlName + '>\n';
    return s;
  }

  // Import d'un fichier XML de VESC Tool. Retourne le nombre de paramètres appliqués.
  fromXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const root = doc.getElementsByTagName(this.xmlName)[0];
    if (!root) throw new Error('Balise <' + this.xmlName + '> introuvable dans le fichier');
    let n = 0;
    for (const el of root.children) {
      const p = this.params[el.tagName];
      if (!p) continue;
      const txt = el.textContent;
      if (p.t === T.STRING) p.value = txt;
      else if (p.t === T.DOUBLE) p.value = parseFloat(txt) || 0;
      else p.value = parseInt(txt, 10) || 0;
      n++;
    }
    this._emit(null);
    return n;
  }
}

function almostEqual(a, b, eps) {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

// QString::number(double) utilise 6 chiffres significatifs.
function qtNumber(v) {
  if (!Number.isFinite(v)) return '0';
  return String(Number(v.toPrecision(6)));
}

// Valeur affichée dans l'éditeur, comme ParamEditDouble : échelle d'éditeur, ou pourcentage
// de la plus grande borne en valeur absolue.
function pctBase(p) {
  return Math.max(Math.abs(p.max ?? 0), Math.abs(p.min ?? 0)) || 1;
}

export function displayValue(p) {
  if (p.t !== T.DOUBLE) return p.value;
  if (p.pct) return (100 * p.value) / pctBase(p);
  return p.value * (p.es ?? 1);
}

export function fromDisplayValue(p, v) {
  if (p.t !== T.DOUBLE) return v;
  const x = Number(v);
  if (p.pct) return (x * pctBase(p)) / 100;
  return x / (p.es ?? 1);
}

export function displayRange(p) {
  if (p.t !== T.DOUBLE) return [p.min ?? 0, p.max ?? 99];
  if (p.pct) return [(100 * (p.min ?? 0)) / pctBase(p), (100 * (p.max ?? 99)) / pctBase(p)];
  const es = p.es ?? 1;
  return [(p.min ?? 0) * es, (p.max ?? 99) * es];
}
