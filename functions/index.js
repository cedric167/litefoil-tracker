/* Lite Foil — notifications « appli fermée » du chat Communauté.
 *
 * Déclencheurs Realtime Database (région europe-west1) :
 *   - chatPush : nouveau message de salon public (/chat/{id}) : appli web seulement, sans chiffre
 *   - dmPush   : nouveau message privé      (/dm/{pair}/{id}, pair = uidA__uidB)
 *   - groupPush : message d'un groupe privé (/groupMessages/{gid}/{id})
 *   - eventChatPush : discussion d'un événement (/eventMessages/{eid}/{id}), aux inscrits
 *   - reportAlert : nouveau signalement      (/reports/{id}), envoyé aux modérateurs
 *
 * Chaque appareil enregistre son jeton FCM dans /pushTokens/{uid}/{clé} = {token, pseudo, plat, t}
 * (plat = "ios" | "android" | "web"). Appli web : message « data-only », le service worker
 * affiche la notification. Applis iPhone/Android : vraie notification + chiffre sur l'icône.
 * Le chiffre = somme de /unread/{uid}/{conversation} (+1 à chaque message, remis à zéro
 * par l'appli quand on lit). Les jetons périmés sont supprimés automatiquement.
 */
const { onValueCreated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
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

// +1 non-lu pour chaque destinataire sur cette conversation ; renvoie {uid: total non-lus}
// (le total sert de chiffre sur l'icône de l'appli).
async function bumpUnread(uids, key) {
  const db = getDatabase();
  const badges = {};
  await Promise.all(uids.map(async (uid) => {
    await db.ref("unread/" + uid + "/" + key).transaction((n) => (+n || 0) + 1);
    const all = (await db.ref("unread/" + uid).get()).val() || {};
    badges[uid] = Object.values(all).reduce((a, n) => a + (+n || 0), 0);
  }));
  return badges;
}

// Envoie la notification à tous les appareils des utilisateurs donnés, puis nettoie
// les jetons que FCM signale comme invalides.
//   opts.badges : {uid: nombre} → chiffre sur l'icône (applis natives)
//   opts.webOnly : n'envoie qu'à l'appli web (salons publics : pas de notif sur les téléphones)
async function sendToUids(uids, data, opts) {
  opts = opts || {};
  const db = getDatabase();
  const messages = [];
  const paths = [];
  const seen = {};
  for (const uid of uids) {
    const snap = await db.ref("pushTokens/" + uid).get();
    const v = snap.val() || {};
    for (const key in v) {
      const tok = v[key] && v[key].token;
      if (!tok || seen[tok]) continue;
      seen[tok] = true;
      const plat = (v[key] && v[key].plat) || "web";
      const native = plat === "ios" || plat === "android";
      if (native && opts.webOnly) continue;
      const badge = opts.badges && opts.badges[uid] != null ? opts.badges[uid] : undefined;
      let msg;
      if (native) {
        msg = {
          token: tok,
          notification: { title: data.title, body: data.body },
          data,
          apns: { payload: { aps: Object.assign({ sound: "default", "thread-id": data.channel || "lf" }, badge != null ? { badge } : {}) } },
          android: { priority: "high", notification: Object.assign({ sound: "default", tag: data.channel || "lf" }, badge != null ? { notificationCount: badge } : {}) }
        };
      } else {
        msg = {
          token: tok,
          data,
          android: { priority: "high" },
          webpush: { headers: { Urgency: "high" }, fcmOptions: { link: APP_URL } }
        };
      }
      messages.push(msg);
      paths.push("pushTokens/" + uid + "/" + key);
    }
  }
  if (!messages.length) return;

  const dead = [];
  for (let i = 0; i < messages.length; i += 500) {
    const resp = await getMessaging().sendEach(messages.slice(i, i + 500));
    resp.responses.forEach((r, j) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-argument" ||
            code === "messaging/invalid-registration-token") {
          dead.push(db.ref(paths[i + j]).remove().catch(() => {}));
        }
      }
    });
  }
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
  }, { webOnly: true });
});

exports.dmPush = onValueCreated({ ref: "/dm/{pair}/{id}", instance: DB_INSTANCE }, async (event) => {
  const m = event.data.val() || {};
  if (!m.text && !m.img) return;
  const uids = String(event.params.pair).split("__").filter((u) => u && u !== m.uid);
  if (!uids.length) return;
  const badges = await bumpUnread(uids, "d_" + m.uid);
  await sendToUids(uids, {
    type: "dm",
    channel: "dm:" + m.uid,
    peer: String(m.uid || ""),
    pseudo: String(m.pseudo || "Rider"),
    title: (m.pseudo || "Rider") + " · Message privé",
    body: m.text ? String(m.text).slice(0, 140) : "📷 Photo"
  }, { badges });
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
  const badges = await bumpUnread(uids, "g_" + gid);
  await sendToUids(uids, {
    type: "group",
    channel: "group:" + gid,
    gid: String(gid),
    title: (g.name || "Groupe") + " · " + (m.pseudo || "Rider"),
    body: m.text ? String(m.text).slice(0, 140) : "📷 Photo"
  }, { badges });
});

exports.eventChatPush = onValueCreated({ ref: "/eventMessages/{eid}/{id}", instance: DB_INSTANCE }, async (event) => {
  const m = event.data.val() || {};
  if (!m.text && !m.img) return;
  const eid = event.params.eid;
  const db = getDatabase();
  const e = (await db.ref("events/" + eid).get()).val() || {};
  if (e.cancelled) return;
  const set = Object.assign({}, e.att || {});
  if (e.by) set[e.by] = true;
  const uids = Object.keys(set).filter((u) => u !== m.uid);
  if (!uids.length) return;
  const badges = await bumpUnread(uids, "e_" + eid);
  await sendToUids(uids, {
    type: "event",
    channel: "ev:" + eid,
    eid: String(eid),
    title: "📅 " + (e.title || "Événement") + " · " + (m.pseudo || "Rider"),
    body: m.text ? String(m.text).slice(0, 140) : "📷 Photo"
  }, { badges });
});

/* Signalements (charte de la communauté) : prévient l'équipe Lite Foil à chaque nouveau
 * signalement, pour le traiter sous 24 h (exigence Apple, règle 1.2).
 * Les identifiants (uid) des modérateurs sont dans functions/.env :
 *   REPORT_ADMIN_UIDS=uid1,uid2
 * Chaque modérateur reçoit la notification sur les appareils où il a activé les
 * notifications du chat. Le signalement reste dans /reports ; on y note l'envoi. */
const REPORT_ADMIN_UIDS = defineString("REPORT_ADMIN_UIDS", { default: "" });

exports.reportAlert = onValueCreated({ ref: "/reports/{id}", instance: DB_INSTANCE }, async (event) => {
  const r = event.data.val() || {};
  const admins = REPORT_ADMIN_UIDS.value().split(",").map((s) => s.trim()).filter(Boolean);
  if (!admins.length) { console.warn("reportAlert : REPORT_ADMIN_UIDS vide, personne n'est prévenu"); return; }
  const what = r.type === "message" ? "Message" : "Rider";
  const target = r.targetPseudo || r.targetUid || "inconnu";
  await sendToUids(admins, {
    type: "report",
    channel: "report",
    title: "⚠️ Signalement · " + what + " de " + target,
    body: (r.text ? "« " + String(r.text).slice(0, 100) + " » · " : "") + "signalé par " + (r.byPseudo || r.by || "un rider")
  });
  await event.data.ref.child("alertSentTo").set(admins);
});
