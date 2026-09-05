// firebaseAuth.js - verifies Firebase ID tokens with the Admin SDK and attaches
// the authenticated user to the request. Identity only; no Firestore, no change
// to the app's own database model. Service-account credentials live ONLY here on
// the server and are never sent to the client.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { config } from "../config.js";

let initialized = false;
let initError = null;

// Lazily initialize the Admin SDK from whatever credentials are configured.
// Prefer FIREBASE_SERVICE_ACCOUNT_JSON (one blob, easiest on Railway); otherwise
// use the three discrete fields. If neither is present, we don't initialize -
// protected routes then 401 (unless dev bypass is on).
function ensureInit() {
  if (initialized || initError) return;
  try {
    let credentialObj = null;

    if (config.firebase.serviceAccountJson) {
      const raw = config.firebase.serviceAccountJson.trim();
      // Some dashboards (and copy/paste) wrap the whole blob in extra quotes.
      const unwrapped = (raw.startsWith('"') && raw.endsWith('"')) ? raw.slice(1, -1) : raw;
      credentialObj = JSON.parse(unwrapped);
      // The private_key inside the JSON often arrives with LITERAL "\n" sequences
      // (env vars can't hold real newlines). Restore them or cert() will reject it.
      if (credentialObj.private_key) {
        credentialObj.private_key = credentialObj.private_key.replace(/\\n/g, "\n");
      }
    } else if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
      credentialObj = {
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        // Railway/dotenv often escape newlines in the private key; restore them.
        privateKey: config.firebase.privateKey.replace(/\\n/g, "\n"),
      };
    }

    if (!credentialObj) {
      initError = new Error("Firebase Admin credentials not configured.");
      console.error("[auth] Firebase Admin NOT initialized: no credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON.");
      return;
    }
    // firebase-admin v13+ is modular: use getApps()/initializeApp()/cert()
    // (the old admin.apps / admin.credential.cert surface no longer exists).
    if (getApps().length === 0) {
      initializeApp({ credential: cert(credentialObj) });
    }
    initialized = true;
    console.log("[auth] Firebase Admin initialized OK.");
  } catch (e) {
    // Log the REASON only - never the key material or token.
    initError = new Error(`Firebase Admin init failed: ${e.message.slice(0, 160)}`);
    console.error("[auth] Firebase Admin init FAILED:", e.message.slice(0, 160));
  }
}

// Report real initialization status (used by /api/health). Actually attempts
// init rather than merely checking that env strings exist, so health can't
// disagree with what protected routes experience.
export function authStatus() {
  if (config.authDevBypass) return "DEV BYPASS (no Firebase - local only)";
  ensureInit();
  if (initialized) return "Firebase Admin configured";
  return `NOT configured - ${initError ? initError.message : "unknown reason"}`;
}

// A fixed dev user used only when AUTH_DEV_BYPASS=true and NODE_ENV!=="production".
const DEV_USER = { uid: "dev-local-user", email: "dev@localhost", name: "Local Dev" };

// Express middleware: require a valid Firebase ID token.
export async function requireAuth(req, res, next) {
  // Local dev bypass (never in production; off unless explicitly enabled).
  if (config.authDevBypass) {
    req.user = DEV_USER;
    return next();
  }

  ensureInit();
  if (!initialized) {
    return res.status(503).json({
      error: "auth_unconfigured",
      message: `Authentication is not working on the server. ${initError ? initError.message : "Set FIREBASE_SERVICE_ACCOUNT_JSON."}`,
    });
  }

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "unauthorized", message: "Missing or malformed Authorization header." });
  }
  const idToken = match[1];

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || decoded.email || null,
    };
    return next();
  } catch (e) {
    // Do not log the token. Log only that verification failed.
    return res.status(401).json({ error: "unauthorized", message: "Invalid or expired authentication token." });
  }
}

// Resolve the effective per-user data key. Authenticated requests are ALWAYS
// keyed by the Firebase UID (user isolation). Any studentId in the URL/body is
// ignored for authed requests so a user can never read another user's data by
// guessing an id.
export function effectiveStudentId(req, fallback) {
  if (req.user && req.user.uid) return req.user.uid;
  return fallback || null;
}
