package fr.litefoil.tracker;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lite Foil : module « LfTrack » appelé par la page (index.html, « Suivre avec mon téléphone »).
 * start / stop / status / getPoints / clear / openSettings + événement « location » à chaque point.
 */
@CapacitorPlugin(
    name = "LfTrack",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class LfTrackPlugin extends Plugin implements LfTrackService.Listener {

    @Override
    public void load() {
        LfTrackService.listener = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (LfTrackService.listener == this) LfTrackService.listener = null;
        super.handleOnDestroy();
    }

    // Sortie en cours mais service arrêté (processus tué par le téléphone, redémarrage…) : on le relance
    // dès que l'appli est de nouveau à l'écran, sinon la page afficherait « en cours » sans rien enregistrer.
    private void ensureService() {
        try {
            if (LfTrackStore.isRunning(getContext()) && !LfTrackService.alive && hasFine()) LfTrackService.start(getContext());
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        ensureService();
    }

    private boolean hasFine() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasFine()) {
            requestPermissionForAlias("location", call, "locationPermCallback");
            return;
        }
        askNotificationsThenStart(call);
    }

    @PermissionCallback
    private void locationPermCallback(PluginCall call) {
        if (!hasFine()) {
            call.reject("Localisation précise refusée", "NOT_AUTHORIZED");
            return;
        }
        askNotificationsThenStart(call);
    }

    private void askNotificationsThenStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifPermCallback");
            return;
        }
        reallyStart(call);
    }

    @PermissionCallback
    private void notifPermCallback(PluginCall call) {
        // Notification refusée : l'enregistrement fonctionne quand même (notification masquée).
        reallyStart(call);
    }

    private void reallyStart(PluginCall call) {
        try {
            LfTrackStore.begin(getContext(), call.getString("meta", ""), call.getString("title"), call.getString("text"));
            LfTrackService.start(getContext());
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) {
            LfTrackStore.setRunning(getContext(), false);
            call.reject("Impossible de démarrer l'enregistrement : " + e.getMessage(), "START_FAILED");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (LfTrackStore.isRunning(getContext())) LfTrackService.requestStop(getContext());
        LfTrackStore.setRunning(getContext(), false);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        ensureService();
        JSONObject m = LfTrackStore.readMeta(getContext());
        JSObject r = new JSObject();
        r.put("running", m != null && m.optBoolean("running", false));
        r.put("meta", m != null ? m.optString("meta", "") : null);
        r.put("count", m != null ? LfTrackStore.count(getContext()) : 0);
        r.put("platform", "android");
        call.resolve(r);
    }

    @PluginMethod
    public void getPoints(PluginCall call) {
        int from = call.getInt("from", 0);
        JSONArray pts = LfTrackStore.points(getContext(), from);
        JSObject r = new JSObject();
        try {
            r.put("points", new JSArray(pts.toString()));
        } catch (Exception e) {
            r.put("points", new JSArray());
        }
        r.put("from", from);
        call.resolve(r);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!LfTrackStore.isRunning(getContext())) LfTrackStore.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @Override
    public void onPoint(JSONObject p) {
        try {
            notifyListeners("location", new JSObject(p.toString()));
        } catch (Exception ignored) {}
    }

    @Override
    public void onStopped() {
        notifyListeners("stopped", new JSObject());
    }
}
