// ui.jsx - shared primitives. The provenance badge is the signature element:
// every value shows where it came from and how confident we are.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import { searchMajors } from "../lib/majors.js";

export const fmtPct = (v) => (v == null ? null : `${(v * 100).toFixed(1)}%`);
export const fmtUSD = (v) => (v == null ? null : `$${Number(v).toLocaleString()}`);
export const fmtNum = (v) => (v == null ? null : Number(v).toLocaleString());

// SourceBadge: Official | Verified | Estimated | Unavailable
export function SourceBadge({ level, children }) {
  const l = (level || "unavailable").toLowerCase();
  const label = children || l[0].toUpperCase() + l.slice(1);
  return <span className={`src ${l}`}>{label}</span>;
}

// DataField: label + value + provenance. If value is null/undefined, renders the
// spec-mandated "Data unavailable" treatment instead of inventing anything.
export function DataField({ label, value, level = "official", source, na = "Data unavailable" }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="field">
      <div className="field-row">
        <span className="k">{label}</span>
        <SourceBadge level={missing ? "unavailable" : level} />
      </div>
      {missing
        ? <span className="v na">{na}</span>
        : <span className="v">{value}</span>}
      {source && !missing && <span className="note" style={{ fontSize: 11 }}>Source: {source}</span>}
    </div>
  );
}

const GLYPH = { Reach: "▲", Target: "◆", Safety: "●", Unknown: "○" };
export function CategoryTag({ category, label, range }) {
  const c = category || "Unknown";
  return (
    <span className={`cat ${c}`} title={range ? `Estimated admission probability: ${range}` : ""}>
      <span className="glyph">{GLYPH[c]}</span>
      {c}{label ? ` · ${label}` : ""}
    </span>
  );
}

export function Meter({ value }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="meter"><span style={{ width: `${v}%` }} /></div>;
}

export function Spinner({ label }) {
  return <div className="row" style={{ gap: 10, color: "var(--muted)", fontSize: 13 }}>
    <span className="spinner" /> {label || "Loading official data…"}
  </div>;
}

// InlineSpinner: a small spinner glyph meant to sit inside a busy button, next
// to its "Searching…"/"Saving…" label, so long-running actions show a visible
// spinner AND status text, not just text alone.
export function InlineSpinner() {
  return <span className="spinner-sm" aria-hidden="true" />;
}

// useAutocompleteSearch: the ONE debounced, race-guarded type-ahead search
// engine behind every autocomplete in Matricula (CollegeAutocomplete below,
// MajorAutocomplete below, and any future *Autocomplete). Takes a `search(q)`
// function -- async or sync, network-backed (api.searchColleges) or a plain
// in-memory filter (searchMajors) -- and handles everything that's specific
// to type-ahead UX so callers never re-implement it:
//  - Fires NO request while the box is empty or on mount.
//  - Only searches once the trimmed query is >= minChars (default 2).
//  - Debounces ~300-400ms (default 350) so it doesn't fire on every keystroke.
//  - A request-id guard discards any response that isn't from the latest
//    keystroke, so a slow early response can never overwrite fresher results
//    or leave the loading state stuck on.
//  - Loading indicator reflects ONLY an in-flight request; every path
//    (success, empty result, error) explicitly turns it off.
//  - Tracks a keyboard-navigation highlight index (Up/Down/Enter/Escape) so
//    every autocomplete gets the same keyboard support for free.
export function useAutocompleteSearch(search, { minChars = 2, debounceMs = 350 } = {}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const timerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const runSearch = (q) => {
    const myId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    Promise.resolve(search(q))
      .then((items) => {
        if (requestIdRef.current !== myId) return; // a newer keystroke superseded this response
        setResults(items || []);
        setHighlight(-1);
      })
      .catch((e) => {
        if (requestIdRef.current !== myId) return;
        setError(e?.message || "Search failed. Try again.");
        setResults([]);
      })
      .finally(() => {
        if (requestIdRef.current !== myId) return; // stale request finishing late -- don't touch loading
        setLoading(false);
        setSearchedOnce(true);
      });
  };

  // Duplicate-call guard: identical consecutive queries (e.g. a keystroke
  // that doesn't change the trimmed value, like a leading space) don't
  // re-fire a search that's already in flight or already answered.
  const lastFiredRef = useRef(null);

  const onQueryChange = (q) => {
    setQuery(q);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = q.trim();
    if (trimmed.length < minChars) {
      requestIdRef.current++; // invalidate any in-flight/pending request from a previous keystroke
      lastFiredRef.current = null;
      setLoading(false);
      setResults([]);
      setError(null);
      setSearchedOnce(false);
      setHighlight(-1);
      return;
    }
    timerRef.current = setTimeout(() => {
      if (lastFiredRef.current === trimmed) return; // avoid a duplicate call for an unchanged query
      lastFiredRef.current = trimmed;
      runSearch(trimmed);
    }, debounceMs);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestIdRef.current++;
    lastFiredRef.current = null;
    setQuery(""); setResults([]); setLoading(false); setError(null);
    setOpen(false); setSearchedOnce(false); setHighlight(-1);
  };

  // Attach to the input's onKeyDown. `onSelect(item)` is called for Enter on
  // a highlighted result; Escape just closes the dropdown (caller can also
  // handle Escape itself first if it needs to do something extra).
  const onKeyDown = (e, { onSelect } = {}) => {
    if (e.key === "Escape") { setOpen(false); setHighlight(-1); return; }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1)); }
    else if (e.key === "Enter" && highlight >= 0 && highlight < results.length) {
      e.preventDefault();
      onSelect && onSelect(results[highlight]);
    }
  };

  return { query, setQuery, results, loading, error, open, setOpen, searchedOnce, highlight, onQueryChange, reset, onKeyDown };
}

