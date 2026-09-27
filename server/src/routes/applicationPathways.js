// routes/applicationPathways.js, the "Application Pathways" tab API.
// Mounted behind requireAuth in index.js; router.param("id") forces the :id
// segment to the authenticated Firebase UID (same pattern as every other
// per-student router), so a user can never read or write another family's
// application-route data.
import express from "express";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import { buildRoutePlanner, buildRegionSummary, suggestPlatform } from "../services/applicationPathways.js";
import { DEADLINE_EVENT_TYPES } from "../services/applicationTimeline.js";
import { findAutofillProfile } from "../db/deadlineSeed.js";

export const applicationPathwaysRouter = express.Router();

applicationPathwaysRouter.param("id", (req, _res, next) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});

const newId = (p) => `${p}_${crypto.randomUUID()}`;
const now = () => Date.now();

export const VERIFICATION_STATUSES = [
  "Official source verified", "User verified", "Needs manual verification", "Outdated / needs recheck", "Unknown",
];
const YNU = ["Yes", "No", "Unknown"];

// ---------- Shared reference: application platforms ----------
applicationPathwaysRouter.get("/:id/platforms", (_req, res) => {
  res.json({ platforms: db.prepare("SELECT * FROM application_platforms ORDER BY platform_name").all(), verificationStatuses: VERIFICATION_STATUSES, ynu: YNU });
});

