package fr.litefoil.wear;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Lite Foil sur montre Android (Wear OS). Version 2 du 19/11/2026.
 * Départ : le sport et le bouton GO. Pendant la sortie : les écrans composés dans l'appli téléphone (« Ma montre »),
 * puis une page de commandes (verrouiller, pause, fin). À la fin : confirmation, puis résumé de la sortie.
 * Le petit bouton SOS est sur tous les écrans : il ouvre le gros bouton à maintenir 2 secondes.
 * Tout est mesuré par la montre (GPS, cardio). La montre est liée une fois par un code à 6 caractères tapé dans
 * l'appli ; elle parle ensuite directement au serveur Lite Foil (réglages et SOS), sans le téléphone.
 */
public class MainActivity extends Activity implements LocationListener, SensorEventListener {
    static final String BASE = "https://litefoil-communaute-222fd.web.app";
    static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT, WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;
    static final String[] SPORTS = { "eFoil", "Wingfoil", "Pumpfoil", "Surf foil", "Windfoil", "Downwind", "Kitesurf", "Windsurf", "Wakeboard", "Surf", "Paddle", "Voile", "Course", "Vélo", "Marche", "Ski" };
    static final double FOIL_ON = 12.0, FOIL_OFF = 9.0;   // km/h : un « run » commence au-dessus de 12, finit sous 9
    static final int C_BG1 = 0xFF0F3A5C, C_BG2 = 0xFF04141D, C_ACC = 0xFF5FD0E6, C_MUTE = 0xFF8FB4C6, C_RED = 0xFFE8384F, C_GO = 0xFF2FD3C3;

    // vues : 0 départ, 1 choix du sport, 2 sortie en cours, 3 confirmation de fin, 4 résumé, 5 SOS
    static final int V_HOME = 0, V_SPORTS = 1, V_RUN = 2, V_CONFIRM = 3, V_SUMMARY = 4, V_SOS = 5;

    private SharedPreferences sp;
    private final Handler h = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private GestureDetector gesture;
    private boolean resumed = false, round = false;
    private int view = V_HOME, backView = V_HOME, page = 0;

    // réglages reçus de l'appli téléphone
    private String[][] screens = new String[][] { { "dur", "dist", "avg", "max" }, { "rdist", "rdur", "ravg", "rmax" }, { "spd" } };
    private String[][] tops = new String[][] { { "run", "hr" }, { "run", "clock" }, { "", "" } };
    private JSONObject labels = new JSONObject(), units = new JSONObject();
    private String api = "", key = "", channel = "", emergency = "112";
    private int contacts = 0;
    private String sport = "eFoil";

    // sortie mesurée par la montre
    private boolean running = false, paused = false, locked = false;
    private long runMs = 0, moveMs = 0, lastTick = 0, startWall = 0;
    private double distM = 0, maxKmh = 0, curKmh = 0;
    private Location anchor = null, fix = null;
    private boolean gpsOn = false;
    // runs sur le foil
    private boolean onFoil = false;
    private int foilUp = 0, foilDown = 0, runCount = 0;
    private long foilMs = 0, runStartMs = 0, longRunMs = 0;
    private double foilDistM = 0, runStartDist = 0, runMaxKmh = 0, longRunDistM = 0;
    // cardio
    private boolean hrOn = false;
    private int hrNow = 0, hrMax = 0, hrN = 0;
    private long hrSum = 0;

    private int pendingAction = 0;   // 1 = démarrer la sortie, 2 = SOS, après la demande d'accord
    private final List<Object[]> cells = new ArrayList<>();
    private TextView elapsedView, clockView;

