package fr.litefoil.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Lite Foil : appel en cours (20/11/2026).
 * Service de premier plan « microphone » : le micro reste actif quand on quitte l'appli pendant un appel
 * (sans lui, Android coupe le micro d'une appli qui n'est plus à l'écran). Il règle aussi la sortie du son :
 * écouteur (ou casque / Bluetooth s'il y en a un) ou haut-parleur, et éteint l'écran contre l'oreille.
 */
public class LfCallService extends Service {
    static final String CHANNEL = "lf_call_live";
    static final int NOTIF_ID = 7712;
    static final String X_SPEAKER = "speaker", X_VIDEO = "video", X_NAME = "name", X_ROUTE = "route";

    private PowerManager.WakeLock prox;
    private boolean routed = false;

    /** Démarre ou met à jour la session d'appel. À appeler appli à l'écran, micro déjà autorisé. */
    static void start(Context c, boolean speaker, boolean video, String name, boolean route) {
        Intent i = new Intent(c, LfCallService.class).putExtra(X_SPEAKER, speaker).putExtra(X_VIDEO, video)
            .putExtra(X_NAME, name == null ? "" : name).putExtra(X_ROUTE, route);
        ContextCompat.startForegroundService(c, i);
    }

    static void stop(Context c) {
        try { c.stopService(new Intent(c, LfCallService.class)); } catch (Exception e) { /* déjà arrêté */ }
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean speaker = intent != null && intent.getBooleanExtra(X_SPEAKER, false);
        boolean video = intent != null && intent.getBooleanExtra(X_VIDEO, false);
        boolean route = intent == null || intent.getBooleanExtra(X_ROUTE, true);
        String name = intent == null ? "" : intent.getStringExtra(X_NAME);
        Notification n = notif(name, video);
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            // micro refusé ou démarrage interdit : l'appel continue appli à l'écran, sans arrière-plan
            try { startForeground(NOTIF_ID, n); } catch (Exception x) { stopSelf(); return START_NOT_STICKY; }
        }
        if (route) { route(speaker); routed = true; }
        proximity(!speaker && !video);
        return START_NOT_STICKY;
    }

    private Notification notif(String name, boolean video) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Appel en cours", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Affichée pendant un appel audio ou vidéo");
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 4, open, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(name == null || name.isEmpty() ? "Appel Lite Foil en cours" : "En appel avec " + name)
            .setContentText(video ? "Appel vidéo · touche pour revenir à l'appel" : "Appel audio · touche pour revenir à l'appel")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true).setOnlyAlertOnce(true).setUsesChronometer(true)
            .setColor(0xFF12B5A6)
            .setContentIntent(pi)
            .build();
    }

    /** Sortie du son : haut-parleur, sinon casque filaire / Bluetooth s'il est branché, sinon écouteur. */
    private void route(boolean speaker) {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo spk = null, ear = null, head = null;
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    int t = d.getType();
                    if (t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) spk = d;
                    else if (t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) ear = d;
                    else if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                        || t == AudioDeviceInfo.TYPE_USB_HEADSET || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                        || t == AudioDeviceInfo.TYPE_BLE_HEADSET) head = d;
                }
                AudioDeviceInfo target = speaker ? spk : (head != null ? head : ear);
                if (target != null) am.setCommunicationDevice(target); else am.clearCommunicationDevice();
            } else {
                am.setSpeakerphoneOn(speaker);
            }
        } catch (Exception e) { /* réglage refusé par le téléphone : on garde la sortie par défaut */ }
    }

    /** Écran éteint quand le téléphone est contre l'oreille (appel audio sur l'écouteur). */
    private void proximity(boolean on) {
        try {
            if (on) {
                if (prox == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null && pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK))
                        prox = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "litefoil:call");
                }
                if (prox != null && !prox.isHeld()) prox.acquire(4 * 60 * 60 * 1000L);
            } else if (prox != null && prox.isHeld()) {
                prox.release();
            }
        } catch (Exception e) { /* pas de capteur de proximité */ }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        proximity(false);
        if (routed) {
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice(); else am.setSpeakerphoneOn(false);
                    am.setMode(AudioManager.MODE_NORMAL);
                }
            } catch (Exception e) { /* rien à remettre */ }
        }
        super.onDestroy();
    }

    /** Vrai si le micro est autorisé : sans lui, le service « microphone » ne peut pas démarrer (Android 14+). */
    static boolean micGranted(Context c) {
        return ContextCompat.checkSelfPermission(c, android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }
}
