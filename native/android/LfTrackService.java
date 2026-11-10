package fr.litefoil.tracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * Lite Foil : service de premier plan qui enregistre le GPS du téléphone pendant une sortie.
 * Il ne dépend pas de la page web : il continue écran éteint ET appli fermée (balayée),
 * grâce à stopWithTask="false" dans le manifeste. Il s'arrête avec « Terminer » (page ou notification).
 */
public class LfTrackService extends Service implements LocationListener {
    static final String CHANNEL = "lf_track";
    static final int NOTIF_ID = 4711;
    static final String ACTION_STOP = "fr.litefoil.tracker.LF_TRACK_STOP";

    interface Listener {
        void onPoint(JSONObject p);
        void onStopped();
    }

    static volatile Listener listener;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private int count = 0;
    private boolean listening = false;

    static void start(Context c) {
        Intent i = new Intent(c, LfTrackService.class);
        ContextCompat.startForegroundService(c, i);
    }

    static void requestStop(Context c) {
        Intent i = new Intent(c, LfTrackService.class);
        i.setAction(ACTION_STOP);
        try {
            c.startService(i);
        } catch (Exception e) {
            // service déjà arrêté (ou démarrage interdit en arrière-plan) : on marque juste la sortie terminée
            LfTrackStore.setRunning(c, false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            return START_NOT_STICKY;
        }
        if (!LfTrackStore.isRunning(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!goForeground()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startLocation();
        return START_STICKY;
    }

    private boolean goForeground() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Enregistrement des sorties", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Affichée pendant l'enregistrement GPS d'une sortie.");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            JSONObject m = LfTrackStore.readMeta(this);
            String title = m != null ? m.optString("title", "Lite Foil — enregistrement") : "Lite Foil — enregistrement";
            String text = m != null ? m.optString("text", "Ta sortie est en cours d'enregistrement.") : "Ta sortie est en cours d'enregistrement.";
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent openPi = open != null ? PendingIntent.getActivity(this, 0, open, piFlags) : null;
            Intent stop = new Intent(this, LfTrackService.class);
            stop.setAction(ACTION_STOP);
            PendingIntent stopPi = PendingIntent.getService(this, 1, stop, piFlags);
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(getApplicationInfo().icon)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .addAction(0, "Terminer la sortie", stopPi);
            if (openPi != null) b.setContentIntent(openPi);
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, n);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void startLocation() {
        if (listening) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopTracking();
            return;
        }
        count = LfTrackStore.count(this);
        try {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, Looper.getMainLooper());
            listening = true;
        } catch (SecurityException e) {
            stopTracking();
            return;
        } catch (Exception e) {
            // GPS absent : on reste en premier plan, rien à enregistrer
        }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LiteFoil:track");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(12L * 60 * 60 * 1000); // au plus 12 h
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onLocationChanged(Location l) {
        try {
            JSONObject p = new JSONObject();
            p.put("i", count);
            p.put("lat", l.getLatitude());
            p.put("lon", l.getLongitude());
            p.put("acc", l.hasAccuracy() ? (double) l.getAccuracy() : JSONObject.NULL);
            p.put("alt", l.hasAltitude() ? l.getAltitude() : JSONObject.NULL);
            p.put("spd", l.hasSpeed() ? (double) l.getSpeed() : JSONObject.NULL);
            p.put("brg", l.hasBearing() ? (double) l.getBearing() : JSONObject.NULL);
            p.put("t", l.getTime());
            LfTrackStore.append(this, p);
            count++;
            Listener li = listener;
            if (li != null) li.onPoint(p);
        } catch (Exception ignored) {}
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Appli balayée : on continue l'enregistrement (rien à faire).
        super.onTaskRemoved(rootIntent);
    }

    private void release() {
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignored) {}
        listening = false;
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        wakeLock = null;
    }

    private void stopTracking() {
        LfTrackStore.setRunning(this, false);
        release();
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        } catch (Exception ignored) {}
        stopSelf();
        Listener li = listener;
        if (li != null) li.onStopped();
    }

    @Override
    public void onDestroy() {
        release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
