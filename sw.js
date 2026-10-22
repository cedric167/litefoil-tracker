// Service worker for the Lite Foil Tracker page: makes it installable ("add to home
// screen") and keeps it usable without network — the Bluetooth link to the tracker
// needs none. Bump CACHE when the page changes so installed copies refresh.
const CACHE = "lf-tracker-v60";

// Firebase Cloud Messaging : notifications « appli fermée ». Le worker reçoit le push
// envoyé par la Cloud Function et affiche la notification même quand l'appli n'est pas
// ouverte. Message « data-only » → c'est onBackgroundMessage qui crée la notif (routage
// par canal via notificationclick plus bas). Enveloppé dans try : si gstatic est
// injoignable à l'install, le reste du worker (cache hors-ligne) continue de fonctionner.
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js"
  );
  firebase.initializeApp({
    apiKey: "AIzaSyDy4jhamkjtl3_QDZwBNzU-5byGLX4oyho",
    projectId: "litefoil-communaute-222fd",
    messagingSenderId: "698343293796",
    appId: "1:698343293796:web:1224a9819fbcc6cee4f071"
  });
  firebase.messaging().onBackgroundMessage((payload) => {
    const d = (payload && payload.data) || {};
    const channel = d.channel || "general";
    self.registration.showNotification(d.title || "Nouveau message", {
      body: d.body || "",
      tag: "lf-" + channel,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { channel }
    });
  });
} catch (e) { /* FCM indisponible : les notifs « appli ouverte » restent assurées par la page */ }
const ASSETS = ["./", "./index.html", "./i18n/i18n.js", "./i18n/en.json", "./i18n/es.json", "./manifest.json", "./icon-192.png", "./icon-512.png", "./litefoil-logo.png", "./confidentialite.html",
  "./vesc/", "./vesc/index.html", "./vesc/css/app.css", "./vesc/js/app.js", "./vesc/js/vesc.js", "./vesc/js/protocol.js",
  "./vesc/js/config.js", "./vesc/js/transport.js", "./vesc/js/sim.js",
  "./vesc/js/ui.js", "./vesc/js/lock.js", "./vesc/js/diag.js", "./vesc/js/essentials.js", "./vesc/js/remote.js", "./vesc/js/session.js",
  "./vesc/js/profiles.js",
  "./bms/", "./bms/index.html", "./bms/css/bms.css", "./bms/js/app.js", "./bms/js/protocol.js", "./vesc/img/motors/motor_6579.svg", "./vesc/img/propeller.webp", "./vesc/config/index.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Clic sur une notification de message : focalise l'appli (ou l'ouvre) et demande
// d'aller sur l'onglet Communauté + le bon canal.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const channel = (event.notification.data && event.notification.data.channel) || null;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try { c.postMessage({ type: "notif-open", channel }); } catch (e) {}
      if ("focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("./?tab=communaute");
  })());
});

// Network first (so a republished page shows up), cache as the fallback. Requests to
// other origins (the sportstracklive API) are left alone.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(
    // no-cache : le navigateur redemande toujours au serveur (ETag), sinon une version vieille
    // de 10 minutes pouvait rester affichée après une publication.
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html")))
  );
});
