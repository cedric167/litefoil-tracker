#!/bin/bash
# Applique les réglages Lite Foil au projet iOS généré par Capacitor (dossier ios/, ignoré par git).
# À lancer après `npx cap add ios` et AVANT `npx cap sync ios` (le sync relance pod install).
# Sans risque si on le relance : chaque réglage est réécrit à l'identique.
#
#   bash scripts/ios-setup.sh            (ou : npm run ios:setup)
#
# Variable optionnelle : IOS_TEAM_ID (équipe Apple, par défaut celle de Lite Foil).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/ios/App"
PLIST="$APP/App/Info.plist"
PBX="$APP/App.xcodeproj/project.pbxproj"
PODFILE="$APP/Podfile"
ASSETS="$APP/App/Assets.xcassets"
TEAM="${IOS_TEAM_ID:-CKZ892CTBW}"

[ -f "$PLIST" ] || { echo "ios/ introuvable : lancer d'abord npx cap add ios" >&2; exit 1; }

# 1) Info.plist : permissions, Bluetooth en arrière-plan, chiffrement standard (HTTPS uniquement)
plutil -replace NSBluetoothAlwaysUsageDescription -string "Lite Foil se connecte en Bluetooth à votre tracker, votre télécommande et votre batterie." "$PLIST"
plutil -replace NSBluetoothPeripheralUsageDescription -string "Lite Foil se connecte en Bluetooth à votre matériel Lite Foil." "$PLIST"
plutil -replace NSLocationWhenInUseUsageDescription -string "Votre position sert à vous situer sur la carte et, si vous l'activez, à apparaître dans la communauté (zone approximative)." "$PLIST"
plutil -replace UIBackgroundModes -json '["bluetooth-central"]' "$PLIST"
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"
plutil -lint "$PLIST" >/dev/null

# 2) Projet Xcode : iOS 15 minimum (exigé par Xcode 27), scripts CocoaPods hors bac à sable, équipe Apple
sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = 1[0-4]\.[0-9];/IPHONEOS_DEPLOYMENT_TARGET = 15.0;/' "$PBX"
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/' "$PBX"
sed -i '' '/DEVELOPMENT_TEAM = /d' "$PBX"
sed -i '' "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic;\\
				DEVELOPMENT_TEAM = $TEAM;/" "$PBX"

# 3) Podfile : iOS 15 pour l'app et pour tous les pods
sed -i '' -E "s/platform :ios, '1[0-4]\.[0-9]'/platform :ios, '15.0'/" "$PODFILE"
if ! grep -q "LITEFOIL_IOS15" "$PODFILE"; then
  /usr/bin/ruby -e '
    f = ARGV[0]
    s = File.read(f)
    patch = <<~RUBY
        # LITEFOIL_IOS15 : Xcode 27 ne supporte plus iOS < 15, on aligne tous les pods sur 15.0
        installer.pods_project.build_configurations.each do |config|
          config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "15.0"
        end
        installer.pods_project.targets.each do |target|
          target.build_configurations.each do |config|
            if config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"].to_f < 15.0
              config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "15.0"
            end
          end
        end
    RUBY
    patch = patch.gsub(/^/, "  ")
    abort "post_install introuvable dans le Podfile" unless s.sub!(/(assertDeploymentTarget\(installer\)\n)/) { $1 + patch }
    File.write(f, s)
  ' "$PODFILE"
fi

# 4) Icône et écran de démarrage Lite Foil (à la place des images par défaut de Capacitor)
cp "$ROOT/ios-assets/AppIcon-1024.png" "$ASSETS/AppIcon.appiconset/AppIcon-512@2x.png"
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  cp "$ROOT/ios-assets/splash-2732.png" "$ASSETS/Splash.imageset/$f"
done

# 5) Cycle de vie par scènes (UIScene) : sans lui, iOS 27 arrête l'app dès son lancement.
#    Le délégué de scène est ajouté dans AppDelegate.swift (déjà compilé : rien à déclarer dans le projet).
plutil -replace UIApplicationSceneManifest -json '{
  "UIApplicationSupportsMultipleScenes": false,
  "UISceneConfigurations": {
    "UIWindowSceneSessionRoleApplication": [{
      "UISceneConfigurationName": "Default Configuration",
      "UISceneDelegateClassName": "$(PRODUCT_MODULE_NAME).SceneDelegate",
      "UISceneStoryboardFile": "Main"
    }]
  }
}' "$PLIST"
DELEGATE="$APP/App/AppDelegate.swift"
if ! grep -q "class SceneDelegate" "$DELEGATE"; then
  cat >> "$DELEGATE" <<'SWIFT'

// Lite Foil : cycle de vie par scènes, exigé par iOS 27. La fenêtre vient du storyboard Main ;
// les liens ouverts sont renvoyés à Capacitor comme le faisait AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
SWIFT
fi
plutil -lint "$PLIST" >/dev/null

echo "Réglages iOS Lite Foil appliqués (équipe $TEAM). Étape suivante : npx cap sync ios"
