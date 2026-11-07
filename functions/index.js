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
const { onValueCreated, onValueDeleted } = require("firebase-functions/v2/database");
const { getStorage } = require("firebase-admin/storage");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { ServerValue } = require("firebase-admin/database");
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
  if (m.uid === "litefoil-team") return; // météo / conseils de l'équipe : pas de notification
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
  let uids = String(event.params.pair).split("__").filter((u) => u && u !== m.uid);
  if (!uids.length) return;
  // réponse à « Équipe Lite Foil » : personne ne lit ce compte, on prévient les modérateurs
  if (uids.includes(TEAM_UID)) {
    const admins = adminUids();
    if (admins.length) {
      await sendToUids(admins, {
        type: "team-reply", channel: "dm:" + m.uid, peer: String(m.uid || ""), pseudo: String(m.pseudo || "Rider"),
        title: "💬 Réponse à l'équipe · " + (m.pseudo || "Rider"),
        body: m.text ? String(m.text).slice(0, 140) : "📷 Photo"
      });
    }
    uids = uids.filter((u) => u !== TEAM_UID);
    if (!uids.length) return;
  }
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
function adminUids() { return REPORT_ADMIN_UIDS.value().split(",").map((s) => s.trim()).filter(Boolean); }

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


/* ===================== Compte officiel « Équipe Lite Foil » =====================
 * uid réservé TEAM_UID : seul le serveur peut écrire sous ce nom (les riders ont des uid
 * anonymes aléatoires et les règles imposent uid === auth.uid). L'appli affiche le badge
 * « ✓ Équipe Lite Foil » pour ce uid et pour les comptes listés dans /official.
 *   - welcomeMember : message privé d'accueil à chaque nouveau membre
 *   - weekendWeather : chaque vendredi 17 h, météo du week-end dans chaque salon
 *   - weeklyTip : chaque mardi 18 h, un conseil adapté dans chaque salon
 * Le spot de la météo se règle dans functions/.env (TEAM_SPOT_NAME, TEAM_SPOT_LAT, TEAM_SPOT_LON). */
const TEAM_UID = "litefoil-team";
const TEAM_NAME = "Équipe Lite Foil";
const TEAM_AV = "https://cedric167.github.io/litefoil-tracker/icon-192.png";
const SPOT_NAME = defineString("TEAM_SPOT_NAME", { default: "Leucate – Le Barcarès" });
const SPOT_LAT = defineString("TEAM_SPOT_LAT", { default: "42.85" });
const SPOT_LON = defineString("TEAM_SPOT_LON", { default: "3.05" });
// salons de l'appli (mêmes clés que CHANS dans index.html)
const SALONS = ["efoil", "wing", "kite", "surf", "sup", "windsurf", "bodyboard", "skim", "kayak"];

async function ensureTeamProfile() {
  await getDatabase().ref("profiles/" + TEAM_UID).update({ pseudo: TEAM_NAME, av: TEAM_AV, bio: "Compte officiel de la marque Lite Foil", t: ServerValue.TIMESTAMP });
}
async function postOfficial(topic, text) {
  await getDatabase().ref("chat").push({ uid: TEAM_UID, pseudo: TEAM_NAME, av: TEAM_AV, text: String(text).slice(0, 400), topic, t: ServerValue.TIMESTAMP, lat: null, lng: null });
}

exports.welcomeMember = onValueCreated({ ref: "/profiles/{uid}", instance: DB_INSTANCE }, async (event) => {
  const uid = event.params.uid;
  if (uid === TEAM_UID) return;
  const db = getDatabase();
  const done = await db.ref("welcomed/" + uid).get();
  if (done.exists()) return;
  await db.ref("welcomed/" + uid).set(ServerValue.TIMESTAMP);
  await ensureTeamProfile();
  const p = event.data.val() || {};
  const text = "Bienvenue dans la communauté Lite Foil" + (p.pseudo ? ", " + p.pseudo : "") + " 👋\n" +
    "Ici tu trouves les riders près de chez toi, un salon par sport et les événements (sorties, sessions d'essai). " +
    "Présente-toi dans le salon de ton sport et n'hésite pas à organiser une sortie ! Bonne glisse 🤙";
  const pair = [uid, TEAM_UID].sort().join("__");
  await db.ref("dm/" + pair).push({ uid: TEAM_UID, pseudo: TEAM_NAME, av: TEAM_AV, text, t: ServerValue.TIMESTAMP });
  await db.ref("userDM/" + uid + "/" + TEAM_UID).set({ pseudo: TEAM_NAME, text: text.slice(0, 120), by: TEAM_UID, t: ServerValue.TIMESTAMP, unread: 1 });
});

