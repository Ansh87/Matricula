// DecisionPlan.jsx -- the family's real working area: Final Application List
// Builder, Program Verification Checklist, major-specific admission risk, cost
// risk, Strategy Notes, Course/Prep Plan, Timeline & Tasks, and CSV export.
// Nothing here invents a school-specific fact -- unknowns say "Verify with
// official source," and major-risk defaults to a caution warning (never a
// guessed risk level) for historically impacted/direct-admit fields.
import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { auth, firebaseConfigured } from "../lib/firebase.js";
import { SetupPlanningButton, InlineSpinner, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";
import { useEntryOverride } from "../lib/entryOverride.js";

const CATEGORY_OPTS = ["", "Dream / Lottery", "Reach", "Target", "Safety", "Financial Safety", "In-state Anchor"];
const DECISION_OPTS = ["Keep", "Maybe", "Remove", "Need to verify", "Applied", "Accepted", "Rejected", "Waitlisted"];
const ROUND_OPTS = ["", "ED", "EA", "REA", "RD", "Rolling"];
const BASIS_OPTS = ["Unknown", "University-wide admission", "School/college-level admission", "Direct-to-major admission", "Impacted/capped major", "Internal transfer required"];
const MAJOR_RISK_OPTS = ["Unknown", "Normal", "Higher than university average", "Highly competitive"];
const COST_RISK_OPTS = ["Unknown", "Low", "Medium", "High"];
const YNU = ["Unknown", "Yes", "No"];
const TASK_TYPES = [
  ["program_verification", "Program verification"], ["common_data_set_check", "Common Data Set check"],
  ["net_price_calculator", "Net price calculator"], ["major_specific_admission_check", "Major-specific admission check"],
  ["essay_research", "Essay research"], ["visit_info_session", "Visit / info session"],
  ["recommendation_letters", "Recommendation letters"], ["application_deadline", "Application deadline"],
  ["scholarship_deadline", "Scholarship deadline"], ["portfolio_project_update", "Portfolio/project update"],
];

function Sub({ tabs, value, onChange }) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {tabs.map(([k, l]) => (
        <button key={k} className={`btn sm ${value === k ? "primary" : "ghost"}`} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function DecisionPlan({ studentId, profile, saved, collegeNames, onGo, entrySub, entryNonce }) {
  const [sub, setSub] = useState("list");
  // Plan navigation: "Visits / Interest" opens this same page, landed on the
  // Timeline & Tasks sub-tab (task type "Visit / info session" already lives
  // there) rather than a new page. Runs once per explicit subtab click --
  // never fires on a plain reload or the old "decisionPlan" route.
  useEntryOverride(entrySub, entryNonce, (wantSub) => setSub(wantSub));
  const [items, setItems] = useState([]);
  const [options, setOptions] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [checklists, setChecklists] = useState({});
  const [notesByItem, setNotesByItem] = useState({});
  const [addCollegeId, setAddCollegeId] = useState("");
  const [listFilter, setListFilter] = useState({ status: "", category: "" });

  // Issue 1: keep the selected Decision Plan sub-tab and Final List filters
  // (status/category) across navigation, refresh, and logout/login.
  const decisionPlanSnapshot = { sub, listFilter };
  const { restoredFrom: dpRestoredFrom } = usePersistedSearch(studentId, "decisionPlan", decisionPlanSnapshot, (r) => {
    if (!r) return;
    if (r.sub) setSub(r.sub);
    if (r.listFilter !== undefined) setListFilter(r.listFilter);
  });
  // Read-only cross-reference to the Applications tab's day-to-day tracker
  // (essays, recommendations, submitted status), keyed by college_id.
  const [trackerByCollege, setTrackerByCollege] = useState({});
  // Read-only cross-references to Application Pathways (platform/route/
  // deadlines) and Essay Center (prompt counts/status), keyed by college_id.
  // Fetched here, never merged into decision_plan_items -- same
  // don't-merge-two-systems pattern already used for the tracker above.
  const [pathwaysByCollege, setPathwaysByCollege] = useState({});
  const [essayByCollege, setEssayByCollege] = useState({});
  // Read-only cross-reference to Application Timeline (Part H), keyed by
  // college_id -- same don't-merge-two-systems pattern as the two above.
  const [timelineByCollege, setTimelineByCollege] = useState({});
  const loadTimelineSummary = useCallback(() => {
    api.timelineDecisionPlanSummary(studentId).then((r) => setTimelineByCollege(r.byCollege || {})).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadTimelineSummary(); }, [loadTimelineSummary]);

  const loadItems = useCallback(() => {
    api.listDecisionItems(studentId).then((r) => setItems(r.items || [])).catch(() => {});
  }, [studentId]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { api.decisionPlanOptions(studentId).then(setOptions).catch(() => {}); }, [studentId]);
  useEffect(() => {
    api.getTracker(studentId).then((r) => {
      const map = {};
      (r.tracker || []).forEach((t) => { map[t.college_id] = t; });
      setTrackerByCollege(map);
    }).catch(() => {});
  }, [studentId]);

  // Application Pathways: keep only the "main application" record per college
  // (the one with no program/honors label) for this summary -- a college may
  // have a second row for a separate honors/scholarship application.
  useEffect(() => {
    api.listRequirements(studentId).then((r) => {
      const map = {};
      for (const req of r.requirements || []) {
        if (!req.college_id) continue;
        const existing = map[req.college_id];
        if (!existing || (!req.program_label && existing.program_label)) map[req.college_id] = req;
      }
      setPathwaysByCollege(map);
    }).catch(() => {});
  }, [studentId]);

  // Essay Center (Part M): per-college essay status computed server-side by
  // services/essayCenter.js's buildDecisionPlanEssayStatus -- essay count,
  // whether current-cycle prompts are verified, whether previous-year
  // prompts are on file, how many still need verification, overall status,
  // earliest essay deadline, whether a special-program essay is required,
  // and a plain-language action-needed line. Keyed by item_id here (a
  // manually-entered college with no collegeId still gets a real row).
  useEffect(() => {
    api.decisionPlanEssayStatus(studentId).then((r) => {
      const map = {};
      for (const s of r.colleges || []) {
        map[s.itemId] = {
          total: s.essayCount, special: s.specialProgramEssaysRequired, earliestDeadline: s.earliestEssayDeadline,
          currentPromptsVerified: s.currentPromptsVerified, previousYearPromptsAvailable: s.previousYearPromptsAvailable,
          promptsNeedingVerification: s.promptsNeedingVerification, essayStatus: s.essayStatus, actionNeeded: s.actionNeeded,
        };
      }
      setEssayByCollege(map);
    }).catch(() => {});
  }, [studentId, items.length]);

  const updateItem = async (itemId, patch) => {
    const r = await api.updateDecisionItem(studentId, itemId, patch).catch(() => null);
    if (r?.item) setItems((list) => list.map((it) => (it.item_id === itemId ? r.item : it)));
    return r;
  };

  const deleteItem = async (itemId) => {
    await api.deleteDecisionItem(studentId, itemId).catch(() => {});
    setItems((list) => list.filter((it) => it.item_id !== itemId));
  };

  const [taskMsg, setTaskMsg] = useState(null);
  const createTaskFromTimeline = async (it) => {
    const tl = timelineByCollege[it.college_id];
    if (!tl?.earliestUpcomingDeadline) return;
    try {
      await api.addDecisionTask(studentId, {
        collegeId: it.college_id, collegeName: it.college_name, taskType: "application_deadline",
        dueDate: tl.earliestUpcomingDeadline.nextOccurrenceIso || null, priority: "High",
        notes: `${tl.earliestUpcomingDeadline.eventLabel || "Application deadline"} for ${it.college_name} (${tl.earliestUpcomingDeadline.date})${tl.applicationRound ? ` -- ${tl.applicationRound}` : ""}`,
      });
      setTaskMsg(`Task added for ${it.college_name}.`);
      setTimeout(() => setTaskMsg(null), 3000);
    } catch (e) {
      setTaskMsg(`Couldn't add task: ${e.message}`);
    }
  };

  // If this saved college came in through Import College List, carry its
  // provenance fields onto the Decision Plan item too, so the card can show
  // the same "Imported List" badge and original/matched names.
  const importFieldsFor = (row) => row?.import_batch_id ? {
    importBatchId: row.import_batch_id,
    originalUploadedName: row.original_uploaded_name || undefined,
    matchedOfficialName: row.matched_official_name || undefined,
    matchConfidence: row.match_confidence || undefined,
    profileScoreAtImport: row.profile_score_at_import ?? undefined,
    admissionCategoryAtImport: row.admission_category_at_import || undefined,
  } : {};

  const addFromSaved = async () => {
    if (!addCollegeId) return;
    const row = saved.find((s) => s.college_id === addCollegeId);
    if (!row) return;
    // Carry over the Reach/Target/Safety category already computed when this
    // college was matched/saved -- no reason to make the family re-classify
    // something the app already knows.
    const r = await api.addDecisionItem(studentId, {
      collegeId: row.college_id, collegeName: row.college_name || collegeNames[row.college_id] || row.college_id,
      admissionCategory: row.category || undefined,
      ...importFieldsFor(row),
    });
    if (r?.item) setItems((list) => [r.item, ...list]);
    setAddCollegeId("");
  };

  // Safer bulk-add: instead of a single "add everything" click, open a review
  // list with every available saved college pre-checked, and only add the
  // ones the family confirms. Encourages a look before the whole list lands
  // on the final Decision Plan.
  const [bulkAdding, setBulkAdding] = useState(false);
  const [reviewingBulk, setReviewingBulk] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const openBulkReview = () => {
    setBulkSelected(new Set(availableSaved.map((s) => s.college_id)));
    setReviewingBulk(true);
  };
  const toggleBulkSelected = (collegeId) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(collegeId)) next.delete(collegeId); else next.add(collegeId);
      return next;
    });
  };
  const confirmBulkAdd = async () => {
    const toAdd = availableSaved.filter((s) => bulkSelected.has(s.college_id));
    if (!toAdd.length) return;
    setBulkAdding(true);
    try {
      const added = [];
      for (const row of toAdd) {
        const r = await api.addDecisionItem(studentId, {
          collegeId: row.college_id, collegeName: row.college_name || collegeNames[row.college_id] || row.college_id,
          admissionCategory: row.category || undefined,
          ...importFieldsFor(row),
        }).catch(() => null);
        if (r?.item) added.push(r.item);
      }
      if (added.length) setItems((list) => [...added, ...list]);
    } finally {
      setBulkAdding(false);
      setReviewingBulk(false);
    }
  };

  const loadChecklist = async (itemId) => {
    const r = await api.getChecklist(studentId, itemId).catch(() => null);
    if (r?.checklist) setChecklists((m) => ({ ...m, [itemId]: r.checklist }));
  };
  const updateChecklist = async (itemId, patch) => {
    const r = await api.updateChecklist(studentId, itemId, patch).catch(() => null);
    if (r?.checklist) setChecklists((m) => ({ ...m, [itemId]: r.checklist }));
  };

  const loadNotes = async (itemId) => {
    const r = await api.getStrategyNotes(studentId, itemId).catch(() => null);
    setNotesByItem((m) => ({ ...m, [itemId]: r?.note || null }));
  };
  const generateNotes = async (itemId) => {
    const r = await api.generateStrategyNotes(studentId, itemId, profile).catch(() => null);
    if (r?.note) setNotesByItem((m) => ({ ...m, [itemId]: r.note }));
  };
  const updateNotes = async (itemId, patch) => {
    const r = await api.updateStrategyNotes(studentId, itemId, patch).catch(() => null);
    if (r?.note) setNotesByItem((m) => ({ ...m, [itemId]: r.note }));
  };

  const toggleExpand = (itemId) => {
    const next = expanded === itemId ? null : itemId;
    setExpanded(next);
    if (next && !checklists[itemId]) loadChecklist(itemId);
    if (next && notesByItem[itemId] === undefined) loadNotes(itemId);
  };

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(null);
  const exportCsv = async () => {
    if (csvBusy) return; // prevent duplicate clicks
    setCsvBusy(true); setCsvErr(null);
    try {
      const r = await fetch(`/api/decision-plan/${studentId}/export.csv`, { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `decision-plan-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // if this fails, the family can still view/edit the plan on-screen
      setCsvErr(e.message || "Could not download the CSV file.");
    } finally { setCsvBusy(false); }
  };

  const availableSaved = (saved || []).filter((s) => !items.some((it) => it.college_id === s.college_id));

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Family working area</div>
          <h1>Decision Plan</h1>
          <p className="lead">Build the real final list, verify every program, track major-specific admission risk and cost risk, and generate strategy notes -- all evidence-based, never invented.</p>
        </div>
        <div>
          <button className="btn ghost" onClick={exportCsv} disabled={csvBusy}>
            {csvBusy ? <><InlineSpinner />Saving CSV…</> : "Export CSV"}
          </button>
          {csvErr && <div className="note" style={{ color: "var(--reach)", marginTop: 4 }}>{csvErr}</div>}
        </div>
      </div>

      <div className="disclaimer">
        Match scores and categories here are estimates, not guarantees. Verify every program, deadline, and cost figure with each college's official source before finalizing a decision.
      </div>

      <SummaryPanel studentId={studentId} refreshKey={items.length} />
      <VerificationCenterPanel studentId={studentId} refreshKey={items.length} onGo={onGo} />

      <Sub tabs={[["list", "Final List"], ["course", "Course & Prep Plans"], ["tasks", "Timeline & Tasks"]]} value={sub} onChange={setSub} />
      <RestoredNote restoredFrom={dpRestoredFrom} />

      {sub === "list" && (
        <div className="stack">
          <div className="note" style={{ padding: "0 2px" }}>
            The status dropdown on each card (Keep / Maybe / Remove / Applied / etc.) is a label, not a delete
            action -- it keeps a record so you remember why a college was ruled out. To take a college off this
            list entirely, use the <strong>Delete</strong> button on its card. For day-to-day essay/recommendation/
            submission tracking, use <button className="link" onClick={() => onGo && onGo("applications")}>Applications</button> --
            this tab is for strategy: category, program verification, admission risk, and cost.
          </div>

          <div className="card pad">
            <h3>Add a saved college to the Decision Plan</h3>
            {!availableSaved.length ? (
              <div className="note">All saved colleges are already on your Decision Plan, or nothing is saved yet -- save colleges from Matches/Browse/My List first.</div>
            ) : (
              <div className="row wrap" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                <select className="inp" style={{ maxWidth: 320 }} value={addCollegeId} onChange={(e) => setAddCollegeId(e.target.value)}>
                  <option value="">Choose a saved college...</option>
                  {availableSaved.map((s) => <option key={s.college_id} value={s.college_id}>{s.college_name || collegeNames[s.college_id] || s.college_id}</option>)}
                </select>
                <button className="btn ghost" disabled={!addCollegeId} onClick={addFromSaved}>Add</button>
                {availableSaved.length > 1 && !reviewingBulk && (
                  <button className="btn ghost" onClick={openBulkReview}>
                    Review saved colleges before adding
                  </button>
                )}
              </div>
            )}
            {reviewingBulk && (
              <div className="card pad" style={{ background: "var(--paper-2)", marginTop: 10 }}>
                <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>
                  Choose which saved colleges to add to the Decision Plan
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  {availableSaved.map((s) => (
                    <label key={s.college_id} className="row" style={{ gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={bulkSelected.has(s.college_id)} onChange={() => toggleBulkSelected(s.college_id)} />
                      <span>{s.college_name || collegeNames[s.college_id] || s.college_id}</span>
                      {s.import_batch_id && <span className="pill" style={{ background: "var(--target-b)" }}>Imported List</span>}
                    </label>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn primary" disabled={bulkAdding || !bulkSelected.size} onClick={confirmBulkAdd}>
                    {bulkAdding ? "Adding…" : `Add ${bulkSelected.size} selected saved college${bulkSelected.size === 1 ? "" : "s"}`}
                  </button>
                  <button className="btn ghost" disabled={bulkAdding} onClick={() => setReviewingBulk(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {!items.length && <div className="empty">No colleges on your Decision Plan yet. Add one above, or use "Save to Decision Plan" from a Programs card.</div>}

          {items.length > 3 && (
            <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
              <select className="inp" style={{ maxWidth: 220 }} value={listFilter.status} onChange={(e) => setListFilter((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                {DECISION_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="inp" style={{ maxWidth: 220 }} value={listFilter.category} onChange={(e) => setListFilter((f) => ({ ...f, category: e.target.value }))}>
                <option value="">All categories</option>
                {CATEGORY_OPTS.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {(listFilter.status || listFilter.category) && (
                <button className="btn ghost sm" onClick={() => setListFilter({ status: "", category: "" })}>Clear filters</button>
              )}
              <span className="note">{items.filter((it) => (!listFilter.status || it.decision_status === listFilter.status) && (!listFilter.category || it.admission_category === listFilter.category)).length} of {items.length} shown</span>
            </div>
          )}

          <div className="stack">
            {items.filter((it) =>
              (!listFilter.status || it.decision_status === listFilter.status) &&
              (!listFilter.category || it.admission_category === listFilter.category)
            ).map((it) => {
              const isOpen = expanded === it.item_id;
              const caution = (options?.majorRiskWarning) && (it.major_risk === "Unknown" || !it.major_risk) &&
                /computer science|engineering|business|data science|nursing|direct.admit|impacted/i.test(`${it.program_name || ""} ${it.career_track || ""}`);
              const checklist = checklists[it.item_id];
              const note = notesByItem[it.item_id];
              const inactive = ["Remove", "Rejected"].includes(it.decision_status);
              const confirmDelete = () => {
                if (window.confirm(`Delete ${it.college_name || "this college"} from your Decision Plan? This also removes its verification checklist and strategy notes. This can't be undone.`)) {
                  deleteItem(it.item_id);
                }
              };
              return (
                <div key={it.item_id} className="card" style={inactive ? { opacity: 0.6 } : undefined}>
                  <div className="pad row spread wrap" style={{ gap: 8 }}>
                    <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => toggleExpand(it.item_id)}>
                      <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                        <h3 style={inactive ? { textDecoration: "line-through" } : undefined}>{it.college_name || it.college_id}</h3>
                        {it.import_batch_id && <span className="pill" style={{ background: "var(--target-b)" }}>Imported List</span>}
                      </div>
                      <div className="note">
                        {it.program_name || "No specific program set"} · {it.admission_category || "Category not set"} · {it.decision_status}
                        {inactive && <strong style={{ color: "var(--reach)" }}> - not moving forward</strong>}
                      </div>
                      {it.import_batch_id && (
                        <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                          Added from imported list
                          {it.original_uploaded_name && it.matched_official_name && it.original_uploaded_name.toLowerCase().trim() !== it.matched_official_name.toLowerCase().trim()
                            ? ` · Original uploaded name: ${it.original_uploaded_name}` : ""}
                          {it.match_confidence ? ` · ${it.match_confidence}` : ""}
                        </div>
                      )}
                      {trackerByCollege[it.college_id] && (
                        <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                          Applications tracker: {trackerByCollege[it.college_id].status || "Considering"}
                          {trackerByCollege[it.college_id].submitted_status ? ` · Submitted: ${trackerByCollege[it.college_id].submitted_status}` : ""}
                        </div>
                      )}
                      <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                        Application platform: {pathwaysByCollege[it.college_id]?.platform_name || "Unknown -- needs verification"}
                        {pathwaysByCollege[it.college_id]?.ea_deadline || pathwaysByCollege[it.college_id]?.rd_deadline
                          ? ` · Earliest deadline: ${pathwaysByCollege[it.college_id]?.ea_deadline || pathwaysByCollege[it.college_id]?.ed_deadline || pathwaysByCollege[it.college_id]?.rea_scea_deadline || pathwaysByCollege[it.college_id]?.priority_deadline || pathwaysByCollege[it.college_id]?.rd_deadline || pathwaysByCollege[it.college_id]?.rolling_deadline}`
                          : ""}
                        {" · Essays: "}
                        {essayByCollege[it.item_id]?.total
                          ? `${essayByCollege[it.item_id].total} tracked -- ${essayByCollege[it.item_id].essayStatus || "status unknown"}${essayByCollege[it.item_id].special ? " · special-program essay required" : ""}`
                          : "none tracked yet"}
                      </div>
                      {essayByCollege[it.item_id]?.total > 0 && (
                        <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                          {essayByCollege[it.item_id].currentPromptsVerified ? "Current-cycle prompts verified" : "Current-cycle prompts not yet verified"}
                          {essayByCollege[it.item_id].previousYearPromptsAvailable ? " · previous-year prompts on file" : ""}
                          {essayByCollege[it.item_id].promptsNeedingVerification > 0 ? ` · ${essayByCollege[it.item_id].promptsNeedingVerification} need verification` : ""}
                          {essayByCollege[it.item_id].earliestDeadline ? ` · Earliest essay deadline: ${essayByCollege[it.item_id].earliestDeadline}` : ""}
                          {essayByCollege[it.item_id].actionNeeded && <strong style={{ color: "var(--amber)" }}> · {essayByCollege[it.item_id].actionNeeded}</strong>}
                        </div>
                      )}
                      {it.primary_major && (
                        <div className="note" style={{ fontSize: 11 }}>
                          <span className="pill" style={{ background: "var(--target-b)" }}>Double Major</span>{" "}
                          Primary: {it.primary_major} · Second major / minor: {it.secondary_major || "-"}
                          {" · "}Status: {it.double_major_status || "Needs official verification"}
                          {it.double_major_verification_status && !["Official source verified", "User verified"].includes(it.double_major_verification_status) && (
                            <strong style={{ color: "var(--amber)" }}> · Verify double-major rules</strong>
                          )}
                        </div>
                      )}
                      <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                        Application timeline: {timelineByCollege[it.college_id]?.timelineStatus || "Not started"}
                        {timelineByCollege[it.college_id]?.earliestUpcomingDeadline
                          ? ` · Earliest upcoming: ${timelineByCollege[it.college_id].earliestUpcomingDeadline.eventLabel} ${timelineByCollege[it.college_id].earliestUpcomingDeadline.date}${timelineByCollege[it.college_id].applicationRound ? ` (${timelineByCollege[it.college_id].applicationRound})` : ""}`
                          : ""}
                        {timelineByCollege[it.college_id]?.hasConflicts && <strong style={{ color: "var(--reach)" }}> · Conflicting dates -- verify</strong>}
                        {timelineByCollege[it.college_id]?.deadlinesNeedingVerification > 0 && ` · ${timelineByCollege[it.college_id].deadlinesNeedingVerification} deadline(s) need verification`}
                        {timelineByCollege[it.college_id]?.missingEventTypes?.length > 0 && ` · Missing: ${timelineByCollege[it.college_id].missingEventTypes.join(", ")}`}
                      </div>
                      {it.college_id && (
                        <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                          <SetupPlanningButton studentId={studentId} collegeId={it.college_id} collegeName={it.college_name} />
                        </div>
                      )}
                    </div>
                    <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                      <select className="inp" style={{ width: 170 }} onClick={(e) => e.stopPropagation()} value={it.decision_status} onChange={(e) => updateItem(it.item_id, { decisionStatus: e.target.value })}>
                        {DECISION_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); confirmDelete(); }}>Delete</button>
                    </div>
                  </div>

                  {caution && <div className="note" style={{ padding: "0 20px 10px", color: "#7a5313" }}>⚠ {options.majorRiskWarning}</div>}

                  {isOpen && (
                    <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                        <div>
                          <label className="lbl">Admission category</label>
                          <select className="inp" value={it.admission_category || ""} onChange={(e) => updateItem(it.item_id, { admissionCategory: e.target.value })}>
                            {CATEGORY_OPTS.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Application round</label>
                          <select className="inp" value={it.application_round || ""} onChange={(e) => updateItem(it.item_id, { applicationRound: e.target.value })}>
                            {ROUND_OPTS.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Admission basis</label>
                          <select className="inp" value={it.admission_basis || "Unknown"} onChange={(e) => updateItem(it.item_id, { admissionBasis: e.target.value })}>
                            {BASIS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Major-specific risk</label>
                          <select className="inp" value={it.major_risk || "Unknown"} onChange={(e) => updateItem(it.item_id, { majorRisk: e.target.value })}>
                            {MAJOR_RISK_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Cost risk</label>
                          <select className="inp" value={it.cost_risk || "Unknown"} onChange={(e) => updateItem(it.item_id, { costRisk: e.target.value })}>
                            {COST_RISK_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Career track</label>
                          <input className="inp" value={it.career_track || ""} onChange={(e) => updateItem(it.item_id, { careerTrack: e.target.value })} />
                        </div>
                      </div>

                      <h3 style={{ marginTop: 16 }}>Cost &amp; financial reality</h3>
                      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                        <div><label className="lbl">Sticker price</label><input className="inp" type="number" value={it.sticker_price ?? ""} onChange={(e) => updateItem(it.item_id, { stickerPrice: e.target.value ? Number(e.target.value) : null })} /></div>
                        <div><label className="lbl">Average net price</label><input className="inp" type="number" value={it.average_net_price ?? ""} onChange={(e) => updateItem(it.item_id, { averageNetPrice: e.target.value ? Number(e.target.value) : null })} /></div>
                        <div><label className="lbl">Estimated family cost</label><input className="inp" type="number" value={it.estimated_family_cost ?? ""} onChange={(e) => updateItem(it.item_id, { estimatedFamilyCost: e.target.value ? Number(e.target.value) : null })} /></div>
                        <div><label className="lbl">Net price calculator URL</label><input className="inp" value={it.net_price_calculator_url || ""} onChange={(e) => updateItem(it.item_id, { netPriceCalculatorUrl: e.target.value })} /></div>
                        <div>
                          <label className="lbl">NPC completed?</label>
                          <select className="inp" value={it.npc_completed ? "yes" : "no"} onChange={(e) => updateItem(it.item_id, { npcCompleted: e.target.value === "yes" })}>
                            <option value="no">No</option><option value="yes">Yes</option>
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Financial safety?</label>
                          <select className="inp" value={it.financial_safety ? "yes" : "no"} onChange={(e) => updateItem(it.item_id, { financialSafety: e.target.value === "yes" })}>
                            <option value="no">No</option><option value="yes">Yes</option>
                          </select>
                        </div>
                      </div>

                      <h3 style={{ marginTop: 16 }}>Program verification checklist</h3>
                      {!checklist ? <div className="note">Loading...</div> : (
                        <div>
                          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                            {[
                              ["officialProgramPageChecked", "official_program_page_checked", "Official program page checked", "bool"],
                              ["exactMajorExists", "exact_major_exists", "Exact major exists", "ynu"],
                              ["minorConcentrationExists", "minor_concentration_exists", "Minor/concentration exists", "ynu"],
                              ["specialProgramExists", "special_program_exists", "Special program exists", "ynu"],
                              ["honorsResearchOptionExists", "honors_research_option_exists", "Honors/research option exists", "ynu"],
                              ["ugResearchLabAvailable", "ug_research_lab_available", "Undergrad research/lab available", "ynu"],
                              ["directAdmissionChecked", "direct_admission_checked", "Direct admission checked", "bool"],
                              ["internalTransferRulesChecked", "internal_transfer_rules_checked", "Internal transfer rules checked", "bool"],
                              ["programRestrictionsChecked", "program_restrictions_checked", "Program restrictions checked", "bool"],
                              ["deadlineChecked", "deadline_checked", "Deadline checked", "bool"],
                            ].map(([camel, snake, label, kind]) => (
                              <div key={snake}>
                                <label className="lbl">{label}</label>
                                {kind === "bool" ? (
                                  <select className="inp" value={checklist[snake] ? "yes" : "no"} onChange={(e) => updateChecklist(it.item_id, { [camel]: e.target.value === "yes" })}>
                                    <option value="no">No</option><option value="yes">Yes</option>
                                  </select>
                                ) : (
                                  <select className="inp" value={checklist[snake] || "Unknown"} onChange={(e) => updateChecklist(it.item_id, { [camel]: e.target.value })}>
                                    {YNU.map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="grid cols-2" style={{ marginTop: 10 }}>
                            <div><label className="lbl">Source URL</label><input className="inp" value={checklist.source_url || ""} onChange={(e) => updateChecklist(it.item_id, { sourceUrl: e.target.value })} /></div>
                            <div><label className="lbl">Last checked date</label><input className="inp" type="date" value={checklist.last_checked_date || ""} onChange={(e) => updateChecklist(it.item_id, { lastCheckedDate: e.target.value })} /></div>
                          </div>
                          <label className="lbl" style={{ marginTop: 10 }}>Notes</label>
                          <textarea className="inp" rows={2} value={checklist.notes || ""} onChange={(e) => updateChecklist(it.item_id, { notes: e.target.value })} />
                        </div>
                      )}

                      <h3 style={{ marginTop: 16 }}>Strategy notes</h3>
                      <p className="note" style={{ marginTop: -4, marginBottom: 8 }}>
                        Why this college, essay angle, and risks -- specific to {it.college_name || "this college"}. For
                        whole-list balance (Reach/Target/Safety ratio, best ED pick), see{" "}
                        <button className="link" onClick={() => onGo && onGo("strategy")}>Strategy</button>.
                      </p>
                      <div className="row" style={{ marginBottom: 8 }}>
                        <button className="btn sm ghost" onClick={() => generateNotes(it.item_id)}>{note ? "Regenerate" : "Generate"} from profile &amp; evidence</button>
                      </div>
                      {note && (
                        <div className="grid cols-2">
                          {[
                            ["whyCollege", "why_college", "Why this college"], ["whyProgram", "why_program", "Why this program"],
                            ["bestRound", "best_round", "Best application round"], ["essayAngle", "essay_angle", "Essay/story angle"],
                            ["activitiesToEmphasize", "activities_to_emphasize", "Activities to emphasize"], ["risks", "risks", "Risks"],
                            ["actionsBeforeApplying", "actions_before_applying", "Actions before applying"], ["questionsForAdmissions", "questions_for_admissions", "Questions for admissions"],
                          ].map(([camel, snake, label]) => (
                            <div key={snake}>
                              <label className="lbl">{label}</label>
                              <textarea className="inp" rows={2} value={note[snake] || ""} onChange={(e) => updateNotes(it.item_id, { [camel]: e.target.value })} />
                            </div>
                          ))}
                        </div>
                      )}

                      <label className="lbl" style={{ marginTop: 16 }}>Action needed</label>
                      <input className="inp" value={it.action_needed || ""} onChange={(e) => updateItem(it.item_id, { actionNeeded: e.target.value })} />
                      <label className="lbl" style={{ marginTop: 10 }}>Notes</label>
                      <textarea className="inp" rows={2} value={it.notes || ""} onChange={(e) => updateItem(it.item_id, { notes: e.target.value })} />

                      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                        <button className="btn sm ghost" onClick={confirmDelete}>Delete this college from Decision Plan</button>
                        <button className="btn sm ghost" onClick={() => onGo && onGo("applications")}>Track application progress in Applications →</button>
                        <button className="btn sm ghost" onClick={() => onGo && onGo("applicationPathways", it.college_id)}>Set platform &amp; deadlines in Application Pathways →</button>
                        <button className="btn sm ghost" onClick={() => onGo && onGo("applicationPathways", it.college_id)}>View timeline →</button>
                        <button className="btn sm ghost" disabled={!timelineByCollege[it.college_id]?.earliestUpcomingDeadline} onClick={() => createTaskFromTimeline(it)}>Create task from timeline</button>
                        <button className="btn sm ghost" onClick={() => onGo && onGo("essays", it.college_id)}>Track essays in Essay Center →</button>
                      </div>
                      {taskMsg && <div className="note" style={{ marginTop: 6, color: "var(--safety)" }}>{taskMsg}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sub === "course" && <CoursePlans studentId={studentId} profile={profile} />}
      {sub === "tasks" && <Tasks studentId={studentId} items={items} />}
    </div>
  );
}

// Family Command Center summary -- a top-of-page status panel aggregating
// what the family has already entered/verified elsewhere in the app. Read-
// only; invents nothing new. Backed by GET /api/decision-plan/:id/summary.
function SummaryPanel({ studentId, refreshKey }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.decisionPlanSummary(studentId).then(setSummary).catch(() => setSummary(null));
  }, [studentId, refreshKey]);

  if (!summary || !summary.totalColleges) return null;

  return (
    <div className="card pad stack">
      <h3>Family Command Center</h3>
      <div className="kpis">
        <div className="kpi"><div className="n">{summary.totalColleges}</div><div className="l">Colleges on list</div></div>
        <div className="kpi"><div className="n">{summary.byDecisionStatus?.Keep || 0}</div><div className="l">Keep</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{summary.needsVerification}</div><div className="l">Need verification</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{summary.highOrUnknownMajorRisk}</div><div className="l">Major risk unresolved</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--amber)" }}>{summary.unresolvedCostRisk}</div><div className="l">Cost risk unresolved</div></div>
        <div className="kpi"><div className="n" style={{ color: summary.tasks.overdue ? "var(--reach)" : "var(--ink-900)" }}>{summary.tasks.overdue}</div><div className="l">Tasks overdue</div></div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="note" style={{ fontWeight: 600 }}>By category:</span>
        {Object.entries(summary.byAdmissionCategory || {}).filter(([, n]) => n > 0).map(([k, n]) => (
          <span key={k} className="pill">{k}: {n}</span>
        ))}
      </div>
      {summary.balanceNotice && <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>{summary.balanceNotice}</div>}
      {summary.tasks.dueSoon > 0 && (
        <div className="note">{summary.tasks.dueSoon} task(s) due in the next 14 days.</div>
      )}

      {summary.finalListHealth && (
        <div className="stack" style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border, #e5e5e5)" }}>
          <div className="row spread" style={{ alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Final List Health Check</h3>
            <span className="pill" style={{ background: summary.finalListHealth.overallStatus === "Strong balanced list" ? "var(--safety-bg, #e6f4ea)" : "var(--amber-bg, #fff4e5)", color: summary.finalListHealth.overallStatus === "Strong balanced list" ? "var(--safety, #1a7f37)" : "var(--amber, #b45309)" }}>
              {summary.finalListHealth.overallStatus}
            </span>
          </div>
          <div className="kpis">
            <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{summary.reachTargetSafety?.reach || 0}</div><div className="l">Reach</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{summary.reachTargetSafety?.target || 0}</div><div className="l">Target</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{summary.reachTargetSafety?.safety || 0}</div><div className="l">Safety</div></div>
            <div className="kpi"><div className="n">{summary.byAdmissionCategory?.["Financial Safety"] || 0}</div><div className="l">Financial Safety</div></div>
            <div className="kpi"><div className="n">{summary.byAdmissionCategory?.["In-state Anchor"] || 0}</div><div className="l">In-state Anchor</div></div>
            <div className="kpi"><div className="n">{summary.totalEssaysTracked ?? 0}</div><div className="l">Total essays tracked</div></div>
            <div className="kpi"><div className="n">{summary.earliestUpcomingDeadline || "not set"}</div><div className="l">Earliest deadline on file</div></div>
            <div className="kpi"><div className="n" style={{ color: summary.essayCoverageMissing ? "var(--amber)" : "var(--ink-900)" }}>{summary.essayCoverageMissing || 0}</div><div className="l">Colleges missing essays</div></div>
            <div className="kpi"><div className="n" style={{ color: summary.timelineMissing ? "var(--amber)" : "var(--ink-900)" }}>{summary.timelineMissing || 0}</div><div className="l">Colleges missing timeline</div></div>
          </div>
          <ul>
            {summary.finalListHealth.messages.map((m, i) => <li key={i} className="note">{m}</li>)}
          </ul>
          {summary.finalListHealth.disclaimer && <div className="disclaimer">{summary.finalListHealth.disclaimer}</div>}
        </div>
      )}
    </div>
  );
}

// Verification Center (Feature 1) -- one cross-college list of everything
// still unresolved, pulled from data already tracked elsewhere in the app.
// Read-only; every item links back to the page where it can actually be
// resolved. Backed by GET /api/decision-plan/:id/verification-center.
const RELATED_PAGE_TAB = { essays: "essays", timeline: "applicationPathways", pathways: "applicationPathways", programs: "programs", list: "saved" };
const RELATED_PAGE_LABEL = { essays: "Open Essay Center", timeline: "Open Application Timeline", pathways: "Open Application Pathways", programs: "Open Programs & Opportunities", list: "Open My List", "decision-plan": null };
const PRIORITY_COLOR = { High: "var(--reach)", Medium: "var(--amber)", Low: "var(--muted)" };

function VerificationCenterPanel({ studentId, refreshKey, onGo }) {
  const [data, setData] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Issue 1: keep the priority filter and expand/collapse state.
  const { restoredFrom: vcRestoredFrom } = usePersistedSearch(studentId, "verificationCenter", { priorityFilter, expanded }, (r) => {
    if (!r) return;
    if (r.priorityFilter !== undefined) setPriorityFilter(r.priorityFilter);
    if (r.expanded !== undefined) setExpanded(r.expanded);
  });

  useEffect(() => {
    api.verificationCenter(studentId).then(setData).catch(() => setData(null));
  }, [studentId, refreshKey]);

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(null);
  const exportCsv = async () => {
    if (csvBusy) return; // prevent duplicate clicks
    setCsvBusy(true); setCsvErr(null);
    try {
      const r = await fetch(api.verificationCenterExportCsvUrl(studentId), { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `verification-center-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // if this fails, the family can still view the list on-screen
      setCsvErr(e.message || "Could not download the CSV file.");
    } finally { setCsvBusy(false); }
  };

  if (!data || !data.totalColleges) return null;

  const visibleItems = (priorityFilter ? data.items.filter((it) => it.priority === priorityFilter) : data.items);
  const shown = expanded ? visibleItems : visibleItems.slice(0, 8);

  return (
    <div className="card pad stack">
      <div className="row spread" style={{ alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Verification Center</h3>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="note">{data.totalItems} open item(s) across {data.totalColleges} college(s)</span>
          {data.totalItems > 0 && (
            <button className="btn ghost sm" onClick={exportCsv} disabled={csvBusy}>
              {csvBusy ? <><InlineSpinner />Saving CSV…</> : "Export CSV"}
            </button>
          )}
          {csvErr && <span className="note" style={{ color: "var(--reach)" }}>{csvErr}</span>}
        </div>
      </div>
      <p className="note">Everything below still needs a source checked, a conflict resolved, or a family decision made -- nothing here is hidden or assumed.</p>
      <RestoredNote restoredFrom={vcRestoredFrom} />
      <div className="row wrap" style={{ gap: 6 }}>
        {["High", "Medium", "Low"].map((p) => (
          <button key={p} className={`btn sm ${priorityFilter === p ? "primary" : "ghost"}`} onClick={() => setPriorityFilter(priorityFilter === p ? "" : p)}>
            {p}: {data.byPriority?.[p] || 0}
          </button>
        ))}
      </div>
      {!data.totalItems ? (
        <div className="note" style={{ color: "var(--safety)" }}>Nothing outstanding right now -- every tracked item has a source or is marked verified.</div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {shown.map((it, i) => (
            <div key={i} className="row spread" style={{ padding: "8px 4px", borderBottom: "1px solid var(--border, #eee)", alignItems: "flex-start" }}>
              <div className="stack" style={{ gap: 2 }}>
                <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{it.college}</span>
                  {it.programOrTrack && <span className="note">({it.programOrTrack})</span>}
                  <span className="pill" style={{ color: PRIORITY_COLOR[it.priority] }}>{it.priority}</span>
                  <span className="pill">{it.status}</span>
                </div>
                <div className="note">{it.issueType}</div>
                <div className="note">{it.actionNeeded}</div>
                {it.sourceUrl && <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12 }}>source</a>}
              </div>
              {RELATED_PAGE_LABEL[it.relatedPage] && (
                <button className="btn sm ghost" onClick={() => onGo && onGo(RELATED_PAGE_TAB[it.relatedPage], it.collegeId)}>
                  {RELATED_PAGE_LABEL[it.relatedPage]} →
                </button>
              )}
            </div>
          ))}
          {visibleItems.length > 8 && (
            <button className="btn sm ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : `Show all ${visibleItems.length}`}
            </button>
          )}
        </div>
      )}
      {data.notice && <div className="note" style={{ marginTop: 4 }}>{data.notice}</div>}
    </div>
  );
}

async function authHeader() {
  try {
    if (firebaseConfigured && auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* dev bypass / no firebase configured */ }
  return {};
}

function CoursePlans({ studentId, profile }) {
  const [plans, setPlans] = useState([]);
  const [trackId, setTrackId] = useState(profile?.preferredScenarioId || "");

  useEffect(() => { api.listCoursePlans(studentId).then((r) => setPlans(r.plans || [])).catch(() => {}); }, [studentId]);

  const plan = plans.find((p) => p.track_id === trackId) || null;

  return (
    <div className="stack">
      <div className="card pad">
        <h3>Course &amp; Preparation Plan</h3>
        <p className="note">General, evidence-based prep guidance per Career Track -- not a claim about what any specific college requires.</p>
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

function Tasks({ studentId, items }) {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ collegeId: "", taskType: "program_verification", dueDate: "", priority: "Medium", notes: "" });

  const load = useCallback(() => { api.listDecisionTasks(studentId).then((r) => setTasks(r.tasks || [])).catch(() => {}); }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const exportTasksCsv = async () => {
    try {
      const r = await fetch(api.decisionPlanTasksExportUrl(studentId), { headers: await authHeader() });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `decision-plan-tasks-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* if this fails, the family can still view tasks on-screen */ }
  };

  const addTask = async () => {
    const item = items.find((i) => i.college_id === form.collegeId);
    await api.addDecisionTask(studentId, {
      collegeId: form.collegeId || null, collegeName: item?.college_name || null, taskType: form.taskType,
      dueDate: form.dueDate || null, priority: form.priority, notes: form.notes || null,
    }).catch(() => {});
    setForm((f) => ({ ...f, dueDate: "", notes: "" }));
    load();
  };

  const update = async (taskId, patch) => {
    const r = await api.updateDecisionTask(studentId, taskId, patch).catch(() => null);
    if (r) setTasks((list) => list.map((t) => (t.task_id === taskId ? r : t)));
  };
  const remove = async (taskId) => {
    await api.deleteDecisionTask(studentId, taskId).catch(() => {});
    setTasks((list) => list.filter((t) => t.task_id !== taskId));
  };

  return (
    <div className="stack">
      <div className="card pad">
        <h3>Add a task</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
          <div>
            <label className="lbl">College</label>
            <select className="inp" value={form.collegeId} onChange={(e) => setForm((f) => ({ ...f, collegeId: e.target.value }))}>
              <option value="">(none)</option>
              {items.map((it) => <option key={it.item_id} value={it.college_id}>{it.college_name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Task type</label>
            <select className="inp" value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value }))}>
              {TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="lbl">Due date</label><input className="inp" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></div>
          <div>
            <label className="lbl">Priority</label>
            <select className="inp" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
        </div>
        <label className="lbl" style={{ marginTop: 8 }}>Notes</label>
        <input className="inp" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={addTask}>Add task</button>
      </div>

      <div className="row spread">
        <h3 style={{ margin: 0 }}>Tasks</h3>
        <button className="btn ghost sm" onClick={exportTasksCsv}>Export CSV</button>
      </div>
      {!tasks.length && <div className="empty">No tasks yet.</div>}
      <div className="stack">
        {tasks.map((t) => (
          <div key={t.task_id} className="card pad row spread wrap">
            <div>
              <h3>{TASK_TYPES.find((x) => x[0] === t.task_type)?.[1] || t.task_type}</h3>
              <div className="note">{t.college_name || "General"} · Due {t.due_date || "no date"} · Priority {t.priority}</div>
              {t.notes && <div className="note">{t.notes}</div>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <select className="inp" value={t.status} onChange={(e) => update(t.task_id, { status: e.target.value })}>
                <option>To do</option><option>In progress</option><option>Done</option>
              </select>
              <button className="btn sm ghost" onClick={() => remove(t.task_id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
