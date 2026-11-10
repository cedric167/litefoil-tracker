import Foundation
import UIKit
import Capacitor
import CoreLocation

/// Lite Foil : module « LfTrack » appelé par la page (mêmes fonctions que sur Android).
@objc(LfTrackPlugin)
public class LfTrackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LfTrackPlugin"
    public let jsName = "LfTrack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private var pendingStart: CAPPluginCall?
    private var rec: LfTrackRecorder { LfTrackRecorder.shared }

    override public func load() {
        rec.onPoint = { [weak self] p in
            DispatchQueue.main.async { self?.notifyListeners("location", data: p) }
        }
        rec.onAuthChange = { [weak self] st in
            DispatchQueue.main.async { self?.authChanged(st) }
        }
    }

    private func authChanged(_ st: CLAuthorizationStatus) {
        guard let call = pendingStart else { return }
        switch st {
        case .authorizedAlways:
            pendingStart = nil
            begin(call)
        case .authorizedWhenInUse:
            pendingStart = nil
            begin(call)
            // proposer « Toujours » : nécessaire pour reprendre si l'appli est fermée
            rec.requestAlways()
        case .denied, .restricted:
            pendingStart = nil
            call.reject("Localisation refusée", "NOT_AUTHORIZED")
        default:
            break
        }
    }

    private func begin(_ call: CAPPluginCall) {
        rec.begin(meta: call.getString("meta") ?? "")
        call.resolve(["ok": true])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch self.rec.authStatus {
            case .notDetermined:
                self.pendingStart = call
                self.rec.requestWhenInUse()
            case .denied, .restricted:
                call.reject("Localisation refusée", "NOT_AUTHORIZED")
            case .authorizedWhenInUse:
                self.begin(call)
                self.rec.requestAlways()
            default:
                self.begin(call)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.rec.stop()
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let m = rec.readMeta()
        call.resolve([
            "running": (m?["running"] as? Bool) ?? false,
            "meta": (m?["meta"] as? String) ?? "",
            "count": m != nil ? rec.pointCount() : 0,
            "platform": "ios",
            "always": rec.authStatus == .authorizedAlways
        ])
    }

    @objc func getPoints(_ call: CAPPluginCall) {
        let from = call.getInt("from") ?? 0
        call.resolve(["points": rec.points(from: from), "from": from])
    }

    @objc func clear(_ call: CAPPluginCall) {
        if !rec.isRunning { rec.clear() }
        call.resolve()
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}