// CollegeAutocomplete: debounced type-ahead college search, built on
// useAutocompleteSearch above. Reuses the exact same canonical search the
// Explorer/Browse Colleges page already uses (api.searchColleges -> GET
// /api/colleges/search -> the same College Scorecard-backed college
// records/IDs as everywhere else in the app) -- no separate hardcoded
// college list, no duplicated search logic.
//
// `value` is always either null or {collegeId, collegeName} (collegeId can
// be null for a manually-confirmed name that isn't in Scorecard -- same
// shape existing callers already expect).
export function CollegeAutocomplete({ value, onChange, placeholder }) {
  const search = useCallback((q) => api.searchColleges({ name: q }).then((r) => r.results || []), []);
  const { query, results, loading, error, open, setOpen, searchedOnce, highlight, onQueryChange, reset, onKeyDown } =
    useAutocompleteSearch(search, { minChars: 2, debounceMs: 350 });

  const select = (c) => { onChange({ collegeId: c.id, collegeName: c.name }); reset(); };
  const useTypedName = () => { onChange({ collegeId: null, collegeName: query.trim() }); reset(); };
  const change = () => { onChange(null); reset(); };

  if (value && value.collegeName) {
    return (
      <div className="college-autocomplete-selected">
        <div>
          <div className="note" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px" }}>Selected college</div>
          <div style={{ fontWeight: 600 }}>{value.collegeName}</div>
        </div>
        <button type="button" className="btn ghost sm" onClick={change}>Change college</button>
      </div>
    );
  }

  return (
    <div className="college-autocomplete"
      onBlur={(e) => {
        // A plain blur fires before a result button's own click handler, so
        // delay closing just long enough for that click to register.
        if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setOpen(false), 150);
      }}>
      <input
        className="inp"
        type="text"
        value={query}
        placeholder={placeholder || "Search colleges..."}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => onKeyDown(e, { onSelect: select })}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {loading && <div style={{ marginTop: 4 }}><Spinner label="Searching colleges..." /></div>}
      {open && !loading && error && (
        <div className="note" style={{ marginTop: 4, color: "var(--reach)" }}>{error}</div>
      )}
      {open && !loading && !error && searchedOnce && results.length === 0 && query.trim().length >= 2 && (
        <div className="note" style={{ marginTop: 4 }}>
          No colleges found. Try another search, or{" "}
          <button type="button" className="link" onMouseDown={(ev) => ev.preventDefault()} onClick={useTypedName}>
            use "{query.trim()}" as typed
          </button>.
        </div>
      )}
      {open && !loading && results.length > 0 && (
        <div className="college-autocomplete-results">
          {results.map((c, i) => (
            <button type="button" key={c.id}
              className={`college-autocomplete-item${i === highlight ? " highlighted" : ""}`}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => select(c)}>
              <strong>{c.name}</strong>
              <span className="note">{[c.city, c.state].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// MajorAutocomplete: the same debounced type-ahead pattern as
// CollegeAutocomplete, but for majors instead of colleges. Backed by
// lib/majors.js's ALL_MAJORS -- the same CIP-backed list the Profile page's
// Intended Major fields and Explorer's Single/Double-Major Planner both
// already draw from, so results are always Matricula's real major list, not
// a separate invented one.
//
// Unlike colleges (an open-ended real-world list -- any name might be a real
// school Scorecard just doesn't have indexed yet), majors are a curated,
// closed set here, but the underlying search fields historically accepted
// free text (the server's CIP matching already tolerates phrases like
// "computer science and engineering"). So this stays a plain, always-editable
// text field -- `value`/`onChange` mirror every keystroke exactly like a
// normal input -- with a suggestions dropdown layered on top rather than a
// CollegeAutocomplete-style "select and lock" card. Selecting a suggestion
// just overwrites the field with the canonical spelling; typing anything
// else is still accepted and still submitted by the caller's own Search
// action, so no existing search/matching behavior changes.
export function MajorAutocomplete({ value, onChange, placeholder, onEnter }) {
  const search = useCallback((q) => Promise.resolve(searchMajors(q)), []);
  const { results, searchedOnce, open, setOpen, highlight, onQueryChange, onKeyDown } =
    useAutocompleteSearch(search, { minChars: 2, debounceMs: 300 });

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    onQueryChange(v); // the same typed text drives the suggestion search
  };

  const select = (m) => { onChange(m); setOpen(false); };

  return (
    <div className="major-autocomplete"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setOpen(false), 150);
      }}>
      <input
        className="inp"
        type="text"
        value={value || ""}
        placeholder={placeholder || "Search majors..."}
        onChange={handleChange}
        onFocus={() => { if ((value || "").trim().length >= 2) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(open && results.length > 0 && highlight >= 0)) {
            onEnter && onEnter(); // let Enter still trigger the page's own Search action
            return;
          }
          onKeyDown(e, { onSelect: select });
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && results.length > 0 && (
        <div className="college-autocomplete-results">
          {results.map((m, i) => (
            <button type="button" key={m}
              className={`college-autocomplete-item${i === highlight ? " highlighted" : ""}`}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => select(m)}>
              <strong>{m}</strong>
            </button>
          ))}
        </div>
      )}
      {open && searchedOnce && results.length === 0 && (value || "").trim().length >= 2 && (
        <div className="note" style={{ marginTop: 4 }}>
          No matching majors in Matricula's list - you can still search with what you typed.
        </div>
      )}
    </div>
  );
}

