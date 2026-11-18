import SwiftUI
import WatchKit
import WatchConnectivity
import CoreLocation

/// Lite Foil sur Apple Watch : un bouton SOS, puis les écrans d'infos de la sortie composés sur l'iPhone.
/// L'iPhone prépare une « sortie SOS en attente » (identifiant + clé secrète + proches à prévenir) et la
/// transmet à la montre. Un appui long sur SOS l'active sur le serveur Lite Foil : les proches reçoivent
/// la notification SOS, puis la position de la montre est envoyée toutes les 10 secondes.
/// La montre parle directement au serveur (par l'iPhone, le Wi-Fi ou le réseau cellulaire) :
/// l'appli iPhone n'a pas besoin d'être ouverte.

final class SosModel: NSObject, ObservableObject, WCSessionDelegate, CLLocationManagerDelegate {
    enum Phase { case setup, ready, sending, active, failed }

    @Published var phase: Phase = .setup
    @Published var name: String = ""
    @Published var contacts: Int = 0
    @Published var hasFix = false
    @Published var lastSent: Date?
    // écrans d'infos : composés sur l'iPhone, chiffres envoyés par l'iPhone pendant la sortie
    @Published var screens: [[String]] = [["dur", "dist", "spd", "max"], ["spd"]]
    @Published var live: [String: String] = [:]
    @Published var state: String = "idle"
    @Published var sport: String = ""
    @Published var now = Date()
    private var labels: [String: String] = ["dur": "Durée", "dist": "Distance", "spd": "Vitesse", "max": "Vitesse max", "avg": "Vitesse moy.",
                                            "clock": "Heure", "steps": "Pas", "bat": "Batterie", "pow": "Puissance", "wind": "Vent", "temp": "Température"]
    private var liveAt = Date.distantPast
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
        if store.bool(forKey: "sosOn") { phase = .active; startTracking() }
        if let s = store.string(forKey: "scr"), let a = SosModel.parseScreens(s) { screens = a }
        if let lb = store.dictionary(forKey: "lb") as? [String: String], !lb.isEmpty { labels = lb }
        clock = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.now = Date() }
    }

    // MARK: écrans d'infos
    private static func parseScreens(_ s: String) -> [[String]]? {
        guard let d = s.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d), let a = o as? [[String]] else { return nil }
        var ok: [[String]] = []
        for scr in a where !scr.isEmpty && ok.count < 5 { ok.append(Array(scr.prefix(4))) }
        return ok.isEmpty ? nil : ok
    }
    private func applyScreens(_ c: [String: Any]) {
        let raw = c["scr"] as? String
        var arr: [[String]]? = nil
        if let r = raw { arr = SosModel.parseScreens(r) }
        let lb = c["lb"] as? [String: String]
        if arr == nil && lb == nil { return }
        DispatchQueue.main.async {
            if let a = arr { self.screens = a; self.store.set(raw ?? "", forKey: "scr") }
            if let l = lb, !l.isEmpty { self.labels = l; self.store.set(l, forKey: "lb") }
        }
    }
    private func applyLive(_ msg: [String: Any]) {
        guard let lv = msg["lv"] as? [String: String] else { return }
        let st = msg["st"] as? String ?? "idle"
        let sp = msg["sp"] as? String ?? ""
        DispatchQueue.main.async { self.live = lv; self.state = st; self.sport = sp; self.liveAt = Date(); self.now = Date() }
    }
    var fresh: Bool { now.timeIntervalSince(liveAt) < 20 }
    func label(_ k: String) -> String { labels[k] ?? k }
    /// valeur et unité d'une info ; un tiret quand l'iPhone n'envoie rien
    func value(_ k: String) -> (String, String) {
        if k == "clock" { let f = DateFormatter(); f.dateFormat = "HH:mm"; return (f.string(from: now), "") }
        guard fresh, let raw = live[k], !raw.isEmpty else { return ("—", "") }
        let p = raw.components(separatedBy: "|")
        return (p[0], p.count > 1 ? p[1] : "")
    }
    var stateText: String {
        if !fresh { return "En attente" }
        if state == "pause" { return "Pause" }
        return state == "rec" ? "● REC" : "Terminé"
    }

    private func refresh() {
        name = store.string(forKey: "ps") ?? ""
        contacts = store.integer(forKey: "n")
        if phase == .setup || phase == .ready { phase = (api.isEmpty || key.isEmpty) ? .setup : .ready }
    }

    // MARK: réglages reçus de l'iPhone
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

    // MARK: SOS
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
        stopTracking()
        phase = .ready
        refresh()
    }
    func callEmergency() {
        if let u = URL(string: "tel:" + emergency) { WKApplication.shared().openSystemURL(u) }
    }

    private func startTracking() {
        if loc.authorizationStatus == .notDetermined { loc.requestWhenInUseAuthorization() }
        loc.allowsBackgroundLocationUpdates = true
        loc.startUpdatingLocation()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.tick() }
    }
    private func stopTracking() {
        timer?.invalidate(); timer = nil
        loc.stopUpdatingLocation()
        loc.allowsBackgroundLocationUpdates = false
    }
    private func tick() {
        guard phase == .active, last != nil, Date().timeIntervalSince(lastPost) >= 9 else { return }
        post(status: nil) { _ in }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
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

/// Une info : libellé, valeur, unité.
struct MetricCell: View {
    let label: String
    let value: String
    let unit: String
    let size: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            Text(label.uppercased()).font(.system(size: 9, weight: .semibold)).foregroundColor(.teal).lineLimit(1).minimumScaleFactor(0.6)
            Text(value).font(.system(size: size, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.35)
            if !unit.isEmpty { Text(unit).font(.system(size: 9)).foregroundColor(.secondary).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Un écran d'infos (1 à 4), avec en bas un bouton rouge qui ramène à l'écran SOS.
struct MetricScreen: View {
    @ObservedObject var m: SosModel
    let keys: [String]
    let goSos: () -> Void

    var body: some View {
        VStack(spacing: 2) {
            HStack {
                Text(m.stateText).font(.system(size: 11, weight: .semibold)).foregroundColor(m.state == "rec" && m.fresh ? .red : .secondary)
                Spacer()
                Text(m.sport).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
            }
            if keys.count <= 1 {
                cell(keys.first ?? "dur", 50)
            } else if keys.count == 2 {
                cell(keys[0], 34)
                cell(keys[1], 34)
            } else {
                HStack(spacing: 2) { cell(keys[0], 26); cell(keys[1], 26) }
                HStack(spacing: 2) {
                    cell(keys[2], 26)
                    if keys.count > 3 { cell(keys[3], 26) }
                }
            }
            Button(action: goSos) {
                Text("SOS").font(.system(size: 13, weight: .heavy)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).frame(height: 24).background(Capsule().fill(Color.red))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Aller à l'écran SOS")
        }
        .padding(.horizontal, 2)
    }

    private func cell(_ k: String, _ size: CGFloat) -> MetricCell {
        let v = m.value(k)
        return MetricCell(label: m.label(k), value: v.0, unit: v.1, size: size)
    }
}

struct ContentView: View {
    @StateObject private var m = SosModel()
    @State private var pressing = false
    @State private var page = 0

    // Écran 0 : SOS (toujours le premier). Ensuite les écrans d'infos, en glissant.
    var body: some View {
        TabView(selection: $page) {
            sosPage.tag(0)
            ForEach(0..<m.screens.count, id: \.self) { i in
                MetricScreen(m: m, keys: m.screens[i], goSos: { page = 0 }).tag(i + 1)
            }
        }
        .tabViewStyle(PageTabViewStyle())
    }

    private var sosPage: some View {
        ScrollView {
            VStack(spacing: 8) {
                switch m.phase {
                case .setup:
                    Image(systemName: "iphone").font(.title2).foregroundColor(.teal)
                    Text("Ouvre Lite Foil sur ton iPhone").font(.headline).multilineTextAlignment(.center)
                    Text("Connecte-toi à ton compte : le bouton SOS s'active ici tout seul.")
                        .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                case .ready:
                    sosButton
                    Text(pressing ? "Maintiens…" : "Maintiens 2 secondes").font(.footnote).foregroundColor(.secondary)
                    Text(m.contacts > 0 ? "\(m.contacts) proche(s) prévenu(s) avec ta position" : "Ajoute des proches dans l'appli iPhone")
                        .font(.caption2).foregroundColor(m.contacts > 0 ? .secondary : .orange).multilineTextAlignment(.center)
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
        .frame(width: 112, height: 112)
        .onLongPressGesture(minimumDuration: 2, maximumDistance: 60, perform: { pressing = false; m.fire() },
                            onPressingChanged: { p in pressing = p; if p { WKInterfaceDevice.current().play(.start) } })
        .accessibilityLabel("SOS, maintenir 2 secondes")
    }
}

@main
struct LiteFoilWatchApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
