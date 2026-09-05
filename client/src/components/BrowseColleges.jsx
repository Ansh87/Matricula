// BrowseColleges.jsx - search/explore the full U.S. database. Works WITHOUT
// running Matches. Not a personalized recommendation list.
import React, { useState } from "react";
import { api } from "../lib/api.js";
import { TopList } from "./TopList.jsx";
import { Spinner, SourceBadge, fmtUSD, fmtPct, RestoredNote, ClearSearchButton } from "./ui.jsx";
import { US_STATES } from "../lib/states.js";
import { usePersistedSearch } from "../lib/persistedSearch.js";

const SUBS = [
  ["all", "All Colleges"],
  ["stem", "Top STEM"],
  ["finance", "Top Finance"],
  ["business", "Top Business"],
];

const LIST_META = {
  stem: { title: "Top STEM colleges", blurb: "Curated exploration list with official cost/outcome data where available." },
  finance: { title: "Top Finance colleges", blurb: "Curated exploration list with official cost/outcome data where available." },
  business: { title: "Top Business colleges", blurb: "Curated exploration list with official cost/outcome data where available." },
};

export function BrowseColleges({ profile, onOpen, savedIds, onToggleSave, studentId }) {
  const [sub, setSub] = useState("all");

  // Persist which sub-tab (All/STEM/Finance/Business) was last open, so
  // returning to Browse Colleges lands back where the family left off.
  usePersistedSearch(studentId, "browseColleges:tab", { sub }, (restored) => {
    if (restored && restored.sub) setSub(restored.sub);
  });

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Browse</div>
        <h1>Browse colleges</h1>
        <p className="lead">Search and explore any college in the U.S. database.
          {" "}<strong>Browse results are not personalized recommendations.</strong></p>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {SUBS.map(([k, label]) => (
          <button key={k} className={`btn sm ${sub === k ? "primary" : "ghost"}`} onClick={() => setSub(k)}>{label}</button>
        ))}
      </div>

      {sub === "all"
        ? <AllColleges profile={profile} onOpen={onOpen} savedIds={savedIds} onToggleSave={onToggleSave} studentId={studentId} />
        : <TopList kind={sub} title={LIST_META[sub].title} blurb={LIST_META[sub].blurb}
            profile={profile} onOpen={onOpen} savedIds={savedIds} onToggleSave={onToggleSave} studentId={studentId} />}
    </div>
  );
}

