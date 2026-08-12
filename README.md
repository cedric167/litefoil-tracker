# Configuration du traceur LiteFoil

Page de configuration Bluetooth du traceur GPS / 4G eFoil : état en direct
(position, satellites, points envoyés, réseau) et changement des identifiants
sportstracklive enregistrés dans la mémoire du traceur.

Un seul fichier, `index.html`, sans aucune dépendance externe.

## Pourquoi un hébergement web

Le Bluetooth web (`navigator.bluetooth`) exige un contexte sécurisé : la page
doit être servie en **HTTPS**. Un fichier ouvert localement (`file://`) ne
convient pas, et une page d'artefact Claude non plus — son contenu est affiché
depuis un domaine tiers alors que l'autorisation Bluetooth y est limitée à
`self`. GitHub Pages fournit l'HTTPS gratuitement et sans restriction.

## Compatibilité

Chrome ou Edge sur **Android**. Safari et les navigateurs iOS ne gèrent pas le
Bluetooth web : sur iPhone, il faut passer par nRF Connect (les UUID et les
commandes JSON sont dans le PDF de la fiche).

## Appareil visé

| | |
|---|---|
| Nom Bluetooth | `LITEFOIL-TRACKER` |
| Service | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| État (notify) | `beb5483e-36e1-4688-b7f5-ea07361b26a8` |
| Identifiants (write) | `beb5483e-36e1-4688-b7f5-ea07361b26a9` |
| Commandes (write) | `beb5483e-36e1-4688-b7f5-ea07361b26ab` |

Firmware correspondant : `efoil_tracker.ino` du dépôt `efoil`.
