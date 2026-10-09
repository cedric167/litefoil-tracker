# Lite Foil Tracker — application Bluetooth du tracker

Page de configuration Bluetooth du tracker GPS / 4G eFoil (firmware
`tracker_stl/firmware-efoil`, branche `efoil`) : état en direct (position,
satellites, réseau, envois acquittés, batterie), démarrage / arrêt du suivi, et
réglages mémorisés dans le tracker (APN, serveur, cadences).

Un seul fichier, `index.html`, sans aucune dépendance externe. La copie de
référence est `tracker_stl/firmware-efoil/webapp/index.html` ; ce dépôt n'est
que l'hébergement.

## Pour le client

1. Allumer le tracker, ouvrir la page dans Chrome (Android), appuyer sur « Connecter » et
   choisir `LITEFOIL-TRACKER`.
2. Saisir l'e-mail et le mot de passe de son compte SportsTrackLive, « Enregistrer le
   compte ». C'est tout : à chaque mise sous tension le tracker se connecte seul au
   compte et y enregistre la sortie ; « Session STL » affiche le numéro de la session en
   cours, ou « identifiants refusés » si le mot de passe est faux.
3. Menu de Chrome → « Ajouter à l'écran d'accueil » : la page s'installe comme une
   application (`manifest.json`, `sw.js`, icônes) et fonctionne ensuite sans réseau.

La coupure d'alimentation ne peut pas être annoncée au site ; le tracker ferme la
session à la mise sous tension suivante si elle a moins de 6 h (et la reprend si elle a
moins de 10 min : simple micro-coupure). « Arrêter le suivi » depuis la page ferme la
session immédiatement.

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
`apn`, `host` (sans `/` final), `account` (e-mail du compte, vide = aucun). Une valeur
refusée laisse l'ancienne ; relire les réglages après écriture pour le vérifier.

## Le compte sportstracklive

La section « Compte SportsTrackLive » de la page demande l'e-mail et le mot de passe du
compte, plus, une seule fois, la clé d'application STL (la valeur `STL_SECRET_KEY` de
l'ancien tracker Arduino). Le téléphone vérifie d'abord ces identifiants auprès de
`api.sportstracklive.com` (API v1, `POST /v1/auth`), ce qui évite d'enregistrer une
faute de frappe, puis les écrit dans le tracker (réglages `account` et `password`).

**Le tracker se connecte ensuite lui-même au site**, comme l'application du téléphone :
il ouvre une session live dans le compte au premier envoi d'une sortie, y pousse les
points, et la ferme quand le suivi est arrêté depuis la page. La tuile « Session STL »
affiche le numéro de la session et le nombre de points acceptés.

Le mot de passe est conservé dans la mémoire flash du tracker, lisible par USB : c'est le
prix de l'autonomie, choisi en connaissance de cause. La page ne le mémorise pas ; elle
garde seulement l'e-mail et la clé d'application. « Dissocier » efface les deux du
tracker.

Techniquement, le modem de cette carte ne pouvait pas atteindre `api.sportstracklive.com`
(Cloudflare exige le SNI, que son firmware TLS n'envoie pas) : depuis le 2026-10-09 le
firmware met le modem en PPP et fait l'IP et le TLS lui-même sur l'ESP32
(`tracker_stl/firmware-efoil/src/net.rs`). Le canal v2 vers `device.sportstracklive.com`
passe par le même chemin.

Réglages lus en retour : `pw=1` signale qu'un mot de passe est enregistré (il n'est
jamais renvoyé). État : `live=0/1`, `lid=` numéro de session, `lsent=` points acceptés,
`lq=` points en attente, `lhttp=` dernier code HTTP du canal v1.
