# Atelier VESC

Réplique de [VESC Tool](https://github.com/vedderb/vesc_tool) intégrée à l'application Lite Foil
(onglet VESC → « Atelier VESC »), avec le même design system « Clair premium ».

Adresse : <https://cedric167.github.io/litefoil-tracker/vesc/>

| Page | Contenu |
|---|---|
| Accueil | Connexion Bluetooth (Nordic UART ou HM-10), USB, démo ; puissance, batterie, gaz, températures ; infos du contrôleur, bus CAN ; sauvegardes locales |
| Direct | Toutes les valeurs temps réel, graphiques, journal CSV |
| Moteur / App | Tous les réglages `mcconf` / `appconf` groupés comme dans VESC Tool, recherche, aide ; barre « Écrire » avec aperçu des changements ; relecture de vérification ; import/export XML |
| Détection | Assistant FOC avec les préréglages moteur de VESC Tool, détection CAN, mesure R/L |
| Pilotage | Gaz, courant, régime, frein, uniquement tant que le bouton est maintenu |
| Entrées | PPM, ADC, horizon artificiel (IMU) |
| Terminal | Commandes du terminal VESC |
| Firmware | Envoi d'un `.bin` non compressé |

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

Licence GPL-3.0 (`LICENSE`).
