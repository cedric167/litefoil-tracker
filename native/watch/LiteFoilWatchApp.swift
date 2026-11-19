import SwiftUI
import WatchKit
import WatchConnectivity
import CoreLocation

/// Lite Foil sur Apple Watch. Version 2 du 19/11/2026.
/// Départ : le sport et le bouton GO. Pendant la sortie : les écrans composés sur l'iPhone (« Ma montre »), puis une
/// page de commandes (verrouiller, pause, fin). À la fin : confirmation, puis résumé. Le petit SOS est sur tous les écrans.
/// La sortie est mesurée par le GPS de la montre. L'iPhone fournit les réglages, et quand il est à portée :
/// batterie eFoil, puissance, vent, température.
/// SOS : l'iPhone prépare une « sortie SOS en attente » (identifiant + clé secrète + proches à prévenir) ; un appui long
/// l'active sur le serveur Lite Foil, puis la position de la montre est envoyée toutes les 10 secondes.

struct WatchScreen {
    var top: [String]
    var m: [String]
}

final class SosModel: NSObject, ObservableObject, WCSessionDelegate, CLLocationManagerDelegate {
    enum Phase { case setup, ready, sending, active, failed }
    enum Screen { case home, sports, run, confirm, summary, sos }

    static let sports = ["eFoil", "Wingfoil", "Pumpfoil", "Surf foil", "Windfoil", "Downwind", "Kitesurf", "Windsurf", "Wakeboard", "Surf", "Paddle", "Voile", "Course", "Vélo", "Marche", "Ski"]
    static let foilOn = 12.0, foilOff = 9.0   // km/h : un « run » commence au-dessus de 12, finit sous 9

    // SOS
    @Published var phase: Phase = .setup
    @Published var name: String = ""
    @Published var contacts: Int = 0
    @Published var hasFix = false
    @Published var lastSent: Date?

    // navigation
    @Published var screen: Screen = .home
    @Published var page = 0
    private var backScreen: Screen = .home

    // réglages
    @Published var screens: [WatchScreen] = [WatchScreen(top: ["run", "clock"], m: ["dur", "dist", "avg", "max"]),
                                             WatchScreen(top: ["run", "clock"], m: ["rdist", "rdur", "ravg", "rmax"]),
                                             WatchScreen(top: ["", ""], m: ["spd"])]
    @Published var sport: String = "eFoil"
    private var labels: [String: String] = [:]
    private var live: [String: String] = [:]
    private var liveAt = Date.distantPast

    // sortie mesurée par la montre
    @Published var running = false
    @Published var paused = false
    @Published var locked = false
    @Published var now = Date()
    private(set) var runS = 0.0, moveS = 0.0, distM = 0.0, maxKmh = 0.0, curKmh = 0.0
    private(set) var startDate = Date()
    private var anchor: CLLocation?
    private var prevFix: CLLocation?
    private var lastTick = Date()
    private var lastTouch = Date()
    // trace de la sortie : [latitude, longitude, vitesse km/h, seconde, altitude], un point toutes les 2 secondes
    private var track: [[Double]] = []
    private var lastTrackS = -10.0
    // météo demandée par la montre elle-même (vent, température)
    private var wx: [String: String] = [:]
    private var wxAt = Date.distantPast
    private var wxBusy = false
    static let autoLockS = 8.0   // secondes sans toucher l'écran avant le verrouillage automatique pendant la sortie
    // runs sur le foil
    private(set) var onFoil = false
    private var foilUp = 0, foilDown = 0
    private(set) var runCount = 0
    private(set) var foilS = 0.0, foilDistM = 0.0, longRunS = 0.0, longRunDistM = 0.0
    private var runStartS = 0.0, runStartDist = 0.0, runMaxKmh = 0.0

    private var clock: Timer?
    private let store = UserDefaults.standard
    private let loc = CLLocationManager()
    private var last: CLLocation?
    private var lastPost = Date.distantPast
    private var timer: Timer?

    var emergency: String { let e = store.string(forKey: "em") ?? "112"; return e.isEmpty ? "112" : e }
    private var api: String { store.string(forKey: "api") ?? "" }
    private var key: String { store.string(forKey: "k") ?? "" }

