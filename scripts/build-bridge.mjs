/*
 * Bundle le pont Bluetooth natif (capacitor/bridge-entry.js) -> ble-bridge.js à la
 * racine du SITE. Depuis le 31/10/2026 l'app native (Android et iOS) charge le site
 * en ligne (capacitor.config.json > server.url) au lieu d'une copie embarquée :
 * le pont doit donc être servi par le site. Il ne s'active que dans l'app native.
 * Relancer après toute modification de capacitor/bridge-entry.js, puis commiter.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(root, 'capacitor', 'bridge-entry.js')],
  bundle: true, minify: true, format: 'iife', target: ['es2017'],
  outfile: path.join(root, 'ble-bridge.js'), logLevel: 'info',
});
console.log('ble-bridge.js (racine du site) à jour');
