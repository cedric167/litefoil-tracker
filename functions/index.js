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
  general: "Général", efoil: "eFoil", wing: "Wing Foil", parawing: "Para wing", windsurf: "Windsurf",
  pumpfoil: "Pump foil", kite: "Kitesurf", surffoil: "Surf foil", supdownwind: "SUP Downwind",
  surf: "Surf", bodyboard: "Bodyboard", sup: "Paddle", kayak: "Canoë / Kayak", deriveur: "Dériveur",
  jetski: "Jetski", skim: "Skimboard", running: "Running", marche: "Marche athlétique", rando: "Randonnée",
  trail: "Trail", velo: "Vélo", ski: "Ski", snowboard: "Snowboard", skate: "Skateboard", longboard: "Longboard",
  surfskate: "Surfskate", roller: "Roller", longueur: "Saut en longueur", perche: "Saut à la perche", parapente: "Parapente"
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
  // 14/11 : appel audio ou vidéo → notification d'appel (l'appli sonne dès qu'on l'ouvre, pendant 60 s)
  if (m.call) {
    await sendToUids(uids, {
      type: "call", channel: "dm:" + m.uid, peer: String(m.uid || ""), pseudo: String(m.pseudo || "Rider"),
      title: (m.call.k === "v" ? "📹 " : "📞 ") + (m.pseudo || "Rider") + " t'appelle",
      body: (m.call.k === "v" ? "Appel vidéo" : "Appel audio") + " Lite Foil · appuie pour répondre"
    }, { badges });
    return;
  }
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

/* Nouvel abonné (12/11) : /follows/{uid}/{target} créé → notification à {target}.
 * Anti-abus : une seule notification par abonné et par jour (s'abonner / se désabonner en boucle). */
exports.followPush = onValueCreated({ ref: "/follows/{uid}/{target}", instance: DB_INSTANCE }, async (event) => {
  const { uid, target } = event.params;
  if (!uid || !target || uid === target) return;
  const db = getDatabase();
  const ref = db.ref("followNotified/" + target + "/" + uid);
  const last = +((await ref.get()).val() || 0);
  if (Date.now() - last < 86400000) return;
  await ref.set(Date.now());
  const ps = (await db.ref("profiles/" + uid + "/pseudo").get()).val() || "Un rider";
  await sendToUids([target], {
    type: "follow",
    channel: "follow:" + uid,
    follower: String(uid),
    pseudo: String(ps),
    title: "Nouvel abonné 🤙",
    body: ps + " a commencé à te suivre"
  });
});

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
  if (v.posterPath && /^videos\//.test(v.posterPath)) { try { await getStorage().bucket(VIDEO_BUCKET).file(v.posterPath).delete(); } catch (e) { /* déjà supprimée */ } }
});

/* ===================== Stories (13/11) =====================
 * Une story (photo ou vidéo courte) est visible 24 h. Toutes les heures, celles qui ont expiré sont
 * supprimées : fiche /stories/{id}, photo /storyMedia/{id}, vues /storyViews/{id} et fichier vidéo. */