    override init() {
        super.init()
        loc.delegate = self
        loc.desiredAccuracy = kCLLocationAccuracyBest
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        refresh()
        sport = store.string(forKey: "sport") ?? "eFoil"
        if let s = store.string(forKey: "scr2"), let a = SosModel.parseScreens2(s) { screens = a }
        else if let s = store.string(forKey: "scr"), let a = SosModel.parseScreens(s) { screens = a }
        if let lb = store.dictionary(forKey: "lb") as? [String: String], !lb.isEmpty { labels = lb }
        if store.bool(forKey: "sosOn") { phase = .active; screen = .sos; startTracking() }
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.second() }
    }

    // MARK: réglages reçus de l'iPhone
    private static func parseScreens(_ s: String) -> [WatchScreen]? {
        guard let d = s.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d), let a = o as? [[String]] else { return nil }
        var ok: [WatchScreen] = []
        for scr in a where !scr.isEmpty && ok.count < 6 { ok.append(WatchScreen(top: ["", ""], m: Array(scr.prefix(4)))) }
        return ok.isEmpty ? nil : ok
    }
    private static func parseScreens2(_ s: String) -> [WatchScreen]? {
        guard let d = s.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d), let a = o as? [[String: Any]] else { return nil }
        var ok: [WatchScreen] = []
        for scr in a where ok.count < 6 {
            guard let m = scr["m"] as? [String], !m.isEmpty else { continue }
            let t = scr["t"] as? [String] ?? []
            ok.append(WatchScreen(top: [t.count > 0 ? t[0] : "", t.count > 1 ? t[1] : ""], m: Array(m.prefix(4))))
        }
        return ok.isEmpty ? nil : ok
    }
    private func applyScreens(_ c: [String: Any]) {
        let raw2 = c["scr2"] as? String
        let raw = c["scr"] as? String
        var arr: [WatchScreen]? = nil
        if let r = raw2 { arr = SosModel.parseScreens2(r) }
        if arr == nil, let r = raw { arr = SosModel.parseScreens(r) }
        let lb = c["lb"] as? [String: String]
        if arr == nil && lb == nil { return }
        DispatchQueue.main.async {
            if let a = arr, !self.running {
                self.screens = a
                if let r = raw2 { self.store.set(r, forKey: "scr2") }
                if let r = raw { self.store.set(r, forKey: "scr") }
            }
            if let l = lb, !l.isEmpty { self.labels = l; self.store.set(l, forKey: "lb") }
        }
    }
    private func applyLive(_ msg: [String: Any]) {
        guard let lv = msg["lv"] as? [String: String] else { return }
        DispatchQueue.main.async { self.live = lv; self.liveAt = Date() }
    }
    private func refresh() {
        name = store.string(forKey: "ps") ?? ""
        contacts = store.integer(forKey: "n")
        if phase == .setup || phase == .ready { phase = (api.isEmpty || key.isEmpty) ? .setup : .ready }
    }
    private func apply(_ c: [String: Any]) {
        applyScreens(c)
        guard let a = c["api"] as? String, let k = c["k"] as? String, !a.isEmpty, !k.isEmpty else { return }
        DispatchQueue.main.async {
            // pendant un SOS en cours on garde la sortie déjà déclenchée
            if self.phase == .active || self.phase == .sending { return }
            self.store.set(a, forKey: "api"); self.store.set(k, forKey: "k")
            self.store.set(c["ps"] as? String ?? "", forKey: "ps")
            self.store.set(c["em"] as? String ?? "112", forKey: "em")
            self.store.set(c["n"] as? Int ?? 0, forKey: "n")
            self.refresh()
        }
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if !session.receivedApplicationContext.isEmpty { apply(session.receivedApplicationContext) }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { applyLive(message) }

    // MARK: sortie
    /// l'utilisateur vient de toucher l'écran ou de changer de page : on repousse le verrouillage automatique
    func touched() { lastTouch = Date() }
    func unlock() { locked = false; lastTouch = Date(); WKInterfaceDevice.current().play(.success) }

    func chooseSport(_ s: String) { sport = s; store.set(s, forKey: "sport"); screen = .home }

    func startRide() {
        if loc.authorizationStatus == .notDetermined { loc.requestWhenInUseAuthorization() }
        runS = 0; moveS = 0; distM = 0; maxKmh = 0; curKmh = 0; anchor = nil; prevFix = nil
        onFoil = false; foilUp = 0; foilDown = 0; runCount = 0; foilS = 0; foilDistM = 0; longRunS = 0; longRunDistM = 0; runMaxKmh = 0
        startDate = Date(); lastTick = Date(); lastTouch = Date()
        track = []; lastTrackS = -10
        running = true; paused = false; locked = false
        page = 0; screen = .run
        startLocation()
        WKInterfaceDevice.current().play(.start)
    }
    func pauseRide(_ on: Bool) {
        if on { endFoilRun() }
        paused = on; anchor = nil; prevFix = nil; curKmh = 0; lastTick = Date(); lastTouch = Date()
        WKInterfaceDevice.current().play(.click)
    }
    func stopRide(keep: Bool) {
        endFoilRun()
        if keep { sendRide() }
        running = false; paused = false; locked = false; curKmh = 0
        if phase != .active && phase != .sending { stopLocation() }
        WKInterfaceDevice.current().play(.stop)
        screen = keep ? .summary : .home
    }
    private func second() {
        let t = Date()
        if running {
            if !paused {
                let d = min(5.0, t.timeIntervalSince(lastTick))
                runS += d
                if curKmh >= 3 { moveS += d }
                if onFoil { foilS += d }
            }
            lastTick = t
            // verrouillage automatique : sortie en cours, écran d'infos affiché, personne n'a touché l'écran depuis 8 secondes
            if !paused && !locked && screen == .run && page < screens.count && t.timeIntervalSince(lastTouch) >= SosModel.autoLockS {
                locked = true
                WKInterfaceDevice.current().play(.click)
            }
        }
        now = t
    }
    private func rideFix(_ l: CLLocation) {
        guard running, !paused else { return }
        if l.speed > 0.05 { curKmh = l.speed * 3.6 }
        else if let p = prevFix, l.timestamp > p.timestamp {
            let k = l.distance(from: p) / l.timestamp.timeIntervalSince(p.timestamp) * 3.6
            if k < 150 { curKmh = k }
        } else { curKmh = 0 }
        prevFix = l
        let acc = l.horizontalAccuracy
        guard acc >= 0, acc <= 30 else { return }
        if curKmh > maxKmh && curKmh < 150 { maxKmh = curKmh }
        if runS - lastTrackS >= 2, track.count < 5000 {
            track.append([l.coordinate.latitude, l.coordinate.longitude, curKmh, runS, l.verticalAccuracy >= 0 ? l.altitude : 0])
            lastTrackS = runS
        }
        if Date().timeIntervalSince(wxAt) > 900 { fetchWeather(l) }
        if let a = anchor {
            let d = l.distance(from: a)
            if d >= max(4.0, min(12.0, acc * 0.6)) { distM += d; if onFoil { foilDistM += d }; anchor = l }
        } else { anchor = l }
        // un run commence après 3 mesures au-dessus de 12 km/h et finit après 3 mesures sous 9 km/h
        if !onFoil {
            foilUp = curKmh >= SosModel.foilOn ? foilUp + 1 : 0
            if foilUp >= 3 { onFoil = true; foilUp = 0; foilDown = 0; runCount += 1; runStartS = runS; runStartDist = distM; runMaxKmh = curKmh; WKInterfaceDevice.current().play(.click) }
        } else {
            if curKmh > runMaxKmh && curKmh < 150 { runMaxKmh = curKmh }
            foilDown = curKmh < SosModel.foilOff ? foilDown + 1 : 0
            if foilDown >= 3 { endFoilRun() }
        }
    }
    /// La sortie terminée part vers l'iPhone, qui la range dans les activités (remise garantie, même si l'iPhone est loin sur le moment).
    private func sendRide() {
        guard track.count >= 2, WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let pts: [[Double]] = track.map { p in
            [(p[0] * 100000).rounded() / 100000, (p[1] * 100000).rounded() / 100000, (p[2] * 10).rounded() / 10, p[3].rounded(), p[4].rounded()]
        }
        let ride: [String: Any] = [
            "id": "watch-\(Int(startDate.timeIntervalSince1970 * 1000))", "sport": sport,
            "start": Int(startDate.timeIntervalSince1970 * 1000), "dur": Int(runS), "dist": Int(distM),
            "max": (maxKmh * 10).rounded() / 10, "runs": runCount, "foilS": Int(foilS), "foilM": Int(foilDistM), "pts": pts
        ]
        guard let d = try? JSONSerialization.data(withJSONObject: ride), let s = String(data: d, encoding: .utf8) else { return }
        WCSession.default.transferUserInfo(["ride": s])
    }
    /// Vent et température à l'endroit de la sortie (Open-Meteo, sans compte), au plus une demande par quart d'heure.
    private func fetchWeather(_ l: CLLocation) {
        if wxBusy { return }
        let u = String(format: "https://api.open-meteo.com/v1/forecast?latitude=%.3f&longitude=%.3f&current=temperature_2m,wind_speed_10m&wind_speed_unit=kn", l.coordinate.latitude, l.coordinate.longitude)
        guard let url = URL(string: u) else { return }
        wxBusy = true; wxAt = Date()
        URLSession.shared.dataTask(with: url) { data, _, _ in
            var out: [String: String] = [:]
            if let d = data, let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let c = o["current"] as? [String: Any] {
                if let t = c["temperature_2m"] as? Double { out["temp"] = String(Int(t.rounded())) + "|°C" }
                if let w = c["wind_speed_10m"] as? Double { out["wind"] = String(Int(w.rounded())) + "|nds" }
            }
            DispatchQueue.main.async { self.wxBusy = false; if !out.isEmpty { self.wx = out } else { self.wxAt = Date().addingTimeInterval(-780) } }
        }.resume()
    }
    private func endFoilRun() {
        guard onFoil else { return }
        onFoil = false; foilDown = 0; foilUp = 0
        longRunS = max(longRunS, runS - runStartS)
        longRunDistM = max(longRunDistM, distM - runStartDist)
    }

    // MARK: valeurs affichées
    static func clockText(_ s: Double) -> String {
        let t = Int(max(0, s)), h = t / 3600, m = (t % 3600) / 60, sec = t % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
    static func num(_ v: Double, _ dec: Int) -> String {
        return String(format: "%.\(dec)f", v).replacingOccurrences(of: ".", with: ",")
    }
    static func meters(_ m: Double) -> (String, String) {
        return m >= 1000 ? (num(m / 1000, 2), "km") : (num(m, 0), "m")
    }
    func label(_ k: String) -> String {
        if let l = labels[k] { return l }
        switch k {
        case "dur": return "Durée"
        case "dist": return "Distance"
        case "spd": return "Vitesse"
        case "max": return "Vitesse max"
        case "avg": return "Vitesse moy."
        case "clock": return "Heure"
        case "ravg": return "Moy. du run"
        case "rmax": return "Max du run"
        case "favg": return "Moy. sur le foil"
        case "rdist": return "Distance du run"
        case "fdist": return "Distance sur le foil"
        case "act": return "Temps actif"
        case "rdur": return "Durée du run"
        case "fdur": return "Temps sur le foil"
        case "run": return "Run n°"
        case "runs": return "Runs"
        case "lrdur", "lrdist": return "Plus long run"
        case "hr": return "Cardio"
        case "wbat": return "Batterie montre"
        default: return k
        }
    }
    /// libellé court, lisible d'un coup d'œil en pleine session
    func shortLabel(_ k: String) -> String {
        switch k {
        case "spd": return "VIT"
        case "max": return "VMAX"
        case "avg": return "VMOY"
        case "ravg": return "MOY RUN"
        case "rmax": return "MAX RUN"
        case "favg": return "MOY FOIL"
        case "dist": return "DIST"
        case "rdist": return "DIST RUN"
        case "fdist": return "DIST FOIL"
        case "dur": return "DURÉE"
        case "act": return "ACTIF"
        case "rdur": return "RUN"
        case "fdur": return "FOIL"
        case "clock": return "HEURE"
        case "run": return "RUN N°"
        case "runs": return "RUNS"
        case "lrdur", "lrdist": return "LONG RUN"
        case "hr": return "CARDIO"
        case "hravg": return "FC MOY"
        case "hrmax": return "FC MAX"
        case "bat": return "EFOIL"
        case "pow": return "PUISS"
        case "wind": return "VENT"
        case "temp": return "TEMP"
        case "wbat": return "MONTRE"
        case "steps": return "PAS"
        default: return label(k).uppercased()
        }
    }
    /// valeur et unité d'une info ; un tiret quand la montre ne peut pas la connaître
    func value(_ k: String) -> (String, String) {
        let curRunS = onFoil ? runS - runStartS : 0, curRunM = onFoil ? distM - runStartDist : 0
        switch k {
        case "clock": let f = DateFormatter(); f.dateFormat = "HH:mm"; return (f.string(from: now), "")
        case "dur": return (SosModel.clockText(runS), "")
        case "act": return (SosModel.clockText(moveS), "")
        case "fdur": return (SosModel.clockText(foilS), "")
        case "rdur": return (SosModel.clockText(curRunS), "")
        case "lrdur": return (SosModel.clockText(max(longRunS, curRunS)), "")
        case "dist": return (SosModel.num(distM / 1000, 2), "km")
        case "fdist": return (SosModel.num(foilDistM / 1000, 2), "km")
        case "rdist": return SosModel.meters(curRunM)
        case "lrdist": return SosModel.meters(max(longRunDistM, curRunM))
        case "spd": return (SosModel.num(curKmh, 1), "km/h")
        case "max": return (SosModel.num(maxKmh, 1), "km/h")
        case "avg": return (SosModel.num(runS > 5 ? distM / runS * 3.6 : 0, 1), "km/h")
        case "favg": return (SosModel.num(foilS > 3 ? foilDistM / foilS * 3.6 : 0, 1), "km/h")
        case "rmax": return (SosModel.num(onFoil ? runMaxKmh : 0, 1), "km/h")
        case "ravg": return (SosModel.num(curRunS > 2 ? curRunM / curRunS * 3.6 : 0, 1), "km/h")
        case "run", "runs": return (String(runCount), "")
        case "wbat":
            WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
            let b = WKInterfaceDevice.current().batteryLevel
            return (b >= 0 ? String(Int((b * 100).rounded())) : "—", "%")
        default:
            // vent et température : météo demandée par la montre ; batterie eFoil et puissance : données de l'iPhone (appli ouverte)
            if let w = wx[k], !w.isEmpty { let p = w.components(separatedBy: "|"); return (p[0], p.count > 1 ? p[1] : "") }
            guard now.timeIntervalSince(liveAt) < 120, let raw = live[k], !raw.isEmpty else { return ("—", "") }
            let p = raw.components(separatedBy: "|")
            return (p[0], p.count > 1 ? p[1] : "")
        }
    }
    /// petite info du haut : « Run 3 », « 10:09 »…
    func topText(_ k: String) -> String {
        if k.isEmpty { return "" }
        let v = value(k)
        switch k {
        case "run": return "Run " + v.0
        case "runs": return "Runs " + v.0
        case "hr", "hravg", "hrmax": return "♥ " + v.0
        case "clock": return v.0
        case "wbat": return "Montre " + v.0 + " %"
        case "bat": return "eFoil " + v.0 + (v.0 == "—" ? "" : " %")
        case "temp": return v.0 + (v.0 == "—" ? "" : " °C")
        case "wind": return "Vent " + v.0
        default: return v.0 + (v.1.isEmpty ? "" : " " + v.1)
        }
    }
    var elapsedText: String { (paused ? "Pause  " : "") + SosModel.clockText(runS) }
    var summaryTitle: String {
        let h = Calendar.current.component(.hour, from: startDate)
        if h < 6 || h >= 22 { return "Sortie de nuit" }
        if h < 12 { return "Sortie du matin" }
        if h < 14 { return "Sortie de midi" }
        if h < 18 { return "Sortie de l'après-midi" }
        return "Sortie du soir"
    }
    var summaryDate: String {
        let f = DateFormatter(); f.locale = Locale(identifier: "fr_FR"); f.dateFormat = "EEEE d MMMM"
        return f.string(from: startDate) + " · " + sport
    }

    // MARK: SOS
    func openSos() { if screen != .sos { backScreen = screen }; screen = .sos }
    func closeSos() { if phase == .failed { phase = .ready; refresh() }; screen = (backScreen == .run && !running) ? .home : backScreen }
    func fire() {
        guard !api.isEmpty, !key.isEmpty else { phase = .setup; return }
        phase = .sending
        WKInterfaceDevice.current().play(.notification)
        startTracking()
        post(status: "sos") { ok in
            self.phase = ok ? .active : .failed
            if ok { self.store.set(true, forKey: "sosOn"); WKInterfaceDevice.current().play(.success) }
            else { WKInterfaceDevice.current().play(.failure) }
        }
    }
    func cancel() {
        post(status: "ok") { _ in }
        store.set(false, forKey: "sosOn")
        timer?.invalidate(); timer = nil
        if !running { stopLocation() }
        phase = .ready
        refresh()
        screen = running ? .run : .home
    }
    func callEmergency() {
        if let u = URL(string: "tel:" + emergency) { WKApplication.shared().openSystemURL(u) }
    }

    private func startLocation() {
        if loc.authorizationStatus == .notDetermined { loc.requestWhenInUseAuthorization() }
        loc.allowsBackgroundLocationUpdates = true
        loc.startUpdatingLocation()
    }
    private func stopLocation() {
        loc.stopUpdatingLocation()
        loc.allowsBackgroundLocationUpdates = false
    }
    private func startTracking() {
        startLocation()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.tick() }
    }
    private func tick() {
        guard phase == .active, last != nil, Date().timeIntervalSince(lastPost) >= 9 else { return }
        post(status: nil) { _ in }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for l in locations where l.horizontalAccuracy >= 0 { rideFix(l) }
        guard let l = locations.last, l.horizontalAccuracy >= 0 else { return }
        let first = (last == nil)
        last = l
        DispatchQueue.main.async { self.hasFix = true }
        if first && phase == .active { post(status: nil) { _ in } }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private func post(status: String?, done: @escaping (Bool) -> Void) {
        guard let url = URL(string: api) else { done(false); return }
        var body: [String: Any] = ["k": key]
        if let s = status { body["status"] = s }
        if let l = last {
            body["pts"] = [["lat": l.coordinate.latitude, "lng": l.coordinate.longitude,
                            "t": Int(Date().timeIntervalSince1970 * 1000), "spd": max(0, l.speed) * 3.6]]
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        lastPost = Date()
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            let ok = ((resp as? HTTPURLResponse)?.statusCode ?? 0) == 200
            DispatchQueue.main.async { if ok { self.lastSent = Date() }; done(ok) }
        }.resume()
    }
}

// MARK: - couleurs et briques communes
extension Color {
    static let lfTop = Color(red: 0.06, green: 0.23, blue: 0.36)
    static let lfBottom = Color(red: 0.016, green: 0.08, blue: 0.11)
    static let lfAccent = Color(red: 0.37, green: 0.82, blue: 0.90)
    static let lfMute = Color(red: 0.56, green: 0.71, blue: 0.78)
    static let lfGo = Color(red: 0.18, green: 0.83, blue: 0.76)
    static let lfRed = Color(red: 0.91, green: 0.22, blue: 0.31)
    static let lfYellow = Color(red: 1.0, green: 0.85, blue: 0.29)
    static let lfDark = Color(red: 0.16, green: 0.29, blue: 0.38)
}

struct LfBackground: View {
    var body: some View {
        LinearGradient(gradient: Gradient(colors: [Color.lfTop, Color.lfBottom]), startPoint: .top, endPoint: .bottom).ignoresSafeArea()
    }
}

/// bouton plein, arrondi
struct LfButton: View {
    let title: String
    let bg: Color
    let fg: Color
    var height: CGFloat = 38
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundColor(fg).lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity).frame(height: height).background(Capsule().fill(bg))
        }
        .buttonStyle(.plain)
    }
}

