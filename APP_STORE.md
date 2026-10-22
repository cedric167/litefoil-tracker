# Lite Foil — Mise sur l'App Store Apple (plan)

## Approche
Capacitor (emballe le site en app iOS, garde 100% du code) + plugin Bluetooth natif
(@capacitor-community/bluetooth-le) + un "pont" qui redirige navigator.bluetooth -> natif
(le code BLE existant marche sans réécriture) + build cloud Codemagic (pas de Mac) -> App Store.

## Pourquoi un pont BLE
iOS ne supporte PAS le Web Bluetooth en app. BLE utilisé dans 3 fichiers (index.html, vesc/js/transport.js,
bms/js/protocol.js), ~6 connexions, API standard (requestDevice, gatt.connect, getCharacteristic,
startNotifications, writeValue, readValue) -> un seul shim couvre tout.

## Coûts
- Apple Developer : 99$/an — DÉJÀ PAYÉ.
- Codemagic : gratuit (500 min/mois de build macOS M-series) — suffisant.
- Total récurrent : juste 99$/an Apple.

## Durée réaliste
Dev (moi) ~1 session ; tests BLE sur iPhone (toi) quelques allers-retours ; review Apple 24-48h.
Estimation : quelques jours à ~1-2 semaines selon tests + review.

## Étapes
### Phase 1 — Technique (MOI, sur PC)
1. Ajouter Capacitor (bundle id ex. fr.litefoil.app, nom "Lite Foil").
2. Installer le plugin BLE natif.
3. Écrire le PONT navigator.bluetooth -> plugin (le coeur).
4. Config iOS : permissions (NSBluetoothAlwaysUsageDescription, NSLocationWhenInUseUsageDescription),
   icône, splash, nom.
5. codemagic.yaml (build + signature auto + upload App Store Connect).

### Phase 2 — Comptes & signature (TOI, je te guide)
6. App Store Connect : créer l'app "Lite Foil" + bundle id + catégorie.
7. Générer une clé API App Store Connect (pour upload auto par Codemagic).
8. Créer compte Codemagic (gratuit, login GitHub), connecter le repo.
9. Coller la clé API Apple dans Codemagic (signature automatique).

### Phase 3 — Build & test
10. 1er build Codemagic -> app iOS signée.
11. Installer sur iPhone via TestFlight (test interne).
12. TESTER LE BLUETOOTH sur iPhone réel (tracker, télécommande, VESC, batterie) -> corrections.

### Phase 4 — Fiche & soumission
13. Fiche App Store (captures iPhone, description, App Privacy = équiv. Data Safety).
14. Soumettre pour review Apple -> en ligne.

## Points d'attention
- BLE iOS : quirks (scan/permissions/reconnexion) -> test sur vrai iPhone indispensable.
- Review Apple 4.2 (anti "simple site web") : défendable grâce au BLE natif + offline ; soigner la fiche.
- Localisation (communauté) : justification claire + App Privacy.
- iPhone nécessaire pour tester (OK).

## Ce que tu devras faire (je te guiderai)
Créer compte Codemagic ; quelques manips App Store Connect (créer l'app, clé API) ; tester via TestFlight.
