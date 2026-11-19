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
        CAPPluginMethod(name: "setScreens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "live", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeRides", returnType: CAPPluginReturnPromise)
    ]

    private var pending: [String: Any]?
    /// écrans de la montre composés dans l'appli (liste d'écrans en JSON + libellés des infos)
    private var screens: [String: Any] = [:]

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func push() {
        guard WCSession.isSupported() else { return }
        var c: [String: Any] = pending ?? [:]
        for (k, v) in screens { c[k] = v }
        guard !c.isEmpty else { return }
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

    /// Écrans de la montre : « scr » = liste d'écrans en JSON, « lb » = libellé de chaque info.
    @objc func setScreens(_ call: CAPPluginCall) {
        screens["scr"] = call.getString("scr") ?? "[]"
        if let s2 = call.getString("scr2"), !s2.isEmpty { screens["scr2"] = s2 }   // nouvelle forme : disposition + petites infos du haut
        var lb: [String: String] = [:]
        if let o = call.getObject("lb") { for (k, v) in o { if let t = v as? String { lb[k] = t } } }
        screens["lb"] = lb
        push()
        call.resolve(["ok": true])
    }

    /// Chiffres de la sortie en cours, envoyés à la montre quand elle est à portée et son appli ouverte.
    @objc func live(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(["sent": false]); return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { call.resolve(["sent": false]); return }
        var lv: [String: String] = [:]
        if let o = call.getObject("lv") { for (k, v) in o { if let t = v as? String { lv[k] = t } } }
        let msg: [String: Any] = ["lv": lv, "st": call.getString("st") ?? "idle", "sp": call.getString("sp") ?? ""]
        s.sendMessage(msg, replyHandler: nil, errorHandler: nil)
        call.resolve(["sent": true])
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
    /// Sortie terminée sur la montre : on la garde jusqu'à ce que la page vienne la chercher (takeRides).
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let r = userInfo["ride"] as? String else { return }
        let d = UserDefaults.standard
        var a = d.stringArray(forKey: "lf.watch.rides") ?? []
        a.append(r)
        if a.count > 30 { a.removeFirst(a.count - 30) }
        d.set(a, forKey: "lf.watch.rides")
        notifyListeners("ride", data: [:])
    }

    @objc func takeRides(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        let a = d.stringArray(forKey: "lf.watch.rides") ?? []
        d.removeObject(forKey: "lf.watch.rides")
        call.resolve(["rides": a])
    }

    public func sessionDidBecomeInactive(_ session: WCSession) { }
    public func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
    public func sessionWatchStateDidChange(_ session: WCSession) { push() }
}
