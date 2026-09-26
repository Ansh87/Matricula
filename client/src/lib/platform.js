// platform.js - the ONE place Matricula decides "am I running inside the
// native iOS (Capacitor) app, or in a normal browser (Railway website)?".
//
// Everything native-only (RevenueCat, the bottom tab bar, safe-area padding,
// hiding Google popup sign-in, the Railway API base URL) keys off these
// helpers, so the website never tries to call a native plugin.
//
// @capacitor/core is a small pure-JS package that is safe to import on the
// web: in a browser Capacitor.isNativePlatform() simply returns false.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform(); // "ios" | "android" | "web"
export const isNativeIOS = isNative && nativePlatform === "ios";

// Production backend the bundled iOS app talks to. The website keeps using
// same-origin relative "/api/..." paths (see lib/api.js), so this is only
// ever used inside the native app. Overridable at build time for testing
// against a different backend (e.g. a local server on your Mac's LAN IP).
export const NATIVE_API_BASE_URL =
  (import.meta.env.VITE_NATIVE_API_BASE_URL || "https://matricula.up.railway.app").replace(/\/+$/, "");
