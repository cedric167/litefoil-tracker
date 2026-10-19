# Atelier batterie

Réplique de l'appli du fabricant du BMS, intégrée à Lite Foil (onglet Batterie → « Atelier batterie »),
au même style que l'Atelier VESC (il réutilise `../vesc/css/app.css` et `../vesc/js/ui.js`).

Adresse : <https://cedric167.github.io/litefoil-tracker/bms/>

| Page | Contenu |
|---|---|
| Accueil | Charge, puissance, temps restant estimé, tension, courant, écart entre cellules, température, cycles, état des MOS et de l'équilibrage, mini-graphe des cellules |
| Cellules | Tension de chaque cellule (plus haute / plus basse), écart dans le temps, sondes de température |
| Alarmes | Défauts actifs en français (niveau 1 = alerte, niveau 2 = protection), journal de la session |
| Protections | Tous les seuils du BMS (cellules, pack, courants, températures, écarts, équilibrage, capacité, chimie, veille), protégés par le mot de passe des paramètres comme dans l'appli du fabricant ; vérifications de cohérence ; aperçu avant écriture et relecture |
| Commandes | MOS de charge et de décharge, calibrage de la charge (SOC), courant à zéro, redémarrage |
| Infos | Versions logicielle et matérielle, code machine, date de fabrication ; sauvegarde et import des protections |

Accès : même code que l'Atelier VESC (`../vesc/js/lock.js`), demandé une fois par session pour les deux ateliers.

Protocoles : **Modbus** (trames `0xD2`, BMS récents) pour tout, **A5** (anciens modules)
pour la lecture, les MOS et la charge. Service Bluetooth `fff0`, notification `fff1`, écriture `fff2`.
Registres d'après le tableau Modbus et le protocole UART/485 V1.2 publiés par le fabricant. Reconnexion automatique après une coupure, mode démo.

Pas repris volontairement : arrêt complet du BMS (`0xF1`) et remise à zéro usine (`0xF3`), trop risqués
depuis un téléphone sur l'eau.

```sh
node bms/tests/protocol.test.mjs   # CRC (exemples officiels du fabricant), conversions, décodage
```

Licence GPL-3.0 (`LICENSE`), comme l'Atelier VESC.
