// Majors.jsx - majors that fit the student, with why, careers, grad-school
// signal, and outlook.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import { Spinner, InlineSpinner, SourceBadge, SuccessNote, RestoredNote, ClearSearchButton, fmtUSD, fmtPct } from "./ui.jsx";
import { US_STATES } from "../lib/states.js";
import { usePersistedSearch } from "../lib/persistedSearch.js";
import { useEntryOverride } from "../lib/entryOverride.js";

const PROGRAM_TYPES = ["Major", "Minor", "Concentration", "Track", "Certificate", "Course cluster", "Graduate-only program", "Unknown"];
const POLICY_TYPES = ["Double major", "Second major", "Additional major", "Dual degree", "Intercollege dual degree", "Major + minor", "Concentration only", "Not allowed", "Unknown"];
const ALLOWED_STATUSES = ["Confirmed allowed", "Confirmed with restrictions", "Confirmed not allowed", "Programs exist, rules not verified", "Second program is not an undergraduate major", "Unknown"];
const SOURCE_TYPES = ["College catalog", "Undergraduate bulletin", "Registrar page", "Academic advising page", "Department page", "School/college degree requirements page", "Official double-major policy page", "Official program page"];
const VERIFICATION_STATUSES = ["Official source verified", "User verified", "Needs manual verification"];

const norm = (s) => String(s || "").toLowerCase().trim();
function verificationKey(collegeId, primary, secondary) { return `${collegeId}::${norm(primary)}::${norm(secondary)}`; }

