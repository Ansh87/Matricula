// EssayCenter.jsx -- "Essay Center" tab. Tracks essay prompts per college
// (Common App main essay, Coalition essay, UC Personal Insight Questions,
// college-specific supplements, honors/scholarship essays, major/program
// essays), offers a "Find essay prompts" discovery action (official sources
// only, never invented -- shows "Essay prompts not verified yet" when nothing
// is found), brainstorming-only Strategy by Track and Sample Structures, a
// reusable Story Bank, and an Essay Workload Planner. This module never
// writes or generates a final essay for submission -- everything here is
// planning, brainstorming, and tracking. The student must write every essay
// themselves, in their own voice, consistent with each college's AI-use policy.
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "../lib/api.js";
import { auth, firebaseConfigured } from "../lib/firebase.js";
import { SourceBadge, InlineSpinner, Spinner, SuccessNote, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

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
  if (status === "Official source verified") return "official";
  if (status === "User verified") return "verified";
  return "unavailable"; // Needs manual verification / Outdated
}

// Family-facing color cue for the PROMPT_STATUSES rollup (services/
// essayCenter.js's derivePromptStatus) -- a single badge that answers
// "is this the real, current prompt or not" at a glance.
function promptStatusLevel(status) {
  if (status === "Current-cycle verified") return "official";
  if (status === "Previous-year prompt") return "estimated";
  if (status === "User entered") return "verified";
  if (status === "Outdated / needs recheck") return "unavailable";
  return "unavailable"; // Needs manual verification / Unknown
}

