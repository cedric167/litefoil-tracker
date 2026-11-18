package fr.litefoil.wear;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
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
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Lite Foil sur montre Android (Wear OS), 18/11/2026.
 * Écran 0 : SOS (gros bouton à maintenir 2 secondes). Écrans suivants : les infos choisies dans l'appli
 * téléphone (« Ma montre »), mesurées par le GPS de la montre. On change d'écran en glissant.
 * La montre est liée une fois par un code à 6 caractères tapé dans l'appli ; elle parle ensuite
 * directement au serveur Lite Foil (réglages et SOS), sans avoir besoin du téléphone.
 */
public class MainActivity extends Activity implements LocationListener {
    static final String BASE = "https://litefoil-communaute-222fd.web.app";
    static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT, WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;

    private SharedPreferences sp;
    private final Handler h = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private GestureDetector gesture;
    private boolean resumed = false, round = false;
    private int page = 0;

    // réglages reçus de l'appli
    private String[][] screens = new String[][] { { "dur", "dist", "spd", "max" }, { "spd" } };
    private JSONObject labels = new JSONObject();
    private String api = "", key = "", channel = "", emergency = "112";
    private int contacts = 0;

    // sortie mesurée par la montre
    private boolean running = false, paused = false, done = false;
    private long runMs = 0, lastTick = 0;
    private double distM = 0, maxKmh = 0, curKmh = 0;
    private Location anchor = null, fix = null;
    private boolean gpsOn = false;
    private int pendingAction = 0;   // 1 = démarrer la sortie, 2 = SOS, après l'accord de localisation
    private final List<Object[]> cells = new ArrayList<>();
    private TextView stateView, clockView;

