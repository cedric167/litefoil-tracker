package fr.litefoil.tracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// Lite Foil : enregistre le module natif LfTrack (suivi GPS appli fermée) avant le démarrage de Capacitor.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LfTrackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