function Sub({ tabs, value, onChange }) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {tabs.map(([k, l]) => (
        <button key={k} className={`btn sm ${value === k ? "primary" : "ghost"}`} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

// Unified college picker (Part B): saved colleges, Decision Plan colleges, or
// type a college name that isn't saved anywhere yet. `options` is a deduped
// list of {collegeId, collegeName}. Selecting "Type a college name..." reveals
// a text box; the resulting value is always {collegeId, collegeName} (collegeId
// null for a manually-typed name -- essay_prompts already supports a
// college_name-only row, same as every other manual-entry flow in this app).
function CollegeSelect({ options, value, onChange, placeholder }) {
  const [manualText, setManualText] = useState(value && !value.collegeId ? value.collegeName || "" : "");
  const isManual = !!value && !value.collegeId && !!value.collegeName;
  const selectValue = isManual ? "__manual__" : (value?.collegeId || "");
  return (
    <div className="stack" style={{ gap: 6 }}>
      <select className="inp" value={selectValue} onChange={(e) => {
        const v = e.target.value;
        if (v === "__manual__") { onChange({ collegeId: null, collegeName: manualText }); return; }
        if (!v) { onChange(null); return; }
        const opt = options.find((o) => o.collegeId === v);
        onChange(opt ? { collegeId: opt.collegeId, collegeName: opt.collegeName } : null);
      }}>
        <option value="">{placeholder || "Choose a college..."}</option>
        {options.map((o) => <option key={o.collegeId} value={o.collegeId}>{o.collegeName}</option>)}
        <option value="__manual__">Type a college name...</option>
      </select>
      {isManual && (
        <input className="inp" placeholder="College name" value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          onBlur={() => onChange({ collegeId: null, collegeName: manualText.trim() })} />
      )}
    </div>
  );
}

// One card in the Published Examples tab (Part K). Clearly distinguishes a
// real admitted-student essay from a college's own staff-written
// illustrative example (e.g. Illinois) -- both are official, but only one is
// an actual applicant's work.
function ExampleCard({ l }) {
  return (
    <div className="card pad">
      <div className="row spread" style={{ alignItems: "flex-start" }}>
        <h3 style={{ margin: 0 }}>{l.college}</h3>
        <SourceBadge level="official">{l.sourceType}</SourceBadge>
      </div>
      <div className="note" style={{ marginTop: 4, fontWeight: 600 }}>{l.title}</div>
      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
        <span className="pill">{l.isRealApplicantEssay ? "Official published example" : "Official example (staff-written, not a real applicant)"}</span>
      </div>
      <p className="note" style={{ marginTop: 6 }}>{l.description}</p>
      <div className="row wrap" style={{ marginTop: 10, gap: 10, alignItems: "center" }}>
        <a href={l.url} target="_blank" rel="noreferrer" className="link">Read on {l.college}'s site →</a>
        <span className="note" style={{ fontSize: 11 }}>Checked {l.lastChecked}</span>
      </div>
    </div>
  );
}

// One grouped section of the Essay Prompt Overview (Part A/B) -- shows every
// field a family needs to plan around: essay type, word/character limit,
// required/optional, prompt cycle/year, essay deadline (matched from the
// Application Timeline), source, last checked, and the single family-facing
// prompt status badge. Read-only display for most fields; edits happen from
// "Your essay prompts" below or the dedicated per-prompt Details panel --
// but "Create essay task" and "Story matches" act directly from here since
// those are one-click actions, not edits.
function OverviewGroup({ title, prompts, emptyText, onCreateTask, onShowStoryMatches, storyMatches, storyMatchesFor }) {
  return (
    <div className="card pad">
      <h3 style={{ margin: 0 }}>{title} {prompts?.length ? <span className="note">({prompts.length})</span> : null}</h3>
      {!prompts?.length ? (
        <div className="note" style={{ marginTop: 8 }}>{emptyText}</div>
      ) : (
        <div className="stack" style={{ marginTop: 8, gap: 8 }}>
          {prompts.map((p) => (
            <div key={p.prompt_id} className="card pad" style={{ background: "var(--paper-2)" }}>
              <div className="row spread wrap" style={{ gap: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {p.essay_type}{p.school_or_program ? ` - ${p.school_or_program}` : ""}{p.program_label ? ` - ${p.program_label}` : ""}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <SourceBadge level={promptStatusLevel(p.prompt_status)}>{p.prompt_status || "Unknown"}</SourceBadge>
                </div>
              </div>
              {p.prompt_text && <div className="note" style={{ marginTop: 4 }}>{p.prompt_text}</div>}
              <div className="note" style={{ marginTop: 6, fontSize: 12 }}>
                {p.prompt_cycle ? `Cycle: ${p.prompt_cycle} · ` : ""}
                {p.word_limit ? `Word limit: ${p.word_limit} · ` : p.character_limit ? `Character limit: ${p.character_limit} · ` : "Word limit: not set · "}
                Required: {p.required || "Unknown"}
                {p.application_round ? ` · Round: ${p.application_round}` : ""}
              </div>
              <div className="note" style={{ marginTop: 4, fontSize: 12 }}>
                {p.essayDeadline ? (
                  <>Essay deadline: <strong>{p.essayDeadline.eventDate}</strong>{p.essayDeadline.applicationRound ? ` (${p.essayDeadline.applicationRound})` : ""}
                    {" "}· <SourceBadge level={badgeLevelFor(p.essayDeadline.verificationStatus)}>{p.essayDeadline.verificationStatus}</SourceBadge></>
                ) : (
                  <span style={{ color: "var(--amber)" }}>{p.essayDeadlineNotice || "Essay prompt found, but application deadline still needs verification."}</span>
                )}
              </div>
              <div className="note" style={{ marginTop: 4, fontSize: 12 }}>
                Official source: {p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer">{p.source_label || p.source_url}</a> : "not set"}
                {" "}· Last checked: {p.last_checked ? new Date(p.last_checked).toLocaleDateString() : "never"}
              </div>
              {p.notes && <div className="note" style={{ marginTop: 4, fontStyle: "italic" }}>{p.notes}</div>}
              {onCreateTask && (
                <div className="row wrap" style={{ marginTop: 8, gap: 8, alignItems: "center" }}>
                  <button className="btn sm ghost" onClick={() => onCreateTask(p)}>Create essay task</button>
                  {onShowStoryMatches && <button className="btn sm ghost" onClick={() => onShowStoryMatches(p.prompt_id)}>Suggested story matches</button>}
                </div>
              )}
              {storyMatchesFor === p.prompt_id && (
                <div className="note" style={{ marginTop: 6, fontSize: 12 }}>
                  {!storyMatches?.length ? "No Story Bank entries overlap with this prompt yet -- add one in the Story Bank tab." : (
                    <>Possible fits: {storyMatches.map((m) => m.story_title).join(", ")}</>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_PROMPT_FORM = {
  collegeId: "", collegeName: "", platformId: "", programLabel: "", schoolOrProgram: "",
  essayType: "College-specific supplemental essay", promptText: "",
  wordLimit: "", characterLimit: "", required: "Unknown", applicationRound: "", deadline: "",
  promptCycle: "", cycleType: "Current cycle", relatedTrack: "", relatedActivities: "",
  notes: "", sourceUrl: "", sourceLabel: "", sourceType: "User entered", verificationStatus: "Needs manual verification",
};

const BLANK_STORY_FORM = {
  storyTitle: "", theme: "", relatedActivity: "", challenge: "", actionTaken: "", impact: "",
  whatItReveals: "", possiblePrompts: "", riskNotes: "", tracksSupported: [],
};

export function EssayCenter({ studentId, saved, collegeNames, onGo, initialTrackId, focusCollegeId }) {
  const [sub, setSub] = useState("prompts");
  const [meta, setMeta] = useState({ statuses: [], essayTypes: [], ynu: ["Yes", "No", "Unknown"], verificationStatuses: [], cycleTypes: ["Current cycle", "Previous cycle", "Unknown"], previousYearWarning: "", notVerifiedNotice: "" });
  const [workload, setWorkload] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [promptForm, setPromptForm] = useState(BLANK_PROMPT_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [findingAll, setFindingAll] = useState(false);
  const [findAllResult, setFindAllResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Essay Prompt Overview (Part B): works from saved colleges, Decision Plan
  // colleges, or a manually typed college name.
  const [decisionItems, setDecisionItems] = useState([]);
  const [overviewCollege, setOverviewCollege] = useState(null); // {collegeId, collegeName} | null
  const [overview, setOverview] = useState(null);
  const overviewRef = useRef(null);

  useEffect(() => { api.listDecisionItems(studentId).then((r) => setDecisionItems(r.items || [])).catch(() => {}); }, [studentId]);

  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(initialTrackId || "");
  const [samples, setSamples] = useState(null);
  const [exampleLinks, setExampleLinks] = useState(null);

  // Issue 1: persist selected tab, selected college (for the Prompt Overview),
  // and selected career track -- restoring overviewCollege re-triggers the
  // overview fetch effect below automatically. Never persists essay draft
  // text itself (only the college/tab/track selection), per spec.
  const essaySnapshot = { sub, overviewCollege, selectedTrackId };
  const { restoredFrom } = usePersistedSearch(studentId, "essayCenter", essaySnapshot, (r) => {
    if (!r) return;
    if (!focusCollegeId && r.sub) setSub(r.sub); // an explicit focusCollegeId jump takes priority
    if (!focusCollegeId && r.overviewCollege !== undefined) setOverviewCollege(r.overviewCollege);
    if (r.selectedTrackId !== undefined) setSelectedTrackId(r.selectedTrackId);
  });

  const [stories, setStories] = useState([]);
  const [storyForm, setStoryForm] = useState(BLANK_STORY_FORM);
  const [expandedStory, setExpandedStory] = useState(null);

  useEffect(() => {
    api.essayMeta(studentId).then(setMeta).catch(() => {});
    api.essayTrackStrategy(studentId).then((r) => setTracks(r.tracks || [])).catch(() => {});
    api.essaySampleStructures(studentId).then(setSamples).catch(() => {});
    api.essayExampleLinks(studentId).then(setExampleLinks).catch(() => {});
  }, [studentId]);

  const loadWorkload = useCallback(() => {
    api.essayWorkloadSummary(studentId).then(setWorkload).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadWorkload(); }, [loadWorkload]);

  const loadPrompts = useCallback(() => {
    api.listEssayPrompts(studentId).then((r) => setPrompts(r.prompts || [])).catch(() => {});
  }, [studentId]);

  // Coverage summary (Issue 4): a single at-a-glance card of where every
  // saved/Decision Plan college stands -- current-cycle verified prompts,
  // previous-year-only, needs verification, no prompts found yet, and
  // whether the college's application timeline is missing entirely.
  const [coverage, setCoverage] = useState(null);
  const loadCoverage = useCallback(() => {
    api.essayCoverageSummary(studentId).then(setCoverage).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadCoverage(); }, [loadCoverage]);
  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  const loadStories = useCallback(() => {
    api.listStoryBank(studentId).then((r) => setStories(r.stories || [])).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadStories(); }, [loadStories]);

  const collegeLabel = (id) => saved?.find((s) => s.college_id === id)?.college_name || collegeNames?.[id] || id;

  // Merge Saved colleges + Decision Plan colleges + any college already
  // tracked in Essay Center into one deduped list (by collegeId when known).
  const collegeOptions = useMemo(() => {
    const map = new Map();
    for (const s of saved || []) if (s.college_id) map.set(s.college_id, { collegeId: s.college_id, collegeName: s.college_name || collegeNames?.[s.college_id] || s.college_id });
    for (const it of decisionItems || []) if (it.college_id && !map.has(it.college_id)) map.set(it.college_id, { collegeId: it.college_id, collegeName: it.college_name || collegeNames?.[it.college_id] || it.college_id });
    for (const p of prompts || []) if (p.college_id && !map.has(p.college_id)) map.set(p.college_id, { collegeId: p.college_id, collegeName: p.college_name || p.college_id });
    return [...map.values()].sort((a, b) => String(a.collegeName).localeCompare(String(b.collegeName)));
  }, [saved, decisionItems, prompts, collegeNames]);

  // "Go to Essay Center" from Decision Plan (or anywhere else) pre-selects
  // the college and scrolls the Overview into view.
  useEffect(() => {
    if (!focusCollegeId) return;
    setOverviewCollege({ collegeId: focusCollegeId, collegeName: collegeLabel(focusCollegeId) });
    overviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCollegeId]);

  // Load the Essay Prompt Dashboard for the selected college -- server-side
  // grouping (current-cycle / previous-year / needs-verification), plus each
  // prompt's own matched Application Timeline deadline (Part L). Works for a
  // real collegeId (saved/Decision Plan college) or a manually-typed college
  // name with no College Scorecard match yet.
  useEffect(() => {
    if (!overviewCollege) { setOverview(null); return; }
    api.essayPromptsOverview(studentId, overviewCollege.collegeId, overviewCollege.collegeName)
      .then(setOverview).catch(() => setOverview(null));
  }, [overviewCollege, studentId, prompts]);

  // Suggested story matches (Part J) -- fetched on demand per prompt so the
  // dashboard doesn't have to score every prompt against every story up front.
  const [storyMatches, setStoryMatches] = useState([]);
  const [storyMatchesFor, setStoryMatchesFor] = useState(null);
  const showStoryMatches = async (promptId) => {
    if (storyMatchesFor === promptId) { setStoryMatchesFor(null); return; }
    setStoryMatchesFor(promptId);
    try {
      const r = await api.essayStoryMatches(studentId, promptId);
      setStoryMatches(r.matches || []);
    } catch { setStoryMatches([]); }
  };

  // "Create essay task" (Part L) -- adds this prompt to the same task list
  // Decision Plan already reads from, due-dated from the prompt's matched
  // Application Timeline deadline when known.
  const createEssayTask = async (prompt) => {
    try {
      const r = await api.createEssayTask(studentId, prompt.prompt_id);
      setMsg({ ok: true, text: `Added an essay task for ${prompt.essay_type}${r.task?.due_date ? ` -- due ${r.task.due_date}` : " (no deadline on file yet)"}.` });
    } catch (e) {
      setMsg({ ok: false, text: `Could not create the task: ${e.message}` });
    }
  };

  const [overviewFinding, setOverviewFinding] = useState(false);
  const [overviewFindResult, setOverviewFindResult] = useState(null);
  // "Find essay requirements" (Part A step 2) -- reference-first, then a
  // search of the college's own official site as the fallback; also attaches
  // Common App / UC platform prompts automatically if this college's
  // Application Pathways platform is already set to one of those.
  const runOverviewFind = async () => {
    if (!overviewCollege?.collegeId) return;
    setOverviewFinding(true); setOverviewFindResult(null);
    try {
      const r = await api.findEssayPrompts(studentId, { collegeId: overviewCollege.collegeId, collegeName: overviewCollege.collegeName });
      setOverviewFindResult(r);
      loadPrompts();
      loadWorkload();
      api.essayPromptsOverview(studentId, overviewCollege.collegeId, overviewCollege.collegeName).then(setOverview).catch(() => {});
    } catch (e) {
      setOverviewFindResult({ notice: "Essay prompts not verified yet. Check the official application portal.", error: e.message });
    } finally { setOverviewFinding(false); }
  };

  // Jump to (and pre-fill) the manual "Add a prompt" form for the college
  // currently selected in the Overview.
  const promptFormRef = useRef(null);
  const jumpToAddPromptForm = () => {
    if (!overviewCollege) return;
    setPromptForm((f) => ({ ...f, collegeId: overviewCollege.collegeId || "", collegeName: overviewCollege.collegeName || "" }));
    promptFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // "Find essay requirements for all my colleges" -- runs discovery once per
  // college across Saved Colleges + Decision Plan (not just whichever single
  // college happens to be selected above), so the archive doesn't stay
  // limited to just the one or two colleges a family remembered to check.
  const runFindAll = async () => {
    setFindingAll(true); setFindAllResult(null); setMsg(null);
    try {
      const r = await api.findEssayPromptsForAllColleges(studentId);
      setFindAllResult(r);
      loadPrompts();
      loadWorkload();
      loadCoverage();
      if (overviewCollege) api.essayPromptsOverview(studentId, overviewCollege.collegeId, overviewCollege.collegeName).then(setOverview).catch(() => {});
    } catch (e) {
      setFindAllResult({ notice: `Could not run this: ${e.message}` });
    } finally { setFindingAll(false); }
  };

  // Bulk clear -- either everything, or just one college's tracked prompts.
  // Confirmed first since this can't be undone.
  const clearPrompts = async (collegeId, label) => {
    const what = collegeId ? `all tracked prompts for ${label}` : "ALL tracked essay prompts for every college";
    if (!window.confirm(`Remove ${what}? This can't be undone.`)) return;
    try {
      const r = await api.clearEssayPrompts(studentId, collegeId || undefined);
      setMsg({ ok: true, text: `Removed ${r.deleted} prompt(s).` });
      loadPrompts();
      loadWorkload();
      loadCoverage();
      if (overviewCollege) api.essayPromptsOverview(studentId, overviewCollege.collegeId, overviewCollege.collegeName).then(setOverview).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: `Could not clear: ${e.message}` });
    }
  };

  const addPrompt = async () => {
    if (!promptForm.collegeId && !promptForm.collegeName) return;
    setBusy(true); setMsg(null);
    try {
      const collegeName = promptForm.collegeId ? collegeLabel(promptForm.collegeId) : promptForm.collegeName;
      await api.addEssayPrompt(studentId, { ...promptForm, collegeId: promptForm.collegeId || undefined, collegeName });
      setMsg({ ok: true, text: `Added a prompt for ${collegeName}. Status: Not started.` });
      setPromptForm(BLANK_PROMPT_FORM);
      loadPrompts();
      loadWorkload();
      if (overviewCollege) api.essayPromptsOverview(studentId, overviewCollege.collegeId, overviewCollege.collegeName).then(setOverview).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: `Could not add: ${e.message}` });
    } finally { setBusy(false); }
  };

  const updatePrompt = async (promptId, patch) => {
    await api.updateEssayPrompt(studentId, promptId, patch).catch(() => {});
    loadPrompts();
    loadWorkload();
  };

  const deletePrompt = async (promptId) => {
    await api.deleteEssayPrompt(studentId, promptId).catch(() => {});
    loadPrompts();
    loadWorkload();
  };

  const addStory = async () => {
    if (!storyForm.storyTitle.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await api.addStoryBankEntry(studentId, storyForm);
      setMsg({ ok: true, text: `Saved "${storyForm.storyTitle}" to your Story Bank.` });
      setStoryForm(BLANK_STORY_FORM);
      loadStories();
    } catch (e) {
      setMsg({ ok: false, text: `Could not save story: ${e.message}` });
    } finally { setBusy(false); }
  };

  const updateStory = async (storyId, patch) => {
    await api.updateStoryBankEntry(studentId, storyId, patch).catch(() => {});
    loadStories();
  };
  const deleteStory = async (storyId) => {
    await api.deleteStoryBankEntry(studentId, storyId).catch(() => {});
    loadStories();
  };

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(null);
  const exportCsv = async () => {
    if (csvBusy) return; // prevent duplicate clicks
    setCsvBusy(true); setCsvErr(null);
    try {
      const r = await fetch(api.essayExportCsvUrl(studentId), { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `essay-center-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // The family can still view everything on-screen; just tell them the download failed.
      setCsvErr(e.message || "Could not download the CSV file.");
    } finally { setCsvBusy(false); }
  };

  const byCollege = new Map();
  for (const p of prompts) {
    const key = p.college_id || p.college_name || "unknown";
    if (!byCollege.has(key)) byCollege.set(key, []);
    byCollege.get(key).push(p);
  }

  const activeTrack = tracks.find((t) => t.trackId === selectedTrackId) || null;

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Essay Center</div>
          <h1>Essay Center</h1>
          <p className="lead">
            Track every essay prompt, brainstorm by track, build a reusable story bank, and see your total essay
            workload -- all planning and tracking, never a finished essay. The student writes every essay themselves.
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
        {meta.aiUseDisclaimer || "Matricula helps with brainstorming, outlining, prompt tracking, and revision planning. The student must write the final essay in their own voice and follow each college's AI-use policy."}
        {" "}This tool never writes or generates a final essay, and never auto-submits anything.
      </div>

      {workload && workload.totalEssaysRequired > 0 && (
        <div className="card pad stack">
          <h3>Essay Workload Planner</h3>
          <div className="kpis">
            <div className="kpi"><div className="n">{workload.totalEssaysRequired}</div><div className="l">Total essays tracked</div></div>
            <div className="kpi"><div className="n">{workload.common}</div><div className="l">Common / Coalition / UC PIQ</div></div>
            <div className="kpi"><div className="n">{workload.supplemental}</div><div className="l">Supplemental</div></div>
            <div className="kpi"><div className="n">{workload.honors}</div><div className="l">Honors / scholarship</div></div>
            <div className="kpi"><div className="n">{workload.major}</div><div className="l">Major / program</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{workload.essaysNotStarted}</div><div className="l">Not started</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--amber)" }}>{workload.essaysNeedingVerification}</div><div className="l">Need verification</div></div>
          </div>
          <div className="note">Earliest essay deadline tracked: {workload.earliestDeadline || "not set yet"}</div>
          <div className="grid cols-2" style={{ marginTop: 6 }}>
            <div>
              <div className="note" style={{ fontWeight: 600 }}>By college</div>
              <ul>{(workload.groupedByCollege || []).slice(0, 8).map((g) => <li key={g.key} className="note">{g.key}: {g.count}</li>)}</ul>
            </div>
            <div>
              <div className="note" style={{ fontWeight: 600 }}>By essay type</div>
              <ul>{(workload.groupedByPlatform || []).slice(0, 8).map((g) => <li key={g.key} className="note">{g.key}: {g.count}</li>)}</ul>
            </div>
            {workload.groupedByDeadline?.length > 0 && (
              <div>
                <div className="note" style={{ fontWeight: 600 }}>By deadline</div>
                <ul>{workload.groupedByDeadline.slice(0, 8).map((g) => <li key={g.key} className="note">{g.key}: {g.count}</li>)}</ul>
              </div>
            )}
            {workload.groupedByTrack?.length > 0 && (
              <div>
                <div className="note" style={{ fontWeight: 600 }}>By track</div>
                <ul>{workload.groupedByTrack.slice(0, 8).map((g) => <li key={g.key} className="note">{g.key}: {g.count}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {coverage && coverage.totalColleges > 0 && (
        <div className="card pad">
          <h3>Coverage summary -- what's still missing</h3>
          <p className="note">Checked across your {coverage.totalColleges} saved/Decision Plan college(s). This is the fastest way to see what still needs attention before you start writing.</p>
          <div className="kpis">
            <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{coverage.currentCycleVerified.length}</div><div className="l">Current-cycle verified prompts</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--amber)" }}>{coverage.previousYearOnly.length}</div><div className="l">Previous-year prompts only</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--amber)" }}>{coverage.needsVerification.length}</div><div className="l">Needs verification</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{coverage.noPromptsYet.length}</div><div className="l">No prompts found yet</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{coverage.timelineMissing.length}</div><div className="l">Application timeline missing</div></div>
          </div>
          <div className="grid cols-2" style={{ marginTop: 8 }}>
            {[
              ["No prompts found yet", coverage.noPromptsYet],
              ["Previous-year prompts only", coverage.previousYearOnly],
              ["Needs verification", coverage.needsVerification],
              ["Application timeline missing", coverage.timelineMissing],
            ].filter(([, list]) => list.length > 0).map(([label, list]) => (
              <div key={label}>
                <div className="note" style={{ fontWeight: 600 }}>{label}</div>
                <ul>{list.slice(0, 10).map((c) => <li key={c.collegeId || c.collegeName} className="note">{c.collegeName}</li>)}</ul>
                {list.length > 10 && <div className="note">...and {list.length - 10} more</div>}
              </div>
            ))}
          </div>
          {coverage.notice && <div className="note" style={{ marginTop: 8 }}>{coverage.notice}</div>}
        </div>
      )}

      <Sub tabs={[["prompts", "Prompts & Discovery"], ["strategy", "Strategy by Track"], ["samples", "Sample Structures"], ["examples", "Published Examples"], ["stories", "Story Bank"]]} value={sub} onChange={setSub} />
      <RestoredNote restoredFrom={restoredFrom} />

      {sub === "prompts" && (
        <div className="stack">
          <div className="card pad" ref={overviewRef}>
            <h3>Essay Prompt Dashboard</h3>
            <p className="note">Pick a college from your saved list, your Decision Plan, or type a name -- see this year's prompts, saved previous-year prompts, and anything still needing verification, all in one place.</p>
            <CollegeSelect options={collegeOptions} value={overviewCollege} onChange={setOverviewCollege} placeholder="Choose a college..." />

            {overviewCollege && overview && (
              <div className="stack" style={{ marginTop: 12 }}>
                {overview.collegeName && <h3 style={{ margin: 0 }}>Essay Prompt Dashboard for {overview.collegeName}</h3>}
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn amber" disabled={!overviewCollege.collegeId || overviewFinding} onClick={runOverviewFind} title={!overviewCollege.collegeId ? "Save this college (with a College Scorecard match) to use Find essay requirements" : ""}>
                    {overviewFinding ? <><InlineSpinner />Checking...</> : "Find essay requirements"}
                  </button>
                  <button className="btn ghost" onClick={jumpToAddPromptForm}>Add a prompt manually</button>
                </div>
                {overviewFindResult && !overviewFindResult.error && (
                  <SuccessNote>
                    {overviewFindResult.method === "reference" ? (
                      <>Used a hand-verified reference for {overviewFindResult.collegeName}: {overviewFindResult.promptsAdded ?? 0} prompt(s) added, {overviewFindResult.promptsRefreshed ?? 0} refreshed.
                        {overviewFindResult.platformPromptsAttached && " Also attached this college's shared platform prompts (Common App / UC)."}</>
                    ) : (
                      <>Checked {overviewFindResult.domain || "the official college site"}: found {overviewFindResult.promptsAdded ?? 0} prompt(s).</>
                    )}
                    {overviewFindResult.notice ? ` ${overviewFindResult.notice}` : ""}
                  </SuccessNote>
                )}
                {overviewFindResult?.error && (
                  <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>
                    {overviewFindResult.notice} <span className="note">({overviewFindResult.error})</span>
                  </div>
                )}

                {overview.applicationTimeline && (
                  <div className="note">
                    Application deadline on file: <strong>{overview.applicationTimeline.eventDate}</strong>
                    {overview.applicationTimeline.applicationRound ? ` (${overview.applicationTimeline.applicationRound})` : ""}
                    {overview.applicationTimeline.cycleYear ? ` · Cycle ${overview.applicationTimeline.cycleYear}` : ""}
                    {" "}· <SourceBadge level={badgeLevelFor(overview.applicationTimeline.verificationStatus)}>{overview.applicationTimeline.verificationStatus}</SourceBadge>
                    {overview.applicationTimeline.sourceUrl && <> · <a href={overview.applicationTimeline.sourceUrl} target="_blank" rel="noreferrer">source</a></>}
                  </div>
                )}
                {overview.essayFoundButDeadlineUnverified && !overview.applicationTimeline && (
                  <div className="disclaimer">{overview.essayFoundButDeadlineUnverified}</div>
                )}
                {overview.notVerifiedNotice && (
                  <div className="disclaimer">{overview.notVerifiedNotice}</div>
                )}
                {overview.previousYearWarning && (
                  <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>{overview.previousYearWarning}</div>
                )}

                <OverviewGroup title="Current-cycle prompts" prompts={overview.current} emptyText="No current-cycle prompts tracked yet."
                  onCreateTask={createEssayTask} onShowStoryMatches={showStoryMatches} storyMatches={storyMatches} storyMatchesFor={storyMatchesFor} />
                <OverviewGroup title="Previous-year prompts (kept for planning only)" prompts={overview.previous} emptyText="No previous-year prompts saved."
                  onCreateTask={createEssayTask} onShowStoryMatches={showStoryMatches} storyMatches={storyMatches} storyMatchesFor={storyMatchesFor} />
                <OverviewGroup title="Needs verification" prompts={overview.unknown} emptyText="Nothing in this category."
                  onCreateTask={createEssayTask} onShowStoryMatches={showStoryMatches} storyMatches={storyMatches} storyMatchesFor={storyMatchesFor} />
              </div>
            )}
            {overviewCollege && !overview && <div style={{ marginTop: 10 }}><Spinner label="Loading essay prompts…" /></div>}
          </div>

          <div className="card pad" style={{ borderColor: "var(--amber)" }}>
            <h3>Find essay requirements for all my colleges</h3>
            <p className="note">
              Runs the same official-sources-only search used in the dashboard above, once for every college in your
              Saved list and Decision Plan -- so you don't have to open each college one at a time to build out your
              prompt archive. Nothing is invented; colleges where nothing is found are clearly marked "Not found," and
              anything discovered still needs the usual verification.
            </p>
            <button className="btn amber" style={{ marginTop: 8 }} disabled={findingAll} onClick={runFindAll}>
              {findingAll ? <><InlineSpinner />Checking every college... this can take a minute</> : "Find essay requirements for all my colleges"}
            </button>
            {findAllResult && findAllResult.totalColleges != null && (
              <SuccessNote>
                Checked {findAllResult.totalColleges} college(s): {findAllResult.referenceCount} from verified references,
                {" "}{findAllResult.foundCount} found by searching the official site, {findAllResult.notFoundCount} not found yet.
              </SuccessNote>
            )}
            {findAllResult && (
              <div className="disclaimer" style={{ marginTop: 12 }}>
                {findAllResult.totalColleges == null && findAllResult.notice}
                {findAllResult.results?.length > 0 && (
                  <ul style={{ marginTop: 6 }}>
                    {findAllResult.results.map((r, i) => (
                      <li key={i} className="note">
                        {r.collegeName}: {r.method === "reference" ? `reference match, ${r.promptsAdded ?? 0} added` : r.filled ? `found ${r.promptsAdded ?? 0} on official site` : "not found"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="card pad" ref={promptFormRef}>
            <h3>Add a prompt manually</h3>
            <p className="note">Some prompts only appear inside a logged-in application portal. Paste the exact wording here so it's tracked alongside everything else.</p>
            <div className="grid cols-2">
              <div>
                <label className="lbl">College *</label>
                <CollegeSelect options={collegeOptions} placeholder="Choose a college..."
                  value={promptForm.collegeId || promptForm.collegeName ? { collegeId: promptForm.collegeId || null, collegeName: promptForm.collegeName || collegeLabel(promptForm.collegeId) } : null}
                  onChange={(v) => setPromptForm((f) => ({ ...f, collegeId: v?.collegeId || "", collegeName: v?.collegeId ? "" : (v?.collegeName || "") }))} />
              </div>
              <div>
                <label className="lbl">Application platform</label>
                <select className="inp" value={promptForm.platformId} onChange={(e) => setPromptForm((f) => ({ ...f, platformId: e.target.value }))}>
                  <option value="">Not set</option>
                  <option value="common_app">Common App</option>
                  <option value="uc_application">UC Application</option>
                  <option value="coalition_scoir">Coalition/Scoir</option>
                  <option value="college_specific">College-specific portal</option>
                  <option value="other_state_system">Other state system</option>
                </select>
              </div>
              <div>
                <label className="lbl">Essay type</label>
                <select className="inp" value={promptForm.essayType} onChange={(e) => setPromptForm((f) => ({ ...f, essayType: e.target.value }))}>
                  {(meta.essayTypes.length ? meta.essayTypes : ["College-specific supplemental essay"]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">School/program within the college (optional)</label>
                <input className="inp" placeholder="e.g. Columbia Engineering" value={promptForm.schoolOrProgram} onChange={(e) => setPromptForm((f) => ({ ...f, schoolOrProgram: e.target.value }))} />
              </div>
            </div>
            <label className="lbl" style={{ marginTop: 8 }}>Prompt text (paste exactly as written on the official source)</label>
            <textarea className="inp" rows={2} value={promptForm.promptText} onChange={(e) => setPromptForm((f) => ({ ...f, promptText: e.target.value }))} />
            <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
              <button className="btn amber" disabled={busy || (!promptForm.collegeId && !promptForm.collegeName)} onClick={addPrompt}>Add this prompt</button>
              <button className="link" onClick={() => setDetailsOpen((v) => !v)}>{detailsOpen ? "Hide extra details" : "+ Add more details (optional)"}</button>
            </div>
            {detailsOpen && (
              <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
                <div className="grid cols-2">
                  <div><label className="lbl">Program / honors label</label><input className="inp" value={promptForm.programLabel} onChange={(e) => setPromptForm((f) => ({ ...f, programLabel: e.target.value }))} /></div>
                  <div><label className="lbl">Word limit</label><input className="inp" placeholder="e.g. 250 words" value={promptForm.wordLimit} onChange={(e) => setPromptForm((f) => ({ ...f, wordLimit: e.target.value }))} /></div>
                  <div><label className="lbl">Character limit (if the platform caps by character, not word)</label><input className="inp" placeholder="e.g. 1500 characters" value={promptForm.characterLimit} onChange={(e) => setPromptForm((f) => ({ ...f, characterLimit: e.target.value }))} /></div>
                  <div>
                    <label className="lbl">Required?</label>
                    <select className="inp" value={promptForm.required} onChange={(e) => setPromptForm((f) => ({ ...f, required: e.target.value }))}>
                      {meta.ynu.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Application round (ED/EA/RD/...)</label><input className="inp" placeholder="e.g. RD" value={promptForm.applicationRound} onChange={(e) => setPromptForm((f) => ({ ...f, applicationRound: e.target.value }))} /></div>
                  <div><label className="lbl">Essay deadline (if different from the application deadline)</label><input className="inp" value={promptForm.deadline} onChange={(e) => setPromptForm((f) => ({ ...f, deadline: e.target.value }))} /></div>
                  <div><label className="lbl">Prompt cycle / year</label><input className="inp" placeholder="e.g. 2026-2027" value={promptForm.promptCycle} onChange={(e) => setPromptForm((f) => ({ ...f, promptCycle: e.target.value }))} /></div>
                  <div>
                    <label className="lbl">Current or previous-year prompt?</label>
                    <select className="inp" value={promptForm.cycleType} onChange={(e) => setPromptForm((f) => ({ ...f, cycleType: e.target.value }))}>
                      {(meta.cycleTypes.length ? meta.cycleTypes : ["Unknown"]).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Related track (optional)</label>
                    <select className="inp" value={promptForm.relatedTrack} onChange={(e) => setPromptForm((f) => ({ ...f, relatedTrack: e.target.value }))}>
                      <option value="">Not set</option>
                      {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.trackName}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Related activities/projects</label><input className="inp" value={promptForm.relatedActivities} onChange={(e) => setPromptForm((f) => ({ ...f, relatedActivities: e.target.value }))} /></div>
                  <div><label className="lbl">Source URL</label><input className="inp" value={promptForm.sourceUrl} onChange={(e) => setPromptForm((f) => ({ ...f, sourceUrl: e.target.value }))} /></div>
                  <div><label className="lbl">Source label (e.g. "Screenshot from the application portal")</label><input className="inp" value={promptForm.sourceLabel} onChange={(e) => setPromptForm((f) => ({ ...f, sourceLabel: e.target.value }))} /></div>
                  <div>
                    <label className="lbl">Source type</label>
                    <select className="inp" value={promptForm.sourceType} onChange={(e) => setPromptForm((f) => ({ ...f, sourceType: e.target.value }))}>
                      {(meta.sourceTypes?.length ? meta.sourceTypes : ["User entered"]).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <label className="lbl">Notes</label>
                <input className="inp" value={promptForm.notes} onChange={(e) => setPromptForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            )}
          </div>

          {msg && <div className="disclaimer" style={!msg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>{msg.text}</div>}

          <div className="card pad">
            <div className="row spread wrap" style={{ alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Your essay prompts</h3>
              {prompts.length > 0 && (
                <button className="btn ghost sm" onClick={() => clearPrompts(null, null)}>Clear all prompts</button>
              )}
            </div>
            {!prompts.length && <div className="empty" style={{ marginTop: 10 }}>No prompts tracked yet -- use "Find essay requirements" or add one manually above.</div>}
            <div className="stack" style={{ marginTop: 10 }}>
              {[...byCollege.entries()].map(([key, rows]) => (
                <div key={key} className="stack" style={{ gap: 8 }}>
                  <div className="row spread wrap" style={{ alignItems: "center" }}>
                    <div className="note" style={{ fontWeight: 600 }}>{rows[0].college_name || key} ({rows.length})</div>
                    {rows[0].college_id && (
                      <button className="btn ghost sm" onClick={() => clearPrompts(rows[0].college_id, rows[0].college_name || key)}>Clear all for this college</button>
                    )}
                  </div>
                  {rows.map((p) => {
                    const isOpen = expanded === p.prompt_id;
                    return (
                      <div key={p.prompt_id} className="card">
                        <div className="pad row spread wrap" style={{ gap: 8 }}>
                          <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setExpanded(isOpen ? null : p.prompt_id)}>
                            <h3>{p.essay_type}{p.school_or_program ? ` - ${p.school_or_program}` : ""}{p.program_label ? ` - ${p.program_label}` : ""}</h3>
                            <div className="note">{p.prompt_text ? `${p.prompt_text.slice(0, 120)}${p.prompt_text.length > 120 ? "…" : ""}` : "No prompt text saved yet"}</div>
                          </div>
                          <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                            <span className="pill">{p.status}</span>
                            <SourceBadge level={promptStatusLevel(p.prompt_status)}>{p.prompt_status || "Unknown"}</SourceBadge>
                            <button className="btn sm ghost" onClick={() => setExpanded(isOpen ? null : p.prompt_id)}>{isOpen ? "Hide" : "Details"}</button>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                            <label className="lbl">Prompt text</label>
                            <textarea className="inp" rows={2} defaultValue={p.prompt_text || ""} onBlur={(e) => { if (e.target.value !== (p.prompt_text || "")) updatePrompt(p.prompt_id, { promptText: e.target.value }); }} />
                            <div className="grid cols-2" style={{ marginTop: 8 }}>
                              <div><label className="lbl">Word limit</label><input className="inp" defaultValue={p.word_limit || ""} onBlur={(e) => { if (e.target.value !== (p.word_limit || "")) updatePrompt(p.prompt_id, { wordLimit: e.target.value }); }} /></div>
                              <div><label className="lbl">Deadline</label><input className="inp" defaultValue={p.deadline || ""} onBlur={(e) => { if (e.target.value !== (p.deadline || "")) updatePrompt(p.prompt_id, { deadline: e.target.value }); }} /></div>
                              <div>
                                <label className="lbl">Status</label>
                                <select className="inp" value={p.status} onChange={(e) => updatePrompt(p.prompt_id, { status: e.target.value })}>
                                  {(meta.statuses.length ? meta.statuses : [p.status]).map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div><label className="lbl">Draft title</label><input className="inp" defaultValue={p.draft_title || ""} onBlur={(e) => { if (e.target.value !== (p.draft_title || "")) updatePrompt(p.prompt_id, { draftTitle: e.target.value }); }} /></div>
                              <div>
                                <label className="lbl">Related track</label>
                                <select className="inp" value={p.related_track || ""} onChange={(e) => updatePrompt(p.prompt_id, { relatedTrack: e.target.value })}>
                                  <option value="">Not set</option>
                                  {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.trackName}</option>)}
                                </select>
                              </div>
                              <div><label className="lbl">Related activities/projects</label><input className="inp" defaultValue={p.related_activities || ""} onBlur={(e) => { if (e.target.value !== (p.related_activities || "")) updatePrompt(p.prompt_id, { relatedActivities: e.target.value }); }} /></div>
                            </div>
                            <label className="lbl" style={{ marginTop: 8 }}>Student story angle (brainstorming notes, not the essay itself)</label>
                            <textarea className="inp" rows={2} defaultValue={p.student_story_angle || ""} onBlur={(e) => { if (e.target.value !== (p.student_story_angle || "")) updatePrompt(p.prompt_id, { studentStoryAngle: e.target.value }); }} />
                            <label className="lbl" style={{ marginTop: 8 }}>Outline notes</label>
                            <textarea className="inp" rows={2} defaultValue={p.outline_notes || ""} onBlur={(e) => { if (e.target.value !== (p.outline_notes || "")) updatePrompt(p.prompt_id, { outlineNotes: e.target.value }); }} />
                            <div className="row wrap" style={{ marginTop: 8, gap: 8, alignItems: "center" }}>
                              <label className="lbl" style={{ margin: 0 }}>Current or previous-year prompt?</label>
                              <select className="inp" style={{ maxWidth: 200 }} value={p.cycle_type || "Unknown"} onChange={(e) => updatePrompt(p.prompt_id, { cycleType: e.target.value })}>
                                {(meta.cycleTypes.length ? meta.cycleTypes : ["Unknown"]).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <div className="note" style={{ marginTop: 8 }}>
                              Source: {p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer">{p.source_url}</a> : "not set"} ·
                              {" "}Last checked: {p.last_checked ? new Date(p.last_checked).toLocaleDateString() : "never"}
                              {p.prompt_cycle ? ` · Cycle: ${p.prompt_cycle}` : ""}
                            </div>
                            {p.cycle_type === "Previous cycle" && (
                              <div className="disclaimer" style={{ marginTop: 8 }}>{meta.previousYearWarning || "Previous-year prompts are useful for planning but may change. Always confirm the current application cycle on the official college application portal."}</div>
                            )}
                            <label className="lbl" style={{ marginTop: 8 }}>Notes</label>
                            <input className="inp" defaultValue={p.notes || ""} onBlur={(e) => { if (e.target.value !== (p.notes || "")) updatePrompt(p.prompt_id, { notes: e.target.value }); }} />
                            <div className="row wrap" style={{ gap: 8, marginTop: 4, alignItems: "center" }}>
                              <label className="lbl" style={{ margin: 0 }}>Verify prompt:</label>
                              <select className="inp" style={{ maxWidth: 260 }} value={p.verification_status} onChange={(e) => updatePrompt(p.prompt_id, { verificationStatus: e.target.value, markLastChecked: true })}>
                                {(meta.verificationStatuses.length ? meta.verificationStatuses : [p.verification_status]).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                              <SourceBadge level={promptStatusLevel(p.prompt_status)}>{p.prompt_status || "Unknown"}</SourceBadge>
                            </div>
                            <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                              <button className="btn sm ghost" onClick={() => createEssayTask(p)}>Create essay task</button>
                              <button className="btn sm ghost" onClick={() => showStoryMatches(p.prompt_id)}>Suggested story matches</button>
                              <button className="btn sm ghost" onClick={() => deletePrompt(p.prompt_id)}>Delete</button>
                              {onGo && <button className="btn sm ghost" onClick={() => onGo("applications")}>Go to Applications →</button>}
                            </div>
                            {storyMatchesFor === p.prompt_id && (
                              <div className="note" style={{ marginTop: 6 }}>
                                {!storyMatches?.length ? "No Story Bank entries overlap with this prompt yet -- add one in the Story Bank tab." : (
                                  <>Possible fits: {storyMatches.map((m) => m.story_title).join(", ")}</>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sub === "strategy" && (
        <div className="stack">
          <div className="card pad">
            <h3>Essay Strategy by Track</h3>
            <p className="note">Brainstorming only, not final essays. Pick the track closest to your interests to see themes, evidence to draw on, and questions to reflect on.</p>
            <select className="inp" style={{ maxWidth: 420, marginTop: 8 }} value={selectedTrackId} onChange={(e) => setSelectedTrackId(e.target.value)}>
              <option value="">Choose a track...</option>
              {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.trackName}</option>)}
            </select>
          </div>
          {activeTrack && (
            <div className="card pad">
              <h3>{activeTrack.trackName}</h3>
              <div className="grid cols-2">
                <div>
                  <div className="note" style={{ fontWeight: 600 }}>Strong themes</div>
                  <ul>{activeTrack.strongThemes.map((t) => <li key={t} className="note">{t}</li>)}</ul>
                </div>
                <div>
                  <div className="note" style={{ fontWeight: 600 }}>Evidence to use</div>
                  <ul>{activeTrack.evidenceToUse.map((t) => <li key={t} className="note">{t}</li>)}</ul>
                </div>
                <div>
                  <div className="note" style={{ fontWeight: 600 }}>Activities/projects to mention</div>
                  <ul>{activeTrack.activitiesToMention.map((t) => <li key={t} className="note">{t}</li>)}</ul>
                </div>
                <div>
                  <div className="note" style={{ fontWeight: 600 }}>Risks to avoid</div>
                  <ul>{activeTrack.risksToAvoid.map((t) => <li key={t} className="note">{t}</li>)}</ul>
                </div>
              </div>
              <div className="note" style={{ fontWeight: 600, marginTop: 10 }}>Reflection questions</div>
              <ul>{activeTrack.reflectionQuestions.map((t) => <li key={t} className="note">{t}</li>)}</ul>
              <div className="note" style={{ fontWeight: 600, marginTop: 10 }}>Possible outline structure</div>
              <ol>{activeTrack.possibleOutline.map((t) => <li key={t} className="note">{t}</li>)}</ol>
            </div>
          )}
        </div>
      )}

      {sub === "samples" && samples && (
        <div className="stack">
          <div className="disclaimer">{samples.disclaimer}</div>
          <div className="card pad">
            <h3>Opening approaches</h3>
            {samples.openingApproaches.map((o) => (
              <div key={o.name} style={{ marginBottom: 12 }}>
                <div className="note" style={{ fontWeight: 600 }}>{o.name}</div>
                <div className="note">{o.description}</div>
                <div className="note" style={{ color: "var(--target, #2e7d32)", marginTop: 4 }}>Strong: “{o.strongFragment}”</div>
                <div className="note" style={{ color: "var(--reach)", marginTop: 2 }}>Weak: “{o.weakFragment}”</div>
              </div>
            ))}
          </div>
          <div className="card pad">
            <h3>Outline shapes</h3>
            <div className="grid cols-2">
              {samples.outlineShapes.map((s) => (
                <div key={s.name}>
                  <div className="note" style={{ fontWeight: 600 }}>{s.name}</div>
                  <ol>{s.steps.map((step) => <li key={step} className="note">{step}</li>)}</ol>
                </div>
              ))}
            </div>
          </div>
          <div className="grid cols-2">
            <div className="card pad">
              <h3>Revision checklist</h3>
              <ul>{samples.revisionChecklist.map((c) => <li key={c} className="note">{c}</li>)}</ul>
            </div>
            <div className="card pad">
              <h3>Authenticity checklist</h3>
              <ul>{samples.authenticityChecklist.map((c) => <li key={c} className="note">{c}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      {sub === "examples" && (
        <div className="stack">
          <div className="disclaimer" style={{ fontWeight: 600 }}>
            Official admitted-student examples are rare. Most colleges do not publish them.
          </div>
          <div className="disclaimer">{exampleLinks?.disclaimer || "Loading..."}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill">Official published example only</span>
            <span className="pill">Third-party sources not used</span>
            <span className="pill">Never AI-generated</span>
            <span className="pill">Use for structure only</span>
            <span className="pill">Do not copy</span>
          </div>

          {(() => {
            const links = exampleLinks?.links || [];
            const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            const matches = (savedName, entry) => {
              const s = norm(savedName);
              const c = norm(entry.college);
              if (s.includes(c) || c.includes(s)) return true;
              return (entry.aliases || []).some((a) => { const an = norm(a); return s.includes(an) || an.includes(s); });
            };
            const savedList = saved || [];
            const matchedEntries = new Set();
            const perSavedCollege = savedList.map((s) => {
              const name = s.college_name || collegeNames?.[s.college_id] || s.college_id;
              const entry = links.find((l) => matches(name, l));
              if (entry) matchedEntries.add(entry.url);
              return { collegeId: s.college_id, name, entry };
            });
            const otherEntries = links.filter((l) => !matchedEntries.has(l.url));

            return (
              <>
                {savedList.length > 0 && (
                  <div className="card pad">
                    <h3>Your saved colleges</h3>
                    <p className="note">Most colleges don't publish this resource at all -- this checks each of your saved colleges against the small, hand-verified list below.</p>
                    <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                      {perSavedCollege.map(({ collegeId, name, entry }) => (
                        entry ? (
                          <div key={collegeId} className="stack" style={{ gap: 4 }}>
                            <span className="pill" style={{ alignSelf: "flex-start", background: "var(--safety-bg, #e6f4ea)", color: "var(--safety, #1a7f37)" }}>Official example available -- {name}</span>
                            <ExampleCard l={entry} />
                          </div>
                        ) : (
                          <div key={collegeId} className="row spread" style={{ padding: "6px 4px" }}>
                            <span className="note">{name}</span>
                            <span className="pill" style={{ color: "var(--muted)" }}>No official published example found</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

                <div className="card pad">
                  <h3>Other colleges known to publish this</h3>
                  {!otherEntries.length ? (
                    <div className="note" style={{ marginTop: 8 }}>{links.length ? "All verified examples are already shown above for your saved colleges." : "Loading published example essay links..."}</div>
                  ) : (
                    <div className="grid cols-2" style={{ marginTop: 10 }}>
                      {otherEntries.map((l) => <ExampleCard key={l.url} l={l} />)}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {sub === "stories" && (
        <div className="stack">
          <div className="card pad">
            <h3>Add a story to your Story Bank</h3>
            <p className="note">Record your own authentic material once, then reuse it across prompts. Nothing here is generated for you.</p>
            <div className="grid cols-2">
              <div><label className="lbl">Story title *</label><input className="inp" value={storyForm.storyTitle} onChange={(e) => setStoryForm((f) => ({ ...f, storyTitle: e.target.value }))} /></div>
              <div><label className="lbl">Theme</label><input className="inp" value={storyForm.theme} onChange={(e) => setStoryForm((f) => ({ ...f, theme: e.target.value }))} /></div>
              <div><label className="lbl">Related activity/project</label><input className="inp" value={storyForm.relatedActivity} onChange={(e) => setStoryForm((f) => ({ ...f, relatedActivity: e.target.value }))} /></div>
              <div><label className="lbl">Challenge</label><input className="inp" value={storyForm.challenge} onChange={(e) => setStoryForm((f) => ({ ...f, challenge: e.target.value }))} /></div>
              <div><label className="lbl">Action taken</label><input className="inp" value={storyForm.actionTaken} onChange={(e) => setStoryForm((f) => ({ ...f, actionTaken: e.target.value }))} /></div>
              <div><label className="lbl">Impact</label><input className="inp" value={storyForm.impact} onChange={(e) => setStoryForm((f) => ({ ...f, impact: e.target.value }))} /></div>
              <div><label className="lbl">What it reveals about you</label><input className="inp" value={storyForm.whatItReveals} onChange={(e) => setStoryForm((f) => ({ ...f, whatItReveals: e.target.value }))} /></div>
              <div><label className="lbl">Possible prompts it could fit</label><input className="inp" value={storyForm.possiblePrompts} onChange={(e) => setStoryForm((f) => ({ ...f, possiblePrompts: e.target.value }))} /></div>
            </div>
            <label className="lbl" style={{ marginTop: 8 }}>Tracks it supports</label>
            <select className="inp" multiple style={{ minHeight: 70 }} value={storyForm.tracksSupported}
              onChange={(e) => setStoryForm((f) => ({ ...f, tracksSupported: Array.from(e.target.selectedOptions, (o) => o.value) }))}>
              {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.trackName}</option>)}
            </select>
            <label className="lbl" style={{ marginTop: 8 }}>Essay risk notes</label>
            <input className="inp" value={storyForm.riskNotes} onChange={(e) => setStoryForm((f) => ({ ...f, riskNotes: e.target.value }))} />
            <button className="btn amber" style={{ marginTop: 10 }} disabled={busy || !storyForm.storyTitle.trim()} onClick={addStory}>Save to Story Bank</button>
          </div>

          {msg && <div className="disclaimer" style={!msg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>{msg.text}</div>}

          <div className="card pad">
            <h3>Your Story Bank</h3>
            {!stories.length && <div className="empty" style={{ marginTop: 10 }}>No stories saved yet.</div>}
            <div className="stack" style={{ marginTop: 10 }}>
              {stories.map((s) => {
                const isOpen = expandedStory === s.story_id;
                return (
                  <div key={s.story_id} className="card">
                    <div className="pad row spread wrap" style={{ gap: 8 }}>
                      <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setExpandedStory(isOpen ? null : s.story_id)}>
                        <h3>{s.story_title}</h3>
                        <div className="note">{s.theme || "No theme set"}</div>
                      </div>
                      <button className="btn sm ghost" onClick={() => setExpandedStory(isOpen ? null : s.story_id)}>{isOpen ? "Hide" : "Details"}</button>
                    </div>
                    {isOpen && (
                      <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                        <div className="grid cols-2">
                          <div><label className="lbl">Theme</label><input className="inp" defaultValue={s.theme || ""} onBlur={(e) => { if (e.target.value !== (s.theme || "")) updateStory(s.story_id, { theme: e.target.value }); }} /></div>
                          <div><label className="lbl">Related activity/project</label><input className="inp" defaultValue={s.related_activity || ""} onBlur={(e) => { if (e.target.value !== (s.related_activity || "")) updateStory(s.story_id, { relatedActivity: e.target.value }); }} /></div>
                          <div><label className="lbl">Challenge</label><input className="inp" defaultValue={s.challenge || ""} onBlur={(e) => { if (e.target.value !== (s.challenge || "")) updateStory(s.story_id, { challenge: e.target.value }); }} /></div>
                          <div><label className="lbl">Action taken</label><input className="inp" defaultValue={s.action_taken || ""} onBlur={(e) => { if (e.target.value !== (s.action_taken || "")) updateStory(s.story_id, { actionTaken: e.target.value }); }} /></div>
                          <div><label className="lbl">Impact</label><input className="inp" defaultValue={s.impact || ""} onBlur={(e) => { if (e.target.value !== (s.impact || "")) updateStory(s.story_id, { impact: e.target.value }); }} /></div>
                          <div><label className="lbl">What it reveals</label><input className="inp" defaultValue={s.what_it_reveals || ""} onBlur={(e) => { if (e.target.value !== (s.what_it_reveals || "")) updateStory(s.story_id, { whatItReveals: e.target.value }); }} /></div>
                          <div><label className="lbl">Possible prompts</label><input className="inp" defaultValue={s.possible_prompts || ""} onBlur={(e) => { if (e.target.value !== (s.possible_prompts || "")) updateStory(s.story_id, { possiblePrompts: e.target.value }); }} /></div>
                        </div>
                        <label className="lbl" style={{ marginTop: 8 }}>Tracks it supports</label>
                        <select className="inp" multiple style={{ minHeight: 70 }} value={s.tracksSupported || []}
                          onChange={(e) => updateStory(s.story_id, { tracksSupported: Array.from(e.target.selectedOptions, (o) => o.value) })}>
                          {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.trackName}</option>)}
                        </select>
                        <label className="lbl" style={{ marginTop: 8 }}>Essay risk notes</label>
                        <input className="inp" defaultValue={s.risk_notes || ""} onBlur={(e) => { if (e.target.value !== (s.risk_notes || "")) updateStory(s.story_id, { riskNotes: e.target.value }); }} />
                        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                          <button className="btn sm ghost" onClick={() => deleteStory(s.story_id)}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
