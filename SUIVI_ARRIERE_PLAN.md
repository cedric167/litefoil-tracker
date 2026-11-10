# Suivi GPS qui continue écran éteint et appli fermée (10/11/2026)

« Suivre avec mon téléphone » enregistre maintenant la sortie avec un **module natif** (`LfTrack`)
au lieu du GPS de la page web. Les points sont écrits dans un fichier du téléphone ; la page les
relit dès qu'elle est ouverte (ou rouverte).

| | Écran verrouillé | Appli fermée (balayée) |
|---|---|---|
| **Android** | continue | **continue** (service de premier plan, notification « Lite Foil — enregistrement » avec le bouton « Terminer la sortie ») |
| **iPhone** | continue | iOS coupe le GPS ; l'appli est **relancée par iOS au prochain déplacement important** (≈ 500 m) et l'enregistrement **reprend tout seul**. Il faut l'autorisation de localisation **« Toujours »**. Trou possible dans la trace : c'est une règle d'Apple, aucune appli ne peut l'éviter. |

À la réouverture, la sortie en cours réapparaît avec tous ses points. Si elle a été terminée depuis
la notification (Android), elle est enregistrée automatiquement dans « Activités ». La publication en
direct sur SportsTrackLive reprend aussi là où elle s'était arrêtée (les points enregistrés appli
fermée sont envoyés à la réouverture).

Les anciennes versions de l'appli (sans le module) gardent l'ancien fonctionnement : la page détecte
le module et ne l'utilise que s'il est présent.

## Fichiers

- `native/android/` : `LfTrackService` (service de premier plan « location », `stopWithTask=false`),
  `LfTrackPlugin` (module Capacitor), `LfTrackStore` (fichiers), `MainActivity` (enregistre le module).
- `native/ios/` : `LfTrackRecorder` (CoreLocation, arrière-plan + déplacements importants),
  `LfTrackPlugin` (module Capacitor), `LFViewController` (enregistre le module).
- `scripts/android-setup.sh` : copie le code Java, ajoute permissions et service au manifeste.
- `scripts/ios-setup.sh` (partie 5 bis) : ajoute les fichiers Swift au projet Xcode, branche
  `LFViewController` dans `Main.storyboard`, relance l'enregistrement au démarrage dans `AppDelegate`.
- `index.html` : `phNat*` (« Suivre avec mon téléphone »).
- `codemagic.yaml` : appelle `android-setup.sh` ; version 1.4.0.

## À faire pour publier

1. Lancer les deux builds Codemagic (`android-play` et `ios-appstore`).
2. **Google Play** : Play Console → Contenu de l'appli → **Autorisations de service de premier plan**
   (et Déclaration de localisation si elle est demandée) :
   - Type : **Localisation** (`FOREGROUND_SERVICE_LOCATION`).
   - Texte proposé : « Lite Foil enregistre la trace GPS d'une sortie sportive (eFoil, wing foil,
     course…) que l'utilisateur démarre lui-même avec le bouton « Démarrer la sortie ». Pendant
     l'enregistrement, une notification permanente est affichée ; l'enregistrement continue écran
     éteint et appli fermée jusqu'à ce que l'utilisateur appuie sur « Terminer » (dans l'appli ou dans
     la notification). Aucune localisation n'est collectée en dehors d'une sortie démarrée. »
   - **Vidéo** (30 s, filmée sur le téléphone) : ouvrir l'appli → onglet « Mon tracker » →
     « Suivre avec mon téléphone » → « Démarrer la sortie » → accepter la localisation et les
     notifications → montrer la notification « Lite Foil — enregistrement » → verrouiller l'écran,
     marcher quelques mètres → fermer l'appli (balayer) → rouvrir : la trace a continué →
     « Terminer » → la sortie apparaît dans « Activités ».
3. **App Store** : dans les notes pour la vérification Apple, préciser que la localisation
   « Toujours » sert uniquement à poursuivre l'enregistrement d'une sortie démarrée par
   l'utilisateur (écran verrouillé ou appli fermée), et qu'elle s'arrête avec « Terminer ».

## Tests faits

- Code Java compilé avec l'API Android 14 (bibliothèques Capacitor 6.1.2).
- Page testée dans Chrome avec un faux module natif : démarrage, appli fermée puis rouverte
  (aucun point perdu), points en direct, arrêt, arrêt depuis la notification.
- **Pas encore testé sur de vrais téléphones**, ni le build iOS (pas de Mac ici) : à vérifier sur
  le build Codemagic / TestFlight avant publication.
