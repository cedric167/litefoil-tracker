# Atelier VESC

Réplique de [VESC Tool](https://github.com/vedderb/vesc_tool) intégrée à l'application Lite Foil
(onglet VESC → « Atelier VESC »), avec le même design system « Clair premium ».

Adresse : <https://cedric167.github.io/litefoil-tracker/vesc/>

| Page | Contenu |
|---|---|
| Accueil | Connexion Bluetooth (Nordic UART ou HM-10), USB, démo, « Reconnecter » le dernier module ; diagnostic de connexion ; puissance, batterie, gaz, températures ; infos du contrôleur, avertissement de version, bus CAN ; sauvegardes locales et fichier de sauvegarde complet |
| Essentiel | Profil moteur **Maytech 6579 110KV** (préremplit pôles, coupures, courants selon le poids et la batterie ; contrôle du flux après détection) ; les réglages qui comptent sur un eFoil, expliqués en français, avec vérifications (cellules, coupures, gaz bridé, courant absolu, UART) ; doubles contrôleurs : totaux et recopie des réglages sur tout le bus CAN |
| Sessions | Trace GPS + télémétrie, carte colorée selon la puissance, historique sur le téléphone, export CSV et GPX |
| Télécommande | Mode d'entrée, courbe de gaz dessinée (formule du firmware), zone morte, rampes, gâchette en direct, calibration PPM |
| Direct | Toutes les valeurs temps réel, graphiques, journal CSV |
| Moteur / App | Tous les réglages `mcconf` / `appconf` groupés comme dans VESC Tool, recherche, aide ; barre « Écrire » avec aperçu des changements ; relecture de vérification ; import/export XML |
| Détection | Assistant FOC avec les préréglages et photos de moteurs de VESC Tool (plus le Maytech 6579), usage « hélice » appliqué comme VESC Tool, détection CAN, mesure R/L |
| Pilotage | Gaz, courant, régime, frein, uniquement tant que le bouton est maintenu |
| Entrées | PPM, ADC, horizon artificiel (IMU) |
| Terminal | Commandes du terminal VESC |
| Firmware | Envoi d'un `.bin` non compressé, seulement après avoir téléchargé une sauvegarde |

Accès : l'atelier s'ouvre avec un code (empreinte SHA-256 dans `js/lock.js`, demandé une fois par
session du navigateur). C'est une protection contre les changements par erreur, pas une sécurité
forte : le code de la page reste lisible par qui le cherche.

Langues : les noms, explications, choix et groupes des réglages VESC Tool sont traduits en français
et en espagnol (`config/tr/strings.json`, anglais → français, espagnol ; `fr.json` et `es.json` en
sont tirés). En anglais, l'atelier affiche les textes d'origine de VESC Tool.

Liaison : en cas de coupure, l'atelier se reconnecte tout seul au même module (sans perdre les
modifications non écrites) ; le diagnostic reprend les causes réelles de « could not read firmware
version » relevées sur les forums.

Sécurité : une copie de la configuration est gardée sur le téléphone à la connexion, avant chaque
écriture et avant la détection (20 dernières). L'écran reste allumé tant que le contrôleur est
connecté.

Pas encore repris : firmwares compressés (heatshrink/LZO), interfaces QML, packages et LispBM, BMS,
journaux SD, configurations personnalisées.

## Développement

```sh
node serveur.js                      # HTTPS local, puis https://<ip>:8443/vesc/
node vesc/tests/protocol.test.mjs    # protocole + 50 définitions de paramètres
python3 vesc/tools/convert_config.py ../vesc_tool/res/config vesc/config   # régénérer les définitions
```

Licence GPL-3.0 (`LICENSE`). Les photos `img/*.webp` et `img/motors/*.webp` viennent de
VESC Tool (`res/images`, GPL-3.0), réduites ; les illustrations `.svg` sont propres à l'atelier.
