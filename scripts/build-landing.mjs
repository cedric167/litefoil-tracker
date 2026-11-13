// Lite Foil — fabrique les pages de présentation de l'appli (une par langue) : app/index.html (fr), app/en/, app/es/…
// Usage : node scripts/build-landing.mjs   (réécrit app/**/index.html et sitemap.xml)
import fs from "node:fs";
const SITE = "https://cedric167.github.io/litefoil-tracker", PLAY = "https://play.google.com/store/apps/details?id=fr.litefoil.tracker", IOS = "https://apps.apple.com/app/id6827991078";
const SHOTS = ["tracking", "replay", "sos", "weather", "calls", "swip"];
const L = {
  fr: { name: "Français", title: "Lite Foil : l'appli des riders (GPS, SOS, météo, webcams)", desc: "Suivi GPS de vos sessions, replay 3D et Street View, SOS en mer comme à terre, météo des spots avec webcams en direct, communauté et vidéos Swip. Gratuite sur Android et iPhone.",
    kick: "Application gratuite · Android & iPhone", h1: "L'appli la plus complète des riders", lead: "eFoil, wing foil, kitesurf, surf, vélo, trail, ski… Enregistrez vos sessions, restez en sécurité et retrouvez votre communauté.",
    play: "Télécharger sur Google Play", ios: "Télécharger sur l'App Store", web: "Ouvrir dans le navigateur", h2: "Tout ce dont un rider a besoin",
    f: [["Suivi GPS de vos sessions", "Distance, vitesse, vitesse max et parcours pour plus de 25 sports. L'enregistrement continue écran verrouillé."],
      ["Replay 3D et Street View 360°", "Revivez votre parcours en survol 3D, en vue à bord, et en Street View sur les parcours à terre."],
      ["SOS en mer comme à terre", "Maintenez 2 secondes : vos proches reçoivent votre alerte, votre position et votre suivi en direct."],
      ["Météo du spot et webcams en direct", "Vent, vagues, houle, prévisions, et plus de 270 webcams de spots dans le monde."],
      ["Appels et messages entre riders", "Salons par sport, messages privés traduits automatiquement, appels audio et vidéo en cours de déploiement."],
      ["Swip : les vidéos des riders", "Publiez vos vidéos avec musique libre de droits et votre tracé GPS incrusté sur l'image."]],
    faqT: "Questions fréquentes", faq: [["L'application est-elle gratuite ?", "Oui, sur Android et iPhone, sans abonnement."], ["Faut-il un eFoil Lite Foil ?", "Non. L'application est ouverte à tous les riders, quels que soient le sport et la marque du matériel."], ["En quelles langues ?", "Français, anglais et espagnol. Les messages de la communauté sont traduits automatiquement."]],
    foot: "Lite Foil, eFoils conçus en France", shop: "Découvrir les eFoils Lite Foil" },
  en: { name: "English", title: "Lite Foil: the riders' app (GPS, SOS, weather, webcams)", desc: "GPS tracking for your sessions, 3D replay and Street View, SOS at sea and on land, spot weather with live webcams, community and Swip videos. Free on Android and iPhone.",
    kick: "Free app · Android & iPhone", h1: "The most complete app for riders", lead: "eFoil, wing foil, kitesurf, surf, cycling, trail, ski… Record your sessions, stay safe and meet your community.",
    play: "Get it on Google Play", ios: "Download on the App Store", web: "Open in the browser", h2: "Everything a rider needs",
    f: [["GPS tracking for your sessions", "Distance, speed, top speed and route for 25+ sports. Recording keeps going with the screen locked."],
      ["3D replay and 360° Street View", "Relive your route as a 3D flyover, an on-board view, and in Street View on land routes."],
      ["SOS at sea and on land", "Hold for 2 seconds: your friends get your alert, your position and your live tracking."],
      ["Spot weather and live webcams", "Wind, waves, swell, forecast, and 270+ spot webcams around the world."],
      ["Calls and messages between riders", "Channels by sport, private messages with automatic translation, audio and video calls rolling out."],
      ["Swip: riders' videos", "Post your videos with royalty-free music and your GPS track overlaid on the picture."]],
    faqT: "Frequently asked questions", faq: [["Is the app free?", "Yes, on Android and iPhone, with no subscription."], ["Do I need a Lite Foil eFoil?", "No. The app is open to all riders, whatever the sport or the brand of your gear."], ["Which languages?", "French, English and Spanish. Community messages are translated automatically."]],
    foot: "Lite Foil, eFoils designed in France", shop: "Discover Lite Foil eFoils" },
  es: { name: "Español", title: "Lite Foil: la app de los riders (GPS, SOS, meteo, webcams)", desc: "Seguimiento GPS de tus sesiones, repetición 3D y Street View, SOS en el mar y en tierra, meteo de los spots con webcams en directo, comunidad y vídeos Swip. Gratis en Android y iPhone.",
    kick: "App gratuita · Android y iPhone", h1: "La app más completa para riders", lead: "eFoil, wing foil, kitesurf, surf, bici, trail, esquí… Graba tus sesiones, mantente seguro y encuentra a tu comunidad.",
    play: "Descargar en Google Play", ios: "Descargar en el App Store", web: "Abrir en el navegador", h2: "Todo lo que necesita un rider",
    f: [["Seguimiento GPS de tus sesiones", "Distancia, velocidad, velocidad máxima y recorrido para más de 25 deportes. La grabación sigue con la pantalla bloqueada."],
      ["Repetición 3D y Street View 360°", "Revive tu recorrido en vuelo 3D, en vista a bordo y en Street View en los recorridos por tierra."],
      ["SOS en el mar y en tierra", "Mantén pulsado 2 segundos: tus amigos reciben tu alerta, tu posición y tu seguimiento en directo."],
      ["Meteo del spot y webcams en directo", "Viento, olas, mar de fondo, previsión y más de 270 webcams de spots en todo el mundo."],
      ["Llamadas y mensajes entre riders", "Canales por deporte, mensajes privados con traducción automática, llamadas de audio y vídeo en despliegue."],
      ["Swip: los vídeos de los riders", "Publica tus vídeos con música libre de derechos y tu trazado GPS sobre la imagen."]],
    faqT: "Preguntas frecuentes", faq: [["¿La app es gratuita?", "Sí, en Android y iPhone, sin suscripción."], ["¿Necesito un eFoil Lite Foil?", "No. La app está abierta a todos los riders, sea cual sea el deporte o la marca del material."], ["¿En qué idiomas?", "Francés, inglés y español. Los mensajes de la comunidad se traducen automáticamente."]],
    foot: "Lite Foil, eFoils diseñados en Francia", shop: "Descubrir los eFoils Lite Foil" },
  de: { name: "Deutsch", title: "Lite Foil: die App für Rider (GPS, SOS, Wetter, Webcams)", desc: "GPS-Tracking deiner Sessions, 3D-Replay und Street View, SOS auf dem Wasser und an Land, Spot-Wetter mit Live-Webcams, Community und Swip-Videos. Kostenlos für Android und iPhone.",
    kick: "Kostenlose App · Android & iPhone", h1: "Die umfassendste App für Rider", lead: "eFoil, Wingfoil, Kitesurfen, Surfen, Rad, Trail, Ski… Zeichne deine Sessions auf, bleib sicher und finde deine Community.",
    play: "Bei Google Play laden", ios: "Im App Store laden", web: "Im Browser öffnen", h2: "Alles, was ein Rider braucht",
    f: [["GPS-Tracking deiner Sessions", "Distanz, Geschwindigkeit, Topspeed und Route für über 25 Sportarten. Die Aufzeichnung läuft auch bei gesperrtem Bildschirm."],
      ["3D-Replay und 360° Street View", "Erlebe deine Route als 3D-Überflug, aus der Bordperspektive und an Land in Street View."],
      ["SOS auf dem Wasser und an Land", "2 Sekunden halten: Deine Freunde erhalten deinen Alarm, deine Position und dein Live-Tracking."],
      ["Spot-Wetter und Live-Webcams", "Wind, Wellen, Dünung, Vorhersage und über 270 Spot-Webcams weltweit."],
      ["Anrufe und Nachrichten unter Ridern", "Kanäle nach Sportart, private Nachrichten mit automatischer Übersetzung, Audio- und Videoanrufe werden ausgerollt."],
      ["Swip: Videos der Rider", "Poste deine Videos mit lizenzfreier Musik und deinem GPS-Track im Bild."]],
    faqT: "Häufige Fragen", faq: [["Ist die App kostenlos?", "Ja, für Android und iPhone, ohne Abo."], ["Brauche ich ein Lite Foil eFoil?", "Nein. Die App steht allen Ridern offen, unabhängig von Sportart und Marke."], ["Welche Sprachen?", "Die App gibt es auf Französisch, Englisch und Spanisch. Community-Nachrichten werden automatisch übersetzt."]],
    foot: "Lite Foil, in Frankreich entwickelte eFoils", shop: "Lite Foil eFoils entdecken" },
  it: { name: "Italiano", title: "Lite Foil: l'app dei rider (GPS, SOS, meteo, webcam)", desc: "Tracciamento GPS delle tue sessioni, replay 3D e Street View, SOS in mare e a terra, meteo degli spot con webcam in diretta, community e video Swip. Gratis su Android e iPhone.",
    kick: "App gratuita · Android e iPhone", h1: "L'app più completa per i rider", lead: "eFoil, wing foil, kitesurf, surf, bici, trail, sci… Registra le tue sessioni, resta al sicuro e ritrova la tua community.",
    play: "Scarica su Google Play", ios: "Scarica sull'App Store", web: "Apri nel browser", h2: "Tutto ciò che serve a un rider",
    f: [["Tracciamento GPS delle sessioni", "Distanza, velocità, velocità massima e percorso per oltre 25 sport. La registrazione continua a schermo bloccato."],
      ["Replay 3D e Street View 360°", "Rivivi il percorso in sorvolo 3D, in vista a bordo e in Street View sui percorsi a terra."],
      ["SOS in mare e a terra", "Tieni premuto 2 secondi: i tuoi amici ricevono l'allarme, la tua posizione e il tuo tracciamento in diretta."],
      ["Meteo dello spot e webcam in diretta", "Vento, onde, mare lungo, previsioni e oltre 270 webcam di spot nel mondo."],
      ["Chiamate e messaggi tra rider", "Canali per sport, messaggi privati con traduzione automatica, chiamate audio e video in arrivo."],
      ["Swip: i video dei rider", "Pubblica i tuoi video con musica libera da diritti e la tua traccia GPS sull'immagine."]],
    faqT: "Domande frequenti", faq: [["L'app è gratuita?", "Sì, su Android e iPhone, senza abbonamento."], ["Serve un eFoil Lite Foil?", "No. L'app è aperta a tutti i rider, qualunque sia lo sport o la marca dell'attrezzatura."], ["In quali lingue?", "L'app è in francese, inglese e spagnolo. I messaggi della community sono tradotti automaticamente."]],
    foot: "Lite Foil, eFoil progettati in Francia", shop: "Scopri gli eFoil Lite Foil" },
  pt: { name: "Português", title: "Lite Foil: a app dos riders (GPS, SOS, meteo, webcams)", desc: "Registo GPS das tuas sessões, replay 3D e Street View, SOS no mar e em terra, meteo dos spots com webcams em direto, comunidade e vídeos Swip. Grátis em Android e iPhone.",
    kick: "App gratuita · Android e iPhone", h1: "A app mais completa para riders", lead: "eFoil, wing foil, kitesurf, surf, bicicleta, trail, esqui… Grava as tuas sessões, mantém-te seguro e encontra a tua comunidade.",
    play: "Descarregar no Google Play", ios: "Descarregar na App Store", web: "Abrir no navegador", h2: "Tudo o que um rider precisa",
    f: [["Registo GPS das tuas sessões", "Distância, velocidade, velocidade máxima e percurso para mais de 25 desportos. A gravação continua com o ecrã bloqueado."],
      ["Replay 3D e Street View 360°", "Revive o teu percurso em sobrevoo 3D, em vista a bordo e em Street View nos percursos em terra."],
      ["SOS no mar e em terra", "Mantém premido 2 segundos: os teus amigos recebem o alerta, a tua posição e o teu seguimento em direto."],
      ["Meteo do spot e webcams em direto", "Vento, ondas, ondulação, previsão e mais de 270 webcams de spots em todo o mundo."],
      ["Chamadas e mensagens entre riders", "Canais por desporto, mensagens privadas com tradução automática, chamadas de áudio e vídeo a chegar."],
      ["Swip: os vídeos dos riders", "Publica os teus vídeos com música livre de direitos e o teu traçado GPS sobre a imagem."]],
    faqT: "Perguntas frequentes", faq: [["A app é gratuita?", "Sim, em Android e iPhone, sem subscrição."], ["Preciso de um eFoil Lite Foil?", "Não. A app está aberta a todos os riders, seja qual for o desporto ou a marca do material."], ["Em que línguas?", "A app está em francês, inglês e espanhol. As mensagens da comunidade são traduzidas automaticamente."]],
    foot: "Lite Foil, eFoils concebidos em França", shop: "Descobrir os eFoils Lite Foil" },
  nl: { name: "Nederlands", title: "Lite Foil: de app voor riders (GPS, SOS, weer, webcams)", desc: "GPS-tracking van je sessies, 3D-replay en Street View, SOS op zee en aan land, spotweer met live webcams, community en Swip-video's. Gratis voor Android en iPhone.",
    kick: "Gratis app · Android & iPhone", h1: "De meest complete app voor riders", lead: "eFoil, wingfoil, kitesurfen, surfen, fietsen, trail, ski… Leg je sessies vast, blijf veilig en vind je community.",
    play: "Download via Google Play", ios: "Download in de App Store", web: "Openen in de browser", h2: "Alles wat een rider nodig heeft",
    f: [["GPS-tracking van je sessies", "Afstand, snelheid, topsnelheid en route voor meer dan 25 sporten. De opname loopt door met vergrendeld scherm."],
      ["3D-replay en 360° Street View", "Beleef je route opnieuw als 3D-vlucht, vanaf het board en in Street View op routes aan land."],
      ["SOS op zee en aan land", "Houd 2 seconden vast: je vrienden krijgen je melding, je positie en je live tracking."],
      ["Spotweer en live webcams", "Wind, golven, deining, verwachting en meer dan 270 spotwebcams wereldwijd."],
      ["Bellen en berichten tussen riders", "Kanalen per sport, privéberichten met automatische vertaling, audio- en videogesprekken worden uitgerold."],
      ["Swip: video's van riders", "Post je video's met rechtenvrije muziek en je GPS-track in beeld."]],
    faqT: "Veelgestelde vragen", faq: [["Is de app gratis?", "Ja, voor Android en iPhone, zonder abonnement."], ["Heb ik een Lite Foil eFoil nodig?", "Nee. De app is er voor alle riders, welke sport of welk merk ook."], ["Welke talen?", "De app is er in het Frans, Engels en Spaans. Berichten in de community worden automatisch vertaald."]],
    foot: "Lite Foil, eFoils ontworpen in Frankrijk", shop: "Ontdek de Lite Foil eFoils" },
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const url = (lg) => SITE + "/app/" + (lg === "fr" ? "" : lg + "/");
const langs = Object.keys(L);
for (const lg of langs) {
  const t = L[lg], up = lg === "fr" ? "" : "../", img = (n) => up + "img/" + n + "-" + (lg === "fr" ? "fr" : "en") + ".webp";
  const ld = { "@context": "https://schema.org", "@type": "MobileApplication", name: "Lite Foil", operatingSystem: "Android, iOS", applicationCategory: "SportsApplication", description: t.desc, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" }, url: url(lg), image: SITE + "/icon-512.png", installUrl: PLAY, inLanguage: lg };
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
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
<meta name="theme-color" content="#06181d"><link rel="icon" href="${up}../icon-192.png">
<meta name="apple-itunes-app" content="app-id=6827991078">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#06181d;line-height:1.5}
a{color:inherit}.w{max-width:1040px;margin:0 auto;padding:0 20px}
header{background:radial-gradient(120% 90% at 50% 0%,#12656a 0%,#0b3138 48%,#06181d 100%);padding:22px 0 46px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.top img{height:44px}
.lg{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.lg a{font-size:12.5px;font-weight:700;text-decoration:none;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.1)}.lg a.on{background:#7fe6dc;color:#06262b}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:30px;align-items:center;margin-top:34px}
.k{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7fe6dc;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.1)}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(38px,6vw,62px);line-height:1.02;margin:16px 0 14px;letter-spacing:-.5px}
.lead{font-size:18px;color:rgba(255,255,255,.84);max-width:560px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.b{display:inline-block;text-decoration:none;font-weight:800;font-size:16px;padding:15px 20px;border-radius:16px;background:#7fe6dc;color:#06262b}.b.w2{background:#fff}.b.g{background:rgba(255,255,255,.14);color:#fff}
.ph{justify-self:center;width:min(280px,70vw);border-radius:38px;padding:9px;background:#05090c;box-shadow:0 40px 80px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.12)}.ph img{display:block;width:100%;border-radius:30px;aspect-ratio:390/844;object-fit:cover;object-position:top}
main{padding:54px 0 30px}h2{font-family:Georgia,serif;font-weight:400;font-size:clamp(28px,4vw,40px);margin:0 0 26px;text-align:center}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.c{background:linear-gradient(160deg,#0b3138,#0a2227);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:16px 16px 0;overflow:hidden;display:flex;flex-direction:column}
.c h3{margin:0 0 6px;font-size:18.5px}.c p{margin:0 0 14px;font-size:14.5px;color:rgba(255,255,255,.78)}.c img{display:block;width:78%;margin:auto auto 0;border-radius:22px 22px 0 0;aspect-ratio:390/560;object-fit:cover;object-position:top;box-shadow:0 -10px 30px rgba(0,0,0,.35)}
.faq{max-width:760px;margin:56px auto 0}.faq details{background:#0a2227;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 16px;margin-bottom:10px}.faq summary{font-weight:700;cursor:pointer}.faq p{margin:8px 0 0;color:rgba(255,255,255,.8)}
.end{text-align:center;padding:50px 0 60px}.end .cta{justify-content:center}footer{border-top:1px solid rgba(255,255,255,.1);padding:22px 0 34px;text-align:center;font-size:13.5px;color:rgba(255,255,255,.6)}
@media(max-width:820px){.hero{grid-template-columns:1fr}.g{grid-template-columns:1fr 1fr}.top img{height:36px}}@media(max-width:520px){.g{grid-template-columns:1fr}.c img{width:64%}}
</style>
</head>
<body>
<header><div class="w">
  <div class="top"><img src="${up}../litefoil-logo.png" alt="Lite Foil"><nav class="lg" aria-label="Languages">${langs.map((x) => `<a href="${lg === "fr" ? (x === "fr" ? "./" : x + "/") : (x === "fr" ? "../" : "../" + x + "/")}" hreflang="${x}"${x === lg ? ' class="on"' : ""}>${L[x].name}</a>`).join("")}</nav></div>
  <div class="hero">
    <div><span class="k">${esc(t.kick)}</span><h1>${esc(t.h1)}</h1><p class="lead">${esc(t.lead)}</p>
      <div class="cta"><a class="b" href="${PLAY}">${esc(t.play)}</a><a class="b w2" href="${IOS}">${esc(t.ios)}</a><a class="b g" href="${up}../">${esc(t.web)}</a></div></div>
    <div class="ph"><img src="${img("home")}" alt="Lite Foil app" width="390" height="844"></div>
  </div>
</div></header>
<main><div class="w">
  <h2>${esc(t.h2)}</h2>
  <div class="g">${t.f.map(([a, b], i) => `<article class="c"><h3>${esc(a)}</h3><p>${esc(b)}</p><img loading="lazy" src="${img(SHOTS[i])}" alt="${esc(a)}" width="390" height="560"></article>`).join("")}</div>
  <section class="faq"><h2>${esc(t.faqT)}</h2>${t.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>
  <div class="end"><h2>${esc(t.h1)}</h2><div class="cta"><a class="b" href="${PLAY}">${esc(t.play)}</a><a class="b w2" href="${IOS}">${esc(t.ios)}</a></div></div>
</div></main>
<footer><div class="w">${esc(t.foot)} · <a href="https://litefoil.fr">${esc(t.shop)}</a></div></footer>
</body>
</html>
`;
  const dir = new URL("../app/" + (lg === "fr" ? "" : lg + "/"), import.meta.url); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(new URL("index.html", dir), html);
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(new URL("../sitemap.xml", import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + langs.map((x) => `  <url><loc>${url(x)}</loc><lastmod>${today}</lastmod></url>`).join("\n") + `\n  <url><loc>${SITE}/get/</loc><lastmod>${today}</lastmod></url>\n</urlset>\n`);
fs.writeFileSync(new URL("../robots.txt", import.meta.url), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log("pages :", langs.map(url).join(" "));
// les pages Swip réécrivent le plan de site complet (appli + Swip)
await import("./build-swip.mjs");
