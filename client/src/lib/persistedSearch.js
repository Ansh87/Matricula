// persistedSearch.js. Issue 1: keep search inputs, filters, tabs, and
// results on screen until the family explicitly clears them, across
// navigation, page refresh, and logout/login.
//
// Two layers, exactly as specced:
//   1. localStorage. Instant restore when switching tabs or refreshing the
//      browser, no network round trip needed.
//   2. Server (saved_search_sessions, see routes/misc.js). Restores the
//      same search on a different browser/device, or after clearing local
//      storage, as long as the family signs back in with the same Firebase
//      UID. Isolated per UID exactly like every other student-scoped table.
//
// This module only ever stores/restores plain UI-state objects that each
// page already builds for itself (search text, filters, results, pagination,
// selected tab). It never touches scoring, matching, or ranking. Those
// stay exactly as they were.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const VERSION = "v1";
function lsKey(uid, pageKey) { return `cgn.search.${VERSION}.${uid || "anon"}.${pageKey}`; }

function readLocal(uid, pageKey) {
  try {
    const raw = localStorage.getItem(lsKey(uid, pageKey));
    return raw === null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}
function writeLocal(uid, pageKey, value) {
  try { localStorage.setItem(lsKey(uid, pageKey), JSON.stringify(value)); } catch { /* storage unavailable/full. Server layer still covers logout/login */ }
}
function removeLocal(uid, pageKey) {
  try { localStorage.removeItem(lsKey(uid, pageKey)); } catch { /* ignore */ }
}

// usePersistedSearch(studentId, pageKey, snapshot, applySnapshot)
//   studentId     - current Firebase UID (or dev fallback id). Persistence is
//                   skipped entirely when falsy.
//   pageKey       - unique id for this search area, e.g. "browseColleges".
//   snapshot      - the page's current combined search/filter/result state,
//                   recomputed by the caller every render (plain object).
//   applySnapshot - (restored) => void, called at most once per mount (or
//                   per studentId change) with whatever was restored, so the
//                   caller can push it back into its own useState values.
//
// Returns { restoredFrom: "local" | "server" | null, clear() }. `clear()`
// removes both layers and resets restoredFrom, the caller is still
// responsible for resetting its own visible state (Clear search / Clear
// results / Reset filters buttons call the caller's own reset function too).
export function usePersistedSearch(studentId, pageKey, snapshot, applySnapshot) {
  const [restoredFrom, setRestoredFrom] = useState(null);
  const applyRef = useRef(applySnapshot);
  applyRef.current = applySnapshot;
  const appliedRef = useRef(false);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef(null);

  // Restore once per (studentId, pageKey).
  useEffect(() => {
    appliedRef.current = false;
    skipNextSaveRef.current = true;
    setRestoredFrom(null);
    if (!studentId || !pageKey) return;

    const local = readLocal(studentId, pageKey);
    if (local !== undefined && local !== null) {
      appliedRef.current = true;
      applyRef.current(local);
      setRestoredFrom("local");
      return;
    }
    let cancelled = false;
    api.getSearchState(studentId, pageKey).then((r) => {
      if (cancelled || appliedRef.current) return;
      if (r && r.state !== null && r.state !== undefined) {
        appliedRef.current = true;
        applyRef.current(r.state);
        writeLocal(studentId, pageKey, r.state);
        setRestoredFrom("server");
      }
    }).catch(() => { /* no saved state reachable. Page just starts blank */ });
    return () => { cancelled = true; };
  }, [studentId, pageKey]);

  // Persist on every snapshot change (skip the very first render so we never
  // clobber a not-yet-restored save with the page's blank initial state).
  const snapshotJson = JSON.stringify(snapshot);
  useEffect(() => {
    if (!studentId || !pageKey) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    writeLocal(studentId, pageKey, snapshot);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.saveSearchState(studentId, pageKey, snapshot).catch(() => { /* local copy still holds it */ });
    }, 700);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, pageKey, snapshotJson]);

  const clear = useCallback(() => {
    if (!studentId || !pageKey) return;
    removeLocal(studentId, pageKey);
    clearTimeout(saveTimerRef.current);
    skipNextSaveRef.current = true; // next snapshot change (the caller's own reset) shouldn't immediately re-save
    setRestoredFrom(null);
    api.clearSearchState(studentId, pageKey).catch(() => {});
  }, [studentId, pageKey]);

  return { restoredFrom, clear };
}

// Plain-text version of the "restored" note (JSX wrapper lives in
// components/ui.jsx as <RestoredNote/>, since this file has no JSX loader).
export function restoredNoteText(restoredFrom) {
  if (!restoredFrom) return null;
  return restoredFrom === "local" ? "Last search restored." : "Showing your saved search results.";
}

// Settings -> Local Saved Searches: a device-only clear, deliberately
// separate from the hook's own clear() above. clear() (used by each page's
// own "Clear search" button) removes BOTH layers, including the server copy
//. Appropriate when the family is on that page and means it. This helper
// only ever removes the localStorage copy on THIS browser/device, exactly
// matching Settings' "controls search results saved on this device" scope --
// it never touches the server-side saved_search_sessions row, so the same
// search is still there if the family opens the app on another device.
export function clearLocalSearch(uid, pageKey) {
  removeLocal(uid, pageKey);
}