function AllColleges({ profile, onOpen, savedIds, onToggleSave, studentId }) {
  const [name, setName] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [control, setControl] = useState("all");
  const [perPage, setPerPage] = useState(25);

  const [colleges, setColleges] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [searched, setSearched] = useState(false);

  // Issue 1: keep the search text, filters, and results on screen until the
  // family explicitly clears them -- restores on navigation back to this
  // page, on browser refresh (localStorage), and after logout/login on a
  // fresh browser (server). Never re-runs the search itself; it just
  // restores what was already on screen.
  const snapshot = { name, stateFilter, control, perPage, colleges, page, total, hasMore, searched };
  const { restoredFrom, clear: clearPersisted } = usePersistedSearch(studentId, "browseColleges:all", snapshot, (r) => {
    if (!r) return;
    if (r.name !== undefined) setName(r.name);
    if (r.stateFilter !== undefined) setStateFilter(r.stateFilter);
    if (r.control !== undefined) setControl(r.control);
    if (r.perPage !== undefined) setPerPage(r.perPage);
    if (r.colleges !== undefined) setColleges(r.colleges);
    if (r.page !== undefined) setPage(r.page);
    if (r.total !== undefined) setTotal(r.total);
    if (r.hasMore !== undefined) setHasMore(r.hasMore);
    if (r.searched !== undefined) setSearched(r.searched);
  });

  const run = async (nextPage = 0, append = false) => {
    setLoading(true); setErr(null);
    try {
      const r = await api.browseColleges({ name, state: stateFilter, control, page: nextPage, perPage });
      setColleges(append ? [...colleges, ...(r.colleges || [])] : (r.colleges || []));
      setTotal(r.total); setHasMore(!!r.hasMore); setPage(r.page ?? nextPage);
      setSearched(true);
    } catch (e) {
      setErr(e.message || "Couldn't search colleges.");
      if (!append) setColleges([]);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setName(""); setStateFilter(""); setControl("all");
    setColleges([]); setTotal(null); setHasMore(false); setErr(null); setSearched(false); setPage(0);
    clearPersisted();
  };

  return (
    <div className="stack">
      <div className="card pad">
        <label className="lbl">Search any U.S. college</label>
        <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
          <input className="inp" style={{ flex: 1, minWidth: 200 }} value={name} placeholder="College name - e.g. Rutgers, Purdue"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run(0)} />
          <select className="inp" style={{ width: "auto" }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All states</option>
            {US_STATES.map(([code, n]) => <option key={code} value={code}>{n}</option>)}
          </select>
          <select className="inp" style={{ width: "auto" }} value={control} onChange={(e) => setControl(e.target.value)}>
            <option value="all">All types</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select className="inp" style={{ width: "auto" }} value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
            {[20, 25, 50].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
          <button className="btn primary sm" onClick={() => run(0)}>Search</button>
          <ClearSearchButton onClear={reset} label="Clear search" />
        </div>
        <RestoredNote restoredFrom={restoredFrom} />
      </div>

      {loading && !colleges.length && <div className="card pad"><Spinner label="Searching College Scorecard…" /></div>}

      {err && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>
          Couldn't search right now: {err}
          <div className="note" style={{ marginTop: 4 }}>This is an API/connection problem, not proof that no colleges match.</div>
        </div>
      )}

      {searched && !err && (
        <div className="note">
          {total != null ? `${total.toLocaleString()} colleges match` : `${colleges.length} colleges`} ·
          {" "}showing {colleges.length}. Browse results are not personalized recommendations.
        </div>
      )}

      <div className="grid cols-2">
        {colleges.map((c) => (
          <BrowseCard key={c.id} c={c} profile={profile} saved={savedIds?.has(String(c.id))}
            onOpen={onOpen} onToggleSave={onToggleSave} />
        ))}
      </div>

      {hasMore && !loading && (
        <button className="btn ghost" onClick={() => run(page + 1, true)}>Load more</button>
      )}
      {loading && colleges.length > 0 && <div className="card pad"><Spinner label="Loading more…" /></div>}

      {searched && !loading && !err && !colleges.length && (
        <div className="empty">No colleges matched. Try a shorter name or clear the filters.</div>
      )}
    </div>
  );
}

// Simpler than a MatchCard. Personalized fit is computed only on request.
function BrowseCard({ c, profile, saved, onOpen, onToggleSave }) {
  const [scored, setScored] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalErr, setEvalErr] = useState(null);

  const evaluate = async () => {
    setEvaluating(true); setEvalErr(null);
    try {
      const r = await api.evaluateCollege(c.id, profile);
      setScored(r.scored);
    } catch (e) { setEvalErr(e.message || "Couldn't evaluate."); }
    finally { setEvaluating(false); }
  };

  return (
    <div className="card pad">
      <div className="row spread" style={{ alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: 14.5 }}>{c.name}</strong>
          <div className="note">{[c.city, c.state].filter(Boolean).join(", ")}{c.controlType ? ` · ${c.controlType}` : ""}</div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, margin: "10px 0" }}>
        <span className="pill">Admit {fmtPct(c.admissionRate) || "n/a"}</span>
        <span className="pill">SAT mid {c.satMidpoint ?? "n/a"}</span>
        <span className="pill">Net {fmtUSD(c.averageNetPrice) || "n/a"}</span>
        <span className="pill">Grad {c.graduationRate != null ? Math.round(c.graduationRate * 100) + "%" : "n/a"}</span>
      </div>

      {scored && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          <span className="pill" style={{ background: "var(--amber-b)" }}>
            Estimated fit based on your profile: {scored.overall ?? "-"}
          </span>
          {scored.coarseCategory && <span className="pill">{scored.coarseCategory}</span>}
        </div>
      )}
      {evalErr && <div className="note" style={{ color: "var(--reach)" }}>{evalErr}</div>}

      <div className="row spread">
        <SourceBadge level="official">Scorecard</SourceBadge>
        <div className="row" style={{ gap: 8 }}>
          {!scored && (
            <button className="link" onClick={evaluate} disabled={evaluating}>
              {evaluating ? "Evaluating…" : "Evaluate against my profile"}
            </button>
          )}
          <button className="btn ghost sm" onClick={() => onOpen(c.id)}>Details</button>
          <button className={`btn sm ${saved ? "ghost" : "amber"}`}
            onClick={() => onToggleSave({ college: { id: String(c.id), name: c.name, state: c.state }, admission: null, overall: null })}>
            {saved ? "Saved ✓" : "+ My List"}
          </button>
        </div>
      </div>
    </div>
  );
}
