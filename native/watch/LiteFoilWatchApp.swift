import SwiftUI
import WatchKit
import WatchConnectivity
import CoreLocation
import HealthKit

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

final class SosModel: NSObject, ObservableObject, WCSessionDelegate, CLLocationManagerDelegate, HKLiveWorkoutBuilderDelegate {
    enum Phase { case setup, ready, sending, active, failed }
    enum Screen { case home, sports, run, confirm, summary, sos }

    static let sports = ["eFoil", "Wingfoil", "Pumpfoil", "Surf foil", "Windfoil", "Downwind", "Kitesurf", "Windsurf", "Wakeboard", "Surf", "Paddle", "Voile", "Course", "Vélo", "Marche", "Ski", "Musculation", "Cross training", "HIIT", "Fitness", "Cardio", "Yoga", "Rameur", "Vélo de salle", "Tapis de course", "Boxe"]
    /// sports de salle : pas de GPS, écrans cardio
    static let indoorSports: Set<String> = ["Musculation", "Cross training", "HIIT", "Fitness", "Cardio", "Yoga", "Rameur", "Vélo de salle", "Tapis de course", "Boxe"]
    static let indoorScreens = [WatchScreen(top: ["clock", "wbat"], m: ["hr", "dur", "kcal"]), WatchScreen(top: ["clock", "wbat"], m: ["zone", "hravg", "hrmax", "kcal"])]
    var isIndoor: Bool { SosModel.indoorSports.contains(sport) }
    // séries (musculation, fitness) ou tours (cross training, cardio) avec chrono de repos
    @Published var setCount = 1
    @Published var resting = false
    @Published var restGoal = 90
    private(set) var phaseStart = Date()
    private var restBuzzed = false
    static let restChoices = [30, 60, 90, 120, 180]
    var setIsSerie: Bool { sport == "Musculation" || sport == "Fitness" }
    var setWord: String { setIsSerie ? "Série" : "Tour" }
    var phaseS: Double { max(0, now.timeIntervalSince(phaseStart)) }
    /// dernière page de la sortie (les commandes) : les écrans, plus la page des séries pour un sport de salle
    var lastPage: Int { screens.count + (isIndoor ? 1 : 0) }
    func endSet() { resting = true; phaseStart = Date(); restBuzzed = false; touched(); WKInterfaceDevice.current().play(.stop) }
    func nextSet() { resting = false; setCount += 1; phaseStart = Date(); touched(); WKInterfaceDevice.current().play(.start) }
    // minuteurs : Tabata (8 × 20 s d'effort / 10 s de repos), EMOM (un signal chaque minute), AMRAP (compte à rebours et tours)
    @Published var timerMode = "series"
    @Published var timerOn = false
    @Published var timerDone = false
    @Published var amrapMin = 10
    private(set) var timerStart = Date()
    private var timerKey = -1
    static let timerModes = ["series", "tabata", "emom", "amrap"]
    static let amrapChoices = [5, 10, 12, 15, 20]
    var timerE: Double { timerOn ? max(0, now.timeIntervalSince(timerStart)) : 0 }
    var modeTitle: String {
        switch timerMode {
        case "tabata": return "Tabata"
        case "emom": return "EMOM"
        case "amrap": return "AMRAP"
        default: return setIsSerie ? "Séries" : "Tours"
        }
    }
    func cycleMode() {
        guard !timerOn else { return }
        let c = SosModel.timerModes, i = c.firstIndex(of: timerMode) ?? 0
        timerMode = c[(i + 1) % c.count]; timerDone = false; store.set(timerMode, forKey: "timerMode"); touched()
        WKInterfaceDevice.current().play(.click)
    }
    func cycleAmrap() {
        guard !timerOn else { return }
        let c = SosModel.amrapChoices, i = c.firstIndex(of: amrapMin) ?? 1
        amrapMin = c[(i + 1) % c.count]; timerDone = false; store.set(amrapMin, forKey: "amrapMin"); touched()
        WKInterfaceDevice.current().play(.click)
    }
    func timerToggle() {
        if timerOn { timerOn = false }
        else { timerOn = true; timerDone = false; timerStart = Date(); timerKey = -1; if timerMode == "amrap" { setCount = 1 } }
        touched()
        WKInterfaceDevice.current().play(timerOn ? .start : .stop)
    }
    /// titre, chrono et couleur (0 neutre, 1 effort, 2 repos, 3 terminé) du minuteur
    func timerInfo() -> (String, String, Int) {
        let e = timerE
        switch timerMode {
        case "tabata":
            if timerDone { return ("Terminé", "8 / 8", 3) }
            if !timerOn { return ("8 × 20 s / 10 s", "0:20", 0) }
            let r = min(7, Int(e / 30)), p = e - Double(r) * 30
            if p < 20 { return ("Effort " + String(r + 1) + "/8", SosModel.clockText(20 - p + 0.99), 1) }
            return ("Repos " + String(r + 1) + "/8", SosModel.clockText(30 - p + 0.99), 2)
        case "emom":
            if !timerOn { return ("Chaque minute", "1:00", 0) }
            let mn = Int(e / 60), p = e - Double(mn) * 60
            return ("Minute " + String(mn + 1), SosModel.clockText(60 - p + 0.99), 1)
        default:
            if timerDone { return (String(max(0, setCount - 1)) + " tours", "0:00", 3) }
            if !timerOn { return ("Compte à rebours", SosModel.clockText(Double(amrapMin * 60)), 0) }
            return ("Tour " + String(setCount), SosModel.clockText(max(0, Double(amrapMin * 60) - e) + 0.99), 1)
        }
    }
    private func timerTick(_ t: Date) {
        guard running, timerOn else { return }
        let e = t.timeIntervalSince(timerStart), dev = WKInterfaceDevice.current()
        switch timerMode {
        case "tabata":
            if e >= 240 { timerOn = false; timerDone = true; dev.play(.success); return }
            let r = Int(e / 30), key = r * 2 + ((e - Double(r) * 30) < 20 ? 0 : 1)
            if key != timerKey { if timerKey >= 0 { dev.play(key % 2 == 0 ? .start : .stop) }; timerKey = key }
        case "emom":
            let key = Int(e / 60)
            if key != timerKey { if timerKey >= 0 { dev.play(.notification) }; timerKey = key }
        case "amrap":
            if e >= Double(amrapMin * 60) { timerOn = false; timerDone = true; dev.play(.success) }
        default: break
        }
    }
    // zones cardio : fréquence max estimée à 220 − âge (âge lu dans Santé si l'accès est accepté), sinon 190
    private var hrCeil = 190.0
    private func loadAge() {
        guard let c = try? hk.dateOfBirthComponents(), let y = c.year else { return }
        let age = Calendar.current.component(.year, from: Date()) - y
        if age > 10 && age < 100 { hrCeil = Double(220 - age) }
    }
    var zone: Int {
        guard hrNow > 0 else { return 0 }
        let r = hrNow / hrCeil
        return r < 0.6 ? 1 : (r < 0.7 ? 2 : (r < 0.8 ? 3 : (r < 0.9 ? 4 : 5)))
    }
    static func zoneColor(_ z: Int) -> Color {
        switch z {
        case 1: return .lfMute
        case 2: return .lfAccent
        case 3: return .lfGo
        case 4: return .lfYellow
        case 5: return .lfRed
        default: return .lfRed
        }
    }
    func cycleRest() {
        let c = SosModel.restChoices, i = c.firstIndex(of: restGoal) ?? 2
        restGoal = c[(i + 1) % c.count]; store.set(restGoal, forKey: "restGoal"); touched()
        WKInterfaceDevice.current().play(.click)
    }
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
    /// mode Eau d'Apple en cours (écran tactile coupé par la montre, on en sort avec la Digital Crown)
    @Published var waterLock = false
    private var waterAskAt: Date?
    // séance d'exercice Apple pendant la sortie : la montre garde l'appli à l'écran au lieu de revenir au cadran
    private let hk = HKHealthStore()
    private var workout: HKWorkoutSession?
    /// sorties terminées pas encore confiées à l'iPhone
    @Published var pendingRides = 0
    /// si la dernière fin de sortie a été interrompue (appli fermée par le système), on le dit à l'accueil
    @Published var stopNote = ""
    private var builder: HKLiveWorkoutBuilder?
    private var savedScreens: [WatchScreen]?
    // jeux d'écrans composés sur l'iPhone pour les sports à terre et pour la salle
    private var screensTerre: [WatchScreen]?
    private var screensSalle: [WatchScreen]?
    static let landSports: Set<String> = ["Course", "Vélo", "Marche", "Ski"]
    // cardio et calories lus pendant la séance
    private(set) var hrNow = 0.0, hrAvg = 0.0, hrMax = 0.0, kcal = 0.0
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
    /// sports sur l'eau : le mode Eau se met tout seul au départ, comme pour un exercice aquatique d'Apple
    static let waterSports: Set<String> = ["eFoil", "Wingfoil", "Pumpfoil", "Surf foil", "Windfoil", "Downwind", "Kitesurf", "Windsurf", "Wakeboard", "Surf", "Paddle", "Voile"]
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
        if let s = store.string(forKey: "scr2t") { screensTerre = SosModel.parseScreens2(s) }
        if let s = store.string(forKey: "scr2s") { screensSalle = SosModel.parseScreens2(s) }
        else if let s = store.string(forKey: "scr"), let a = SosModel.parseScreens(s) { screens = a }
        if let lb = store.dictionary(forKey: "lb") as? [String: String], !lb.isEmpty { labels = lb }
        let rg = store.integer(forKey: "restGoal"); if SosModel.restChoices.contains(rg) { restGoal = rg }
        let am = store.integer(forKey: "amrapMin"); if SosModel.amrapChoices.contains(am) { amrapMin = am }
        if let tm = store.string(forKey: "timerMode"), SosModel.timerModes.contains(tm) { timerMode = tm }
        if store.bool(forKey: "sosOn") { phase = .active; screen = .sos; startTracking() }
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.second() }
        let st = store.integer(forKey: "stopStep")
        if st > 0 { stopNote = "Dernier arrêt interrompu (étape " + String(st) + ")"; store.set(0, forKey: "stopStep") }
        pendingRides = (store.stringArray(forKey: "pendingRides") ?? []).count
        // l'accord « exercice » est demandé à l'ouverture de l'appli, pas au moment du GO (le mode Eau couperait l'écran dessus)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let s = self, HKHealthStore.isHealthDataAvailable() else { return }
            var rd = Set<HKObjectType>()
            if let t = HKQuantityType.quantityType(forIdentifier: .heartRate) { rd.insert(t) }
            if let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { rd.insert(t) }
            if let t = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) { rd.insert(t) }
            s.hk.requestAuthorization(toShare: [HKObjectType.workoutType()], read: rd) { _, _ in }
        }
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
        let rawT = c["scr2t"] as? String, rawS = c["scr2s"] as? String
        if rawT != nil || rawS != nil {
            DispatchQueue.main.async {
                if let r = rawT, let a = SosModel.parseScreens2(r) { self.screensTerre = a; self.store.set(r, forKey: "scr2t") }
                if let r = rawS, let a = SosModel.parseScreens2(r) { self.screensSalle = a; self.store.set(r, forKey: "scr2s") }
            }
        }
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
        flushRides()
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { applyLive(message) }

    // MARK: sortie
    /// l'utilisateur vient de toucher l'écran ou de changer de page : on repousse le verrouillage automatique
    func touched() { lastTouch = Date() }
    func unlock() { locked = false; lastTouch = Date(); WKInterfaceDevice.current().play(.success) }

    /// la montre sait faire le mode Eau (toutes les montres étanches : Series 2 et suivantes, SE, Ultra)
    var waterOk: Bool { WKInterfaceDevice.current().waterResistanceRating != .ipx7 }
    /// Mode Eau d'Apple. Il n'est accepté que pendant une sortie (session de localisation active, appli à l'écran).
    /// Si la montre le refuse, on retombe sur le verrou de l'appli au bout d'une seconde et demie.
    func waterLockOn() {
        page = 0; lastTouch = Date()
        guard running, waterOk else { locked = true; WKInterfaceDevice.current().play(.click); return }
        locked = false
        waterAskAt = Date()
        WKInterfaceDevice.current().enableWaterLock()
    }

    private func workoutKind() -> HKWorkoutActivityType {
        switch sport {
        case "Course": return .running
        case "Vélo": return .cycling
        case "Marche": return .walking
        case "Ski": return .downhillSkiing
        case "Voile": return .sailing
        case "Paddle": return .paddleSports
        case "eFoil", "Wakeboard": return .waterSports
        case "Musculation": return .traditionalStrengthTraining
        case "Cross training": return .crossTraining
        case "Fitness": return .functionalStrengthTraining
        case "Cardio": return .mixedCardio
        case "HIIT": return .highIntensityIntervalTraining
        case "Yoga": return .yoga
        case "Rameur": return .rowing
        case "Vélo de salle": return .cycling
        case "Tapis de course": return .running
        case "Boxe": return .boxing
        default: return .surfingSports
        }
    }
    private func startWorkout() {
        guard HKHealthStore.isHealthDataAvailable(), workout == nil else { return }
        let c = HKWorkoutConfiguration()
        c.activityType = workoutKind()
        c.locationType = isIndoor ? .indoor : .outdoor
        hrNow = 0; hrAvg = 0; hrMax = 0; kcal = 0
        loadAge()
        do {
            let w = try HKWorkoutSession(healthStore: hk, configuration: c)
            let b = w.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: hk, workoutConfiguration: c)
            b.delegate = self
            workout = w; builder = b
            let d = Date()
            w.startActivity(with: d)
            collecting = false
            b.beginCollection(withStart: d) { [weak self] ok, _ in DispatchQueue.main.async { self?.collecting = ok } }
        } catch { workout = nil; builder = nil }
    }
    /// vrai quand l'enregistrement Santé a réellement démarré (accord donné)
    private var collecting = false
    /// fin de la séance : enregistrée dans Santé si la sortie est gardée, sinon jetée
    private func endWorkout(save: Bool) {
        guard let w = workout else { return }
        let b = builder, was = collecting
        workout = nil; builder = nil; collecting = false
        b?.delegate = nil
        w.end()
        // sans accord Santé, l'enregistrement n'a jamais démarré : il n'y a rien à clôturer
        guard was, let bb = b else { return }
        bb.endCollection(withEnd: Date()) { ok, _ in
            guard ok else { return }
            if save { bb.finishWorkout { _, _ in } } else { bb.discardWorkout() }
        }
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let bpm = HKUnit.count().unitDivided(by: HKUnit.minute())
        var h = -1.0, a = -1.0, mx = -1.0, k = -1.0
        if let t = HKQuantityType.quantityType(forIdentifier: .heartRate), let st = workoutBuilder.statistics(for: t) {
            h = st.mostRecentQuantity()?.doubleValue(for: bpm) ?? -1
            a = st.averageQuantity()?.doubleValue(for: bpm) ?? -1
            mx = st.maximumQuantity()?.doubleValue(for: bpm) ?? -1
        }
        if let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned), let st = workoutBuilder.statistics(for: t) {
            k = st.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? -1
        }
        DispatchQueue.main.async { [weak self] in
            guard let s = self else { return }
            if h >= 0 { s.hrNow = h }
            if a >= 0 { s.hrAvg = a }
            if mx >= 0 { s.hrMax = mx }
            if k >= 0 { s.kcal = k }
        }
    }

    func chooseSport(_ s: String) { sport = s; store.set(s, forKey: "sport"); screen = .home }

    func startRide() {
        if loc.authorizationStatus == .notDetermined { loc.requestWhenInUseAuthorization() }
        setCount = 1; resting = false; phaseStart = Date(); restBuzzed = false; timerOn = false; timerDone = false
        runS = 0; moveS = 0; distM = 0; maxKmh = 0; curKmh = 0; anchor = nil; prevFix = nil
        onFoil = false; foilUp = 0; foilDown = 0; runCount = 0; foilS = 0; foilDistM = 0; longRunS = 0; longRunDistM = 0; runMaxKmh = 0
        startDate = Date(); lastTick = Date(); lastTouch = Date()
        track = []; lastTrackS = -10
        running = true; paused = false; locked = false
        page = 0; screen = .run
        // sport de salle : pas de GPS, écrans cardio à la place des écrans composés sur l'iPhone
        let alt: [WatchScreen]? = isIndoor ? (screensSalle ?? SosModel.indoorScreens) : (SosModel.landSports.contains(sport) ? screensTerre : nil)
        if let a = alt, !a.isEmpty { savedScreens = screens; screens = a }
        if !isIndoor { startLocation() }
        startWorkout()
        WKInterfaceDevice.current().play(.start)
        // sport sur l'eau : mode Eau automatique, une fois le GPS lancé
        if SosModel.waterSports.contains(sport) && waterOk {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                guard let s = self, s.running, !s.paused, s.screen == .run, !s.waterLock else { return }
                s.waterLockOn()
            }
        }
    }
    func pauseRide(_ on: Bool) {
        if on { endFoilRun() }
        paused = on; anchor = nil; prevFix = nil; curKmh = 0; lastTick = Date(); lastTouch = Date()
        if on { workout?.pause() } else { workout?.resume() }
        WKInterfaceDevice.current().play(.click)
    }
    func stopRide(keep: Bool) {
        store.set(1, forKey: "stopStep")
        endFoilRun()
        // 1) la sortie est mise en file et confiée à l'iPhone avant tout le reste
        if keep { sendRide() }
        store.set(2, forKey: "stopStep")
        running = false; paused = false; locked = false; waterLock = false; waterAskAt = nil; curKmh = 0; timerOn = false
        if phase != .active && phase != .sending { stopLocation() }
        WKInterfaceDevice.current().play(.stop)
        page = 0
        screen = keep ? .summary : .home
        store.set(3, forKey: "stopStep")
        // 2) les écrans d'origine reviennent une fois la page de sortie quittée, la séance d'exercice est clôturée en dernier
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let s = self else { return }
            if !s.running, let sv = s.savedScreens { s.screens = sv; s.savedScreens = nil }
            s.store.set(4, forKey: "stopStep")
            s.endWorkout(save: keep)
            s.store.set(0, forKey: "stopStep")
        }
    }
    /// nombre entier sûr : une valeur invalide (infinie, non numérique) donne 0 au lieu de faire tomber l'appli
    private static func si(_ d: Double) -> Int { d.isFinite ? Int(max(-2e9, min(2e9, d))) : 0 }
    private static func sd(_ d: Double) -> Double { d.isFinite ? d : 0 }
    /// Date en millisecondes depuis 1970 : trop grande pour si() (limité à 2 milliards), d'où un entier 64 bits.
    private static func ms(_ t: Date) -> Int64 { let v = t.timeIntervalSince1970 * 1000; return v.isFinite ? Int64(max(0, min(9e15, v))) : 0 }
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
            // suivi du mode Eau : seul l'utilisateur peut le quitter (Digital Crown), on lit donc son état chaque seconde
            let wl = WKInterfaceDevice.current().isWaterLockEnabled
            if wl != waterLock { waterLock = wl; lastTouch = t; if wl { locked = false } }
            if let a = waterAskAt, t.timeIntervalSince(a) >= 1.5 {
                waterAskAt = nil
                if !wl { locked = true; WKInterfaceDevice.current().play(.click) }   // mode Eau refusé par la montre : verrou de l'appli
            }
            // verrouillage automatique : sortie en cours, écran d'infos affiché, personne n'a touché l'écran depuis 8 secondes
            if !paused && !locked && !waterLock && waterAskAt == nil && screen == .run && page < screens.count && t.timeIntervalSince(lastTouch) >= SosModel.autoLockS {
                locked = true
                WKInterfaceDevice.current().play(.click)
            }
        }
        now = t
        if Int(t.timeIntervalSince1970) % 20 == 0 { flushRides() }
        timerTick(t)
        // repos visé atteint : la montre vibre une fois
        if running && isIndoor && resting && !restBuzzed && t.timeIntervalSince(phaseStart) >= Double(restGoal) {
            restBuzzed = true
            WKInterfaceDevice.current().play(.notification)
        }
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
        guard track.count >= 2 || isIndoor || runS >= 20 else { return }
        let pts: [[Double]] = track.map { p in
            [SosModel.sd((p[0] * 100000).rounded() / 100000), SosModel.sd((p[1] * 100000).rounded() / 100000), SosModel.sd((p[2] * 10).rounded() / 10), SosModel.sd(p[3].rounded()), SosModel.sd(p.count > 4 ? p[4].rounded() : 0)]
        }.filter { $0[0] != 0 || $0[1] != 0 }
        let ride: [String: Any] = [
            "id": "watch-\(SosModel.ms(startDate))", "sport": sport,
            "start": SosModel.ms(startDate), "dur": SosModel.si(runS), "dist": SosModel.si(distM),
            "max": SosModel.sd((maxKmh * 10).rounded() / 10), "runs": runCount, "foilS": SosModel.si(foilS), "foilM": SosModel.si(foilDistM), "pts": pts,
            "hr": SosModel.si(hrAvg.rounded()), "hrmax": SosModel.si(hrMax.rounded()), "kcal": SosModel.si(kcal.rounded()), "indoor": isIndoor, "sets": isIndoor ? setCount : 0, "setw": setWord
        ]
        guard JSONSerialization.isValidJSONObject(ride), let d = try? JSONSerialization.data(withJSONObject: ride), let s = String(data: d, encoding: .utf8) else { return }
        // file d'attente gardée sur la montre : la sortie n'est retirée qu'une fois confiée à la liaison avec l'iPhone
        var q = store.stringArray(forKey: "pendingRides") ?? []
        q.append(s)
        if q.count > 20 { q.removeFirst(q.count - 20) }
        store.set(q, forKey: "pendingRides")
        lastQueuePush = Date.distantPast
        flushRides()
    }
    private var lastQueuePush = Date.distantPast
    /// Envoie à l'iPhone les sorties en attente. Chaque sortie reste sur la montre jusqu'à l'accusé de réception de l'iPhone.
    func flushRides() {
        let q = store.stringArray(forKey: "pendingRides") ?? []
        DispatchQueue.main.async { self.pendingRides = q.count }
        guard !q.isEmpty, WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated else { return }
        // 1) file du système : arrive même si l'iPhone est loin ou son appli fermée ; au plus une fois toutes les 10 minutes
        if Date().timeIntervalSince(lastQueuePush) > 600 {
            lastQueuePush = Date()
            for r in q { s.transferUserInfo(["ride": r]) }
        }
        // 2) message direct dès que l'appli iPhone est joignable : réponse immédiate
        if s.isReachable {
            let small = q.filter { $0.utf8.count < 50000 }
            if !small.isEmpty {
                s.sendMessage(["rides": small], replyHandler: { [weak self] rep in
                    if let ids = rep["ack"] as? [String] { self?.ackRides(ids) }
                }, errorHandler: nil)
            }
        }
    }
    private func rideId(_ js: String) -> String {
        guard let d = js.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return "" }
        return (o["id"] as? String) ?? ""
    }
    /// l'iPhone confirme avoir reçu ces sorties : on les retire de la file
    func ackRides(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        var q = store.stringArray(forKey: "pendingRides") ?? []
        q.removeAll { ids.contains(self.rideId($0)) }
        if q.isEmpty { store.removeObject(forKey: "pendingRides") } else { store.set(q, forKey: "pendingRides") }
        let n = q.count
        DispatchQueue.main.async { self.pendingRides = n }
    }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let ids = userInfo["ack"] as? [String] { ackRides(ids) }
    }
    /// état de la liaison avec l'iPhone, affiché dans le résumé
    var linkText: String {
        guard WCSession.isSupported() else { return "Liaison iPhone indisponible" }
        let s = WCSession.default
        if s.activationState != .activated { return "Liaison iPhone inactive" }
        if !s.isCompanionAppInstalled { return "Appli Lite Foil absente de l'iPhone" }
        return s.isReachable ? "iPhone connecté" : "iPhone hors de portée ou appli fermée"
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
        case "kcal": return "KCAL"
        case "zone": return "ZONE"
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
        case "hr": return (hrNow > 0 ? String(Int(hrNow.rounded())) : "—", "bpm")
        case "hravg": return (hrAvg > 0 ? String(Int(hrAvg.rounded())) : "—", "bpm")
        case "hrmax": return (hrMax > 0 ? String(Int(hrMax.rounded())) : "—", "bpm")
        case "kcal": return (kcal > 0 ? String(Int(kcal.rounded())) : "—", "kcal")
        case "zone": return (zone > 0 ? "Z" + String(zone) : "—", "")
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
        case "hr": return "♥ " + v.0 + (zone > 0 ? " Z" + String(zone) : "")
        case "hravg", "hrmax": return "♥ " + v.0
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
                            "t": Int64(Date().timeIntervalSince1970 * 1000), "spd": max(0, l.speed) * 3.6]]
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
    var lsize: CGFloat = 14

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
            if m.pendingRides > 0 { Text(String(m.pendingRides) + " sortie(s) à envoyer · " + m.linkText).font(.system(size: 9, weight: .semibold)).foregroundColor(.lfYellow).lineLimit(2).multilineTextAlignment(.center) }
            if !m.stopNote.isEmpty { Text(m.stopNote).font(.system(size: 9)).foregroundColor(.lfMute) }
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
                Text(m.topText(scr.top[0])).font(.system(size: 15, weight: .semibold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity, alignment: .leading)
                Text(m.elapsedText).font(.system(size: 16, weight: .bold)).foregroundColor(m.paused ? .orange : .lfYellow).lineLimit(1).fixedSize()
                Text(m.topText(scr.top[1])).font(.system(size: 15, weight: .semibold)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 4)
            if scr.m.count <= 1 {
                cell(scr.m.first ?? "dur", 146)
            } else if scr.m.count == 2 {
                cell(scr.m[0], 84)
                cell(scr.m[1], 84)
            } else if scr.m.count == 3 {
                cell(scr.m[0], 78)
                HStack(spacing: 6) { cell(scr.m[1], 42, 12); cell(scr.m[2], 42, 12) }
            } else {
                HStack(spacing: 6) { cell(scr.m[0], 38, 12); cell(scr.m[1], 38, 12) }
                HStack(spacing: 6) { cell(scr.m[2], 38, 12); cell(scr.m[3], 38, 12) }
            }
            if m.locked { Color.clear.frame(height: 22) } else { SosChip(m: m) }
        }
        .padding(.horizontal, 1)
        .ignoresSafeArea(.container, edges: .top)
    }

    private func cell(_ k: String, _ size: CGFloat, _ lsize: CGFloat = 14) -> MetricCell {
        let v = m.value(k)
        return MetricCell(label: m.shortLabel(k), value: v.0, unit: v.1, size: size, lsize: lsize)
    }
}