export function Majors({ profile, studentId, onOpen, onToggleSave, savedIds, entryMode, entryNonce }) {
  const [majors, setMajors] = useState([]);
  const [doubles, setDoubles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [majorQuery, setMajorQuery] = useState("");
  const [major2Query, setMajor2Query] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [majorColleges, setMajorColleges] = useState(null);
  const [comboMode, setComboMode] = useState(false);
  const [searchingMajor, setSearchingMajor] = useState(false);
  const [searchMeta, setSearchMeta] = useState(null);
  const [majorSearchError, setMajorSearchError] = useState(null);
  const [searchSuccessMsg, setSearchSuccessMsg] = useState(null);
  const [tab, setTab] = useState("search");   // "search" | "recommendations"
  // "size" matches the API's default order (largest schools first, from
  // College Scorecard enrollment data); "selectivity" re-sorts client-side by
  // admission rate (already fetched from Scorecard, just not shown before)
  // so the family can see which options are most/least selective at a glance.
  const [majorSort, setMajorSort] = useState("selectivity");
  // Deep search (up to 2,000 candidate colleges) is an explicit, opt-in,
  // advanced option -- it never runs automatically. Standard search (up to
  // 500 candidates) is the default for every search.
  const [deepSearch, setDeepSearch] = useState(false);
  // How many of the scored/verified colleges to display at once. Starts at
  // 20; "Show Top 30/50" jump straight to that size, "Load Next 25" adds 25
  // more, without re-running the search or re-scoring anything.
  const [displayCount, setDisplayCount] = useState(20);
  const searchRef = useRef(null);

  // Issue 1: Single Major Search and Double Major Search share this page --
  // persist the search text(es), state filter, combo mode, sort, deep-search
  // flag, results, and Top20/30/50 + Load Next 25 display count so returning
  // to Majors (or refreshing, or logging back in) restores exactly what was
  // there. Restoring never re-runs or re-scores the search -- it just puts
  // the previous results back on screen.
  const majorsSnapshot = {
    majorQuery, major2Query, stateFilter, majorColleges, comboMode, searchMeta,
    searchSuccessMsg, tab, majorSort, deepSearch, displayCount,
  };
  const { restoredFrom, clear: clearMajorsPersisted } = usePersistedSearch(studentId, "majors", majorsSnapshot, (r) => {
    if (!r) return;
    prefilled.current = true; // a restored search always wins over the profile-based prefill
    if (r.majorQuery !== undefined) setMajorQuery(r.majorQuery);
    if (r.major2Query !== undefined) setMajor2Query(r.major2Query);
    if (r.stateFilter !== undefined) setStateFilter(r.stateFilter);
    if (r.majorColleges !== undefined) setMajorColleges(r.majorColleges);
    if (r.comboMode !== undefined) setComboMode(r.comboMode);
    if (r.searchMeta !== undefined) setSearchMeta(r.searchMeta);
    if (r.searchSuccessMsg !== undefined) setSearchSuccessMsg(r.searchSuccessMsg);
    if (r.tab) setTab(r.tab);
    if (r.majorSort) setMajorSort(r.majorSort);
    if (r.deepSearch !== undefined) setDeepSearch(r.deepSearch);
    if (r.displayCount) setDisplayCount(r.displayCount);
  });

  // Official double-major confirmation records for this family (see
  // services/doubleMajorVerification.js). Loaded once and reused to (a)
  // classify search results into Confirmed/Related/Needs-Verification
  // sections and (b) power the "Confirmed Double-Major Programs" tab.
  // Categorically separate from doubleMajorStatus on a raw search result --
  // that field only ever reflects College Scorecard evidence.
  const [dmVerifications, setDmVerifications] = useState([]);
  const refreshVerifications = useCallback(() => {
    if (!studentId) return;
    api.listDoubleMajorVerifications(studentId).then((r) => setDmVerifications(r.verifications || [])).catch(() => {});
  }, [studentId]);
  useEffect(() => { refreshVerifications(); }, [refreshVerifications]);
  const dmVerByKey = new Map(dmVerifications.map((v) => [verificationKey(v.college_id, v.primary_program_requested, v.secondary_program_requested), v]));

  // Prefill the planner from the Profile's own Primary/Secondary major once,
  // so the double-major planner starts from what the family already told us
  // rather than a blank search box. Never overrides a user's own typing.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (profile?.primaryMajor) {
      setMajorQuery(profile.primaryMajor);
      if (profile?.secondaryMajor) { setMajor2Query(profile.secondaryMajor); setComboMode(true); }
      prefilled.current = true;
    }
  }, [profile?.primaryMajor, profile?.secondaryMajor]);

  // Explore navigation: the "Double Major Search" / "Majors" subtabs both
  // open this same page (they always have -- Single/Double major is a toggle
  // right here, not a separate page) but each subtab click can request a
  // specific mode so the family lands on what they actually clicked. Runs
  // once per explicit subtab click (see lib/entryOverride.js); never fires
  // on a plain reload or on the old "majors" route with no group context.
  useEntryOverride(entryMode === "double", entryNonce, (wantDouble) => {
    setComboMode(wantDouble);
    setTab("search");
  });

  const resetSearch = () => {
    setMajorQuery(""); setMajor2Query(""); setStateFilter("");
    setComboMode(false); setMajorColleges(null); setSearchMeta(null); setMajorSearchError(null);
    setSearchSuccessMsg(null); setDisplayCount(20); setDeepSearch(false);
    clearMajorsPersisted();
  };

  // Pick a combo -> jump to the search box so the user sees what was selected.
  const useCombo = (primary, partner) => {
    setComboMode(true); setMajorQuery(primary); setMajor2Query(partner);
    setMajorColleges(null); setSearchMeta(null); setMajorSearchError(null); setSearchSuccessMsg(null);
    setDisplayCount(20);
    setTab("search");
    setTimeout(() => searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const runSearch = async () => {
    if (searchingMajor) return; // prevent duplicate clicks while a search is already running
    const q = majorQuery.trim();
    if (!q) return;
    const isCombo = comboMode && major2Query.trim();
    setSearchingMajor(true); setMajorColleges(null); setSearchMeta(null);
    setMajorSearchError(null); setSearchSuccessMsg(null); setDisplayCount(20);
    try {
      const r = isCombo
        ? await api.collegeMajorCombos(q, major2Query.trim(), stateFilter || undefined, { deep: deepSearch })
        : await api.collegesByMajor(q, stateFilter || undefined, { deep: deepSearch });
      setMajorColleges(r.colleges || []);
      setSearchMeta({ ...r, combo: !!isCombo });
      const found = (r.colleges || []).length;
      const pool = r.candidatePoolScanned ?? found;
      setSearchSuccessMsg(
        isCombo
          ? `Scored ${pool} candidate college${pool === 1 ? "" : "s"} - found ${found} offering both fields.`
          : `Scored ${pool} candidate college${pool === 1 ? "" : "s"} - found ${found} with a verified match.`
      );
    } catch (err) {
      // An API failure is NOT the same as "no colleges matched".
      setMajorSearchError(err?.message || "Could not check official program data.");
      setMajorColleges(null);
    } finally {
      setSearchingMajor(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    api.recommendMajors(profile).then((r) => { setMajors(r.majors || []); setDoubles(r.doubleMajors || []); }).catch(() => { setMajors([]); setDoubles([]); }).finally(() => setLoading(false));
  }, [profile]);

  // Selectivity rank -- computed client-side from admissionRate, which
  // College Scorecard already returns on every result but the UI never
  // showed. "Rank" here means admit-rate ordering among the colleges in
  // THIS result set, not a US News-style prestige ranking (this app doesn't
  // have a licensed prestige dataset, so it doesn't invent one).
  const sortedMajorColleges = (() => {
    if (!majorColleges) return null;
    const withRate = majorColleges.filter((c) => c.admissionRate != null);
    const withoutRate = majorColleges.filter((c) => c.admissionRate == null);
    if (majorSort === "selectivity") {
      const ranked = [...withRate].sort((a, b) => a.admissionRate - b.admissionRate);
      return [...ranked.map((c, i) => ({ ...c, selectivityRank: i + 1 })), ...withoutRate];
    }
    // "size" (API default order) -- still attach rank numbers so the badge
    // is available in either sort mode, just computed against the same
    // admit-rate ordering rather than reordering the visible list.
    const rankMap = new Map([...withRate].sort((a, b) => a.admissionRate - b.admissionRate).map((c, i) => [c.id, i + 1]));
    return majorColleges.map((c) => ({ ...c, selectivityRank: rankMap.get(c.id) || null }));
  })();

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Majors for you</div>
        <h1>Majors that fit your profile</h1>
        <p className="lead">Ranked from your interests, strengths, and career goals - each with where it leads and
          whether it typically needs graduate school. Based on official BLS career data.</p>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${tab === "search" ? "primary" : "ghost"}`} onClick={() => setTab("search")}>
          Find colleges by major
        </button>
        <button className={`btn sm ${tab === "recommendations" ? "primary" : "ghost"}`} onClick={() => setTab("recommendations")}>
          Major recommendations for you
        </button>
        <button className={`btn sm ${tab === "confirmed" ? "primary" : "ghost"}`} onClick={() => setTab("confirmed")}>
          Confirmed Double-Major Programs {dmVerifications.filter((v) => v.confirmed).length > 0 ? `(${dmVerifications.filter((v) => v.confirmed).length})` : ""}
        </button>
      </div>

      {tab === "search" && !loading && (
        doubles.length > 0 ? (
          <div className="card pad">
            <h3 style={{ marginBottom: 6 }}>Double-major &amp; combination ideas</h3>
            <p className="note" style={{ marginBottom: 12 }}>Strong pairings for your profile. The <strong>Courses</strong> tab shows which colleges actually offer these combinations (e.g. MIT 6-14, Penn M&amp;T, Georgia Tech CS Threads). Use the search below to check which colleges offer both fields.</p>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
              {doubles.map((d) => (
                <div key={d.combo} className="card pad" style={{ background: "var(--paper-2)" }}>
                  <div className="row spread">
                    <strong style={{ fontSize: 14 }}>{d.combo}</strong>
                    <span className="pill" style={{ background: d.strength === "Strong" ? "var(--safety-b)" : "var(--target-b)" }}>{d.strength}</span>
                  </div>
                  <p className="note" style={{ marginTop: 6 }}>{d.why}</p>
                  <button className="link" style={{ marginTop: 6 }}
                    onClick={() => useCombo(d.primary, d.partner)}>
                    Find colleges offering both →
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card pad">
            <h3 style={{ marginBottom: 6 }}>Double-major &amp; combination ideas</h3>
            <p className="note">Add at least one intended major to your Profile to see suggested double-major pairings.</p>
          </div>
        )
      )}

      {tab === "search" && (
      <div className="card pad" ref={searchRef}>
        <div className="row spread">
          <label className="lbl">{comboMode ? "Double-Major Planner" : "Single-Major Planner"}</label>
          <div className="row" style={{ gap: 6 }}>
            <span className={`chip ${!comboMode ? "on" : ""}`} onClick={() => setComboMode(false)}>Single major</span>
            <span className={`chip ${comboMode ? "on" : ""}`} onClick={() => setComboMode(true)}>Double major</span>
            <ClearSearchButton onClear={resetSearch} label="Clear search" />
          </div>
        </div>
        <RestoredNote restoredFrom={restoredFrom} />
        {comboMode && (
          <div className="disclaimer" style={{ marginTop: 8, marginBottom: 0 }}>
            Do not assume a double major is possible just because a college offers both fields separately. Colleges
            differ widely in whether double majors are allowed, capped, require separate applications, or need
            special permission -- always confirm the actual policy with the college's advising office or catalog.
          </div>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          <input className="inp" style={{ flex: 1, minWidth: 180 }} value={majorQuery} placeholder="Major 1 (e.g. Computer Science)"
            onChange={(e) => setMajorQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
          {comboMode && (
            <input className="inp" style={{ flex: 1, minWidth: 180 }} value={major2Query} placeholder="Major 2 (e.g. Finance)"
              onChange={(e) => setMajor2Query(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
          )}
          <input className="inp" style={{ width: 90 }} value={stateFilter} placeholder="State" maxLength={2}
            onChange={(e) => setStateFilter(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
          <button className="btn primary sm" onClick={runSearch} disabled={searchingMajor}>
            {searchingMajor ? <><InlineSpinner />Searching…</> : "Search"}
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
          <span className="note" style={{ fontWeight: 600 }}>State:</span>
          <select className="inp" style={{ width: "auto" }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">Nationwide (all states)</option>
            {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {majors.slice(0, 4).map((m) => (
            <span key={m.name} className="chip" onClick={() => { setMajorQuery(m.name); }}>{m.name}</span>
          ))}
        </div>

        <div style={{ marginTop: 10 }}>
          <label className="row" style={{ gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={deepSearch} disabled={searchingMajor}
              onChange={(e) => setDeepSearch(e.target.checked)} style={{ marginTop: 2 }} />
            <span className="note" style={{ fontSize: 12 }}>
              <strong>Deep search (advanced)</strong> - candidate pool searched, up to 2,000 colleges instead of 500.
              <span style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                Deep search may take longer. Results still need official verification. Standard search (up to 500
                candidates) is enough for most searches.
              </span>
            </span>
          </label>
        </div>

        {searchingMajor && (
          <div style={{ marginTop: 10 }}>
            <Spinner label={comboMode
              ? "Searching double-major options and checking primary and secondary major fit…"
              : "Searching colleges and checking official program data…"} />
          </div>
        )}

        {searchSuccessMsg && !searchingMajor && !majorSearchError && <SuccessNote>{searchSuccessMsg}</SuccessNote>}

        {majorSearchError && !searchingMajor && (
          <div className="disclaimer" style={{ borderLeftColor: "var(--reach)", marginTop: 10 }}>
            <strong>Could not check official program data right now:</strong> {majorSearchError}
            <div className="note" style={{ marginTop: 4 }}>This is an API/connection problem - not a statement that no colleges match.</div>
            <button className="link" style={{ marginTop: 4 }} onClick={runSearch}>Try again</button>
          </div>
        )}

        {majorColleges && !searchingMajor && !majorSearchError && (
          <div style={{ marginTop: 12 }}>
            {searchMeta?.cipCodesUsed && (
              <div className="note" style={{ marginBottom: 6 }}>
                Source: {searchMeta.source || "College Scorecard"} · CIP codes used: {Array.isArray(searchMeta.cipCodesUsed) ? searchMeta.cipCodesUsed.join(", ") : [searchMeta.cipCodesUsed.major1, searchMeta.cipCodesUsed.major2].filter(Boolean).flat().join(", ")}
                {searchMeta.candidatePoolScanned != null
                  ? ` · Candidate pool searched: ${searchMeta.candidatePoolScanned}${searchMeta.mode === "deep" ? " (deep search)" : ""}`
                  : (searchMeta.rawResultCount != null ? ` · ${searchMeta.rawResultCount} colleges checked` : "")}
              </div>
            )}
            {searchMeta?.partial && (
              <div className="note" style={{ color: "var(--amber)", marginBottom: 6 }}>
                This search stopped before checking every possible college (a very large or slow result set). Try
                narrowing with a state filter, or use Deep search for a larger candidate pool.
              </div>
            )}
            {searchMeta?.deepSearchWarning && (
              <div className="note" style={{ color: "var(--muted)", marginBottom: 6 }}>{searchMeta.deepSearchWarning}</div>
            )}
            {!majorColleges.length ? (
              <div className="empty">
                {stateFilter
                  ? `No verified matches in ${stateFilter}. Try nationwide.`
                  : "No colleges with a verified bachelor's program matched. Try a broader term."}
              </div>
            ) : (
              <>
                <div className="row spread wrap" style={{ marginBottom: 8, alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>
                    {searchMeta?.combo
                      ? `Colleges offering BOTH ${searchMeta.major1} and ${searchMeta.major2}`
                      : `Colleges offering ${searchMeta?.major || majorQuery}`}
                  </h3>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span className="note">Sort:</span>
                    <span className={`chip ${majorSort === "selectivity" ? "on" : ""}`} onClick={() => setMajorSort("selectivity")}>Most selective first</span>
                    <span className={`chip ${majorSort === "size" ? "on" : ""}`} onClick={() => setMajorSort("size")}>Largest first</span>
                    <span className="note">{majorColleges.length} scored colleges</span>
                  </div>
                </div>
                {searchMeta?.combo && (
                  <div className="disclaimer" style={{ borderLeftColor: "var(--amber)", marginBottom: 8 }}>
                    These colleges offer both fields at bachelor's level according to official College Scorecard
                    program data. That is <strong>not</strong> the same as permission to declare a formal double
                    major - confirm double-major and dual-degree rules with each college's catalog or advising office.
                  </div>
                )}
              </>
            )}
            {majorColleges.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="note" style={{ fontSize: 11 }}>
                  "Selectivity rank" is this list's colleges ordered by admission rate (most selective = #1) from College Scorecard -
                  not a US News-style prestige ranking. Colleges with no admission-rate data on file are shown unranked.
                </div>
                <div className="note" style={{ fontWeight: 600 }}>
                  Showing 1–{Math.min(displayCount, sortedMajorColleges.length)} of {sortedMajorColleges.length} scored colleges
                </div>
                {(() => {
                  const pageSlice = sortedMajorColleges.slice(0, displayCount);
                  const card = (c) => {
                    const ver = searchMeta?.combo
                      ? dmVerByKey.get(verificationKey(c.id, searchMeta.major1, searchMeta.major2))
                      : null;
                    return (
                      <MajorCollegeCard key={c.id} c={c} profile={profile} studentId={studentId} searchMeta={searchMeta}
                        onOpen={onOpen} onToggleSave={onToggleSave} savedIds={savedIds}
                        verification={ver} onVerificationSaved={refreshVerifications} />
                    );
                  };
                  if (!searchMeta?.combo) return pageSlice.map(card);

                  // Feature 8: group combo results into three honest tiers instead
                  // of one undifferentiated list. "Confirmed" only ever comes from
                  // a matching official-source verification record for THIS exact
                  // primary+secondary pairing at THIS college -- never from
                  // Scorecard evidence alone.
                  const confirmed = [], related = [], needsVerification = [];
                  for (const c of pageSlice) {
                    const ver = dmVerByKey.get(verificationKey(c.id, searchMeta.major1, searchMeta.major2));
                    if (ver?.confirmed) confirmed.push(c);
                    else if (c.secondaryProgramTypeHint && c.secondaryProgramTypeHint !== "Unknown") related.push(c);
                    else needsVerification.push(c);
                  }
                  return (
                    <>
                      {confirmed.length > 0 && (
                        <div>
                          <h4 style={{ margin: "6px 0" }}>Confirmed Double-Major Paths ({confirmed.length})</h4>
                          <p className="note" style={{ marginBottom: 8 }}>An official source confirms both official program names and the double-major/second-major policy at these colleges.</p>
                          <div className="stack" style={{ gap: 8 }}>{confirmed.map(card)}</div>
                        </div>
                      )}
                      {related.length > 0 && (
                        <div style={{ marginTop: confirmed.length ? 16 : 0 }}>
                          <h4 style={{ margin: "6px 0" }}>Related Program Paths ({related.length})</h4>
                          <p className="note" style={{ marginBottom: 8 }}>These colleges offer the primary major plus a related minor, concentration, certificate, or track in the second field -- not necessarily a second major.</p>
                          <div className="stack" style={{ gap: 8 }}>{related.map(card)}</div>
                        </div>
                      )}
                      {needsVerification.length > 0 && (
                        <div style={{ marginTop: (confirmed.length || related.length) ? 16 : 0 }}>
                          <h4 style={{ margin: "6px 0" }}>Needs Official Verification ({needsVerification.length})</h4>
                          <p className="note" style={{ marginBottom: 8 }}>College Scorecard data suggests both fields exist, but the double-major policy has not been confirmed with an official source.</p>
                          <div className="stack" style={{ gap: 8 }}>{needsVerification.map(card)}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  {displayCount < 30 && sortedMajorColleges.length > displayCount && (
                    <button className="btn ghost sm" onClick={() => setDisplayCount(30)}>Show Top 30</button>
                  )}
                  {displayCount < 50 && sortedMajorColleges.length > displayCount && (
                    <button className="btn ghost sm" onClick={() => setDisplayCount(50)}>Show Top 50</button>
                  )}
                  {sortedMajorColleges.length > displayCount && (
                    <button className="btn ghost sm" onClick={() => setDisplayCount((n) => n + 25)}>Load Next 25</button>
                  )}
                  {displayCount > 20 && (
                    <button className="btn ghost sm" onClick={() => setDisplayCount(20)}>Reset to Top 20</button>
                  )}
                </div>
              </div>
            )}
            {searchMeta?.disclaimer && <div className="note" style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>{searchMeta.disclaimer}</div>}
          </div>
        )}
      </div>

      )}

      {tab === "recommendations" && (
        loading ? <div className="card pad"><Spinner label="Matching majors to your profile…" /></div>
      : !majors.length ? <div className="empty">Add some interests and career goals to your profile to see major recommendations.</div>
      : (
        <div className="stack">
          {majors.map((m, i) => (
            <div key={m.name} className="card pad">
              <div className="row spread" style={{ alignItems: "flex-start" }}>
                <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="mono" style={{ color: "var(--amber)", fontWeight: 600 }}>#{i + 1}</span>
                  <div>
                    <h3 style={{ marginBottom: 3 }}>{m.name}</h3>
                    <p className="note">{m.blurb}</p>
                  </div>
                </div>
                {m.gradSchool && <span className="pill" style={{ background: "var(--target-b)" }}>Often needs grad school</span>}
              </div>

              <p className="note" style={{ margin: "10px 0", color: "var(--ink-900)" }}>{m.why}</p>

              {m.careers?.length > 0 && (
                <div>
                  <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>Where it can lead</div>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
                    {m.careers.map((c) => (
                      <div key={c.title || c.name} className="card pad" style={{ background: "var(--paper-2)", padding: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title || c.name}</div>
                        <div className="note">
                          {c.medianPay ? `Median ${fmtUSD(c.medianPay)}` : ""}
                          {c.growth ? ` · ${c.growth > 0 ? "+" : ""}${c.growth}% growth` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <SourceBadge level="official">BLS</SourceBadge>
                <span className="note">Career figures are official BLS estimates; outcomes vary.</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {tab === "confirmed" && (
        <ConfirmedDoubleMajorPrograms verifications={dmVerifications} onOpen={onOpen} onRefresh={refreshVerifications} studentId={studentId} />
      )}
    </div>
  );
}

// Feature 1: the ONE place in the app that only ever shows a double-major
// pairing once an official source has confirmed BOTH official program names
// and the actual double-major/second-major/dual-degree policy. Nothing here
// is derived from College Scorecard -- every row is a double_major_verifications
// record that passed isConfirmedDoubleMajor() server-side (see the `confirmed`
// flag the API attaches to every record).
function ConfirmedDoubleMajorPrograms({ verifications, onOpen, onRefresh, studentId }) {
  const confirmed = verifications.filter((v) => v.confirmed);
  if (!studentId) return <div className="empty">Sign in to track officially confirmed double-major programs.</div>;
  if (!confirmed.length) {
    return (
      <div className="card pad">
        <h3 style={{ marginBottom: 6 }}>Confirmed Double-Major Programs</h3>
        <p className="note">
          No college has an official-source-confirmed double major yet. When you search Double Major options and use
          "Confirm with an official source" on a result, verified pairings will appear here -- and only here, once
          they've cleared the confirmation bar.
        </p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="card pad">
        <h3 style={{ marginBottom: 4 }}>Confirmed Double-Major Programs ({confirmed.length})</h3>
        <p className="note">Every pairing below has an official source URL confirming both official program names and the double-major/second-major/dual-degree policy.</p>
      </div>
      {confirmed.map((v) => (
        <div key={v.verification_id} className="card pad" style={{ background: "var(--paper-2)" }}>
          <div className="row spread wrap" style={{ alignItems: "flex-start" }}>
            <strong>{v.college_name || v.college_id}</strong>
            <span className="pill" style={{ background: "var(--safety-b)" }}>Confirmed double-major path</span>
          </div>
          <div className="grid cols-2" style={{ gap: 8, marginTop: 8 }}>
            <div className="note">Primary official program: <strong>{v.primary_official_program_name}</strong></div>
            <div className="note">Second official program: <strong>{v.secondary_official_program_name}</strong></div>
            <div className="note">Policy: {v.official_policy_name} ({v.double_major_policy_type})</div>
            <div className="note">Status: {v.double_major_allowed_status}</div>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            Verification: {v.verification_status} · Source: {v.source_url ? <a href={v.source_url} target="_blank" rel="noreferrer">{v.source_label || v.source_url}</a> : "-"} · Last checked: {v.last_checked || "-"}
          </div>
          {v.restrictions && <div className="note" style={{ marginTop: 4 }}>Restrictions: {v.restrictions}</div>}
          <div className="row" style={{ gap: 10, marginTop: 8 }}>
            {onOpen && v.college_id && <button className="link" onClick={() => onOpen(v.college_id)}>View college →</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// A college card in the Majors search results, with an on-demand
// "Evaluate against my profile" action (parity with Browse Colleges).
// Preserves all existing program/combo display; only adds the evaluate control.
// `verification` (when present) is this family's OWN double_major_verifications
// record for this exact college + primary/secondary pairing -- categorically
// different from c.doubleMajorStatus, which only ever reflects Scorecard
// evidence. See services/doubleMajorVerification.js on the server.
function MajorCollegeCard({ c, profile, studentId, searchMeta, onOpen, onToggleSave, savedIds, verification, onVerificationSaved }) {
  const [scored, setScored] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalErr, setEvalErr] = useState(null);
  const [comboSaveMsg, setComboSaveMsg] = useState(null);
  const [comboSaving, setComboSaving] = useState(false);
  const [listMsg, setListMsg] = useState(null);
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const isCombo = !!searchMeta?.combo;
  const isConfirmed = !!verification?.confirmed;

  // Feature 3/5 display label -- never invents a stronger claim than the
  // evidence supports. A confirmed verification record always wins; otherwise
  // fall back to the honest Scorecard-tier label the server already computed
  // (c.doubleMajorStatus), which is generic across any major pair.
  const displayStatus = isConfirmed
    ? (verification.double_major_allowed_status === "Confirmed with restrictions" ? "Confirmed with restrictions" : "Confirmed double-major path")
    : (c.doubleMajorStatus || "Needs official verification");
  const hint = c.secondaryProgramTypeHint;
  const secondaryLine = !isConfirmed && hint && hint !== "Unknown" && searchMeta
    ? `${searchMeta.major1} major + ${searchMeta.major2} ${hint.toLowerCase()}`
    : null;

  const evaluate = async () => {
    setEvaluating(true); setEvalErr(null);
    try {
      const r = await api.evaluateCollege(c.id, profile);
      setScored(r.scored);
    } catch (e) { setEvalErr(e.message || "Couldn't evaluate."); }
    finally { setEvaluating(false); }
  };

  const saveComboToDecisionPlan = async () => {
    if (!studentId || comboSaving) return; // guard against duplicate clicks
    setComboSaving(true); setComboSaveMsg(null);
    try {
      await api.addDecisionItem(studentId, {
        collegeId: c.id, collegeName: c.name,
        careerTrack: profile?.preferredScenarioId || null,
        programVerificationStatus: "Needs manual verification",
        primaryMajor: searchMeta.major1, secondaryMajor: searchMeta.major2,
        doubleMajorStatus: displayStatus,
        doubleMajorVerificationStatus: isConfirmed ? verification.verification_status : "Needs manual verification",
        doubleMajorNotes: isConfirmed
          ? `Official source confirms this pairing: ${verification.official_policy_name || "double-major policy"}.`
          : "Both fields exist here per College Scorecard, but the double-major policy is not yet verified.",
        sourceContext: "Selected from Double Major Search",
        notes: isConfirmed
          ? `Double major: ${searchMeta.major1} + ${searchMeta.major2}. Officially confirmed via ${verification.source_label || verification.source_url}.`
          : `Considering a double major: ${searchMeta.major1} + ${searchMeta.major2}. Both fields exist here per College Scorecard, but the double-major policy is not yet verified -- confirm with the college's advising office.`,
        actionNeeded: isConfirmed ? null : "Verify double-major rules and school-to-school restrictions with the college's advising office or catalog.",
      });
      setComboSaveMsg(isConfirmed
        ? "Saved to Decision Plan as a confirmed double major."
        : "Saved to Decision Plan as a double-major consideration. Programs exist - double-major rules not verified.");
    } catch (e) {
      setComboSaveMsg(`Could not save: ${e.message}`);
    } finally { setComboSaving(false); }
  };

  // "+ List" for a double-major result: on first save, this IS the add (goes
  // through the normal toggle). If the college is already on the list (saved
  // from anywhere else), clicking here should ADD this pathway to the
  // existing card, never remove it or create a second card for the same
  // college -- forceAdd=true guarantees that.
  const addDoubleMajorOption = async () => {
    setListMsg(null);
    try {
      await onToggleSave(
        { college: { id: c.id, name: c.name, city: c.city, state: c.state }, admission: null, overall: null },
        {
          context: "Selected from Double Major Search",
          primaryMajor: searchMeta.major1, secondaryMajor: searchMeta.major2,
          doubleMajorLabel: `${searchMeta.major1} + ${searchMeta.major2}`,
          doubleMajorStatus: displayStatus,
          doubleMajorVerificationStatus: isConfirmed ? verification.verification_status : "Needs manual verification",
        },
        true // forceAdd -- merge in this pathway, don't toggle off an existing save
      );
      setListMsg("Added as double-major option.");
    } catch (e) {
      setListMsg(`Could not add: ${e.message}`);
    }
  };

  return (
    <div className="card pad" style={{ background: "var(--paper-2)" }}>
      <div className="row spread wrap" style={{ alignItems: "flex-start" }}>
        <strong>{c.name}</strong>
        <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
          {c.selectivityRank != null && <span className="pill" style={{ background: "var(--amber-b)" }}>Selectivity #{c.selectivityRank}</span>}
          {c.admissionRate != null && <span className="pill">Admit {fmtPct(c.admissionRate)}</span>}
          <span className="note">{[c.city, c.state].filter(Boolean).join(", ")}</span>
        </div>
      </div>
      {/* single-major matches */}
      {c.matchingPrograms && (
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          {c.matchingPrograms.map((p) => (
            <span key={p.cipCode} className="pill" style={{ background: p.matchType === "exact" ? "var(--safety-b)" : "var(--target-b)" }}>
              {p.title} · CIP {p.cipCode} · {p.matchType}
            </span>
          ))}
        </div>
      )}
      {/* combo matches */}
      {c.offersMajor1 != null && (
        <div style={{ marginTop: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill" style={{ background: "var(--safety-b)" }}>Offers both fields ✓</span>
            <span className="pill" style={{ background: isConfirmed ? "var(--safety-b)" : "var(--target-b)" }}>{displayStatus}</span>
          </div>
          {isConfirmed ? (
            <div className="note" style={{ marginTop: 6 }}>
              <strong>Official source confirms this pairing.</strong><br />
              Primary official program: {verification.primary_official_program_name} · Second official program: {verification.secondary_official_program_name}<br />
              Policy: {verification.official_policy_name} · Verification: {verification.verification_status}<br />
              Source: {verification.source_url ? <a href={verification.source_url} target="_blank" rel="noreferrer">{verification.source_label || verification.source_url}</a> : "-"} · Last checked: {verification.last_checked || "-"}
            </div>
          ) : (
            <div className="note" style={{ marginTop: 6, fontWeight: 600, color: "var(--amber)" }}>
              {secondaryLine
                ? `${secondaryLine}. ${hint} is not confirmed as a second major.`
                : "College Scorecard or broad program data suggests related fields exist, but an official double-major policy has not been confirmed."}
              <div style={{ fontWeight: 400, marginTop: 2 }}>Action needed: verify double-major rules using the college catalog, registrar, advising office, or department page.</div>
            </div>
          )}
          <div className="grid cols-2" style={{ gap: 8, marginTop: 8 }}>
            <div>
              <div className="note" style={{ fontWeight: 600 }}>{searchMeta.major1}</div>
              {(c.matchingMajor1Programs || []).slice(0, 3).map((p) => (
                <div key={p.cipCode} className="note" style={{ fontSize: 11 }}>• {p.title} (CIP {p.cipCode})</div>
              ))}
            </div>
            <div>
              <div className="note" style={{ fontWeight: 600 }}>{searchMeta.major2}</div>
              {(c.matchingMajor2Programs || []).slice(0, 3).map((p) => (
                <div key={p.cipCode} className="note" style={{ fontSize: 11 }}>• {p.title} (CIP {p.cipCode})</div>
              ))}
            </div>
          </div>
          {studentId && !isConfirmed && (
            <div style={{ marginTop: 8 }}>
              {!showConfirmForm ? (
                <button className="link" onClick={() => setShowConfirmForm(true)}>Confirm with an official source →</button>
              ) : (
                <ConfirmDoubleMajorForm studentId={studentId} college={c} searchMeta={searchMeta}
                  onSaved={() => { setShowConfirmForm(false); onVerificationSaved && onVerificationSaved(); }}
                  onCancel={() => setShowConfirmForm(false)} />
              )}
            </div>
          )}
        </div>
      )}
      {c.relatedAvailablePrograms && c.relatedAvailablePrograms.length > 0 && (
        <div className="note" style={{ marginTop: 6 }}>Also available: {c.relatedAvailablePrograms.slice(0, 6).join(", ")}</div>
      )}
      {c.warning && <div className="note" style={{ marginTop: 6, color: "var(--muted)", fontSize: 11 }}>{c.warning}</div>}

      {scored && (
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <span className="pill" style={{ background: "var(--amber-b)" }}>
            Estimated fit based on your profile: {scored.overall ?? "-"}
          </span>
          {scored.coarseCategory && <span className="pill">{scored.coarseCategory}</span>}
        </div>
      )}
      {evalErr && <div className="note" style={{ marginTop: 6, color: "var(--reach)" }}>{evalErr}</div>}
      {comboSaveMsg && <div className="note" style={{ marginTop: 6, color: "var(--safety)" }}>{comboSaveMsg}</div>}
      {listMsg && <div className="note" style={{ marginTop: 6, color: "var(--safety)" }}>{listMsg}</div>}

      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        <button className="link" onClick={() => onOpen && onOpen(c.id)}>View college →</button>
        {!scored && (
          <button className="link" onClick={evaluate} disabled={evaluating}>
            {evaluating ? "Evaluating…" : "Evaluate against my profile"}
          </button>
        )}
        {c.offersMajor1 != null && studentId && (
          <button className="link" onClick={saveComboToDecisionPlan} disabled={comboSaving}>
            {comboSaving ? "Saving to Decision Plan…" : "Save as double-major consideration →"}
          </button>
        )}
        {onToggleSave && !isCombo && (
          <button className="link" onClick={() => onToggleSave(
            { college: { id: c.id, name: c.name, city: c.city, state: c.state }, admission: null, overall: null },
            { context: "Selected from Single Major Search" }
          )}>
            {savedIds?.has(c.id) ? "Saved ✓" : "+ List"}
          </button>
        )}
        {onToggleSave && isCombo && !savedIds?.has(c.id) && (
          <button className="link" onClick={() => onToggleSave(
            { college: { id: c.id, name: c.name, city: c.city, state: c.state }, admission: null, overall: null },
            {
              context: "Selected from Double Major Search",
              primaryMajor: searchMeta.major1, secondaryMajor: searchMeta.major2,
              doubleMajorLabel: `${searchMeta.major1} + ${searchMeta.major2}`,
              doubleMajorStatus: displayStatus,
              doubleMajorVerificationStatus: isConfirmed ? verification.verification_status : "Needs manual verification",
            }
          )}>+ List</button>
        )}
        {onToggleSave && isCombo && savedIds?.has(c.id) && (
          <button className="link" onClick={addDoubleMajorOption}>Add as double-major option →</button>
        )}
      </div>
    </div>
  );
}

// Feature 1/2: the ONLY way a double_major_verifications record gets created.
// Every field the family fills in maps straight onto the record; nothing is
// inferred or guessed. The record only becomes "confirmed" (see
// isConfirmedDoubleMajor() server-side) once every required field is present
// AND verificationStatus is "Official source verified" or "User verified" --
// this form doesn't pre-decide that, the server gate does.
function ConfirmDoubleMajorForm({ studentId, college, searchMeta, onSaved, onCancel }) {
  const [form, setForm] = useState({
    primaryOfficialProgramName: searchMeta.major1, secondaryOfficialProgramName: searchMeta.major2,
    primaryProgramType: "Major", secondaryProgramType: "Major",
    officialPolicyName: "", doubleMajorPolicyType: "Double major",
    doubleMajorAllowedStatus: "Confirmed allowed",
    sourceUrl: "", sourceLabel: "", sourceType: SOURCE_TYPES[0],
    lastChecked: new Date().toISOString().slice(0, 10),
    verificationStatus: "User verified", restrictions: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (saving) return;
    setSaving(true); setErr(null);
    try {
      await api.addDoubleMajorVerification(studentId, {
        collegeId: college.id, collegeName: college.name,
        primaryProgramRequested: searchMeta.major1, secondaryProgramRequested: searchMeta.major2,
        ...form,
      });
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || "Could not save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="card pad" style={{ marginTop: 6, background: "var(--paper)" }}>
      <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>Confirm with an official source</div>
      <p className="note" style={{ marginBottom: 8 }}>
        Only fill this in from an official college source (catalog, undergraduate bulletin, registrar page, academic
        advising page, department page, or an official double-major/program policy page). This becomes "Confirmed
        double-major path" only when every field below is filled in and verification is set to Official or User verified.
      </p>
      <div className="grid cols-2" style={{ gap: 8 }}>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Primary official program name</span>
          <input className="inp" value={form.primaryOfficialProgramName} onChange={set("primaryOfficialProgramName")} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Second official program name</span>
          <input className="inp" value={form.secondaryOfficialProgramName} onChange={set("secondaryOfficialProgramName")} />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Primary program type</span>
          <select className="inp" value={form.primaryProgramType} onChange={set("primaryProgramType")}>
            {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Second program type</span>
          <select className="inp" value={form.secondaryProgramType} onChange={set("secondaryProgramType")}>
            {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Official policy name (e.g. "Double Major Policy")</span>
          <input className="inp" value={form.officialPolicyName} onChange={set("officialPolicyName")} placeholder="Official policy name" />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Policy type</span>
          <select className="inp" value={form.doubleMajorPolicyType} onChange={set("doubleMajorPolicyType")}>
            {POLICY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Allowed status</span>
          <select className="inp" value={form.doubleMajorAllowedStatus} onChange={set("doubleMajorAllowedStatus")}>
            {ALLOWED_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Verification</span>
          <select className="inp" value={form.verificationStatus} onChange={set("verificationStatus")}>
            {VERIFICATION_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Source URL</span>
          <input className="inp" value={form.sourceUrl} onChange={set("sourceUrl")} placeholder="https://…" />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Source type</span>
          <select className="inp" value={form.sourceType} onChange={set("sourceType")}>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Source label (optional)</span>
          <input className="inp" value={form.sourceLabel} onChange={set("sourceLabel")} placeholder="e.g. MIT Undergraduate Bulletin" />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="note">Last checked</span>
          <input className="inp" type="date" value={form.lastChecked} onChange={set("lastChecked")} />
        </label>
      </div>
      <label className="stack" style={{ gap: 2, marginTop: 8 }}>
        <span className="note">Restrictions (optional)</span>
        <input className="inp" value={form.restrictions} onChange={set("restrictions")} placeholder="e.g. requires school-to-school transfer approval" />
      </label>
      <label className="stack" style={{ gap: 2, marginTop: 8 }}>
        <span className="note">Notes (optional)</span>
        <input className="inp" value={form.notes} onChange={set("notes")} />
      </label>
      {err && <div className="note" style={{ color: "var(--reach)", marginTop: 6 }}>{err}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn primary sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save confirmation"}</button>
        <button className="btn ghost sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