/// le petit SOS, présent sur tous les écrans
struct SosChip: View {
    @ObservedObject var m: SosModel

    var body: some View {
        Button(action: { if !m.locked { m.openSos() } }) {
            Text("SOS").font(.system(size: 12, weight: .heavy)).foregroundColor(.white)
                .frame(width: 54, height: 22).background(Capsule().fill(Color.lfRed))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("SOS")
    }
}

/// Une info : libellé, valeur, unité.
struct MetricCell: View {
    let label: String
    let value: String
    let unit: String
    let size: CGFloat
    var lsize: CGFloat = 16

    var body: some View {
        VStack(spacing: -6) {
            HStack(spacing: 4) {
                Text(label).font(.system(size: lsize, weight: .semibold)).foregroundColor(.lfMute)
                if !unit.isEmpty { Text(unit).font(.system(size: lsize, weight: .semibold)).foregroundColor(.lfAccent) }
            }
            .lineLimit(1).minimumScaleFactor(0.6)
            Text(value).font(.system(size: size, weight: .bold, design: .rounded)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.3)
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - écrans
struct HomeView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        VStack(spacing: 4) {
            Text("Lite Foil").font(.system(size: 11, weight: .semibold)).foregroundColor(.lfAccent)
            Spacer(minLength: 0)
            Text("Sport").font(.system(size: 10)).foregroundColor(.lfMute)
            Button(action: { m.screen = .sports }) {
                Text(m.sport + "  ›").font(.system(size: 20, weight: .bold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6)
            }
            .buttonStyle(.plain)
            LfButton(title: "GO", bg: .lfGo, fg: .black, height: 42, action: { m.startRide() }).padding(.horizontal, 22)
            Spacer(minLength: 0)
            SosChip(m: m)
        }
        .padding(.horizontal, 6)
    }
}

struct SportsView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        ScrollView {
            VStack(spacing: 5) {
                Text("Choisis ton sport").font(.system(size: 12, weight: .semibold)).foregroundColor(.lfAccent)
                ForEach(SosModel.sports, id: \.self) { s in
                    LfButton(title: s, bg: s == m.sport ? .lfAccent : .lfDark, fg: s == m.sport ? .black : .white, height: 36, action: { m.chooseSport(s) })
                }
                SosChip(m: m).padding(.top, 4)
            }
            .padding(.horizontal, 6)
        }
    }
}

/// Un écran d'infos (1 à 4), avec les deux petites infos du haut et le SOS en bas.
struct MetricScreen: View {
    @ObservedObject var m: SosModel
    let scr: WatchScreen