    // SOS : 0 prêt, 1 envoi, 2 actif, 3 échec
    private int sosPhase = 0;
    private SosView sosView;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("lf", Context.MODE_PRIVATE);
        round = getResources().getConfiguration().isScreenRound();
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        setContentView(root);
        gesture = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onFling(MotionEvent a, MotionEvent c, float vx, float vy) {
                if (Math.abs(vx) < Math.abs(vy) * 1.3f || Math.abs(vx) < 350) return false;
                int np = page + (vx < 0 ? 1 : -1);
                if (np < 0 || np > screens.length) return false;
                page = np; render();
                return true;
            }
        });
        loadCfg();
        if (sp.getBoolean("sosOn", false) && api.length() > 0) { sosPhase = 2; startGps(); h.postDelayed(sosLoop, 10000); }
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
        stopGps();
        super.onDestroy();
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
            JSONArray a = c.optJSONArray("scr");
            if (a != null && a.length() > 0) {
                List<String[]> out = new ArrayList<>();
                for (int i = 0; i < a.length() && out.size() < 5; i++) {
                    JSONArray r = a.optJSONArray(i);
                    if (r == null || r.length() == 0) continue;
                    int n = Math.min(4, r.length());
                    String[] row = new String[n];
                    for (int j = 0; j < n; j++) row[j] = r.optString(j, "dur");
                    out.add(row);
                }
                if (!out.isEmpty()) screens = out.toArray(new String[0][]);
            }
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
                    public void run() { if (!c.toString().equals(sp.getString("cfg", ""))) applyCfg(c); }
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

    // ---------- GPS de la montre ----------
    private boolean hasLoc() { return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED; }

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
                else { float d = anchor.distanceTo(l); if (d >= Math.max(4f, Math.min(12f, acc * 0.6f))) { distM += d; anchor = l; } }
            }
        }
        if (first && sosPhase == 2) post(null, null);
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
            if (running) { if (!paused) runMs += now - lastTick; lastTick = now; }
            if (resumed) updateValues();
            if (resumed || running) h.postDelayed(this, 1000);
        }
    };

    private void startRun() {
        if (!hasLoc()) { pendingAction = 1; requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION }, 1); return; }
        running = true; paused = false; done = false;
        runMs = 0; distM = 0; maxKmh = 0; curKmh = 0; anchor = null;
        lastTick = SystemClock.elapsedRealtime();
        startGps();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buzz(120);
        h.removeCallbacks(tick); h.post(tick);
        render();
    }

    private void pauseRun(boolean on) {
        paused = on; anchor = null; curKmh = 0;
        lastTick = SystemClock.elapsedRealtime();
        buzz(80);
        render();
    }

    private void stopRun() {
        running = false; paused = false; done = true; curKmh = 0;
        if (sosPhase != 2 && sosPhase != 1) stopGps();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buzz(200);
        render();
    }

    private String label(String k) {
        String d = k;
        if ("dur".equals(k)) d = "Durée"; else if ("dist".equals(k)) d = "Distance"; else if ("spd".equals(k)) d = "Vitesse";
        else if ("max".equals(k)) d = "Vitesse max"; else if ("avg".equals(k)) d = "Vitesse moy."; else if ("clock".equals(k)) d = "Heure";
        return labels.optString(k, d);
    }

    /** valeur et unité d'une info ; un tiret pour celles que seul le téléphone connaît */
    private String[] value(String k) {
        if ("clock".equals(k)) return new String[] { new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date()), "" };
        if ("dur".equals(k)) {
            long s = runMs / 1000, hh = s / 3600, mm = (s % 3600) / 60, ss = s % 60;
            return new String[] { hh > 0 ? String.format(Locale.FRANCE, "%d:%02d:%02d", hh, mm, ss) : String.format(Locale.FRANCE, "%d:%02d", mm, ss), "" };
        }
        if ("dist".equals(k)) return new String[] { String.format(Locale.FRANCE, "%.2f", distM / 1000.0), "km" };
        if ("spd".equals(k)) return new String[] { String.format(Locale.FRANCE, "%.1f", curKmh), "km/h" };
        if ("max".equals(k)) return new String[] { String.format(Locale.FRANCE, "%.1f", maxKmh), "km/h" };
        if ("avg".equals(k)) return new String[] { String.format(Locale.FRANCE, "%.1f", runMs > 5000 ? distM / (runMs / 1000.0) * 3.6 : 0), "km/h" };
        return new String[] { "—", "" };
    }

    private void updateValues() {
        for (Object[] c : cells) {
            String[] v = value((String) c[0]);
            ((TextView) c[1]).setText(v[0]);
            ((TextView) c[2]).setText(v[1]);
        }
        if (stateView != null) {
            stateView.setText(running ? (paused ? "Pause" : "● REC") : (done ? "Terminé" : "Prêt"));
            stateView.setTextColor(running && !paused ? 0xFFFF5A5A : 0xFF9FB0BA);
        }
        if (clockView != null) clockView.setText(new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date()));
    }

    // ---------- SOS ----------
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

    private void render() {
        root.removeAllViews();
        cells.clear(); stateView = null; clockView = null; sosView = null;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int px = dp(round ? 22 : 8), py = dp(round ? 16 : 6);
        col.setPadding(px, py, px, py);
        if (page == 0 || page > screens.length) {
            page = 0;
            sosPage(col);
            ScrollView sv = new ScrollView(this);
            sv.setFillViewport(true);
            sv.addView(col, new FrameLayout.LayoutParams(MATCH, WRAP));
            root.addView(sv, new FrameLayout.LayoutParams(MATCH, MATCH));
        } else {
            metricPage(col, screens[page - 1]);
            root.addView(col, new FrameLayout.LayoutParams(MATCH, MATCH));
            updateValues();
        }
    }

    private void sosPage(LinearLayout col) {
        col.setGravity(Gravity.CENTER);
        if (!linked()) {
            col.addView(text("LITE FOIL", 12, 0xFF5FD0E6, true));
            TextView code = text(pairCode(), 30, 0xFFFFFFFF, true);
            code.setLetterSpacing(0.18f);
            col.addView(code, lp(WRAP, WRAP, dp(4)));
            col.addView(text("Dans l'appli Lite Foil : Tracking, Ma montre, Montre Android. Tape ce code.", 11, 0xFF9FB0BA, false), lp(MATCH, WRAP, dp(4)));
            col.addView(button("Appeler le 112", 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(8)));
            return;
        }
        if (api.length() == 0) {
            col.addView(text("SOS pas encore prêt", 14, 0xFFFFB347, true));
            col.addView(text("Connecte-toi dans l'appli Lite Foil : le SOS s'active ici tout seul.", 11, 0xFF9FB0BA, false), lp(MATCH, WRAP, dp(4)));
            col.addView(button("Appeler le 112", 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(8)));
            col.addView(text("Glisse pour tes écrans  ›", 10, 0xFF66727D, false), lp(MATCH, WRAP, dp(6)));
            return;
        }
        if (sosPhase == 0) {
            sosView = new SosView(this);
            col.addView(sosView, lp(dp(108), dp(108), 0));
            col.addView(text("Maintiens 2 secondes", 12, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(4)));
            col.addView(text(contacts > 0 ? contacts + " proche(s) prévenu(s) avec ta position" : "Ajoute des proches dans l'appli", 10, contacts > 0 ? 0xFF9FB0BA : 0xFFFFB347, false), lp(MATCH, WRAP, dp(2)));
            col.addView(text("Glisse pour tes écrans  ›", 10, 0xFF66727D, false), lp(MATCH, WRAP, dp(3)));
        } else if (sosPhase == 1) {
            col.addView(text("Envoi du SOS…", 16, 0xFFFFFFFF, true));
        } else if (sosPhase == 2) {
            col.addView(text("SOS envoyé", 17, 0xFFFF5A5A, true));
            col.addView(text(fix != null ? "Tes proches voient ta position en direct." : "Proches prévenus. Recherche de ta position…", 11, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(3)));
            col.addView(button("Appeler le " + emergency, 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(36), dp(7)));
            col.addView(button("Fausse alerte", 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { cancelSos(); } }), lp(MATCH, dp(34), dp(6)));
        } else {
            col.addView(text("SOS non envoyé", 16, 0xFFFFB347, true));
            col.addView(text("Pas de réseau sur la montre.", 11, 0xFFC9D6DD, false), lp(MATCH, WRAP, dp(3)));
            col.addView(button("Réessayer", 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { fireSos(); } }), lp(MATCH, dp(36), dp(7)));
            col.addView(button("Appeler le " + emergency, 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { callEmergency(); } }), lp(MATCH, dp(34), dp(6)));
        }
    }

    private void metricPage(LinearLayout col, String[] keys) {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView sos = button("SOS", 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { page = 0; render(); } });
        sos.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        head.addView(sos, new LinearLayout.LayoutParams(dp(40), dp(22)));
        stateView = text("", 11, 0xFF9FB0BA, true);
        head.addView(stateView, new LinearLayout.LayoutParams(0, WRAP, 1f));
        clockView = text("", 11, 0xFF9FB0BA, false);
        head.addView(clockView, new LinearLayout.LayoutParams(dp(40), WRAP));
        col.addView(head, new LinearLayout.LayoutParams(MATCH, WRAP));

        int n = keys.length;
        if (n <= 1) col.addView(cell(n == 1 ? keys[0] : "dur", 44), new LinearLayout.LayoutParams(MATCH, 0, 1f));
        else if (n == 2) {
            col.addView(cell(keys[0], 30), new LinearLayout.LayoutParams(MATCH, 0, 1f));
            col.addView(cell(keys[1], 30), new LinearLayout.LayoutParams(MATCH, 0, 1f));
        } else {
            for (int r = 0; r < 2; r++) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                for (int c = 0; c < 2; c++) {
                    int i = r * 2 + c;
                    if (i < n) row.addView(cell(keys[i], 22), new LinearLayout.LayoutParams(0, MATCH, 1f));
                }
                col.addView(row, new LinearLayout.LayoutParams(MATCH, 0, 1f));
            }
        }

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        if (!running) {
            bar.addView(button("GO", 0xFF2FD3C3, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { startRun(); } }), new LinearLayout.LayoutParams(0, MATCH, 1f));
        } else if (!paused) {
            bar.addView(button("Pause", 0xFF24313A, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { pauseRun(true); } }), new LinearLayout.LayoutParams(0, MATCH, 1f));
        } else {
            bar.addView(button("Reprendre", 0xFF2FD3C3, 0xFF06282A, new View.OnClickListener() { @Override public void onClick(View v) { pauseRun(false); } }), new LinearLayout.LayoutParams(0, MATCH, 1f));
            LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, MATCH, 1f); p2.leftMargin = dp(5);
            bar.addView(button("Terminer", 0xFFE8384F, 0xFFFFFFFF, new View.OnClickListener() { @Override public void onClick(View v) { stopRun(); } }), p2);
        }
        col.addView(bar, lp(round ? dp(118) : MATCH, dp(30), dp(2)));
    }

    private View cell(String k, float size) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        TextView lb = text(label(k).toUpperCase(Locale.FRANCE), 9, 0xFF5FD0E6, true);
        lb.setSingleLine(true);
        TextView val = text("", size, 0xFFFFFFFF, true);
        val.setSingleLine(true); val.setIncludeFontPadding(false);
        TextView unit = text("", 9, 0xFF8EA0AA, false);
        c.addView(lb, new LinearLayout.LayoutParams(WRAP, WRAP));
        c.addView(val, new LinearLayout.LayoutParams(WRAP, WRAP));
        c.addView(unit, new LinearLayout.LayoutParams(WRAP, WRAP));
        cells.add(new Object[] { k, val, unit });
        return c;
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
            fill.setColor(0xFFE8384F);
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
