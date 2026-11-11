#!/bin/bash
# Lite Foil : à lancer APRÈS `npx cap sync ios` (le sync réécrit le Podfile).
# Connexion Google sur iPhone : le module @capacitor-firebase/authentication doit être pris avec son
# sous-module « Google » (sinon « Continuer avec Google » ne fait rien). Sans le module : rien à faire.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PODFILE="$ROOT/ios/App/Podfile"
[ -f "$PODFILE" ] || { echo "Podfile introuvable" >&2; exit 1; }
if grep -q "pod 'CapacitorFirebaseAuthentication'," "$PODFILE"; then
  sed -i '' "s#pod 'CapacitorFirebaseAuthentication',#pod 'CapacitorFirebaseAuthentication/Google',#" "$PODFILE"
  (cd "$ROOT/ios/App" && pod install)
  echo "Connexion Google iOS : sous-module Google ajouté."
else
  echo "Module de connexion absent : connexion Apple/Google non incluse dans cette version."
fi
