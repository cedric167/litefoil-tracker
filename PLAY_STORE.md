# Publier « Lite Foil Tracker » sur le Play Store

Dossier préparé le 2026-10-09. L'application est une page web installable (PWA) ; sur le
Play Store elle est livrée dans un emballage Android (Trusted Web Activity) qui ouvre
`https://cedric167.github.io/litefoil-tracker/` en plein écran dans Chrome, Bluetooth
compris. Tout ce qui suit se fait depuis un navigateur, sans outil de développement.

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

## 2. Fabriquer le paquet Android (PWABuilder, 10 minutes)

1. <https://www.pwabuilder.com> → coller `https://cedric167.github.io/litefoil-tracker/` → **Start**.
2. Le rapport doit être vert (manifest, service worker, icônes). **Package for stores → Android**.
3. Options : Package ID `fr.litefoil.tracker`, App name « Lite Foil Tracker », Launcher
   name « Lite Foil », Display mode **standalone**, cocher **Signing key : create new**
   (PWABuilder génère la clé ; **télécharger et garder le fichier `.keystore` et ses mots de
   passe** : sans eux, impossible de publier une mise à jour).
4. **Generate** → télécharger le zip. Il contient `app-release-bundle.aab` (à déposer sur
   Play), `signing.keystore`, et `assetlinks.json`.

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
