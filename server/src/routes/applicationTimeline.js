// routes/applicationTimeline.js, the "Application Timeline" tab API.
// Mounted behind requireAuth in index.js; router.param("id") forces the :id
// segment to the authenticated Firebase UID (same pattern as every other
// per-student router), so a user can never read or write another family's
// timeline data.
import express from "express";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import {
  EVENT_TYPES, APPLICATION_ROUNDS, DEADLINE_EVENT_TYPES, findTimelineEvents, detectConflicts,
  buildCollegeTimelineSummary, buildDecisionPlanTimelineSummary, buildJourneyTimelineSummary,
  findAutofillCandidate, autofillOrDiscoverTimeline, populateAllTimelines,
} from "../services/applicationTimeline.js";
import { VERIFICATION_STATUSES } from "./applicationPathways.js";
import { suggestPlatform } from "../services/applicationPathways.js";
import { findEssayPrompts } from "../services/essayCenter.js";

export const applicationTimelineRouter = express.Router();

applicationTimelineRouter.param("id", (req, _res, next) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});

const newId = (p) => `${p}_${crypto.randomUUID()}`;
const now = () => Date.now();

// ---------- Reference data ----------
applicationTimelineRouter.get("/:id/meta", (_req, res) => {
  res.json({ eventTypes: EVENT_TYPES, applicationRounds: APPLICATION_ROUNDS, verificationStatuses: VERIFICATION_STATUSES, deadlineEventTypes: DEADLINE_EVENT_TYPES });
});

// ---------- Events (Part C/F) ----------
applicationTimelineRouter.get("/:id/events", (req, res) => {
  const { collegeId } = req.query;
  const rows = collegeId
    ? db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? AND college_id=? ORDER BY event_type").all(req.params.id, collegeId)
    : db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json({ events: rows });
});

const EVENT_FIELD_MAP = {
  collegeId: "college_id", collegeName: "college_name", programLabel: "program_label",
  applicationRound: "application_round", eventType: "event_type", eventLabel: "event_label",
  eventDate: "event_date", eventMonthDay: "event_month_day", cycleYear: "cycle_year",
  sourceUrl: "source_url", sourceLabel: "source_label", verificationStatus: "verification_status", notes: "notes",
};