    var body: some View {
        VStack(spacing: 1) {
            HStack {
                Text("Lite Foil").font(.system(size: 14, weight: .bold)).foregroundColor(.lfAccent)
                Spacer()
            }
            .padding(.leading, 12).padding(.top, 6).frame(height: 36)
            HStack(spacing: 3) {
                Text(m.topText(scr.top[0])).font(.system(size: 18, weight: .semibold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity, alignment: .leading)
                Text(m.elapsedText).font(.system(size: 19, weight: .bold)).foregroundColor(m.paused ? .orange : .lfYellow).lineLimit(1).fixedSize()
                Text(m.topText(scr.top[1])).font(.system(size: 18, weight: .semibold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 4)
            if scr.m.count <= 1 {
                cell(scr.m.first ?? "dur", 176)
            } else if scr.m.count == 2 {
                cell(scr.m[0], 99)
                cell(scr.m[1], 99)
            } else if scr.m.count == 3 {
                cell(scr.m[0], 94)
                HStack(spacing: 6) { cell(scr.m[1], 65); cell(scr.m[2], 65) }
            } else {
                HStack(spacing: 6) { cell(scr.m[0], 54, 13); cell(scr.m[1], 54, 13) }
                HStack(spacing: 6) { cell(scr.m[2], 54, 13); cell(scr.m[3], 54, 13) }
            }
            if m.locked { Color.clear.frame(height: 22) } else { SosChip(m: m) }
        }
        .padding(.horizontal, 1)
        .ignoresSafeArea(.container, edges: .top)
    }

    private func cell(_ k: String, _ size: CGFloat, _ lsize: CGFloat = 16) -> MetricCell {
        let v = m.value(k)
        return MetricCell(label: m.shortLabel(k), value: v.0, unit: v.1, size: size, lsize: lsize)
    }
}

struct ControlsView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        VStack(spacing: 6) {
            Text(m.elapsedText).font(.system(size: 12, weight: .bold)).foregroundColor(m.paused ? .orange : .lfYellow)
            LfButton(title: "Verrouiller l'écran", bg: Color(red: 0.11, green: 0.37, blue: 0.56), fg: .white, action: { m.page = 0; m.locked = true; WKInterfaceDevice.current().play(.click) })
            HStack(spacing: 6) {
                LfButton(title: "Fin", bg: .lfRed, fg: .white, height: 42, action: { m.screen = .confirm })
                if m.paused { LfButton(title: "Reprendre", bg: .lfGo, fg: .black, height: 42, action: { m.pauseRide(false) }) }
                else { LfButton(title: "Pause", bg: .lfDark, fg: .white, height: 42, action: { m.pauseRide(true) }) }
            }
            // verrouillé : la place du SOS est laissée à la mention « Verrouillé » (plus de chevauchement)
            if m.locked { Color.clear.frame(height: 22) } else { SosChip(m: m) }
        }
        .padding(.horizontal, 6)
        .opacity(m.locked ? 0.45 : 1)
    }
}

/// Écran verrouillé (éclaboussures, combinaison) : les touches sont ignorées ; on déverrouille en maintenant 2 secondes.
struct LockOverlay: View {
    @ObservedObject var m: SosModel
    @State private var pressing = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.02)
            Text(pressing ? "Maintiens…" : "Verrouillé · maintiens 2 s").font(.system(size: 10, weight: .bold)).foregroundColor(.white).lineLimit(1)
                .padding(.horizontal, 10).frame(height: 20).background(Capsule().fill(Color.black.opacity(0.55))).padding(.bottom, 1)
        }
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 2, maximumDistance: 80, perform: { pressing = false; m.unlock() },
                            onPressingChanged: { p in pressing = p })
    }
}

