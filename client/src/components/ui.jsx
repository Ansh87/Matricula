// ui.jsx - shared primitives. The provenance badge is the signature element:
// every value shows where it came from and how confident we are.
import React, { useState } from "react";
import { api } from "../lib/api.js";

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
      <strong>How to read this tool.</strong> Matricula is a planning aid built by a student, not a
      counseling service or an admissions office. College facts come from the U.S. Department of Education
      College Scorecard; career figures from the U.S. Bureau of Labor Statistics; admissions details from each
      college’s official site or Common Data Set, each labeled with its source and review date. Fit scores and
      Reach/Target/Safety categories are <em>estimates</em> generated from that data. Admissions are holistic
      and unpredictable, and these estimates are not guarantees. Costs and aid vary by family - always confirm
      with each college’s official net price calculator and admissions office before making decisions.
    </div>
  );
}
