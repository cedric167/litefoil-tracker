// Lite Foil — cherche sur YouTube des webcams en direct pour une liste de spots du monde entier.
// Usage : node scripts/find-webcams.mjs [fichier de sortie]   (lecture seule : n'écrit pas webcams/index.json)
// Pour chaque spot : recherche YouTube filtrée « en direct », on garde les vidéos dont le titre nomme le lieu
// et ressemble à une webcam, puis on vérifie qu'elles sont bien en direct et lisibles hors de YouTube.
import fs from "node:fs";

const OUT = process.argv[2] || "webcams-found.json";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// [zone, pays, lieu, lat, lon, mots du titre (un seul suffit), recherche (facultatif)]
const SPOTS = [
  // France (complète la liste actuelle)
  ["med","France","Leucate",42.91,3.03,["leucate","la franqui"]],["med","France","Gruissan",43.10,3.10,["gruissan"]],["med","France","Canet-en-Roussillon",42.70,3.03,["canet"]],
  ["med","France","Argelès-sur-Mer",42.55,3.04,["argeles"]],["med","France","Sète",43.40,3.69,["sete"]],["med","France","Palavas-les-Flots",43.53,3.93,["palavas"]],
  ["med","France","La Grande-Motte",43.56,4.08,["grande motte"]],["med","France","Saintes-Maries-de-la-Mer",43.45,4.43,["saintes maries"]],["med","France","Nice",43.69,7.27,["nice"],"Nice promenade des anglais webcam"],
  ["med","France","Saint-Tropez",43.27,6.64,["saint tropez","st tropez"]],["med","France","Antibes",43.58,7.12,["antibes","juan les pins"]],["med","France","Corse",42.0,9.0,["ajaccio","bastia","calvi","porto vecchio","bonifacio","corse"],"Corse webcam live plage"],
  ["med","France","Monaco",43.74,7.42,["monaco","monte carlo"]],
  ["atl","France","Biarritz",43.48,-1.56,["biarritz"]],["atl","France","Hossegor",43.67,-1.44,["hossegor","capbreton","seignosse"]],["atl","France","Lacanau",45.0,-1.2,["lacanau"]],
  ["atl","France","Arcachon",44.66,-1.17,["arcachon","pyla","cap ferret"]],["atl","France","La Rochelle",46.16,-1.15,["la rochelle","ile de re"]],["atl","France","Les Sables-d'Olonne",46.49,-1.79,["sables d olonne"]],
  ["atl","France","La Torche",47.84,-4.35,["la torche","penmarch"]],["atl","France","Quiberon",47.48,-3.12,["quiberon","carnac"]],["atl","France","Saint-Jean-de-Luz",43.39,-1.66,["saint jean de luz","hendaye","anglet"]],
  ["man","France","Wissant",50.88,1.66,["wissant","calais","boulogne","le touquet","berck"],"webcam live plage côte d'opale"],["man","France","Deauville",49.36,0.07,["deauville","cabourg","honfleur"]],
  ["man","France","Étretat",49.71,0.20,["etretat"]],["man","France","Granville",48.84,-1.60,["granville","mont saint michel"]],["man","France","Perros-Guirec",48.81,-3.44,["perros","ploumanach","roscoff"]],
  // Espagne & Portugal
  ["es","Espagne","Tarifa",36.01,-5.60,["tarifa"]],["es","Espagne","Fuerteventura",28.73,-13.87,["fuerteventura","corralejo","sotavento","costa calma"]],["es","Espagne","Lanzarote",29.12,-13.56,["lanzarote","famara","puerto del carmen"]],
  ["es","Espagne","Tenerife",28.05,-16.54,["tenerife","medano","las americas","los cristianos"]],["es","Espagne","Gran Canaria",28.14,-15.43,["gran canaria","las canteras","maspalomas","pozo izquierdo"]],
  ["es","Espagne","Barcelone",41.38,2.19,["barcelona","barceloneta"]],["es","Espagne","Valence",39.47,-0.32,["valencia","malvarrosa"]],["es","Espagne","Majorque",39.57,2.65,["mallorca","palma","alcudia"]],
  ["es","Espagne","Ibiza",38.91,1.43,["ibiza","formentera"]],["es","Espagne","Cadix",36.53,-6.30,["cadiz","conil","el palmar"]],["es","Espagne","Pays basque espagnol",43.32,-1.98,["zarautz","san sebastian","donostia","mundaka","zurriola"]],
  ["es","Espagne","Cantabrie & Asturies",43.46,-3.75,["somo","santander","gijon","salinas","suances"]],["es","Espagne","Galice",43.37,-8.40,["coruna","pantin","razo","vigo"]],["es","Espagne","Costa Brava",42.26,3.18,["roses","escala","sant pere pescador","lloret","tossa"]],
  ["es","Espagne","Costa del Sol",36.72,-4.42,["malaga","marbella","torremolinos","benalmadena","nerja"]],["es","Espagne","Alicante & Costa Blanca",38.34,-0.48,["alicante","benidorm","denia","javea","calpe"]],
  ["es","Portugal","Ericeira",38.96,-9.42,["ericeira","ribeira d ilhas"]],["es","Portugal","Peniche",39.36,-9.38,["peniche","supertubos","baleal"]],["es","Portugal","Nazaré",39.60,-9.07,["nazare"]],
  ["es","Portugal","Cascais & Lisbonne",38.70,-9.42,["cascais","guincho","carcavelos","caparica","lisboa","lisbon"]],["es","Portugal","Algarve",37.02,-8.94,["sagres","lagos","algarve","albufeira","portimao","faro"]],
  ["es","Portugal","Madère & Açores",32.65,-16.91,["madeira","funchal","azores","acores","ponta delgada"]],["es","Portugal","Porto & Nord",41.15,-8.67,["porto","matosinhos","viana do castelo","espinho","figueira"]],
  // Italie, Grèce & Méditerranée
  ["it","Italie","Lac de Garde",45.87,10.87,["garda","torbole","malcesine","riva del garda"]],["it","Italie","Sardaigne",39.2,9.16,["sardegna","sardinia","porto pollo","poetto","cagliari","alghero"]],
  ["it","Italie","Sicile",37.87,12.47,["sicilia","sicily","stagnone","mondello","taormina","cefalu"]],["it","Italie","Rimini & Adriatique",44.06,12.58,["rimini","riccione","cesenatico","jesolo"]],
  ["it","Italie","Venise",45.43,12.34,["venezia","venice"]],["it","Italie","Naples & Amalfi",40.63,14.60,["napoli","naples","amalfi","positano","sorrento","capri"]],
  ["it","Italie","Ligurie",44.35,8.58,["varazze","levanto","liguria","genova","sanremo","alassio","portofino"]],["it","Italie","Toscane",43.55,10.30,["viareggio","livorno","forte dei marmi","elba"]],
  ["it","Malte","Malte",35.96,14.35,["malta","mellieha","sliema","valletta","gozo"]],["it","Croatie","Croatie",43.26,16.65,["bol","split","dubrovnik","zadar","hvar","croatia","makarska","pula","rovinj"]],
  ["it","Grèce","Cyclades",37.10,25.37,["naxos","paros","mykonos","santorini"]],["it","Grèce","Rhodes & Crète",36.0,27.7,["rhodes","prasonisi","crete","chania","heraklion","kos"]],
  ["it","Grèce","Îles Ioniennes",38.63,20.60,["lefkada","vassiliki","corfu","zakynthos","kefalonia"]],["it","Turquie","Turquie",38.28,26.37,["alacati","bodrum","antalya","marmaris","fethiye","izmir"]],
  ["it","Chypre","Chypre",34.68,33.04,["limassol","cyprus","larnaca","paphos","ayia napa"]],["it","Israël","Tel Aviv",32.08,34.77,["tel aviv","eilat","haifa"]],["it","Monténégro","Monténégro & Albanie",42.28,18.84,["budva","kotor","montenegro","vlore","saranda"]],
  // Europe du Nord
  ["nord","Pays-Bas","Pays-Bas",52.11,4.27,["scheveningen","zandvoort","brouwersdam","texel","noordwijk","egmond","domburg"]],["nord","Belgique","Belgique",51.35,3.29,["knokke","oostende","ostend","blankenberge","de panne","nieuwpoort"]],
  ["nord","Allemagne","Mer du Nord allemande",54.91,8.31,["sylt","westerland","sankt peter ording","st peter ording","norderney","cuxhaven","busum"]],
  ["nord","Allemagne","Baltique allemande",54.18,12.08,["fehmarn","warnemunde","kiel","rugen","timmendorfer","travemunde","heiligenhafen"]],
  ["nord","Danemark","Danemark",57.04,8.49,["klitmoller","hvide sande","skagen","cold hawaii","blokhus"]],["nord","Royaume-Uni","Cornouailles & Devon",50.42,-5.10,["newquay","fistral","polzeath","croyde","bude","st ives","perranporth","woolacombe"]],
  ["nord","Royaume-Uni","Sud de l'Angleterre",50.82,-0.14,["brighton","bournemouth","poole","weymouth","hayling","southend","margate"]],["nord","Royaume-Uni","Nord & Écosse",55.02,-1.42,["tynemouth","scarborough","whitby","thurso","tiree","blackpool","saltburn"]],
  ["nord","Irlande","Irlande",52.93,-9.35,["lahinch","bundoran","strandhill","achill","brandon bay","portrush"]],["nord","Norvège","Norvège",68.23,13.6,["lofoten","unstad","jaeren","hoddevik","bergen","tromso"]],
  ["nord","Suède","Suède & Finlande",57.10,12.24,["varberg","apelviken","tylosand","hanko","helsinki","torekov"]],["nord","Pologne","Pologne & Baltes",54.60,18.80,["hel","sopot","jastarnia","chalupy","gdansk","leba","palanga","parnu"]],
  ["nord","Islande","Islande",64.14,-21.94,["iceland","reykjavik"]],
  // États-Unis & Canada
  ["usa","États-Unis","Hawaï · Maui",20.93,-156.36,["maui","hookipa","kanaha","lahaina","kihei","kaanapali"]],["usa","États-Unis","Hawaï · Oahu",21.28,-157.83,["waikiki","pipeline","oahu","honolulu","sunset beach","waimea"]],
  ["usa","États-Unis","Hawaï · Kauai & Big Island",21.9,-159.5,["kauai","hanalei","poipu","kona","hilo"]],["usa","États-Unis","Hood River",45.71,-121.51,["hood river","columbia gorge"]],
  ["usa","États-Unis","Californie du Sud",33.66,-118.0,["huntington beach","malibu","venice beach","santa monica","newport beach","hermosa","manhattan beach","laguna","san clemente","oceanside"]],
  ["usa","États-Unis","San Diego",32.80,-117.26,["san diego","pacific beach","la jolla","mission beach","coronado","imperial beach"]],["usa","États-Unis","Californie du Nord",36.95,-122.02,["santa cruz","san francisco","ocean beach","pacifica","half moon bay","monterey","pismo","morro bay"]],
  ["usa","États-Unis","Outer Banks & Hatteras",35.25,-75.53,["hatteras","outer banks","nags head","kitty hawk","avon","rodanthe","wrightsville","carolina beach"]],
  ["usa","États-Unis","Floride · Atlantique",25.79,-80.13,["miami","fort lauderdale","cocoa beach","daytona","jacksonville","deerfield","palm beach","new smyrna","st augustine","hollywood beach"]],
  ["usa","États-Unis","Floride · Golfe & Keys",27.98,-82.83,["clearwater","key west","destin","naples","siesta","pensacola","panama city","st pete","anna maria","fort myers","islamorada"]],
  ["usa","États-Unis","Texas",26.11,-97.17,["south padre","corpus christi","galveston","port aransas"]],["usa","États-Unis","Côte Est",36.85,-75.98,["virginia beach","ocean city","jersey shore","montauk","cape cod","myrtle beach","rehoboth","long beach ny","belmar","folly beach","hilton head"]],
  ["usa","États-Unis","Nord-Ouest & Grands Lacs",45.0,-124.0,["cannon beach","seaside oregon","lake tahoe","lake michigan","westport","pacific city"]],["usa","Canada","Canada",49.15,-125.90,["tofino","vancouver","halifax","lawrencetown","squamish","nitinat"]],
  // Caraïbes & Amérique latine
  ["car","Rép. dominicaine","République dominicaine",19.75,-70.41,["cabarete","punta cana","bavaro","las terrenas","sosua"]],["car","Antilles néerl.","Aruba, Bonaire & Curaçao",12.52,-70.03,["aruba","bonaire","curacao"]],
  ["car","Antilles","Saint-Martin & Saint-Barth",18.04,-63.12,["st maarten","sint maarten","saint martin","maho","st barth","saint barth","anguilla"]],["car","Antilles","Martinique & Guadeloupe",14.6,-61.0,["martinique","guadeloupe"]],
  ["car","Antilles","Petites Antilles",13.19,-59.54,["barbados","antigua","grenada","st lucia","tobago","st kitts","bequia"]],["car","Antilles","Jamaïque, Bahamas & Caïmans",18.47,-77.92,["jamaica","negril","montego","bahamas","nassau","cayman","turks"]],
  ["car","Porto Rico","Porto Rico & Îles Vierges",18.34,-67.25,["puerto rico","rincon","san juan","st thomas","st john","virgin islands","tortola"]],
  ["car","Mexique","Riviera Maya",21.16,-86.85,["cancun","playa del carmen","tulum","cozumel","isla mujeres","holbox"]],["car","Mexique","Mexique · Pacifique",22.89,-109.91,["cabo san lucas","los cabos","puerto escondido","la ventana","puerto vallarta","sayulita","mazatlan","acapulco"]],
  ["car","Costa Rica","Costa Rica & Panama",10.30,-85.84,["tamarindo","jaco","costa rica","santa teresa","nosara","bocas del toro","panama"]],["car","Colombie","Colombie & Venezuela",10.42,-75.55,["cartagena","santa marta","san andres","margarita"]],
  ["car","Brésil","Rio de Janeiro",-22.97,-43.18,["rio de janeiro","copacabana","ipanema","leblon","barra da tijuca","arpoador"]],["car","Brésil","Sud du Brésil",-27.60,-48.45,["florianopolis","joaquina","santos","guaruja","ubatuba","balneario camboriu","itacare","saquarema"]],
  ["car","Brésil","Nordeste",-2.80,-40.51,["jericoacoara","cumbuco","fortaleza","natal","prea","recife","salvador","pipa"]],["car","Uruguay","Uruguay & Argentine",-34.96,-54.95,["punta del este","mar del plata","la paloma","pinamar","montevideo"]],
  ["car","Pérou","Pérou, Chili & Équateur",-4.10,-81.05,["mancora","lima","miraflores","pichilemu","vina del mar","montanita","punta hermosa","arica","iquique"]],
  // Afrique & océan Indien
  ["afr","Maroc","Maroc",23.70,-15.93,["dakhla","essaouira","taghazout","agadir","imsouane","tanger"]],["afr","Afrique du Sud","Le Cap",-33.81,18.47,["cape town","bloubergstrand","muizenberg","table mountain","camps bay","langebaan","hermanus"]],
  ["afr","Afrique du Sud","Durban & côte Est",-29.86,31.04,["durban","jeffreys bay","j bay","umhlanga","ballito","port elizabeth","plettenberg"]],["afr","Maurice","Maurice & La Réunion",-20.45,57.32,["mauritius","le morne","reunion","saint gilles","saint leu","maurice"]],
  ["afr","Tanzanie","Zanzibar, Kenya & Seychelles",-6.14,39.50,["zanzibar","paje","diani","watamu","seychelles","mombasa"]],["afr","Maldives","Maldives",4.17,73.51,["maldives","male"]],
  ["afr","Cap-Vert","Cap-Vert & Sénégal",16.60,-22.90,["cabo verde","cape verde","sal","santa maria","boa vista","dakar","ngor"]],["afr","Égypte","Mer Rouge",27.39,33.68,["el gouna","hurghada","dahab","sharm","soma bay","marsa alam"]],
  ["afr","Émirats","Dubaï & Golfe",25.14,55.19,["dubai","abu dhabi","doha","muscat","jumeirah"]],["afr","Tunisie","Tunisie",33.82,11.0,["djerba","hammamet","sousse","tunis"]],
  // Asie & Océanie
  ["asia","Indonésie","Bali & Indonésie",-8.72,115.17,["bali","kuta","canggu","uluwatu","keramas","padang padang","lombok","mentawai","sanur"]],["asia","Thaïlande","Thaïlande",7.89,98.30,["phuket","koh samui","pattaya","hua hin","krabi","koh phangan","koh tao"]],
  ["asia","Philippines","Philippines & Vietnam",11.97,121.92,["boracay","siargao","cloud 9","mui ne","da nang","nha trang","cebu","el nido"]],["asia","Japon","Japon",35.30,139.48,["enoshima","shonan","kamakura","okinawa","chiba","ichinomiya","miyazaki","japan beach"]],
  ["asia","Corée du Sud","Corée, Chine & Taïwan",35.16,129.16,["busan","haeundae","jeju","hong kong","yangyang","kenting","sanya"]],["asia","Sri Lanka","Sri Lanka & Inde",8.03,79.83,["sri lanka","kalpitiya","weligama","arugam","goa","kovalam","mirissa"]],
  ["asia","Australie","Gold Coast & Queensland",-28.0,153.43,["gold coast","surfers paradise","snapper rocks","burleigh","noosa","coolangatta","currumbin","sunshine coast","cairns"]],
  ["asia","Australie","Sydney & Nouvelle-Galles",-33.89,151.28,["bondi","manly","sydney","byron bay","newcastle","cronulla","coffs","wollongong"]],["asia","Australie","Victoria & Australie-Méridionale",-38.37,144.28,["bells beach","torquay","melbourne","st kilda","phillip island","adelaide","glenelg"]],
  ["asia","Australie","Australie-Occidentale",-31.95,115.76,["perth","margaret river","cottesloe","scarborough","lancelin","geraldton","fremantle"]],["asia","Nouvelle-Zélande","Nouvelle-Zélande",-37.80,174.87,["raglan","piha","auckland","mount maunganui","gisborne","wellington","taranaki","muriwai"]],
  ["asia","Polynésie","Tahiti, Fidji & Nouvelle-Calédonie",-17.85,-149.27,["tahiti","teahupoo","moorea","bora bora","fiji","noumea","nouvelle caledonie","rarotonga"]],
];

