#!/bin/bash
# Lite Foil : à lancer JUSTE AVANT le build iOS (après « xcode-project use-profiles »).
# Le 19/11/2026, le journal Xcode a montré que l'appli était signée sans ses droits (pas de « aps-environment » :
# aucune notification possible sur iPhone ; pas de « Sign in with Apple »). Le réglage CODE_SIGN_ENTITLEMENTS posé par
# ios-setup.sh n'était plus dans le projet au moment du build. On le repose ici sur la cible App, et on vérifie.
#   bash scripts/ios-entitlements.sh          pose le réglage
#   bash scripts/ios-entitlements.sh verifie  après le build : échoue si l'appli n'a pas été signée avec le droit notifications
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/ios/App"

if [ "${1:-}" = "verifie" ]; then
  LOG="${2:-/tmp/xcodebuild_logs/App.log}"
  if grep -q '"aps-environment" = production' "$LOG"; then
    echo "Signature : droit notifications (aps-environment = production) présent."
  else
    echo "ERREUR : l'appli a été signée sans le droit notifications (aps-environment absent du journal Xcode)." >&2
    grep -n -A8 'Entitlements:' "$LOG" | head -40 >&2 || true
    exit 1
  fi
  exit 0
fi

[ -f "$APP/App/App.entitlements" ] || { echo "App.entitlements absent : notifications non configurées, rien à faire."; exit 0; }
/usr/bin/env ruby -e '
  require "xcodeproj"
  p = Xcodeproj::Project.open(ARGV[0])
  t = p.targets.find { |x| x.name == "App" } or abort "cible App introuvable"
  t.build_configurations.each do |c|
    c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
    puts "#{c.name} : CODE_SIGN_ENTITLEMENTS = #{c.build_settings["CODE_SIGN_ENTITLEMENTS"]} (signature #{c.build_settings["CODE_SIGN_STYLE"]}, profil #{c.build_settings["PROVISIONING_PROFILE_SPECIFIER"]})"
  end
  p.save
' "$APP/App.xcodeproj"
N=$(grep -c "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" "$APP/App.xcodeproj/project.pbxproj" || true)
[ "$N" -ge 2 ] || { echo "ERREUR : CODE_SIGN_ENTITLEMENTS non posé sur la cible App ($N)" >&2; exit 1; }
echo "Droits de l'appli (notifications, Sign in with Apple) rattachés à la cible App."
cat "$APP/App/App.entitlements"