exports.storyCleanup = onSchedule({ schedule: "every 60 minutes", region: "europe-west1" }, async () => {
  const db = getDatabase();
  const snap = await db.ref("/stories").orderByChild("t").endAt(Date.now() - 24 * 3600 * 1000).get();
  const old = [];
  snap.forEach((c) => { old.push([c.key, c.val() || {}]); });
  for (const [id, s] of old) {
    if (s.path && /^videos\//.test(s.path)) { try { await getStorage().bucket(VIDEO_BUCKET).file(s.path).delete(); } catch (e) { /* déjà supprimé */ } }
    await db.ref().update({ ["stories/" + id]: null, ["storyMedia/" + id]: null, ["storyViews/" + id]: null });
  }
  if (old.length) console.log("stories expirées supprimées :", old.length);
});

/* ===================== Vidéos fluides (11/11) =====================
 * Les vidéos publiées arrivent telles que filmées : 4K, 60 i/s, HEVC (iPhone), 20 à 40 Mo,
 * parfois avec l'index du fichier à la fin. Sur beaucoup d'Android, elles démarrent lentement,
 * saccadent, ou ne se lisent pas du tout. Chaque vidéo est donc réencodée au format des
 * applis de vidéos courtes : H.264 720p, 30 i/s, environ 2,5 Mbit/s, son AAC, index au début
 * (« faststart » : la lecture démarre dès les premiers octets). La fiche /videos/{vid} pointe
 * ensuite vers cette version ; l'original est supprimé pour ne pas payer deux fois le stockage.
 *  - videoOptimize : à chaque nouvelle vidéo.
 *  - videoOptimizeBacklog : toutes les heures, rattrape les vidéos déjà en ligne et les échecs.
 */
const { execFile } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpegPath = require("ffmpeg-static");
const VIDEO_OPTS = { memory: "2GiB", cpu: 2, timeoutSeconds: 540 };

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).slice(-600))) : resolve());
  });
}
// Arguments ffmpeg (exportés pour les tester en local avec le même réglage).
function ffmpegArgs(src, dst) {
  return ["-y", "-i", src, "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))',fps=30,format=yuv420p",
    "-c:v", "libx264", "-profile:v", "main", "-level", "4.0", "-preset", "veryfast", "-crf", "25",
    "-maxrate", "2800k", "-bufsize", "5600k", "-g", "60",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart", "-t", "65", dst];
}
/* Affiche de la vidéo (13/11) : une image JPEG de 720 px de large tirée de la vidéo, pour les aperçus de lien
 * (Facebook, WhatsApp, Messenger…). La miniature de l'appli (360 px) est trop petite : Facebook l'affiche en
 * vignette. Avec une grande image, le lien partagé s'affiche en grand, et un toucher ouvre la vidéo. */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
async function posterFrom(bucket, file, videoPath, tmp) {
  const jpg = path.join(tmp, "poster.jpg");
  const args = (ss) => ["-y"].concat(ss ? ["-ss", ss] : [], ["-i", file, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", jpg]);
  try { await runFfmpeg(args("1")); } catch (e) { /* vidéo de moins d'une seconde : première image */ }
  if (!fs.existsSync(jpg) || !fs.statSync(jpg).size) await runFfmpeg(args(""));
  const sz = jpegSize(fs.readFileSync(jpg)) || {};
  const posterPath = videoPath.replace(/\.[^./]+$/, "") + ".jpg";
  const token = crypto.randomUUID();
  await bucket.upload(jpg, { destination: posterPath, metadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000", metadata: { firebaseStorageDownloadTokens: token } } });
  return { poster: "https://firebasestorage.googleapis.com/v0/b/" + VIDEO_BUCKET + "/o/" + encodeURIComponent(posterPath) + "?alt=media&token=" + token, posterPath, pw: sz.w || 0, ph: sz.h || 0 };
}
// vidéos déjà optimisées avant le 13/11 : on ajoute seulement l'affiche
async function posterOnly(vid, v) {
  if (!v || !v.path || !/^videos\//.test(v.path) || v.poster) return;
  const ref = getDatabase().ref("/videos/" + vid);
  const bucket = getStorage().bucket(VIDEO_BUCKET);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lfp-"));
  try {
    const src = path.join(tmp, "src");
    await bucket.file(v.path).download({ destination: src });
    const post = await posterFrom(bucket, src, v.path, tmp);
    const still = await ref.child("uid").get();
    if (!still.exists()) { await bucket.file(post.posterPath).delete().catch(() => {}); return; }
    await ref.update(post);
    console.log("affiche créée", vid);
  } catch (e) {
    console.warn("posterOnly", vid, e.message);
    await ref.update({ posterTries: (+v.posterTries || 0) + 1 }).catch(() => {});
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
async function optimizeVideo(vid, v) {
  const db = getDatabase();
  const ref = db.ref("/videos/" + vid);
  if (!v || !v.path || !/^videos\//.test(v.path) || v.opt === 1) return;
  if (/_lf\.mp4$/.test(v.path)) { await ref.update({ opt: 1 }); return; }
  const bucket = getStorage().bucket(VIDEO_BUCKET);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lfv-"));
  const src = path.join(tmp, "src"), dst = path.join(tmp, "out.mp4");
  try {
    await bucket.file(v.path).download({ destination: src });
    await runFfmpeg(ffmpegArgs(src, dst));
    const newPath = v.path.replace(/\.[^./]+$/, "") + "_lf.mp4";
    const token = crypto.randomUUID();
    await bucket.upload(dst, { destination: newPath, metadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000", metadata: { firebaseStorageDownloadTokens: token } } });
    const url = "https://firebasestorage.googleapis.com/v0/b/" + VIDEO_BUCKET + "/o/" + encodeURIComponent(newPath) + "?alt=media&token=" + token;
    // la vidéo a pu être supprimée pendant le traitement : on ne recrée pas sa fiche
    let post = {};
    try { post = await posterFrom(bucket, dst, newPath, tmp); } catch (e) { console.warn("affiche", vid, e.message); }
    const still = await ref.child("uid").get();
    if (!still.exists()) { await bucket.file(newPath).delete().catch(() => {}); if (post.posterPath) await bucket.file(post.posterPath).delete().catch(() => {}); return; }
    await ref.update(Object.assign({ url, path: newPath, opt: 1, optSize: fs.statSync(dst).size }, post));
    await bucket.file(v.path).delete().catch(() => {});
    console.log("vidéo optimisée", vid, v.path, "->", newPath);
  } catch (e) {
    console.warn("optimizeVideo", vid, e.message);
    await ref.update({ optTries: (+v.optTries || 0) + 1 }).catch(() => {});
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
exports.videoOptimize = onValueCreated({ ref: "/videos/{vid}", instance: DB_INSTANCE, ...VIDEO_OPTS }, async (event) => {
  await optimizeVideo(event.params.vid, event.data.val());
});
exports.videoOptimizeBacklog = onSchedule({ schedule: "every 60 minutes", region: "europe-west1", ...VIDEO_OPTS }, async () => {
  const snap = await getDatabase().ref("/videos").get();
  const todo = [];
  snap.forEach((c) => { const v = c.val(); if (v && v.path && v.opt !== 1 && (+v.optTries || 0) < 3) todo.push([c.key, v]); });
  for (const [vid, v] of todo.slice(0, 6)) await optimizeVideo(vid, v);
  // affiches manquantes des vidéos déjà optimisées (rapide : une image par vidéo)
  const noPoster = [];
  snap.forEach((c) => { const v = c.val(); if (v && v.path && v.opt === 1 && !v.poster && (+v.posterTries || 0) < 3) noPoster.push([c.key, v]); });
  for (const [vid, v] of noPoster.slice(0, 20)) await posterOnly(vid, v);
});

/* ===================== Pages publiques de partage (12/11) =====================
 * Lien d'une vidéo ou d'un profil partagé sur WhatsApp, Instagram, Facebook… : la personne qui le reçoit
 * voit la vidéo / le profil tout de suite, sans compte, avec un bouton « Rejoindre Lite Foil ».
 * Hébergement Firebase : /v/{id} (vidéo), /u/{pseudo} (profil), /t/{id} (miniature), /a/{uid} (photo de profil).
 * Les aperçus WhatsApp / Facebook / Messenger affichent la miniature et la légende (balises Open Graph).
 * Seules les infos déjà visibles dans le Swip sont montrées (pseudo, photo, légende, vidéo, J'aime) : jamais
 * de position, d'e-mail ni de message. */
const SHARE_APP = "https://cedric167.github.io/litefoil-tracker/";
const SHARE_ICON = SHARE_APP + "icon-192.png"; // icône de l'appli Lite Foil
const SHARE_PLAY = "https://play.google.com/store/apps/details?id=fr.litefoil.tracker"; // Android
const SHARE_IOS = "https://testflight.apple.com/join/QpqQEWFN"; // iPhone : bêta publique TestFlight (à remplacer par le lien App Store à la sortie)
function escH(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function sendDataUrl(res, du) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(du || ""));
  if (!m) { if (/^https?:\/\//.test(String(du || ""))) return res.redirect(302, du); return res.status(404).send("introuvable"); }
  res.set("Cache-Control", "public, max-age=86400"); res.type(m[1]); return res.send(Buffer.from(m[2], "base64"));
}
function likesN(v) { return Object.keys((v && v.likes) || {}).filter((k) => v.likes[k]).length; }
function fmtN(n) { return n >= 1e6 ? (Math.round(n / 1e5) / 10 + " M") : n >= 1e4 ? (Math.round(n / 100) / 10 + " k") : String(n); }
const SHARE_CSS = `*{box-sizing:border-box;margin:0;padding:0}html,body{background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:inherit;text-decoration:none}.top{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent)}
.brand{font-weight:800;letter-spacing:.18em;font-size:15px}.brand i{font-style:normal;color:#19e3ff}.open{background:#fff;color:#000;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px}
.vid{position:relative;height:100svh;height:100vh;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden}.vid video{width:100%;height:100%;object-fit:cover}
.info{position:absolute;left:14px;right:14px;bottom:150px;z-index:3;text-shadow:0 1px 4px rgba(0,0,0,.6)}.info b{font-size:17px}.info p{margin-top:6px;font-size:15px;line-height:1.38}.info .likes{display:inline-block;margin-top:8px;font-weight:700;font-size:14px;background:rgba(0,0,0,.35);padding:5px 10px;border-radius:999px}
.snd{position:absolute;top:calc(env(safe-area-inset-top) + 84px);left:50%;transform:translateX(-50%);z-index:4;white-space:nowrap;background:rgba(0,0,0,.55);border:0;color:#fff;font:inherit;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px}
.shade{position:absolute;left:0;right:0;bottom:0;height:55%;background:linear-gradient(0deg,rgba(0,0,0,.85),transparent);z-index:2;pointer-events:none}
.cta{position:fixed;left:12px;right:12px;bottom:max(14px,env(safe-area-inset-bottom));z-index:6;background:rgba(255,255,255,.97);color:#0e1417;border-radius:20px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.cta .ic{width:52px;height:52px;border-radius:14px;object-fit:cover;flex:none;box-shadow:0 2px 8px rgba(0,0,0,.25)}.cta .t{flex:1;min-width:0}.cta b{display:block;font-size:15px}.cta small{display:block;color:#5b6b71;font-size:12.5px;margin-top:2px}
.go{flex:none;background:linear-gradient(135deg,#1fc3cd,#118b92);color:#fff;font-weight:800;font-size:14.5px;padding:12px 16px;border-radius:12px}
.stores{display:flex;gap:8px;margin-top:8px}.stores a{font-size:12px;font-weight:700;color:#118b92}
.pf{max-width:560px;margin:0 auto;padding:72px 16px 170px}.pf-h{display:flex;flex-direction:column;align-items:center;text-align:center}.pf-av{width:104px;height:104px;border-radius:50%;object-fit:cover;background:#1d2b30;box-shadow:0 0 0 3px #19c3cf;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800}
.pf-h h1{font-size:21px;margin-top:12px}.pf-h .nk{color:#9aa6b0;font-size:14px;margin-top:2px}.pf-h .bio{margin-top:10px;font-size:15px;line-height:1.4;white-space:pre-line;color:#dbe4e7}
.nums{display:flex;justify-content:center;gap:28px;margin:16px 0 18px}.nums div{text-align:center}.nums b{display:block;font-size:19px}.nums span{font-size:12.5px;color:#9aa6b0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}.grid a{position:relative;aspect-ratio:3/4;background:#1d2b30 center/cover no-repeat}.grid a span{position:absolute;left:6px;bottom:5px;font-size:12.5px;font-weight:700;text-shadow:0 1px 3px #000}
.empty{text-align:center;color:#9aa6b0;padding:40px 0}`;
function sharePageHtml(o) {
  const store = "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escH(o.title)}</title><meta name="description" content="${escH(o.desc)}">
<meta property="og:site_name" content="Lite Foil"><meta property="og:title" content="${escH(o.title)}"><meta property="og:description" content="${escH(o.desc)}">
<meta property="og:url" content="${escH(o.url)}">${o.img ? `<meta property="og:image" content="${escH(o.img)}"><meta property="og:image:secure_url" content="${escH(o.img)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="${+o.iw || 360}"><meta property="og:image:height" content="${+o.ih || 640}"><meta name="twitter:image" content="${escH(o.img)}">` : ""}
${o.video ? `<meta property="og:type" content="video.other"><meta property="og:video" content="${escH(o.video)}"><meta property="og:video:secure_url" content="${escH(o.video)}"><meta property="og:video:type" content="video/mp4"><meta property="og:video:width" content="720"><meta property="og:video:height" content="1280">` : `<meta property="og:type" content="profile">`}
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="${SHARE_ICON}"><link rel="apple-touch-icon" href="${SHARE_ICON}"><meta name="theme-color" content="#000000"><style>${SHARE_CSS}</style></head><body>
<div class="top"><a class="brand" href="${escH(o.app)}">LITE <i>FOIL</i></a><a class="open" href="${escH(o.app)}">Ouvrir l'appli</a></div>
${o.body}
<div class="cta"><img class="ic" src="${SHARE_ICON}" alt="Lite Foil"><div class="t"><b>Rejoins les riders Lite Foil</b><small>Vidéos, chat, météo, suivi GPS, défis… gratuit</small>${store}</div><a class="go" href="/get?to=${encodeURIComponent(o.app)}">Rejoindre</a></div>
</body></html>`;
}
exports.sharePage = onRequest({ region: "europe-west1", memory: "256MiB", maxInstances: 10 }, async (req, res) => {
  const parts = String(req.path || "").split("/").filter(Boolean);
  const kind = parts[0], key = decodeURIComponent(parts[1] || "").replace(/[.#$\[\]\/]/g, "");
  const host = req.get("x-forwarded-host") || req.hostname || "litefoil-communaute-222fd.web.app";
  const base = "https://" + host;
  const db = getDatabase();
  try {
    if (kind === "api" && parts[1] === "live") return liveApi(req, res, String(parts[2] || "").replace(/[^A-Za-z0-9_-]/g, ""));
    if (kind === "l") { const raw = String(parts[1] || ""); return livePage(req, res, raw.replace(/\.json$/, "").replace(/[^A-Za-z0-9_-]/g, ""), /\.json$/.test(raw), base); }
    // « Rejoindre » : Google Play sur Android, App Store sur iPhone, sinon l'appli web
    if (kind === "get") {
      const ua = String(req.get("user-agent") || "");
      let to = String(req.query.to || ""); if (!/^https:\/\/cedric167\.github\.io\/litefoil-tracker\//.test(to)) to = SHARE_APP;
      if (/android/i.test(ua) && SHARE_PLAY) return res.redirect(302, SHARE_PLAY);
      if (/iphone|ipad|ipod/i.test(ua) && SHARE_IOS) return res.redirect(302, SHARE_IOS);
      return res.redirect(302, to);
    }
    if (!key) return res.redirect(302, SHARE_APP);
    if (kind === "t") { const v = (await db.ref("videos/" + key).get()).val(); return sendDataUrl(res, v && v.thumb); }
    if (kind === "a") { const av = (await db.ref("profiles/" + key + "/av").get()).val(); return sendDataUrl(res, av); }
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    if (kind === "v") {
      const v = (await db.ref("videos/" + key).get()).val();
      if (!v || !v.url) {
        return res.status(404).send(sharePageHtml({ title: "Vidéo introuvable · Lite Foil", desc: "Cette vidéo n'existe plus.", url: base + "/v/" + key, app: SHARE_APP,
          body: `<div class="pf"><div class="empty">Cette vidéo a été supprimée.<br>Découvre les autres sessions des riders dans l'appli Lite Foil.</div></div>` }));
      }
      const pr = (await db.ref("profiles/" + v.uid).get()).val() || {};
      const ps = pr.pseudo || v.pseudo || "Rider", nk = pr.nk || "";
      const title = "Vidéo de @" + ps + " sur Lite Foil";
      const desc = (v.caption ? v.caption + " · " : "") + fmtN(likesN(v)) + " J'aime · L'appli des riders eFoil, wing, surf…";
      const body = `<div class="vid"><video id="v" src="${escH(v.url)}" poster="${escH(base + "/t/" + key)}" autoplay muted loop playsinline webkit-playsinline preload="auto"></video><div class="shade"></div>
<button class="snd" id="snd">🔊 Touche pour le son</button>
<div class="info">${nk ? `<a href="/u/${escH(nk)}"><b>@${escH(ps)}</b></a>` : `<b>@${escH(ps)}</b>`}${v.caption ? `<p>${escH(v.caption)}</p>` : ""}<span class="likes">❤️ ${fmtN(likesN(v))} J'aime</span></div></div>
<script>var v=document.getElementById("v"),b=document.getElementById("snd");function on(){v.muted=false;v.play();b.remove();}b.onclick=on;v.onclick=function(){if(v.muted)on();else if(v.paused)v.play();else v.pause();};</script>`;
      const big = v.poster && +v.pw > 0 && +v.ph > 0; // affiche 720 px : aperçu de lien en grand (Facebook, WhatsApp…)
      return res.send(sharePageHtml({ title, desc, url: base + "/v/" + key, img: big ? v.poster : base + "/t/" + key, iw: big ? v.pw : 0, ih: big ? v.ph : 0, video: v.url, app: SHARE_APP + "?v=" + encodeURIComponent(key), body }));
    }
    if (kind === "u") {
      const nk = key.toLowerCase();
      let uid = (await db.ref("names/" + nk).get()).val();
      if (typeof uid !== "string") uid = null;
      const pr = uid ? ((await db.ref("profiles/" + uid).get()).val() || {}) : null;
      if (!pr) {
        return res.status(404).send(sharePageHtml({ title: "Rider introuvable · Lite Foil", desc: "Ce profil n'existe pas.", url: base + "/u/" + nk, app: SHARE_APP,
          body: `<div class="pf"><div class="empty">Ce rider n'existe pas ou a supprimé son profil.</div></div>` }));
      }
      const all = (await db.ref("videos").get()).val() || {};
      const vids = Object.keys(all).map((k) => Object.assign({ id: k }, all[k])).filter((x) => x && x.uid === uid && x.url).sort((a, b) => (+b.t || 0) - (+a.t || 0));
      const fol = (await db.ref("follows").get()).val() || {};
      let followers = 0; for (const f in fol) { if (f !== uid && fol[f] && fol[f][uid]) followers++; }
      const following = Object.keys(fol[uid] || {}).length;
      const likes = vids.reduce((n, x) => n + likesN(x), 0);
      const ps = pr.pseudo || "Rider";
      const av = pr.av ? `<img class="pf-av" src="${escH(base + "/a/" + uid)}" alt="">` : `<div class="pf-av">${escH((ps.trim()[0] || "R").toUpperCase())}</div>`;
      const body = `<div class="pf"><div class="pf-h">${av}<h1>${escH(ps)}</h1><div class="nk">@${escH(nk)}</div>${pr.bio ? `<div class="bio">${escH(pr.bio)}</div>` : ""}</div>
<div class="nums"><div><b>${fmtN(following)}</b><span>Abonnements</span></div><div><b>${fmtN(followers)}</b><span>Abonnés</span></div><div><b>${fmtN(likes)}</b><span>J'aime</span></div></div>
${vids.length ? `<div class="grid">${vids.slice(0, 30).map((x) => `<a href="/v/${escH(x.id)}" style="background-image:url('${escH(base + "/t/" + x.id)}')"><span>❤️ ${fmtN(likesN(x))}</span></a>`).join("")}</div>` : `<div class="empty">Pas encore de vidéo.</div>`}</div>`;
      return res.send(sharePageHtml({ title: ps + " (@" + nk + ") sur Lite Foil", desc: fmtN(followers) + " abonnés · " + fmtN(likes) + " J'aime · " + (pr.bio || "Rider sur l'appli Lite Foil"),
        url: base + "/u/" + nk, img: pr.av ? base + "/a/" + uid : (vids[0] ? base + "/t/" + vids[0].id : ""), app: SHARE_APP + "?u=" + encodeURIComponent(uid), body }));
    }
    return res.redirect(302, SHARE_APP);
  } catch (e) {
    console.error("sharePage", e);
    return res.status(500).send("Erreur, réessaie dans un instant.");
  }
});

/* ===================== Sécurité en mer (12/11) =====================
 * Pendant une sortie, l'appli (et le module natif, même écran éteint) envoie la position toutes les ~20 s :
 *   POST /api/live/{sid}  {k, pts:[{lat,lng,t,spd}], soc?, status?}   (k = clé secrète de la sortie)
 * Un proche suit la sortie sur /l/{sid} (carte, vitesse, trace, alerte), sans compte.
 * status : active | alert (immobile, pas de réponse) | sos | ok (fausse alerte) | ended.
 * En cas d'alerte ou de SOS, les contacts de sécurité (riders Lite Foil choisis) reçoivent une notification. */
function hav(a, b) { const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
async function liveApi(req, res, sid) {
  res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST" || !sid) return res.status(405).send("POST attendu");
  let b = req.body; if (!b || typeof b !== "object") { try { b = JSON.parse(String(req.rawBody || "{}")); } catch (e) { b = {}; } }
  const db = getDatabase(), ref = db.ref("live/" + sid);
  const L = (await ref.get()).val();
  if (!L || !L.k || String(b.k || "") !== String(L.k)) return res.status(403).send("refusé");
  if (L.status === "ended" && b.status !== "ended") return res.json({ ok: true, ended: true });
  const up = { upd: Date.now() };
  const pts = (Array.isArray(b.pts) ? b.pts : []).filter((q) => q && isFinite(+q.lat) && isFinite(+q.lng) && Math.abs(+q.lat) <= 90 && Math.abs(+q.lng) <= 180).slice(-60);
  let lt = +L.lt || 0, dist = +L.dist || 0, prev = L.last || null;
  for (const q of pts) {
    const pt = { lat: +(+q.lat).toFixed(6), lng: +(+q.lng).toFixed(6), t: +q.t || Date.now(), spd: isFinite(+q.spd) ? Math.round(+q.spd * 10) / 10 : 0 };
    if (prev && pt.t <= (+prev.t || 0)) continue;
    if (prev) { const d = hav(prev, pt); if (d < 5000) dist += d; }
    prev = pt;
    if (pt.t - lt >= 15000) { lt = pt.t; await db.ref("liveTrk/" + sid).push([pt.lat, pt.lng]); }
  }
  if (prev && prev !== L.last) { up.last = prev; up.lt = lt; up.dist = Math.round(dist); }
  if (b.soc != null && isFinite(+b.soc)) up.soc = Math.max(0, Math.min(100, Math.round(+b.soc)));
  const st = String(b.status || "");
  if (["alert", "sos", "ok", "ended"].indexOf(st) >= 0) {
    up.status = st === "ok" ? "active" : st;
    if (st === "alert" || st === "sos") up.alertT = Date.now();
    if (st === "ended") up.endT = Date.now();
  }
  await ref.update(up);
  if ((st === "alert" || st === "sos") && L.status !== st) {
    const uids = Object.keys(L.contacts || {}).filter((u) => u && u !== L.uid);
    if (uids.length) {
      const ps = L.ps || "Un rider";
      await sendToUids(uids, { type: "safety", channel: "live:" + sid, live: String(sid),
        title: st === "sos" ? "🆘 SOS de " + ps : "⚠️ " + ps + " ne bouge plus",
        body: st === "sos" ? ps + " a déclenché un SOS en mer. Ouvre sa position." : ps + " est immobile depuis un moment et ne répond pas. Vérifie sa position." }).catch(() => {});
    }
  }
  return res.json({ ok: true });
}
async function livePage(req, res, sid, asJson, base) {
  const db = getDatabase();
  const L = sid ? (await db.ref("live/" + sid).get()).val() : null;
  res.set("Cache-Control", "no-store");
  if (asJson) {
    if (!L) return res.status(404).json({ ok: false });
    const trk = Object.values((await db.ref("liveTrk/" + sid).get()).val() || {});
    const step = Math.max(1, Math.ceil(trk.length / 600));
    return res.json({ ok: true, ps: L.ps || "Rider", cat: L.cat || "", status: L.status || "active", t0: +L.t0 || 0, upd: +L.upd || 0, now: Date.now(), last: L.last || null,
      dist: +L.dist || 0, soc: L.soc == null ? null : +L.soc, alertT: +L.alertT || 0, endT: +L.endT || 0, trk: trk.filter((x, i) => i % step === 0 || i === trk.length - 1) });
  }
  if (!L) return res.status(404).send(sharePageHtml({ title: "Suivi introuvable · Lite Foil", desc: "Ce suivi n'existe plus.", url: base + "/l/" + sid, app: SHARE_APP,
    body: `<div class="pf"><div class="empty">Ce suivi de sortie n'existe pas ou a expiré.</div></div>` }));
  const ps = escH(L.ps || "Rider");
  return res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sortie en direct de ${ps} · Lite Foil</title><meta property="og:title" content="Suis la sortie de ${ps} en direct"><meta property="og:description" content="Position, vitesse et trace en direct, avec alerte en cas de problème. Lite Foil, sécurité en mer.">
<meta property="og:image" content="${escH(SHARE_ICON)}"><link rel="icon" href="${escH(SHARE_ICON)}"><meta name="theme-color" content="#04121a">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#04121a;color:#0e1417;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#map{position:fixed;inset:0}.top{position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:1000;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.96);border-radius:18px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.top img{width:40px;height:40px;border-radius:11px}.top div{flex:1;min-width:0}.top b{display:block;font-size:15.5px}.top small{display:block;font-size:12.5px;color:#5b6b71}
.pill{flex:none;font-size:12.5px;font-weight:800;padding:6px 10px;border-radius:999px;background:#e3f8ec;color:#0a7a3c}.pill.alert{background:#fff1d6;color:#9a5b00}.pill.sos{background:#e8384f;color:#fff;animation:bl 1s infinite}.pill.ended{background:#eef1f2;color:#5b6b71}.pill.stale{background:#fff1d6;color:#9a5b00}
@keyframes bl{50%{opacity:.55}}
.ban{position:fixed;left:12px;right:12px;top:calc(max(12px,env(safe-area-inset-top)) + 72px);z-index:1000;border-radius:16px;padding:12px 14px;font-weight:700;font-size:14.5px;line-height:1.4;display:none;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.ban.sos{display:block;background:#e8384f;color:#fff}.ban.alert{display:block;background:#ffb020;color:#2b1700}.ban.stale{display:block;background:#fff;color:#9a5b00}.ban a{color:inherit;text-decoration:underline}
.card{position:fixed;left:0;right:0;bottom:0;z-index:1000;background:#fff;border-radius:22px 22px 0 0;padding:14px 16px max(14px,env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.3)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center}.stats b{display:block;font-size:18px}.stats span{font-size:11.5px;color:#6b7a80;font-weight:600}
.coord{margin-top:12px;background:#f3f6f7;border-radius:12px;padding:9px 12px;font-size:13.5px;display:flex;justify-content:space-between;gap:8px;align-items:center}.coord b{font-family:ui-monospace,Menlo,monospace;font-size:13px}
.acts{display:flex;gap:8px;margin-top:12px}.acts a{flex:1;text-align:center;text-decoration:none;font-weight:800;font-size:14px;padding:12px 8px;border-radius:12px;background:#f1f3f4;color:#0e1417}.acts a.red{background:#e8384f;color:#fff}
.me{width:22px;height:22px;border-radius:50%;background:#19c3cf;border:4px solid #fff;box-shadow:0 0 0 6px rgba(25,195,207,.35),0 2px 8px rgba(0,0,0,.4)}.me.sos{background:#e8384f;box-shadow:0 0 0 8px rgba(232,56,79,.4)}</style></head><body>
<div id="map"></div>
<div class="top"><img src="${escH(SHARE_ICON)}" alt=""><div><b>Sortie de ${ps}</b><small id="sub">Chargement…</small></div><span class="pill" id="pill">…</span></div>
<div class="ban" id="ban"></div>
<div class="card"><div class="stats"><div><b id="spd">–</b><span>km/h</span></div><div><b id="dist">–</b><span>km</span></div><div><b id="dur">–</b><span>durée</span></div><div><b id="soc">–</b><span>batterie</span></div></div>
<div class="coord"><span>Position</span><b id="coord">–</b></div>
<div class="acts"><a id="nav" href="#" target="_blank" rel="noopener">📍 Itinéraire</a><a class="red" href="tel:196">📞 Secours en mer 196</a></div></div>
<script>
var SID=${JSON.stringify(sid)},map=L.map("map",{zoomControl:false,attributionControl:false}).setView([46.5,2.5],5);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19}).addTo(map);
var line=L.polyline([],{color:"#19e3ff",weight:4,opacity:.9}).addTo(map),mk=null,first=true,lastStatus="";
function dms(v,p,n){var a=Math.abs(v),d=Math.floor(a),m=(a-d)*60;return d+"°"+m.toFixed(3)+"' "+(v>=0?p:n);}
function dur(ms){var s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+"h"+String(m).padStart(2,"0"):m+" min";}
function ago(ms){var s=Math.round(ms/1000);return s<60?"il y a "+s+" s":"il y a "+Math.round(s/60)+" min";}
function beep(){try{var c=new(window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;o.connect(g);g.connect(c.destination);g.gain.value=.2;o.start();setTimeout(function(){o.stop();c.close();},600);}catch(e){}try{navigator.vibrate&&navigator.vibrate([400,200,400]);}catch(e){}}
function load(){fetch("/l/"+SID+".json",{cache:"no-store"}).then(function(r){return r.json();}).then(function(d){if(!d||!d.ok)return;
 var stale=d.status==="active"&&d.upd&&d.now-d.upd>5*60000,st=d.status==="ended"?"ended":(d.status==="sos"?"sos":(d.status==="alert"?"alert":(stale?"stale":"live")));
 var pill=document.getElementById("pill");pill.className="pill "+(st==="live"?"":st);pill.textContent={live:"● En direct",ended:"Sortie terminée",sos:"🆘 SOS",alert:"⚠️ Immobile",stale:"⚠️ Sans nouvelles"}[st];
 document.getElementById("sub").textContent=(d.cat?d.cat+" · ":"")+(d.upd?"mis à jour "+ago(d.now-d.upd):"en attente de position");
 var ban=document.getElementById("ban");ban.className="ban "+(st==="sos"?"sos":st==="alert"?"alert":st==="stale"?"stale":"");
 ban.innerHTML=st==="sos"?"🆘 SOS déclenché "+ago(d.now-d.alertT)+". Appelle le <a href='tel:196'>196</a> (CROSS, secours en mer) et donne la position ci-dessous.":st==="alert"?"⚠️ ${ps} ne bouge plus et n'a pas répondu à l'alerte. Essaie de l'appeler ; sans réponse, appelle le <a href='tel:196'>196</a>.":st==="stale"?"Plus de position depuis "+Math.round((d.now-d.upd)/60000)+" min (zone sans réseau ?). Dernière position ci-dessous.":"";
 if((st==="sos"||st==="alert")&&lastStatus!==st)beep();lastStatus=st;
 var pts=(d.trk||[]).map(function(p){return[p[0],p[1]];});if(d.last)pts.push([d.last.lat,d.last.lng]);line.setLatLngs(pts);
 if(d.last){var ll=[d.last.lat,d.last.lng];if(!mk)mk=L.marker(ll,{icon:L.divIcon({className:"",html:"<div class='me'></div>",iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);else mk.setLatLng(ll);
  mk.getElement()&&(mk.getElement().firstChild.className="me"+(st==="sos"?" sos":""));
  if(first){map.setView(ll,14);first=false;}
  document.getElementById("coord").textContent=dms(d.last.lat,"N","S")+"  "+dms(d.last.lng,"E","O");
  document.getElementById("nav").href="https://www.google.com/maps/search/?api=1&query="+d.last.lat+","+d.last.lng;
  document.getElementById("spd").textContent=st==="ended"?"–":(+d.last.spd||0).toFixed(1).replace(".",",");}
 document.getElementById("dist").textContent=(d.dist/1000).toFixed(1).replace(".",",");
 document.getElementById("dur").textContent=d.t0?dur((d.endT||d.now)-d.t0):"–";
 document.getElementById("soc").textContent=d.soc==null?"–":d.soc+" %";
}).catch(function(){});}
load();setInterval(load,10000);
</script></body></html>`);
}
