package fr.litefoil.tracker;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// Lite Foil : enregistre les modules natifs LfTrack (suivi GPS appli fermée) et LfCall (écran d'appel)
// avant le démarrage de Capacitor.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LfTrackPlugin.class);
        registerPlugin(LfCallPlugin.class);
        registerPlugin(LfWatchLinkPlugin.class);   // liaison permanente avec la montre Lite Foil
        super.onCreate(savedInstanceState);
        callIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        callIntent(intent);
    }

    // « Décrocher » : l'appli passe par-dessus l'écran verrouillé le temps de l'appel (LfCall.done() le retire)
    private void callIntent(Intent intent) {
        if (intent == null || !LfCall.ACTION_ANSWER.equals(intent.getAction())) return;
        LfCall.stop(this, "answer");
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        intent.setAction(Intent.ACTION_MAIN);
    }

    @Override
    public void onResume() {
        super.onResume();
        LfCall.appVisible = true;
        // appli ouverte à la main pendant que ça sonne : la page prend le relais
        if ("".equals(LfCall.prefs(this).getString("act", "x"))) LfCall.stop(this, null);
        LfSos.stop(this);
    }

    @Override
    public void onPause() {
        LfCall.appVisible = false;
        super.onPause();
    }
}
