// Matches.jsx - personalized recommendations ONLY. No search, no full database.
// Two views: Balanced List (default) and Best Fit.
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { MatchCard } from "./MatchCard.jsx";
import { Spinner, ErrorNote, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

const SIZES = [10, 20, 30];
const CATS = ["Reach", "Target", "Safety"];

export function Matches({
  profile, recs, loading, err, savedIds, onOpen, onToggleSave,
  onGoProfile, onRerun, profileStale, scanned, initialScenarioId, studentId,
}) {
  // Evidence-aware cards: one-time fetch of the family's own Decision Plan
  // items and discovered programs, grouped by college_id, so MatchCard can
  // show Program Evidence / Admission Risk / Cost Risk / Verification /
  // Decision Status alongside (never inside) the existing fit score. This
  // never changes what gets fetched for scoring/matching itself.
  const [decisionItemsByCollege, setDecisionItemsByCollege] = useState({});
  const [programsByCollege, setProgramsByCollege] = useState({});

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([
      api.listDecisionItems(studentId).catch(() => ({ items: [] })),
      api.listDiscoveredPrograms(studentId).catch(() => ({ programs: [] })),
    ]).then(([itemsRes, progRes]) => {
      if (cancelled) return;
      const byItem = {};
      (itemsRes.items || []).forEach((it) => { if (it.college_id) byItem[it.college_id] = it; });
      setDecisionItemsByCollege(byItem);
      const byProg = {};
      (progRes.programs || []).forEach((p) => { if (p.college_id) (byProg[p.college_id] = byProg[p.college_id] || []).push(p); });
      setProgramsByCollege(byProg);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [studentId]);
  const [tab, setTab] = useState("balanced");
  const [size, setSize] = useState(20);
  const [cat, setCat] = useState("All");
  const [control, setControl] = useState("all");
  const [stateFilter, setStateFilter] = useState("");
  const [sort, setSort] = useState("overall");

  // Major/career-track scenario selection (drives Balanced List AND Best Fit).
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState(null);

  // Matching basis: "profile" (use Profile majors/interests) or "track" (use the
  // selected Career Track). This ONLY controls whether the endpoints are called
  // with a scenario id (track) or without one (profile) - no scoring change.
  // null until we've loaded the catalog and picked a sensible default.
  const [matchingBasis, setMatchingBasis] = useState(null);

  // Service academies / military-pathway colleges are excluded from Matches by
  // default (they require nomination, service commitment, etc.). Opt-in only.
  const [includeServiceAcademies, setIncludeServiceAcademies] = useState(false);

  // The scenario id actually sent to the endpoints: the selected track in track
  // mode, or null in profile mode (which uses the flat profile-interest path).
  const effectiveScenarioId = matchingBasis === "track" ? scenarioId : null;

  const [balanced, setBalanced] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balErr, setBalErr] = useState(null);

  // Scenario-driven Best Fit list (server-scored per scenario).
  const [scenBestFit, setScenBestFit] = useState(null);
  const [bfLoading, setBfLoading] = useState(false);
  const [bfErr, setBfErr] = useState(null);

  // Issue 1: persist which tab (Balanced List / Best Fit), size, filters,
  // sort, and scenario/track selection were last chosen, so returning to
  // Matches (or refreshing, or logging back in) restores the same view
  // instead of resetting to defaults. This restores the SELECTION only --
  // the balanced/best-fit result effects below already re-fetch live from
  // the restored selection, using the exact same scoring/ranking as always.
  const matchesSnapshot = { tab, size, cat, control, stateFilter, sort, scenarioId, matchingBasis, includeServiceAcademies };
  const { restoredFrom } = usePersistedSearch(studentId, "matches", matchesSnapshot, (r) => {
    if (!r) return;
    if (r.tab) setTab(r.tab);
    if (r.size) setSize(r.size);
    if (r.cat) setCat(r.cat);
    if (r.control) setControl(r.control);
    if (r.stateFilter !== undefined) setStateFilter(r.stateFilter);
    if (r.sort) setSort(r.sort);
    if (r.scenarioId !== undefined) setScenarioId(r.scenarioId);
    if (r.matchingBasis) setMatchingBasis(r.matchingBasis);
    if (r.includeServiceAcademies !== undefined) setIncludeServiceAcademies(r.includeServiceAcademies);
  });

  // Load the scenario catalog once. Default scenario precedence:
  //   1. the student's saved preferred track (profile.preferredScenarioId)
  //   2. the server's default scenario
  // The user can still change the scenario freely below - this only sets the
  // initial selection and never locks it.
  useEffect(() => {
    let cancelled = false;
    api.scenarios()
      .then((r) => {
        if (cancelled) return;
        const list = r.scenarios || [];
        setScenarios(list);
        const preferred = profile?.preferredScenarioId;
        const preferredValid = preferred && list.some((s) => s.id === preferred);
        // An initialScenarioId (e.g. from Advisor's "Run Matches for this track")
        // takes precedence: it preselects that track and forces Career Track mode.
        const initialValid = initialScenarioId && list.some((s) => s.id === initialScenarioId);
        setScenarioId((prev) => (initialValid ? initialScenarioId : (prev || (preferredValid ? preferred : (r.defaultScenario || null)))));
        // Default matching basis (only set once, never overrides a user choice):
        //   0. an Advisor "Run Matches for this track" request -> "track"
        //   1. preferred career track set  -> "track"
        //   2. otherwise                    -> "profile" (use Profile majors/interests)
        // This ensures the default scenario NEVER silently drives Matches unless
        // the user intentionally chose a track.
        setMatchingBasis((prev) => (initialValid ? "track" : (prev || (preferredValid ? "track" : "profile"))));
      })
      .catch(() => { if (!cancelled) { setScenarios([]); setMatchingBasis((prev) => prev || "profile"); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferredScenarioId, initialScenarioId]);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) || null, [scenarios, scenarioId]);

  // Soft conflict: in Career Track mode, does the student's Profile primary major
  // appear UNALIGNED with the selected track? Aligned = the major matches the
  // track's primary/secondary/supporting fields (case-insensitive, loose). This
  // is a clarity warning only - it never blocks or changes results.
  const primaryMajor = profile?.primaryMajor || null;
  const trackConflict = useMemo(() => {
    if (matchingBasis !== "track" || !activeScenario || !primaryMajor) return false;
    const fields = [activeScenario.primaryField, activeScenario.secondaryField, ...(activeScenario.supportingFields || [])]
      .filter(Boolean).map((f) => f.toLowerCase());
    const maj = primaryMajor.toLowerCase();
    // Aligned if the major and any track field share a meaningful token.
    const majTokens = maj.split(/[\s/]+/).filter((t) => t.length > 3);
    const aligned = fields.some((f) => f.includes(maj) || maj.includes(f)
      || majTokens.some((t) => f.includes(t)));
    return !aligned;
  }, [matchingBasis, activeScenario, primaryMajor]);

  // Balanced List comes from the server (quota-based, not top-N-by-score).
  // Passing the scenario id reshapes it into "Balanced Top N - <scenario>".
  useEffect(() => {
    if (tab !== "balanced" || !recs.length || matchingBasis == null) return;
    let cancelled = false;
    setBalLoading(true); setBalErr(null);
    api.balancedList(profile, size, undefined, effectiveScenarioId, includeServiceAcademies)
      .then((r) => { if (!cancelled) setBalanced(r); })
      .catch((e) => { if (!cancelled) setBalErr(e.message || "Couldn't build the balanced list."); })
      .finally(() => { if (!cancelled) setBalLoading(false); });
    return () => { cancelled = true; };
  }, [tab, size, profile, recs.length, effectiveScenarioId, matchingBasis, includeServiceAcademies]);

  // Best Fit by scenario: server ranks the whole match pool by blended scenario
  // fit. Only fetched when a scenario is active AND the Best Fit tab is open.
  useEffect(() => {
    if (tab !== "bestfit" || !recs.length || !effectiveScenarioId) { setScenBestFit(null); return; }
    let cancelled = false;
    setBfLoading(true); setBfErr(null);
    api.bestFit(profile, size, undefined, effectiveScenarioId, includeServiceAcademies)
      .then((r) => { if (!cancelled) setScenBestFit(r); })
      .catch((e) => { if (!cancelled) setBfErr(e.message || "Couldn't build the scenario Best Fit list."); })
      .finally(() => { if (!cancelled) setBfLoading(false); });
    return () => { cancelled = true; };
  }, [tab, size, profile, recs.length, effectiveScenarioId, includeServiceAcademies]);

  // Client-side service-academy filter (safety net for the profile-mode Best Fit
  // fallback, which draws from `recs` rather than a fresh endpoint call). The
  // backend already excludes these from its own responses; this keeps the
  // recs-derived list consistent with the toggle. Conservative name match.
  const SERVICE_ACADEMY_NAMES = [
    "united states air force academy", "united states naval academy",
    "united states military academy", "united states coast guard academy",
    "united states merchant marine academy",
    "citadel military college of south carolina", "virginia military institute",
  ];
  const isServiceAcademy = (x) => {
    const n = String(x?.college?.name || "").toLowerCase();
    return SERVICE_ACADEMY_NAMES.some((s) => n.includes(s));
  };

  const matches = useMemo(
    () => recs.filter((r) => r.isMatch && (includeServiceAcademies || !isServiceAcademy(r))),
    [recs, includeServiceAcademies]);

  const applyFilters = (list) => {
    let r = [...list];
    if (cat !== "All") r = r.filter((x) => (x.coarseCategory || "") === cat);
    if (control !== "all") {
      r = r.filter((x) => {
        const ct = x.college?.controlType || "";
        if (control === "public") return ct === "Public";
        if (control === "private") return ct.startsWith("Private");
        if (control === "ivy") return !!x.isIvy;
        return true;
      });
    }
    if (stateFilter) r = r.filter((x) => x.college?.state === stateFilter);
    return r;
  };

  const bestFit = useMemo(() => {
    // When a scenario is active and the server returned a scenario-ranked list,
    // use it (already ordered by blended scenario fit). The sort dropdown can
    // still re-order it locally by admit/cost; "overall" keeps scenario order.
    const source = (effectiveScenarioId && scenBestFit?.colleges?.length) ? scenBestFit.colleges : matches;
    const keys = {
      overall: (x) => (effectiveScenarioId && scenBestFit ? -(x.scenarioRank ?? -1) : -(x.overall ?? -1)),
      admit: (x) => -(x.college?.admissionRate ?? -1),
      cost: (x) => x.netCost ?? Infinity,
    };
    const k = keys[sort] || keys.overall;
    return applyFilters(source).sort((a, b) => k(a) - k(b)).slice(0, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, scenBestFit, effectiveScenarioId, cat, control, stateFilter, sort, size]);

  const balancedList = useMemo(() => applyFilters(balanced?.colleges || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balanced, cat, control, stateFilter]);

  const shown = tab === "balanced" ? balancedList : bestFit;

  const counts = useMemo(() => {
    const c = { Reach: 0, Target: 0, Safety: 0, value: 0 };
    shown.forEach((x) => {
      const k = x.coarseCategory || "";
      if (c[k] != null) c[k]++;
      if (x.normalizedCategory === "Financial Safety") c.value++;
    });
    return c;
  }, [shown]);

  if (loading) return <div className="card pad"><Spinner label="Scoring colleges against your profile…" /></div>;
  if (err) return <ErrorNote onRetry={onRerun}>{err.message}</ErrorNote>;
  if (!recs.length) {
    return (
      <div className="empty">
        Complete your profile to see colleges that fit you.
        <div style={{ marginTop: 8 }}><button className="btn amber sm" onClick={onGoProfile}>Go to Profile →</button></div>
      </div>
    );
  }

  const p = profile;
  const summaryBits = [
    p.gpa ? `GPA ${p.gpa}` : null,
    (p.satSuper || p.sat) ? `SAT ${p.satSuper || p.sat}` : (p.act ? `ACT ${p.act}` : null),
    // Primary/second major come from their own fields now. If no primaryMajor is
    // set, fall back to the first interest labeled as "Interest" (not "Primary").
    p.primaryMajor ? `Primary major: ${p.primaryMajor}` : (p.interests?.[0] ? `Interest: ${p.interests[0]}` : null),
    p.secondaryMajor ? `Second major/minor: ${p.secondaryMajor}` : null,
    (p.interests && p.interests.length) ? `Interests: ${p.interests.join(", ")}` : null,
    p.budget ? `Budget $${Number(p.budget).toLocaleString()}` : null,
    p.state ? `Home: ${p.state}` : null,
  ].filter(Boolean);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Personalized</div>
        <h1>Your matches</h1>
        <p className="lead">Colleges worth seriously considering, based on your profile. To search the full
          U.S. database, use <strong>Browse Colleges</strong>.</p>
      </div>

      <div className="card pad">
        <div className="row spread wrap" style={{ gap: 10 }}>
          <div>
            <div className="note" style={{ fontWeight: 600 }}>Profile used</div>
            <div className="note">{summaryBits.join(" · ") || "Profile incomplete"}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={onRerun}>Re-run Matches</button>
            <button className="btn ghost sm" onClick={onGoProfile}>Edit Profile</button>
          </div>
        </div>
      </div>

      {profileStale && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>
          Your profile has changed since these matches were generated.{" "}
          <button className="link" onClick={onRerun}>Re-run Matches</button> for updated results.
        </div>
      )}

      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${tab === "balanced" ? "primary" : "ghost"}`} onClick={() => setTab("balanced")}>Balanced List</button>
        <button className={`btn sm ${tab === "bestfit" ? "primary" : "ghost"}`} onClick={() => setTab("bestfit")}>Best Fit</button>
      </div>
      <RestoredNote restoredFrom={restoredFrom} />

      {matchingBasis && (
        <div className="card pad" style={{ padding: "10px 12px" }}>
          {/* Matching basis toggle */}
          <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
            <span className="note" style={{ fontWeight: 600 }}>Matching basis:</span>
            <button className={`btn sm ${matchingBasis === "profile" ? "primary" : "ghost"}`}
              onClick={() => setMatchingBasis("profile")}>Use Profile majors/interests</button>
            <button className={`btn sm ${matchingBasis === "track" ? "primary" : "ghost"}`}
              onClick={() => setMatchingBasis("track")}>Use selected Career Track</button>
          </div>

          {/* Header line */}
          <div className="note" style={{ marginTop: 8, fontWeight: 600 }}>
            {matchingBasis === "track"
              ? `Results based on Career Track: ${activeScenario?.scenarioName || "-"}`
              : "Results based on Profile majors/interests"}
          </div>

          {/* Career Track mode: active scenario selector + note */}
          {matchingBasis === "track" && scenarios.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                <span className="note">Career track:</span>
                <select className="inp" style={{ width: "auto", minWidth: 240 }}
                  value={scenarioId || ""} onChange={(e) => setScenarioId(e.target.value || null)}>
                  {scenarios.map((s) => <option key={s.id} value={s.id}>{s.scenarioName}</option>)}
                </select>
              </div>
              <div className="note" style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                This track controls major/program matching. Profile majors and interests are still used for context.
              </div>
            </div>
          )}

          {/* Profile mode: the career-track selector is inactive (shown greyed) */}
          {matchingBasis === "profile" && (
            <div className="note" style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
              Career Track selector is inactive in this mode. Switch to “Use selected Career Track” to rank by a
              strategic pathway.
            </div>
          )}

          {/* Compact summary box */}
          <div className="card pad" style={{ background: "var(--paper-2)", marginTop: 8, padding: "8px 10px" }}>
            {matchingBasis === "track" ? (
              <div className="note" style={{ fontSize: 12 }}>
                <div><strong>Matching basis:</strong> Career Track</div>
                <div><strong>Selected track:</strong> {activeScenario?.scenarioName || "-"}</div>
                {primaryMajor && <div><strong>Profile major:</strong> {primaryMajor}</div>}
                <div><strong>Service academies:</strong> {includeServiceAcademies ? "Included" : "Excluded"}</div>
                <div style={{ color: "var(--muted)" }}>Note: Results are based on the selected Career Track.</div>
              </div>
            ) : (
              <div className="note" style={{ fontSize: 12 }}>
                <div><strong>Matching basis:</strong> Profile majors/interests</div>
                {primaryMajor && <div><strong>Primary major:</strong> {primaryMajor}</div>}
                {profile?.secondaryMajor && <div><strong>Second major/minor:</strong> {profile.secondaryMajor}</div>}
                <div><strong>Academic interests:</strong> {(profile?.interests || []).join(", ") || "-"}</div>
                <div><strong>Service academies:</strong> {includeServiceAcademies ? "Included" : "Excluded"}</div>
              </div>
            )}
          </div>

          {/* Service academy / military-pathway toggle */}
          <div style={{ marginTop: 8 }}>
            <label className="row" style={{ gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={includeServiceAcademies}
                onChange={(e) => setIncludeServiceAcademies(e.target.checked)} style={{ marginTop: 2 }} />
              <span className="note" style={{ fontSize: 12 }}>
                <strong>Include service academies / military pathway colleges</strong>
                <span style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  These colleges may require nomination, military service commitment, physical/medical qualification,
                  and strong interest in military life.
                </span>
              </span>
            </label>
          </div>

          {/* Soft conflict warning (Career Track mode only) */}
          {trackConflict && (
            <div className="note" style={{ marginTop: 8, fontSize: 11.5, color: "var(--amber)", borderLeft: "3px solid var(--amber)", paddingLeft: 8 }}>
              Your selected career track differs from your Profile major ({primaryMajor}). Results are based on the
              selected career track.
            </div>
          )}
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="n">{shown.length}</div>
          <div className="l">{tab === "balanced" ? "in Balanced List" : "Best Fit displayed"}</div>
        </div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{counts.Reach}</div><div className="l">▲ Reach</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{counts.Target}</div><div className="l">◆ Target</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{counts.Safety}</div><div className="l">● Safety</div></div>
        {counts.value > 0 && <div className="kpi"><div className="n">{counts.value}</div><div className="l">$ Affordable/Value</div></div>}
      </div>

      {tab === "bestfit" && (
        <div className="note" style={{ color: "var(--muted)" }}>
          Best Fit ranks colleges by profile fit. It may be reach-heavy. Use Balanced List for a more
          realistic application strategy.
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
        <span className="note" style={{ fontWeight: 600 }}>Show:</span>
        <span className={`chip ${cat === "All" ? "on" : ""}`} onClick={() => setCat("All")}>All</span>
        {CATS.map((k) => (
          <span key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>
            {k}
          </span>
        ))}

        <select className="inp" style={{ width: "auto" }} value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {SIZES.map((n) => <option key={n} value={n}>{tab === "balanced" ? `Top ${n} Balanced` : `Top ${n} Best Fit`}</option>)}
        </select>

        {tab === "bestfit" && (
          <select className="inp" style={{ width: "auto", marginLeft: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="overall">Sort: Overall fit</option>
            <option value="admit">Sort: Admit rate</option>
            <option value="cost">Sort: Net cost</option>
          </select>
        )}
      </div>

      {tab === "balanced" && balErr && <ErrorNote>{balErr}</ErrorNote>}
      {tab === "balanced" && balLoading && <div className="card pad"><Spinner label="Building your balanced list…" /></div>}
      {tab === "bestfit" && effectiveScenarioId && bfErr && <ErrorNote>{bfErr}</ErrorNote>}
      {tab === "bestfit" && effectiveScenarioId && bfLoading && <div className="card pad"><Spinner label={`Ranking Best Fit for ${activeScenario?.scenarioName || "scenario"}…`} /></div>}

      {tab === "balanced" && balanced?.warnings?.length > 0 && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>
          {balanced.warnings.map((w, i) => <div key={i} className="note">{w}</div>)}
          <div className="note" style={{ marginTop: 4, color: "var(--muted)" }}>
            Consider broadening location, budget, or school type to widen your match pool.
          </div>
        </div>
      )}
      {tab === "balanced" && balanced?.builtFrom?.includes("all scored") && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>
          Balanced List was built from all scored colleges because too few verified major matches were
          available. Verify program availability before relying on this list.
        </div>
      )}

      <div className="grid cols-2">
        {shown.map((s) => (
          <MatchCard key={s.college.id} scored={s} saved={savedIds.has(s.college.id)}
            onOpen={onOpen} onToggleSave={onToggleSave}
            decisionItem={decisionItemsByCollege[s.college.id] || null}
            programs={programsByCollege[s.college.id] || []}
            profile={profile} />
        ))}
      </div>

      {!shown.length && !balLoading && (
        <div className="empty">No colleges match these filters. Try widening the category, type, or state.</div>
      )}

      <details className="card pad">
        <summary className="note" style={{ cursor: "pointer" }}>Data scan details</summary>
        <div className="note" style={{ marginTop: 6 }}>
          {recs.length} colleges scored from College Scorecard{scanned ? ` (${scanned} retrieved)` : ""}.
          {" "}{matches.length} qualified as personalized matches.
        </div>
      </details>
    </div>
  );
}
