import Foundation
import CoreLocation

/// Lite Foil : enregistreur GPS natif d'une sortie (« Suivre avec mon téléphone »).
/// Les points sont écrits dans Application Support/lftrack/points.jsonl, la page les relit.
/// Écran verrouillé : l'enregistrement continue (mode arrière-plan « location »).
/// Appli fermée (balayée) : iOS coupe le GPS, mais la surveillance des « déplacements importants »
/// relance l'appli en arrière-plan (environ tous les 500 m) et l'enregistrement reprend tout seul
/// (AppDelegate appelle resumeIfNeeded). Il faut l'autorisation de localisation « Toujours ».
final class LfTrackRecorder: NSObject, CLLocationManagerDelegate {
    static let shared = LfTrackRecorder()

    private let lm = CLLocationManager()
    private var count = 0
    private let io = DispatchQueue(label: "fr.litefoil.lftrack")

    var onPoint: (([String: Any]) -> Void)?
    var onAuthChange: ((CLAuthorizationStatus) -> Void)?

    private override init() {
        super.init()
        lm.delegate = self
        lm.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        lm.distanceFilter = kCLDistanceFilterNone
        lm.activityType = .otherNavigation
        lm.pausesLocationUpdatesAutomatically = false
    }

    // MARK: fichiers

    private var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("lftrack", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private var metaURL: URL { dir.appendingPathComponent("meta.json") }
    private var pointsURL: URL { dir.appendingPathComponent("points.jsonl") }

    func readMeta() -> [String: Any]? {
        return io.sync {
            guard let data = try? Data(contentsOf: metaURL),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            return obj
        }
    }

    private func writeMeta(_ m: [String: Any]) {
        io.sync {
            if let data = try? JSONSerialization.data(withJSONObject: m) {
                try? data.write(to: metaURL, options: .atomic)
            }
        }
    }

    var isRunning: Bool { (readMeta()?["running"] as? Bool) ?? false }

    func pointCount() -> Int {
        return io.sync {
            guard let data = try? Data(contentsOf: pointsURL), let s = String(data: data, encoding: .utf8) else { return 0 }
            return s.split(separator: "\n").count
        }
    }

    func points(from: Int) -> [[String: Any]] {
        return io.sync {
            guard let data = try? Data(contentsOf: pointsURL), let s = String(data: data, encoding: .utf8) else { return [] }
            var out: [[String: Any]] = []
            for (i, line) in s.split(separator: "\n").enumerated() where i >= from {
                if let d = line.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    out.append(o)
                }
            }
            return out
        }
    }

    private func append(_ p: [String: Any]) {
        io.sync {
            guard var data = try? JSONSerialization.data(withJSONObject: p) else { return }
            data.append(0x0A)
            if let h = try? FileHandle(forWritingTo: pointsURL) {
                h.seekToEndOfFile()
                h.write(data)
                h.closeFile()
            } else {
                try? data.write(to: pointsURL, options: .atomic)
            }
        }
    }

    func clear() {
        io.sync {
            try? FileManager.default.removeItem(at: pointsURL)
            try? FileManager.default.removeItem(at: metaURL)
        }
    }

    // MARK: autorisations

    var authStatus: CLAuthorizationStatus {
        if #available(iOS 14.0, *) { return lm.authorizationStatus }
        return CLLocationManager.authorizationStatus()
    }

    func requestWhenInUse() { lm.requestWhenInUseAuthorization() }
    func requestAlways() { lm.requestAlwaysAuthorization() }

    // MARK: enregistrement

    func begin(meta: String) {
        io.sync { try? FileManager.default.removeItem(at: pointsURL) }
        writeMeta(["running": true, "meta": meta])
        count = 0
        startUpdates()
    }

    func stop() {
        var m = readMeta() ?? [:]
        m["running"] = false
        writeMeta(m)
        lm.stopUpdatingLocation()
        lm.stopMonitoringSignificantLocationChanges()
        lm.allowsBackgroundLocationUpdates = false
    }

    /// Appelé au lancement de l'appli (y compris relance en arrière-plan par iOS).
    func resumeIfNeeded() {
        if isRunning { startUpdates() }
    }

    private func startUpdates() {
        count = pointCount()
        let st = authStatus
        guard st == .authorizedAlways || st == .authorizedWhenInUse else { return }
        lm.allowsBackgroundLocationUpdates = true
        lm.showsBackgroundLocationIndicator = true
        lm.startUpdatingLocation()
        // relance de l'appli après fermeture (fonctionne seulement avec l'autorisation « Toujours »)
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            lm.startMonitoringSignificantLocationChanges()
        }
    }

    // MARK: CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard isRunning else { return }
        for loc in locations where loc.horizontalAccuracy >= 0 {
            let p: [String: Any] = [
                "i": count,
                "lat": loc.coordinate.latitude,
                "lon": loc.coordinate.longitude,
                "acc": loc.horizontalAccuracy,
                "alt": loc.verticalAccuracy >= 0 ? loc.altitude : NSNull(),
                "spd": loc.speed >= 0 ? loc.speed : NSNull(),
                "brg": loc.course >= 0 ? loc.course : NSNull(),
                "t": (loc.timestamp.timeIntervalSince1970 * 1000).rounded()
            ]
            append(p)
            count += 1
            onPoint?(p)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private func authChanged() {
        let st = authStatus
        if isRunning && (st == .authorizedAlways || st == .authorizedWhenInUse) { startUpdates() }
        onAuthChange?(st)
    }

    @available(iOS 14.0, *)
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { authChanged() }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if #available(iOS 14.0, *) { return } // déjà traité ci-dessus
        authChanged()
    }
}
