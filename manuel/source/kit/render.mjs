// usage: node render.mjs in.html out.pdf [preview-prefix]  -> PDF + reports pages whose content overflows
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [inp, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + inp, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const over = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
  const lim = pg.getBoundingClientRect().top + 755 * 96 / 72; let max = 0;
  pg.querySelectorAll('*:not(.footer):not(.footer *)').forEach(e => { const r = e.getBoundingClientRect(); if (r.height) max = Math.max(max, r.bottom); });
  return max > lim ? `page ${i + 1} overflows by ${Math.round((max - lim) * 72 / 96)}pt` : null;
}).filter(Boolean));
await p.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
console.log(over.length ? over.join('\n') : 'no overflow');
await b.close();
