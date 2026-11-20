import Foundation
import UIKit
import Capacitor
import AVFoundation

/// Lite Foil : module « LfCall » côté iPhone (20/11/2026).
/// audio() : pendant un appel, envoie le son sur le haut-parleur, l'écouteur, le Bluetooth ou le casque, et éteint l'écran contre l'oreille.
///           Répond avec les sorties disponibles (outs) et celle en service (cur).
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
        let video = call.getBool("video") ?? false
        let route = call.getBool("route") ?? false
        let ask = call.getString("out") ?? "auto"
        let s = AVAudioSession.sharedInstance()
        // tant que l'utilisateur n'a rien choisi, on laisse la sortie choisie par le système
        guard route, ask != "auto" else { call.resolve(["outs": outs(s), "cur": current(s)]); return }
        do {
            let speaker = ask == "speaker"
            var opts: AVAudioSession.CategoryOptions = [.allowBluetooth]
            if speaker { opts.insert(.defaultToSpeaker) }
            try s.setCategory(.playAndRecord, mode: video ? .videoChat : .voiceChat, options: opts)
            try s.setActive(true)
            if speaker {
                try s.overrideOutputAudioPort(.speaker)
            } else {
                try s.overrideOutputAudioPort(.none)
                // l'entrée choisie entraîne la sortie : micro du téléphone = écouteur, micro Bluetooth = oreillette, micro du casque = casque
                let want: [AVAudioSession.Port] = ask == "bt" ? [.bluetoothHFP] : (ask == "wired" ? [.headsetMic, .usbAudio] : [.builtInMic])
                if let input = s.availableInputs?.first(where: { want.contains($0.portType) }) { try s.setPreferredInput(input) }
            }
            routed = true
            DispatchQueue.main.async { UIDevice.current.isProximityMonitoringEnabled = ask == "earpiece" && !video }
            call.resolve(["outs": outs(s), "cur": ask])
        } catch {
            call.reject("sortie audio non modifiable")
        }
    }

    /// Sorties proposées : haut-parleur, téléphone, et Bluetooth / casque s'ils sont branchés.
    private func outs(_ s: AVAudioSession) -> [String] {
        let ins = s.availableInputs ?? []
        var o = ["speaker"]
        let wired = ins.contains { $0.portType == .headsetMic || $0.portType == .usbAudio }
            || s.currentRoute.outputs.contains { $0.portType == .headphones }
        if !wired { o.append("earpiece") }
        if ins.contains(where: { $0.portType == .bluetoothHFP }) { o.append("bt") }
        if wired { o.append("wired") }
        return o
    }

    /// Sortie en service d'après la route audio du système.
    private func current(_ s: AVAudioSession) -> String {
        guard let p = s.currentRoute.outputs.first?.portType else { return "speaker" }
        switch p {
        case .builtInReceiver: return "earpiece"
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: return "bt"
        case .headphones, .usbAudio: return "wired"
        default: return "speaker"
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
