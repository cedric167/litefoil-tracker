package fr.litefoil.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Lite Foil : liaison permanente avec la montre Lite Foil (carte ESP32, nom Bluetooth LITEFOIL-WATCH).
 *
 * Service de premier plan « appareil connecté » : il garde la connexion Bluetooth avec la montre choisie une fois
 * dans l'appli, se reconnecte tout seul dès qu'elle revient à portée, et continue appli fermée.
 * Quand le porteur maintient le bouton SOS de la montre, la montre augmente le compteur « sos= » de sa ligne d'état :
 * le service lance un compte à rebours de 10 s (annulable sur la montre ou dans la notification), puis envoie le SOS
 * au serveur Lite Foil avec les identifiants préparés par la page (LfWatchLink.setSos), comme le font l'Apple Watch
 * et la montre Wear OS. La position vient du GPS de la montre, sinon de la dernière position connue du téléphone.
 */
public class LfWatchLinkService extends Service {
    static final String PREFS = "lf_watch_link";
    static final String CHANNEL = "lf_watch_link", CHANNEL_SOS = "lf_watch_link_sos";
    static final int NOTIF_ID = 7731, NOTIF_SOS = 7732;
    static final String ACTION_CANCEL = "fr.litefoil.tracker.WATCH_SOS_CANCEL";
    static final String ACTION_FALSE = "fr.litefoil.tracker.WATCH_SOS_FALSE";
    static final String ACTION_STOP = "fr.litefoil.tracker.WATCH_LINK_STOP";

    static final UUID SVC = UUID.fromString("4fafc203-1fb5-459e-8fcc-c5c9c331914b");
    static final UUID CH_STATUS = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26c1");
    static final UUID CH_CONTROL = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26c2");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    // état du SOS : 0 rien, 1 compte à rebours, 2 envoi, 3 alerte en cours
    static final int IDLE = 0, COUNT = 1, SENDING = 2, ACTIVE = 3;
    static final int COUNT_S = 10;

    static volatile boolean alive = false, connected = false;
    static volatile int sosState = IDLE;

    private final Handler h = new Handler(Looper.getMainLooper());
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic chStatus, chControl;
    private long sosBase = -1, sosxBase = -1;
    private int left = 0;
    private double wLat = 0, wLon = 0; private long wPosT = 0;
    private long activeSince = 0;

    // les opérations Bluetooth se font une par une
    private final ArrayDeque<Runnable> ops = new ArrayDeque<>();
    private boolean opBusy = false;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void start(Context c) {
        if (prefs(c).getString("mac", "").length() == 0) return;
        try { ContextCompat.startForegroundService(c, new Intent(c, LfWatchLinkService.class)); } catch (Exception ignored) {}
    }

