import Foundation
import Capacitor
import WatchConnectivity

/// Lite Foil : module « LfWatch ». La page donne à l'Apple Watch la sortie SOS en attente
/// (adresse du serveur + clé secrète + nom du rider) ; iOS la transmet à la montre dès qu'il le peut,
/// même si la montre est hors de portée à ce moment-là.
@objc(LfWatchPlugin)
public class LfWatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "LfWatchPlugin"
    public let jsName = "LfWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    private var pending: [String: Any]?

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func push() {
        guard WCSession.isSupported(), let c = pending else { return }
        let s = WCSession.default
        guard s.activationState == .activated else { return }
        do { try s.updateApplicationContext(c) } catch { }
    }

    @objc func setSos(_ call: CAPPluginCall) {
        pending = [
            "api": call.getString("api") ?? "",
            "k": call.getString("k") ?? "",
            "ps": call.getString("ps") ?? "",
            "em": call.getString("em") ?? "112",
            "n": call.getInt("n") ?? 0
        ]
        push()
        call.resolve(["ok": true])
    }

    @objc func status(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(["supported": false, "paired": false, "installed": false]); return }
        let s = WCSession.default
        let on = s.activationState == .activated
        call.resolve(["supported": true, "paired": on && s.isPaired, "installed": on && s.isWatchAppInstalled])
    }

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        push()
    }
    public func sessionDidBecomeInactive(_ session: WCSession) { }
    public func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    public func sessionWatchStateDidChange(_ session: WCSession) { push() }
}
