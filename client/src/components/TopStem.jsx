// TopStem.jsx - curated Top-30 STEM colleges, enriched with the student's
// estimated fit (category + culture fit) and live official outcome data.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { CategoryTag, SourceBadge, Spinner, fmtUSD, fmtPct } from "./ui.jsx";

export function TopStem({ profile, onOpen, savedIds, onToggleSave }) {
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const call = profile ? api.topStemFit(profile, limit) : api.topStem(limit);
    call.then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [limit, profile]);

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Ranked list</div>
          <h1>Top STEM colleges</h1>
          <p className="lead">The strongest undergraduate CS, engineering, and science programs - with your
            estimated fit and live outcome data from College Scorecard on each.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {[10, 20, 30, 50].map((n) => (
            <span key={n} className={`chip ${limit === n ? "on" : ""}`} onClick={() => setLimit(n)}>Top {n}</span>
          ))}
        </div>
      </div>

      <div className="disclaimer">
        STEM strength here is an <strong>editorial ranking</strong> of program reputation and outcomes - not an
        official government ranking. Admit rate, cost, earnings, and graduation data are live from College Scorecard.
      </div>

      {loading && <div className="card pad"><Spinner label="Ranking STEM colleges…" /></div>}

      {data && (
        <div className="stack">
        {data.colleges?.length > 0 && (
        <div className="kpis">
          <div className="kpi"><div className="n">{data.colleges.length}</div><div className="l">STEM colleges shown</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{data.colleges.filter((c) => c.scored?.admission?.category?.includes("Reach")).length}</div><div className="l">▲ Reach</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{data.colleges.filter((c) => c.scored?.admission?.category === "Target").length}</div><div className="l">◆ Target</div></div>
          <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{data.colleges.filter((c) => ["Safety", "Likely", "Financial Safety"].includes(c.scored?.admission?.category)).length}</div><div className="l">● Safety</div></div>
          <div className="kpi"><div className="n">{data.colleges.filter((c) => savedIds?.has(c.id)).length}</div><div className="l">On my list</div></div>
        </div>
      )}

          {data.colleges.map((c) => (
            <div key={c.id} className="card pad">
              <div className="row spread wrap" style={{ alignItems: "flex-start", gap: 10 }}>
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span className="mono" style={{ fontSize: 15, color: "var(--amber)", fontWeight: 700, minWidth: 32 }}>#{c.rank}</span>
                  <div>
                    <h3 style={{ marginBottom: 3 }}>{c.name}</h3>
                    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      <span className="pill" style={{ background: "var(--target-b)" }}>{c.tier}</span>
                      <span className="pill">STEM {c.stemScore}</span>
                      {c.specialties.slice(0, 3).map((s) => <span key={s} className="pill">{s}</span>)}
                    </div>
                  </div>
                </div>
                {c.scored && <CategoryTag category={c.scored.category} label={c.scored.label} range={c.scored.range} />}
              </div>

              <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                {c.official?.admissionRate != null && <span className="pill">Admit {fmtPct(c.official.admissionRate)}</span>}
                {c.official?.medianEarnings != null && <span className="pill">Earnings {fmtUSD(c.official.medianEarnings)}</span>}
                {c.official?.averageNetPrice != null && <span className="pill">Net {fmtUSD(c.official.averageNetPrice)}</span>}
                {c.scored?.cultureFit != null && <span className="pill" style={{ background: c.scored.cultureFit >= 70 ? "var(--safety-b)" : c.scored.cultureFit >= 45 ? "var(--target-b)" : "var(--reach-b)" }}>Culture fit {c.scored.cultureFit}</span>}
                {c.official && <SourceBadge level="official">Scorecard</SourceBadge>}
              </div>

              <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => onOpen(c.id)}>Details</button>
                {onToggleSave && (
                  <button className={`btn sm ${savedIds?.has(c.id) ? "ghost" : "amber"}`}
                    onClick={() => onToggleSave({ college: { id: c.id, name: c.name, state: c.official?.state }, admission: { category: c.scored?.category, range: c.scored?.range }, overall: c.scored?.overall })}>
                    {savedIds?.has(c.id) ? "Saved ✓" : "+ List"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
