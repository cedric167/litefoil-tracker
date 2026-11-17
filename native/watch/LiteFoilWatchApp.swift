import SwiftUI
import WatchKit
import WatchConnectivity
import CoreLocation

/// Lite Foil sur Apple Watch : un bouton SOS.
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
    }

    private func refresh() {
        name = store.string(forKey: "ps") ?? ""
        contacts = store.integer(forKey: "n")
        if phase == .setup || phase == .ready { phase = (api.isEmpty || key.isEmpty) ? .setup : .ready }
    }

    // MARK: réglages reçus de l'iPhone
    private func apply(_ c: [String: Any]) {
        guard let a = c["api"] as? String, let k = c["k"] as? String else { return }
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

struct ContentView: View {
    @StateObject private var m = SosModel()
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
