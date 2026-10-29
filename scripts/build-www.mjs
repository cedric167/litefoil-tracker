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
const DIRS = ['activites', 'bms', 'firmware', 'i18n', 'manuel', 'store', 'vesc'];
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

// Injection du <script src="…ble-bridge.js"> en tout premier dans <head>.
// On le met dans la page principale ET dans les sous-applis Atelier batterie (bms/)
// et Atelier VESC (vesc/), pour qu'elles passent aussi par le Bluetooth natif du
// téléphone (le Web Bluetooth n'existe pas sur iOS). Le chemin relatif dépend de la
// profondeur de la page (racine -> "ble-bridge.js", sous-dossier -> "../ble-bridge.js").
function injectBridge(htmlPath, src) {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes('ble-bridge.js')) return;
  const tag = '\n  <script src="' + src + '"></script>';
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : (tag + '\n' + html);
  fs.writeFileSync(htmlPath, html);
}

injectBridge(path.join(www, 'index.html'), 'ble-bridge.js');
injectBridge(path.join(www, 'bms', 'index.html'), '../ble-bridge.js');
injectBridge(path.join(www, 'vesc', 'index.html'), '../ble-bridge.js');

console.log('www/ assemblé (pont BLE: index + bms + vesc) :', fs.readdirSync(www).join(', '));
