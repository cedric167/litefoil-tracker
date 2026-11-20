import Foundation
import UIKit
import Capacitor
import AVFoundation

/// Lite Foil : module « LfCall » côté iPhone (20/11/2026).
/// audio() : pendant un appel, bascule le son entre l'écouteur et le haut-parleur, et éteint l'écran contre l'oreille.
/// done()  : fin d'appel, on rend la main au système.
/// Le micro qui reste actif appli en arrière-plan vient du mode « audio » déclaré dans Info.plist (scripts/ios-setup.sh).
@objc(LfCallPlugin)
public class LfCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LfCallPlugin"
    public let jsName = "LfCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "audio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "done", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise)
    ]

    private var routed = false

    @objc func audio(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? true
        if !on { finish(); call.resolve(); return }
        let speaker = call.getBool("speaker") ?? true
        let video = call.getBool("video") ?? false
        let route = call.getBool("route") ?? false
        // tant que l'utilisateur n'a pas touché le bouton, on laisse la sortie choisie par le système
        guard route else { call.resolve(); return }
        let s = AVAudioSession.sharedInstance()
        do {
            var opts: AVAudioSession.CategoryOptions = [.allowBluetooth]
            if speaker { opts.insert(.defaultToSpeaker) }
            try s.setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat, options: opts)
            try s.overrideOutputAudioPort(speaker ? .speaker : .none)
            try s.setActive(true)
            routed = true
            DispatchQueue.main.async { UIDevice.current.isProximityMonitoringEnabled = !speaker && !video }
            call.resolve()
        } catch {
            call.reject("sortie audio non modifiable")
        }
    }

    @objc func done(_ call: CAPPluginCall) {
        finish()
        call.resolve()
    }

    /// Android garde ici le choix fait sur l'écran d'appel natif ; rien de tel sur iPhone.
    @objc func pending(_ call: CAPPluginCall) {
        call.resolve([:])
    }

    private func finish() {
        DispatchQueue.main.async { UIDevice.current.isProximityMonitoringEnabled = false }
        if routed {
            routed = false
            try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.none)
        }
    }
}
