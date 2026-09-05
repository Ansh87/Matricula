// ApplicationPathways.jsx -- "Application Pathways" tab. Tracks, per saved
// college, which application platform it uses (Common App, Coalition/Scoir,
// UC Application, Cal State Apply, ApplyTexas, applySUNY, CUNY Application,
// QuestBridge, college-specific, other state/system, or Unknown), every
// deadline type, and the extra requirements (honors/scholarship/program apps,
// portfolio, interview, recommendations, transcript, test policy, fee). The
// Application Route Planner groups the family's saved colleges by platform so
// they can see real workload ("these 5 all go through Common App"); the
// Region view gives informational-only likely-route guidance by region --
// never a claim about a specific college. Nothing here is invented: every
// record defaults to "Needs manual verification" until confirmed against an
// official source.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import { auth, firebaseConfigured } from "../lib/firebase.js";
import { SourceBadge, InlineSpinner, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";
import { useEntryOverride } from "../lib/entryOverride.js";

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
  if (status === "Outdated / needs recheck") return "unavailable";
  return "unavailable"; // Needs manual verification / Unknown
}

// Plain-language "what to do about this row" text, derived only from
// verification status -- never a claim about the date itself.
function timelineActionNeeded(status) {
  if (status === "Official source verified" || status === "User verified") return "Looks confirmed -- recheck closer to the deadline.";
  if (status === "Outdated / needs recheck") return "Revisit the source and confirm this date is still current.";
  return "Confirm this date on the official application portal.";
}

const DEADLINE_FIELDS = [
  ["eaDeadline", "ea_deadline", "EA deadline"],
  ["edDeadline", "ed_deadline", "ED deadline"],
  ["reaSceaDeadline", "rea_scea_deadline", "REA / SCEA deadline"],
  ["priorityDeadline", "priority_deadline", "Priority deadline"],
  ["rdDeadline", "rd_deadline", "RD deadline"],
  ["rollingDeadline", "rolling_deadline", "Rolling admission?"],
];

// Maps an Application Timeline event's application_round to the matching
// deadline field on a college_application_requirements row -- lets "Your
// application records" pull real dates the family already got from
// Auto-fill/Verify deadlines instead of showing a second, disconnected blank
// deadline section for the same college. Cross-links the two tables (reads
// timeline data into the requirements form/list); never merges them into one
// table, same pattern as every other Decision Plan / Timeline integration.
const ROUND_TO_DEADLINE_FIELD = {
  EA: "eaDeadline", ED: "edDeadline", "REA/SCEA": "reaSceaDeadline",
  Priority: "priorityDeadline", RD: "rdDeadline", Rolling: "rollingDeadline",
};

// Fallback copy of the server's DEADLINE_EVENT_TYPES (services/
// applicationTimeline.js), used only for the brief window before /meta has
// loaded -- the server-provided list (timelineMeta.deadlineEventTypes) is
// always preferred once available, so these two lists should never actually
// drift in a way that matters.
const DEADLINE_EVENT_TYPES_FALLBACK = [
  "Early Decision deadline", "Early Action deadline", "REA / SCEA deadline",
  "Priority deadline", "Regular Decision deadline", "Rolling admission opens",
  "Rolling admission priority date",
];

const YNU_FIELDS = [
  ["honorsAppRequired", "honors_app_required", "Honors application required?"],
  ["scholarshipAppRequired", "scholarship_app_required", "Scholarship application required?"],
  ["programSpecificAppRequired", "program_specific_app_required", "Program-specific application required?"],
  ["portfolioRequired", "portfolio_required", "Portfolio required?"],
  ["interviewRequired", "interview_required", "Interview required?"],
  ["recommendationsRequired", "recommendations_required", "Recommendations required?"],
  ["transcriptRequired", "transcript_required", "Transcript required?"],
];

const BLANK_FORM = {
  collegeId: "", programLabel: "", platformId: "", applicationUrl: "", applicationOpensDate: "",
  eaDeadline: "", edDeadline: "", reaSceaDeadline: "", priorityDeadline: "", rdDeadline: "", rollingDeadline: "",
  honorsAppRequired: "Unknown", scholarshipAppRequired: "Unknown", programSpecificAppRequired: "Unknown",
  portfolioRequired: "Unknown", interviewRequired: "Unknown", recommendationsRequired: "Unknown", transcriptRequired: "Unknown",
  testPolicy: "", applicationFee: "", feeWaiverAvailable: "Unknown", verificationStatus: "Needs manual verification",
  sourceUrl: "", notes: "",
};

const BLANK_TIMELINE_FORM = {
  collegeId: "", applicationRound: "", eventType: "Regular Decision deadline", eventLabel: "",
  eventDate: "", cycleYear: "", sourceUrl: "", verificationStatus: "Needs manual verification", notes: "",
};