// Part F. Manual timeline entry. Every field the family can enter directly;
// event_type must be one of the fixed vocabulary so downstream summaries
// (Decision Plan / Journey) can rely on it, but "Other" is always available
// for anything that doesn't fit.
applicationTimelineRouter.post("/:id/events", (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  if (!b.eventType) return res.status(400).json({ error: "bad_request", message: "eventType required" });
  if (!EVENT_TYPES.includes(b.eventType)) return res.status(400).json({ error: "bad_request", message: `eventType must be one of: ${EVENT_TYPES.join(", ")}` });
  const ts = now();
  const eventId = newId("tl");
  const cols = ["event_id", "student_id", "created_at", "updated_at", "last_checked"];
  const vals = { event_id: eventId, student_id: req.params.id, created_at: ts, updated_at: ts, last_checked: ts };
  for (const [camel, snake] of Object.entries(EVENT_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    cols.push(snake);
    vals[snake] = b[camel];
  }
  if (!vals.verification_status) { cols.push("verification_status"); vals.verification_status = "Needs manual verification"; }
  if (!vals.source_label && vals.source_url) { cols.push("source_label"); vals.source_label = "Family-provided source"; }
  const placeholders = cols.map((c) => `@${c}`).join(",");
  db.prepare(`INSERT INTO college_application_timeline_events (${cols.join(",")}) VALUES (${placeholders})`).run(vals);
  res.json(db.prepare("SELECT * FROM college_application_timeline_events WHERE event_id=?").get(eventId));
});

applicationTimelineRouter.put("/:id/events/:eventId", (req, res) => {
  const row = db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? AND event_id=?").get(req.params.id, req.params.eventId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  if (b.eventType && !EVENT_TYPES.includes(b.eventType)) return res.status(400).json({ error: "bad_request", message: `eventType must be one of: ${EVENT_TYPES.join(", ")}` });
  if (b.verificationStatus && !VERIFICATION_STATUSES.includes(b.verificationStatus)) {
    return res.status(400).json({ error: "bad_request", message: `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}` });
  }
  const updates = {};
  for (const [camel, snake] of Object.entries(EVENT_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    updates[snake] = b[camel];
  }
  if (b.markLastChecked) updates.last_checked = now();
  updates.updated_at = now();
  if (!Object.keys(updates).length) return res.json(row);
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE college_application_timeline_events SET ${set} WHERE student_id=@student_id AND event_id=@event_id`)
    .run({ ...updates, student_id: req.params.id, event_id: req.params.eventId });
  res.json(db.prepare("SELECT * FROM college_application_timeline_events WHERE event_id=?").get(req.params.eventId));
});

applicationTimelineRouter.delete("/:id/events/:eventId", (req, res) => {
  db.prepare("DELETE FROM college_application_timeline_events WHERE student_id=? AND event_id=?").run(req.params.id, req.params.eventId);
  res.json({ ok: true });
});

// ---------- "Auto-fill official dates" ----------
// Read-only check (used to decide whether to show the button/badge) and the
// actual write. Both use the same name-pattern-matched reference data as
// suggestPlatform. See TIMELINE_AUTOFILL_PROFILES in db/deadlineSeed.js.
applicationTimelineRouter.get("/:id/autofill-preview", (req, res) => {
  const { collegeName } = req.query;
  const profile = findAutofillCandidate(collegeName);
  if (!profile) return res.json({ available: false });
  res.json({
    available: true, collegeName: profile.collegeName, confidence: profile.confidence,
    sourceUrl: profile.sourceUrl, lastChecked: profile.lastChecked, eventCount: profile.events.length,
  });
});

// The real pull: tries verified reference data first (instant), and if this
// college isn't one of those, automatically falls through to a live search
// of the college's own official site, so a newly-added college still gets
// a real attempt, not just "Unknown."
applicationTimelineRouter.post("/:id/events/autofill", async (req, res) => {
  const b = req.body || {};
  if (!b.collegeName) return res.status(400).json({ error: "bad_request", message: "collegeName required" });
  try {
    const result = await autofillOrDiscoverTimeline(req.params.id, { collegeId: b.collegeId || null, collegeName: b.collegeName });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "autofill_failed", message: err.message });
  }
});

// ---------- "Populate timelines for all my saved colleges" ----------
// One request, one pass over every saved college: auto-fill where verified
// reference data exists, fall back to the official-site crawl otherwise.
// Can take a while for a long saved list (sequential, polite crawling) --
// the client should show a busy state while it waits.
applicationTimelineRouter.post("/:id/events/populate-all", async (req, res) => {
  try {
    const result = await populateAllTimelines(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "populate_failed", message: err.message });
  }
});

// ---------- "Verify deadlines" discovery (Part G) ----------
applicationTimelineRouter.post("/:id/events/find", async (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.domain) return res.status(400).json({ error: "bad_request", message: "collegeId or domain required" });
  try {
    const result = await findTimelineEvents(req.params.id, {
      collegeId: b.collegeId, collegeName: b.collegeName, domain: b.domain, startUrl: b.startUrl, cycleYear: b.cycleYear,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "discovery_failed", message: err.message, notice: "Deadlines not verified yet. Check the official application portal." });
  }
});

// ---------- Per-college summary + conflicts (Parts D/E) ----------
applicationTimelineRouter.get("/:id/college-summary", (req, res) => {
  const { collegeId } = req.query;
  if (!collegeId) return res.status(400).json({ error: "bad_request", message: "collegeId required" });
  res.json(buildCollegeTimelineSummary(req.params.id, collegeId));
});

applicationTimelineRouter.get("/:id/conflicts", (req, res) => {
  const { collegeId } = req.query;
  res.json({ conflicts: detectConflicts(req.params.id, collegeId || null) });
});

// ---------- Decision Plan / Journey integration (Parts H/I) ----------
applicationTimelineRouter.get("/:id/decision-plan-summary", (req, res) => {
  res.json({ byCollege: buildDecisionPlanTimelineSummary(req.params.id) });
});

applicationTimelineRouter.get("/:id/journey-summary", (req, res) => {
  res.json(buildJourneyTimelineSummary(req.params.id));
});

// ---------- Part L: "Set up application planning for this college" ----------
// One button that creates the starting records across modules WITHOUT
// forcing it on every saved college automatically. Idempotent-ish: skips
// creating a second bare application-pathways record or a second open
// verification task if one already exists, so repeat clicks don't clutter
// the family's data.
applicationTimelineRouter.post("/:id/setup-planning", async (req, res) => {
  const b = req.body || {};
  const { collegeId, collegeName, state } = b;
  if (!collegeId && !collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  const studentId = req.params.id;
  const ts = now();
  const summary = { collegeId, collegeName, requirementCreated: false, timelineDiscovery: null, essayDiscovery: null, taskCreated: false };

  // 1) Application pathway record, only if none exists yet for this college.
  const existingReq = collegeId
    ? db.prepare("SELECT requirement_id FROM college_application_requirements WHERE student_id=? AND college_id=? LIMIT 1").get(studentId, collegeId)
    : null;
  if (!existingReq) {
    const suggestion = suggestPlatform(collegeName, state);
    const platform = suggestion ? db.prepare("SELECT platform_id, platform_name, official_url FROM application_platforms WHERE platform_id=?").get(suggestion.platformId) : null;
    const requirementId = newId("careq");
    db.prepare(`INSERT INTO college_application_requirements (
        requirement_id, student_id, college_id, college_name, platform_id, platform_name, application_url,
        verification_status, notes, created_at, updated_at, last_checked
      ) VALUES (@requirement_id,@student_id,@college_id,@college_name,@platform_id,@platform_name,@application_url,
        @verification_status,@notes,@created_at,@updated_at,@last_checked)`)
      .run({
        requirement_id: requirementId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
        platform_id: platform?.platform_id || null, platform_name: platform?.platform_name || null, application_url: platform?.official_url || null,
        verification_status: "Needs manual verification",
        notes: platform ? `Starting point from "Set up application planning": ${suggestion.reason} Please verify.` : "Starting point from \"Set up application planning\". Platform not yet known, please fill in.",
        created_at: ts, updated_at: ts, last_checked: ts,
      });
    summary.requirementCreated = true;
  }

  // 2) Timeline checklist. Attempt a bounded "verify deadlines" discovery
  // pass so the family has something to review instead of a blank tab.
  try {
    summary.timelineDiscovery = await findTimelineEvents(studentId, { collegeId, collegeName });
  } catch (err) {
    summary.timelineDiscovery = { error: err.message, eventsFound: 0 };
  }

  // 3) Find essay prompts. Same official-domain discovery Essay Center uses.
  try {
    summary.essayDiscovery = await findEssayPrompts(studentId, { collegeId, collegeName });
  } catch (err) {
    summary.essayDiscovery = { error: err.message, promptsFound: 0 };
  }

  // 4) Verification task, only if one isn't already open for this college.
  const existingTask = collegeId
    ? db.prepare("SELECT task_id FROM application_tasks WHERE student_id=? AND college_id=? AND task_type='application_timeline_verification' AND status!='Done' LIMIT 1").get(studentId, collegeId)
    : null;
  if (!existingTask) {
    const taskId = newId("task");
    db.prepare(`INSERT INTO application_tasks (task_id, student_id, college_id, college_name, task_type, due_date, priority, status, notes, created_at, updated_at)
      VALUES (@task_id,@student_id,@college_id,@college_name,'application_timeline_verification',NULL,'Medium','To do',@notes,@created_at,@updated_at)`)
      .run({ task_id: taskId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
        notes: `Verify the application platform, every deadline, and essay prompts for ${collegeName || "this college"} against its official site.`,
        created_at: ts, updated_at: ts });
    summary.taskCreated = true;
  }

  res.json(summary);
});

// ---------- CSV export ----------
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

applicationTimelineRouter.get("/:id/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? ORDER BY college_name, event_type").all(req.params.id);
  const headers = [
    "College", "Program", "Application round", "Event type", "Event label", "Event date", "Cycle year",
    "Verification status", "Source URL", "Last checked", "Notes",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.college_name, r.program_label, r.application_round, r.event_type, r.event_label, r.event_date, r.cycle_year,
      r.verification_status, r.source_url, r.last_checked ? new Date(r.last_checked).toISOString().slice(0, 10) : "", r.notes,
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="application-timeline.csv"');
  res.send(lines.join("\n"));
});
