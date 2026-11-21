package fr.litefoil.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Lite Foil : après un redémarrage du téléphone ou une mise à jour de l'appli, la liaison avec la montre repart seule. */
public class LfWatchLinkBoot extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try { LfWatchLinkService.start(c); } catch (Exception ignored) {}
    }
}
