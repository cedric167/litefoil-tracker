import UIKit
import Capacitor

/// Lite Foil : contrôleur principal (remplace CAPBridgeViewController dans Main.storyboard)
/// pour enregistrer les modules natifs LfTrack et LfCall, qui font partie de l'appli et non d'un paquet npm.
class LFViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LfTrackPlugin())
        bridge?.registerPluginInstance(LfCallPlugin())   // 20/11 : haut-parleur / écouteur pendant les appels
    }
}