export function ApplicationPathways({ studentId, saved, collegeNames, onGo, focusCollegeId, focusSection, focusSectionNonce }) {
  const [platforms, setPlatforms] = useState([]);
  const [verificationStatuses, setVerificationStatuses] = useState([]);
  const [ynu, setYnu] = useState(["Yes", "No", "Unknown"]);
  const [routePlanner, setRoutePlanner] = useState(null);
  const [regionSummary, setRegionSummary] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [showPlatformRef, setShowPlatformRef] = useState(false);
  const [showRegion, setShowRegion] = useState(true);
  const [form, setForm] = useState(BLANK_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(null);
  const [msg, setMsg] = useState(null);
  // Name-pattern suggestion for whichever college is picked in the add form
  // (e.g. selecting a "University of California, X" campus suggests the UC
  // Application) -- always shown as a suggestion to review, never applied
  // automatically, and the verification status still defaults to "Needs
  // manual verification" even when accepted.
  const [suggestion, setSuggestion] = useState(null);
  const addFormRef = useRef(null);

  // Jump straight to the "Add an application record" form with a college
  // pre-selected -- used by the "Set platform" buttons in the Route Planner
  // so there's an obvious, direct answer to "where do I actually set this?"
  // instead of expecting the family to scroll down and find the dropdown.
  // Pre-selects the college in the Add-record form, scrolls to it, AND
  // immediately does the real timeline pull for that college (verified
  // reference data first, live official-site search as the fallback) so the
  // Deadline fields arrive already filled in -- the family reviews and clicks
  // "Add this application record" instead of typing dates in by hand.
  // Applies a reference profile's application-detail fields (test policy,
  // fee, fee waiver, honors/scholarship/portfolio/interview/recommendations/
  // transcript required) to the Add-record form -- only for fields still at
  // their blank/"Unknown" default, so nothing the family already typed gets
  // overwritten. Mirrors useTimelineDatesInForm's guard against a stale
  // college selection.
  const applyRequirementDetailsToForm = (collegeId, requirements) => {
    if (!requirements) return;
    setForm((f) => {
      if (f.collegeId !== collegeId) return f;
      const patch = { ...f };
      for (const [camel, val] of Object.entries(requirements)) {
        if (val === undefined || val === null) continue;
        const cur = patch[camel];
        if (cur && cur !== "Unknown") continue;
        patch[camel] = val;
      }
      return patch;
    });
  };

  const jumpToAddForm = (collegeId, collegeNameArg) => {
    const collegeName = collegeNameArg || saved?.find((s) => s.college_id === collegeId)?.college_name || collegeNames?.[collegeId] || collegeId;
    setForm((f) => ({ ...f, collegeId }));
    addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!collegeId) return;
    api.autofillTimelineEvents(studentId, { collegeId, collegeName })
      .then((r) => { if (r?.requirements) applyRequirementDetailsToForm(collegeId, r.requirements); })
      .catch(() => {})
      .finally(() => {
        loadTimelineDeadlineSummary();
        loadTimeline();
        useTimelineDatesInForm(collegeId);
      });
  };

  useEffect(() => {
    api.pathwaysPlatforms(studentId).then((r) => {
      setPlatforms(r.platforms || []);
      setVerificationStatuses(r.verificationStatuses || []);
      setYnu(r.ynu || ["Yes", "No", "Unknown"]);
    }).catch(() => {});
  }, [studentId]);

  const loadPlanner = useCallback(() => {
    api.routePlanner(studentId).then(setRoutePlanner).catch(() => {});
    api.regionSummary(studentId).then(setRegionSummary).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadPlanner(); }, [loadPlanner]);

  const loadRequirements = useCallback(() => {
    api.listRequirements(studentId).then((r) => setRequirements(r.requirements || [])).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadRequirements(); }, [loadRequirements]);

  const platformName = (id) => platforms.find((p) => p.platform_id === id)?.platform_name || "";
  const platformUrl = (id) => platforms.find((p) => p.platform_id === id)?.official_url || "";

  // Runs automatically right after a college gets an application record (or
  // has its platform set) -- the same real pull as the Application Timeline's
  // "Auto-fill official dates" button, just triggered without the family
  // having to remember a separate step. Silent on failure (the family can
  // always still use the Timeline section's own buttons directly); refreshes
  // the cross-reference summary either way so "Your application records" and
  // this form stay in sync with whatever the Timeline knows.
  // requirementId is optional -- when given (an application record already
  // exists for this college), the same call also auto-fills that record's
  // application-detail fields (test policy, fee, fee waiver, honors/
  // scholarship/portfolio/interview/recommendations/transcript required)
  // from the same reference profile, still only touching fields still at
  // "Unknown"/blank.
  const triggerTimelineAutofillFor = (collegeId, collegeName, requirementId) => {
    if (!collegeId || !collegeName) return;
    api.autofillTimelineEvents(studentId, { collegeId, collegeName })
      .catch(() => {})
      .finally(() => {
        loadTimelineDeadlineSummary();
        loadTimeline();
        if (requirementId) {
          api.autofillRequirementDetails(studentId, requirementId).catch(() => {}).finally(loadRequirements);
        }
      });
  };

  // Look up the suggestion whenever the selected college changes, and
  // pre-fill the platform dropdown with it (still fully editable).
  useEffect(() => {
    if (!form.collegeId) { setSuggestion(null); return; }
    const row = saved?.find((s) => s.college_id === form.collegeId);
    const name = row?.college_name || collegeNames?.[form.collegeId] || "";
    if (!name) { setSuggestion(null); return; }
    api.platformSuggestion(studentId, name, row?.state).then((r) => {
      setSuggestion(r.suggestion || null);
      if (r.suggestion) {
        setForm((f) => {
          if (f.collegeId !== form.collegeId || f.platformId) return f;
          const url = platforms.find((p) => p.platform_id === r.suggestion.platformId)?.official_url || "";
          return { ...f, platformId: r.suggestion.platformId, applicationUrl: f.applicationUrl || url };
        });
      }
    }).catch(() => setSuggestion(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.collegeId, studentId]);

  // One-click apply from the Route Planner's "Unknown" group -- adds a
  // minimal record with just the suggested platform set, still defaulting
  // to "Needs manual verification" so it's clear this still needs confirming.
  const applySuggestionQuick = async (collegeId, collegeName, platformId) => {
    setBusy(true); setMsg(null);
    try {
      const created = await api.addRequirement(studentId, {
        collegeId, collegeName, platformId, platformName: platformName(platformId),
        applicationUrl: platformUrl(platformId) || undefined,
      });
      loadRequirements();
      loadPlanner();
      triggerTimelineAutofillFor(collegeId, collegeName, created?.requirement_id); // set the platform -> also pull real timeline dates + detail fields for this college
    } catch (e) {
      setMsg({ ok: false, text: `Could not apply suggestion: ${e.message}` });
    } finally { setBusy(false); }
  };

  const addRequirement = async () => {
    if (!form.collegeId) return;
    setBusy(true); setMsg(null);
    try {
      const collegeName = saved?.find((s) => s.college_id === form.collegeId)?.college_name || collegeNames?.[form.collegeId] || form.collegeId;
      const created = await api.addRequirement(studentId, {
        ...form,
        collegeName,
        platformName: form.platformId ? platformName(form.platformId) : undefined,
      });
      setMsg({ ok: true, text: `Added an application record for ${collegeName}. Marked "${form.verificationStatus}" -- keep it current as you confirm details. Pulling real application-timeline dates for ${collegeName} now...` });
      setForm(BLANK_FORM);
      loadRequirements();
      loadPlanner();
      triggerTimelineAutofillFor(form.collegeId, collegeName, created?.requirement_id); // adding the record -> also pull real timeline dates + detail fields for this college
    } catch (e) {
      setMsg({ ok: false, text: `Could not add: ${e.message}` });
    } finally { setBusy(false); }
  };

  const updateRequirement = async (reqId, patch) => {
    await api.updateRequirement(studentId, reqId, patch).catch(() => {});
    loadRequirements();
    loadPlanner();
  };

  const deleteRequirement = async (reqId) => {
    await api.deleteRequirement(studentId, reqId).catch(() => {});
    loadRequirements();
    loadPlanner();
  };

  // ---------------- Cross-link: Application Timeline -> Application Records ----------------
  // A per-college summary (earliest deadline/round/status) so "Your
  // application records" and the "Add a record" form can show what the
  // Application Timeline already knows, instead of looking disconnected from
  // dates the family just auto-filled or verified there.
  const [timelineDeadlineSummary, setTimelineDeadlineSummary] = useState({});
  const [fillFromTimelineMsg, setFillFromTimelineMsg] = useState(null);
  const loadTimelineDeadlineSummary = useCallback(() => {
    api.timelineDecisionPlanSummary(studentId).then((r) => setTimelineDeadlineSummary(r.byCollege || {})).catch(() => {});
  }, [studentId]);
  useEffect(() => { loadTimelineDeadlineSummary(); }, [loadTimelineDeadlineSummary]);

  // Pulls every Application Timeline event for one college and maps ED/EA/
  // REA/Priority/RD/Rolling rounds onto the matching deadline field. Only
  // fills fields that are still blank -- never overwrites a date the family
  // already entered or edited by hand.
  const fillDeadlinesFromTimeline = async (reqId, collegeId, existingRow) => {
    if (!collegeId) return;
    setFillFromTimelineMsg(null);
    try {
      const r = await api.listTimelineEvents(studentId, collegeId);
      // Only actual "you must act by this date" deadline events -- excludes
      // notification dates, enrollment deposits, financial aid dates, etc.,
      // which can share the same application_round (e.g. Columbia's "RD
      // deadline" and "RD notification" are both round "RD") and would
      // otherwise silently land in the wrong field. Also only events for the
      // same program (or no program) as this record, so a Drama/Music-only
      // deadline never fills the main application's field.
      const deadlineTypes = timelineMeta.deadlineEventTypes.length ? timelineMeta.deadlineEventTypes : DEADLINE_EVENT_TYPES_FALLBACK;
      const events = (r.events || []).filter((ev) =>
        deadlineTypes.includes(ev.event_type) && (ev.program_label || null) === (existingRow.program_label || null)
      );
      const patch = {};
      const filledLabels = [];
      for (const ev of events) {
        const field = ROUND_TO_DEADLINE_FIELD[ev.application_round];
        if (!field) continue;
        const snake = DEADLINE_FIELDS.find(([camel]) => camel === field)?.[1];
        if (!snake || existingRow[snake] || patch[field]) continue; // never overwrite an existing date
        patch[field] = ev.event_date;
        filledLabels.push(`${ev.application_round}: ${ev.event_date}`);
      }
      if (!Object.keys(patch).length) {
        setFillFromTimelineMsg({ ok: false, text: "Nothing to fill -- either the Application Timeline has no matching dates yet for this college, or every deadline field here is already set." });
        return;
      }
      await updateRequirement(reqId, patch);
      setFillFromTimelineMsg({ ok: true, text: `Filled from the Application Timeline: ${filledLabels.join(", ")}. Still shows "Needs manual verification" until you confirm it.` });
    } catch (e) {
      setFillFromTimelineMsg({ ok: false, text: `Could not pull from the Application Timeline: ${e.message}` });
    }
  };

  // Same idea for the "Add an application record" form, before it's even
  // saved -- pre-fills blank deadline fields in the form itself from
  // whatever the Application Timeline already has for the given college.
  // Takes an explicit collegeId (rather than always reading form.collegeId)
  // so callers like jumpToAddForm can use it right after selecting a college,
  // without waiting on React's async state update to land first.
  const useTimelineDatesInForm = async (collegeIdArg) => {
    const collegeId = collegeIdArg || form.collegeId;
    if (!collegeId) return;
    try {
      const r = await api.listTimelineEvents(studentId, collegeId);
      const deadlineTypes = timelineMeta.deadlineEventTypes.length ? timelineMeta.deadlineEventTypes : DEADLINE_EVENT_TYPES_FALLBACK;
      setForm((f) => {
        if (f.collegeId !== collegeId) return f; // user picked a different college meanwhile
        // Only real deadline-type events (not notifications/deposits/etc, which
        // can share the same application_round), and only for this record's
        // program (or no program), so a program-specific date never leaks into
        // the main application's field.
        const events = (r.events || []).filter((ev) =>
          deadlineTypes.includes(ev.event_type) && (ev.program_label || null) === (f.programLabel || null)
        );
        const patch = { ...f };
        for (const ev of events) {
          const field = ROUND_TO_DEADLINE_FIELD[ev.application_round];
          if (field && !patch[field]) patch[field] = ev.event_date;
        }
        return patch;
      });
    } catch { /* leave the form as-is if this fails */ }
  };

  // ---------------- Application Timeline ----------------
  const [timelineMeta, setTimelineMeta] = useState({ eventTypes: [], applicationRounds: [], verificationStatuses: [], deadlineEventTypes: [] });
  const [timelineCollegeId, setTimelineCollegeId] = useState("");
  const [timelineSummary, setTimelineSummary] = useState(null);
  const [timelineForm, setTimelineForm] = useState(BLANK_TIMELINE_FORM);
  const [timelineDetailsOpen, setTimelineDetailsOpen] = useState(false);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineFinding, setTimelineFinding] = useState(false);
  const [timelineMsg, setTimelineMsg] = useState(null);
  const [timelineFindResult, setTimelineFindResult] = useState(null);
  const [timelineAutofillPreview, setTimelineAutofillPreview] = useState(null);
  const [timelineAutofilling, setTimelineAutofilling] = useState(false);
  const [timelineCsvBusy, setTimelineCsvBusy] = useState(false);
  const [timelineCsvErr, setTimelineCsvErr] = useState(null);
  const [timelineAutofillResult, setTimelineAutofillResult] = useState(null);
  const [populateAllBusy, setPopulateAllBusy] = useState(false);
  const [populateAllResult, setPopulateAllResult] = useState(null);
  const timelineSectionRef = useRef(null);

  // Issue 1: persist the selected Application Timeline college and the two
  // reference-panel toggles (Application Pathways + Application Timeline
  // share this one page). Restoring timelineCollegeId re-triggers the
  // summary fetch effect below automatically.
  const pathwaysSnapshot = { timelineCollegeId, showPlatformRef, showRegion };
  const { restoredFrom: pathwaysRestoredFrom } = usePersistedSearch(studentId, "applicationPathways", pathwaysSnapshot, (r) => {
    if (!r) return;
    if (!focusCollegeId && r.timelineCollegeId !== undefined) setTimelineCollegeId(r.timelineCollegeId);
    if (r.showPlatformRef !== undefined) setShowPlatformRef(r.showPlatformRef);
    if (r.showRegion !== undefined) setShowRegion(r.showRegion);
  });

  useEffect(() => { api.timelineMeta(studentId).then(setTimelineMeta).catch(() => {}); }, [studentId]);

  // "View timeline →" from Decision Plan (or any other tab) pre-selects the
  // college and scrolls the Application Timeline section into view.
  useEffect(() => {
    if (!focusCollegeId) return;
    setTimelineCollegeId(focusCollegeId);
    timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusCollegeId]);

  // Apply -> Timeline subtab: same page as Application Pathways (Timeline is
  // a section here, not a separate page) -- just scroll straight to it.
  useEntryOverride(focusSection === "timeline", focusSectionNonce, () => {
    timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const loadTimeline = useCallback(() => {
    loadTimelineDeadlineSummary(); // keep "Your application records" / the add-record form's cross-reference current too
    if (!timelineCollegeId) { setTimelineSummary(null); return; }
    api.timelineCollegeSummary(studentId, timelineCollegeId).then(setTimelineSummary).catch(() => setTimelineSummary(null));
  }, [studentId, timelineCollegeId, loadTimelineDeadlineSummary]);
  useEffect(() => { loadTimeline(); }, [loadTimeline]);
  useEffect(() => {
    setTimelineForm((f) => ({ ...BLANK_TIMELINE_FORM, collegeId: timelineCollegeId }));
    setTimelineFindResult(null);
    setTimelineAutofillResult(null);
  }, [timelineCollegeId]);

  const timelineCollegeName = (id) => saved?.find((s) => s.college_id === id)?.college_name || collegeNames?.[id] || id;

  // Checks whether the selected college matches one of the hand-verified
  // reference profiles (same name-pattern technique as the platform
  // suggestion) so the "Auto-fill official dates" button only appears when
  // there's actually something real to offer -- never a dead click.
  useEffect(() => {
    if (!timelineCollegeId) { setTimelineAutofillPreview(null); return; }
    const name = timelineCollegeName(timelineCollegeId);
    api.timelineAutofillPreview(studentId, name).then((r) => setTimelineAutofillPreview(r?.available ? r : null)).catch(() => setTimelineAutofillPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineCollegeId, studentId]);

  const runPopulateAll = async () => {
    setPopulateAllBusy(true); setPopulateAllResult(null); setTimelineMsg(null);
    try {
      const r = await api.populateAllTimelines(studentId);
      setPopulateAllResult(r);
      loadTimeline();
    } catch (e) {
      setPopulateAllResult({ error: e.message });
    } finally { setPopulateAllBusy(false); }
  };

  const runTimelineAutofill = async () => {
    if (!timelineCollegeId) return;
    setTimelineAutofilling(true); setTimelineAutofillResult(null); setTimelineMsg(null);
    try {
      const r = await api.autofillTimelineEvents(studentId, { collegeId: timelineCollegeId, collegeName: timelineCollegeName(timelineCollegeId) });
      setTimelineAutofillResult(r);
      loadTimeline();
    } catch (e) {
      setTimelineAutofillResult({ filled: false, reason: e.message });
    } finally { setTimelineAutofilling(false); }
  };

  const addTimelineEventManual = async () => {
    if (!timelineForm.collegeId || !timelineForm.eventType) return;
    setTimelineBusy(true); setTimelineMsg(null);
    try {
      const collegeName = timelineCollegeName(timelineForm.collegeId);
      await api.addTimelineEvent(studentId, { ...timelineForm, collegeName });
      setTimelineMsg({ ok: true, text: `Added "${timelineForm.eventType}" for ${collegeName}.` });
      setTimelineForm((f) => ({ ...BLANK_TIMELINE_FORM, collegeId: f.collegeId }));
      loadTimeline();
    } catch (e) {
      setTimelineMsg({ ok: false, text: `Could not add: ${e.message}` });
    } finally { setTimelineBusy(false); }
  };

  const updateTimelineEventRow = async (eventId, patch) => {
    await api.updateTimelineEvent(studentId, eventId, patch).catch(() => {});
    loadTimeline();
  };
  const deleteTimelineEventRow = async (eventId) => {
    await api.deleteTimelineEvent(studentId, eventId).catch(() => {});
    loadTimeline();
  };

  const runTimelineFind = async () => {
    if (!timelineCollegeId) return;
    setTimelineFinding(true); setTimelineFindResult(null); setTimelineMsg(null);
    try {
      const r = await api.findTimelineEvents(studentId, { collegeId: timelineCollegeId, collegeName: timelineCollegeName(timelineCollegeId) });
      setTimelineFindResult(r);
      loadTimeline();
    } catch (e) {
      setTimelineFindResult({ notice: "Deadlines not verified yet. Check the official application portal.", error: e.message });
    } finally { setTimelineFinding(false); }
  };

  const timelineExportCsv = async () => {
    if (timelineCsvBusy) return; // prevent duplicate clicks
    setTimelineCsvBusy(true); setTimelineCsvErr(null);
    try {
      const r = await fetch(api.timelineExportCsvUrl(studentId), { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `application-timeline-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // The family can still view everything on-screen; just tell them the download failed.
      setTimelineCsvErr(e.message || "Could not download the CSV file.");
    } finally { setTimelineCsvBusy(false); }
  };

  const exportCsv = async () => {
    if (csvBusy) return; // prevent duplicate clicks
    setCsvBusy(true); setCsvErr(null);
    try {
      const r = await fetch(api.pathwaysExportCsvUrl(studentId), { headers: await authHeader() });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `application-pathways-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCsvErr(e.message || "Could not download the CSV file.");
    } finally { setCsvBusy(false); }
  };

  const byCollege = new Map();
  for (const r of requirements) {
    const key = r.college_id || r.college_name || "unknown";
    if (!byCollege.has(key)) byCollege.set(key, []);
    byCollege.get(key).push(r);
  }

  return (
    <div className="stack apply-page">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Application Pathways</div>
          <h1>Application Pathways</h1>
          <p className="lead">
            Track which application platform each college on your list actually uses, every deadline type, and what
            extra applications (honors, scholarship, program-specific) each one requires -- so nothing gets missed.
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
        Platform and deadline information here is only as good as what you've verified. A record stays "Needs manual
        verification" until you (or an official source) confirm it -- always check the college's own application
        portal before treating a deadline or requirement as final.
      </div>

      <div className="card pad" ref={timelineSectionRef}>
        <div className="row spread wrap" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Application Timeline</h3>
            <p className="note" style={{ marginTop: 4 }}>
              Every deadline and milestone for one college -- application opens, Early Decision / Early Action / Regular
              Decision deadlines, scholarship and honors deadlines, financial aid (CSS Profile / FAFSA) deadlines,
              decision notification, and enrollment deposit. Pick a college, then verify deadlines or add one yourself.
            </p>
          </div>
          {timelineCollegeId && (
            <div>
              <button className="btn ghost sm" onClick={timelineExportCsv} disabled={timelineCsvBusy}>
                {timelineCsvBusy ? <><InlineSpinner />Saving CSV…</> : "Export timeline CSV"}
              </button>
              {timelineCsvErr && <div className="note" style={{ color: "var(--reach)", marginTop: 4 }}>{timelineCsvErr}</div>}
            </div>
          )}
        </div>

        <div className="row wrap" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
          <button className="btn primary sm" disabled={populateAllBusy || !(saved || []).length} onClick={runPopulateAll}>
            {populateAllBusy ? "Checking every saved college... this can take a minute or two" : "Populate timelines for all my saved colleges"}
          </button>
          <span className="note">
            Auto-fills from verified reference data where available; searches each college's own official site for the rest. Never invents a date --
            colleges it can't confidently find are reported as "not found" so you know what still needs a manual look.
          </span>
        </div>
        {populateAllResult && !populateAllResult.error && (
          <div className="card" style={{ marginTop: 8, padding: 10 }}>
            <div className="note">
              {populateAllResult.autofilledCount} auto-filled from verified data, {populateAllResult.crawledCount} found by searching official sites,{" "}
              {populateAllResult.notFoundCount} not found (of {populateAllResult.totalColleges} saved colleges). {populateAllResult.notice}
            </div>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead><tr><th style={{ textAlign: "left" }}>College</th><th style={{ textAlign: "left" }}>Method</th><th style={{ textAlign: "left" }}>Events added</th><th style={{ textAlign: "left" }}>Notice</th></tr></thead>
                <tbody>
                  {populateAllResult.results.map((r) => (
                    <tr key={r.collegeId || r.collegeName}>
                      <td>
                        <button className="link" onClick={() => setTimelineCollegeId(r.collegeId)}>{r.collegeName}</button>
                      </td>
                      <td>{r.method}{r.confidence && r.confidence !== "verified" ? " (confirm)" : ""}</td>
                      <td>{r.eventsAdded}</td>
                      <td className="note" style={{ fontSize: 12 }}>{r.notice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {populateAllResult?.error && <div className="disclaimer">Could not check all colleges: {populateAllResult.error}</div>}

        <select className="inp" style={{ maxWidth: 360, marginTop: 10 }} value={timelineCollegeId} onChange={(e) => setTimelineCollegeId(e.target.value)}>
          <option value="">Choose a saved college...</option>
          {(saved || []).map((s) => <option key={s.college_id} value={s.college_id}>{s.college_name || collegeNames?.[s.college_id] || s.college_id}</option>)}
        </select>
        <RestoredNote restoredFrom={pathwaysRestoredFrom} />

        {!timelineCollegeId ? (
          <div className="empty" style={{ marginTop: 10 }}>Choose a college above to see or build its application timeline.</div>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
              <button className="btn primary" disabled={timelineAutofilling} onClick={runTimelineAutofill}>
                {timelineAutofilling ? "Getting real dates..." : "Auto-fill official dates"}
              </button>
              <button className="btn amber" disabled={timelineFinding} onClick={runTimelineFind}>
                {timelineFinding ? "Checking official pages..." : "Verify deadlines"}
              </button>
              {timelineSummary && <span className="pill">{timelineSummary.timelineStatus}</span>}
              {timelineSummary?.missingEventTypes?.length > 0 && (
                <span className="note">Not yet tracked: {timelineSummary.missingEventTypes.join(", ")}</span>
              )}
            </div>
            {timelineAutofillPreview && !timelineAutofillResult && (
              <div className="note">
                Known application-plan dates are available for {timelineAutofillPreview.collegeName}, last checked {timelineAutofillPreview.lastChecked}
                {timelineAutofillPreview.sourceUrl ? <> (<a href={timelineAutofillPreview.sourceUrl} target="_blank" rel="noreferrer">source</a>)</> : ""}.
                Click "Auto-fill official dates" to add them as a starting point -- you can edit or remove any of them.
              </div>
            )}
            {!timelineAutofillPreview && !timelineAutofillResult && timelineCollegeId && (
              <div className="note">
                No pre-checked reference dates for this college yet -- "Auto-fill official dates" will search its own official site live and add whatever it can confidently find.
              </div>
            )}
            {timelineAutofillResult && (
              <div className="disclaimer" style={!timelineAutofillResult.filled ? {} : timelineAutofillResult.method === "site_search" || timelineAutofillResult.confidence !== "verified" ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>
                {timelineAutofillResult.method === "reference" ? (
                  <>Added {timelineAutofillResult.eventsAdded} date(s){timelineAutofillResult.eventsRefreshed ? ` and refreshed ${timelineAutofillResult.eventsRefreshed} existing one(s)` : ""} for {timelineAutofillResult.collegeName}, sourced from {timelineAutofillResult.sourceUrl}. {timelineAutofillResult.notice}</>
                ) : timelineAutofillResult.filled ? (
                  <>No pre-checked reference data for this college, so I searched its official site live ({timelineAutofillResult.domain || "official site"}): checked {timelineAutofillResult.pagesChecked ?? 0} page(s), found {timelineAutofillResult.eventsAdded} date(s). {timelineAutofillResult.notice}</>
                ) : (
                  <>{timelineAutofillResult.notice}</>
                )}
              </div>
            )}
            {timelineFindResult && (
              <div className="disclaimer">
                {timelineFindResult.skipped ? timelineFindResult.reason : (
                  <>Checked {timelineFindResult.domain || "the official site"}: looked at {timelineFindResult.pagesFetched ?? 0} page(s), found {timelineFindResult.eventsFound ?? 0} date(s).</>
                )}
                {" "}{timelineFindResult.notice}
              </div>
            )}

            {timelineSummary?.conflicts?.length > 0 && timelineSummary.conflicts.map((c) => (
              <div key={c.key} className="disclaimer" style={{ borderLeftColor: "var(--reach)", background: "#f7ece8" }}>
                <strong>{c.notice}</strong> {c.eventType}{c.applicationRound ? ` (${c.applicationRound})` : ""}:{" "}
                {c.events.map((e, i) => (
                  <span key={e.eventId}>
                    {i > 0 ? " vs. " : ""}
                    <strong>{e.eventDate || "no date"}</strong>{e.sourceUrl ? <> (<a href={e.sourceUrl} target="_blank" rel="noreferrer">source</a>)</> : ""}
                  </span>
                ))}
              </div>
            ))}

            <div className="card timeline-table-wrap">
              <table className="timeline-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line-2)" }}>
                    <th style={{ padding: 8 }}>Date</th>
                    <th style={{ padding: 8 }}>Event</th>
                    <th style={{ padding: 8 }}>Round</th>
                    <th style={{ padding: 8 }}>Source</th>
                    <th style={{ padding: 8 }}>Verification status</th>
                    <th style={{ padding: 8 }}>Action needed</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {!timelineSummary?.events?.length && (
                    <tr><td colSpan={7} style={{ padding: 12 }} className="note">No timeline events yet -- use "Verify deadlines" or add one manually below.</td></tr>
                  )}
                  {timelineSummary?.events?.map((ev) => (
                    <tr key={ev.event_id} style={{ borderBottom: "1px solid var(--line-2)" }}>
                      <td style={{ padding: 8 }} data-label="Date">{ev.event_date || "-"}</td>
                      <td style={{ padding: 8 }} data-label="Event">{ev.event_label || ev.event_type}</td>
                      <td style={{ padding: 8 }} data-label="Round">{ev.application_round || "-"}</td>
                      <td style={{ padding: 8 }} data-label="Source">{ev.source_url ? <a href={ev.source_url} target="_blank" rel="noreferrer">source</a> : "not set"}</td>
                      <td style={{ padding: 8 }} data-label="Verification status">
                        <select className="inp" style={{ minWidth: 190 }} value={ev.verification_status} onChange={(e) => updateTimelineEventRow(ev.event_id, { verificationStatus: e.target.value, markLastChecked: true })}>
                          {(timelineMeta.verificationStatuses.length ? timelineMeta.verificationStatuses : [ev.verification_status]).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 8 }} className="note" data-label="Action needed">{timelineActionNeeded(ev.verification_status)}</td>
                      <td style={{ padding: 8 }} className="no-label"><button className="btn sm ghost" onClick={() => deleteTimelineEventRow(ev.event_id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card pad" style={{ borderColor: "var(--amber)" }}>
              <h3>Add timeline event manually</h3>
              <div className="grid cols-2">
                <div>
                  <label className="lbl">Event type *</label>
                  <select className="inp" value={timelineForm.eventType} onChange={(e) => setTimelineForm((f) => ({ ...f, eventType: e.target.value }))}>
                    {(timelineMeta.eventTypes.length ? timelineMeta.eventTypes : [timelineForm.eventType]).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Round</label>
                  <select className="inp" value={timelineForm.applicationRound} onChange={(e) => setTimelineForm((f) => ({ ...f, applicationRound: e.target.value }))}>
                    <option value="">Not set</option>
                    {timelineMeta.applicationRounds.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Date</label>
                  <input className="inp" placeholder="e.g. November 2 or Rolling" value={timelineForm.eventDate} onChange={(e) => setTimelineForm((f) => ({ ...f, eventDate: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Cycle / year</label>
                  <input className="inp" placeholder="e.g. 2026-2027" value={timelineForm.cycleYear} onChange={(e) => setTimelineForm((f) => ({ ...f, cycleYear: e.target.value }))} />
                </div>
              </div>
              <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
                <button className="btn amber" disabled={timelineBusy || !timelineForm.collegeId || !timelineForm.eventType} onClick={addTimelineEventManual}>Add this event</button>
                <button className="link" onClick={() => setTimelineDetailsOpen((v) => !v)}>{timelineDetailsOpen ? "Hide extra details" : "+ Add more details (optional)"}</button>
              </div>
              {timelineDetailsOpen && (
                <div className="grid cols-2" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
                  <div><label className="lbl">Event label (optional)</label><input className="inp" value={timelineForm.eventLabel} onChange={(e) => setTimelineForm((f) => ({ ...f, eventLabel: e.target.value }))} /></div>
                  <div><label className="lbl">Source URL</label><input className="inp" value={timelineForm.sourceUrl} onChange={(e) => setTimelineForm((f) => ({ ...f, sourceUrl: e.target.value }))} /></div>
                  <div>
                    <label className="lbl">Verification status</label>
                    <select className="inp" value={timelineForm.verificationStatus} onChange={(e) => setTimelineForm((f) => ({ ...f, verificationStatus: e.target.value }))}>
                      {(timelineMeta.verificationStatuses.length ? timelineMeta.verificationStatuses : [timelineForm.verificationStatus]).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Notes</label><input className="inp" value={timelineForm.notes} onChange={(e) => setTimelineForm((f) => ({ ...f, notes: e.target.value }))} /></div>
                </div>
              )}
            </div>

            {timelineMsg && <div className="disclaimer" style={!timelineMsg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>{timelineMsg.text}</div>}
          </div>
        )}
      </div>

      <div className="card pad">
        <h3>Application Route Planner</h3>
        <p className="note">Your saved colleges, grouped by the platform they actually use -- so you can see real workload at a glance.</p>
        {!routePlanner || !routePlanner.totalColleges ? (
          <div className="empty" style={{ marginTop: 10 }}>Save some colleges first (Matches, Browse, or My List), then add their application platform below.</div>
        ) : (
          <div className="stack" style={{ marginTop: 10, gap: 10 }}>
            {routePlanner.groups.map((g) => (
              <div key={g.platformId} className="card pad">
                <div className="row spread wrap" style={{ alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>
                    {g.platformId === "unknown" ? "No platform set yet" : g.platformName}
                    {" "}<span className="note">({g.count} college{g.count === 1 ? "" : "s"})</span>
                  </h3>
                  {g.extraApplicationsNeeded > 0 && <span className="pill">{g.extraApplicationsNeeded} need extra honors/scholarship/program app(s)</span>}
                </div>
                {g.platformId === "unknown" && (
                  <p className="note" style={{ marginTop: 4 }}>
                    You haven't recorded an application platform for these colleges yet. Where we recognize a well-known
                    public university system (like UC, Cal State, SUNY, CUNY, or ApplyTexas campuses), a suggestion is
                    shown below -- one click adds it as a starting point, still marked "Needs manual verification" until
                    you confirm it. For everything else, click <strong>Set platform</strong> to jump to the form below,
                    already filled in with this college and any dates the Application Timeline already knows.
                  </p>
                )}
                <div className="note" style={{ marginTop: 6 }}>
                  Earliest deadline in this group: {g.earliestDeadline || "not set yet"}
                </div>
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {g.colleges.map((c) => {
                    const tl = timelineDeadlineSummary[c.collegeId];
                    return (
                      <div key={c.collegeId} className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                        <span className={`cat ${c.verified ? "Safety" : "Unknown"}`} title={c.earliestDeadline ? `Earliest: ${c.earliestDeadline}` : "No deadline set"}>
                          {c.collegeName}
                        </span>
                        {!c.earliestDeadline && tl?.earliestUpcomingDeadline && (
                          <span className="note" style={{ fontSize: 12 }}>
                            Application Timeline: {tl.applicationRound || ""} {tl.earliestUpcomingDeadline.date} ({tl.timelineStatus})
                          </span>
                        )}
                        {g.platformId === "unknown" && c.suggestedPlatformId && (
                          <>
                            <span className="note" style={{ fontSize: 12 }}>Suggested: {c.suggestedPlatformName} ({c.suggestedReason})</span>
                            <button className="btn sm ghost" disabled={busy} title={`Set ${c.collegeName}'s platform to ${c.suggestedPlatformName} and pull in known application dates`} onClick={() => applySuggestionQuick(c.collegeId, c.collegeName, c.suggestedPlatformId)}>Use suggested platform: {c.suggestedPlatformName}</button>
                          </>
                        )}
                        {g.platformId === "unknown" && (
                          <button className="btn sm ghost" onClick={() => jumpToAddForm(c.collegeId, c.collegeName)}>Set platform →</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="note" style={{ marginTop: 8 }}>{g.actionNeeded}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card pad" style={{ borderColor: "var(--amber)" }} ref={addFormRef}>
        <h3>Add an application record for a college</h3>
        <div className="grid cols-2">
          <div>
            <label className="lbl">College *</label>
            <select className="inp" value={form.collegeId} onChange={(e) => setForm((f) => ({ ...f, collegeId: e.target.value }))}>
              <option value="">Choose a saved college...</option>
              {(saved || []).map((s) => <option key={s.college_id} value={s.college_id}>{s.college_name || collegeNames?.[s.college_id] || s.college_id}</option>)}
            </select>
            {form.collegeId && timelineDeadlineSummary[form.collegeId]?.earliestUpcomingDeadline && (
              <div className="note" style={{ fontSize: 12, marginTop: 4 }}>
                Application Timeline has {timelineDeadlineSummary[form.collegeId].applicationRound || ""}{" "}
                {timelineDeadlineSummary[form.collegeId].earliestUpcomingDeadline.date} on file.{" "}
                <button className="link" onClick={useTimelineDatesInForm}>Use dates from Application Timeline</button>
              </div>
            )}
          </div>
          <div>
            <label className="lbl">Program / honors label (optional -- leave blank for the main application)</label>
            <input className="inp" placeholder="e.g. Honors College application" value={form.programLabel} onChange={(e) => setForm((f) => ({ ...f, programLabel: e.target.value }))} />
          </div>
          <div>
            <label className="lbl">Application platform</label>
            <select className="inp" value={form.platformId} onChange={(e) => {
              const platformId = e.target.value;
              setForm((f) => ({ ...f, platformId, applicationUrl: f.applicationUrl || platformUrl(platformId) }));
            }}>
              <option value="">Unknown -- needs verification</option>
              {platforms.map((p) => <option key={p.platform_id} value={p.platform_id}>{p.platform_name}</option>)}
            </select>
            {suggestion && form.platformId === suggestion.platformId && (
              <div className="note" style={{ fontSize: 12, marginTop: 4 }}>Pre-filled suggestion: {suggestion.reason} Please verify and change if wrong.</div>
            )}
          </div>
          <div>
            <label className="lbl">Application URL</label>
            <input className="inp" placeholder="https://..." value={form.applicationUrl} onChange={(e) => setForm((f) => ({ ...f, applicationUrl: e.target.value }))} />
          </div>
        </div>

        <h3 style={{ marginTop: 12 }}>Deadlines</h3>
        <div className="grid cols-2">
          {DEADLINE_FIELDS.map(([camel, , label]) => (
            <div key={camel}>
              <label className="lbl">{label}</label>
              <input className="inp" placeholder="e.g. Nov 1 or Rolling" value={form[camel]} onChange={(e) => setForm((f) => ({ ...f, [camel]: e.target.value }))} />
            </div>
          ))}
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
          <button className="btn amber" disabled={busy || !form.collegeId} onClick={addRequirement}>Add this application record</button>
          <button className="link" onClick={() => setDetailsOpen((v) => !v)}>{detailsOpen ? "Hide extra details" : "+ Add more details (optional)"}</button>
        </div>

        {detailsOpen && (
          <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
            <div className="grid cols-2">
              {YNU_FIELDS.map(([camel, , label]) => (
                <div key={camel}>
                  <label className="lbl">{label}</label>
                  <select className="inp" value={form[camel]} onChange={(e) => setForm((f) => ({ ...f, [camel]: e.target.value }))}>
                    {ynu.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div><label className="lbl">Test policy</label><input className="inp" value={form.testPolicy} onChange={(e) => setForm((f) => ({ ...f, testPolicy: e.target.value }))} /></div>
              <div><label className="lbl">Application fee</label><input className="inp" value={form.applicationFee} onChange={(e) => setForm((f) => ({ ...f, applicationFee: e.target.value }))} /></div>
              <div>
                <label className="lbl">Fee waiver available?</label>
                <select className="inp" value={form.feeWaiverAvailable} onChange={(e) => setForm((f) => ({ ...f, feeWaiverAvailable: e.target.value }))}>
                  {ynu.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Verification status</label>
                <select className="inp" value={form.verificationStatus} onChange={(e) => setForm((f) => ({ ...f, verificationStatus: e.target.value }))}>
                  {verificationStatuses.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="lbl">Source URL</label><input className="inp" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} /></div>
            </div>
            <label className="lbl">Notes</label>
            <input className="inp" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        )}
      </div>

      {msg && (
        <div className="disclaimer" style={!msg.ok ? { borderLeftColor: "var(--reach)", background: "#f7ece8" } : undefined}>{msg.text}</div>
      )}

      <div className="card pad">
        <h3>Your application records</h3>
        {!requirements.length && <div className="empty" style={{ marginTop: 10 }}>No application records yet -- add one above.</div>}
        <div className="stack" style={{ marginTop: 10 }}>
          {[...byCollege.entries()].map(([key, rows]) => (
            <div key={key} className="stack" style={{ gap: 8 }}>
              <div className="note" style={{ fontWeight: 600 }}>{rows[0].college_name || key}</div>
              {rows.map((r) => {
                const isOpen = expanded === r.requirement_id;
                return (
                  <div key={r.requirement_id} className="card">
                    <div className="pad row spread wrap" style={{ gap: 8 }}>
                      <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setExpanded(isOpen ? null : r.requirement_id)}>
                        <h3>{r.program_label || "Main application"}</h3>
                        <div className="note">{r.platform_name || "Platform not set"} · Earliest set deadline shown in details</div>
                        {timelineDeadlineSummary[r.college_id]?.earliestUpcomingDeadline && (
                          <div className="note" style={{ fontSize: 12 }}>
                            Application Timeline: {timelineDeadlineSummary[r.college_id].applicationRound || ""}{" "}
                            {timelineDeadlineSummary[r.college_id].earliestUpcomingDeadline.date} ({timelineDeadlineSummary[r.college_id].timelineStatus})
                          </div>
                        )}
                      </div>
                      <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                        <SourceBadge level={badgeLevelFor(r.verification_status)}>{r.verification_status}</SourceBadge>
                        <button className="btn sm ghost" onClick={() => setExpanded(isOpen ? null : r.requirement_id)}>{isOpen ? "Hide" : "Details"}</button>
                        <button
                          className="btn sm ghost"
                          style={{ color: "var(--reach)" }}
                          onClick={() => { if (window.confirm(`Delete this application record for ${r.college_name || "this college"}?`)) deleteRequirement(r.requirement_id); }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                        <div className="grid cols-2">
                          <div>
                            <label className="lbl">Platform</label>
                            <select className="inp" value={r.platform_id || ""} onChange={(e) => {
                              const platformId = e.target.value;
                              // Auto-fill the application URL from the platform's official portal
                              // when the college doesn't already have its own URL on file -- never
                              // overwrites a URL the family already entered.
                              const patch = { platformId, platformName: platformName(platformId) };
                              if (!r.application_url) patch.applicationUrl = platformUrl(platformId);
                              updateRequirement(r.requirement_id, patch);
                              if (platformId) triggerTimelineAutofillFor(r.college_id, r.college_name, r.requirement_id); // setting a platform -> also pull real timeline dates + detail fields for this college
                            }}>
                              <option value="">Unknown -- needs verification</option>
                              {platforms.map((p) => <option key={p.platform_id} value={p.platform_id}>{p.platform_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="lbl">Application URL</label>
                            <input key={`url-${r.requirement_id}-${r.application_url || ""}`} className="inp" defaultValue={r.application_url || ""} onBlur={(e) => { if (e.target.value !== (r.application_url || "")) updateRequirement(r.requirement_id, { applicationUrl: e.target.value }); }} />
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <button className="btn sm ghost" onClick={() => fillDeadlinesFromTimeline(r.requirement_id, r.college_id, r)}>Fill deadlines from Application Timeline</button>
                            {fillFromTimelineMsg && (
                              <div className="note" style={{ fontSize: 12, marginTop: 4, color: fillFromTimelineMsg.ok ? undefined : "var(--reach)" }}>{fillFromTimelineMsg.text}</div>
                            )}
                          </div>
                          {DEADLINE_FIELDS.map(([camel, snake, label]) => (
                            <div key={snake}>
                              <label className="lbl">{label}</label>
                              <input className="inp" defaultValue={r[snake] || ""} onBlur={(e) => { if (e.target.value !== (r[snake] || "")) updateRequirement(r.requirement_id, { [camel]: e.target.value }); }} />
                            </div>
                          ))}
                          {YNU_FIELDS.map(([camel, snake, label]) => (
                            <div key={snake}>
                              <label className="lbl">{label}</label>
                              <select className="inp" value={r[snake] || "Unknown"} onChange={(e) => updateRequirement(r.requirement_id, { [camel]: e.target.value })}>
                                {ynu.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                          <div><label className="lbl">Test policy</label><input className="inp" defaultValue={r.test_policy || ""} onBlur={(e) => { if (e.target.value !== (r.test_policy || "")) updateRequirement(r.requirement_id, { testPolicy: e.target.value }); }} /></div>
                          <div><label className="lbl">Application fee</label><input className="inp" defaultValue={r.application_fee || ""} onBlur={(e) => { if (e.target.value !== (r.application_fee || "")) updateRequirement(r.requirement_id, { applicationFee: e.target.value }); }} /></div>
                          <div>
                            <label className="lbl">Fee waiver available?</label>
                            <select className="inp" value={r.fee_waiver_available || "Unknown"} onChange={(e) => updateRequirement(r.requirement_id, { feeWaiverAvailable: e.target.value })}>
                              {ynu.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="note" style={{ marginTop: 8 }}>
                          Source: {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer">{r.source_url}</a> : "not set"} ·
                          {" "}Last checked: {r.last_checked ? new Date(r.last_checked).toLocaleDateString() : "never"}
                        </div>
                        <label className="lbl" style={{ marginTop: 8 }}>Notes</label>
                        <input className="inp" defaultValue={r.notes || ""} onBlur={(e) => { if (e.target.value !== (r.notes || "")) updateRequirement(r.requirement_id, { notes: e.target.value }); }} />
                        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                          <select className="inp" style={{ maxWidth: 260 }} value={r.verification_status} onChange={(e) => updateRequirement(r.requirement_id, { verificationStatus: e.target.value, markLastChecked: true })}>
                            {verificationStatuses.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <button className="btn sm ghost" onClick={() => deleteRequirement(r.requirement_id)}>Delete</button>
                          {onGo && <button className="btn sm ghost" onClick={() => onGo("essays")}>Go to Essay Center →</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="card pad">
        <div className="row spread" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Region view</h3>
          <button className="link" onClick={() => setShowRegion((v) => !v)}>{showRegion ? "Hide" : "Show"}</button>
        </div>
        {showRegion && (
          <>
            <p className="note">
              {regionSummary?.disclaimer || "General guidance on how application platforms are typically organized by region -- not a fact about any specific college. Always verify per college."}
            </p>
            {!regionSummary?.regions?.length ? (
              <div className="empty" style={{ marginTop: 10 }}>No saved colleges with a state on file yet.</div>
            ) : (
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                {regionSummary.regions.map((rg) => (
                  <div key={rg.regionKey} className="card pad">
                    <h3>{rg.guidance?.label || rg.regionKey} <span className="note">({rg.count})</span></h3>
                    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                      {rg.colleges.map((c) => (
                        <div key={c.collegeId} className="note">
                          <strong>{c.collegeName}</strong>{c.suggestedPlatformName ? ` -- likely: ${c.suggestedPlatformName}` : ""}
                          {c.suggestedReason ? <span style={{ color: "var(--muted)" }}> ({c.suggestedReason})</span> : null}
                        </div>
                      ))}
                    </div>
                    {rg.guidance && rg.colleges.some((c) => !c.suggestedPlatformId) && (
                      <details style={{ marginTop: 8 }}>
                        <summary className="note" style={{ cursor: "pointer" }}>Other routes typical for this region (for colleges without a specific suggestion above)</summary>
                        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                          {rg.guidance.likelyRoutes.map((route) => <span key={route} className="pill">{route}</span>)}
                        </div>
                        <p className="note" style={{ marginTop: 6 }}>{rg.guidance.note}</p>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card pad">
        <div className="row spread" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Platform reference</h3>
          <button className="link" onClick={() => setShowPlatformRef((v) => !v)}>{showPlatformRef ? "Hide" : "Show"}</button>
        </div>
        <p className="note">General guidance only -- coverage and rules change; always confirm on the platform's own site or the specific college's admissions page.</p>
        {showPlatformRef && (
          <div className="grid cols-2" style={{ marginTop: 10 }}>
            {platforms.map((p) => (
              <div key={p.platform_id} className="card pad">
                <h3>{p.platform_name}</h3>
                <div className="note">{p.approximate_coverage}</div>
                <div className="note">{p.region_system}</div>
                {p.official_url && <div className="note"><a href={p.official_url} target="_blank" rel="noreferrer">{p.official_url}</a></div>}
                {p.notes && <div className="note" style={{ fontStyle: "italic", marginTop: 4 }}>{p.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