struct RunView: View {
    @ObservedObject var m: SosModel
    @State private var crown = 0.0

    var body: some View {
        ZStack {
            TabView(selection: $m.page) {
                ForEach(0..<m.screens.count, id: \.self) { i in
                    MetricScreen(m: m, scr: m.screens[i]).tag(i)
                }
                ControlsView(m: m).tag(m.screens.count)
            }
            .tabViewStyle(PageTabViewStyle())
            if m.locked { LockOverlay(m: m) }
        }
        // la couronne fait défiler les écrans, même écran verrouillé (doigts mouillés, gants)
        .focusable(true)
        .digitalCrownRotation($crown, from: 0, through: Double(m.screens.count), by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { v in
            let p = Int(v.rounded())
            if p != m.page && p >= 0 && p <= m.screens.count { m.page = p }
        }
        .onChange(of: m.page) { p in
            m.touched()
            if Int(crown.rounded()) != p { crown = Double(p) }
        }
        .simultaneousGesture(TapGesture().onEnded { m.touched() })
        .onAppear { crown = Double(m.page) }
    }
}

struct ConfirmView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Terminer la sortie ?").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                LfButton(title: "Terminer", bg: .lfGo, fg: .black, action: { m.stopRide(keep: true) })
                LfButton(title: "Abandonner", bg: .lfRed, fg: .white, height: 34, action: { m.stopRide(keep: false) })
                LfButton(title: "Annuler", bg: .lfDark, fg: .white, height: 34, action: { m.screen = .run })
            }
            .padding(.horizontal, 6)
        }
    }
}

