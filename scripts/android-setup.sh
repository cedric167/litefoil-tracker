#!/bin/bash
# Lite Foil : ajoute au projet Android généré par Capacitor (dossier android/, ignoré par git)
# le module natif LfTrack (native/android) : suivi GPS d'une sortie qui continue écran éteint
# ET appli fermée (service de premier plan « location », stopWithTask=false).
# À lancer après `npx cap add android` et avant `npx cap sync android`. Relançable sans risque.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$ROOT/android/app/src/main"
MANIFEST="$MAIN/AndroidManifest.xml"
PKG_DIR="$MAIN/java/fr/litefoil/tracker"

[ -f "$MANIFEST" ] || { echo "android/ introuvable : lancer d'abord npx cap add android" >&2; exit 1; }
mkdir -p "$PKG_DIR"

# 1) Code Java : stockage, service, module Capacitor, et MainActivity qui enregistre le module
cp "$ROOT/native/android/LfTrackStore.java" "$ROOT/native/android/LfTrackService.java" \
   "$ROOT/native/android/LfTrackPlugin.java" "$ROOT/native/android/MainActivity.java" "$PKG_DIR/"

# 2) Permissions : localisation, service de premier plan (Android 14+), notification (Android 13+)
for P in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION FOREGROUND_SERVICE FOREGROUND_SERVICE_LOCATION WAKE_LOCK POST_NOTIFICATIONS; do
  grep -q "android.permission.$P\"" "$MANIFEST" || \
    perl -0pi -e "s#(<uses-permission android:name=\"android.permission.INTERNET\" />)#\$1\n    <uses-permission android:name=\"android.permission.$P\" />#" "$MANIFEST"
done
grep -q 'android.hardware.location.gps' "$MANIFEST" || \
  perl -0pi -e 's#(<uses-permission android:name="android.permission.INTERNET" />)#$1\n    <uses-feature android:name="android.hardware.location.gps" />#' "$MANIFEST"

# 3) Déclaration du service (dans <application>)
if ! grep -q 'LfTrackService' "$MANIFEST"; then
  perl -0pi -e 's#(\s*</application>)#\n        <!-- Lite Foil : enregistrement GPS des sorties, continue appli fermée -->\n        <service android:name=".LfTrackService" android:exported="false" android:foregroundServiceType="location" android:stopWithTask="false" />$1#' "$MANIFEST"
fi
grep -q 'LfTrackService' "$MANIFEST" || { echo "Service LfTrack non déclaré dans le manifeste" >&2; exit 1; }

echo "Module LfTrack ajouté au projet Android."
