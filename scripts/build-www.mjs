/*
 * Assemble le dossier www/ servi par l'app native :
 *  1) copie les fichiers du site statique,
 *  2) bundle le pont Bluetooth (capacitor/bridge-entry.js) -> www/ble-bridge.js,
 *  3) injecte <script src="ble-bridge.js"> en tout premier dans <head>.
 * Le site web / la PWA / le TWA Android actuels ne sont PAS modifiés (on ne touche
 * qu'une COPIE dans www/).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

// Dossiers et fichiers du site à embarquer dans l'app
const DIRS = ['bms', 'firmware', 'i18n', 'manuel', 'store', 'vesc'];
const FILES = [
  'index.html', 'sw.js', 'manifest.json', 'confidentialite.html',
  'icon-192.png', 'icon-512.png', 'litefoil-logo.png',
];

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

for (const d of DIRS) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, d), { recursive: true });
}
for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, f));
}

// Bundle du pont Bluetooth
await build({
  entryPoints: [path.join(root, 'capacitor', 'bridge-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2017'],
  outfile: path.join(www, 'ble-bridge.js'),
  logLevel: 'info',
});

// Injection du <script> en premier dans <head>
const idxPath = path.join(www, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
if (!html.includes('ble-bridge.js')) {
  const tag = '\n  <script src="ble-bridge.js"></script>';
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + tag);
  } else {
    html = tag + '\n' + html;
  }
  fs.writeFileSync(idxPath, html);
}

console.log('www/ assemblé :', fs.readdirSync(www).join(', '));
