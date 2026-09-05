// Programs.jsx -- "Programs & Opportunities" tab. "Program" is broad: major,
// minor, concentration, certificate, honors/scholars/bridge program, research
// program, direct-admit pipeline, scholarship-linked cohort, etc. The primary
// workflow is one button -- "Research this college" -- which runs College
// Scorecard field-of-study seeding and, when the college's official website is
// on file, a bounded official-domain crawl automatically. A family never has
// to already know or type a web address to get started. Power users who do
// already have a specific official link can use the Advanced section.
// Every record is source-labeled, dated, and flagged when it still needs
// manual verification. Nothing here is invented.
import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { auth, firebaseConfigured } from "../lib/firebase.js";
import { SourceBadge, InlineSpinner, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

const SOURCE_TYPES = [
  ["program_page", "Program page"],
  ["admissions_page", "Admissions page"],
  ["department_page", "School/department page"],
  ["special_program_page", "Special program page"],
  ["common_data_set", "Common Data Set"],
  ["net_price_calculator", "Net price calculator"],
  ["other", "Other"],
];

const PROGRAM_TYPE_OPTIONS = [
  "Major", "Minor", "Concentration/Track", "Certificate", "Honors/Scholars Program",
  "Research Program", "Direct-Admit Pipeline", "Bridge/Access Program", "Leadership Program",
  "Study Abroad", "Internship/Co-op Program", "Scholarship-linked Cohort", "Other",
];

async function authHeader() {
  try {
    if (firebaseConfigured && auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* dev bypass / no firebase configured */ }
  return {};
}

function badgeLevelFor(status) {
  if (status === "Official source verified" || status === "College Scorecard / CIP inferred") return "official";
  if (status === "User verified") return "verified";
  return "unavailable"; // Needs manual verification / Outdated / Not relevant
}

// Group discovered programs into three quality tiers so the family sees the
// solid results first and low-confidence auto-discovered noise is clearly
// separated (and collapsible) instead of interleaved with everything else.
function groupByQuality(programs) {
  const verified = [], scorecard = [], review = [], dismissed = [];
  for (const p of programs) {
    if (p.verification_status === "Not relevant") dismissed.push(p);
    else if (p.verification_status === "Official source verified" || p.verification_status === "User verified") verified.push(p);
    else if (p.verification_status === "College Scorecard / CIP inferred") scorecard.push(p);
    else review.push(p);
  }
  // Within "needs review," show higher-confidence extractions first.
  const confRank = { high: 0, medium: 1, low: 2 };
  review.sort((a, b) => (confRank[a.confidence_level] ?? 3) - (confRank[b.confidence_level] ?? 3));
  return { verified, scorecard, review, dismissed };
}

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="note" style={{ fontWeight: 600 }}>{label}</div>
      <div className="note">{value || "Data unavailable - needs manual verification"}</div>
    </div>
  );
}

const BLANK_MANUAL = {
  programName: "", programType: "Major", schoolDepartment: "", eligibility: "", whoCanApply: "",
  applicationDeadline: "", applicationProcess: "", benefits: "", requirements: "", sourceUrl: "", notes: "",
};

