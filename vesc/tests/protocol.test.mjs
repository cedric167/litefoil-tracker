// Tests du protocole et de la sérialisation : node vesc/tests/protocol.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { packPayload, PacketDecoder, Reader, Writer, crc16 } from '../js/protocol.js';
import { ConfigParams } from '../js/config.js';

const dir = new URL('../config/', import.meta.url);

// CRC16 XModem de référence : "123456789" -> 0x31C3
assert.equal(crc16(new TextEncoder().encode('123456789')), 0x31C3);

// Trames courtes et longues, reçues par fragments de 20 octets.
for (const len of [1, 200, 300, 70000]) {
  const payload = Uint8Array.from({ length: len }, (_, i) => (i * 7) & 0xFF);
  const frame = packPayload(payload);
  const got = [];
  const dec = new PacketDecoder((p) => got.push(p));
  dec.push(Uint8Array.of(0x55, 0x02)); // bruit
  for (let i = 0; i < frame.length; i += 20) dec.push(frame.subarray(i, i + 20));
  assert.equal(got.length, 1, 'len ' + len);
  assert.deepEqual(got[0], payload);
}

// double32Auto : identique au float32 IEEE pour les nombres normaux.
for (const x of [0, 1, -1, 0.5, 3.14159, -1234.5678, 1e-20, 6.02e23, 0.000123]) {
  const b = new Writer().double32Auto(x).toBytes();
  const ieee = new Uint8Array(4);
  new DataView(ieee.buffer).setFloat32(0, x);
  assert.deepEqual(b, ieee, 'double32Auto ' + x);
  assert.equal(new Reader(b).double32Auto(), Math.fround(x));
}

// Signatures et aller-retour de sérialisation pour toutes les versions.
const index = JSON.parse(readFileSync(new URL('index.json', dir)));
let n = 0;
for (const e of index) {
  for (const kind of ['mcconf', 'appconf']) {
    if (!(kind in e)) continue;
    const def = JSON.parse(readFileSync(new URL(e.folder + '_' + kind + '.json', dir)));
    const cfg = new ConfigParams(kind, def, e.folder);
    assert.equal(cfg.computeSignature(), e[kind], e.folder + ' ' + kind + ' signature');
    const bytes = cfg.serialize();
    const cfg2 = new ConfigParams(kind, def, e.folder);
    for (const k of Object.keys(cfg2.params)) cfg2.params[k].value = cfg2.params[k].t === 3 ? '' : 0;
    assert.ok(cfg2.deserialize(bytes));
    assert.deepEqual(cfg2.serialize(), bytes, e.folder + ' ' + kind + ' aller-retour');
    n++;
  }
}

// Import / export XML.
const def = JSON.parse(readFileSync(new URL('6.06_mcconf.json', dir)));
const cfg = new ConfigParams('mcconf', def, '6.06');
assert.ok(cfg.toXml().includes('<l_current_max>'));

console.log('OK :', n, 'définitions vérifiées');
