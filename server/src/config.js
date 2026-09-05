// config.js - central configuration. All secrets come from environment variables.
// NOTHING here is ever sent to the browser. The client talks only to our own /api routes.
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,

  // College Scorecard (U.S. Dept. of Education). The public API accepts DEMO_KEY
  // (1,000 req/hr, 10,000/day) but you should register your own free key at
  // https://api.data.gov/signup/ for production use.
  scorecard: {
    apiKey: process.env.COLLEGE_SCORECARD_API_KEY || "DEMO_KEY",
    baseUrl: "https://api.data.gov/ed/collegescorecard/v1/schools",
    usingDemoKey: !process.env.COLLEGE_SCORECARD_API_KEY,
  },

  // Bureau of Labor Statistics. A registered key raises limits (v2). Optional:
  // without a key we fall back to the bundled, clearly-dated BLS OOH snapshot.
  bls: {
    apiKey: process.env.BLS_API_KEY || null,
    baseUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
  },

  // Cache time-to-live for live API responses (ms). Default 24h.
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 24 * 60 * 60 * 1000),

  // Flag cached rows older than this as "stale" in responses. Default 7 days.
  staleAfterMs: Number(process.env.STALE_AFTER_MS || 7 * 24 * 60 * 60 * 1000),

  // Optional Google Gemini (free tier available at aistudio.google.com/apikey).
  // Used ONLY for optional document parsing. Without it, uploads still work and
  // you enter fields manually. Note: on Google's FREE tier, inputs may be used
  // to improve their models - the app tells users this.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },

  uploadDir: process.env.UPLOAD_DIR || "./uploads",

  dbPath: process.env.DB_PATH || "./matricula.db",

  // Firebase Admin - identity verification only. Prefer a single JSON blob
  // (easiest on Railway); fall back to the three discrete fields. NONE of this
  // is ever sent to the browser.
  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null,
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || null,
    privateKey: process.env.FIREBASE_PRIVATE_KEY || null,
  },

  // Local-only auth bypass. NEVER active in production, and off unless explicitly
  // set. When on (dev only), requests resolve to a fixed dev user so the app is
  // usable without Firebase configured.
  authDevBypass: process.env.AUTH_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production",
  nodeEnv: process.env.NODE_ENV || "development",
};

export function keyStatus(authStatusText) {
  return {
    scorecard: config.scorecard.usingDemoKey ? "DEMO_KEY (shared, rate-limited)" : "configured",
    bls: config.bls.apiKey ? "configured" : "not set (using bundled BLS snapshot)",
    gemini: config.gemini.apiKey ? `configured (${config.gemini.model})` : "not set (document parsing manual)",
    // Real status is passed in by the caller (index.js) from the auth middleware,
    // so health can never claim "configured" while protected routes are 503-ing.
    // Importing it here would create a config <-> middleware circular import.
    auth: authStatusText || "unknown",
  };
}