// ---------- météo du week-end (Open-Meteo, gratuit, sans clé) ----------
const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const dirName = (d) => DIRS[Math.round(((+d || 0) % 360) / 45) % 8];
const kn = (kmh) => Math.round((+kmh || 0) / 1.852);
const fr1 = (x) => (Math.round((+x || 0) * 10) / 10).toString().replace(".", ",");

function verdict(salon, days) {
  const wind = Math.max(...days.map((d) => d.wind)), calmest = Math.min(...days.map((d) => d.wind));
  const wave = Math.max(...days.map((d) => d.wave)), flat = Math.min(...days.map((d) => d.wave));
  if (["efoil", "sup", "kayak"].includes(salon)) {
    if (calmest <= 12 && flat <= 0.6) return "👉 Au moins une journée calme : parfait pour sortir !";
    return "👉 Ça bouge pas mal : prudence, et privilégie les zones abritées.";
  }
  if (["wing", "kite", "windsurf"].includes(salon)) {
    if (wind >= 30) return "👉 Ça souffle fort : réservé aux riders confirmés, petite voile/aile !";
    if (wind >= 14) return "👉 Du vent ridable au programme, prépare ton matos 💨";
    if (wind >= 10) return "👉 Petit temps : sors la grande aile / la grande voile.";
    return "👉 Peu de vent prévu : plutôt un week-end eFoil ou paddle 😉";
  }
  if (wave >= 1) return "👉 De la houle au programme, ça devrait rouler 🌊";
  if (wave >= 0.6) return "👉 Petites vagues : de quoi s'amuser.";
  return "👉 Mer plutôt plate : bon plan pour l'eFoil 😉";
}

