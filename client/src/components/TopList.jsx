// TopList.jsx - a curated, editorial ranking (STEM / Finance / Business) with
// live College Scorecard data and personalized fit estimates layered on.
// Replaces the single-purpose TopStem so all three lists share one code path.
import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Spinner, CategoryTag, SourceBadge, fmtUSD, fmtPct } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

const SIZES = [10, 20, 30, 50];

export function TopList({ kind, title, blurb, profile, onOpen, savedIds, onToggleSave, studentId }) {
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Persist the Top 10/20/30/50 size per list (STEM/Finance/Business) -- the
  // list itself always re-fetches live (it's not a saved result set), but
  // the family's chosen size shouldn't reset every time they navigate back.
  usePersistedSearch(studentId, `topList:${kind}`, { limit }, (r) => {
    if (r && r.limit) setLimit(r.limit);
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    api.topList(kind, profile, limit)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setErr(e.message || "Couldn't load this list."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, limit, profile]);

  const colleges = data?.colleges || [];
  const count = (pred) => colleges.filter(pred).length;
  const isReach = (c) => (c.scored?.coarseCategory || "") === "Reach";
  const isTarget = (c) => (c.scored?.coarseCategory || "") === "Target";
  const isSafety = (c) => (c.scored?.coarseCategory || "") === "Safety";

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Ranked list</div>
        <h1>{title}</h1>
        <p className="lead">{blurb}</p>
      </div>

      <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
        <span className="note" style={{ fontWeight: 600 }}>Show:</span>
        {SIZES.filter((n) => !data || n <= data.total + 20).map((n) => (
          <span key={n} className={`chip ${limit === n ? "on" : ""}`} onClick={() => setLimit(n)}>Top {n}</span>
        ))}
        {data?.total != null && <span className="note" style={{ marginLeft: "auto" }}>{data.total} colleges in this list</span>}
      </div>

      {data?.note && (
        <div className="disclaimer">
          {data.note}
        </div>
      )}

      {!loading && colleges.length > 0 && (
        <div className="kpis">
          <div className="kpi"><div className="n">{colleges.length}</div><div className="l">Colleges shown</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{count(isReach)}</div><div className="l">▲ Reach</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{count(isTarget)}</div><div className="l">◆ Target</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{count(isSafety)}</div><div className="l">● Safety</div></div>
          <div className="kpi"><div className="n">{count((c) => savedIds?.has(String(c.id)))}</div><div className="l">On my list</div></div>
        </div>
      )}

      {loading && <div className="card pad"><Spinner label={`Ranking ${kind} colleges…`} /></div>}
      {err && <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>Couldn't load this list: {err}</div>}

      {!loading && !err && colleges.map((c) => (
        <TopListCard key={c.id} c={c} profile={profile}
          onOpen={onOpen} savedIds={savedIds} onToggleSave={onToggleSave} />
      ))}
    </div>
  );
}

// One ranked card, with an "Evaluate against my profile" link matching the
// All Colleges (Browse) behavior. These lists already auto-score on load, so
// the link reveals that fit inline; if a card had no official data at load
// time, it falls back to a live evaluate (same call Browse uses).
function TopListCard({ c, profile, onOpen, savedIds, onToggleSave }) {
  const o = c.official;
  // Seed from the score computed when the list loaded, if present.
  const [scored, setScored] = useState(c.scored || null);
  const [revealed, setRevealed] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalErr, setEvalErr] = useState(null);

  const evaluate = async () => {
    setEvalErr(null);
    // If we already have a score from list load, just reveal it - no refetch.
    if (scored?.overall != null) { setRevealed(true); return; }
    setEvaluating(true);
    try {
      const r = await api.evaluateCollege(c.id, profile);
      setScored(r.scored);
      setRevealed(true);
    } catch (e) { setEvalErr(e.message || "Couldn't evaluate."); }
    finally { setEvaluating(false); }
  };

  return (
    <div className="card pad">
      <div className="row spread wrap" style={{ alignItems: "flex-start", gap: 10 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <span className="mono" style={{ color: "var(--amber)", fontWeight: 600 }}>#{c.rank}</span>
            <strong style={{ fontSize: 15 }}>{c.name}</strong>
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <span className="pill" style={{ background: "var(--amber-b)" }}>{c.tier}</span>
            {(c.specialties || []).slice(0, 3).map((s) => <span key={s} className="pill">{s}</span>)}
          </div>
        </div>
        {scored?.category && (
          <CategoryTag category={scored.coarseCategory || scored.category}
            label={scored.label} range={scored.range} />
        )}
      </div>

      <div className="row wrap" style={{ gap: 6, margin: "10px 0" }}>
        <span className="pill">Admit {o ? (fmtPct(o.admissionRate) || "n/a") : "n/a"}</span>
        <span className="pill">SAT mid {o?.satMidpoint ?? "n/a"}</span>
        <span className="pill">Net {o ? (fmtUSD(o.averageNetPrice) || "n/a") : "n/a"}</span>
        <span className="pill">Earnings {o ? (fmtUSD(o.medianEarnings) || "n/a") : "n/a"}</span>
        {scored?.cultureFit != null && <span className="pill">Culture fit {scored.cultureFit}</span>}
      </div>

      {revealed && scored && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          <span className="pill" style={{ background: "var(--amber-b)" }}>
            Estimated fit based on your profile: {scored.overall ?? "-"}
          </span>
          {scored.coarseCategory && <span className="pill">{scored.coarseCategory}</span>}
        </div>
      )}
      {evalErr && <div className="note" style={{ color: "var(--reach)", marginBottom: 8 }}>{evalErr}</div>}

      <div className="row spread">
        <div className="row" style={{ gap: 8 }}>
          <SourceBadge level={o ? "official" : "unavailable"}>Scorecard</SourceBadge>
          <span className="note" style={{ fontSize: 11 }}>
            {o ? "Live official data" : "Official data unavailable right now"}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!revealed && (
            <button className="link" onClick={evaluate} disabled={evaluating}>
              {evaluating ? "Evaluating…" : "Evaluate against my profile"}
            </button>
          )}
          <button className="btn ghost sm" onClick={() => onOpen(c.id)}>Details</button>
          <button className={`btn sm ${savedIds?.has(String(c.id)) ? "ghost" : "amber"}`}
            onClick={() => onToggleSave({ college: { id: String(c.id), name: c.name, state: o?.state },
              admission: scored ? { category: scored.coarseCategory } : null, overall: scored?.overall ?? null })}>
            {savedIds?.has(String(c.id)) ? "Saved ✓" : "+ List"}
          </button>
        </div>
      </div>
    </div>
  );
}
