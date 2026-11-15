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
 * Lite Foil : appel entrant façon téléphone (15/11/2026).
 * Le serveur envoie un message « données » (type=call) ; on affiche un écran d'appel plein écran,
 * même téléphone verrouillé, avec une sonnerie qui tourne en boucle jusqu'à Décrocher / Refuser
 * (ou 45 s). Le choix est gardé ici et lu par la page (module LfCall) à l'ouverture de l'appli.
 */
public final class LfCall {
    static final String CHANNEL = "lf_incoming_call";
    static final int NOTIF_ID = 7711;
    static final String PREFS = "lf_call";
    static final String ACTION_ANSWER = "fr.litefoil.tracker.CALL_ANSWER";
    static final String ACTION_DECLINE = "fr.litefoil.tracker.CALL_DECLINE";
    static final long RING_MS = 45000;

    /** vrai quand l'appli est à l'écran : la page fait alors sonner elle-même */
    static volatile boolean appVisible = false;
    static WeakReference<LfCallActivity> screen = new WeakReference<>(null);

    private LfCall() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Appel entrant reçu du serveur. */
    static void incoming(Context ctx, Map<String, String> d) {
        String peer = d.get("peer"), mid = d.get("mid");
        if (peer == null || mid == null || appVisible) return;
        long sent = 0;
        try { sent = Long.parseLong(String.valueOf(d.get("t"))); } catch (Exception e) { /* pas d'heure : on sonne */ }
        long now = System.currentTimeMillis();
        if (sent > 0 && now - sent > 55000) return;   // message arrivé trop tard : l'appel est fini
        String name = d.get("pseudo") == null ? "Rider" : d.get("pseudo");
        boolean video = "v".equals(d.get("k"));
        prefs(ctx).edit().putString("peer", peer).putString("mid", mid).putString("name", name)
            .putString("k", video ? "v" : "a").putString("act", "").putLong("t", now).apply();

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Uri ring = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.lf_ring);
        long[] vib = new long[] { 0, 900, 700, 900, 700 };
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Appels entrants", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Écran d'appel et sonnerie des appels audio et vidéo");
            ch.setSound(ring, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            ch.setVibrationPattern(vib);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent full = new Intent(ctx, LfCallActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullPI = PendingIntent.getActivity(ctx, 1, full, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        PendingIntent ansPI = PendingIntent.getActivity(ctx, 2, answerIntent(ctx), PendingIntent.FLAG_UPDATE_CURRENT | imm);
        PendingIntent decPI = PendingIntent.getBroadcast(ctx, 3,
            new Intent(ctx, LfCallReceiver.class).setAction(ACTION_DECLINE), PendingIntent.FLAG_UPDATE_CURRENT | imm);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(name)
            .setContentText(video ? "Appel vidéo Lite Foil" : "Appel audio Lite Foil")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(false)
            .setColor(0xFF12B5A6)
            .setTimeoutAfter(RING_MS)
            .setContentIntent(fullPI)
            .setFullScreenIntent(fullPI, true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", decPI)
            .addAction(android.R.drawable.sym_action_call, "Décrocher", ansPI);
        if (Build.VERSION.SDK_INT < 26) { b.setSound(ring, AudioManager.STREAM_RING); b.setVibrate(vib); }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;   // la sonnerie tourne en boucle tant que la notification est là
        try { nm.notify(NOTIF_ID, n); } catch (Exception e) { /* notifications refusées */ }
    }

    static Intent answerIntent(Context ctx) {
        return new Intent(ctx, MainActivity.class).setAction(ACTION_ANSWER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    }

    /** Fin de sonnerie : choix fait, appel annulé par l'appelant, ou appli ouverte. act = "answer", "decline" ou null. */
    static void stop(Context ctx, String act) {
        if (act != null) prefs(ctx).edit().putString("act", act).putLong("ta", System.currentTimeMillis()).apply();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);
        final LfCallActivity a = screen.get();
        if (a != null) a.runOnUiThread(new Runnable() { @Override public void run() { if (!a.isFinishing()) a.finish(); } });
    }

    /** L'appelant a raccroché (ou l'appel a été pris ailleurs) : on arrête de sonner si c'est bien cet appel. */
    static void ended(Context ctx, String mid) {
        String cur = prefs(ctx).getString("mid", "");
        if (mid == null || mid.equals(cur)) stop(ctx, null);
    }
}