    // SOS : 0 prêt, 1 envoi, 2 actif, 3 échec
    private int sosPhase = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("lf", Context.MODE_PRIVATE);
        round = getResources().getConfiguration().isScreenRound();
        sport = sp.getString("sport", "eFoil");
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        setContentView(root);
        gesture = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onFling(MotionEvent a, MotionEvent c, float vx, float vy) {
                if (locked || view != V_RUN) return false;
                if (Math.abs(vx) < Math.abs(vy) * 1.3f || Math.abs(vx) < 350) return false;
                int np = page + (vx < 0 ? 1 : -1);
                if (np < 0 || np > screens.length) return false;   // la dernière page est celle des commandes
                page = np; render();
                return true;
            }
        });
        loadCfg();
        if (sp.getBoolean("sosOn", false) && api.length() > 0) { sosPhase = 2; view = V_SOS; startGps(); h.postDelayed(sosLoop, 10000); }
        render();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        try { gesture.onTouchEvent(e); } catch (Exception x) { /* geste ignoré */ }
        return super.dispatchTouchEvent(e);
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        h.removeCallbacks(tick); h.post(tick);
        if (channel.length() > 0) refresh(); else { h.removeCallbacks(pairPoll); h.postDelayed(pairPoll, 1500); }
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        h.removeCallbacks(pairPoll);
        if (!running) h.removeCallbacks(tick);
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        stopGps(); stopHr();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (locked) return;
        if (view == V_SPORTS || view == V_CONFIRM) { view = running ? V_RUN : V_HOME; render(); return; }
        if (view == V_SOS && sosPhase != 1 && sosPhase != 2) { view = backView; render(); return; }
        if (view == V_SUMMARY) { view = V_HOME; render(); return; }
        if (view == V_RUN) return;   // pendant la sortie, on ne quitte pas par erreur
        super.onBackPressed();
    }

    // ---------- réglages ----------
    private boolean linked() { return sp.getString("cfg", "").length() > 0; }

    private void loadCfg() {
        try {
            String s = sp.getString("cfg", "");
            if (s.length() == 0) return;
            JSONObject c = new JSONObject(s);
            channel = c.optString("ch", "");
            api = c.optString("api", ""); key = c.optString("k", "");
            emergency = c.optString("em", "112"); if (emergency.length() == 0) emergency = "112";
            contacts = c.optInt("n", 0);
            JSONObject lb = c.optJSONObject("lb"); if (lb != null) labels = lb;
            JSONObject un = c.optJSONObject("un"); if (un != null) units = un;
            List<String[]> outM = new ArrayList<>(), outT = new ArrayList<>();
            JSONArray a2 = c.optJSONArray("scr2");
            if (a2 != null && a2.length() > 0) {
                for (int i = 0; i < a2.length() && outM.size() < 6; i++) {
                    JSONObject o = a2.optJSONObject(i);
                    JSONArray m = o == null ? null : o.optJSONArray("m");
                    if (m == null || m.length() == 0) continue;
                    int n = Math.min(4, m.length());
                    String[] row = new String[n];
                    for (int j = 0; j < n; j++) row[j] = m.optString(j, "dur");
                    JSONArray t = o.optJSONArray("t");
                    outM.add(row);
                    outT.add(new String[] { t == null ? "" : t.optString(0, ""), t == null ? "" : t.optString(1, "") });
                }
            } else {
                JSONArray a = c.optJSONArray("scr");
                for (int i = 0; a != null && i < a.length() && outM.size() < 6; i++) {
                    JSONArray r = a.optJSONArray(i);
                    if (r == null || r.length() == 0) continue;
                    int n = Math.min(4, r.length());
                    String[] row = new String[n];
                    for (int j = 0; j < n; j++) row[j] = r.optString(j, "dur");
                    outM.add(row); outT.add(new String[] { "", "" });
                }
            }
            if (!outM.isEmpty()) { screens = outM.toArray(new String[0][]); tops = outT.toArray(new String[0][]); }
            if (page > screens.length) page = 0;
        } catch (Exception e) { /* réglages illisibles : on garde les écrans d'origine */ }
    }

    private void applyCfg(JSONObject c) {
        if (sosPhase == 1 || sosPhase == 2) return;   // pendant un SOS on ne touche à rien
        sp.edit().putString("cfg", c.toString()).apply();
        loadCfg();
        render();
    }

    private String pairCode() {
        String c = sp.getString("code", "");
        if (c.length() != 6) {
            String al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            SecureRandom r = new SecureRandom();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 6; i++) sb.append(al.charAt(r.nextInt(al.length())));
            c = sb.toString();
            sp.edit().putString("code", c).apply();
        }
        return c;
    }

    /** Tant que la montre n'est pas liée, elle demande au serveur si son code a été tapé dans l'appli. */
    private final Runnable pairPoll = new Runnable() {
        @Override
        public void run() {
            if (!resumed || linked()) return;
            final String code = pairCode();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    final JSONObject c = fetchCfg(code);
                    h.post(new Runnable() {
                        @Override
                        public void run() {
                            if (c != null && !linked()) { buzz(300); applyCfg(c); }
                            else if (resumed && !linked()) h.postDelayed(pairPoll, 3000);
                        }
                    });
                }
            }).start();
        }
    };

    private void refresh() {
        final String ch = channel;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final JSONObject c = fetchCfg(ch);
                if (c == null) return;
                h.post(new Runnable() {
                    @Override
                    public void run() { if (!running && !c.toString().equals(sp.getString("cfg", ""))) applyCfg(c); }
                });
            }
        }).start();
    }

    private static JSONObject fetchCfg(String id) {
        try {
            String r = http("GET", BASE + "/api/watch/" + id, null);
            if (r == null) return null;
            JSONObject o = new JSONObject(r);
            if (!o.optBoolean("ok", false)) return null;
            return o.optJSONObject("cfg");
        } catch (Exception e) { return null; }
    }

    private static String http(String method, String url, String body) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(15000); c.setReadTimeout(15000);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                OutputStream o = c.getOutputStream();
                o.write(body.getBytes(StandardCharsets.UTF_8));
                o.close();
            }
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[2048];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---------- capteurs de la montre : GPS et cardio ----------
    private boolean hasLoc() { return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED; }
    private boolean hasBody() { return checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED; }

    private void startGps() {
        if (gpsOn || !hasLoc()) return;
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0f, this, Looper.getMainLooper());
            gpsOn = true;
        } catch (SecurityException e) { /* accord retiré */ } catch (Exception e) { /* pas de GPS sur cette montre */ }
    }

    private void stopGps() {
        if (!gpsOn) return;
        try { LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE); if (lm != null) lm.removeUpdates(this); } catch (Exception e) { /* rien */ }
        gpsOn = false;
    }

    private void startHr() {
        if (hrOn || !hasBody()) return;
        try {
            SensorManager sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
            Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_HEART_RATE);
            if (s == null) return;
            sm.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL);
            hrOn = true;
        } catch (Exception e) { /* pas de capteur cardio */ }
    }

    private void stopHr() {
        if (!hrOn) return;
        try { SensorManager sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE); if (sm != null) sm.unregisterListener(this); } catch (Exception e) { /* rien */ }
        hrOn = false;
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e == null || e.sensor == null || e.sensor.getType() != Sensor.TYPE_HEART_RATE || e.values.length == 0) return;
        int v = Math.round(e.values[0]);
        if (v < 30 || v > 230) return;
        hrNow = v;
        if (running && !paused) { hrSum += v; hrN++; if (v > hrMax) hrMax = v; }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onLocationChanged(Location l) {
        if (l == null) return;
        boolean first = (fix == null);
        fix = l;
        float acc = l.hasAccuracy() ? l.getAccuracy() : 999f;
        if (running && !paused) {
            curKmh = l.hasSpeed() ? Math.max(0, l.getSpeed() * 3.6) : 0;
            if (acc <= 30f) {
                if (curKmh > maxKmh && curKmh < 150) maxKmh = curKmh;
                if (anchor == null) anchor = l;
                else { float d = anchor.distanceTo(l); if (d >= Math.max(4f, Math.min(12f, acc * 0.6f))) { distM += d; if (onFoil) foilDistM += d; anchor = l; } }
                foilStep();
            }
        }
        if (first && sosPhase == 2) post(null, null);
    }

    /** Un run commence après 3 mesures au-dessus de 12 km/h et finit après 3 mesures sous 9 km/h. */
    private void foilStep() {
        if (!onFoil) {
            foilUp = curKmh >= FOIL_ON ? foilUp + 1 : 0;
            if (foilUp >= 3) { onFoil = true; foilUp = 0; foilDown = 0; runCount++; runStartMs = runMs; runStartDist = distM; runMaxKmh = curKmh; buzz(40); }
        } else {
            if (curKmh > runMaxKmh && curKmh < 150) runMaxKmh = curKmh;
            foilDown = curKmh < FOIL_OFF ? foilDown + 1 : 0;
            if (foilDown >= 3) endFoilRun();
        }
    }

    private void endFoilRun() {
        if (!onFoil) return;
        onFoil = false; foilDown = 0; foilUp = 0;
        long d = runMs - runStartMs; double m = distM - runStartDist;
        if (d > longRunMs) longRunMs = d;
        if (m > longRunDistM) longRunDistM = m;
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        int a = pendingAction; pendingAction = 0;
        if (a == 1) { if (hasLoc()) startRun(); else render(); }
        else if (a == 2) fireSos();   // le SOS part même sans position
    }

    // ---------- sortie ----------
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = SystemClock.elapsedRealtime();
            if (running) {
                if (!paused) { long d = now - lastTick; runMs += d; if (curKmh >= 3) moveMs += d; if (onFoil) foilMs += d; }
                lastTick = now;
            }
            if (resumed) updateValues();
            if (resumed || running) h.postDelayed(this, 1000);
        }
    };

    private void startRun() {
        if (!hasLoc() || (!hasBody() && !sp.getBoolean("askedBody", false))) {
            sp.edit().putBoolean("askedBody", true).apply();
            pendingAction = 1;
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.BODY_SENSORS }, 1);
            return;
        }
        running = true; paused = false; locked = false;
        runMs = 0; moveMs = 0; distM = 0; maxKmh = 0; curKmh = 0; anchor = null;
        onFoil = false; foilUp = 0; foilDown = 0; runCount = 0; foilMs = 0; foilDistM = 0; longRunMs = 0; longRunDistM = 0; runMaxKmh = 0;
        hrSum = 0; hrN = 0; hrMax = 0;
        lastTick = SystemClock.elapsedRealtime(); startWall = System.currentTimeMillis();
        startGps(); startHr();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buzz(120);
        h.removeCallbacks(tick); h.post(tick);
        view = V_RUN; page = 0;
        render();
    }

    private void pauseRun(boolean on) {
        if (on) endFoilRun();
        paused = on; anchor = null; curKmh = 0;
        lastTick = SystemClock.elapsedRealtime();
        buzz(80);
        render();
    }

    private void stopRun(boolean keep) {
        endFoilRun();
        running = false; paused = false; locked = false; curKmh = 0;
        if (sosPhase != 2 && sosPhase != 1) stopGps();
        stopHr();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buzz(200);
        view = keep ? V_SUMMARY : V_HOME;
        render();
    }

    private String label(String k) {
        String d = k;
        if ("dur".equals(k)) d = "Durée"; else if ("dist".equals(k)) d = "Distance"; else if ("spd".equals(k)) d = "Vitesse";
        else if ("max".equals(k)) d = "Vitesse max"; else if ("avg".equals(k)) d = "Vitesse moy."; else if ("clock".equals(k)) d = "Heure";
        else if ("ravg".equals(k)) d = "Moy. du run"; else if ("rmax".equals(k)) d = "Max du run"; else if ("favg".equals(k)) d = "Moy. sur le foil";
        else if ("rdist".equals(k)) d = "Distance du run"; else if ("fdist".equals(k)) d = "Distance sur le foil";
        else if ("act".equals(k)) d = "Temps actif"; else if ("rdur".equals(k)) d = "Durée du run"; else if ("fdur".equals(k)) d = "Temps sur le foil";
        else if ("run".equals(k)) d = "Run n°"; else if ("runs".equals(k)) d = "Runs"; else if ("lrdur".equals(k) || "lrdist".equals(k)) d = "Plus long run";
        else if ("hr".equals(k)) d = "Cardio"; else if ("hravg".equals(k)) d = "Cardio moyen"; else if ("hrmax".equals(k)) d = "Cardio max";
        else if ("wbat".equals(k)) d = "Batterie montre";
        return labels.optString(k, d);
    }

    private static String clockOf(long ms) {
        long s = ms / 1000, hh = s / 3600, mm = (s % 3600) / 60, ss = s % 60;
        return hh > 0 ? String.format(Locale.FRANCE, "%d:%02d:%02d", hh, mm, ss) : String.format(Locale.FRANCE, "%d:%02d", mm, ss);
    }

    private static String num(double v, int dec) { return String.format(Locale.FRANCE, dec == 0 ? "%.0f" : dec == 1 ? "%.1f" : "%.2f", v); }

    private static String[] meters(double m) { return m >= 1000 ? new String[] { num(m / 1000.0, 2), "km" } : new String[] { num(m, 0), "m" }; }

    /** valeur et unité d'une info ; un tiret pour celles que seul le téléphone connaît */
    private String[] value(String k) {
        if ("clock".equals(k)) return new String[] { new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date()), "" };
        if ("dur".equals(k)) return new String[] { clockOf(runMs), "" };
        if ("act".equals(k)) return new String[] { clockOf(moveMs), "" };
        if ("fdur".equals(k)) return new String[] { clockOf(foilMs), "" };
        if ("rdur".equals(k)) return new String[] { onFoil ? clockOf(runMs - runStartMs) : "0:00", "" };
        if ("lrdur".equals(k)) return new String[] { clockOf(Math.max(longRunMs, onFoil ? runMs - runStartMs : 0)), "" };
        if ("dist".equals(k)) return new String[] { num(distM / 1000.0, 2), "km" };
        if ("fdist".equals(k)) return new String[] { num(foilDistM / 1000.0, 2), "km" };
        if ("rdist".equals(k)) return meters(onFoil ? distM - runStartDist : 0);
        if ("lrdist".equals(k)) return meters(Math.max(longRunDistM, onFoil ? distM - runStartDist : 0));
        if ("spd".equals(k)) return new String[] { num(curKmh, 1), "km/h" };
        if ("max".equals(k)) return new String[] { num(maxKmh, 1), "km/h" };
        if ("avg".equals(k)) return new String[] { num(runMs > 5000 ? distM / (runMs / 1000.0) * 3.6 : 0, 1), "km/h" };
        if ("favg".equals(k)) return new String[] { num(foilMs > 3000 ? foilDistM / (foilMs / 1000.0) * 3.6 : 0, 1), "km/h" };
        if ("rmax".equals(k)) return new String[] { num(onFoil ? runMaxKmh : 0, 1), "km/h" };
        if ("ravg".equals(k)) { long d = runMs - runStartMs; return new String[] { num(onFoil && d > 2000 ? (distM - runStartDist) / (d / 1000.0) * 3.6 : 0, 1), "km/h" }; }
        if ("run".equals(k) || "runs".equals(k)) return new String[] { String.valueOf(runCount), "" };
        if ("hr".equals(k)) return new String[] { hrNow > 0 ? String.valueOf(hrNow) : "—", "bpm" };
        if ("hravg".equals(k)) return new String[] { hrN > 0 ? String.valueOf(Math.round((double) hrSum / hrN)) : "—", "bpm" };
        if ("hrmax".equals(k)) return new String[] { hrMax > 0 ? String.valueOf(hrMax) : "—", "bpm" };
        if ("wbat".equals(k)) {
            int p = -1;
            try { Intent bi = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED)); if (bi != null) { int lv = bi.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = bi.getIntExtra(BatteryManager.EXTRA_SCALE, 100); if (lv >= 0 && sc > 0) p = lv * 100 / sc; } } catch (Exception e) { /* rien */ }
            return new String[] { p >= 0 ? String.valueOf(p) : "—", "%" };
        }
        return new String[] { "—", units.optString(k, "") };
    }

    /** petite info du haut : « Run 3 », « ♥ 145 », « 10:09 »… */
    private String topText(String k) {
        if (k == null || k.length() == 0) return "";
        String[] v = value(k);
        if ("run".equals(k)) return "Run " + v[0];
        if ("runs".equals(k)) return "Runs " + v[0];
        if ("hr".equals(k) || "hravg".equals(k) || "hrmax".equals(k)) return "♥ " + v[0];
        if ("clock".equals(k)) return v[0];
        if ("wbat".equals(k)) return "Montre " + v[0] + " %";
        if ("bat".equals(k)) return "eFoil " + v[0] + (v[0].equals("—") ? "" : " %");
        return v[0] + (v[1].length() > 0 ? " " + v[1] : "");
    }

    private void updateValues() {
        for (Object[] c : cells) {
            if (c[2] == null) { ((TextView) c[1]).setText(topText((String) c[0])); continue; }
            String[] v = value((String) c[0]);
            ((TextView) c[1]).setText(v[0]);
            ((TextView) c[2]).setText(v[1]);
        }
        if (elapsedView != null) {
            elapsedView.setText(paused ? "Pause  " + clockOf(runMs) : clockOf(runMs));
            elapsedView.setTextColor(paused ? 0xFFFFB347 : 0xFFFFD84A);
        }
        if (clockView != null) clockView.setText(new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date()));
    }

    // ---------- SOS ----------
    private void openSos() { if (view != V_SOS) backView = view; view = V_SOS; render(); }

    private void fireSos() {
        if (api.length() == 0 || key.length() == 0) { render(); return; }
        if (!hasLoc() && pendingAction == 0 && !sp.getBoolean("askedLoc", false)) {
            sp.edit().putBoolean("askedLoc", true).apply();
            pendingAction = 2; requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION }, 2); return;
        }
        sosPhase = 1; buzz(500); startGps(); render();
        post("sos", new Runnable() {
            @Override
            public void run() {
                // « ok » est noté par post() dans lastOk
                sosPhase = lastOk ? 2 : 3;
                if (lastOk) { sp.edit().putBoolean("sosOn", true).apply(); buzz(250); h.removeCallbacks(sosLoop); h.postDelayed(sosLoop, 10000); }
                else buzz(700);
                render();
            }
        });
    }

    private void cancelSos() {
        post("ok", null);
        sp.edit().putBoolean("sosOn", false).apply();
        h.removeCallbacks(sosLoop);
        sosPhase = 0;
        if (!running) stopGps();
        view = running ? V_RUN : V_HOME;
        render();
    }

    private final Runnable sosLoop = new Runnable() {
        @Override
        public void run() {
            if (sosPhase != 2) return;
            if (fix != null) post(null, null);
            h.postDelayed(this, 10000);
        }
    };

    private volatile boolean lastOk = false;

    /** Envoie l'état (« sos », « ok » ou rien) et la dernière position au serveur Lite Foil. */
    private void post(final String status, final Runnable done2) {
        final String url = api, k = key;
        final Location l = fix;
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                try {
                    JSONObject b = new JSONObject();
                    b.put("k", k);
                    if (status != null) b.put("status", status);
                    if (l != null) {
                        JSONObject p = new JSONObject();
                        p.put("lat", l.getLatitude()); p.put("lng", l.getLongitude());
                        p.put("t", System.currentTimeMillis());
                        p.put("spd", l.hasSpeed() ? Math.max(0, l.getSpeed() * 3.6) : 0);
                        b.put("pts", new JSONArray().put(p));
                    }
                    ok = http("POST", url, b.toString()) != null;
                } catch (Exception e) { ok = false; }
                final boolean res = ok;
                if (done2 != null) h.post(new Runnable() { @Override public void run() { lastOk = res; done2.run(); } });
            }
        }).start();
    }

    private void callEmergency() {
        try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + emergency))); } catch (Exception e) { /* montre sans téléphone */ }
    }

    private void buzz(int ms) {
        try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)); } catch (Exception e) { /* rien */ }
    }

    // ---------- affichage ----------
    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, size); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView button(String s, int bg, int fg, View.OnClickListener l) {
        TextView t = text(s, 14, fg, true);
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(20)); g.setColor(bg);
        t.setBackground(g);
        t.setOnClickListener(l);
        return t;
    }

    private LinearLayout.LayoutParams lp(int w, int hgt, int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, hgt); p.topMargin = top; return p;
    }

    private LinearLayout column() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int px = dp(round ? 24 : 9), py = dp(round ? 15 : 6);
        col.setPadding(px, py, px, py);
        return col;
    }

    private void backdrop() {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { C_BG1, C_BG2 });
        root.setBackground(g);
    }

    /** le petit SOS, présent sur tous les écrans */
    private TextView sosChip() {
        TextView s = button("SOS", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { if (!locked) openSos(); } });
        s.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        return s;
    }

    private void scroll(LinearLayout col) {
        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.addView(col, new FrameLayout.LayoutParams(MATCH, WRAP));
        root.addView(sv, new FrameLayout.LayoutParams(MATCH, MATCH));
    }

    private void render() {
        root.removeAllViews();
        cells.clear(); elapsedView = null; clockView = null;
        backdrop();
        if (view == V_RUN && !running) view = V_HOME;
        LinearLayout col = column();
        if (view == V_SOS) { root.setBackgroundColor(0xFF000000); col.setGravity(Gravity.CENTER); sosPage(col); scroll(col); return; }
        if (view == V_SPORTS) { sportsPage(col); scroll(col); return; }
        if (view == V_CONFIRM) { col.setGravity(Gravity.CENTER); confirmPage(col); scroll(col); return; }
        if (view == V_SUMMARY) { summaryPage(col); scroll(col); return; }
        if (view == V_RUN) {
            if (page >= screens.length) { page = screens.length; controlsPage(col); }
            else metricPage(col, screens[page], page < tops.length ? tops[page] : new String[] { "", "" });
            root.addView(col, new FrameLayout.LayoutParams(MATCH, MATCH));
            if (locked) root.addView(new LockView(this), new FrameLayout.LayoutParams(MATCH, MATCH));
            updateValues();
            return;
        }
        col.setGravity(Gravity.CENTER);
        homePage(col);
        root.addView(col, new FrameLayout.LayoutParams(MATCH, MATCH));
        updateValues();
    }

    // ----- départ -----
    private void homePage(LinearLayout col) {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL); head.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("Lite Foil", 11, 0xFF9FD8EE, true); brand.setGravity(Gravity.START);
        head.addView(brand, new LinearLayout.LayoutParams(0, WRAP, 1f));
        clockView = text("", 11, 0xFFFFFFFF, true);
        head.addView(clockView, new LinearLayout.LayoutParams(WRAP, WRAP));
        col.addView(head, new LinearLayout.LayoutParams(MATCH, WRAP));

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL); mid.setGravity(Gravity.CENTER);
        TextView sp1 = text(sport + "  ›", 19, 0xFFFFFFFF, true);
        sp1.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { view = V_SPORTS; render(); } });
        mid.addView(text("Sport", 10, C_MUTE, false));
        mid.addView(sp1, lp(MATCH, WRAP, 0));
        mid.addView(button("GO", C_GO, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { startRun(); } }), lp(dp(112), dp(40), dp(6)));
        if (!linked()) mid.addView(text("Code à taper dans l'appli : " + pairCode(), 10, 0xFFFFD84A, true), lp(MATCH, WRAP, dp(5)));
        col.addView(mid, new LinearLayout.LayoutParams(MATCH, 0, 1f));
        col.addView(sosChip(), lp(dp(54), dp(24), 0));
    }

    private void sportsPage(LinearLayout col) {
        col.addView(text("Choisis ton sport", 12, C_ACC, true), lp(MATCH, WRAP, dp(2)));
        for (final String s : SPORTS) {
            boolean on = s.equals(sport);
            TextView b = button(s, on ? C_ACC : 0xFF15394F, on ? 0xFF06202F : 0xFFFFFFFF, new View.OnClickListener() {
                @Override public void onClick(View v) { sport = s; sp.edit().putString("sport", s).apply(); view = V_HOME; render(); } });
            col.addView(b, lp(MATCH, dp(36), dp(5)));
        }
        if (!linked()) col.addView(text("Montre non liée. Code : " + pairCode() + "\nAppli Lite Foil : Ma montre, Montre Android.", 10, 0xFFFFD84A, false), lp(MATCH, WRAP, dp(8)));
        col.addView(sosChip(), lp(dp(54), dp(24), dp(8)));
        col.addView(new View(this), lp(1, dp(round ? 26 : 6), 0));
    }

    // ----- écran d'infos pendant la sortie -----
    private void metricPage(LinearLayout col, String[] keys, String[] top) {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL); head.setGravity(Gravity.CENTER_VERTICAL);
        elapsedView = text("", 12, 0xFFFFD84A, true); elapsedView.setGravity(Gravity.START);
        head.addView(elapsedView, new LinearLayout.LayoutParams(0, WRAP, 1f));
        clockView = text("", 12, 0xFFFFFFFF, true);
        head.addView(clockView, new LinearLayout.LayoutParams(WRAP, WRAP));
        col.addView(head, new LinearLayout.LayoutParams(MATCH, WRAP));

        if (top[0].length() > 0 || top[1].length() > 0) {
            LinearLayout tr = new LinearLayout(this);
            tr.setOrientation(LinearLayout.HORIZONTAL);
            for (int i = 0; i < 2; i++) {
                TextView t = text("", 11, 0xFFD6E6EE, true);
                t.setGravity(i == 0 ? Gravity.START : Gravity.END); t.setSingleLine(true);
                tr.addView(t, new LinearLayout.LayoutParams(0, WRAP, 1f));
                if (top[i].length() > 0) cells.add(new Object[] { top[i], t, null });
            }
            col.addView(tr, new LinearLayout.LayoutParams(MATCH, WRAP));
        }

        int n = keys.length;
        if (n <= 1) col.addView(cell(n == 1 ? keys[0] : "dur", 50), new LinearLayout.LayoutParams(MATCH, 0, 1f));
        else if (n == 2) {
            col.addView(cell(keys[0], 32), new LinearLayout.LayoutParams(MATCH, 0, 1f));
            col.addView(cell(keys[1], 32), new LinearLayout.LayoutParams(MATCH, 0, 1f));
        } else if (n == 3) {
            col.addView(cell(keys[0], 30), new LinearLayout.LayoutParams(MATCH, 0, 1f));
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.addView(cell(keys[1], 22), new LinearLayout.LayoutParams(0, MATCH, 1f));
            row.addView(cell(keys[2], 22), new LinearLayout.LayoutParams(0, MATCH, 1f));
            col.addView(row, new LinearLayout.LayoutParams(MATCH, 0, 1f));
        } else {
            for (int r = 0; r < 2; r++) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                for (int c = 0; c < 2; c++) row.addView(cell(keys[r * 2 + c], 23), new LinearLayout.LayoutParams(0, MATCH, 1f));
                col.addView(row, new LinearLayout.LayoutParams(MATCH, 0, 1f));
            }
        }
        col.addView(footer(), lp(MATCH, dp(22), dp(1)));
    }

    /** bas d'écran : les points de page et le petit SOS */
    private View footer() {
        LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.HORIZONTAL); f.setGravity(Gravity.CENTER);
        StringBuilder d = new StringBuilder();
        for (int i = 0; i <= screens.length; i++) d.append(i == page ? "●" : "○").append(i < screens.length ? " " : "");
        TextView dots = text(d.toString(), 7, 0xFF7FA9BE, false);
        f.addView(dots, new LinearLayout.LayoutParams(WRAP, WRAP));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(46), dp(20)); p.leftMargin = dp(8);
        f.addView(sosChip(), p);
        return f;
    }

    private View cell(String k, float size) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        TextView lb = text(label(k), 9, C_MUTE, false);
        lb.setSingleLine(true);
        TextView val = text("", size, 0xFFFFFFFF, false);
        val.setSingleLine(true); val.setIncludeFontPadding(false);
        TextView unit = text("", 9, 0xFF4FB8E0, false);
        unit.setIncludeFontPadding(false);
        c.addView(lb, new LinearLayout.LayoutParams(WRAP, WRAP));
        c.addView(val, new LinearLayout.LayoutParams(WRAP, WRAP));
        c.addView(unit, new LinearLayout.LayoutParams(WRAP, WRAP));
        cells.add(new Object[] { k, val, unit });
        return c;
    }

    // ----- commandes -----
    private void controlsPage(LinearLayout col) {
        col.setGravity(Gravity.CENTER);
        elapsedView = text("", 12, 0xFFFFD84A, true);
        col.addView(elapsedView, lp(MATCH, WRAP, 0));
        col.addView(button("Verrouiller l'écran", 0xFF1D5F8F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { locked = true; page = 0; buzz(60); render(); } }), lp(MATCH, dp(38), dp(6)));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(button("Fin", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { view = V_CONFIRM; render(); } }), new LinearLayout.LayoutParams(0, MATCH, 1f));
        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, MATCH, 1f); p2.leftMargin = dp(6);
        row.addView(paused ? button("Reprendre", C_GO, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { pauseRun(false); } })
                           : button("Pause", 0xFF2A4A60, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { pauseRun(true); } }), p2);
        col.addView(row, lp(MATCH, dp(42), dp(6)));
        col.addView(footer(), lp(MATCH, dp(22), dp(6)));
    }

    private void confirmPage(LinearLayout col) {
        col.addView(text("Terminer la sortie ?", 14, 0xFFFFFFFF, true));
        col.addView(button("Terminer", C_GO, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { stopRun(true); } }), lp(MATCH, dp(36), dp(7)));
        col.addView(button("Abandonner", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { stopRun(false); } }), lp(MATCH, dp(34), dp(5)));
        col.addView(button("Annuler", 0xFF2A4A60, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { view = V_RUN; render(); } }), lp(MATCH, dp(34), dp(5)));
    }

    // ----- résumé -----
    private void line(LinearLayout col, String a, String b) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        TextView l = text(a, 11, C_MUTE, false); l.setGravity(Gravity.START);
        TextView v = text(b, 12, 0xFFFFFFFF, true); v.setGravity(Gravity.END);
        r.addView(l, new LinearLayout.LayoutParams(0, WRAP, 1f));
        r.addView(v, new LinearLayout.LayoutParams(WRAP, WRAP));
        col.addView(r, lp(MATCH, WRAP, dp(3)));
    }

    private void section(LinearLayout col, String t) {
        TextView s = text(t, 12, C_ACC, true); s.setGravity(Gravity.START);
        col.addView(s, lp(MATCH, WRAP, dp(9)));
    }

    private void summaryPage(LinearLayout col) {
        Calendar cal = Calendar.getInstance(); cal.setTimeInMillis(startWall > 0 ? startWall : System.currentTimeMillis());
        int hr = cal.get(Calendar.HOUR_OF_DAY);
        String when = hr < 6 ? "Sortie de nuit" : hr < 12 ? "Sortie du matin" : hr < 14 ? "Sortie de midi" : hr < 18 ? "Sortie de l'après-midi" : hr < 22 ? "Sortie du soir" : "Sortie de nuit";
        col.addView(new View(this), lp(1, dp(round ? 14 : 2), 0));
        TextView t = text(when, 16, C_ACC, true); t.setGravity(Gravity.START);
        col.addView(t, lp(MATCH, WRAP, 0));
        TextView d = text(new SimpleDateFormat("EEEE d MMMM", Locale.FRANCE).format(new Date(cal.getTimeInMillis())) + "  ·  " + sport, 10, 0xFFD6E6EE, false); d.setGravity(Gravity.START);
        col.addView(d, lp(MATCH, WRAP, dp(1)));
        section(col, "Distance et temps");
        line(col, "Durée", clockOf(runMs));
        line(col, "Temps actif", clockOf(moveMs));
        line(col, "Distance", num(distM / 1000.0, 2) + " km");
        section(col, "Vitesse");
        line(col, "Max", num(maxKmh, 1) + " km/h");
        line(col, "Moyenne", num(runMs > 5000 ? distM / (runMs / 1000.0) * 3.6 : 0, 1) + " km/h");
        section(col, "Sur le foil");
        line(col, "Runs", String.valueOf(runCount));
        line(col, "Temps sur le foil", clockOf(foilMs));
        line(col, "Distance sur le foil", num(foilDistM / 1000.0, 2) + " km");
        String[] lr = meters(longRunDistM);
        line(col, "Plus long run", clockOf(longRunMs) + "  ·  " + lr[0] + " " + lr[1]);
        if (hrN > 0) {
            section(col, "Cardio");
            line(col, "Moyen", Math.round((double) hrSum / hrN) + " bpm");
            line(col, "Max", hrMax + " bpm");
        }
        col.addView(button("Fermer", C_GO, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { view = V_HOME; render(); } }), lp(MATCH, dp(36), dp(10)));
        col.addView(sosChip(), lp(dp(54), dp(24), dp(7)));
        col.addView(new View(this), lp(1, dp(round ? 26 : 6), 0));
    }

    // ----- SOS -----
    private void sosPage(LinearLayout col) {
        View.OnClickListener back = new View.OnClickListener() { @Override public void onClick(View v) { view = backView == V_SOS ? V_HOME : backView; render(); } };
        if (!linked()) {
            col.addView(text("SOS pas encore prêt", 14, 0xFFFFB347, true));
            TextView code = text(pairCode(), 26, 0xFFFFFFFF, true);
            code.setLetterSpacing(0.18f);
            col.addView(code, lp(WRAP, WRAP, dp(3)));
            col.addView(text("Tape ce code dans l'appli Lite Foil : Ma montre, Montre Android.", 10, 0xFF9FB0BA, false), lp(MATCH, WRAP, dp(3)));
            col.addView(button("Appeler le 112", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(7)));
            col.addView(button("Retour", 0xFF24313A, 0xFFFFFFFF, back), lp(MATCH, dp(32), dp(5)));
            return;
        }
        if (api.length() == 0) {
            col.addView(text("SOS pas encore prêt", 14, 0xFFFFB347, true));
            col.addView(text("Connecte-toi dans l'appli Lite Foil : le SOS s'active ici tout seul.", 11, 0xFF9FB0BA, false), lp(MATCH, WRAP, dp(4)));
            col.addView(button("Appeler le 112", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(8)));
            col.addView(button("Retour", 0xFF24313A, 0xFFFFFFFF, back), lp(MATCH, dp(32), dp(5)));
            return;
        }
        if (sosPhase == 0) {
            col.addView(new SosView(this), lp(dp(104), dp(104), 0));
            col.addView(text("Maintiens 2 secondes", 12, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(4)));
            col.addView(text(contacts > 0 ? contacts + " proche(s) prévenu(s) avec ta position" : "Ajoute des proches dans l'appli", 10, contacts > 0 ? 0xFF9FB0BA : 0xFFFFB347, false), lp(MATCH, WRAP, dp(2)));
            col.addView(button("Retour", 0xFF24313A, 0xFFFFFFFF, back), lp(dp(96), dp(28), dp(5)));
        } else if (sosPhase == 1) {
            col.addView(text("Envoi du SOS…", 16, 0xFFFFFFFF, true));
        } else if (sosPhase == 2) {
            col.addView(text("SOS envoyé", 17, 0xFFFF5A5A, true));
            col.addView(text(fix != null ? "Tes proches voient ta position en direct." : "Proches prévenus. Recherche de ta position…", 11, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(3)));
            col.addView(button("Appeler le " + emergency, C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(7)));
            col.addView(button("Fausse alerte", 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { cancelSos(); } }), lp(MATCH, dp(34), dp(6)));
        } else {
            col.addView(text("SOS non envoyé", 16, 0xFFFFB347, true));
            col.addView(text("Pas de réseau sur la montre.", 11, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(3)));
            col.addView(button("Réessayer", C_RED, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { fireSos(); } }), lp(MATCH, dp(36), dp(7)));
            col.addView(button("Appeler le " + emergency, 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(34), dp(6)));
            col.addView(button("Retour", 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { sosPhase = 0; view = backView == V_SOS ? V_HOME : backView; render(); } }), lp(MATCH, dp(30), dp(5)));
        }
    }

    /** Écran verrouillé (éclaboussures, combinaison) : les touches sont ignorées ; on déverrouille en maintenant 2 secondes. */
    private class LockView extends View {
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG), txt = new Paint(Paint.ANTI_ALIAS_FLAG), bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float prog = 0f;
        private ValueAnimator anim;
        private final Runnable open = new Runnable() { @Override public void run() { locked = false; buzz(120); render(); } };

        LockView(Context c) {
            super(c);
            ring.setColor(C_ACC); ring.setStyle(Paint.Style.STROKE); ring.setStrokeCap(Paint.Cap.ROUND); ring.setStrokeWidth(dp(4));
            txt.setColor(0xFFD6E6EE); txt.setTextAlign(Paint.Align.CENTER); txt.setTextSize(dp(10)); txt.setTypeface(Typeface.DEFAULT_BOLD);
            bg.setColor(0x99000000);
            setClickable(true);
        }

        private void stop() { h.removeCallbacks(open); if (anim != null) { anim.cancel(); anim = null; } prog = 0f; invalidate(); }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN) {
                h.removeCallbacks(open); h.postDelayed(open, 2000);
                anim = ValueAnimator.ofFloat(0f, 1f); anim.setDuration(2000);
                anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator v) { prog = (Float) v.getAnimatedValue(); invalidate(); } });
                anim.start();
            } else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) stop();
            return true;
        }

        @Override
        protected void onDraw(Canvas cv) {
            float w = getWidth(), hh = getHeight();
            float bw = dp(150), bh = dp(20), cy = hh - dp(round ? 26 : 14);
            box.set(w / 2f - bw / 2f, cy - bh / 2f, w / 2f + bw / 2f, cy + bh / 2f);
            cv.drawRoundRect(box, bh / 2f, bh / 2f, bg);
            cv.drawText("Verrouillé · maintiens 2 s", w / 2f, cy - (txt.ascent() + txt.descent()) / 2f, txt);
            if (prog > 0f) { float r = Math.min(w, hh) / 2f - dp(4); box.set(w / 2f - r, hh / 2f - r, w / 2f + r, hh / 2f + r); if (round) cv.drawArc(box, -90f, 360f * prog, false, ring); else cv.drawLine(dp(6), dp(4), dp(6) + (w - dp(12)) * prog, dp(4), ring); }
        }
    }

    /** Le bouton SOS : un rond rouge, un anneau blanc qui se remplit pendant les 2 secondes d'appui. */
    private class SosView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG), txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float prog = 0f;
        private ValueAnimator anim;
        private final Runnable fire = new Runnable() { @Override public void run() { stop(); fireSos(); } };

        SosView(Context c) {
            super(c);
            fill.setColor(C_RED);
            ring.setColor(0xFFFFFFFF); ring.setStyle(Paint.Style.STROKE); ring.setStrokeCap(Paint.Cap.ROUND); ring.setStrokeWidth(dp(5));
            txt.setColor(0xFFFFFFFF); txt.setTypeface(Typeface.DEFAULT_BOLD); txt.setTextAlign(Paint.Align.CENTER); txt.setTextSize(dp(30));
        }

        private void stop() {
            h.removeCallbacks(fire);
            if (anim != null) { anim.cancel(); anim = null; }
            prog = 0f; invalidate();
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN) {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);   // un doigt qui bouge un peu ne doit pas annuler l'appui
                buzz(60);
                h.removeCallbacks(fire); h.postDelayed(fire, 2000);
                anim = ValueAnimator.ofFloat(0f, 1f); anim.setDuration(2000);
                anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator v) { prog = (Float) v.getAnimatedValue(); invalidate(); } });
                anim.start();
                return true;
            }
            if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) { stop(); return true; }
            return true;
        }

        @Override
        protected void onDraw(Canvas cv) {
            float w = getWidth(), hh = getHeight(), r = Math.min(w, hh) / 2f;
            cv.drawCircle(w / 2f, hh / 2f, r, fill);
            float in = dp(6);
            box.set(w / 2f - r + in, hh / 2f - r + in, w / 2f + r - in, hh / 2f + r - in);
            if (prog > 0f) cv.drawArc(box, -90f, 360f * prog, false, ring);
            cv.drawText("SOS", w / 2f, hh / 2f - (txt.ascent() + txt.descent()) / 2f, txt);
        }
    }
}
