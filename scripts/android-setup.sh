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
# 1 ter) Écran d'appel entrant façon téléphone (15/11) : plein écran, sonnerie en boucle, Décrocher / Refuser
cp "$ROOT/native/android/LfCall.java" "$ROOT/native/android/LfCallActivity.java" "$ROOT/native/android/LfCallReceiver.java"    "$ROOT/native/android/LfCallMessagingService.java" "$ROOT/native/android/LfCallPlugin.java" "$ROOT/native/android/LfCallService.java" "$PKG_DIR/"
# 1 quater) Écran d'alerte SOS (18/11) : plein écran, sonnerie en boucle sur le volume alarme (s'entend en silencieux)
cp "$ROOT/native/android/LfSos.java" "$ROOT/native/android/LfSosActivity.java" "$PKG_DIR/"

# 1 bis) Sonneries (appel, SOS) jouées par les notifications, même appli fermée
mkdir -p "$MAIN/res/raw"
cp "$ROOT/native/sounds/lf_ring.ogg" "$ROOT/native/sounds/lf_sos.ogg" "$MAIN/res/raw/"

# 2) Permissions : localisation, service de premier plan (Android 14+), notification (Android 13+)
for P in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION FOREGROUND_SERVICE FOREGROUND_SERVICE_LOCATION FOREGROUND_SERVICE_MICROPHONE WAKE_LOCK POST_NOTIFICATIONS RECORD_AUDIO MODIFY_AUDIO_SETTINGS CAMERA USE_FULL_SCREEN_INTENT VIBRATE; do
  grep -q "android.permission.$P\"" "$MANIFEST" || \
    perl -0pi -e "s#(<uses-permission android:name=\"android.permission.INTERNET\" />)#\$1\n    <uses-permission android:name=\"android.permission.$P\" />#" "$MANIFEST"
done
grep -q 'android.hardware.location.gps' "$MANIFEST" || \
  perl -0pi -e 's#(<uses-permission android:name="android.permission.INTERNET" />)#$1\n    <uses-feature android:name="android.hardware.location.gps" />#' "$MANIFEST"

# 2 bis) Appels audio/vidéo : micro et caméra, jamais obligatoires (aucun appareil exclu du Play Store)
for F in camera camera.autofocus microphone; do
  grep -q "android.hardware.$F\"" "$MANIFEST" || \
    perl -0pi -e "s#(<uses-permission android:name=\"android.permission.INTERNET\" />)#\$1\n    <uses-feature android:name=\"android.hardware.$F\" android:required=\"false\" />#" "$MANIFEST"
done

# 3) Déclaration du service (dans <application>)
if ! grep -q 'LfTrackService' "$MANIFEST"; then
  perl -0pi -e 's#(\s*</application>)#\n        <!-- Lite Foil : enregistrement GPS des sorties, continue appli fermée -->\n        <service android:name=".LfTrackService" android:exported="false" android:foregroundServiceType="location" android:stopWithTask="false" />$1#' "$MANIFEST"
fi
grep -q 'LfTrackService' "$MANIFEST" || { echo "Service LfTrack non déclaré dans le manifeste" >&2; exit 1; }

# 3 bis) Écran d'appel : activité plein écran (par-dessus l'écran verrouillé), bouton Refuser, et réception des messages
#        du serveur par LfCallMessagingService (qui remplace le service du module de notifications et lui passe le reste)
if ! grep -q 'LfCallActivity' "$MANIFEST"; then
  grep -q 'xmlns:tools' "$MANIFEST" || sed -i '0,/<manifest /s|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' "$MANIFEST"
  perl -0pi -e 's#(\s*</application>)#
        <!-- Lite Foil : appel entrant façon téléphone -->
        <activity android:name=".LfCallActivity" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true" android:excludeFromRecents="true" android:taskAffinity="fr.litefoil.tracker.call" android:launchMode="singleInstance" android:screenOrientation="portrait" android:theme="\@android:style/Theme.DeviceDefault.NoActionBar" />
        <receiver android:name=".LfCallReceiver" android:exported="false" />
        <service android:name=".LfCallMessagingService" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
        <service android:name="io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService" tools:node="remove" />$1#' "$MANIFEST"
fi
# 3 bis-2) Appel en cours (20/11) : service de premier plan « microphone », le micro reste actif quand on quitte l'appli
if ! grep -q 'LfCallService' "$MANIFEST"; then
  perl -0pi -e 's#(\s*</application>)#
        <!-- Lite Foil : appel en cours, micro actif en arriere-plan -->
        <service android:name=".LfCallService" android:exported="false" android:foregroundServiceType="microphone" />$1#' "$MANIFEST"
fi
grep -q 'LfCallService' "$MANIFEST" || { echo "Service d appel non déclaré dans le manifeste" >&2; exit 1; }
# 3 ter) Écran d'alerte SOS : activité plein écran par-dessus l'écran verrouillé
if ! grep -q 'LfSosActivity' "$MANIFEST"; then
  perl -0pi -e 's#(\s*</application>)#
        <!-- Lite Foil : alerte SOS d un proche -->
        <activity android:name=".LfSosActivity" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true" android:excludeFromRecents="true" android:taskAffinity="fr.litefoil.tracker.sos" android:launchMode="singleInstance" android:screenOrientation="portrait" android:theme="\@android:style/Theme.DeviceDefault.NoActionBar" />$1#' "$MANIFEST"
fi
grep -q 'LfSosActivity' "$MANIFEST" || { echo "Écran SOS non déclaré dans le manifeste" >&2; exit 1; }
# LfCallMessagingService utilise la bibliothèque de messagerie Firebase (même version que le module de notifications)
APPGRADLE="$ROOT/android/app/build.gradle"
grep -q 'firebase-messaging' "$APPGRADLE" || \
  sed -i "s|    implementation project(':capacitor-android')|    implementation project(':capacitor-android')\n    implementation \"com.google.firebase:firebase-messaging:23.4.1\"|" "$APPGRADLE"
grep -q 'LfCallMessagingService' "$MANIFEST" || { echo "Écran d'appel non déclaré dans le manifeste" >&2; exit 1; }

# 4) Connexion Google (module @capacitor-firebase/authentication, s'il est installé) : bibliothèque Google incluse
VARS="$ROOT/android/variables.gradle"
if [ -f "$VARS" ] && ! grep -q rgcfaIncludeGoogle "$VARS"; then
  perl -0pi -e 's#ext \{#ext {\n    rgcfaIncludeGoogle = true#' "$VARS"
fi

echo "Module LfTrack ajouté au projet Android."
