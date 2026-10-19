// Tests du protocole Daly : node bms/tests/daly.test.mjs
import assert from 'node:assert/strict';
import { d2Read, d2Write, modbusCrc, a5Frame, decodeFaults, regToValue, valueToReg, DalyBms } from '../js/daly.js';

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

// Exemples du document Daly « dalyModbusProtocol.xlsx »
assert.equal(hex(d2Read(0x0C, 1)), 'd2 03 00 0c 00 01 57 aa');
assert.equal(hex(d2Write(0x0C, 1)), 'd2 06 00 0c 00 01 9b aa');
const multi = [0xD2, 0x10, 0x00, 0x0C, 0x00, 0x02, 0x00, 0x01, 0x00, 0x02];
const c = modbusCrc(multi);
assert.equal(hex([c & 0xFF, c >> 8]), '7d 65');

// Trame A5 : somme de contrôle sur un octet
const f = a5Frame(0x90);
assert.equal(f.length, 13);
assert.equal(f[12], (0xA5 + 0x80 + 0x90 + 0x08) & 0xFF);

// Conversions
assert.equal(regToValue('da', 30000 + 1500), 150);
assert.equal(valueToReg('da', 150, 30000 + 1200), 31500);
assert.equal(valueToReg('da', 20, 30000 - 300), 29800);
assert.equal(regToValue('t40', 90), 50);
assert.equal(valueToReg('mv', 4.25, 0), 4250);

// Défauts : niveau 2 = protection
const faults = decodeFaults([0b00000010, 0, 0, 0, 0, 0]);
assert.equal(faults.length, 1);
assert.ok(faults[0].severe);

// Décodage A5 (trame de test du projet acpiccolo/Daly-BMS, commande 0x90)
const bms = new DalyBms({ onData: null, onClose: null, write() {} });
bms._onData(Uint8Array.from([0xA5, 0x40, 0x90, 0x08, 0x02, 0x1F, 0x00, 0x00, 0x75, 0x49, 0x02, 0xF3, 0x51]));
assert.equal(bms.st.v, 54.3);
assert.equal(bms.st.soc, 75.5);

// Trame Modbus reçue en morceaux
const got = [];
bms.pending = { kind: 'read', count: 2, resolve: (r) => got.push(r), timer: null };
const resp = [0xD2, 0x03, 0x04, 0x0F, 0xA0, 0x0F, 0xA5];
const rc = modbusCrc(resp);
const frame = [...resp, rc & 0xFF, rc >> 8];
bms._onData(Uint8Array.from(frame.slice(0, 5)));
bms._onData(Uint8Array.from(frame.slice(5)));
assert.deepEqual(got[0], [4000, 4005]);

console.log('OK : protocole Daly');