// Part L: "Set up application planning for this college" -- one button
// (used from My List and Decision Plan) that creates a starting application-
// pathway record, attempts to verify a timeline, finds essay prompts, and
// adds a verification task, all in one go. Deliberately a click-to-run
// button rather than something that fires automatically when a college is
// saved, so it never silently creates records/clutter for a college the
// family hasn't committed to yet.
export function SetupPlanningButton({ studentId, collegeId, collegeName, state }) {
  const [status, setStatus] = useState("idle"); // idle | busy | done | error
  const [result, setResult] = useState(null);

  const run = async () => {
    setStatus("busy"); setResult(null);
    try {
      const r = await api.setupApplicationPlanning(studentId, { collegeId, collegeName, state });
      setResult(r);
      setStatus("done");
    } catch (e) {
      setResult({ error: e.message });
      setStatus("error");
    }
  };

  if (status === "idle") return <button className="btn ghost sm" onClick={run}>Set up application planning →</button>;
  if (status === "busy") return <span className="note">Setting up (checking official pages, this can take a bit)...</span>;
  if (status === "error") return <span className="note" style={{ color: "var(--reach)" }}>Couldn't finish setup: {result?.error}</span>;

  const parts = [];
  if (result.requirementCreated) parts.push("started an application pathway record");
  if (result.timelineDiscovery?.eventsFound) parts.push(`found ${result.timelineDiscovery.eventsFound} timeline date(s)`);
  if (result.essayDiscovery?.promptsFound) parts.push(`found ${result.essayDiscovery.promptsFound} essay prompt(s)`);
  if (result.taskCreated) parts.push("added a verification task");
  return (
    <span className="note">
      {parts.length ? `Done: ${parts.join(", ")}. ` : "Already set up -- nothing new to add. "}
      Everything is still marked "Needs manual verification" until confirmed.
    </span>
  );
}

// SuccessNote: a brief, friendly confirmation banner (e.g. "Found 42 colleges",
// "Saved to your Decision Plan"). Used after a long-running action completes,
// alongside Spinner (in-progress) and ErrorNote (failed).
export function SuccessNote({ children }) {
  return (
    <div className="note" style={{ color: "var(--safety)", fontWeight: 600, marginTop: 6 }}>
      ✓ {children}
    </div>
  );
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="disclaimer" style={{ borderLeftColor: "var(--reach)", background: "#f7ece8" }}>
      <strong>Couldn’t load official data.</strong> {children}
      {onRetry && <> <button className="link" onClick={onRetry}>Try again</button></>}
    </div>
  );
}

// RestoredNote / SearchStateBar: shared UI for Issue 1 (search/results
// persistence). Shown wherever a page rehydrated a previous search from
// localStorage or the server, plus the explicit "Clear search" / "Clear
// results" / "Start new search" actions the spec requires -- nothing is ever
// cleared automatically just because the family navigated away and back.
export function RestoredNote({ restoredFrom }) {
  if (!restoredFrom) return null;
  return (
    <div className="note" style={{ fontSize: 11.5, color: "var(--muted)" }}>
      {restoredFrom === "local" ? "Last search restored." : "Showing your saved search results."}
    </div>
  );
}

export function ClearSearchButton({ onClear, label = "Clear search" }) {
  if (!onClear) return null;
  return <button className="btn ghost sm" onClick={onClear}>{label}</button>;
}

// The full legal disclaimer required by the spec.
export function LegalDisclaimer() {
  return (
    <div className="disclaimer">
      <strong>Disclaimer:</strong> Matricula is an educational planning tool, not a counseling service or
      admissions office. Admissions are holistic and unpredictable, and Matricula's estimates are not guarantees.
      College costs, financial aid, deadlines, scholarships, programs, policies, and career outcomes can change
      over time. Always verify important information with official college sources, admissions and
      financial-aid offices, net price calculators, FAFSA/CSS Profile resources, and your school counselor
      before making decisions.
      <br /><br />
      Matricula was developed by high school student Ansh Saini as an independent educational technology
      project to help students explore college, major, career, and application-planning options using
      data-driven tools.
    </div>
  );
}
