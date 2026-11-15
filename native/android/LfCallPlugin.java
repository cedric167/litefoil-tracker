package fr.litefoil.tracker;

import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lite Foil : module « LfCall » lu par la page.
 * pending() : dernier appel reçu par l'écran d'appel natif et le choix fait (answer / decline).
 * done()    : fin d'appel, l'appli ne s'affiche plus par-dessus l'écran verrouillé.
 */
@CapacitorPlugin(name = "LfCall")
public class LfCallPlugin extends Plugin {
    @PluginMethod
    public void pending(PluginCall call) {
        SharedPreferences sp = LfCall.prefs(getContext());
        JSObject o = new JSObject();
        o.put("peer", sp.getString("peer", ""));
        o.put("mid", sp.getString("mid", ""));
        o.put("act", sp.getString("act", ""));
        o.put("t", sp.getLong("t", 0));
        call.resolve(o);
    }

    @PluginMethod
    public void done(PluginCall call) {
        LfCall.prefs(getContext()).edit().putString("act", "done").apply();
        LfCall.stop(getContext(), null);
        getActivity().runOnUiThread(new Runnable() { @Override public void run() {
            if (Build.VERSION.SDK_INT >= 27) { getActivity().setShowWhenLocked(false); getActivity().setTurnScreenOn(false); }
        } });
        call.resolve();
    }
}
