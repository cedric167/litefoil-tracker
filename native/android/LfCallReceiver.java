package fr.litefoil.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Lite Foil : bouton « Refuser » de la notification d'appel. */
public class LfCallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent != null && LfCall.ACTION_DECLINE.equals(intent.getAction())) LfCall.stop(ctx, "decline");
        else if (intent != null && LfSos.ACTION_STOP.equals(intent.getAction())) LfSos.stop(ctx);
    }
}
