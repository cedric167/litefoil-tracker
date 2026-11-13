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
plutil -replace NSLocationWhenInUseUsageDescription -string "Votre position sert à vous situer sur la carte, à enregistrer vos sorties et, si vous l'activez, à apparaître dans la communauté (zone approximative)." "$PLIST"
plutil -replace NSLocationAlwaysAndWhenInUseUsageDescription -string "Autorisez « Toujours » pour que l'enregistrement de votre sortie continue quand l'écran est éteint ou le téléphone dans la poche. L'enregistrement ne tourne que pendant une sortie que vous avez démarrée, et vous l'arrêtez vous-même." "$PLIST"
plutil -replace UIBackgroundModes -json '["location"]' "$PLIST"
plutil -replace NSLocationAlwaysUsageDescription -string "Autorisez « Toujours » pour que l'enregistrement de votre sortie continue quand l'écran est éteint, et reprenne si l'appli est fermée. L'enregistrement ne tourne que pendant une sortie que vous avez démarrée." "$PLIST"
plutil -replace NSMicrophoneUsageDescription -string "Le micro sert aux appels audio et vidéo entre riders, et au son de vos vidéos." "$PLIST"
plutil -replace NSCameraUsageDescription -string "La caméra sert aux appels vidéo entre riders, et à filmer ou photographier pour vos publications." "$PLIST"
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"
plutil -lint "$PLIST" >/dev/null

# 2) Projet Xcode : iOS 15 minimum (exigé par Xcode 27), scripts CocoaPods hors bac à sable,
#    iPhone uniquement (pas de captures iPad à fournir ; l'app reste installable sur iPad en mode iPhone), équipe Apple
sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = 1[0-4]\.[0-9];/IPHONEOS_DEPLOYMENT_TARGET = 15.0;/' "$PBX"
sed -i '' 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/' "$PBX"
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/' "$PBX"
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

# 5 bis) Module natif LfTrack (native/ios) : enregistrement GPS des sorties écran verrouillé,
#    et reprise automatique si l'appli est fermée (relance par iOS sur déplacement important).
#    Les fichiers Swift sont ajoutés à la cible App ; Main.storyboard utilise LFViewController
#    (qui enregistre le module) ; AppDelegate relance l'enregistrement au démarrage si une sortie est en cours.
cp "$ROOT/native/ios/LfTrackRecorder.swift" "$ROOT/native/ios/LfTrackPlugin.swift" "$ROOT/native/ios/LFViewController.swift" "$APP/App/"
/usr/bin/env ruby -e '
  require "xcodeproj"
  p = Xcodeproj::Project.open(ARGV[0])
  t = p.targets.find { |x| x.name == "App" }
  g = p.main_group.find_subpath("App", false)
  %w[LfTrackRecorder.swift LfTrackPlugin.swift LFViewController.swift].each do |n|
    next if g.files.any? { |f| f.path == n }
    t.add_file_references([g.new_reference(n)])
  end
  p.save
' "$APP/App.xcodeproj"
STORY="$APP/App/Base.lproj/Main.storyboard"
if grep -q 'customClass="CAPBridgeViewController"' "$STORY"; then
  sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="LFViewController" customModule="App" customModuleProvider="target"/' "$STORY"
