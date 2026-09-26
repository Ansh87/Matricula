// firebase.js - client Firebase setup (identity only). All values come from
// Vite build-time env vars (VITE_*). These are NOT secrets - Firebase web config
// is public by design; the service account (server-only) is what stays private.
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider } from "firebase/auth";
import { isNative } from "./platform.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// True only when the essential fields are present. Lets the app show a clear
// "auth not configured" message locally instead of throwing on a blank config.
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

let app = null;
let auth = null;
if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // Website: unchanged (getAuth, with popup support for Google sign-in).
  // Native iOS app: getAuth() pulls in the browser popup/redirect resolver,
  // which is known to stall inside Capacitor's iOS WebView (auth state never
  // resolves). initializeAuth with IndexedDB persistence avoids that and still
  // keeps the user signed in between launches. Email and Guest sign-in work
  // this way; Google popup sign-in is hidden in the native app (Login.jsx).
  auth = isNative
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app);
}

export { app, auth };
export const googleProvider = new GoogleAuthProvider();
