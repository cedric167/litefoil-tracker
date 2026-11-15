package fr.litefoil.tracker;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.RemoteMessage;

import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

import java.util.Map;

/**
 * Lite Foil : reçoit les messages du serveur. Les appels (type=call, native=1) ouvrent l'écran d'appel ;
 * tout le reste suit le chemin habituel du module de notifications.
 */
public class LfCallMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        try {
            Map<String, String> d = msg.getData();
            String type = d == null ? null : d.get("type");
            if ("call".equals(type) && "1".equals(d.get("native"))) LfCall.incoming(getApplicationContext(), d);
            else if ("call_end".equals(type)) { LfCall.ended(getApplicationContext(), d.get("mid")); return; }
        } catch (Exception e) { /* ne jamais bloquer les autres notifications */ }
        super.onMessageReceived(msg);
    }
}
