// revenueCat.js - the ONLY file in Matricula that talks to the RevenueCat SDK.
// Components never import @revenuecat/* directly; they use useSubscription()
// (subscription/SubscriptionProvider.jsx), which calls into this service.
//
// Native iOS only. On the website (Railway) every function here is a safe
// no-op and the RevenueCat packages are never even loaded: they're pulled in
// with a dynamic import() that only runs inside the native app, so the web
// bundle can't hit a "plugin not implemented" error.
//
// Current configuration (RevenueCat dashboard, project "Matricula"):
//   Store:        RevenueCat Test Store (Next Gen hackathon build)
//   Entitlement:  matricula            <- the ONLY paid entitlement
//   Offering:     default  (package $rc_monthly, product "monthly", $9.99/mo)
//   Paywall:      "Matricula Monthly Paywall" (dashboard-hosted, native UI)
import { isNativeIOS } from "../lib/platform.js";

// Public client SDK key for the RevenueCat Test Store. This is the key the
// SDK is designed to ship inside the app (like Firebase's web config); it is
// NOT a secret REST/server API key. Overridable at build time so Phase 3 can
// swap in the production Apple key without touching code.
const REVENUECAT_API_KEY =
  import.meta.env.VITE_REVENUECAT_IOS_API_KEY || "test_tFNgMlojfdxUIIPttCleXEdAPFE";

// Verbose SDK logs in Xcode for this development build. Set
// VITE_REVENUECAT_DEBUG=false to quiet them.
const DEBUG_LOGS = import.meta.env.VITE_REVENUECAT_DEBUG !== "false";

export const ENTITLEMENT_ID = "matricula";

// True only inside the native iOS app. The website never uses RevenueCat.
export const revenueCatSupported = isNativeIOS;

// The single, reusable entitlement check. Everything that asks "is this
// person a Matricula subscriber?" goes through here.
export function hasMatriculaEntitlement(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);
}

let sdk = null;               // { Purchases, LOG_LEVEL, RevenueCatUI, PAYWALL_RESULT }
let configurePromise = null;  // configure() runs exactly once per app launch
let identityQueue = Promise.resolve(); // logIn/logOut must never overlap

async function loadSdk() {
  if (!revenueCatSupported) throw new Error("RevenueCat is only available in the iOS app.");
  if (!sdk) {
    const [core, ui] = await Promise.all([
      import("@revenuecat/purchases-capacitor"),
      import("@revenuecat/purchases-capacitor-ui"),
    ]);
    sdk = {
      Purchases: core.Purchases,
      LOG_LEVEL: core.LOG_LEVEL,
      RevenueCatUI: ui.RevenueCatUI,
      PAYWALL_RESULT: ui.PAYWALL_RESULT,
    };
  }
  return sdk;
}

// Configure once, anonymously. Identity (Firebase UID) is applied afterwards
// by syncIdentity(), which RevenueCat supports via logIn() at any time.
export function configureRevenueCat() {
  if (!revenueCatSupported) return Promise.resolve(false);
  if (!configurePromise) {
    configurePromise = (async () => {
      const { Purchases, LOG_LEVEL } = await loadSdk();
      if (DEBUG_LOGS) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG }).catch(() => {});
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      return true;
    })().catch((err) => {
      // Allow a later retry (e.g. first launch with no network).
      configurePromise = null;
      throw err;
    });
  }
  return configurePromise;
}

export async function getCustomerInfo() {
  await configureRevenueCat();
  const { Purchases } = await loadSdk();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

// Keeps the RevenueCat App User ID in step with Firebase Auth.
//  - Signed-in (email/Google) Firebase user: RevenueCat App User ID = Firebase
//    UID (never email/display name). If the device was on an anonymous
//    RevenueCat ID (e.g. a guest who purchased), logIn() carries that
//    purchase over to the signed-in account.
//  - Firebase Guest (anonymous) user: RevenueCat's own anonymous ID.
//  - Signed out: logOut() back to a fresh anonymous ID (only if currently
//    identified; logOut on an already-anonymous user is an SDK error).
// Returns the resulting CustomerInfo.
export function syncIdentity(firebaseUser) {
  const run = async () => {
    await configureRevenueCat();
    const { Purchases } = await loadSdk();
    const { isAnonymous } = await Purchases.isAnonymous();
    const wantsIdentified = Boolean(firebaseUser && !firebaseUser.isAnonymous && firebaseUser.uid);

    if (wantsIdentified) {
      const { appUserID } = await Purchases.getAppUserID();
      if (appUserID !== firebaseUser.uid) {
        const { customerInfo } = await Purchases.logIn({ appUserID: firebaseUser.uid });
        return customerInfo;
      }
    } else if (!isAnonymous) {
      const { customerInfo } = await Purchases.logOut();
      return customerInfo;
    }
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo;
  };
  const next = identityQueue.then(run, run);
  identityQueue = next.catch(() => {});
  return next;
}

export async function addCustomerInfoListener(callback) {
  await configureRevenueCat();
  const { Purchases } = await loadSdk();
  return Purchases.addCustomerInfoUpdateListener(callback);
}

// Presents the dashboard paywall ("Matricula Monthly Paywall", attached to
// the current/default offering). No custom React paywall exists in the app.
//  - presentPaywall():          user tapped "Unlock Matricula"
//  - presentPaywallIfNeeded():  user tried a premium feature; RevenueCat skips
//                               the paywall (NOT_PRESENTED) if `matricula` is
//                               already active.
// Returns one of: "PURCHASED" | "RESTORED" | "CANCELLED" | "ERROR" | "NOT_PRESENTED".
export async function presentPaywall({ ifNeeded = false } = {}) {
  await configureRevenueCat();
  const { RevenueCatUI } = await loadSdk();
  const { result } = ifNeeded
    ? await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT_ID, displayCloseButton: true })
    : await RevenueCatUI.presentPaywall({ displayCloseButton: true });
  return String(result);
}

export async function restorePurchases() {
  await configureRevenueCat();
  const { Purchases } = await loadSdk();
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}
