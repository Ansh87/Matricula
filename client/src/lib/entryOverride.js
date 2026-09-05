// entryOverride.js - small helper for the new grouped navigation (Explore /
// Plan / Apply subtabs). Several subtabs point at a page that ALREADY has its
// own internal tab/mode switch (e.g. Majors.jsx's Single/Double major toggle,
// DecisionPlan.jsx's Final List / Course Plans / Timeline & Tasks switch).
// Rather than rebuilding those pages, a subtab click can request a specific
// internal tab via this one-shot "entry override": when `nonce` changes
// (bumped by the parent every time that specific subtab button is clicked),
// `setter(value)` runs once. It never fights the page's own persisted-state
// restore (which always runs on mount, before any nonce change from a later
// click), and it does nothing at all if the caller never passes a nonce --
// so direct/old navigation into these pages (e.g. via onGo("majors")) is
// completely unaffected.
import { useRef, useEffect } from "react";

export function useEntryOverride(value, nonce, setter) {
  const last = useRef(null);
  useEffect(() => {
    if (nonce == null || nonce === last.current) return;
    last.current = nonce;
    if (value !== undefined) setter(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
}
