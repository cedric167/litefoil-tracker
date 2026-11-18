package fr.litefoil.tracker;

import android.app.Activity;
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

/** Lite Foil : écran d'alerte SOS d'un proche, plein écran, par-dessus l'écran verrouillé. */
public class LfSosActivity extends Activity {
    private final Handler h = new Handler(Looper.getMainLooper());

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LfSos.screen = new WeakReference<>(this);

        SharedPreferences sp = LfSos.prefs(this);
        long age = System.currentTimeMillis() - sp.getLong("t", 0);
        if (age > LfSos.RING_MS + 5000) { finish(); return; }
        String title = sp.getString("title", "SOS");
        String body = sp.getString("body", "");
        boolean live = !"".equals(sp.getString("live", ""));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xFFB0122B, 0xFF3A0610 }));
        root.setPadding(dp(24), dp(72), dp(24), dp(48));

        TextView brand = text("LITE FOIL · ALERTE", 13, 0xFFFFC9D1, true);
        brand.setLetterSpacing(0.22f);
        root.addView(brand);

        TextView badge = text("SOS", 44, Color.WHITE, true);
        badge.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(0xFFE8384F); circle.setStroke(dp(6), 0x55FFFFFF);
        badge.setBackground(circle);
        LinearLayout.LayoutParams lpB = new LinearLayout.LayoutParams(dp(150), dp(150)); lpB.topMargin = dp(48);
        root.addView(badge, lpB);

        TextView tt = text(title, 27, Color.WHITE, true);
        LinearLayout.LayoutParams lpT = wrap(); lpT.topMargin = dp(28);
        root.addView(tt, lpT);
        TextView bd = text(body, 16, 0xFFFFDDE2, false);
        bd.setMaxLines(5);
        LinearLayout.LayoutParams lpD = wrap(); lpD.topMargin = dp(10);
        root.addView(bd, lpD);

        View space = new View(this);
        root.addView(space, new LinearLayout.LayoutParams(1, 0, 1f));

        root.addView(wide(live ? "Voir sa position" : "Ouvrir Lite Foil", Color.WHITE, 0xFFB0122B, new View.OnClickListener() {
            @Override public void onClick(View v) {
                LfSos.stop(LfSosActivity.this);
                try { startActivity(LfSos.openIntent(LfSosActivity.this)); } catch (Exception e) { /* rien pour l'ouvrir : l'alerte reste dans les messages */ }
                finish();
            } }), wideLp(0));
        root.addView(wide("Arrêter la sonnerie", 0x33FFFFFF, Color.WHITE, new View.OnClickListener() {
            @Override public void onClick(View v) { LfSos.stop(LfSosActivity.this); finish(); } }), wideLp(12));

        setContentView(root);
        h.postDelayed(new Runnable() { @Override public void run() { LfSos.stop(LfSosActivity.this); finish(); } }, Math.max(1000, LfSos.RING_MS - age));
    }

    private LinearLayout.LayoutParams wrap() { return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); }

    private LinearLayout.LayoutParams wideLp(int top) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58)); lp.topMargin = dp(top); return lp;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        t.setMaxLines(3);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View wide(String label, int bg, int fg, View.OnClickListener l) {
        TextView t = text(label, 17, fg, true);
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(18)); g.setColor(bg);
        t.setBackground(g);
        t.setOnClickListener(l);
        return t;
    }

    @Override public void onBackPressed() { LfSos.stop(this); super.onBackPressed(); }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (LfSos.screen.get() == this) LfSos.screen = new WeakReference<>(null);
        super.onDestroy();
    }
}
