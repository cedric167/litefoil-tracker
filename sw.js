// Service worker for the Lite Foil Tracker page: makes it installable ("add to home
// screen") and keeps it usable without network — the Bluetooth link to the tracker
// needs none. Bump CACHE when the page changes so installed copies refresh.
const CACHE = "lf-tracker-v38";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./litefoil-logo.png", "./confidentialite.html",
  "./vesc/", "./vesc/index.html", "./vesc/css/app.css", "./vesc/js/app.js", "./vesc/js/vesc.js", "./vesc/js/protocol.js",
  "./vesc/js/config.js", "./vesc/js/transport.js", "./vesc/js/sim.js",
  "./vesc/js/ui.js", "./vesc/js/diag.js", "./vesc/js/essentials.js", "./vesc/js/remote.js", "./vesc/js/session.js",
  "./vesc/js/profiles.js",
  "./bms/", "./bms/index.html", "./bms/css/bms.css", "./bms/js/app.js", "./bms/js/daly.js", "./vesc/img/motors/maytech_6579.svg", "./vesc/img/propeller.webp", "./vesc/config/index.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
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
