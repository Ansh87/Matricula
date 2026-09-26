// SubscriptionProvider.jsx - centralized Matricula subscription state.
// Every component asks useSubscription() instead of calling RevenueCat.
//
// Subscription is separate from sign-in: a signed-in Matricula user is NOT
// automatically a subscriber. The only paid entitlement is `matricula`.
//
// Website (Railway): RevenueCat is never initialized, nothing is gated, and
// everything behaves exactly as it did before (hasPremiumAccess = true).
// Native iOS app: RevenueCat is configured once at launch, mapped to the
// Firebase UID, and premium features require the `matricula` entitlement.
// If RevenueCat fails for any reason, the free app keeps working and premium
// stays locked (never granted by accident).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  revenueCatSupported, hasMatriculaEntitlement, configureRevenueCat, syncIdentity,
  getCustomerInfo, addCustomerInfoListener, presentPaywall, restorePurchases as rcRestore,
} from "../services/revenueCat.js";

const SubscriptionContext = createContext(null);

const devLog = (...args) => { if (import.meta.env.DEV || revenueCatSupported) console.log("[Matricula/RevenueCat]", ...args); };

export function SubscriptionProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [customerInfo, setCustomerInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(revenueCatSupported);
  const [revenueCatAvailable, setRevenueCatAvailable] = useState(false);
  const [notice, setNotice] = useState(null); // short user-facing message
  const noticeTimer = useRef(null);

  const showNotice = useCallback((text) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  // 1) Configure RevenueCat once at launch (native only) + live updates.
  useEffect(() => {
    if (!revenueCatSupported) return;
    let cancelled = false;
    configureRevenueCat()
      .then(() => {
        if (cancelled) return;
        setRevenueCatAvailable(true);
        return addCustomerInfoListener((info) => { if (!cancelled) setCustomerInfo(info); });
      })
      .catch((err) => {
        devLog("configure failed", err);
        if (!cancelled) { setRevenueCatAvailable(false); setIsLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  // 2) Keep the RevenueCat customer in step with Firebase Auth (sign in,
  //    guest, sign out), then load that customer's entitlements.
  const uid = user?.uid || null;
  const isAnon = Boolean(user?.isAnonymous);
  useEffect(() => {
    if (!revenueCatSupported || authLoading) return;
    let cancelled = false;
    setIsLoading(true);
    syncIdentity(user)
      .then((info) => { if (!cancelled) { setCustomerInfo(info); setRevenueCatAvailable(true); } })
      .catch((err) => { devLog("identity/customerInfo failed", err); if (!cancelled) setCustomerInfo(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isAnon, authLoading]);

  const refreshSubscription = useCallback(async () => {
    if (!revenueCatSupported) return null;
    try {
      const info = await getCustomerInfo();
      setCustomerInfo(info);
      setRevenueCatAvailable(true);
      return info;
    } catch (err) {
      devLog("refresh failed", err);
      return null;
    }
  }, []);

  // Opens the RevenueCat dashboard paywall. `ifNeeded` = gated feature entry
  // (skips the paywall if `matricula` is already active).
  // Resolves to { result, unlocked }.
  const showPaywall = useCallback(async ({ ifNeeded = false } = {}) => {
    if (!revenueCatSupported) return { result: "NOT_AVAILABLE", unlocked: false };
    let result;
    try {
      result = await presentPaywall({ ifNeeded });
    } catch (err) {
      devLog("paywall failed", err);
      showNotice("Subscriptions aren't available right now. You can keep using the free features.");
      return { result: "ERROR", unlocked: false };
    }
    devLog("paywall result", result);
    if (result === "CANCELLED") return { result, unlocked: false }; // not an error
    if (result === "ERROR") {
      showNotice("Something went wrong with the purchase. Please try again.");
      return { result, unlocked: false };
    }
    // PURCHASED, RESTORED, NOT_PRESENTED -> re-read entitlements right away.
    const info = await refreshSubscription();
    const unlocked = hasMatriculaEntitlement(info);
    if (result === "PURCHASED" && unlocked) showNotice("Matricula is active. Thanks for subscribing!");
    if (result === "RESTORED") showNotice(unlocked ? "Purchases restored. Matricula is active." : "No active Matricula subscription was found to restore.");
    return { result, unlocked };
  }, [refreshSubscription, showNotice]);

  const restorePurchases = useCallback(async () => {
    if (!revenueCatSupported) return { unlocked: false };
    try {
      const info = await rcRestore();
      setCustomerInfo(info);
      const unlocked = hasMatriculaEntitlement(info);
      showNotice(unlocked ? "Purchases restored. Matricula is active." : "No active Matricula subscription was found to restore.");
      return { unlocked };
    } catch (err) {
      devLog("restore failed", err);
      showNotice("Couldn't restore purchases right now. Please try again.");
      return { unlocked: false };
    }
  }, [showNotice]);

  const isSubscriber = hasMatriculaEntitlement(customerInfo);

  const value = useMemo(() => ({
    isSubscriber,
    isLoading,
    customerInfo,
    revenueCatAvailable,
    // Premium gating only exists in the native iOS app. The website keeps
    // full access exactly as before.
    gatingActive: revenueCatSupported,
    hasPremiumAccess: !revenueCatSupported || isSubscriber,
    refreshSubscription,
    showPaywall,
    restorePurchases,
  }), [isSubscriber, isLoading, customerInfo, revenueCatAvailable, refreshSubscription, showPaywall, restorePurchases]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      {notice && <div className="rc-notice" role="status" onClick={() => setNotice(null)}>{notice}</div>}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within <SubscriptionProvider>");
  return ctx;
}