// ---------- Per-college requirement records ----------
applicationPathwaysRouter.get("/:id/requirements", (req, res) => {
  const { collegeId } = req.query;
  const rows = collegeId
    ? db.prepare("SELECT * FROM college_application_requirements WHERE student_id=? AND college_id=? ORDER BY created_at DESC").all(req.params.id, collegeId)
    : db.prepare("SELECT * FROM college_application_requirements WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json({ requirements: rows });
});

const REQ_FIELD_MAP = {
  collegeId: "college_id", collegeName: "college_name", programLabel: "program_label",
  platformId: "platform_id", platformName: "platform_name", applicationUrl: "application_url",
  applicationOpensDate: "application_opens_date", eaDeadline: "ea_deadline", edDeadline: "ed_deadline",
  reaSceaDeadline: "rea_scea_deadline", priorityDeadline: "priority_deadline", rdDeadline: "rd_deadline",
  rollingDeadline: "rolling_deadline", honorsAppRequired: "honors_app_required",
  scholarshipAppRequired: "scholarship_app_required", programSpecificAppRequired: "program_specific_app_required",
  portfolioRequired: "portfolio_required", interviewRequired: "interview_required",
  recommendationsRequired: "recommendations_required", transcriptRequired: "transcript_required",
  testPolicy: "test_policy", applicationFee: "application_fee", feeWaiverAvailable: "fee_waiver_available",
  verificationStatus: "verification_status", sourceUrl: "source_url", notes: "notes",
};

applicationPathwaysRouter.post("/:id/requirements", (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  const ts = now();
  const requirementId = newId("careq");
  const cols = ["requirement_id", "student_id", "created_at", "updated_at", "last_checked"];
  const vals = { requirement_id: requirementId, student_id: req.params.id, created_at: ts, updated_at: ts, last_checked: ts };
  for (const [camel, snake] of Object.entries(REQ_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    cols.push(snake);
    vals[snake] = b[camel];
  }
  if (!vals.verification_status) { cols.push("verification_status"); vals.verification_status = "Needs manual verification"; }
  const placeholders = cols.map((c) => `@${c}`).join(",");
  db.prepare(`INSERT INTO college_application_requirements (${cols.join(",")}) VALUES (${placeholders})`).run(vals);
  res.json(db.prepare("SELECT * FROM college_application_requirements WHERE requirement_id=?").get(requirementId));
});

applicationPathwaysRouter.put("/:id/requirements/:reqId", (req, res) => {
  const row = db.prepare("SELECT * FROM college_application_requirements WHERE student_id=? AND requirement_id=?").get(req.params.id, req.params.reqId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  if (b.verificationStatus && !VERIFICATION_STATUSES.includes(b.verificationStatus)) {
    return res.status(400).json({ error: "bad_request", message: `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}` });
  }
  const updates = {};
  for (const [camel, snake] of Object.entries(REQ_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    updates[snake] = b[camel];
  }
  if (b.markLastChecked) updates.last_checked = now();
  updates.updated_at = now();
  if (!Object.keys(updates).length) return res.json(row);
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE college_application_requirements SET ${set} WHERE student_id=@student_id AND requirement_id=@requirement_id`)
    .run({ ...updates, student_id: req.params.id, requirement_id: req.params.reqId });
  res.json(db.prepare("SELECT * FROM college_application_requirements WHERE requirement_id=?").get(req.params.reqId));
});

applicationPathwaysRouter.delete("/:id/requirements/:reqId", (req, res) => {
  db.prepare("DELETE FROM college_application_requirements WHERE student_id=? AND requirement_id=?").run(req.params.id, req.params.reqId);
  res.json({ ok: true });
});

// Auto-fills the YNU/detail fields (honors/scholarship/program-specific app
// required, portfolio, interview, recommendations, transcript required, test
// policy, application fee, fee waiver) on an existing requirement row from
// the same hand-verified reference profiles used for Application Timeline
// dates (deadlineSeed.js). Only fields still at their default "Unknown" or
// blank are touched, so a family's own edits are never overwritten. No live
// crawl fallback here, unlike dates/essays. These details vary by program
// and change often enough that guessing them from crawled page text would be
// unreliable, so only verified reference data is used; the response says
// plainly when nothing is available yet for a college.
applicationPathwaysRouter.post("/:id/requirements/:reqId/autofill-details", (req, res) => {
  const row = db.prepare("SELECT * FROM college_application_requirements WHERE student_id=? AND requirement_id=?").get(req.params.id, req.params.reqId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const profile = findAutofillProfile(row.college_name);
  if (!profile || !profile.requirements) {
    return res.json({
      filled: false,
      reason: `No hand-verified application-detail data yet for "${row.college_name || "this college"}." Fill these in by hand from the official application portal.`,
    });
  }
  const DETAIL_FIELDS = [
    "honorsAppRequired", "scholarshipAppRequired", "programSpecificAppRequired", "portfolioRequired",
    "interviewRequired", "recommendationsRequired", "transcriptRequired", "testPolicy",
    "applicationFee", "feeWaiverAvailable",
  ];
  const updates = {};
  const filledFields = [];
  for (const camel of DETAIL_FIELDS) {
    const snake = REQ_FIELD_MAP[camel];
    const val = profile.requirements[camel];
    if (val === undefined || val === null) continue;
    const current = row[snake];
    if (current && current !== "Unknown") continue; // never overwrite a value the family already set
    updates[snake] = val;
    filledFields.push(camel);
  }
  if (!Object.keys(updates).length) {
    return res.json({ filled: false, reason: "All application-detail fields already have a value for this record. Nothing to fill." });
  }
  updates.updated_at = now();
  updates.last_checked = now();
  if (!row.source_url) updates.source_url = profile.sourceUrl;
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE college_application_requirements SET ${set} WHERE student_id=@student_id AND requirement_id=@requirement_id`)
    .run({ ...updates, student_id: req.params.id, requirement_id: req.params.reqId });
  res.json({
    filled: true, filledFields,
    requirement: db.prepare("SELECT * FROM college_application_requirements WHERE requirement_id=?").get(req.params.reqId),
    sourceUrl: profile.sourceUrl, confidence: profile.confidence,
    notice: "Application-detail fields auto-filled from hand-verified reference data, always confirm on the official application portal, since these details can change by cycle or by specific program.",
  });
});

// A lightweight, name-pattern-based platform suggestion (e.g. "University of
// California, X" -> UC Application) for the "Add an application record" form
//, always a suggestion to review/edit, never applied automatically and
// never marked verified.
applicationPathwaysRouter.get("/:id/platform-suggestion", (req, res) => {
  const { collegeName, state } = req.query;
  const suggestion = suggestPlatform(collegeName, state);
  if (!suggestion) return res.json({ suggestion: null });
  const platform = db.prepare("SELECT platform_id, platform_name FROM application_platforms WHERE platform_id=?").get(suggestion.platformId);
  res.json({ suggestion: { platformId: suggestion.platformId, platformName: platform?.platform_name || suggestion.platformId, reason: suggestion.reason } });
});

// ---------- Application Route Planner (Part B) ----------
applicationPathwaysRouter.get("/:id/route-planner", (req, res) => {
  res.json(buildRoutePlanner(req.params.id));
});

// ---------- Region view (Part C) ----------
applicationPathwaysRouter.get("/:id/region-summary", (req, res) => {
  res.json(buildRegionSummary(req.params.id));
});

// ---------- CSV export ----------
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

applicationPathwaysRouter.get("/:id/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM college_application_requirements WHERE student_id=? ORDER BY college_name").all(req.params.id);
  // Read-only cross-reference to Application Timeline. Earliest deadline
  // event per college, pulled in only for this export column (same
  // don't-merge-two-systems pattern used elsewhere in this app).
  const timelineRows = db.prepare("SELECT college_id, event_type, event_label, event_date, application_round, cycle_year, verification_status FROM college_application_timeline_events WHERE student_id=?").all(req.params.id);
  const timelineByCollege = {};
  for (const t of timelineRows) {
    if (!t.college_id || !DEADLINE_EVENT_TYPES.includes(t.event_type) || !t.event_date) continue;
    const existing = timelineByCollege[t.college_id];
    if (!existing || String(t.event_date).localeCompare(String(existing.event_date)) < 0) timelineByCollege[t.college_id] = t;
  }
  const headers = [
    "College", "Program", "Platform", "Application URL", "EA deadline", "ED deadline", "REA/SCEA deadline",
    "Priority deadline", "RD deadline", "Rolling deadline", "Honors app required", "Scholarship app required",
    "Program-specific app required", "Portfolio required", "Interview required", "Test policy", "Application fee",
    "Fee waiver available", "Verification status", "Source URL", "Last checked", "Notes",
    "Application Timeline: earliest deadline", "Application Timeline: round", "Application Timeline: cycle year",
    "Application Timeline: verification status",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const tl = r.college_id ? timelineByCollege[r.college_id] : null;
    lines.push([
      r.college_name, r.program_label, r.platform_name, r.application_url, r.ea_deadline, r.ed_deadline,
      r.rea_scea_deadline, r.priority_deadline, r.rd_deadline, r.rolling_deadline, r.honors_app_required,
      r.scholarship_app_required, r.program_specific_app_required, r.portfolio_required, r.interview_required,
      r.test_policy, r.application_fee, r.fee_waiver_available, r.verification_status, r.source_url,
      r.last_checked ? new Date(r.last_checked).toISOString().slice(0, 10) : "", r.notes,
      tl ? `${tl.event_label || tl.event_type}: ${tl.event_date}` : "", tl?.application_round || "", tl?.cycle_year || "", tl?.verification_status || "",
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="application-pathways.csv"');
  res.send(lines.join("\n"));
});