/// Sport de salle : séries (ou tours) avec chrono de repos, ou minuteur Tabata / EMOM / AMRAP. Le mode se change en touchant la pastille du haut.
struct IndoorSetView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Button(action: { m.cycleMode() }) { chip(m.modeTitle + " ›") }.buttonStyle(.plain)
                Text("♥ " + m.value("hr").0 + (m.zone > 0 ? " Z" + String(m.zone) : "")).font(.system(size: 13, weight: .bold)).foregroundColor(SosModel.zoneColor(m.zone)).lineLimit(1).minimumScaleFactor(0.7)
            }
            if m.timerMode == "series" { series } else { timer }
        }
        .padding(.horizontal, 6)
    }

    private func chip(_ t: String) -> some View {
        Text(t).font(.system(size: 11, weight: .semibold)).foregroundColor(.white).lineLimit(1)
            .padding(.horizontal, 8).frame(height: 22).background(Capsule().fill(Color.lfDark))
    }

    @ViewBuilder private var series: some View {
        Text(m.setWord.uppercased() + " " + String(m.setCount)).font(.system(size: 17, weight: .heavy)).foregroundColor(.white)
        Text((m.resting ? "Repos " : "") + SosModel.clockText(m.phaseS))
            .font(.system(size: 27, weight: .bold, design: .rounded))
            .foregroundColor(m.resting ? (m.phaseS >= Double(m.restGoal) ? Color.lfGo : Color.lfYellow) : Color.lfAccent)
            .lineLimit(1).minimumScaleFactor(0.6)
        if m.resting {
            LfButton(title: m.setIsSerie ? "Série suivante" : "Tour suivant", bg: .lfGo, fg: .black, height: 42, action: { m.nextSet() })
        } else {
            LfButton(title: m.setIsSerie ? "Fin de série" : "Fin du tour", bg: .lfYellow, fg: .black, height: 42, action: { m.endSet() })
        }
        Button(action: { m.cycleRest() }) { chip("Repos visé " + SosModel.clockText(Double(m.restGoal))) }.buttonStyle(.plain)
    }

    @ViewBuilder private var timer: some View {
        let i = m.timerInfo()
        Text(i.0).font(.system(size: 15, weight: .heavy)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.6)
        Text(i.1).font(.system(size: 32, weight: .bold, design: .rounded))
            .foregroundColor(i.2 == 1 ? Color.lfGo : (i.2 == 2 ? Color.lfYellow : (i.2 == 3 ? Color.lfAccent : Color.white)))
            .lineLimit(1).minimumScaleFactor(0.6)
        HStack(spacing: 6) {
            LfButton(title: m.timerOn ? "Stop" : "Départ", bg: m.timerOn ? .lfRed : .lfGo, fg: m.timerOn ? .white : .black, height: 42, action: { m.timerToggle() })
            if m.timerMode == "amrap" {
                if m.timerOn { LfButton(title: "Tour +", bg: .lfYellow, fg: .black, height: 42, action: { m.nextSet() }) }
                else { LfButton(title: String(m.amrapMin) + " min", bg: .lfDark, fg: .white, height: 42, action: { m.cycleAmrap() }) }
            }
        }
    }
}

