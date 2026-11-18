package fr.litefoil.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import java.lang.ref.WeakReference;
import java.util.Map;

/**
 * Lite Foil : alerte SOS d'un proche (18/11/2026).
 * Le serveur envoie, en plus de la notification habituelle, un message « données » (type=sos ou safety, native=1).
 * On affiche un écran rouge plein écran, même téléphone verrouillé, et la sonnerie SOS tourne en boucle sur le
 * volume « alarme » : elle s'entend donc aussi quand le téléphone est en silencieux ou en vibreur.
 * Elle s'arrête au bout de 90 s, ou dès que le proche touche « Arrêter la sonnerie » ou « Voir sa position ».
 */
public final class LfSos {
    static final String CHANNEL = "lf_sos_alarm";
    static final int NOTIF_ID = 7712;
    static final String PREFS = "lf_sos";
    static final String ACTION_STOP = "fr.litefoil.tracker.SOS_STOP";
    static final String LIVE_URL = "https://litefoil-communaute-222fd.web.app/l/";
    static final long RING_MS = 90000;

    static WeakReference<LfSosActivity> screen = new WeakReference<>(null);

    private LfSos() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Alerte reçue du serveur. */
    static void incoming(Context ctx, Map<String, String> d) {
        String title = d.get("title") == null ? "SOS" : d.get("title");
        String body = d.get("body") == null ? "" : d.get("body");
        String live = d.get("live") == null ? "" : d.get("live").replaceAll("[^A-Za-z0-9_-]", "");
        long now = System.currentTimeMillis();
        prefs(ctx).edit().putString("title", title).putString("body", body).putString("live", live).putLong("t", now).apply();

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Uri ring = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.lf_sos);
        long[] vib = new long[] { 0, 1200, 400, 1200, 400, 1200, 900 };
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alerte SOS (sonnerie forte)", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("SOS d'un proche : écran d'alerte et sonnerie sur le volume alarme, même en silencieux");
            // volume « alarme » : s'entend en silencieux et passe le mode Ne pas déranger quand les alarmes y sont autorisées
            ch.setSound(ring, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            ch.setVibrationPattern(vib);
            ch.enableLights(true);
            ch.setLightColor(0xFFE8384F);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.setBypassDnd(true);   // pris en compte seulement si le membre l'autorise dans les réglages du téléphone
            nm.createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent full = new Intent(ctx, LfSosActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullPI = PendingIntent.getActivity(ctx, 11, full, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        PendingIntent stopPI = PendingIntent.getBroadcast(ctx, 12,
            new Intent(ctx, LfCallReceiver.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | imm);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(false)
            .setColor(0xFFE8384F)
            .setTimeoutAfter(RING_MS)
            .setContentIntent(fullPI)
            .setFullScreenIntent(fullPI, true)
            .addAction(android.R.drawable.ic_lock_silent_mode, "Arrêter la sonnerie", stopPI);
        if (Build.VERSION.SDK_INT < 26) { b.setSound(ring, AudioManager.STREAM_ALARM); b.setVibrate(vib); }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;   // la sonnerie tourne en boucle tant que la notification est là
        try { nm.notify(NOTIF_ID, n); } catch (Exception e) { /* notifications refusées : la notification habituelle reste */ }
    }

    /** Ce qu'on ouvre pour voir l'alerte : la page de suivi en direct si on la connaît, sinon l'appli. */
    static Intent openIntent(Context ctx) {
        String live = prefs(ctx).getString("live", "");
        if (!"".equals(live)) return new Intent(Intent.ACTION_VIEW, Uri.parse(LIVE_URL + live)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return new Intent(ctx, MainActivity.class).setAction(Intent.ACTION_MAIN)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    }

    /** Fin de sonnerie : bouton, délai écoulé, ou appli ouverte. */
    static void stop(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);
        final LfSosActivity a = screen.get();
        if (a != null) a.runOnUiThread(new Runnable() { @Override public void run() { if (!a.isFinishing()) a.finish(); } });
    }
}
