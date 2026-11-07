# Notifications de l'appli (appli fermée) + chiffre sur l'icône

## Ce qui est déjà fait (code)

- **Chiffre sur l'icône** = messages privés + groupes privés où je suis + discussions
  des événements où je suis inscrit. Les salons publics ne comptent pas.
  Il se remet à zéro dès qu'on lit.
- **Appli ouverte** : le chiffre se met à jour tout seul (module `@capawesome/capacitor-badge`,
  présent dès la prochaine version des stores ; appli web installée : `setAppBadge`).
- **Appli fermée** : le serveur (`functions/index.js`) envoie une vraie notification avec
  le chiffre, seulement pour ces messages-là :
  `dmPush`, `groupPush`, `eventChatPush`. Les salons publics (`chatPush`) ne partent plus
  que vers l'appli web, sans chiffre.
- Toucher la notification ouvre directement la bonne conversation.

## Ce qu'il reste à faire au PC (une seule fois)

1. **Google** : activer la validation en deux étapes sur le compte qui a Firebase
   (sinon la console Firebase refuse l'accès).
2. **Firebase → Realtime Database → Règles** : coller les blocs `events`,
   `eventMessages` et `unread` de `COMMUNAUTE.md`, puis **Publier**.
3. **Apple Developer** (developer.apple.com → Certificates, IDs & Profiles) :
   - Identifiers → `fr.litefoil.tracker` → cocher **Push Notifications** → Save.
   - Keys → **+** → cocher **Apple Push Notifications service (APNs)** → télécharger le
     fichier `.p8` (noter le Key ID et le Team ID `CKZ892CTBW`).
4. **Firebase → Paramètres du projet (⚙)** :
   - **Cloud Messaging** → Apple → envoyer la clé `.p8` (Key ID + Team ID).
   - **Général → Tes applications** : ajouter une appli **iOS** (`fr.litefoil.tracker`)
     → télécharger `GoogleService-Info.plist` → le mettre dans `ios-assets/`.
   - Ajouter une appli **Android** (`fr.litefoil.tracker`) → télécharger
     `google-services.json` → le mettre dans `android-assets/`.
5. **Mettre en ligne le serveur de notifications** (dans le dossier du projet) :
   `npm install -g firebase-tools`, `firebase login`, puis
   `firebase deploy --only functions`.
6. **Nouvelle version des applis** : lancer les builds Codemagic iOS et Android.
   Dès que les deux fichiers de l'étape 4 sont dans le dépôt, la recette ajoute toute
   seule le module de notifications (`@capacitor-firebase/messaging`), le droit
   « push » iOS et la permission Android.

7. **Vidéos des riders** : Firebase → **Passer au forfait Blaze** (paiement à l'usage),
   puis **Storage → Commencer** (région Europe). Coller les règles Storage et les règles
   `videos` / `videoComments` de `COMMUNAUTE.md`. Ajouter ton identifiant dans
   `official` pour pouvoir supprimer n'importe quelle vidéo. Conseil : mettre une
   **alerte de budget** (Google Cloud → Facturation → Budgets, ex. 20 €/mois).

Le serveur de l'étape 5 met aussi en route le compte **Équipe Lite Foil** : message
d'accueil privé à chaque nouveau membre, météo du week-end dans chaque salon le vendredi
à 17 h et conseil de la semaine le mardi à 18 h (voir `COMMUNAUTE.md`).

Tant que les étapes 3 à 6 ne sont pas faites, l'appli marche comme avant : le chiffre
s'affiche quand on ouvre l'appli, mais pas de notification appli fermée.
