#!/bin/bash
# Lite Foil : fabrique sur ce PC (Git Bash) le paquet signé de l'appli montre Android (Wear OS).
# Codemagic n'a pas le keystore : même méthode que scripts/build-android-local.sh.
#
#   bash scripts/build-wear-local.sh <code de version> [nom de version]
#   ex. : bash scripts/build-wear-local.sh 100001 1.0
#
# Le code de version doit être différent de tous ceux déjà envoyés sur Google Play pour fr.litefoil.tracker
# (téléphone : 15, 16, 17…). Convention : la montre commence à 100001.
# Résultat : ../Lite-Foil-montre-<nom>.aab et ../Lite-Foil-montre-<nom>-essai.apk (essai sur une montre par USB / Wi-Fi).
set -euo pipefail
VC="${1:?code de version (convention montre : 100001, 100002…)}"
VN="${2:-1.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
TOOLS="${LF_ANDROID_TOOLS:-C:/Users/ASUS/android-sdk-tools}"
CERT="${LF_CERT:-C:/Users/ASUS/Downloads/litefoil-tracker-web/cert}"
export JAVA_HOME="$(ls -d "$TOOLS"/jdk/jdk-17* | head -1)"
W=native/wear
[ -f android/gradlew.bat ] || { echo "dossier android/ absent : lancer d'abord scripts/build-android-local.sh (il fournit Gradle)" >&2; exit 1; }
cp android/gradlew android/gradlew.bat "$W/"
mkdir -p "$W/gradle" && cp -R android/gradle/wrapper "$W/gradle/"
echo "sdk.dir=$TOOLS/sdk" > "$W/local.properties"
cp "$W/app/build.gradle" "$W/app/build.gradle.orig"
trap 'mv -f "$ROOT/$W/app/build.gradle.orig" "$ROOT/$W/app/build.gradle"' EXIT
sed -i -E "s/versionCode [0-9]+/versionCode $VC/; s/versionName \"[^\"]*\"/versionName \"$VN\"/" "$W/app/build.gradle"

(cd "$W" && ./gradlew.bat clean bundleRelease assembleRelease --console=plain)

F="$CERT/signing-key-info.txt"
get(){ grep -i "^$1:" "$F" | head -1 | sed -E 's/^[^:]*:\s*//' | tr -d '\r'; }
export LF_SP="$(get 'Key store password')" LF_KP="$(get 'Key password')"
AAB="$W/app/build/outputs/bundle/release/app-release.aab"
"$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$CERT/signing.keystore" \
  -storepass:env LF_SP -keypass:env LF_KP "$AAB" "$(get 'Key alias')" > /dev/null
"$JAVA_HOME/bin/jarsigner" -verify "$AAB" | head -2
cp "$AAB" "../Lite-Foil-montre-$VN.aab"
# APK d'essai, signé avec la même clé (installable sur une montre avec adb)
APK="$W/app/build/outputs/apk/release/app-release-unsigned.apk"
BT="$(ls -d "$TOOLS"/sdk/build-tools/* | tail -1)"
"$BT/zipalign.exe" -f 4 "$APK" "$W/app/build/outputs/apk/release/app-aligned.apk"
"$BT/apksigner.bat" sign --ks "$CERT/signing.keystore" --ks-pass env:LF_SP --key-pass env:LF_KP --ks-key-alias "$(get 'Key alias')" \
  --out "../Lite-Foil-montre-$VN-essai.apk" "$W/app/build/outputs/apk/release/app-aligned.apk"
ls -la "../Lite-Foil-montre-$VN.aab" "../Lite-Foil-montre-$VN-essai.apk"
