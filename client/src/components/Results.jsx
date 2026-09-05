// Results.jsx - live recommendations. Each card shows official data with source
// badges, an estimated category, and a control to save to the student's list.
import React, { useState, useMemo } from "react";
import { CategoryTag, Meter, SourceBadge, fmtUSD, fmtPct } from "./ui.jsx";
import { api } from "../lib/api.js";

const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

function ScoreRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row spread" style={{ marginBottom: 3 }}>
        <span className="note">{label}</span>
        <span className="mono" style={{ fontSize: 12.5 }}>{value == null ? "-" : value}</span>
      </div>
      <Meter value={value} />
    </div>
  );
}

function CollegeCard({ scored, saved, onOpen, onToggleSave }) {
  const c = scored.college;
  return (
    <div className="card pad">
      <div className="row spread" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          {scored.rank && <span className="mono" style={{ fontSize: 13, color: "var(--amber)", fontWeight: 600, marginTop: 2 }}>#{scored.rank}</span>}
          <div>
            <h3 style={{ marginBottom: 3 }}>{c.name}</h3>
            <div className="note">{[c.city, c.state].filter(Boolean).join(", ")} · {c.controlType || "-"}</div>
          </div>
        </div>
        <CategoryTag category={scored.admission.category} label={scored.admission.label} range={scored.admission.range} />
      </div>
      {scored.cultureFit?.score != null && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <span className="pill" style={{ background: scored.cultureFit.score >= 70 ? "var(--safety-b)" : scored.cultureFit.score >= 45 ? "var(--target-b)" : "var(--reach-b)" }}>
            Culture fit {scored.cultureFit.score}
          </span>
          <span className="note" style={{ fontSize: 11 }}>vs. what they weight</span>
        </div>
      )}

      <div className="row wrap" style={{ gap: 6, margin: "12px 0" }}>
        <span className="pill">Admit {fmtPct(c.admissionRate) || "n/a"}</span>
        <span className="pill">SAT mid {c.satMidpoint ?? "n/a"}</span>
        <span className="pill">Net {fmtUSD(scored.netCost) || "n/a"}</span>
        <span className="pill">Grad {c.graduationRate != null ? Math.round(c.graduationRate * 100) + "%" : "n/a"}</span>
        {scored.roi?.paybackYears != null && <span className="pill" title="Years to recoup 4-year cost from the earnings premium">ROI {scored.roi.paybackYears}y payback</span>}
        {scored.round?.round && <span className="pill" style={{ background: "var(--amber-b)" }}>Apply: {scored.round.round}</span>}
      </div>

      <div className="divider" />
      <div style={{ margin: "12px 0" }}>
        <ScoreRow label="Academic fit" value={scored.subs.academic} />
        <ScoreRow label="Financial fit" value={scored.subs.financial} />
        <ScoreRow label="Career / ROI" value={scored.subs.career} />
        <ScoreRow label="Outcomes" value={scored.subs.outcome} />
        <ScoreRow label="Major / Program Fit" value={scored.subs.major} />
      </div>

      {/* Program-availability provenance - never claim a major without evidence */}
      {scored.majorFit && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {scored.matchType === "verified-major-match" ? (
            <>
              <SourceBadge level="official" />
              <span className="note" style={{ fontSize: 11, color: "var(--safety)" }}>Offers your major (official program data)</span>
            </>
          ) : scored.matchType === "relaxed-profile-match" ? (
            <>
              <SourceBadge level="unavailable" />
              <span className="note" style={{ fontSize: 11, color: "var(--amber)" }}>Program availability not verified - confirm on official college website</span>
            </>
          ) : scored.majorFit.status === "no-match" ? (
            <>
              <SourceBadge level="official" />
              <span className="note" style={{ fontSize: 11, color: "var(--reach)" }}>No matching bachelor's program in official data</span>
            </>
          ) : null}
        </div>
      )}

      {/* Why it matched / concerns */}
      {scored.explanation && (scored.explanation.reasons.length > 0 || scored.explanation.concerns.length > 0) && (
        <details style={{ marginTop: 8 }}>
          <summary className="note" style={{ cursor: "pointer", fontWeight: 600 }}>Why this college matched</summary>
          {scored.explanation.reasons.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {scored.explanation.reasons.map((r, i) => <li key={i} className="note" style={{ color: "var(--safety)" }}>{r}</li>)}
            </ul>
          )}
          {scored.explanation.concerns.length > 0 && (
            <>
              <div className="note" style={{ fontWeight: 600, marginTop: 6 }}>Possible concerns</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {scored.explanation.concerns.map((r, i) => <li key={i} className="note" style={{ color: "var(--reach)" }}>{r}</li>)}
              </ul>
            </>
          )}
        </details>
      )}

      <div className="row spread" style={{ marginTop: 4 }}>
        <div className="row" style={{ gap: 8 }}>
          <SourceBadge level="official">Scorecard</SourceBadge>
          <span className="note">Overall {scored.overall ?? "-"}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={() => onOpen(c.id)}>Details</button>
          <button className={`btn sm ${saved ? "ghost" : "amber"}`} onClick={() => onToggleSave(scored)}>
            {saved ? "Saved ✓" : "+ List"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Results({ recs, meta, savedIds, onOpen, onToggleSave, onRefilter, scanned, profile, studentId, programVerification, initialCat = "Match", mode = "matches" }) {
  const [balanced, setBalanced] = useState(null);
  const [balancedSize, setBalancedSize] = useState(10);
  const [buildingList, setBuildingList] = useState(false);

  const buildList = async (size) => {
    setBuildingList(true); setBalancedSize(size);
    try { const r = await api.balancedList(profile, size); setBalanced(r); }
    catch { setBalanced(null); }
    finally { setBuildingList(false); }
  };

  // Defensive: guarantee every item has the shape the cards render, so a
  // malformed record can never crash the whole panel.
  const safeRecs = useMemo(() => (Array.isArray(recs) ? recs : []).map((x) => ({
    ...x,
    college: x.college || {},
    admission: x.admission || { category: "Unknown", label: "Data unavailable", range: null },
    subs: x.subs || {},
  })), [recs]);

  const [cat, setCat] = useState(initialCat);
  const [sort, setSort] = useState("overall");
  const [topN, setTopN] = useState(30); // default cap for performance; "All" available
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [fState, setFState] = useState("");
  const [fType, setFType] = useState("all");
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights] = useState({ academic: 30, career: 22, financial: 18, outcome: 18, ec: 12 });

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const r = await api.searchColleges({ name: search.trim() });
      setSearchResults(r.results || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const filtered = useMemo(() => {
    let r = [...safeRecs];
    // Matches never shows the full national scan - that's what Browse is for.
    const effCat = (mode === "matches" && cat === "All") ? "Match" : cat;
    if (effCat === "Match") {
      r = r.filter((x) => x.isMatch);
    } else if (effCat !== "All") {
      // Category filters operate on personalized matches, using the shared
      // coarse category so naming can never make a filter silently empty.
      r = r.filter((x) => x.isMatch && (x.coarseCategory || "Insufficient Data") === effCat);
    }
    if (fType === "ivy") r = r.filter((x) => x.isIvy);
    else if (fType === "public") r = r.filter((x) => x.college?.controlType === "Public" || x.college?.ownership === 1);
    else if (fType === "private") r = r.filter((x) => x.college?.controlType === "Private nonprofit" || x.college?.ownership === 2);
    if (fState) r = r.filter((x) => x.college?.state === fState);
    // Custom overall from user weights (falls back to server overall).
    const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const customOverall = (x) => {
      const s = x.subs || {};
      let sum = 0, w = 0;
      for (const k of ["academic", "career", "financial", "outcome", "ec"]) {
        if (s[k] != null) { sum += s[k] * weights[k]; w += weights[k]; }
      }
      return w ? Math.round(sum / w) : (x.overall ?? 0);
    };
    const keys = {
      overall: (x) => -(showWeights ? customOverall(x) : (x.overall ?? -1)),
      cost: (x) => x.netCost ?? Infinity,
      admit: (x) => -(x.college?.admissionRate ?? -1),
    };
    const key = keys[sort] || keys.overall;
    r = r.sort((a, b) => key(a) - key(b));
    if (topN) r = r.slice(0, topN);
    else if (mode === "matches") r = r.slice(0, 50); // hard cap on Matches
    return r;
  }, [safeRecs, cat, sort, topN, fType, fState, showWeights, weights, mode]);

  // Counts of the CURRENT VISIBLE SET (not the broad scan).
  const viewCounts = useMemo(() => {
    const c = { Reach: 0, Target: 0, Safety: 0, "Financial Safety": 0, "Insufficient Data": 0 };
    filtered.forEach((r) => {
      const coarse = r.coarseCategory || "Insufficient Data";
      c[coarse] = (c[coarse] || 0) + 1;
      if (r.normalizedCategory === "Financial Safety") c["Financial Safety"]++;
    });
    return c;
  }, [filtered]);

  const matchTotals = useMemo(() => {
    const m = safeRecs.filter((r) => r.isMatch);
    return {
      total: m.length,
      verified: m.filter((r) => r.matchType === "verified-major-match").length,
      relaxed: m.filter((r) => r.matchType === "relaxed-profile-match").length,
    };
  }, [safeRecs]);

  const relaxedCount = useMemo(
    () => filtered.filter((r) => r.matchType === "relaxed-profile-match").length,
    [filtered]
  );

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Live matches</div>
          <h1>Your college list</h1>
        </div>
        {meta && (
          <div className="note" style={{ textAlign: "right" }}>
            {meta.degraded ? "Showing cached data (live source unavailable)" : meta.cached ? "From cache" : "Fresh from source"}
            {meta.stale && <span style={{ color: "var(--reach)" }}> · stale</span>}
            <br />Source: {meta.source}
          </div>
        )}
      </div>

      {/* CURRENT VIEW SUMMARY - counts what's actually on screen */}
      <div className="kpis">
        <div className="kpi">
          <div className="n">{filtered.length}</div>
          <div className="l">{cat === "All" ? "all scored colleges" : topN ? `Best Fit displayed` : "personalized matches"}</div>
        </div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{viewCounts.Reach}</div><div className="l">▲ Reach</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{viewCounts.Target}</div><div className="l">◆ Target</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{viewCounts.Safety}</div><div className="l">● Safety</div></div>
        {viewCounts["Financial Safety"] > 0 && (
          <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{viewCounts["Financial Safety"]}</div><div className="l">$ Financial Safety</div></div>
        )}
      </div>

      {cat === "All" && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>
          <strong>All Scored Colleges is a broad data scan, not your recommended list.</strong>{" "}
          It may include schools that aren't relevant to your profile or don't offer your major.
        </div>
      )}

      {relaxedCount > 0 && cat !== "All" && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>
          Program availability could not be verified for {relaxedCount} of these colleges
          {programVerification?.error ? ` (${programVerification.error})` : ""}. They're shown as
          relaxed profile matches - confirm your major on each official college website.
        </div>
      )}

      {/* SCAN DETAILS - collapsed, so it never masquerades as a planning summary */}
      <details className="card pad">
        <summary className="note" style={{ cursor: "pointer" }}>Data scan details</summary>
        <div className="note" style={{ marginTop: 6 }}>
          {safeRecs.length} colleges scanned/scored from College Scorecard
          {scanned ? ` (${scanned} retrieved)` : ""}.
          {" "}Personalized matches: {matchTotals.total} ({matchTotals.verified} with verified major data,
          {" "}{matchTotals.relaxed} unverified).
          {meta?.cached ? " Served from cache." : ""}
          {programVerification && ` Program verification: ${programVerification.status}.`}
        </div>
      </details>

      <div className="card pad">
        <label className="lbl">Search any U.S. college to add manually</label>
        <div className="note" style={{ marginBottom: 6, color: "var(--muted)" }}>
          This is a lookup tool for any U.S. college - separate from your personalized matches above.
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="inp" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="e.g. Boston University, Purdue, Rice" />
          <button className="btn primary" onClick={doSearch} disabled={searching}>Search</button>
        </div>
        {searching && <div className="note" style={{ marginTop: 8 }}>Searching…</div>}
        {searchResults.length > 0 && (
          <div className="stack" style={{ marginTop: 12 }}>
            {searchResults.map((c) => (
              <div key={c.id} className="row spread" style={{ padding: "6px 0", borderBottom: "1px solid var(--line-2)" }}>
                <div>
                  <strong>{c.name}</strong>
                  <div className="note">{[c.city, c.state].filter(Boolean).join(", ")}
                    {c.admissionRate != null ? ` · Admit ${(c.admissionRate*100).toFixed(0)}%` : ""}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => onOpen(c.id)}>Details</button>
                  <button className={`btn sm ${savedIds.has(c.id) ? "ghost" : "amber"}`}
                    onClick={() => onToggleSave({ college: c, admission: {}, subs: {} })}>
                    {savedIds.has(c.id) ? "Saved ✓" : "+ List"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card pad row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
        <div>
          <label className="lbl">Filter by state</label>
          <select className="inp" style={{ width: 130 }} value={fState} onChange={(e) => setFState(e.target.value)}>
            <option value="">All states</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">College type</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {[["all","All"],["public","Public"],["private","Private"],["ivy","Ivy League"]].map(([k, l]) => (
              <span key={k} className={`chip ${fType === k ? "on" : ""}`} onClick={() => setFType(k)}>{l}</span>
            ))}
          </div>
        </div>
        {onRefilter && (
          <button className="btn primary sm" onClick={() => onRefilter({ state: fState || undefined, control: (fType === "public" || fType === "private") ? fType : undefined })}>
            Apply state/type
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setShowWeights((v) => !v)}>{showWeights ? "Hide weights" : "Adjust weights"}</button>
      </div>

      {showWeights && (
        <div className="card pad">
          <div className="row spread"><label className="lbl">Weight what matters to you (re-ranks your list)</label>
            <button className="btn ghost sm" onClick={() => setWeights({ academic: 30, career: 22, financial: 18, outcome: 18, ec: 12 })}>Reset</button></div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            {[["academic","Academic fit"],["career","Career/ROI"],["financial","Affordability"],["outcome","Outcomes"],["ec","Extracurriculars"]].map(([k, label]) => (
              <div key={k}>
                <div className="row spread"><span className="note">{label}</span><span className="mono" style={{ fontSize: 12 }}>{weights[k]}</span></div>
                <input type="range" min="0" max="40" value={weights[k]} onChange={(e) => setWeights((w) => ({ ...w, [k]: +e.target.value }))} style={{ width: "100%" }} />
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 6 }}>Re-ranks by your priorities (sort must be "Overall fit"). Weights auto-normalize.</div>
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
        <span className="note" style={{ fontWeight: 600 }}>Show:</span>
        {["Match", "Reach", "Target", "Safety"].map((k) => (
          <span key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{k}</span>
        ))}
        {mode !== "matches" && <span className={`chip ${cat === "All" ? "on" : ""}`} onClick={() => setCat("All")}>All colleges</span>}
        <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
        <span className="note" style={{ fontWeight: 600 }}>Limit:</span>
        {[10, 20, 30].map((n) => (
          <span key={n} className={`chip ${topN === n ? "on" : ""}`} onClick={() => setTopN(n)}>
            {cat === "All" ? `Top ${n}` : `Top ${n} Best Fit`}
          </span>
        ))}
        {mode !== "matches" && <span className={`chip ${topN === 0 ? "on" : ""}`} onClick={() => setTopN(0)}>All</span>}
        <select className="inp" style={{ width: "auto", marginLeft: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="overall">Sort: Overall fit</option>
          <option value="cost">Sort: Net cost</option>
          <option value="admit">Sort: Admit rate</option>
        </select>
      </div>
      <div className="note">
        <div style={{ color: "var(--muted)" }}>
          Best Fit lists are filtered to colleges relevant to your profile. All Scored Colleges is a
          broad data scan and may include schools that are not recommended.
        </div>
      </div>

      {/* Balanced list builder - Matches tab only */}
      {mode === "matches" && (
      <div className="card pad">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <div>
            <strong>Build Balanced List</strong>
            <div className="note">A practical application list with the right mix of reach, target, safety, and financial-safety schools - not just the top scores.</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {[10, 20, 30].map((n) => (
              <button key={n} className="btn ghost sm" onClick={() => buildList(n)}>Top {n}</button>
            ))}
            {balanced && <button className="btn ghost sm" onClick={() => setBalanced(null)}>Clear</button>}
          </div>
        </div>

        {buildingList && <div style={{ marginTop: 10 }}><span className="note">Building your balanced list…</span></div>}

        {balanced && !buildingList && (
          <div style={{ marginTop: 12 }}>
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              <span className="pill" style={{ background: "var(--reach-b)" }}>{balanced.actual.Reach} Reach (target {balanced.target.Reach})</span>
              <span className="pill" style={{ background: "var(--target-b)" }}>{balanced.actual.Target} Target (target {balanced.target.Target})</span>
              <span className="pill" style={{ background: "var(--safety-b)" }}>{balanced.actual.Safety} Safety (target {balanced.target.Safety})</span>
              <span className="pill">{balanced.actual.financialSafety} Financial safety</span>
              <span className="pill">{balanced.actual.inStatePublic} In-state public</span>
            </div>

            {balanced.warnings.length > 0 && (
              <div className="disclaimer" style={{ borderLeftColor: "var(--reach)", marginBottom: 8 }}>
                {balanced.warnings.map((w, i) => <div key={i} className="note">{w}</div>)}
              </div>
            )}

            <div className="grid cols-2" style={{ gap: 8 }}>
              {balanced.colleges.map((c) => (
                <div key={c.college.id} className="card pad" style={{ background: "var(--paper-2)", padding: 10 }}>
                  <div className="row spread">
                    <strong style={{ fontSize: 13.5 }}>{c.college.name}</strong>
                    <span className="pill">{c.admission?.category}</span>
                  </div>
                  <div className="note">
                    {c.netCost != null ? fmtUSD(c.netCost) : "cost n/a"} · fit {c.overall ?? "-"}
                    {c.listRole && c.listRole !== c.admission?.category ? ` · ${c.listRole}` : ""}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button className="link" onClick={() => onOpen(c.college.id)}>Details</button>
                    <button className="link" onClick={() => onToggleSave(c)}>{savedIds.has(c.college.id) ? "Saved ✓" : "+ List"}</button>
                  </div>
                </div>
              ))}
            </div>
            <div className={balanced.builtFrom?.includes("all scored") ? "disclaimer" : "note"}
              style={{ fontSize: 12, marginTop: 8, borderLeftColor: balanced.builtFrom?.includes("all scored") ? "var(--amber)" : undefined }}>
              {balanced.builtFrom?.includes("all scored")
                ? "Balanced List built from all scored colleges because too few verified major matches were available. Verify program availability before relying on this list."
                : "Balanced List built from personalized matches."}
              <div className="note" style={{ marginTop: 4, color: "var(--muted)" }}>{balanced.note}</div>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="grid cols-2">
        {filtered.map((s) => {
          try {
            return (
              <CollegeCard key={s.college.id} scored={s} saved={savedIds.has(s.college.id)}
                onOpen={onOpen} onToggleSave={onToggleSave} />
            );
          } catch (e) {
            return (
              <div key={s.college?.id || Math.random()} className="card pad note">
                Couldn't display {s.college?.name || "a college"} ({String(e.message)}).
              </div>
            );
          }
        })}
      </div>
      {!filtered.length && <div className="empty">No colleges in this category yet.</div>}
    </div>
  );
}