    static void stop(Context c) {
        try { c.stopService(new Intent(c, LfWatchLinkService.class)); } catch (Exception ignored) {}
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        alive = true;
        if (!foreground()) { stopSelf(); return START_NOT_STICKY; }
        String a = intent == null ? null : intent.getAction();
        if (ACTION_CANCEL.equals(a)) { cancelCount(true); return START_STICKY; }
        if (ACTION_FALSE.equals(a)) { falseAlarm(); return START_STICKY; }
        if (ACTION_STOP.equals(a)) { stopSelf(); return START_NOT_STICKY; }
        if (prefs(this).getString("mac", "").length() == 0) { stopSelf(); return START_NOT_STICKY; }
        if (gatt == null) connect();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        alive = false; connected = false;
        h.removeCallbacksAndMessages(null);
        closeGatt();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ notifications
    private NotificationManager nm() { return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent action(String a, int code) {
        Intent i = new Intent(this, LfWatchLinkService.class).setAction(a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification linkNotif() {
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Montre Lite Foil")
            .setContentText(connected ? "Montre connectée · SOS de la montre actif" : "En attente de la montre…")
            .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp())
            .build();
    }

    private boolean foreground() {
        try {
            NotificationManager nm = nm();
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                if (nm.getNotificationChannel(CHANNEL) == null) {
                    NotificationChannel ch = new NotificationChannel(CHANNEL, "Liaison avec la montre Lite Foil", NotificationManager.IMPORTANCE_LOW);
                    ch.setDescription("Garde la montre Lite Foil connectée, même appli fermée");
                    ch.setShowBadge(false);
                    nm.createNotificationChannel(ch);
                }
                if (nm.getNotificationChannel(CHANNEL_SOS) == null) {
                    NotificationChannel ch = new NotificationChannel(CHANNEL_SOS, "SOS lancé depuis la montre", NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Compte à rebours et envoi du SOS demandé sur la montre Lite Foil");
                    ch.enableVibration(true);
                    ch.setVibrationPattern(new long[] { 0, 600, 250, 600 });
                    nm.createNotificationChannel(ch);
                }
            }
            Notification n = linkNotif();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(NOTIF_ID, n);
            return true;
        } catch (Exception e) {
            return false;   // Bluetooth refusé ou service de premier plan interdit à cet instant
        }
    }

    private void refreshLinkNotif() {
        try { NotificationManager nm = nm(); if (nm != null && alive) nm.notify(NOTIF_ID, linkNotif()); } catch (Exception ignored) {}
    }

    private void sosNotif(String title, String text, String actionLabel, String actionName, boolean ongoing) {
        try {
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_SOS)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title).setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(ongoing).setOnlyAlertOnce(true).setAutoCancel(!ongoing)
                .setContentIntent(openApp());
            if (actionLabel != null) b.addAction(0, actionLabel, action(actionName, actionName.hashCode() & 0xFFFF));
            NotificationManager nm = nm(); if (nm != null) nm.notify(NOTIF_SOS, b.build());
        } catch (Exception ignored) {}
    }

    private void clearSosNotif() { try { NotificationManager nm = nm(); if (nm != null) nm.cancel(NOTIF_SOS); } catch (Exception ignored) {} }

    // ------------------------------------------------------------------ Bluetooth
    private boolean canBt() {
        return Build.VERSION.SDK_INT < 31 || ContextCompat.checkSelfPermission(this, "android.permission.BLUETOOTH_CONNECT") == PackageManager.PERMISSION_GRANTED;
    }

    private final Runnable reconnect = new Runnable() { @Override public void run() { if (alive && gatt == null) connect(); } };

    private void connect() {
        h.removeCallbacks(reconnect);
        try {
            String mac = prefs(this).getString("mac", "");
            BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
            if (mac.length() == 0 || ad == null || !ad.isEnabled() || !canBt() || !BluetoothAdapter.checkBluetoothAddress(mac)) { h.postDelayed(reconnect, 30000); return; }
            BluetoothDevice d = ad.getRemoteDevice(mac);
            // autoConnect = vrai : Android se reconnecte seul dès que la montre revient à portée, sans rien consommer entre-temps
            gatt = Build.VERSION.SDK_INT >= 23 ? d.connectGatt(this, true, cb, BluetoothDevice.TRANSPORT_LE) : d.connectGatt(this, true, cb);
            if (gatt == null) h.postDelayed(reconnect, 30000);
        } catch (SecurityException e) { h.postDelayed(reconnect, 60000);
        } catch (Exception e) { h.postDelayed(reconnect, 30000); }
    }

    private void closeGatt() {
        try { if (gatt != null) { gatt.disconnect(); gatt.close(); } } catch (Exception ignored) {}
        gatt = null; chStatus = null; chControl = null; connected = false;
        synchronized (ops) { ops.clear(); opBusy = false; }
    }

    private void enqueue(Runnable r) { synchronized (ops) { ops.add(r); } pump(); }

    private final Runnable opTimeout = new Runnable() { @Override public void run() { opDone(); } };

    private void pump() {
        Runnable r;
        synchronized (ops) { if (opBusy || ops.isEmpty()) return; opBusy = true; r = ops.poll(); }
        h.removeCallbacks(opTimeout); h.postDelayed(opTimeout, 4000);
        try { r.run(); } catch (Exception e) { opDone(); }
    }

    private void opDone() { h.removeCallbacks(opTimeout); synchronized (ops) { opBusy = false; } pump(); }

    @SuppressWarnings("deprecation")
    private void send(final String text) {
        enqueue(new Runnable() { @Override public void run() {
            BluetoothGatt g = gatt; BluetoothGattCharacteristic c = chControl;
            if (g == null || c == null || !connected) { opDone(); return; }
            try {
                byte[] v = text.getBytes(StandardCharsets.UTF_8);
                boolean ok;
                if (Build.VERSION.SDK_INT >= 33) ok = g.writeCharacteristic(c, v, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == 0;
                else { c.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT); c.setValue(v); ok = g.writeCharacteristic(c); }
                if (!ok) opDone();
            } catch (SecurityException e) { opDone(); }
        } });
    }

    @SuppressWarnings("deprecation")
    private void readStatus() {
        enqueue(new Runnable() { @Override public void run() {
            BluetoothGatt g = gatt; BluetoothGattCharacteristic c = chStatus;
            if (g == null || c == null || !connected) { opDone(); return; }
            try { if (!g.readCharacteristic(c)) opDone(); } catch (SecurityException e) { opDone(); }
        } });
    }

    private final BluetoothGattCallback cb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(final BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connected = true; sosBase = -1; sosxBase = -1;
                h.post(new Runnable() { @Override public void run() { refreshLinkNotif(); } });
                try { if (Build.VERSION.SDK_INT < 21 || !g.requestMtu(247)) g.discoverServices(); } catch (SecurityException ignored) {}
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connected = false; chStatus = null; chControl = null;
                synchronized (ops) { ops.clear(); opBusy = false; }
                h.post(new Runnable() { @Override public void run() {
                    refreshLinkNotif();
                    if (sosState == COUNT) cancelCount(false);   // la montre est partie pendant le compte à rebours : on n'envoie rien
                    // erreur de liaison (133…) : on repart d'une connexion neuve ; sinon Android se reconnecte seul (autoConnect)
                    if (status != BluetoothGatt.GATT_SUCCESS && status != 8 && status != 19) { closeGatt(); h.postDelayed(reconnect, 5000); }
                } });
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
            try { g.discoverServices(); } catch (SecurityException ignored) {}
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onServicesDiscovered(final BluetoothGatt g, int status) {
            BluetoothGattService s = g.getService(SVC);
            if (s == null) return;
            chStatus = s.getCharacteristic(CH_STATUS); chControl = s.getCharacteristic(CH_CONTROL);
            if (chStatus == null) return;
            enqueue(new Runnable() { @Override public void run() {
                try {
                    g.setCharacteristicNotification(chStatus, true);
                    BluetoothGattDescriptor d = chStatus.getDescriptor(CCCD);
                    if (d == null) { opDone(); return; }
                    boolean ok;
                    if (Build.VERSION.SDK_INT >= 33) ok = g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == 0;
                    else { d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); ok = g.writeDescriptor(d); }
                    if (!ok) opDone();
                } catch (SecurityException e) { opDone(); }
            } });
            readStatus();
        }

        @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) { opDone(); }
        @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) { opDone(); }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            if (Build.VERSION.SDK_INT < 33 && status == BluetoothGatt.GATT_SUCCESS && CH_STATUS.equals(c.getUuid())) line(c.getValue());
            opDone();
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS && CH_STATUS.equals(c.getUuid())) line(value);
            opDone();
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            if (Build.VERSION.SDK_INT < 33 && CH_STATUS.equals(c.getUuid())) line(c.getValue());
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            if (CH_STATUS.equals(c.getUuid())) line(value);
        }
    };

    /** Une ligne d'état de la montre : fw=0.8.0;sos=1;sosx=0;la=…;lo=…;bat=…;…;free=120 */
    private void line(byte[] v) {
        if (v == null || v.length == 0) return;
        final String text = new String(v, StandardCharsets.UTF_8);
        h.post(new Runnable() { @Override public void run() { handle(text); } });
    }

    private long lastRead = 0;

    private void handle(String text) {
        if (!text.contains("free=")) {   // ligne coupée par la taille des paquets : on relit la valeur entière
            long now = System.currentTimeMillis();
            if (now - lastRead > 800) { lastRead = now; readStatus(); }
            if (!text.contains("sosx=") || text.endsWith("sosx=")) return;
        }
        Map<String, String> m = new HashMap<>();
        for (String p : text.split(";")) { int i = p.indexOf('='); if (i > 0) m.put(p.substring(0, i), p.substring(i + 1)); }
        try {
            if (m.containsKey("la") && m.containsKey("lo")) { wLat = Double.parseDouble(m.get("la")); wLon = Double.parseDouble(m.get("lo")); wPosT = System.currentTimeMillis(); }
        } catch (Exception ignored) {}
        long sos = num(m.get("sos")), sosx = num(m.get("sosx"));
        if (sos >= 0) { if (sosBase < 0) sosBase = sos; else if (sos > sosBase) { sosBase = sos; request(); } else if (sos < sosBase) sosBase = sos; }
        if (sosx >= 0) { if (sosxBase < 0) sosxBase = sosx; else if (sosx > sosxBase) { sosxBase = sosx; if (sosState == COUNT) cancelCount(false); } else if (sosx < sosxBase) sosxBase = sosx; }
    }

    private static long num(String s) { try { return s == null ? -1 : Long.parseLong(s.trim()); } catch (Exception e) { return -1; } }

    // ------------------------------------------------------------------ SOS
    private boolean ready() { SharedPreferences p = prefs(this); return p.getString("api", "").startsWith("https://") && p.getString("k", "").length() > 0; }

    /** Le porteur a maintenu le bouton SOS de la montre. */
    private void request() {
        if (sosState != IDLE) { if (sosState == ACTIVE) send("sos=sent"); return; }
        if (!ready()) {
            send("sos=cancel");
            sosNotif("SOS de la montre pas encore prêt", "Ouvre l'appli Lite Foil et connecte-toi à ton compte : le SOS de la montre s'active tout seul.", null, null, false);
            return;
        }
        sosState = COUNT; left = COUNT_S;
        send("sos=wait:" + COUNT_S);
        h.removeCallbacks(tick); tick.run();
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (sosState != COUNT) return;
            if (left <= 0) { fire(); return; }
            sosNotif("SOS demandé depuis la montre", "Envoi à tes gardiens dans " + left + " s. Touche « Annuler » si c'est une erreur.", "Annuler", ACTION_CANCEL, true);
            left--;
            h.postDelayed(this, 1000);
        }
    };

    private void cancelCount(boolean tellWatch) {
        if (sosState != COUNT) return;
        sosState = IDLE; h.removeCallbacks(tick);
        if (tellWatch) send("sos=cancel");
        clearSosNotif();
    }

    private Location phoneLoc() {
        try {
            if (ContextCompat.checkSelfPermission(this, "android.permission.ACCESS_FINE_LOCATION") != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, "android.permission.ACCESS_COARSE_LOCATION") != PackageManager.PERMISSION_GRANTED) return null;
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;
            Location best = null;
            for (String p : lm.getProviders(true)) { Location l = lm.getLastKnownLocation(p); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; }
            return best;
        } catch (Exception e) { return null; }
    }

    private JSONObject body(String status) throws Exception {
        JSONObject b = new JSONObject();
        b.put("k", prefs(this).getString("k", ""));
        if (status != null) b.put("status", status);
        long now = System.currentTimeMillis();
        double lat = 0, lon = 0; boolean has = false;
        if (wPosT > 0 && now - wPosT < 120000) { lat = wLat; lon = wLon; has = true; }   // GPS de la montre, récent
        else { Location l = phoneLoc(); if (l != null) { lat = l.getLatitude(); lon = l.getLongitude(); has = true; } }
        if (has) { JSONObject p = new JSONObject(); p.put("lat", lat); p.put("lng", lon); p.put("t", now); p.put("spd", 0); b.put("pts", new JSONArray().put(p)); }
        return b;
    }

    private boolean post(String status) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(prefs(this).getString("api", "")).openConnection();
            c.setRequestMethod("POST"); c.setConnectTimeout(15000); c.setReadTimeout(15000);
            c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json");
            OutputStream o = c.getOutputStream(); o.write(body(status).toString().getBytes(StandardCharsets.UTF_8)); o.close();
            return c.getResponseCode() == 200;
        } catch (Exception e) { return false;
        } finally { if (c != null) c.disconnect(); }
    }

    private void fire() {
        sosState = SENDING;
        sosNotif("Envoi du SOS…", "Le téléphone prévient tes gardiens.", null, null, true);
        new Thread(new Runnable() { @Override public void run() {
            boolean ok = false;
            for (int i = 0; i < 4 && !ok && sosState == SENDING; i++) { ok = post("sos"); if (!ok) { try { Thread.sleep(4000); } catch (InterruptedException ignored) {} } }
            final boolean sent = ok;
            h.post(new Runnable() { @Override public void run() {
                if (sosState != SENDING) return;
                if (sent) {
                    sosState = ACTIVE; activeSince = System.currentTimeMillis();
                    send("sos=sent");
                    sosNotif("SOS envoyé", "Tes gardiens sont prévenus avec ta position. Si tout va bien, touche « Fausse alerte ».", "Fausse alerte", ACTION_FALSE, true);
                    h.removeCallbacks(loop); h.postDelayed(loop, 15000);
                } else {
                    sosState = IDLE; send("sos=cancel");
                    sosNotif("SOS non envoyé", "Pas de connexion internet sur le téléphone. Appelle le 112 (ou le 196 en mer).", null, null, false);
                }
            } });
        } }).start();
    }

    // pendant l'alerte : la position continue d'être envoyée (2 heures au plus)
    private final Runnable loop = new Runnable() {
        @Override
        public void run() {
            if (sosState != ACTIVE) return;
            if (System.currentTimeMillis() - activeSince > 2 * 3600000L) return;
            new Thread(new Runnable() { @Override public void run() { post(null); } }).start();
            h.postDelayed(this, 15000);
        }
    };

    private void falseAlarm() {
        if (sosState != ACTIVE && sosState != SENDING) { clearSosNotif(); return; }
        sosState = IDLE; h.removeCallbacks(loop);
        new Thread(new Runnable() { @Override public void run() { post("ok"); } }).start();
        send("sos=cancel");
        clearSosNotif();
    }
}
