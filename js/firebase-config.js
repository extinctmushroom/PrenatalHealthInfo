/* ============================================================
   Firebase configuration
   ------------------------------------------------------------
   1. Create a project at https://console.firebase.google.com
   2. Add a Web App, then copy its config values below.
   3. In the console: Build → Authentication → Sign-in method →
      enable "Email/Password".
   4. Build → Firestore Database → Create database (production mode),
      then paste the rules from firestore.rules (in the repo root).

   These keys are NOT secret — Firebase web API keys are meant to be
   public. Access is protected by Firebase Security Rules, not the key.
   ============================================================ */

export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

/* Returns true once real values have been filled in above. */
export function isConfigured() {
  return firebaseConfig.apiKey &&
         !firebaseConfig.apiKey.startsWith("YOUR_") &&
         firebaseConfig.projectId &&
         !firebaseConfig.projectId.startsWith("YOUR_");
}
