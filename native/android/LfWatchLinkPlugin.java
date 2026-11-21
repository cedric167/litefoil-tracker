package fr.litefoil.tracker;

import android.bluetooth.BluetoothAdapter;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lite Foil : module « LfWatchLink » appelé par la page (index.html, « Montre Lite Foil »).
 *   link({ id })    mémorise la montre (adresse Bluetooth donnée par la page après « Connecter ») et lance la liaison permanente
 *   unlink()        l'oublie et arrête la liaison
 *   setSos({ api, k, ps, em })  identifiants du SOS préparés par la page (les mêmes que pour l'Apple Watch et Wear OS)
 *   status()        { linked, connected, sosReady, sos }
 */
@CapacitorPlugin(name = "LfWatchLink")
public class LfWatchLinkPlugin extends Plugin {

    @Override
    public void load() {
        // appli relancée : la liaison repart si une montre est mémorisée
        try { LfWatchLinkService.start(getContext()); } catch (Exception ignored) {}
    }

    @PluginMethod
    public void link(PluginCall call) {
        String id = call.getString("id", "");
        if (id == null || !BluetoothAdapter.checkBluetoothAddress(id.toUpperCase())) { call.reject("adresse de la montre inconnue"); return; }
        LfWatchLinkService.prefs(getContext()).edit().putString("mac", id.toUpperCase()).apply();
        LfWatchLinkService.start(getContext());
        status(call);
    }

    @PluginMethod
    public void unlink(PluginCall call) {
        LfWatchLinkService.prefs(getContext()).edit().remove("mac").apply();
        LfWatchLinkService.stop(getContext());
        status(call);
    }

    @PluginMethod
    public void setSos(PluginCall call) {
        String api = call.getString("api", ""), k = call.getString("k", "");
        SharedPreferences.Editor e = LfWatchLinkService.prefs(getContext()).edit();
        if (api != null && api.startsWith("https://") && k != null && k.length() > 0) e.putString("api", api).putString("k", k);
        else e.remove("api").remove("k");
        e.apply();
        status(call);
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = LfWatchLinkService.prefs(getContext());
        JSObject o = new JSObject();
        o.put("linked", p.getString("mac", "").length() > 0);
        o.put("connected", LfWatchLinkService.alive && LfWatchLinkService.connected);
        o.put("sosReady", p.getString("api", "").length() > 0 && p.getString("k", "").length() > 0);
        o.put("sos", LfWatchLinkService.sosState);
        call.resolve(o);
    }
}
