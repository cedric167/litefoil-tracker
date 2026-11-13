// Lite Foil — pages de présentation de Swip (une par langue) : swip/index.html (fr), swip/en/, swip/es/…
// Usage : node scripts/build-swip.mjs   (à lancer APRÈS build-landing.mjs : il réécrit aussi sitemap.xml avec toutes les pages)
import fs from "node:fs";
const SITE = "https://cedric167.github.io/litefoil-tracker", PLAY = "https://play.google.com/store/apps/details?id=fr.litefoil.tracker", IOS = "https://apps.apple.com/app/id6827991078";
const L = {
  fr: { name: "Français", title: "Swip : les vidéos des riders (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip est le fil vidéo de l'appli Lite Foil : vidéos verticales de riders, musique libre de droits, tracé GPS incrusté, stories et défis. Gratuit sur Android et iPhone.",
    kick: "Dans l'appli Lite Foil · gratuit", h1: "Swip, le fil vidéo des riders", lead: "Des vidéos 100 % glisse et outdoor : eFoil, wing foil, kitesurf, surf, windsurf, vélo, ski… Publie les tiennes, découvre celles des autres.",
    play: "Télécharger sur Google Play", ios: "Télécharger sur l'App Store", h2: "Pourquoi Swip",
    f: [["Que du ride", "Pas de bruit : toutes les vidéos viennent de pratiquants. Tu fais défiler d'un geste, tu aimes, tu commentes, tu suis les riders qui t'inspirent."],
      ["Ta musique, sans souci de droits", "Plus de cinquante morceaux libres de droits, classés par ambiance. Ta vidéo ne sera pas coupée."],
      ["Ton tracé GPS sur la vidéo", "Swip peut afficher le parcours réel de ta sortie par-dessus l'image, en transparence."],
      ["Stories, défis et classements", "Stories à plusieurs photos et vidéos, défi de la semaine, classement mondial et cartes Rider à collectionner."]],
    more: "Découvrir toute l'application", foot: "Lite Foil, eFoils conçus en France" },
  en: { name: "English", title: "Swip: riders' videos (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip is the video feed of the Lite Foil app: vertical videos from riders, royalty-free music, GPS track overlay, stories and challenges. Free on Android and iPhone.",
    kick: "Inside the Lite Foil app · free", h1: "Swip, the riders' video feed", lead: "100% board sports and outdoor videos: eFoil, wing foil, kitesurf, surf, windsurf, cycling, ski… Post yours, discover everyone else's.",
    play: "Get it on Google Play", ios: "Download on the App Store", h2: "Why Swip",
    f: [["Nothing but riding", "No noise: every video comes from someone who rides. Swipe, like, comment and follow the riders who inspire you."],
      ["Your music, no copyright trouble", "Fifty-plus royalty-free tracks sorted by mood. Your video won't get muted."],
      ["Your GPS track on the video", "Swip can overlay the real route of your session on the picture."],
      ["Stories, challenges and rankings", "Stories with several photos and videos, weekly challenge, world ranking and collectible Rider cards."]],
    more: "Discover the whole app", foot: "Lite Foil, eFoils designed in France" },
  es: { name: "Español", title: "Swip: los vídeos de los riders (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip es el feed de vídeo de la app Lite Foil: vídeos verticales de riders, música libre de derechos, trazado GPS sobre la imagen, stories y retos. Gratis en Android y iPhone.",
    kick: "Dentro de la app Lite Foil · gratis", h1: "Swip, el feed de vídeo de los riders", lead: "Vídeos 100 % deslizamiento y outdoor: eFoil, wing foil, kitesurf, surf, windsurf, bici, esquí… Publica los tuyos y descubre los de los demás.",
    play: "Descargar en Google Play", ios: "Descargar en el App Store", h2: "Por qué Swip",
    f: [["Solo riding", "Sin ruido: todos los vídeos son de practicantes. Desliza, da me gusta, comenta y sigue a los riders que te inspiran."],
      ["Tu música, sin problemas de derechos", "Más de cincuenta temas libres de derechos, ordenados por ambiente. Tu vídeo no será silenciado."],
      ["Tu trazado GPS en el vídeo", "Swip puede mostrar el recorrido real de tu salida sobre la imagen."],
      ["Stories, retos y clasificaciones", "Stories con varias fotos y vídeos, reto semanal, clasificación mundial y cartas Rider coleccionables."]],
    more: "Descubrir toda la app", foot: "Lite Foil, eFoils diseñados en Francia" },
  de: { name: "Deutsch", title: "Swip: Videos der Rider (eFoil, Wing, Kite, Surf) | Lite Foil", desc: "Swip ist der Video-Feed der Lite Foil App: Hochkant-Videos von Ridern, lizenzfreie Musik, GPS-Track im Bild, Stories und Challenges. Kostenlos für Android und iPhone.",
    kick: "In der Lite Foil App · kostenlos", h1: "Swip, der Video-Feed der Rider", lead: "Nur Boardsport und Outdoor: eFoil, Wingfoil, Kitesurfen, Surfen, Windsurfen, Rad, Ski… Poste deine Videos und entdecke die der anderen.",
    play: "Bei Google Play laden", ios: "Im App Store laden", h2: "Warum Swip",
    f: [["Nur Riding", "Kein Rauschen: Alle Videos kommen von Leuten, die selbst fahren. Wischen, liken, kommentieren und Ridern folgen."],
      ["Deine Musik, ohne Rechteprobleme", "Über fünfzig lizenzfreie Tracks, nach Stimmung sortiert. Dein Video wird nicht stummgeschaltet."],
      ["Dein GPS-Track im Video", "Swip kann die echte Route deiner Session über das Bild legen."],
      ["Stories, Challenges und Ranglisten", "Stories mit mehreren Fotos und Videos, Wochen-Challenge, Weltrangliste und Rider-Karten zum Sammeln."]],
    more: "Die ganze App entdecken", foot: "Lite Foil, in Frankreich entwickelte eFoils" },
  it: { name: "Italiano", title: "Swip: i video dei rider (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip è il feed video dell'app Lite Foil: video verticali dei rider, musica libera da diritti, traccia GPS sull'immagine, storie e sfide. Gratis su Android e iPhone.",
    kick: "Nell'app Lite Foil · gratis", h1: "Swip, il feed video dei rider", lead: "Video 100% board sport e outdoor: eFoil, wing foil, kitesurf, surf, windsurf, bici, sci… Pubblica i tuoi e scopri quelli degli altri.",
    play: "Scarica su Google Play", ios: "Scarica sull'App Store", h2: "Perché Swip",
    f: [["Solo riding", "Niente rumore: tutti i video sono di praticanti. Scorri, metti like, commenta e segui i rider che ti ispirano."],
      ["La tua musica, senza problemi di diritti", "Oltre cinquanta brani liberi da diritti, ordinati per atmosfera. Il tuo video non verrà silenziato."],
      ["La tua traccia GPS sul video", "Swip può mostrare il percorso reale della tua uscita sopra l'immagine."],
      ["Storie, sfide e classifiche", "Storie con più foto e video, sfida della settimana, classifica mondiale e carte Rider da collezionare."]],
    more: "Scopri tutta l'app", foot: "Lite Foil, eFoil progettati in Francia" },
  pt: { name: "Português", title: "Swip: os vídeos dos riders (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip é o feed de vídeo da app Lite Foil: vídeos verticais de riders, música livre de direitos, traçado GPS sobre a imagem, stories e desafios. Grátis em Android e iPhone.",
    kick: "Dentro da app Lite Foil · grátis", h1: "Swip, o feed de vídeo dos riders", lead: "Vídeos 100% desportos de prancha e outdoor: eFoil, wing foil, kitesurf, surf, windsurf, bicicleta, esqui… Publica os teus e descobre os dos outros.",
    play: "Descarregar no Google Play", ios: "Descarregar na App Store", h2: "Porquê o Swip",
    f: [["Só riding", "Sem ruído: todos os vídeos são de praticantes. Desliza, gosta, comenta e segue os riders que te inspiram."],
      ["A tua música, sem problemas de direitos", "Mais de cinquenta temas livres de direitos, por ambiente. O teu vídeo não será silenciado."],
      ["O teu traçado GPS no vídeo", "O Swip pode mostrar o percurso real da tua saída sobre a imagem."],
      ["Stories, desafios e classificações", "Stories com várias fotos e vídeos, desafio da semana, classificação mundial e cartas Rider colecionáveis."]],
    more: "Descobrir toda a app", foot: "Lite Foil, eFoils concebidos em França" },
  nl: { name: "Nederlands", title: "Swip: video's van riders (eFoil, wing, kite, surf) | Lite Foil", desc: "Swip is de videofeed van de Lite Foil app: verticale video's van riders, rechtenvrije muziek, GPS-track in beeld, stories en challenges. Gratis voor Android en iPhone.",
    kick: "In de Lite Foil app · gratis", h1: "Swip, de videofeed van riders", lead: "100% boardsport en outdoor: eFoil, wingfoil, kitesurfen, surfen, windsurfen, fietsen, ski… Post je eigen video's en ontdek die van anderen.",
    play: "Download via Google Play", ios: "Download in de App Store", h2: "Waarom Swip",
    f: [["Alleen riding", "Geen ruis: alle video's komen van mensen die zelf rijden. Swipe, like, reageer en volg de riders die je inspireren."],
      ["Jouw muziek, zonder rechtengedoe", "Meer dan vijftig rechtenvrije nummers, per sfeer. Je video wordt niet gedempt."],
      ["Je GPS-track in de video", "Swip kan de echte route van je sessie over het beeld leggen."],
      ["Stories, challenges en ranglijsten", "Stories met meerdere foto's en video's, weekchallenge, wereldranglijst en Rider-kaarten om te verzamelen."]],
    more: "Ontdek de hele app", foot: "Lite Foil, eFoils ontworpen in Frankrijk" },
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const url = (lg) => SITE + "/swip/" + (lg === "fr" ? "" : lg + "/"), appUrl = (lg) => SITE + "/app/" + (lg === "fr" ? "" : lg + "/");
const langs = Object.keys(L);
for (const lg of langs) {
  const t = L[lg], up = lg === "fr" ? "../" : "../../", shot = up + "app/img/swip-" + (lg === "fr" ? "fr" : "en") + ".webp";
  const html = `<!doctype html>
<html lang="${lg}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.desc)}">
<link rel="canonical" href="${url(lg)}">
${langs.map((x) => `<link rel="alternate" hreflang="${x}" href="${url(x)}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${url("en")}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(t.title)}"><meta property="og:description" content="${esc(t.desc)}">
<meta property="og:url" content="${url(lg)}"><meta property="og:image" content="${SITE}/app/img/og.jpg"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#06181d"><link rel="icon" href="${up}icon-192.png"><meta name="apple-itunes-app" content="app-id=6827991078">
<style>
*{box-sizing:border-box}body{margin:0;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#06181d;line-height:1.5}a{color:inherit}.w{max-width:1000px;margin:0 auto;padding:0 20px}
header{background:radial-gradient(120% 90% at 50% 0%,#12656a 0%,#0b3138 48%,#06181d 100%);padding:22px 0 46px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.top img{height:40px}
.lg{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.lg a{font-size:12.5px;font-weight:700;text-decoration:none;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.1)}.lg a.on{background:#7fe6dc;color:#06262b}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center;margin-top:34px}
.k{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7fe6dc;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.1)}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(38px,6vw,60px);line-height:1.02;margin:16px 0 14px}
.lead{font-size:18px;color:rgba(255,255,255,.84);max-width:560px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.b{display:inline-block;text-decoration:none;font-weight:800;font-size:16px;padding:15px 20px;border-radius:16px;background:#7fe6dc;color:#06262b}.b.w2{background:#fff}
.ph{justify-self:center;width:min(270px,68vw);border-radius:38px;padding:9px;background:#05090c;box-shadow:0 40px 80px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.12)}.ph img{display:block;width:100%;border-radius:30px;aspect-ratio:390/844;object-fit:cover}
main{padding:54px 0 30px}h2{font-family:Georgia,serif;font-weight:400;font-size:clamp(28px,4vw,40px);margin:0 0 26px;text-align:center}
.g{display:grid;grid-template-columns:1fr 1fr;gap:16px}.c{background:linear-gradient(160deg,#0b3138,#0a2227);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:18px}.c h3{margin:0 0 6px;font-size:19px}.c p{margin:0;font-size:15px;color:rgba(255,255,255,.8)}
.end{text-align:center;padding:46px 0 56px}.end .cta{justify-content:center}.end a.m{display:inline-block;margin-top:18px;color:#7fe6dc;font-weight:700}
footer{border-top:1px solid rgba(255,255,255,.1);padding:22px 0 34px;text-align:center;font-size:13.5px;color:rgba(255,255,255,.6)}
@media(max-width:780px){.hero{grid-template-columns:1fr}.g{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div class="w">
  <div class="top"><img src="${up}litefoil-logo.png" alt="Lite Foil"><nav class="lg" aria-label="Languages">${langs.map((x) => `<a href="${lg === "fr" ? (x === "fr" ? "./" : x + "/") : (x === "fr" ? "../" : "../" + x + "/")}" hreflang="${x}"${x === lg ? ' class="on"' : ""}>${L[x].name}</a>`).join("")}</nav></div>
  <div class="hero">
    <div><span class="k">${esc(t.kick)}</span><h1>${esc(t.h1)}</h1><p class="lead">${esc(t.lead)}</p>
      <div class="cta"><a class="b" href="${PLAY}">${esc(t.play)}</a><a class="b w2" href="${IOS}">${esc(t.ios)}</a></div></div>
    <div class="ph"><img src="${shot}" alt="Swip" width="390" height="844"></div>
  </div>
</div></header>
<main><div class="w">
  <h2>${esc(t.h2)}</h2>
  <div class="g">${t.f.map(([a, b]) => `<article class="c"><h3>${esc(a)}</h3><p>${esc(b)}</p></article>`).join("")}</div>
  <div class="end"><div class="cta"><a class="b" href="${PLAY}">${esc(t.play)}</a><a class="b w2" href="${IOS}">${esc(t.ios)}</a></div><a class="m" href="${appUrl(lg)}">${esc(t.more)} →</a></div>
</div></main>
<footer><div class="w">${esc(t.foot)} · <a href="https://litefoil.fr">litefoil.fr</a></div></footer>
</body>
</html>
`;
  const dir = new URL("../swip/" + (lg === "fr" ? "" : lg + "/"), import.meta.url); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(new URL("index.html", dir), html);
}
const today = new Date().toISOString().slice(0, 10), all = [SITE + "/", ...langs.map(appUrl), ...langs.map(url), SITE + "/get/"];
fs.writeFileSync(new URL("../sitemap.xml", import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + all.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") + `\n</urlset>\n`);
console.log("pages Swip :", langs.map(url).join(" "), "· sitemap :", all.length, "adresses");
