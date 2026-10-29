/* Lite Foil — notifications « appli fermée » du chat Communauté.
 *
 * Deux déclencheurs Realtime Database (région europe-west1) :
 *   - chatPush : nouveau message de salon  (/chat/{id})
 *   - dmPush   : nouveau message privé      (/dm/{pair}/{id}, pair = uidA__uidB)
 *
 * Chaque appareil enregistre son jeton FCM dans /pushTokens/{uid}/{clé} = {token, pseudo, t}
 * (écrit par l'appli). On envoie un message « data-only » : le service worker
 * (firebase-messaging-compat, voir sw.js) affiche la notification et gère le canal.
 * Les jetons périmés sont supprimés automatiquement.
 */
const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
setGlobalOptions({ region: "europe-west1" });

// Clé secrète d'application SportsTrackLive : gardée côté serveur (Secret Manager),
// jamais exposée dans la page. Réglée par :
//   firebase functions:secrets:set STL_SECRET_KEY --data-file -
const STL_SECRET_KEY = defineSecret("STL_SECRET_KEY");

/* Connexion SportsTrackLive (proxy).
 * La page envoie {email, password} ; la fonction ajoute la clé secrète d'app et
 * renvoie {token, user}. Le mot de passe transite en HTTPS et n'est jamais stocké. */
exports.stlAuth = onRequest(
  { region: "europe-west1", secrets: [STL_SECRET_KEY], cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
    const body = req.body || {};
    const email = body.email, password = body.password;
    if (!email || !password) { res.status(400).json({ error: "email et mot de passe requis" }); return; }
    try {
      const r = await fetch("https://api.sportstracklive.com/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-STL-Secret-Key": STL_SECRET_KEY.value() },
        body: JSON.stringify({ email, password, origin: "external" })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) { res.status(401).json({ error: "identifiants refusés" }); return; }
      // user.id = user_id STL ; on ne renvoie que le strict nécessaire.
      res.json({ token: j.token, user: j.user || null });
    } catch (e) {
      res.status(502).json({ error: "SportsTrackLive injoignable" });
    }
  }
);

const DB_INSTANCE = "litefoil-communaute-222fd-default-rtdb";
const APP_URL = "https://cedric167.github.io/litefoil-tracker/?tab=communaute";
const CHANS = {
  general: "Général", efoil: "eFoil", wing: "Wing Foil", kite: "Kitesurf",
  surf: "Surf", sup: "Paddle", windsurf: "Windsurf", bodyboard: "Bodyboard",
  skim: "Skimboard", kayak: "Kayak"
};

// Envoie un message data-only à tous les jetons des utilisateurs donnés, puis nettoie
// les jetons que FCM signale comme invalides.
async function sendToUids(uids, data) {
  const db = getDatabase();
  const tokens = [];
  const pathByToken = {};
  for (const uid of uids) {
    const snap = await db.ref("pushTokens/" + uid).get();
    const v = snap.val() || {};
    for (const key in v) {
      const tok = v[key] && v[key].token;
      if (tok && !pathByToken[tok]) { tokens.push(tok); pathByToken[tok] = "pushTokens/" + uid + "/" + key; }
    }
  }
  if (!tokens.length) return;

  const resp = await getMessaging().sendEachForMulticast({
    tokens,
    data,
    android: { priority: "high" },
    webpush: { headers: { Urgency: "high" }, fcmOptions: { link: APP_URL } }
  });

  const dead = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-argument" ||
          code === "messaging/invalid-registration-token") {
        const p = pathByToken[tokens[i]];
        if (p) dead.push(db.ref(p).remove().catch(() => {}));
      }
    }
  });
  if (dead.length) await Promise.all(dead);
}

exports.chatPush = onValueCreated({ ref: "/chat/{id}", instance: DB_INSTANCE }, async (event) => {
  const m = event.data.val() || {};
  if (!m.text) return;
  const topic = m.topic || "general";
  const ch = CHANS[topic] || "Chat";
  const db = getDatabase();
  const all = await db.ref("pushTokens").get();
  const uids = Object.keys(all.val() || {}).filter((u) => u !== m.uid);
  if (!uids.length) return;
  await sendToUids(uids, {
    type: "chat",
    channel: topic,
    title: (m.pseudo || "Rider") + " · " + ch,
    body: String(m.text).slice(0, 140)
  });
});

exports.dmPush = onValueCreated({ ref: "/dm/{pair}/{id}", instance: DB_INSTANCE }, async (event) => {
  const m = event.data.val() || {};
  if (!m.text) return;
  const uids = String(event.params.pair).split("__").filter((u) => u && u !== m.uid);
  if (!uids.length) return;
  await sendToUids(uids, {
    type: "dm",
    channel: "dm",
    title: (m.pseudo || "Rider") + " · Message privé",
    body: String(m.text).slice(0, 140)
  });
});

exports.groupPush = onValueCreated({ ref: "/groupMessages/{gid}/{id}", instance: DB_INSTANCE }, async (event) => {
  const m = event.data.val() || {};
  if (!m.text && !m.img) return;
  const gid = event.params.gid;
  const db = getDatabase();
  const gsnap = await db.ref("groups/" + gid).get();
  const g = gsnap.val() || {};
  const members = g.members ? Object.keys(g.members) : [];
  const uids = members.filter((u) => u !== m.uid);
  if (!uids.length) return;
  await sendToUids(uids, {
    type: "group",
    channel: "group:" + gid,
    title: (g.name || "Groupe") + " · " + (m.pseudo || "Rider"),
    body: m.text ? String(m.text).slice(0, 140) : "📷 Photo"
  });
});