fi
grep -q 'customClass="LFViewController"' "$STORY" || { echo "Main.storyboard : LFViewController non appliqué" >&2; exit 1; }
DELEGATE="$APP/App/AppDelegate.swift"
if ! grep -q "LITEFOIL_TRACK" "$DELEGATE"; then
  /usr/bin/ruby -E UTF-8 -e '
    f = ARGV[0]; s = File.read(f)
    s.sub!(/(didFinishLaunchingWithOptions[^{]*\{\n)/) { $1 + "        // LITEFOIL_TRACK : reprend l\u2019enregistrement d\u2019une sortie en cours (relance par iOS, appli ferm\u00e9e)\n        LfTrackRecorder.shared.resumeIfNeeded()\n" } or abort "didFinishLaunching introuvable"
    File.write(f, s)
  ' "$DELEGATE"
fi

echo "Réglages iOS Lite Foil appliqués (équipe $TEAM). Étape suivante : npx cap sync ios"

# 6) Notifications (messages privés, groupes, discussions d'événements) + chiffre sur l'icône.
#    Activé seulement si ios-assets/GoogleService-Info.plist existe (fichier de l'appli iOS
#    téléchargé depuis la console Firebase). Sans lui, l'appli est construite comme avant.
#    Codemagic installe alors le module @capacitor-firebase/messaging (voir codemagic.yaml).
GSI="$ROOT/ios-assets/GoogleService-Info.plist"
if [ -f "$GSI" ]; then
  cp "$GSI" "$APP/App/GoogleService-Info.plist"
  # fichier ajouté aux ressources de l'appli dans le projet Xcode
  /usr/bin/env ruby -e '
    require "xcodeproj"
    p = Xcodeproj::Project.open(ARGV[0])
    t = p.targets.find { |x| x.name == "App" }
    g = p.main_group.find_subpath("App", false)
    unless g.files.any? { |f| f.path == "GoogleService-Info.plist" }
      t.add_resources([g.new_reference("GoogleService-Info.plist")])
      p.save
    end
  ' "$APP/App.xcodeproj"
  # droit « notifications push » (aps-environment) : l'identifiant d'app doit avoir Push Notifications activé chez Apple
  cat > "$APP/App/App.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>
</dict>
</plist>
PLIST
  sed -i '' '/CODE_SIGN_ENTITLEMENTS = /d' "$PBX"
  sed -i '' "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic;\\
				CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/" "$PBX"
  plutil -replace UIBackgroundModes -json '["location","remote-notification"]' "$PLIST"
  # AppDelegate : démarre Firebase et transmet le jeton Apple au module de notifications
  DELEGATE="$APP/App/AppDelegate.swift"
  if ! grep -q "LITEFOIL_PUSH" "$DELEGATE"; then
    /usr/bin/ruby -E UTF-8 -e '
      f = ARGV[0]; s = File.read(f)
      s.sub!("import Capacitor\n", "import Capacitor\nimport FirebaseCore\nimport FirebaseMessaging\n") or abort "import Capacitor introuvable"
      s.sub!(/(didFinishLaunchingWithOptions[^{]*\{\n)/) { $1 + "        // LITEFOIL_PUSH : Firebase pour les notifications\n        if FirebaseApp.app() == nil { FirebaseApp.configure() }\n" } or abort "didFinishLaunching introuvable"
      methods = <<~SWIFT
          // LITEFOIL_PUSH : jeton Apple -> jeton Firebase, transmis au module @capacitor-firebase/messaging
          func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
              Messaging.messaging().apnsToken = deviceToken
              Messaging.messaging().token(completion: { (token, error) in
                  if let error = error {
                      NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
                  } else if let token = token {
                      NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                  }
              })
          }

          func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
              NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
          }

      SWIFT
      methods = methods.gsub(/^/, "    ").gsub(/^    $/, "")
      s.sub!(/(\n    func applicationWillResignActive)/) { "\n" + methods + $1.sub(/\A\n/, "") } or abort "applicationWillResignActive introuvable"
      File.write(f, s)
    ' "$DELEGATE"
  fi
  # connexion Google : l'appli doit s'ouvrir sur le schéma REVERSED_CLIENT_ID (retour de la page Google)
  RCID=$(/usr/libexec/PlistBuddy -c "Print :REVERSED_CLIENT_ID" "$GSI" 2>/dev/null || true)
  if [ -n "$RCID" ]; then
    plutil -replace CFBundleURLTypes -json "[{\"CFBundleURLName\":\"google\",\"CFBundleURLSchemes\":[\"$RCID\"]}]" "$PLIST"
  else
    echo "Attention : REVERSED_CLIENT_ID absent de GoogleService-Info.plist (activer Google dans Firebase puis retélécharger le fichier)."
  fi
  plutil -lint "$PLIST" >/dev/null
  echo "Notifications et connexion Apple/Google iOS activées (GoogleService-Info.plist présent)."
else
  echo "Notifications iOS non activées : ios-assets/GoogleService-Info.plist absent."
fi
