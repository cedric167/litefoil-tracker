package fr.litefoil.tracker;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Lite Foil : stockage de la sortie en cours (GPS du téléphone), dans les fichiers de l'appli.
 *  - lftrack/meta.json   : { running, meta (texte libre de la page), title, text }
 *  - lftrack/points.jsonl : un point par ligne { i, lat, lon, acc, alt, spd, brg, t }
 * Le service écrit les points ici même quand l'appli est fermée ; la page les relit à la réouverture.
 */
final class LfTrackStore {
    private LfTrackStore() {}

    private static File dir(Context c) {
        File d = new File(c.getFilesDir(), "lftrack");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static File metaFile(Context c) { return new File(dir(c), "meta.json"); }
    private static File pointsFile(Context c) { return new File(dir(c), "points.jsonl"); }

    static synchronized JSONObject readMeta(Context c) {
        File f = metaFile(c);
        if (!f.exists()) return null;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            return null;
        }
    }

    static synchronized void writeMeta(Context c, JSONObject m) {
        try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(metaFile(c), false), StandardCharsets.UTF_8)) {
            w.write(m.toString());
        } catch (Exception ignored) {}
    }

    static boolean isRunning(Context c) {
        JSONObject m = readMeta(c);
        return m != null && m.optBoolean("running", false);
    }

    static synchronized void setRunning(Context c, boolean running) {
        JSONObject m = readMeta(c);
        if (m == null) return;
        try { m.put("running", running); } catch (Exception ignored) {}
        writeMeta(c, m);
    }

    /** Nouvelle sortie : efface les points précédents. */
    static synchronized void begin(Context c, String meta, String title, String text) {
        pointsFile(c).delete();
        JSONObject m = new JSONObject();
        try {
            m.put("running", true);
            m.put("meta", meta == null ? "" : meta);
            m.put("title", title == null ? "Lite Foil — enregistrement" : title);
            m.put("text", text == null ? "Ta sortie est en cours d'enregistrement." : text);
        } catch (Exception ignored) {}
        writeMeta(c, m);
    }

    static synchronized void append(Context c, JSONObject p) {
        try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(pointsFile(c), true), StandardCharsets.UTF_8)) {
            w.write(p.toString());
            w.write('\n');
        } catch (Exception ignored) {}
    }

    static synchronized int count(Context c) {
        File f = pointsFile(c);
        if (!f.exists()) return 0;
        int n = 0;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) if (line.length() > 0) n++;
        } catch (Exception ignored) {}
        return n;
    }

    static synchronized JSONArray points(Context c, int from) {
        JSONArray out = new JSONArray();
        File f = pointsFile(c);
        if (!f.exists()) return out;
        int i = 0;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.length() == 0) continue;
                if (i++ < from) continue;
                try { out.put(new JSONObject(line)); } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
        return out;
    }

    static synchronized void clear(Context c) {
        pointsFile(c).delete();
        metaFile(c).delete();
    }
}
