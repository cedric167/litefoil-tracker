#!/bin/bash
# Lite Foil : fabrique sur ce PC (Git Bash) le paquet Android signé à envoyer sur Google Play.
# Utilisé le 13/11/2026 pour la version 1.4.0 (code 15), Codemagic n'ayant pas le keystore.
#
#   bash scripts/build-android-local.sh <code de version> [nom de version]
#   ex. : bash scripts/build-android-local.sh 16 1.4.1
#
# Prérequis (déjà présents sur le PC de Cédric) :
#   JDK 17      : C:/Users/ASUS/android-sdk-tools/jdk/jdk-17.*
#   SDK Android : C:/Users/ASUS/android-sdk-tools/sdk (platforms;android-36, build-tools;36.0.0)
#   Clé         : $LF_CERT/signing.keystore + signing-key-info.txt (mots de passe lus dans ce fichier,
#                 jamais écrits ailleurs). Par défaut C:/Users/ASUS/Downloads/litefoil-tracker-web/cert
# Résultat : ../Lite-Foil-natif-<nom>.aab (moins de 10 Mo).
set -euo pipefail
VC="${1:?code de version (entier supérieur au dernier publié sur Google Play)}"
VN="${2:-1.4.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
TOOLS="${LF_ANDROID_TOOLS:-C:/Users/ASUS/android-sdk-tools}"
CERT="${LF_CERT:-C:/Users/ASUS/Downloads/litefoil-tracker-web/cert}"
export JAVA_HOME="$(ls -d "$TOOLS"/jdk/jdk-17* | head -1)"
M=android/app/src/main/AndroidManifest.xml

npm install
npm run build:www
# modules Firebase (notifications, connexion) : installés pour le build, sans modifier package.json
npm install @capacitor-firebase/messaging@6.3.1 @capacitor-firebase/authentication@6.3.1 firebase@10.12.5
rm -rf android
npx cap add android
git checkout package.json package-lock.json
cp android-assets/google-services.json android/app/google-services.json
bash scripts/android-setup.sh
npx cap sync android

# L'appli charge le site en ligne (server.url) : inutile d'embarquer les gros dossiers (48 Mo de firmware…)
rm -rf android/app/src/main/assets/public/firmware android/app/src/main/assets/public/store android/app/src/main/assets/public/manuel

# GPS et Bluetooth facultatifs : sinon Google retire l'appli à ~2 700 appareils (tablettes sans GPS)
grep -q 'xmlns:tools' "$M" || sed -i '0,/<manifest /s|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' "$M"
sed -i 's|<uses-feature android:name="android.hardware.location.gps" />|<uses-feature android:name="android.hardware.location.gps" android:required="false" tools:replace="android:required" />\n    <uses-feature android:name="android.hardware.location" android:required="false" />\n    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />\n    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />|' "$M"

# Icônes de l'appli (celles des versions déjà publiées), si le dossier de l'ancien projet existe
OLD="${LF_OLD_ANDROID:-C:/Users/ASUS/Downloads/litefoil-tracker-web/android}"
if [ -d "$OLD/app/src/main/res/mipmap-hdpi" ]; then
  cp -r "$OLD"/app/src/main/res/mipmap-* android/app/src/main/res/
  cp "$OLD/app/src/main/res/values/ic_launcher_background.xml" android/app/src/main/res/values/
else
  echo "ATTENTION : icônes de l'ancien projet introuvables, l'appli aura l'icône Capacitor par défaut" >&2
fi

# Google Play exige la cible API 36 ; minSdk 24 comme les versions précédentes
sed -i 's/minSdkVersion = 22/minSdkVersion = 24/; s/compileSdkVersion = 34/compileSdkVersion = 36/; s/targetSdkVersion = 34/targetSdkVersion = 36/' android/variables.gradle
printf 'org.gradle.workers.max=2\norg.gradle.daemon=false\nandroid.suppressUnsupportedCompileSdk=36\n' >> android/gradle.properties
echo "sdk.dir=$TOOLS/sdk" > android/local.properties
sed -i -E "s/versionCode [0-9]+/versionCode $VC/; s/versionName \"[^\"]*\"/versionName \"$VN\"/" android/app/build.gradle

(cd android && ./gradlew.bat bundleRelease)

AAB=android/app/build/outputs/bundle/release/app-release.aab
F="$CERT/signing-key-info.txt"
get(){ grep -i "^$1:" "$F" | head -1 | sed -E 's/^[^:]*:\s*//' | tr -d '\r'; }
export LF_SP="$(get 'Key store password')" LF_KP="$(get 'Key password')"
"$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$CERT/signing.keystore" \
  -storepass:env LF_SP -keypass:env LF_KP "$AAB" "$(get 'Key alias')" > /dev/null
"$JAVA_HOME/bin/jarsigner" -verify "$AAB" | head -2
cp "$AAB" "../Lite-Foil-natif-$VN.aab"
ls -la "../Lite-Foil-natif-$VN.aab"