export function Programs({ studentId, profile }) {
  const [collegeQuery, setCollegeQuery] = useState("");
  const [collegeResults, setCollegeResults] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const [tracks, setTracks] = useState([]); // [{track_id, track_name}]
  const [researchTrack, setResearchTrack] = useState("");
  const [researchKeyword, setResearchKeyword] = useState("");
  const [researchResult, setResearchResult] = useState(null);

  const [manual, setManual] = useState(BLANK_MANUAL);
  const [manualTracks, setManualTracks] = useState([]);

  const [manualDetailsOpen, setManualDetailsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", sourceType: "program_page" });
  const [domainForm, setDomainForm] = useState({ domain: "", startUrl: "" });

  const [filters, setFilters] = useState({ keyword: "", track: "", verificationStatus: "" });
  // The "Discovered programs" list is scoped to the selected college by
  // default (section 1); this lets the family see everything across every
  // college they've researched without losing their college selection for
  // sections 2/3.
  const [listAllColleges, setListAllColleges] = useState(false);
  useEffect(() => { setListAllColleges(false); }, [selectedCollege?.id]);
  const [programs, setPrograms] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showNeedsReview, setShowNeedsReview] = useState(true);

  // Issue 1: keep the selected college, keyword/track/verification filters,
  // and dismissed/needs-review toggles when navigating away and back (or
  // refreshing, or logging back in). Restoring selectedCollege re-triggers
  // loadPrograms() below automatically -- no separate results persistence
  // needed, so this can never show stale program data.
  const programsSnapshot = { collegeQuery, selectedCollege, filters, showDismissed, showNeedsReview };
  const { restoredFrom } = usePersistedSearch(studentId, "programs", programsSnapshot, (r) => {
    if (!r) return;
    if (r.collegeQuery !== undefined) setCollegeQuery(r.collegeQuery);
    if (r.selectedCollege !== undefined) setSelectedCollege(r.selectedCollege);
    if (r.filters !== undefined) setFilters(r.filters);
    if (r.showDismissed !== undefined) setShowDismissed(r.showDismissed);
    if (r.showNeedsReview !== undefined) setShowNeedsReview(r.showNeedsReview);
  });

  useEffect(() => {
    api.listCoursePlans(studentId).then((r) => setTracks(r.plans || [])).catch(() => {});
  }, [studentId]);

  const loadPrograms = useCallback(() => {
    const params = {};
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.track) params.track = filters.track;
    if (filters.verificationStatus) params.verificationStatus = filters.verificationStatus;
    if (selectedCollege && !listAllColleges) params.collegeId = selectedCollege.id;
    api.listDiscoveredPrograms(studentId, params).then((r) => {
      setPrograms(r.programs || []);
      setStatuses(r.statuses || []);
    }).catch(() => {});
  }, [studentId, filters, selectedCollege, listAllColleges]);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const searchColleges = async () => {
    if (!collegeQuery.trim()) return;
    setBusy(true);
    try {
      const r = await api.browseColleges({ name: collegeQuery, page: 0, perPage: 10 });
      setCollegeResults(r.colleges || r.results || []);
    } catch (e) {
      setActionMsg({ ok: false, text: `College search failed: ${e.message}` });
    } finally { setBusy(false); }
  };

  const researchCollege = async () => {
    if (!selectedCollege) return;
    setBusy(true); setActionMsg(null); setResearchResult(null);
    try {
      const r = await api.researchCollege(studentId, {
        collegeId: selectedCollege.id, collegeName: selectedCollege.name,
        track: researchTrack || undefined, keyword: researchKeyword || undefined,
      });
      setResearchResult(r);
      loadPrograms();
    } catch (e) {
      setActionMsg({ ok: false, text: `Research failed: ${e.message}` });
    } finally { setBusy(false); }
  };

  const addManualProgram = async () => {
    if (!manual.programName.trim()) return;
    setBusy(true); setActionMsg(null);
    try {
      const r = await api.addManualProgram(studentId, {
        collegeId: selectedCollege?.id, collegeName: selectedCollege?.name || manual.collegeName,
        ...manual, relevantTracks: manualTracks,
      });
      setActionMsg({ ok: true, text: `Added "${r.program_name}" -- marked User verified. Keep the source link current.` });
      setManual(BLANK_MANUAL); setManualTracks([]);
      loadPrograms();
    } catch (e) {
      setActionMsg({ ok: false, text: `Could not add program: ${e.message}` });
    } finally { setBusy(false); }
  };

  const addUrl = async () => {
    if (!urlForm.url.trim()) return;
    setBusy(true); setActionMsg(null);
    try {
      const r = await api.addProgramSource(studentId, {
        collegeId: selectedCollege?.id, collegeName: selectedCollege?.name,
        url: urlForm.url.trim(), sourceType: urlForm.sourceType,
      });
      if (r.program) {
        setActionMsg({ ok: true, text: `Fetched and extracted a program record (confidence: ${r.program.confidence_level}). Status: ${r.program.verification_status}. Review before treating anything as final.` });
      } else {
        setActionMsg({ ok: r.source?.fetchStatus === "ok", text: `Source recorded (status: ${r.source?.fetchStatus}). ${r.source?.error || ""}` });
      }
      setUrlForm({ url: "", sourceType: urlForm.sourceType });
      loadPrograms();
    } catch (e) {
      setActionMsg({ ok: false, text: `Could not add source: ${e.message}` });
    } finally { setBusy(false); }
  };

  const discover = async () => {
    if (!domainForm.domain.trim()) return;
    setBusy(true); setActionMsg(null);
    try {
      const r = await api.discoverPrograms(studentId, {
        collegeId: selectedCollege?.id, collegeName: selectedCollege?.name,
        domain: domainForm.domain.trim(), startUrl: domainForm.startUrl.trim() || undefined,
      });
      setActionMsg({
        ok: true,
        text: `Bounded crawl of ${r.domain}: fetched ${r.pagesFetched}/${r.maxPages} pages (max depth ${r.maxDepth}), found ${r.programsFound} program-like page(s). Skipped: ${r.robotsBlocked} robots-blocked, ${r.offDomainSkipped} off-domain, ${r.pdfSkipped} PDFs. Every result needs manual review before treating as verified.`,
      });
      loadPrograms();
    } catch (e) {
      setActionMsg({ ok: false, text: `Discovery failed: ${e.message}` });
    } finally { setBusy(false); }
  };

  const setStatus = async (programId, verificationStatus) => {
    await api.updateDiscoveredProgram(studentId, programId, { verificationStatus, markLastChecked: true }).catch(() => {});
    loadPrograms();
  };

  const dismissProgram = async (programId) => {
    await api.updateDiscoveredProgram(studentId, programId, { verificationStatus: "Not relevant", markLastChecked: true }).catch(() => {});
    loadPrograms();
  };

  const setActionNeeded = async (programId, actionNeeded) => {
    await api.updateDiscoveredProgram(studentId, programId, { actionNeeded }).catch(() => {});
    loadPrograms();
  };

  const removeProgram = async (programId) => {
    await api.deleteDiscoveredProgram(studentId, programId).catch(() => {});
    loadPrograms();
  };

  // "Clear discovered programs" -- scoped to whichever set is currently shown
  // (one college, or every college when "Show all colleges" is on), so a
  // family can wipe out a messy first pass and re-run "Research this college"
  // cleanly instead of dismissing/deleting rows one at a time.
  const clearDiscovered = async () => {
    const scopedToCollege = selectedCollege && !listAllColleges ? selectedCollege : null;
    const label = scopedToCollege ? `all discovered programs for ${scopedToCollege.name}` : "ALL discovered programs across every college";
    if (!window.confirm(`Remove ${label}? This can't be undone. Programs already added to your Decision Plan are not affected.`)) return;
    setBusy(true);
    try {
      const r = await api.clearDiscoveredPrograms(studentId, scopedToCollege?.id);
      setActionMsg({ ok: true, text: `Removed ${r.removed} discovered program(s).` });
      loadPrograms();
    } catch (e) {
      setActionMsg({ ok: false, text: `Could not clear: ${e.message}` });
    } finally { setBusy(false); }
  };

  const saveToDecisionPlan = async (p) => {
    try {
      await api.addDecisionItem(studentId, {
        collegeId: p.college_id, collegeName: p.college_name, programId: p.program_id, programName: p.program_name,
        programVerificationStatus: p.verification_status, careerTrack: profile?.primaryMajor || null,
        actionNeeded: p.action_needed || null,
      });
      setSavedMsg({ ok: true, text: `Saved "${p.program_name}" at ${p.college_name || "this college"} to your Decision Plan.` });
    } catch (e) {
      setSavedMsg({ ok: false, text: `Could not save to Decision Plan: ${e.message}` });
    }
  };

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(null);
  const exportCsv = async () => {
    if (csvBusy) return; // prevent duplicate clicks
    setCsvBusy(true); setCsvErr(null);
    try {
      const r = await fetch(api.programsExportCsvUrl(studentId), { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `programs-and-opportunities-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // if this fails, the family can still view/edit everything on-screen
      setCsvErr(e.message || "Could not download the CSV file.");
    } finally { setCsvBusy(false); }
  };

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Programs &amp; Opportunities</div>
          <h1>Programs &amp; Opportunities</h1>
          <p className="lead">
            Find real majors, minors, concentrations, certificates, honors/scholars/bridge programs, research
            programs, and other special opportunities at the colleges you're considering -- every record is
            source-labeled, dated, and flagged when it still needs manual verification. Nothing here is invented.
          </p>
        </div>
        <div>
          <button className="btn ghost" onClick={exportCsv} disabled={csvBusy}>
            {csvBusy ? <><InlineSpinner />Saving CSV…</> : "Export CSV"}
          </button>
          {csvErr && <div className="note" style={{ color: "var(--reach)", marginTop: 4 }}>{csvErr}</div>}
        </div>
      </div>

      <div className="disclaimer">
        Program discovery may be incomplete -- some official pages block automated access, or a program simply
        isn't described in a crawlable page. Do not treat any record below as confirmed until its status is
        "Official source verified" or "User verified." Always verify final decisions on official college websites.
      </div>

      <div className="card pad">
        <h3>1. Pick a college</h3>
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          <input className="inp" style={{ maxWidth: 320 }} placeholder="Search colleges by name..."
            value={collegeQuery} onChange={(e) => setCollegeQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") searchColleges(); }} />
          <button className="btn ghost" disabled={busy} onClick={searchColleges}>Search</button>
          {selectedCollege && (
            <span className="cat Target">Selected: {selectedCollege.name} <button className="link" onClick={() => setSelectedCollege(null)}>clear</button></span>
          )}
        </div>
        <RestoredNote restoredFrom={restoredFrom} />
        {collegeResults.length > 0 && !selectedCollege && (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {collegeResults.map((c) => (
              <button key={c.id} className="btn sm ghost" onClick={() => { setSelectedCollege({ id: c.id, name: c.name }); setCollegeResults([]); }}>
                {c.name}{c.state ? ` (${c.state})` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card pad" style={{ borderColor: "var(--amber)" }}>
        <h3>2. Research this college</h3>
        <p className="note">
          One button, three things happen: we pull broad field-of-study data from the U.S. Department of Education
          College Scorecard, and -- if the college's official website is on file -- we automatically run a bounded
          scan (up to 40 pages, official domain only) looking for program, admissions, and special-opportunity pages.
          You don't need to already know or type a web address.
        </p>
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          <div>
            <label className="lbl">Career track (optional, helps tag results)</label>
            <select className="inp" style={{ minWidth: 260 }} value={researchTrack} onChange={(e) => setResearchTrack(e.target.value)}>
              <option value="">Any / not sure yet</option>
              {tracks.map((t) => <option key={t.track_id} value={t.track_id}>{t.track_name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Keyword (optional, e.g. "honors", "nursing")</label>
            <input className="inp" value={researchKeyword} onChange={(e) => setResearchKeyword(e.target.value)} />
          </div>
        </div>
        <button className="btn amber" style={{ marginTop: 10 }} disabled={busy || !selectedCollege} onClick={researchCollege}>
          {busy ? <><InlineSpinner />Researching this college…</> : "Research this college"}
        </button>
        {!selectedCollege && <div className="note" style={{ marginTop: 6 }}>Pick a college above first.</div>}

        {researchResult && (
          <div className="disclaimer" style={{ marginTop: 12 }}>
            <strong>{researchResult.collegeName}:</strong>{" "}
            {researchResult.scorecard?.added != null
              ? `added ${researchResult.scorecard.added} College Scorecard field-of-study record(s). `
              : "College Scorecard field-of-study data unavailable. "}
            {researchResult.domainDiscovery?.skipped
              ? researchResult.domainDiscovery.reason
              : researchResult.domainDiscovery?.error
                ? `Official-site scan could not complete: ${researchResult.domainDiscovery.error}`
                : (() => {
                    const d = researchResult.domainDiscovery || {};
                    const skippedBits = [
                      d.lowQualitySkipped ? `${d.lowQualitySkipped} skipped as navigation/low-quality pages` : null,
                      d.duplicatesSkipped ? `${d.duplicatesSkipped} already known (merged, not duplicated)` : null,
                    ].filter(Boolean).join(", ");
                    return `Scanned ${researchResult.domainUsed || "the official site"}: fetched ${d.pagesFetched ?? 0} page(s), added ${d.programsFound ?? 0} new program record(s)${skippedBits ? ` (${skippedBits})` : ""}.`;
                  })()}
            {" "}{researchResult.incompleteNotice}
          </div>
        )}
      </div>

      <div className="card pad">
        <h3>3. Add a program you already know about</h3>
        <p className="note">Know a specific major, minor, or special program from a brochure, campus visit, or counselor conversation? Add the name and you're done -- fill in more details now or later.</p>
        <div className="grid cols-2">
          <div>
            <label className="lbl">Program name *</label>
            <input className="inp" placeholder="e.g. Plan II Honors Program" value={manual.programName}
              onChange={(e) => setManual((m) => ({ ...m, programName: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && manual.programName.trim()) addManualProgram(); }} />
          </div>
          <div>
            <label className="lbl">Program type</label>
            <select className="inp" value={manual.programType} onChange={(e) => setManual((m) => ({ ...m, programType: e.target.value }))}>
              {PROGRAM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <label className="lbl" style={{ marginTop: 8 }}>Source URL (recommended, but not required)</label>
        <input className="inp" placeholder="https://..." value={manual.sourceUrl} onChange={(e) => setManual((m) => ({ ...m, sourceUrl: e.target.value }))} />

        <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
          <button className="btn amber" disabled={busy || !manual.programName.trim()} onClick={addManualProgram}>
            Add this program
          </button>
          <button className="link" onClick={() => setManualDetailsOpen((v) => !v)}>
            {manualDetailsOpen ? "Hide extra details" : "+ Add more details (optional)"}
          </button>
        </div>

        {manualDetailsOpen && (
          <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
            <div className="grid cols-2">
              <div>
                <label className="lbl">School / department</label>
                <input className="inp" value={manual.schoolDepartment} onChange={(e) => setManual((m) => ({ ...m, schoolDepartment: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Application deadline</label>
                <input className="inp" value={manual.applicationDeadline} onChange={(e) => setManual((m) => ({ ...m, applicationDeadline: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Eligibility</label>
                <input className="inp" value={manual.eligibility} onChange={(e) => setManual((m) => ({ ...m, eligibility: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Who can apply</label>
                <input className="inp" value={manual.whoCanApply} onChange={(e) => setManual((m) => ({ ...m, whoCanApply: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Application process</label>
                <input className="inp" value={manual.applicationProcess} onChange={(e) => setManual((m) => ({ ...m, applicationProcess: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Benefits</label>
                <input className="inp" value={manual.benefits} onChange={(e) => setManual((m) => ({ ...m, benefits: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Requirements</label>
                <input className="inp" value={manual.requirements} onChange={(e) => setManual((m) => ({ ...m, requirements: e.target.value }))} />
              </div>
            </div>
            <label className="lbl">Relevant career tracks (optional)</label>
            <select className="inp" multiple style={{ minHeight: 70 }} value={manualTracks}
              onChange={(e) => setManualTracks(Array.from(e.target.selectedOptions, (o) => o.value))}>
              {tracks.map((t) => <option key={t.track_id} value={t.track_id}>{t.track_name}</option>)}
            </select>
            <label className="lbl">Notes</label>
            <input className="inp" value={manual.notes} onChange={(e) => setManual((m) => ({ ...m, notes: e.target.value }))} />
          </div>
        )}
        <p className="note" style={{ marginTop: 8 }}>You can always come back and fill in the rest later -- open it from the "Verified" list below and click Details. Nothing here needs to be complete on the first pass.</p>
      </div>

      {actionMsg && (
        <div className="disclaimer" style={!actionMsg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>
          {actionMsg.text}
        </div>
      )}
      {savedMsg && (
        <div className="disclaimer" style={!savedMsg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>
          {savedMsg.text}
        </div>
      )}

      <div className="card pad">
        <div className="row spread wrap" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>4. Discovered programs</h3>
          {programs.length > 0 && (
            <button className="btn ghost sm" style={{ color: "var(--reach)" }} disabled={busy} onClick={clearDiscovered}>
              Clear {selectedCollege && !listAllColleges ? `${selectedCollege.name}'s` : "all"} discovered programs
            </button>
          )}
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
          <input className="inp" style={{ maxWidth: 220 }} placeholder="Keyword..." value={filters.keyword} onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))} />
          <select className="inp" style={{ maxWidth: 260 }} value={filters.track} onChange={(e) => setFilters((f) => ({ ...f, track: e.target.value }))}>
            <option value="">Any career track</option>
            {tracks.map((t) => <option key={t.track_id} value={t.track_id}>{t.track_name}</option>)}
          </select>
          <select className="inp" style={{ maxWidth: 240 }} value={filters.verificationStatus} onChange={(e) => setFilters((f) => ({ ...f, verificationStatus: e.target.value }))}>
            <option value="">All verification statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filters.keyword || filters.track || filters.verificationStatus) && (
            <button className="btn ghost sm" onClick={() => setFilters({ keyword: "", track: "", verificationStatus: "" })}>
              Clear filters
            </button>
          )}
        </div>
        {selectedCollege && !listAllColleges && (
          <div className="note" style={{ marginTop: 6 }}>
            Showing only <strong>{selectedCollege.name}</strong>.{" "}
            <button className="link" onClick={() => setListAllColleges(true)}>Show all colleges instead</button>
          </div>
        )}
        {selectedCollege && listAllColleges && (
          <div className="note" style={{ marginTop: 6 }}>
            Showing programs from every college you've researched.{" "}
            <button className="link" onClick={() => setListAllColleges(false)}>Show only {selectedCollege.name}</button>
          </div>
        )}

        {!programs.length && <div className="empty" style={{ marginTop: 12 }}>No programs found yet. Try "Research this college" above, or add one you already know about.</div>}

        {(() => {
          const { verified, scorecard, review, dismissed } = groupByQuality(programs);
          const renderRow = (p, { withDismiss } = {}) => {
            const isOpen = expanded === p.program_id;
            return (
              <div key={p.program_id} className="card">
                <div className="pad row spread wrap" style={{ gap: 8 }}>
                  <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setExpanded(isOpen ? null : p.program_id)}>
                    <h3>{p.program_name}</h3>
                    <div className="note">{p.college_name || "College not set"} · {p.program_type || "Type unknown"}{p.school_department ? ` · ${p.school_department}` : ""}</div>
                  </div>
                  <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                    <SourceBadge level={badgeLevelFor(p.verification_status)}>{p.verification_status}</SourceBadge>
                    {withDismiss && (
                      <>
                        <button className="btn sm ghost" onClick={() => dismissProgram(p.program_id)}>Not relevant</button>
                        <button className="btn sm ghost" onClick={() => removeProgram(p.program_id)}>Delete</button>
                      </>
                    )}
                    <button className="btn sm ghost" onClick={() => setExpanded(isOpen ? null : p.program_id)}>{isOpen ? "Hide" : "Details"}</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                    <div className="grid cols-2">
                      <Field label="Eligibility" value={p.eligibility} />
                      <Field label="Who can apply" value={p.who_can_apply} />
                      <Field label="Application deadline" value={p.application_deadline} />
                      <Field label="Application process" value={p.application_process} />
                      <Field label="Benefits" value={p.benefits} />
                      <Field label="Requirements" value={p.requirements} />
                    </div>
                    <div className="note" style={{ marginTop: 8 }}>
                      Source: {p.source_label || "Unknown"}{p.source_url ? <> - <a href={p.source_url} target="_blank" rel="noreferrer">{p.source_url}</a></> : null}<br />
                      Confidence: {p.confidence_level || "unknown"} · Last checked: {p.last_checked ? new Date(p.last_checked).toLocaleDateString() : "never"}
                    </div>
                    {p.notes && <div className="note" style={{ marginTop: 6, fontStyle: "italic" }}>{p.notes}</div>}

                    <div style={{ marginTop: 10 }}>
                      <div className="note" style={{ fontWeight: 600 }}>Action needed</div>
                      <input className="inp" defaultValue={p.action_needed || ""} onBlur={(e) => { if (e.target.value !== (p.action_needed || "")) setActionNeeded(p.program_id, e.target.value); }} />
                    </div>

                    <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                      <select className="inp" style={{ maxWidth: 240 }} value={p.verification_status} onChange={(e) => setStatus(p.program_id, e.target.value)}>
                        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="btn sm amber" onClick={() => saveToDecisionPlan(p)}>Add to Decision Plan</button>
                      <button className="btn sm ghost" onClick={() => removeProgram(p.program_id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="stack" style={{ marginTop: 12 }}>
              {verified.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="note" style={{ fontWeight: 600 }}>✓ Verified ({verified.length})</div>
                  {verified.map((p) => renderRow(p))}
                </div>
              )}

              {scorecard.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="note" style={{ fontWeight: 600 }}>College Scorecard field-of-study matches ({scorecard.length})</div>
                  {scorecard.map((p) => renderRow(p))}
                </div>
              )}

              {review.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="row spread" style={{ alignItems: "center" }}>
                    <div className="note" style={{ fontWeight: 600 }}>Needs review - auto-discovered, not yet verified ({review.length})</div>
                    <button className="link" onClick={() => setShowNeedsReview((v) => !v)}>{showNeedsReview ? "Hide" : "Show"}</button>
                  </div>
                  {showNeedsReview && (
                    <>
                      <p className="note">Quickly triage these: if one clearly isn't a real program, click "Not relevant" to move it out of the way. Nothing here is confirmed until you open it and verify it yourself.</p>
                      {review.map((p) => renderRow(p, { withDismiss: true }))}
                    </>
                  )}
                </div>
              )}

              {dismissed.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <button className="link" onClick={() => setShowDismissed((v) => !v)}>
                    {showDismissed ? "Hide" : "Show"} dismissed / not relevant ({dismissed.length})
                  </button>
                  {showDismissed && dismissed.map((p) => renderRow(p))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="card pad">
        <button className="btn ghost" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? "Hide" : "Show"} Advanced (manual official link entry, custom domain scan)
        </button>
        {advancedOpen && (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="note">For families or students who already have a specific official link, or want to scan a
              different official domain than the one on file with College Scorecard.</p>

            <div className="grid cols-2">
              <div className="card pad">
                <h3>Add an official URL</h3>
                <p className="note">Program page, admissions page, department page, special-program page, Common Data Set, or net price calculator.</p>
                <label className="lbl">Official URL</label>
                <input className="inp" placeholder="https://..." value={urlForm.url} onChange={(e) => setUrlForm((f) => ({ ...f, url: e.target.value }))} />
                <label className="lbl" style={{ marginTop: 8 }}>Source type</label>
                <select className="inp" value={urlForm.sourceType} onChange={(e) => setUrlForm((f) => ({ ...f, sourceType: e.target.value }))}>
                  {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || !urlForm.url.trim()} onClick={addUrl}>Fetch &amp; extract</button>
              </div>

              <div className="card pad">
                <h3>Discover from an official domain (bounded)</h3>
                <p className="note">
                  Crawls ONLY the official college domain you provide -- max 40 pages, max depth 2, robots.txt-aware,
                  PDFs skipped by default, every page cached and source-linked. This is not a general web search.
                </p>
                <label className="lbl">Official domain (e.g. college.edu)</label>
                <input className="inp" placeholder="college.edu" value={domainForm.domain} onChange={(e) => setDomainForm((f) => ({ ...f, domain: e.target.value }))} />
                <label className="lbl" style={{ marginTop: 8 }}>Start URL (optional)</label>
                <input className="inp" placeholder="https://college.edu/admissions/programs" value={domainForm.startUrl} onChange={(e) => setDomainForm((f) => ({ ...f, startUrl: e.target.value }))} />
                <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || !domainForm.domain.trim()} onClick={discover}>Discover programs</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
