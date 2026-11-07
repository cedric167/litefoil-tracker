# Onglet « Communauté » — carte des riders + chat

Permet aux utilisateurs de l'appli de se rendre visibles sur une carte (zone
approximative), de voir qui ride près d'eux et de discuter (salon commun +
messages privés), pour organiser des sessions ensemble.

- **Confidentialité** : la position exacte ne quitte jamais le téléphone. Seule
  une **zone arrondie (~1 km)** est partagée, et uniquement si l'utilisateur
  active l'interrupteur « Me rendre visible ». Pseudo au lieu du vrai nom.
- **Hors ligne / sans config** : l'onglet tourne en **mode démonstration**
  (riders et messages d'exemple) tant que Firebase n'est pas configuré.

## Passer en temps réel (Firebase, gratuit, ~5 min)

1. Va sur https://console.firebase.google.com → **Ajouter un projet**
   (ex. « litefoil-communaute »). Google Analytics : facultatif.
2. **Compiler → Realtime Database → Créer une base** : région **Europe**
   (europe-west1), démarre en **mode verrouillé** (on applique les règles ci-dessous).
3. **Compiler → Authentication → Sign-in method → Anonyme → Activer.**
   (L'appli connecte chaque téléphone en anonyme, aucun compte à créer côté rider.)
4. **Paramètres du projet (⚙) → Général → Tes applications → Web (`</>`)** :
   enregistre l'appli, puis copie l'objet `firebaseConfig`.
5. Colle les valeurs dans `index.html`, bloc `window.LF_FIREBASE = { … }`
   (apiKey, authDomain, databaseURL, projectId, appId). Dès que `apiKey` et
   `databaseURL` sont remplis, le mode démo s'éteint et le temps réel s'active.

> Les clés Web Firebase sont **publiques par conception** (elles partent dans la
> page). Ce qui protège les données, ce sont les **règles** ci-dessous + l'auth.

## Règles de sécurité Realtime Database

Onglet **Realtime Database → Règles**, colle ceci puis **Publier** :

```json
{
  "rules": {
    "presence": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "chat": {
      ".read": "auth != null",
      "$id": {
        ".write": "auth != null && !data.exists() && newData.child('uid').val() === auth.uid",
        ".validate": "newData.child('text').isString() && newData.child('text').val().length <= 400"
      }
    },
    "dm": {
      "$pair": {
        ".read": "auth != null && $pair.contains(auth.uid)",
        "$id": {
          ".write": "auth != null && $pair.contains(auth.uid) && !data.exists() && newData.child('uid').val() === auth.uid",
          ".validate": "newData.child('text').isString() && newData.child('text').val().length <= 400"
        }
      }
    },
    "reports": {
      ".read": false,
      "$id": {
        ".write": "auth != null && !data.exists() && newData.child('by').val() === auth.uid"
      }
    }
  }
}
```

Le nœud `reports` reçoit les signalements (rider ou message). Il n'est lisible
que depuis la console Firebase (`.read:false`) : consulte-le régulièrement
(Realtime Database → Données → reports) pour traiter les abus.

## Modération (intégrée, exigée par Google Play / Apple)

- **Charte** à accepter avant de participer (stockée sur l'appareil) ; impossible
  de se rendre visible ou d'écrire sans l'avoir acceptée.
- **Signaler** un rider (bouton ⋯) ou un **message** (drapeau sur la bulle) →
  enregistré dans `reports`.
- **Bloquer** un rider (bouton ⋯) : il disparaît de la carte, de la liste et du
  chat pour cet utilisateur (liste locale, « tout débloquer » disponible).
- À faire côté console Play avant de soumettre la version communauté : mettre à
  jour la **Sécurité des données** (partage de position + contenu utilisateur) et
  cocher la présence d'outils de signalement/blocage.

Ces règles garantissent : lecture réservée aux utilisateurs connectés,
présence modifiable seulement par son propriétaire, messages **non modifiables
une fois postés** (pas d'effacement des autres), texte limité à 400 caractères,
messages privés accessibles aux **deux participants uniquement**.

## Événements (Agenda) : règle à ajouter

L'onglet **Agenda** du chat permet à chaque rider de créer un événement (titre,
activité, date, heure, lieu, places, description) et aux autres de s'y inscrire.
On peut aussi le créer depuis le bouton **+** du tchat : une carte « Voir et
s'inscrire » est alors postée dans le salon, le groupe ou la conversation.

Ajoute ce bloc dans les règles (Realtime Database → Règles), au même niveau que
`"chat"`, puis **Publier**. Sans lui, la création d'un événement affiche une
erreur de permission.

```json
"events": {
  ".read": "auth != null",
  ".indexOn": ["when"],
  "$eid": {
    ".write": "auth != null && ((!data.exists() && newData.child('by').val() === auth.uid) || (data.exists() && data.child('by').val() === auth.uid))",
    ".validate": "newData.hasChildren(['title','when','by']) && newData.child('title').isString() && newData.child('title').val().length <= 60 && newData.child('when').isNumber() && (!newData.child('img').exists() || (newData.child('img').isString() && newData.child('img').val().length <= 300000))",
    "att": {
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

L'organisateur peut ajouter une **photo de couverture** (recadrée en 16:9, environ 60 à 100 Ko, stockée dans `img`).
Seul l'organisateur peut modifier ou annuler son événement ; chaque rider ne peut
inscrire ou désinscrire **que lui-même**. Le nombre de places est vérifié dans
l'appli. Un événement peut être signalé (il arrive dans `reports`, type `event`).

Pour essayer sans toucher à la vraie base : ouvrir l'appli avec `?demo=1`.

### Discussion des participants + compteurs de non-lus (à ajouter aussi)

Chaque événement a sa discussion, réservée aux inscrits et à l'organisateur
(`/eventMessages/{eid}`). Le serveur tient le nombre de messages non lus de chaque
rider dans `/unread/{uid}` (chiffre sur l'icône de l'appli) ; l'appli le remet à zéro
quand on lit. Ajoute ces deux blocs à côté de `"events"` :

```json
"eventMessages": {
  "$eid": {
    ".read": "auth != null && (root.child('events/'+$eid+'/att/'+auth.uid).exists() || root.child('events/'+$eid+'/by').val() === auth.uid)",
    "$id": {
      ".write": "auth != null && (root.child('events/'+$eid+'/att/'+auth.uid).exists() || root.child('events/'+$eid+'/by').val() === auth.uid) && ((!data.exists() && newData.child('uid').val() === auth.uid) || (data.exists() && !newData.exists() && data.child('uid').val() === auth.uid))",
      ".validate": "!newData.exists() || newData.child('text').isString() && newData.child('text').val().length <= 400",
      "reactions": { "$uid": { ".write": "auth != null && auth.uid === $uid" } }
    }
  }
},
"unread": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid"
  }
}
```

## Compte officiel « Équipe Lite Foil », chiffres de la communauté

- Les messages de l'uid réservé `litefoil-team` (écrits par le serveur : accueil des
  nouveaux membres, météo du week-end le vendredi 17 h, conseil de la semaine le mardi
  18 h) s'affichent avec le badge **✓ Officiel**.
- Pour que **ton propre compte** ait aussi le badge (nouveautés, événements officiels) :
  dans l'appli, *Mon profil* → copie la ligne « Identifiant : … », puis dans la console
  Firebase → Realtime Database → Données, ajoute `official / <ton identifiant> : true`.
  Tes événements apparaissent alors en tête, dans « ⭐ Événements officiels Lite Foil ».
- Mets aussi ton identifiant dans `functions/.env` → `REPORT_ADMIN_UIDS=` : les réponses
  des riders au message d'accueil te seront transmises en notification.
- Chaque rider publie ses vrais chiffres (`/stats/{uid}` = sorties de plus de 100 m et km),
  l'appli affiche le total sous le nombre de membres.

Règles à ajouter (à côté des autres) :

```json
"official": { ".read": "auth != null", ".write": false },
"stats": {
  ".read": "auth != null",
  "$uid": {
    ".write": "auth != null && auth.uid === $uid",
    ".validate": "newData.child('n').isNumber() && newData.child('km').isNumber() && newData.child('n').val() <= 5000 && newData.child('km').val() <= 200000 && (!newData.child('eKm').exists() || (newData.child('eKm').isNumber() && newData.child('eKm').val() <= 5000))"
  }
},
"welcomed": { ".read": false, ".write": false }
```

## Cartes de rider et défi eFoil du mois

- Points : 10 par sortie (> 100 m), 2 par km, 20 par événement organisé, 10 par
  événement rejoint. Note de la carte de 40 à 99, grades N1 Débutant → N6 Légende.
- Défi du mois : classement des km d'eFoil du mois (`/stats/{uid}.eKm`, mois dans
  `month`). Sorties retenues : > 100 m, < 150 km, moyenne < 55 km/h.
- Le lot s'affiche dès que `DEFI_LOT` est rempli dans `index.html`. Règlement :
  `REGLEMENT_DEFI.md` (brouillon à valider). Vérifier les traces des premiers avant
  de remettre le lot (les chiffres viennent des téléphones des riders).

## Structure des données (pour info)

```
/presence/{uid} : { pseudo, lat, lng, t }         # lat/lng = zone arrondie ; t = horodatage serveur ; auto-effacé à la déconnexion
/chat/{id}      : { uid, pseudo, text, t, lat, lng } # salon commun (120 derniers affichés)
/dm/{a__b}/{id} : { uid, pseudo, text, t }         # fil privé entre 2 riders (uids triés)
/eventMessages/{eid}/{id} : { uid, pseudo, text, img, t } # discussion des participants
/unread/{uid}/{clé} : nombre   # clé = d_<uid> | g_<gid> | e_<eid> (tenu par le serveur)
/events/{id}    : { title, topic, when, place, desc, max, img, by, byPseudo, t, cancelled, att:{ uid:{pseudo,t} } } # agenda
```

## Entretien (facultatif)

Firebase ne purge pas tout seul l'historique du chat. Si besoin plus tard, on
pourra ajouter une petite Cloud Function qui supprime les messages de plus de
X jours. Pas nécessaire au lancement.
