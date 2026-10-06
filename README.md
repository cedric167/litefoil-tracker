# Configuration Bluetooth du tracker eFoil

Page de configuration Bluetooth du tracker GPS / 4G eFoil (firmware
`tracker_stl/firmware-efoil`, branche `efoil`) : état en direct (position,
satellites, réseau, envois acquittés, batterie), démarrage / arrêt du suivi, et
réglages mémorisés dans le tracker (APN, serveur, cadences).

Un seul fichier, `index.html`, sans aucune dépendance externe. La copie de
référence est `tracker_stl/firmware-efoil/webapp/index.html` ; ce dépôt n'est
que l'hébergement.

## Pourquoi un hébergement web

Le Bluetooth web (`navigator.bluetooth`) exige un contexte sécurisé : la page
doit être servie en **HTTPS**. Un fichier ouvert localement (`file://`) ne
convient pas, et une page d'artefact Claude non plus. Deux solutions :

- **sur le réseau local**, sans rien publier : `node serveur.js` dans ce dossier,
  puis ouvrir depuis le téléphone l'adresse affichée (`https://<ip-du-pc>:8443/`).
  Le certificat est auto-signé : Chrome affiche un avertissement, choisir
  « Paramètres avancés » puis « Continuer ». Le contexte reste sécurisé, le
  Bluetooth web fonctionne.
- **GitHub Pages** (HTTPS gratuit) pour une adresse permanente.

## Compatibilité

Chrome ou Edge sur **Android**. Safari et les navigateurs iOS ne gèrent pas le
Bluetooth web : sur iPhone, il faut passer par nRF Connect avec les UUID
ci-dessous et des écritures texte.

## Appareil visé

| | |
|---|---|
| Nom Bluetooth | `LITEFOIL-TRACKER` |
| Service | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| État (lecture + notification toutes les 2 s) | `beb5483e-36e1-4688-b7f5-ea07361b26a8` |
| Réglages (lecture + écriture) | `beb5483e-36e1-4688-b7f5-ea07361b26a9` |
| Commandes (écriture : `start` / `stop`) | `beb5483e-36e1-4688-b7f5-ea07361b26ab` |

Tout est du texte `clé=valeur;clé=valeur`. Réglages acceptés : `track` (0/1),
`period` (5 à 3600 s entre deux envois), `interval` (1 à 60 s entre deux points),
`apn`, `host` (sans `/` final). Une valeur refusée laisse l'ancienne ; relire les
réglages après écriture pour le vérifier.

## Ce que la page ne fait pas

Choisir le compte sportstracklive. Dans le protocole v2 le tracker n'a pas
d'identifiants de compte : il est reconnu par son IMEI et son secret, et le lien
tracker → compte → menu eFoil se fait côté serveur.