struct SummaryLine: View {
    let a: String
    let b: String

    var body: some View {
        HStack {
            Text(a).font(.system(size: 12)).foregroundColor(.lfMute)
            Spacer()
            Text(b).font(.system(size: 13, weight: .bold)).foregroundColor(.white)
        }
    }
}

struct SummaryView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                Text(m.summaryTitle).font(.system(size: 17, weight: .bold)).foregroundColor(.lfAccent)
                Text(m.summaryDate).font(.system(size: 10)).foregroundColor(.white)
                Text("Distance et temps").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                SummaryLine(a: "Durée", b: SosModel.clockText(m.runS))
                SummaryLine(a: "Temps actif", b: SosModel.clockText(m.moveS))
                SummaryLine(a: "Distance", b: SosModel.num(m.distM / 1000, 2) + " km")
                Text("Vitesse").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                SummaryLine(a: "Max", b: SosModel.num(m.maxKmh, 1) + " km/h")
                SummaryLine(a: "Moyenne", b: SosModel.num(m.runS > 5 ? m.distM / m.runS * 3.6 : 0, 1) + " km/h")
                Text("Sur le foil").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                SummaryLine(a: "Runs", b: String(m.runCount))
                SummaryLine(a: "Temps sur le foil", b: SosModel.clockText(m.foilS))
                SummaryLine(a: "Distance sur le foil", b: SosModel.num(m.foilDistM / 1000, 2) + " km")
                SummaryLine(a: "Plus long run", b: SosModel.clockText(m.longRunS))
                LfButton(title: "Fermer", bg: .lfGo, fg: .black, action: { m.screen = .home }).padding(.top, 8)
                HStack { Spacer(); SosChip(m: m); Spacer() }.padding(.top, 4)
            }
            .padding(.horizontal, 6)
        }
    }
}

