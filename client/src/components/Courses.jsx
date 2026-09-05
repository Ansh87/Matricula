// Courses.jsx - type a college name, see its undergraduate & engineering
// programs (live from College Scorecard) plus verified major combinations /
// dual-degrees for seeded colleges.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { SourceBadge, Spinner, ErrorNote, RestoredNote, ClearSearchButton } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

// College Scorecard's school_url field comes back as a bare domain (e.g.
// "web.mit.edu", no scheme), which the browser treats as a relative path if
// used directly as an href -- same fix already used in CollegeDetail.jsx.
function fixUrl(u) { return u ? (/^https?:/.test(u) ? u : `https://${u}`) : u; }

export function Courses({ onOpen, studentId, profile, initialTrackId }) {
  const [tab, setTab] = useState(initialTrackId ? "track" : "college"); // "college" | "track"
  // If a new track id arrives from Advisor after mount (e.g. clicking a
  // second "See course & prep plan" without leaving Courses), jump tabs again.
  useEffect(() => { if (initialTrackId) setTab("track"); }, [initialTrackId]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [siteScan, setSiteScan] = useState(null);
  const [siteScanLoading, setSiteScanLoading] = useState(false);
  const [siteScanErr, setSiteScanErr] = useState(null);

  // Issue 1: keep the searched college name, results, picked college, and
  // its loaded programs on screen across navigation/refresh/logout-login.
  const coursesSnapshot = { tab, q, results, selected, programs };
  const { restoredFrom, clear: clearCoursesPersisted } = usePersistedSearch(studentId, "courses", coursesSnapshot, (r) => {
    if (!r) return;
    if (!initialTrackId && r.tab) setTab(r.tab);
    if (r.q !== undefined) setQ(r.q);
    if (r.results !== undefined) setResults(r.results);
    if (r.selected !== undefined) setSelected(r.selected);
    if (r.programs !== undefined) setPrograms(r.programs);
  });
  const clearCoursesSearch = () => {
    setQ(""); setResults([]); setSelected(null); setPrograms(null); setErr(null);
    clearCoursesPersisted();
  };

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true); setErr(null); setResults([]); setPrograms(null); setSelected(null);
    try {
      const r = await api.searchColleges({ name: q.trim() });
      setResults(r.results || []);
      if (!r.results?.length) setErr({ message: "No colleges found with that name. Try a shorter or different spelling." });
    } catch (e) { setErr(e); }
    finally { setSearching(false); }
  };

  const pick = async (c) => {
    setSelected(c); setPrograms(null); setLoading(true); setErr(null);
    setSiteScan(null); setSiteScanErr(null);
    try { setPrograms(await api.programs(c.id)); }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  };

  const scanSite = async () => {
    if (!selected) return;
    setSiteScanLoading(true); setSiteScanErr(null);
    try { setSiteScan(await api.officialSitePrograms(selected.id)); }
    catch (e) { setSiteScanErr(e); }
    finally { setSiteScanLoading(false); }
  };

  // group programs by broad area for readability
  const grouped = programs?.programs ? groupPrograms(programs.programs) : null;

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Courses &amp; programs</div>
        <h1>What can you study there?</h1>
        <p className="lead">Search a college to see its undergraduate and engineering programs from official
          data, plus notable major combinations and dual-degrees for our verified colleges.</p>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${tab === "college" ? "primary" : "ghost"}`} onClick={() => setTab("college")}>By College</button>
        <button className={`btn sm ${tab === "track" ? "primary" : "ghost"}`} onClick={() => setTab("track")}>By Career Track</button>
      </div>

      {tab === "track" && <TrackPlans studentId={studentId} profile={profile} initialTrackId={initialTrackId} />}

      {tab === "college" && (
      <>
      <div className="card pad">
        <label className="lbl">College name</label>
        <div className="row" style={{ gap: 8 }}>
          <input className="inp" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()} placeholder="e.g. Georgia Tech, MIT, Rutgers" />
          <button className="btn primary" onClick={search} disabled={searching}>Search</button>
          <ClearSearchButton onClear={clearCoursesSearch} label="Clear search" />
        </div>
        <RestoredNote restoredFrom={restoredFrom} />
      </div>

      {searching && <div className="card pad"><Spinner label="Searching colleges…" /></div>}
      {err && <ErrorNote onRetry={selected ? () => pick(selected) : search}>{err.message}</ErrorNote>}

      {results.length > 0 && !selected && (
        <div className="stack">
          <h3>Select a college</h3>
          {results.map((c) => (
            <div key={c.id} className="card pad row spread" style={{ cursor: "pointer" }} onClick={() => pick(c)}>
              <div>
                <strong>{c.name}</strong>
                <div className="note">{[c.city, c.state].filter(Boolean).join(", ")} · {c.controlType || ""}</div>
              </div>
              <button className="btn ghost sm">View programs →</button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="stack">
          <div className="row spread wrap">
            <div>
              <h2>{selected.name}</h2>
              <div className="note">{[selected.city, selected.state].filter(Boolean).join(", ")}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost sm" onClick={() => { setSelected(null); setPrograms(null); }}>← Back</button>
              <button className="btn amber sm" onClick={() => onOpen(selected.id)}>Full dossier</button>
            </div>
          </div>

          {loading && <div className="card pad"><Spinner label="Loading programs…" /></div>}

          {programs && !programs.available && (
            <div className="card pad"><p className="note">{programs.note}</p></div>
          )}

          {programs?.available && (
            <>
              {/* verified combinations / dual-degrees */}
              {programs.notes && (
                <div className="card pad stack">
                  <div className="row spread"><h3>Notable major combinations &amp; dual-degrees</h3><SourceBadge level="verified" /></div>
                  {programs.notes.combinations && (
                    <div>
                      <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>Popular combinations</div>
                      <div className="chips">{programs.notes.combinations.map((x) => <span key={x} className="pill">{x}</span>)}</div>
                    </div>
                  )}
                  {programs.notes.dualDegrees && (
                    <div>
                      <div className="note" style={{ fontWeight: 600, margin: "6px 0" }}>Dual-degree / special programs</div>
                      <div className="chips">{programs.notes.dualDegrees.map((x) => <span key={x} className="pill">{x}</span>)}</div>
                    </div>
                  )}
                  {programs.notes.engineering && (
                    <div>
                      <div className="note" style={{ fontWeight: 600, margin: "6px 0" }}>Engineering</div>
                      <p className="note">{programs.notes.engineering}</p>
                    </div>
                  )}
                  {programs.notes.note && <p className="note">{programs.notes.note}</p>}
                  {programs.notes.url && <a className="link" href={programs.notes.url} target="_blank" rel="noreferrer">Official program page ↗</a>}
                </div>
              )}

              {/* live program list */}
              {grouped && Object.keys(grouped).length > 0 ? (
                <div className="card pad">
                  <div className="row spread" style={{ marginBottom: 8 }}>
                    <h3>All undergraduate programs</h3><SourceBadge level="official">Scorecard</SourceBadge>
                  </div>
                  <div className="note" style={{ marginBottom: 4 }}>{programs.programs.length} bachelor's programs · Source: {programs.source}, {programs.sourceYear}</div>
                  <div className="note" style={{ marginBottom: 10 }}>
                    This is the federal government's program taxonomy, not {selected.name}'s own department page - titles and groupings won't always match the college's own website.
                    {programs.officialWebsiteUrl && (
                      <> <a className="link" href={fixUrl(programs.officialWebsiteUrl)} target="_blank" rel="noreferrer">Compare with {selected.name}'s official site ↗</a></>
                    )}
                  </div>
                  {Object.entries(grouped).map(([area, list]) => (
                    <details key={area} style={{ marginBottom: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{area} <span className="note">({list.length})</span></summary>
                      <div className="chips" style={{ marginTop: 8 }}>
                        {list.map((p) => <span key={p.title} className="pill">{p.title}</span>)}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="card pad"><p className="note">Official per-program list isn't available for this college in College Scorecard. Confirm majors on the college's official site.</p></div>
              )}

              <div className="disclaimer">{programs.disclaimer}</div>

              {/* Layer 4: live scan of the college's own site, shown separately
                  from the CIP list above so the two are never confused. */}
              <div className="card pad stack">
                <div className="row spread" style={{ marginBottom: 4 }}>
                  <h3>From {selected.name}'s own website</h3><SourceBadge level="official">Live scan</SourceBadge>
                </div>
                <p className="note">
                  A direct, on-demand scan of {programs.officialWebsiteUrl ? <a className="link" href={fixUrl(programs.officialWebsiteUrl)} target="_blank" rel="noreferrer">{selected.name}'s official site</a> : "the college's official site"} for its own
                  department/major pages - a different lens than the federal list above. Not saved anywhere; run it fresh any time. Best-effort only, so treat gaps
                  or misses as "check the site directly," not "doesn't exist."
                </p>
                <button className="btn ghost sm" onClick={scanSite} disabled={siteScanLoading} style={{ alignSelf: "flex-start" }}>
                  {siteScanLoading ? "Scanning…" : siteScan ? "Scan again" : `Scan ${selected.name}'s site for majors`}
                </button>

                {siteScanLoading && <Spinner label={`Scanning ${selected.name}'s official site (this can take up to ~30s)…`} />}
                {siteScanErr && <ErrorNote onRetry={scanSite}>{siteScanErr.message}</ErrorNote>}

                {siteScan && !siteScan.available && (
                  <p className="note">{siteScan.note}</p>
                )}

                {siteScan?.available && (
                  <>
                    <div className="note">
                      Scanned {siteScan.pagesFetched} page{siteScan.pagesFetched === 1 ? "" : "s"} of {siteScan.domain} (up to {siteScan.maxPages}) · found {siteScan.majorsFound} department/major page{siteScan.majorsFound === 1 ? "" : "s"}
                    </div>
                    {siteScan.majors.length > 0 ? (
                      <div className="stack" style={{ gap: 4 }}>
                        {siteScan.majors.map((m) => (
                          <a key={m.url} className="link" href={m.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                            {m.title} ↗
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="note">{siteScan.note}</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// "By Career Track" -- general, evidence-based course/prep guidance per
// Career Track (senior-year courses, college early direction, math/domain
// expectations, suggested projects/skills, risks if prep is weak). Reuses the
// same shared reference data (course_plans) as the Decision Plan tab's Course
// & Prep Plans sub-tab -- never a claim about what a specific college requires.
function TrackPlans({ studentId, profile, initialTrackId }) {
  const [plans, setPlans] = useState([]);
  const [trackId, setTrackId] = useState(initialTrackId || profile?.preferredScenarioId || "");

  useEffect(() => {
    if (!studentId) return;
    api.listCoursePlans(studentId).then((r) => setPlans(r.plans || [])).catch(() => {});
  }, [studentId]);

  // A newly-passed track id (from Advisor's "See course & prep plan") should
  // take over the selection even if one was already showing.
  useEffect(() => { if (initialTrackId) setTrackId(initialTrackId); }, [initialTrackId]);

  // Issue 1: persist the selected career track so it survives navigation.
  usePersistedSearch(studentId, "courses:track", { trackId }, (r) => {
    if (!initialTrackId && r && r.trackId !== undefined) setTrackId(r.trackId);
  });

  const plan = plans.find((p) => p.track_id === trackId) || null;

  return (
    <div className="stack">
      <div className="card pad">
        <h3>Course &amp; Preparation Plan by Career Track</h3>
        <p className="note">General, evidence-based prep guidance per Career Track -- not a claim about what any specific college requires or offers.</p>
        <select className="inp" style={{ maxWidth: 420, marginTop: 8 }} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">Choose a track...</option>
          {plans.map((p) => <option key={p.track_id} value={p.track_id}>{p.track_name}</option>)}
        </select>
      </div>
      {plan && (
        <div className="card pad">
          <h3>{plan.track_name}</h3>
          <div className="grid cols-2">
            <div><div className="note" style={{ fontWeight: 600 }}>Senior-year courses</div><div className="note">{plan.senior_year_courses}</div></div>
            <div><div className="note" style={{ fontWeight: 600 }}>College early course direction</div><div className="note">{plan.college_early_course_direction}</div></div>
            <div><div className="note" style={{ fontWeight: 600 }}>Math expectations</div><div className="note">{plan.math_expectations}</div></div>
            <div><div className="note" style={{ fontWeight: 600 }}>Domain expectations</div><div className="note">{plan.domain_expectations}</div></div>
            <div><div className="note" style={{ fontWeight: 600 }}>Suggested projects</div><div className="note">{plan.suggested_projects}</div></div>
            <div><div className="note" style={{ fontWeight: 600 }}>Suggested skills</div><div className="note">{plan.suggested_skills}</div></div>
          </div>
          <div className="disclaimer" style={{ marginTop: 12 }}>Risks if preparation is weak: {plan.risks_if_weak_prep}</div>
        </div>
      )}
    </div>
  );
}

// Group CIP program titles into broad areas for readability.
function groupPrograms(programs) {
  const areas = {
    "Computing & Data": /comput|informat|data|software|cyber|network/i,
    "Engineering": /engineer|mechatron/i,
    "Math & Physical Science": /math|statist|physic|chemist|astronom|geolog/i,
    "Life & Health Science": /biolog|biochem|neuro|health|nursing|kinesi|nutrition|medic/i,
    "Business & Economics": /business|econ|financ|account|marketing|management|entrepreneur/i,
    "Social Science": /psycholog|sociolog|political|anthropolog|geograph|criminolog|policy|international/i,
    "Humanities & Arts": /english|histor|philosoph|languag|literat|art|music|theat|design|media|communic|writing/i,
    "Education": /educat|teach/i,
  };
  const out = {}; const other = [];
  for (const p of programs) {
    let placed = false;
    for (const [area, re] of Object.entries(areas)) {
      if (re.test(p.title)) { (out[area] = out[area] || []).push(p); placed = true; break; }
    }
    if (!placed) other.push(p);
  }
  if (other.length) out["Other"] = other;
  return out;
}
