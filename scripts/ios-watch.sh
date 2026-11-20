#!/bin/bash
# Lite Foil : ajoute l'appli Apple Watch (bouton SOS) au projet iOS généré par Capacitor.
# À lancer APRÈS scripts/ios-setup.sh, `npx cap sync ios` et scripts/ios-post-sync.sh.
#   bash scripts/ios-watch.sh            ajoute la cible « LiteFoilWatch » et le module LfWatch
#   bash scripts/ios-watch.sh version 1.6.0 12345   même version et même numéro de build pour l'iPhone et la montre (exigé par Apple)
# Relançable sans risque.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/ios/App"
PROJ="$APP/App.xcodeproj"
TEAM="${IOS_TEAM_ID:-CKZ892CTBW}"
WATCH_ID="${WATCH_BUNDLE_ID:-fr.litefoil.tracker.watchkitapp}"
[ -d "$PROJ" ] || { echo "ios/ introuvable" >&2; exit 1; }

if [ "${1:-}" = "version" ]; then
  /usr/bin/env ruby -e '
    require "xcodeproj"
    p = Xcodeproj::Project.open(ARGV[0])
    p.targets.each do |t|
      next unless %w[App LiteFoilWatch].include?(t.name)
      t.build_configurations.each do |c|
        c.build_settings["MARKETING_VERSION"] = ARGV[1]
        c.build_settings["CURRENT_PROJECT_VERSION"] = ARGV[2]
      end
    end
    p.save
  ' "$PROJ" "$2" "$3"
  PL="$APP/App/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $2" "$PL"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $3" "$PL"
  echo "Version $2 ($3) appliquée à l'iPhone et à la montre."
  exit 0
fi

# 1) fichiers de l'appli montre
W="$APP/LiteFoilWatch"
mkdir -p "$W/Assets.xcassets/AppIcon.appiconset"
cp "$ROOT/native/watch/LiteFoilWatchApp.swift" "$ROOT/native/watch/Info.plist" "$ROOT/native/watch/LiteFoilWatch.entitlements" "$W/"
cp "$ROOT/ios-assets/AppIcon-1024.png" "$W/Assets.xcassets/AppIcon.appiconset/icon.png"
cat > "$W/Assets.xcassets/Contents.json" <<'JSON'
{ "info" : { "author" : "xcode", "version" : 1 } }
JSON
cat > "$W/Assets.xcassets/AppIcon.appiconset/Contents.json" <<'JSON'
{ "images" : [ { "filename" : "icon.png", "idiom" : "universal", "platform" : "watchos", "size" : "1024x1024" } ],
  "info" : { "author" : "xcode", "version" : 1 } }
JSON

# 2) module LfWatch côté iPhone (transmet la sortie SOS à la montre)
cp "$ROOT/native/ios/LfWatchPlugin.swift" "$APP/App/"
VC="$APP/App/LFViewController.swift"
grep -q "LfWatchPlugin()" "$VC" || sed -i '' 's/bridge?.registerPluginInstance(LfTrackPlugin())/bridge?.registerPluginInstance(LfTrackPlugin())\
        bridge?.registerPluginInstance(LfWatchPlugin())/' "$VC"
grep -q "LfWatchPlugin()" "$VC" || { echo "LFViewController : LfWatch non enregistré" >&2; exit 1; }

# 3) projet Xcode : cible montre, embarquée dans l'appli iPhone
/usr/bin/env ruby -e '
  require "xcodeproj"
  proj, team, wid = ARGV
  p = Xcodeproj::Project.open(proj)
  app = p.targets.find { |x| x.name == "App" } or abort "cible App introuvable"
  g = p.main_group.find_subpath("App", false)
  unless g.files.any? { |f| f.path == "LfWatchPlugin.swift" }
    app.add_file_references([g.new_reference("LfWatchPlugin.swift")])
  end
  unless p.targets.any? { |x| x.name == "LiteFoilWatch" }
    t = p.new_target(:application, "LiteFoilWatch", :watchos, "9.0", nil, :swift)
    wg = p.main_group.new_group("LiteFoilWatch", "LiteFoilWatch")
    t.add_file_references([wg.new_reference("LiteFoilWatchApp.swift")])
    t.add_resources([wg.new_reference("Assets.xcassets")])
    wg.new_reference("Info.plist")
    t.build_configurations.each do |c|
      s = c.build_settings
      s.delete("IPHONEOS_DEPLOYMENT_TARGET")
      s["SDKROOT"] = "watchos"
      s["SUPPORTED_PLATFORMS"] = "watchos watchsimulator"
      s["WATCHOS_DEPLOYMENT_TARGET"] = "9.0"
      s["TARGETED_DEVICE_FAMILY"] = "4"
      s["PRODUCT_BUNDLE_IDENTIFIER"] = wid
      s["PRODUCT_NAME"] = "$(TARGET_NAME)"
      s["INFOPLIST_FILE"] = "LiteFoilWatch/Info.plist"
      s["CODE_SIGN_ENTITLEMENTS"] = "LiteFoilWatch/LiteFoilWatch.entitlements"
      s["GENERATE_INFOPLIST_FILE"] = "NO"
      s["ASSETCATALOG_COMPILER_APPICON_NAME"] = "AppIcon"
      s["SWIFT_VERSION"] = "5.0"
      s["DEVELOPMENT_TEAM"] = team
      s["CODE_SIGN_STYLE"] = "Automatic"
      s["SKIP_INSTALL"] = "YES"
      s["ENABLE_USER_SCRIPT_SANDBOXING"] = "NO"
      s["MARKETING_VERSION"] = "1.0"
      s["CURRENT_PROJECT_VERSION"] = "1"
      s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks"]
    end
    app.add_dependency(t)
    ph = app.new_copy_files_build_phase("Embed Watch Content")
    ph.dst_subfolder_spec = "16"
    ph.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
    bf = ph.add_file_reference(t.product_reference)
    bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
  end
  p.save
' "$PROJ" "$TEAM" "$WATCH_ID"
echo "Appli Apple Watch ajoutée au projet iOS ($WATCH_ID)."