struct SosView: View {
    @ObservedObject var m: SosModel
    @State private var pressing = false

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                switch m.phase {
                case .setup:
                    Image(systemName: "iphone").font(.title2).foregroundColor(.teal)
                    Text("Ouvre Lite Foil sur ton iPhone").font(.headline).multilineTextAlignment(.center)
                    Text("Connecte-toi à ton compte : le bouton SOS s'active ici tout seul.")
                        .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                    Button(action: { m.callEmergency() }) { Label("Appeler le \(m.emergency)", systemImage: "phone.fill") }.tint(.red)
                    Button("Retour", action: { m.closeSos() })
                case .ready:
                    sosButton
                    Text(pressing ? "Maintiens…" : "Maintiens 2 secondes").font(.footnote).foregroundColor(.secondary)
                    Text(m.contacts > 0 ? "\(m.contacts) proche(s) prévenu(s) avec ta position" : "Ajoute des proches dans l'appli iPhone")
                        .font(.caption2).foregroundColor(m.contacts > 0 ? .secondary : .orange).multilineTextAlignment(.center)
                    Button("Retour", action: { m.closeSos() })
                case .sending:
                    ProgressView()
                    Text("Envoi du SOS…").font(.headline)
                case .active:
                    Text("🆘 SOS envoyé").font(.headline).foregroundColor(.red)
                    Text(m.hasFix ? "Tes proches voient ta position en direct." : "Proches prévenus. Recherche de ta position…")
                        .font(.footnote).multilineTextAlignment(.center)
                    Button(action: { m.callEmergency() }) { Label("Appeler le \(m.emergency)", systemImage: "phone.fill") }
                        .tint(.red)
                    Button("Fausse alerte", action: { m.cancel() })
                case .failed:
                    Text("SOS non envoyé").font(.headline).foregroundColor(.orange)
                    Text("Pas de réseau sur la montre.").font(.footnote).multilineTextAlignment(.center)
                    Button("Réessayer", action: { m.fire() }).tint(.red)
                    Button(action: { m.callEmergency() }) { Label("Appeler le \(m.emergency)", systemImage: "phone.fill") }
                    Button("Retour", action: { m.closeSos() })
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private var sosButton: some View {
        ZStack {
            Circle().fill(Color.red.opacity(pressing ? 1 : 0.85))
            Circle().trim(from: 0, to: pressing ? 1 : 0)
                .stroke(Color.white, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(pressing ? .linear(duration: 2) : .default, value: pressing)
                .padding(4)
            Text("SOS").font(.system(size: 34, weight: .heavy, design: .rounded)).foregroundColor(.white)
        }
        .frame(width: 108, height: 108)
        .onLongPressGesture(minimumDuration: 2, maximumDistance: 60, perform: { pressing = false; m.fire() },
                            onPressingChanged: { p in pressing = p; if p { WKInterfaceDevice.current().play(.start) } })
        .accessibilityLabel("SOS, maintenir 2 secondes")
    }
}

struct ContentView: View {
    @StateObject private var m = SosModel()

    var body: some View {
        ZStack {
            if m.screen == .sos { Color.black.ignoresSafeArea() } else { LfBackground() }
            switch m.screen {
            case .home: HomeView(m: m)
            case .sports: SportsView(m: m)
            case .run: RunView(m: m)
            case .confirm: ConfirmView(m: m)
            case .summary: SummaryView(m: m)
            case .sos: SosView(m: m)
            }
        }
    }
}

@main
struct LiteFoilWatchApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