exports.weekendWeather = onSchedule({ schedule: "0 17 * * 5", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
  const lat = SPOT_LAT.value(), lon = SPOT_LON.value();
  const w = await (await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&daily=wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,temperature_2m_max&timezone=Europe%2FParis&forecast_days=4")).json();
  let m = {};
  try { m = await (await fetch("https://marine-api.open-meteo.com/v1/marine?latitude=" + lat + "&longitude=" + lon + "&daily=wave_height_max&timezone=Europe%2FParis&forecast_days=4")).json(); } catch (e) { m = {}; }
  const t = (w.daily && w.daily.time) || [];
  const days = [];
  t.forEach((iso, i) => {
    const wd = new Date(iso + "T12:00:00").getDay();
    if (wd !== 6 && wd !== 0) return;
    days.push({ label: wd === 6 ? "Sam." : "Dim.", wind: kn(w.daily.wind_speed_10m_max[i]), gust: kn(w.daily.wind_gusts_10m_max[i]),
      dir: dirName(w.daily.wind_direction_10m_dominant[i]), temp: Math.round(w.daily.temperature_2m_max[i]),
      wave: (m.daily && m.daily.wave_height_max && m.daily.wave_height_max[i] != null) ? +m.daily.wave_height_max[i] : 0 });
  });
  if (!days.length) return;
  await ensureTeamProfile();
  const lines = days.map((d) => d.label + " : 💨 " + d.wind + " nds " + d.dir + " (raf. " + d.gust + ") · 🌊 " + fr1(d.wave) + " m · " + d.temp + "°C").join("\n");
  for (const salon of SALONS) {
    await postOfficial(salon, "🌤️ Météo du week-end à " + SPOT_NAME.value() + "\n" + lines + "\n" + verdict(salon, days));
  }
});

// ---------- conseil de la semaine (un par salon, tourne chaque semaine) ----------
const TIPS = {
  efoil: [
    "Avant chaque sortie, vérifie la charge de la batterie ET de la télécommande. Garde toujours une marge pour le retour, surtout vent de face.",
    "Pour décoller en douceur : pieds bien centrés, accélère progressivement et laisse le foil monter tout seul. Trop de gaz d'un coup = chute assurée 😉",
    "Après chaque session en mer, rince la planche, le mât et l'hélice à l'eau douce, et laisse sécher avant de ranger.",
    "La règle d'or : garde 50 m des baigneurs et respecte la bande des 300 m. On partage le plan d'eau !"
  ],
  wing: [
    "Débutant ? Commence avec une grande planche volumineuse et un vent régulier de 15 à 20 nœuds.",
    "Regarde là où tu veux aller, pas tes pieds : le reste du corps suit naturellement.",
    "Ne t'attache jamais à la wing par le poignet sans leash quick-release. La sécurité d'abord.",
    "Rince ta wing à l'eau douce et sèche-la à l'ombre : le soleil abîme vite le tissu."
  ],
  kite: [
    "Vérifie tes lignes et ton système de largage avant chaque session, à chaque fois.",
    "Ne navigue jamais seul et préviens quelqu'un de ta zone de navigation.",
    "Vent offshore (de terre vers la mer) = danger : reste au sol ce jour-là.",
    "Garde une bonne distance de sécurité avec les autres kites au décollage et à l'atterrissage."
  ],
  surf: [
    "Observe le spot 10 minutes avant d'entrer : séries, courants et zones de baïne.",
    "Priorité au surfeur le plus proche du pic : on ne taxe pas la vague 🤙",
    "Échauffe-toi avant d'entrer à l'eau : épaules, hanches, chevilles.",
    "Attache ton leash à la jambe arrière et vérifie-le régulièrement."
  ],
  sup: [
    "Ta pagaie bien réglée : environ 15 à 20 cm au-dessus de ta tête.",
    "Le leash, même sur un lac : une planche qui s'éloigne au vent va plus vite que toi à la nage.",
    "Regarde l'horizon et garde les genoux légèrement fléchis pour un meilleur équilibre.",
    "Vent de terre ? Reste près du bord, le retour peut devenir très difficile."
  ],
  windsurf: [
    "Vérifie le pied de mât et le wishbone avant de partir : une casse au large, c'est long à rentrer.",
    "Bras tendus, corps vers l'arrière : laisse le harnais faire le travail.",
    "Adapte ta voile au vent du jour : mieux vaut un peu sous-toilé que débordé.",
    "Ne navigue jamais seul par vent fort et préviens quelqu'un de ta zone."
  ],
  bodyboard: [
    "Palmes bien ajustées et leash au biceps : les deux indispensables.",
    "Rentre au line-up par les zones de courant de retour, mais sors-en dès que tu es au pic.",
    "Rince ta planche et ne la laisse pas en plein soleil, la mousse déteste la chaleur.",
    "Respecte les priorités : celui qui est le plus près du pic a la vague."
  ],
  skim: [
    "Choisis du sable bien mouillé et une fine pellicule d'eau : c'est là que la planche glisse le mieux.",
    "Lance la planche à plat et bas, puis saute dessus pieds au centre.",
    "Commence sur le plat avant d'aller chercher les vagues du bord.",
    "Wax ou pad sur le pont : sans grip, chute garantie 😄"
  ],
  kayak: [
    "Gilet de sauvetage toujours porté, pas juste rangé dans le kayak.",
    "Pars face au vent et rentre vent dans le dos : le retour sera bien plus facile.",
    "Préviens quelqu'un de ton parcours et de ton heure de retour.",
    "Un sac étanche pour le téléphone, l'eau et une collation : indispensable sur les longues sorties."
  ]
};

exports.weeklyTip = onSchedule({ schedule: "0 18 * * 2", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
  const week = Math.floor(Date.now() / (7 * 86400000));
  await ensureTeamProfile();
  for (const salon of SALONS) {
    const list = TIPS[salon] || [];
    if (!list.length) continue;
    await postOfficial(salon, "💡 Conseil de la semaine\n" + list[week % list.length]);
  }
});


/* ===================== Vidéos des riders =====================
 * Quand une vidéo est supprimée (par son auteur ou par un modérateur), on efface aussi
 * le fichier dans Firebase Storage pour ne pas payer son stockage. */
const VIDEO_BUCKET = "litefoil-communaute-222fd.firebasestorage.app";
exports.videoCleanup = onValueDeleted({ ref: "/videos/{vid}", instance: DB_INSTANCE }, async (event) => {
  const v = event.data.val() || {};
  if (!v.path || !/^videos\//.test(v.path)) return;
  try { await getStorage().bucket(VIDEO_BUCKET).file(v.path).delete(); } catch (e) { console.warn("videoCleanup :", e.message); }
});
