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
 * audio()   : appel en cours (20/11) : micro actif appli en arrière-plan, son sur l'écouteur ou le haut-parleur.
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

    /** État du téléphone pour l'écran « Prépare ton téléphone » : notifications, écran d'appel plein écran, sonnerie. */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        android.content.Context c = getContext();
        try { o.put("notif", androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()); } catch (Exception e) { /* inconnu */ }
        boolean full = true;
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager) c.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 34 && nm != null) full = nm.canUseFullScreenIntent();
        } catch (Exception e) { /* inconnu */ }
        o.put("fullScreen", full);
        try {
            android.media.AudioManager am = (android.media.AudioManager) c.getSystemService(android.content.Context.AUDIO_SERVICE);
            int m = am == null ? android.media.AudioManager.RINGER_MODE_NORMAL : am.getRingerMode();
            o.put("ringer", m == android.media.AudioManager.RINGER_MODE_SILENT ? "silent" : m == android.media.AudioManager.RINGER_MODE_VIBRATE ? "vibrate" : "normal");
        } catch (Exception e) { /* inconnu */ }
        call.resolve(o);
    }

    /** Ouvre le bon écran des réglages du téléphone : kind = "notif" ou "fullscreen". */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String kind = call.getString("kind", "notif");
        String pkg = getContext().getPackageName();
        android.content.Intent i;
        if ("fullscreen".equals(kind) && Build.VERSION.SDK_INT >= 34) {
            i = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, android.net.Uri.parse("package:" + pkg));
        } else if (Build.VERSION.SDK_INT >= 26) {
            i = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            i = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + pkg));
        }
        try { getActivity().startActivity(i); }
        catch (Exception e) {
            try { getActivity().startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + pkg))); } catch (Exception x) { /* rien à ouvrir */ }
        }
        call.resolve();
    }

    /** Appel en cours : on = vrai pour démarrer ou régler la session (speaker, video, name, route), faux pour l'arrêter. */
    @PluginMethod
    public void audio(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        if (!on) { LfCallService.stop(getContext()); call.resolve(); return; }
        if (!LfCallService.micGranted(getContext())) { call.reject("micro non autorisé"); return; }
        try {
            LfCallService.start(getContext(), Boolean.TRUE.equals(call.getBoolean("speaker", false)), Boolean.TRUE.equals(call.getBoolean("video", false)),
                call.getString("name", ""), Boolean.TRUE.equals(call.getBoolean("route", true)));
            call.resolve();
        } catch (Exception e) { call.reject("session d'appel impossible"); }
    }

    @PluginMethod
    public void done(PluginCall call) {
        LfCallService.stop(getContext());
        LfCall.prefs(getContext()).edit().putString("act", "done").apply();
        LfCall.stop(getContext(), null);
        getActivity().runOnUiThread(new Runnable() { @Override public void run() {
            if (Build.VERSION.SDK_INT >= 27) { getActivity().setShowWhenLocked(false); getActivity().setTurnScreenOn(false); }
        } });
        call.resolve();
    }
}
