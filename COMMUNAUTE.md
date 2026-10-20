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

## Structure des données (pour info)

```
/presence/{uid} : { pseudo, lat, lng, t }         # lat/lng = zone arrondie ; t = horodatage serveur ; auto-effacé à la déconnexion
/chat/{id}      : { uid, pseudo, text, t, lat, lng } # salon commun (120 derniers affichés)
/dm/{a__b}/{id} : { uid, pseudo, text, t }         # fil privé entre 2 riders (uids triés)
```

## Entretien (facultatif)

Firebase ne purge pas tout seul l'historique du chat. Si besoin plus tard, on
pourra ajouter une petite Cloud Function qui supprime les messages de plus de
X jours. Pas nécessaire au lancement.
