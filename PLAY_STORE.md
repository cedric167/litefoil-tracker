# Publier « Lite Foil Tracker » sur le Play Store

Dossier préparé le 2026-10-09. L'application est une page web installable (PWA) ; sur le
Play Store elle est livrée dans un emballage Android (Trusted Web Activity) qui ouvre
`https://cedric167.github.io/litefoil-tracker/` en plein écran dans Chrome, Bluetooth
compris. Tout ce qui suit se fait depuis un navigateur, sans outil de développement.

## État au 2026-10-15 — PRODUCTION ENVOYÉE À L'EXAMEN

- Test interne installé et validé sur le téléphone le 15/10 (Bluetooth OK, pas de barre d'adresse).
- **Production : release « 2 (1.0.1) », déploiement complet, 177 pays + reste du monde, envoyée à l'examen Google le 15/10** (créée à la main par l'utilisateur dans la console ; les outils automatisés refusent de cliquer sur un déploiement en production).
- Les 8 modifications de fiche/contenu (fiche fr-FR, catégorie Sports, cible 18+, règles de confidentialité, sécurité des données, annonces, santé) publiées le 15/10 (« Publication gérée » était activée : il faut cliquer « Publier N modifications » dans Vue d'ensemble de la publication, ou désactiver la publication gérée).
- Attente : mail de Google « appli publiée » (quelques heures à quelques jours). Prochain paquet : version code 3.

## État au 2026-10-14 — TEST INTERNE PUBLIÉ

- Fiche, contenu de l'application, sécurité des données, classification : remplis dans la console le 14/10.
- Protection automatique Play : **désactivée** (Protégé avec Play → Protection automatique → Gérer → interrupteur « Vérification du programme d'installation » coupé → Enregistrer). Sinon un paquet dont le minSdk est < 24 est refusé.
- Le paquet du 11/10 (`Lite Foil Tracker.aab`, minSdk 21) est refusé par Google avec une erreur générique à l'import, même après plusieurs essais. **Nouveau paquet régénéré le 14/10 par l'API PWABuilder avec la même clé** : `android/Lite Foil Tracker v1.0.1.aab` (version 1.0.1, code 2, minSdk 24, cible 36), accepté par Google en 30 s.
- **Release de test interne « 2 (1.0.1) » publiée.** Liste de testeurs « Testeurs Lite Foil » (efs66180@gmail.com). Lien d'inscription des testeurs : <https://play.google.com/apps/internaltest/4701477775617225160>
- Empreinte SHA-256 de la clé de signature Google Play (App Signing) : `63:F7:C9:FC:2B:28:83:94:00:4A:0B:DC:4E:6F:18:F7:54:24:42:AC:F9:B3:DF:F6:AE:61:88:42:A2:FE:A7:DE`, ajoutée dans `cedric167.github.io/.well-known/assetlinks.json` à côté de la clé d'importation.
- Reste : installer depuis le lien sur le téléphone, vérifier le Bluetooth et l'absence de barre d'adresse, puis Production → Créer une version (même paquet) → Examiner → Lancer. Prochain paquet : version code 3.

## État au 2026-10-11 — paquet Android FABRIQUÉ, reste à publier

| Fait | Où |
|---|---|
| Paquet Android généré (API PWABuilder, package `fr.litefoil.tracker`, version 1.0.0 / code 1) | `android/Lite Foil Tracker.aab` (pour Play) et `android/Lite Foil Tracker.apk` (test direct sur un téléphone) — dossier ignoré par git |
| Clé de signature + mots de passe | `cert/signing.keystore`, `cert/signing-key-info.txt` — ignorés par git, **À SAUVEGARDER ailleurs** (sans eux, aucune mise à jour possible) |
| Empreinte SHA-256 de la clé | `C6:18:FD:95:1D:FB:01:40:F7:DD:E2:67:D6:62:7F:25:B2:42:EE:2B:3F:17:40:2C:02:3E:C1:59:E4:88:4C:DD` |
| Dépôt racine `cedric167.github.io` (assetlinks.json, .nojekyll, index) | `C:UsersASUSDownloadscedric167.github.io`, commité en local, **PAS ENCORE créé sur GitHub** |
| Captures 1080 × 1920 | `store/capture-dash.png`, `capture-tracker.png`, `capture-batterie.png`, `capture-moteur.png`, `capture-litefoil.png` |

**Prochaine action (toi, 1 commande)** — créer le dépôt public et le pousser :

```
cd C:UsersASUSDownloadscedric167.github.io
gh repo create cedric167/cedric167.github.io --public --source . --remote origin --push
```

Une à deux minutes plus tard, vérifier que `https://cedric167.github.io/.well-known/assetlinks.json`
répond (le `.nojekyll` est indispensable, sinon Jekyll ignore le dossier `.well-known`).
Ensuite : §1 (compte développeur) puis §6 (dépôt de l'`.aab`).

## 0. Ce qui est déjà prêt

| Élément | Où |
|---|---|
| Application en ligne (HTTPS, manifest, service worker) | <https://cedric167.github.io/litefoil-tracker/> |
| Politique de confidentialité (obligatoire) | <https://cedric167.github.io/litefoil-tracker/confidentialite.html> |
| Icône 512 × 512 | `icon-512.png` |
| Bannière « feature graphic » 1024 × 500 | `store/feature-1024x500.png` |
| Captures d'écran téléphone (1080 × 1920) | `store/capture-tracker.png`, `store/capture-litefoil.png` |
| Textes de la fiche | §3 ci-dessous |
| Réponses du formulaire « Sécurité des données » | §4 ci-dessous |

## 1. Le compte développeur Google Play (toi, une fois)

1. <https://play.google.com/console/signup> : compte Google de Lite Foil, type **Organisation**
   (ou particulier), 25 $ une fois, vérification d'identité (pièce d'identité, parfois un
   document de l'entreprise). Compter 1 à 3 jours pour la validation du compte.
2. Dans la console : **Créer une application** → nom « Lite Foil Tracker », langue
   français, type Application, gratuite.

## 2. Fabriquer le paquet Android — FAIT le 2026-10-11

Généré par l'API de PWABuilder (même moteur que le site) avec une clé neuve, résultat dans
`android/` et la clé dans `cert/`. Pour **refaire** un paquet (icône, nom ou adresse changés) :
<https://www.pwabuilder.com> → coller l'URL → Package for stores → Android → Package ID
`fr.litefoil.tracker`, **Signing key : use mine** (`cert/signing.keystore`, alias et mots de passe dans
`cert/signing-key-info.txt`), **version code incrémenté** (2, 3, …) → Generate.

## 3. Lier l'appli au site (sinon la barre d'adresse de Chrome reste visible)

Android vérifie que le site autorise l'appli, via un fichier `assetlinks.json` servi à la
**racine du domaine** : `https://<domaine>/.well-known/assetlinks.json`. Avec GitHub Pages,
l'appli est sous `cedric167.github.io/litefoil-tracker/`, et la racine du domaine est
`cedric167.github.io`. Deux façons :

- **Simple** : créer sur GitHub un dépôt public nommé exactement `cedric167.github.io`,
  y mettre le fichier `.well-known/assetlinks.json` fourni par PWABuilder (il contient
  l'empreinte SHA-256 de ta clé). Il est servi à `https://cedric167.github.io/.well-known/assetlinks.json`.
- **Plus pro** : un sous-domaine de ton site, par exemple `tracker.litefoil.fr`, pointé
  sur GitHub Pages (un enregistrement DNS `CNAME tracker → cedric167.github.io` chez ton
  registrar, puis le domaine saisi dans Settings → Pages du dépôt `litefoil-tracker`). L'appli
  est alors à `https://tracker.litefoil.fr/` et le fichier à
  `https://tracker.litefoil.fr/.well-known/assetlinks.json` dans ce même dépôt. À refaire
  dans PWABuilder avec la nouvelle adresse.

Le contenu attendu (l'empreinte vient du zip de PWABuilder) :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "fr.litefoil.tracker",
    "sha256_cert_fingerprints": ["AA:BB:…:ZZ"]
  }
}]
```

Quand Google aura signé l'appli (Play App Signing), ajouter aussi l'empreinte « clé de
signature de l'application » affichée dans Play Console → Configuration → Intégrité de
l'application, dans le même tableau.

## 4. La fiche du Play Store

**Nom (30 caractères max)** : `Lite Foil Tracker`

**Description courte (80 max)** :
`Configurez votre tracker GPS Lite Foil et publiez vos sorties sur SportsTrackLive.`

**Description complète** :

```
Lite Foil Tracker accompagne le tracker GPS/4G livré avec les planches Lite Foil.

Connectez le tracker en Bluetooth, renseignez une fois votre compte SportsTrackLive :
à chaque mise sous tension, le tracker se connecte seul à votre compte et y enregistre
votre sortie en direct, comme le ferait l'application du téléphone, mais sans téléphone
sur l'eau.

Dans l'application :
• Compte SportsTrackLive : saisir, changer ou effacer l'identifiant enregistré dans le tracker.
• État en direct : satellites, vitesse, vitesse max, position, réseau, batterie, session en cours.
• Démarrer ou arrêter le suivi ; l'arrêt est mémorisé par le tracker.
• Réglages avancés : cadence des envois, APN de la carte SIM.
• L'onglet Lite Foil : le site, les planches, les accessoires, le guide, le contact, les vidéos.

Fonctionne avec le tracker Lite Foil (nom Bluetooth LITEFOIL-TRACKER). Aucun compte Lite
Foil, aucune collecte de données par l'éditeur : vos identifiants vont dans le tracker,
vos sorties dans votre compte SportsTrackLive.
```

**Catégorie** : Sports. **Tags** : sport nautique, GPS, tracker.
**Coordonnées** : e-mail de contact Lite Foil, site `https://litefoil.fr`.
**Politique de confidentialité** : `https://cedric167.github.io/litefoil-tracker/confidentialite.html`
**Classification du contenu** : questionnaire → application utilitaire, aucun contenu
sensible → « Tout public ».
**Public cible** : 18 ans et plus (pas de contenu enfants, ce qui évite le questionnaire famille).
**Visuels** : icône `icon-512.png`, bannière `store/feature-1024x500.png`, captures
`store/capture-*.png` (au moins 2, jusqu'à 8 ; refaire des captures sur un vrai téléphone
connecté au tracker rend la fiche plus parlante).

## 5. Formulaire « Sécurité des données »

- L'application collecte-t-elle ou partage-t-elle des données ? **Oui** (saisie d'identifiants).
- Données chiffrées en transit : **Oui** (HTTPS vers sportstracklive.com ; Bluetooth LE vers le tracker).
- Suppression possible par l'utilisateur : **Oui** (bouton « Effacer le compte »).
- Types de données :
  - *Informations personnelles → Adresse e-mail* : collectée, **non partagée avec l'éditeur**
    (elle est transmise au tracker et à SportsTrackLive), finalité « fonctionnalités de
    l'application / gestion du compte », facultative ? **Non** (nécessaire au service).
  - *Informations personnelles → Autres identifiants (mot de passe)* : idem.
  - *Position* : **non collectée par l'application** (la position vient du tracker, affichée seulement).
- Pas de données vendues, pas de publicité, pas d'analyse d'audience.

## 6. Déposer et publier

1. Play Console → l'application → **Tests → Test interne** d'abord : déposer l'`.aab`,
   ajouter ton adresse e-mail comme testeur, installer depuis le lien, vérifier le Bluetooth
   et l'absence de barre d'adresse (preuve que `assetlinks.json` est bon).
2. Puis **Production → Créer une version** : même `.aab`, notes de version
   (« Première version »), **Examiner → Lancer**.
3. Validation Google : de quelques heures à quelques jours. La fiche apparaît ensuite sur
   `https://play.google.com/store/apps/details?id=fr.litefoil.tracker`.

## 7. Mettre à jour plus tard

La page web se met à jour toute seule (il suffit de republier le dépôt) : l'appli du store
affiche toujours la version en ligne. Un nouveau paquet Android n'est nécessaire que pour
changer l'icône, le nom, ou l'adresse. Dans ce cas : PWABuilder avec **la même clé de
signature** (`signing.keystore`), numéro de version incrémenté, dépôt d'une nouvelle version.

## iPhone

Pas possible avec cette application : iOS n'a pas le Bluetooth web. Il faudrait une
application native (ou Flutter) qui reparle le protocole Bluetooth du tracker, un Mac et un
compte développeur Apple (99 €/an). En attendant, le navigateur **Bluefy** (gratuit, App
Store) ouvre la page avec le Bluetooth sur iPhone.