struct ControlsView: View {
    @ObservedObject var m: SosModel

    var body: some View {
        VStack(spacing: 6) {
            Text(m.elapsedText).font(.system(size: 12, weight: .bold)).foregroundColor(m.paused ? .orange : .lfYellow)
            LfButton(title: m.waterOk ? "💧 Mode Eau" : "Verrouiller l'écran", bg: Color(red: 0.11, green: 0.37, blue: 0.56), fg: .white, action: { m.waterLockOn() })
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
                if m.isIndoor { IndoorSetView(m: m).tag(m.screens.count) }
                ControlsView(m: m).tag(m.lastPage)
            }
            .tabViewStyle(PageTabViewStyle())
            if m.locked { LockOverlay(m: m) }
        }
        // la couronne fait défiler les écrans, même écran verrouillé (doigts mouillés, gants)
        .focusable(true)
        .digitalCrownRotation($crown, from: 0, through: Double(m.lastPage), by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { v in
            let p = Int(v.rounded())
            if p != m.page && p >= 0 && p <= m.lastPage { m.page = p }
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
                // plus de bouton « Abandonner » : trop petit au doigt mouillé ; une sortie se supprime ensuite dans l'appli iPhone
                LfButton(title: "Terminer", bg: .lfGo, fg: .black, height: 58, action: { m.stopRide(keep: true) })
                LfButton(title: "Continuer", bg: .lfDark, fg: .white, height: 46, action: { m.screen = .run })
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
                if m.hrAvg > 0 || m.kcal > 0 || m.isIndoor {
                    Group {
                        Text("Cardio").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                        if m.isIndoor { SummaryLine(a: "Durée", b: SosModel.clockText(m.runS)) }
                        SummaryLine(a: "Cardio moyen", b: m.hrAvg > 0 ? String(Int(m.hrAvg.rounded())) + " bpm" : "—")
                        SummaryLine(a: "Cardio max", b: m.hrMax > 0 ? String(Int(m.hrMax.rounded())) + " bpm" : "—")
                        SummaryLine(a: "Calories", b: m.kcal > 0 ? String(Int(m.kcal.rounded())) + " kcal" : "—")
                        if m.isIndoor { SummaryLine(a: m.setIsSerie ? "Séries" : "Tours", b: String(m.setCount)) }
                    }
                }
                if !m.isIndoor {
                    Group {
                        Text("Distance et temps").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                        SummaryLine(a: "Durée", b: SosModel.clockText(m.runS))
                        SummaryLine(a: "Temps actif", b: SosModel.clockText(m.moveS))
                        SummaryLine(a: "Distance", b: SosModel.num(m.distM / 1000, 2) + " km")
                        Text("Vitesse").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                        SummaryLine(a: "Max", b: SosModel.num(m.maxKmh, 1) + " km/h")
                        SummaryLine(a: "Moyenne", b: SosModel.num(m.runS > 5 ? m.distM / m.runS * 3.6 : 0, 1) + " km/h")
                    }
                    Group {
                        Text("Sur le foil").font(.system(size: 12, weight: .bold)).foregroundColor(.lfAccent).padding(.top, 6)
                        SummaryLine(a: "Runs", b: String(m.runCount))
                        SummaryLine(a: "Temps sur le foil", b: SosModel.clockText(m.foilS))
                        SummaryLine(a: "Distance sur le foil", b: SosModel.num(m.foilDistM / 1000, 2) + " km")
                        SummaryLine(a: "Plus long run", b: SosModel.clockText(m.longRunS))
                    }
                }
                Text(m.pendingRides > 0 ? "En attente (" + String(m.pendingRides) + ") : ouvre Lite Foil sur l'iPhone" : "Sortie reçue par l'iPhone ✓")
                    .font(.system(size: 10, weight: .semibold)).foregroundColor(m.pendingRides > 0 ? .lfYellow : .lfGo).padding(.top, 6)
                Text(m.linkText).font(.system(size: 9)).foregroundColor(.lfMute)
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
