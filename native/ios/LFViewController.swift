import UIKit
import Capacitor

/// Lite Foil : contrôleur principal (remplace CAPBridgeViewController dans Main.storyboard)
/// pour enregistrer le module natif LfTrack, qui fait partie de l'appli et non d'un paquet npm.
class LFViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LfTrackPlugin())
    }
}
