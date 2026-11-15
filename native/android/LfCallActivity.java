package fr.litefoil.tracker;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;

/** Lite Foil : écran d'appel entrant plein écran (s'affiche par-dessus l'écran verrouillé). */
public class LfCallActivity extends Activity {
    private final Handler h = new Handler(Looper.getMainLooper());

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LfCall.screen = new WeakReference<>(this);

        SharedPreferences sp = LfCall.prefs(this);
        long age = System.currentTimeMillis() - sp.getLong("t", 0);
        if (age > LfCall.RING_MS + 5000 || !"".equals(sp.getString("act", ""))) { finish(); return; }
        String name = sp.getString("name", "Rider");
        boolean video = "v".equals(sp.getString("k", "a"));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xFF0B3D47, 0xFF07191D }));
        root.setPadding(dp(24), dp(72), dp(24), dp(56));

        TextView brand = text("LITE FOIL", 13, 0xFF7FE3D8, true);
        brand.setLetterSpacing(0.25f);
        root.addView(brand);

        TextView av = text(name.trim().isEmpty() ? "R" : name.trim().substring(0, 1).toUpperCase(), 52, Color.WHITE, true);
        av.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(0xFF12B5A6);
        av.setBackground(circle);
        LinearLayout.LayoutParams lpAv = new LinearLayout.LayoutParams(dp(132), dp(132)); lpAv.topMargin = dp(56);
        root.addView(av, lpAv);

        TextView nm = text(name, 30, Color.WHITE, true);
        LinearLayout.LayoutParams lpN = wrap(); lpN.topMargin = dp(24);
        root.addView(nm, lpN);
        TextView sub = text(video ? "Appel vidéo entrant…" : "Appel audio entrant…", 16, 0xFFB8D4D8, false);
        LinearLayout.LayoutParams lpS = wrap(); lpS.topMargin = dp(8);
        root.addView(sub, lpS);

        View space = new View(this);
        root.addView(space, new LinearLayout.LayoutParams(1, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.addView(button("✕", "Refuser", 0xFFE5484D, new View.OnClickListener() {
            @Override public void onClick(View v) { LfCall.stop(LfCallActivity.this, "decline"); finish(); } }));
        View gap = new View(this); row.addView(gap, new LinearLayout.LayoutParams(dp(72), 1));
        row.addView(button(video ? "▶" : "✆", "Décrocher", 0xFF22B573, new View.OnClickListener() {
            @Override public void onClick(View v) { answer(); } }));
        root.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);
        h.postDelayed(new Runnable() { @Override public void run() { LfCall.stop(LfCallActivity.this, null); finish(); } }, Math.max(1000, LfCall.RING_MS - age));
    }

    private void answer() {
        LfCall.stop(this, "answer");
        try {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && Build.VERSION.SDK_INT >= 26) km.requestDismissKeyguard(this, null);
        } catch (Exception e) { /* l'appli s'ouvre de toute façon par-dessus l'écran verrouillé */ }
        startActivity(LfCall.answerIntent(this));
        finish();
    }

    private LinearLayout.LayoutParams wrap() { return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        t.setMaxLines(2);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View button(String glyph, String label, int color, View.OnClickListener l) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView b = text(glyph, 30, Color.WHITE, true);
        GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(color);
        b.setBackground(g);
        b.setContentDescription(label);
        b.setOnClickListener(l);
        col.addView(b, new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView t = text(label, 14, Color.WHITE, false);
        LinearLayout.LayoutParams lp = wrap(); lp.topMargin = dp(10);
        col.addView(t, lp);
        return col;
    }

    @Override public void onBackPressed() { /* on choisit : Décrocher ou Refuser */ }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (LfCall.screen.get() == this) LfCall.screen = new WeakReference<>(null);
        super.onDestroy();
    }
}