// YouTube coupe la connexion après une dizaine de requêtes rapprochées : on va lentement, et on patiente en cas de refus
async function get(url) {
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) }); if (r.ok) return await r.text(); } catch (e) { /* on patiente */ }
    await sleep(30000 + k * 30000);
  }
  return "";
}
function videosOf(html) {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); if (!m) return [];
  let d; try { d = JSON.parse(m[1]); } catch (e) { return []; }
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer) { const v = o.videoRenderer, t = v.title?.simpleText || (v.title?.runs || []).map((x) => x.text).join("") || "";
      const ow = (v.ownerText?.runs || [])[0] || {}, live = JSON.stringify(v.badges || v.thumbnailOverlays || "").includes("LIVE");
      if (v.videoId) out.push({ id: v.videoId, t, by: ow.text || "", ch: ow.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "", live }); return; }
    for (const k in o) walk(o[k]);
  })(d);
  return out;
}
// { live, embed } : en direct maintenant ? lisible hors de YouTube ?
async function check(id) {
  const h = await get("https://www.youtube.com/watch?v=" + encodeURIComponent(id));
  if (!h || !/ytInitialPlayerResponse/.test(h)) return null;
  if (/"playabilityStatus":\{"status":"LOGIN_REQUIRED"/.test(h)) return null;
  return { live: /"isLiveNow":true/.test(h), embed: /"playableInEmbed":true/.test(h) };
}
const CAM = /\b(webcam|web cam|cam|camera|livecam|live cam|beach|surf|playa|plage|praia|spiaggia|strand|port|porto|harbou?r|bay|baie|kite|waves?|sea|ocean|mar|mer|coast|costa|pier|marina|lake|lago|lac|view|vista|panorama|skyline|island|isla|ile)\b/;
const BAD = /\b(news|noticias|music|musica|lofi|lo fi|radio|walk|walking|relax|relaxing|sleep|asmr|mass|misa|church|gameplay|podcast|dj|mix|set|sermon|trading|crypto|stream highlights|vlog|tour|fishing report|24 7 music|study|jazz|rain sounds|ambience|ambient|karaoke|tv|noticiero|football|match|parliament|council)\b/;

const found = [], seen = new Set();
try { for (const c of JSON.parse(fs.readFileSync(new URL("../webcams/index.json", import.meta.url), "utf8")).cams) seen.add(c.id); } catch (e) { /* liste absente */ }
// 1) on ramasse tous les directs proposés par YouTube pour chaque spot, plus quelques recherches générales
const EXTRA = ["live beach cam", "surf cam live", "kitesurf webcam live", "live webcam beach 4k", "webcam plage en direct", "webcam playa en directo", "webcam spiaggia live", "strand webcam live", "praia ao vivo camera", "harbour webcam live", "live cam island beach", "windsurf webcam live", "surfline live cam", "skylinewebcams live beach", "live cam pier", "marina webcam live", "lake webcam live", "wing foil spot webcam"];
const pool = new Map(); let q = 0;
const queries = [];
for (const sp of SPOTS) { const keys = sp[5]; if (sp[6]) queries.push(sp[6]); queries.push(keys[0] + " webcam live"); if (keys[1]) queries.push(keys[1] + " live cam"); }
queries.push(...EXTRA);
const POOL = OUT + ".pool.json";
if (fs.existsSync(POOL)) { for (const v of JSON.parse(fs.readFileSync(POOL, "utf8"))) pool.set(v.id, v); console.log("reprise :", pool.size, "directs déjà vus"); }
else { for (const qq of queries) {
  const vids = videosOf(await get("https://www.youtube.com/results?search_query=" + encodeURIComponent(qq) + "&sp=EgJAAQ%253D%253D"));
  for (const v of vids) if (!pool.has(v.id)) pool.set(v.id, v);
  q++; if (q % 10 === 0) fs.writeFileSync(POOL + ".part", JSON.stringify([...pool.values()])); if (q % 10 === 0) console.log(q, "/", queries.length, "recherches,", pool.size, "directs vus");
  await sleep(5000);
}
  fs.writeFileSync(POOL, JSON.stringify([...pool.values()])); }
// 2) on rattache chaque direct à un spot par son titre (mot-clé le plus long d'abord)
const GAZ = []; for (const sp of SPOTS) for (const k of sp[5]) GAZ.push({ k: norm(k), sp });
GAZ.sort((a, b) => b.k.length - a.k.length);
const todo = [];
for (const v of pool.values()) {
  if (seen.has(v.id)) continue; const t = " " + norm(v.t) + " "; if (!CAM.test(t) || BAD.test(t)) continue;
  const g = GAZ.find((x) => x.k.length > 2 && t.includes(" " + x.k + " ")); if (!g) continue; todo.push({ v, g });
}
console.log(pool.size, "directs vus,", todo.length, "rattachés à un spot ; vérification…");
// 3) vérification : en direct maintenant, et lisible dans l'appli
const per = {}; let done = 0;
async function worker() { for (;;) { const it = todo.shift(); if (!it) return; const { v, g } = it, sp = g.sp, id = sp[0] + "/" + sp[2];
    if ((per[id] || 0) >= 6) continue; const st = await check(v.id); await sleep(4000); done++;
    if (!st || !st.live || (per[id] || 0) >= 6) continue; per[id] = (per[id] || 0) + 1;
    found.push({ sea: sp[0], country: sp[1], place: sp[2], key: g.k, id: v.id, embed: st.embed, title: v.t, by: v.by, ch: v.ch ? "https://www.youtube.com" + v.ch : "", lat: sp[3], lon: sp[4] });
    if (found.length % 15 === 0) { console.log(found.length, "retenues"); fs.writeFileSync(OUT, JSON.stringify(found, null, 1)); } } }
if (process.argv[3] === "collect") process.exit(0);
await Promise.all([worker()]);
const order = new Map(SPOTS.map((sp, i) => [sp[0] + "/" + sp[2], i]));
found.sort((a, b) => order.get(a.sea + "/" + a.place) - order.get(b.sea + "/" + b.place));
fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
console.log(found.length + " webcams en direct trouvées →", OUT);
