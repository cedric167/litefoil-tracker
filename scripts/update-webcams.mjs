// Lite Foil — met à jour webcams/index.json (identifiants des directs YouTube des webcams du littoral).
// Lancé chaque jour sur le PC de Cédric par la tâche planifiée Windows « LiteFoil webcams » (scripts/update-webcams.cmd).
// YouTube bloque cette lecture depuis les serveurs de GitHub (demande de connexion) : le workflow
// .github/workflows/webcams.yml ne sert plus qu'à un essai manuel. À la main : node scripts/update-webcams.mjs
//
// Pour chaque caméra :
//   1) si son direct actuel tourne toujours, on ne touche à rien ;
//   2) sinon on cherche, sur la chaîne YouTube de la caméra (champ « ch »), un direct en cours dont le titre contient
//      tous les mots du champ « match », et on remplace l'identifiant.
// Prudence : on ne remplace jamais par une vidéo qui n'est pas en direct, et on ne supprime aucune caméra.
// Si YouTube ne répond pas comme prévu, le fichier reste tel quel.
import fs from "node:fs";

const FILE = new URL("../webcams/index.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept-Language": "fr-FR,fr;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function get(url) {
  for (let k = 0; k < 2; k++) {
    try { const r = await fetch(url, { headers: UA, redirect: "follow" }); if (r.ok) return await r.text(); } catch (e) { /* on réessaie une fois */ }
    await sleep(1500);
  }
  return "";
}
// true = en direct, false = plus en direct, null = impossible à savoir (page inattendue)
async function isLive(id) {
  const h = await get("https://www.youtube.com/watch?v=" + encodeURIComponent(id));
  if (!h || !/ytInitialPlayerResponse/.test(h)) return null;
  if (/"isLiveNow":true/.test(h)) return true;
  // YouTube demande parfois de se connecter (serveurs, robots) : on ne sait alors rien, et on ne touche à rien
  if (/"playabilityStatus":\{"status":"LOGIN_REQUIRED"/.test(h)) return null;
  if (/"isLiveNow":false/.test(h) || /"playabilityStatus":\{"status":"(ERROR|UNPLAYABLE)"/.test(h) || /"isLiveContent":false/.test(h)) return false;
  return null;
}
// vidéos (id, titre) listées dans une page de chaîne (onglet Directs ou recherche dans la chaîne)
function videosOf(html) {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); if (!m) return [];
  let d; try { d = JSON.parse(m[1]); } catch (e) { return []; }
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.lockupViewModel) { const v = o.lockupViewModel, t = v.metadata?.lockupMetadataViewModel?.title?.content || ""; if (v.contentId) out.push({ id: v.contentId, t }); return; }
    if (o.videoRenderer) { const v = o.videoRenderer, t = v.title?.simpleText || (v.title?.runs || []).map((x) => x.text).join("") || ""; if (v.videoId) out.push({ id: v.videoId, t }); return; }
    for (const k in o) walk(o[k]);
  })(d);
  return out;
}
const pages = new Map();
async function page(url) { if (!pages.has(url)) { pages.set(url, videosOf(await get(url))); await sleep(700); } return pages.get(url); }

const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
let changed = 0, kept = 0, lost = 0, unknown = 0;
for (const c of data.cams) {
  const live = await isLive(c.id); await sleep(500);
  if (live === true) { kept++; continue; }
  if (live === null) { unknown++; console.log("?  ", c.place, "–", c.view, ": état inconnu, inchangé"); continue; }
  const want = (c.match || []).map(norm).filter(Boolean);
  if (!c.ch || !want.length) { lost++; console.log("!  ", c.place, "–", c.view, ": plus en direct, pas de chaîne ou de mots-clés pour chercher"); continue; }
  const base = c.ch.replace(/\/+$/, "");
  const cands = [...(await page(base + "/streams")), ...(await page(base + "/search?query=" + encodeURIComponent(c.match.join(" "))))];
  const seen = new Set(); let found = null;
  for (const v of cands) {
    if (seen.has(v.id) || v.id === c.id) continue; seen.add(v.id);
    const t = " " + norm(v.t) + " ";
    if (!want.every((w) => t.includes(" " + w + " ") || t.includes(w))) continue;
    if ((await isLive(v.id)) === true) { found = v; break; }
    await sleep(400);
  }
  if (found) { console.log("-> ", c.place, "–", c.view, ":", c.id, "=>", found.id, "(" + found.t.slice(0, 60) + ")"); c.id = found.id; changed++; }
  else { lost++; console.log("!  ", c.place, "–", c.view, ": plus en direct, aucun remplaçant trouvé"); }
}
console.log(`\n${kept} en direct, ${changed} mises à jour, ${lost} hors ligne, ${unknown} inconnues (sur ${data.cams.length})`);
if (changed) { data.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(FILE, JSON.stringify(data, null, 1) + "\n"); console.log("webcams/index.json mis à jour"); }
