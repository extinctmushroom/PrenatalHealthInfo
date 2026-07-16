/* Lazily initializes one shared Firebase app instance (auth + Firestore).
   The Firebase SDK is loaded from the CDN ONLY when real config is present,
   via dynamic import — so the site (and the dashboard's local demo mode) work
   fully even offline or before Firebase is set up. */
import { firebaseConfig, isConfigured } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

let cached = null;

/* Returns { auth, db, authMod, fsMod, loadError } — auth/db are null when
   unconfigured OR when the SDK couldn't be fetched (loadError=true), so pages
   can fall back to local mode instead of dying on a network hiccup. */
export async function initFirebase() {
  if (cached) return cached;
  if (!isConfigured()) {
    cached = { auth: null, db: null, authMod: null, fsMod: null, loadError: false };
    return cached;
  }
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    cached = { auth: authMod.getAuth(app), db: fsMod.getFirestore(app), authMod, fsMod, loadError: false };
  } catch (err) {
    console.warn("Willow: Firebase SDK failed to load; continuing in local mode.", err);
    cached = { auth: null, db: null, authMod: null, fsMod: null, loadError: true };
  }
  return cached;
}

export { isConfigured };
