// routes/programs.js - the "Programs" tab API. Every route is mounted behind
// requireAuth in index.js, and router.param("id", ...) below forces the :id
// segment to the authenticated Firebase UID (identical pattern to
// routes/misc.js's studentRouter), so a user can never read or write another
// family's program data.
import express from "express";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import { seedProgramsFromScorecard, addOfficialUrl, discoverFromOfficialDomain, researchCollege } from "../services/programDiscovery.js";

export const programsRouter = express.Router();

programsRouter.param("id", (req, _res, next) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});

const VALID_STATUSES = [
  "Official source verified",
  "College Scorecard / CIP inferred",
  "User verified",
  "Needs manual verification",
  "Outdated / needs recheck",
  "Not relevant",
];

// ---------- Layer 1: College Scorecard / CIP seed ----------
programsRouter.post("/:id/seed-scorecard", async (req, res) => {
  const { collegeId } = req.body || {};
  if (!collegeId) return res.status(400).json({ error: "bad_request", message: "collegeId required" });
  try {
    const out = await seedProgramsFromScorecard(req.params.id, collegeId);
    res.json(out);
  } catch (err) {
    res.status(502).json({ error: "upstream", message: "Could not retrieve College Scorecard field-of-study data.", detail: err.message });
  }
});

// ---------- "Research this college" one-button family workflow ----------
// Runs Layer 1 (College Scorecard / CIP seed) always, and Layer 3 (bounded
// official-domain crawl) automatically whenever College Scorecard has an
// official website on file for the college -- the family never has to
// already know or type a domain. See services/programDiscovery.js.
programsRouter.post("/:id/research", async (req, res) => {
  const { collegeId, collegeName, track, keyword } = req.body || {};
  if (!collegeId) return res.status(400).json({ error: "bad_request", message: "collegeId required" });
  try {
    const out = await researchCollege(req.params.id, { collegeId, collegeName, track, keyword });
    res.json(out);
  } catch (err) {
    res.status(502).json({ error: "research_failed", message: "Could not complete college research.", detail: err.message });
  }
});

// ---------- Layer 2: manual official URL ----------
programsRouter.get("/:id/sources", (req, res) => {
  const { collegeId } = req.query;
  const rows = collegeId
    ? db.prepare("SELECT * FROM program_sources WHERE student_id=? AND college_id=? ORDER BY created_at DESC").all(req.params.id, collegeId)
    : db.prepare("SELECT * FROM program_sources WHERE student_id=? ORDER BY created_at DESC").all(req.params.id);
  res.json({ sources: rows });
});

programsRouter.post("/:id/sources", async (req, res) => {
  const { collegeId, collegeName, url, sourceType, allowPdf } = req.body || {};
  if (!url) return res.status(400).json({ error: "bad_request", message: "url required" });
  try {
    const out = await addOfficialUrl(req.params.id, { collegeId, collegeName, url, sourceType, allowPdf });
    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ error: "extraction_failed", message: err.message });
  }
});

// ---------- Layer 3: bounded official-domain discovery ----------
programsRouter.post("/:id/discover", async (req, res) => {
  const { collegeId, collegeName, domain, startUrl } = req.body || {};
  if (!domain) return res.status(400).json({ error: "bad_request", message: "domain required (e.g. rutgers.edu)" });
  try {
    const out = await discoverFromOfficialDomain(req.params.id, { collegeId, collegeName, domain, startUrl });
    res.json(out);
  } catch (err) {
    res.status(502).json({ error: "crawl_failed", message: err.message });
  }
});

// ---------- Discovered programs: list / filter ----------
programsRouter.get("/:id/discovered", (req, res) => {
  const { collegeId, track, keyword, verificationStatus } = req.query;
  let rows = db.prepare("SELECT * FROM discovered_programs WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  if (collegeId) rows = rows.filter((r) => r.college_id === collegeId);
  if (verificationStatus) rows = rows.filter((r) => r.verification_status === verificationStatus);
  if (track) {
    const t = track.toLowerCase();
    rows = rows.filter((r) => {
      let tracks = [];
      try { tracks = JSON.parse(r.relevant_tracks_json || "[]"); } catch { /* ignore */ }
      return tracks.some((x) => String(x).toLowerCase().includes(t)) || (r.program_type || "").toLowerCase().includes(t);
    });
  }
  if (keyword) {
    const k = keyword.toLowerCase();
    rows = rows.filter((r) =>
      (r.program_name || "").toLowerCase().includes(k) ||
      (r.college_name || "").toLowerCase().includes(k) ||
      (r.program_type || "").toLowerCase().includes(k) ||
      (r.school_department || "").toLowerCase().includes(k)
    );
  }
  res.json({ programs: rows, statuses: VALID_STATUSES });
});

// ---------- Manual / user-entered program (Layer: user-entered verification) ----------
programsRouter.post("/:id/discovered/manual", (req, res) => {
  const b = req.body || {};
  if (!b.programName) return res.status(400).json({ error: "bad_request", message: "programName required" });
  const ts = Date.now();
  const programId = `prog_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO discovered_programs (
      program_id, student_id, college_id, college_name, program_name, program_type, school_department,
      eligibility, who_can_apply, application_deadline, application_process, benefits, requirements,
      relevant_tracks_json, cip_code, credential_level, earnings_median, debt_median, data_year,
      source_url, source_id, source_label, confidence_level, verification_status, last_checked, notes,
      action_needed, created_at, updated_at
    ) VALUES (
      @program_id, @student_id, @college_id, @college_name, @program_name, @program_type, @school_department,
      @eligibility, @who_can_apply, @application_deadline, @application_process, @benefits, @requirements,
      @relevant_tracks_json, NULL, NULL, NULL, NULL, NULL,
      @source_url, NULL, 'User entered', 'high', 'User verified', @last_checked, @notes,
      @action_needed, @created_at, @updated_at
    )
  `).run({
    program_id: programId, student_id: req.params.id, college_id: b.collegeId || null, college_name: b.collegeName || null,
    program_name: b.programName, program_type: b.programType || "Other", school_department: b.schoolDepartment || null,
    eligibility: b.eligibility || null, who_can_apply: b.whoCanApply || null, application_deadline: b.applicationDeadline || null,
    application_process: b.applicationProcess || null, benefits: b.benefits || null, requirements: b.requirements || null,
    relevant_tracks_json: JSON.stringify(b.relevantTracks || []), source_url: b.sourceUrl || null,
    last_checked: ts, notes: b.notes || "Entered directly by the family. Treated as user-verified - keep the source URL current.",
    action_needed: b.actionNeeded || "Ready to include in Decision Plan strategy - recheck before the application deadline.",
    created_at: ts, updated_at: ts,
  });
  res.json(db.prepare("SELECT * FROM discovered_programs WHERE program_id=?").get(programId));
});

// ---------- Edit / verify / delete a discovered program ----------
const EDITABLE_COLS = [
  "program_name", "program_type", "school_department", "eligibility", "who_can_apply",
  "application_deadline", "application_process", "benefits", "requirements", "notes",
  "source_url", "verification_status", "confidence_level", "action_needed",
];

programsRouter.put("/:id/discovered/:programId", (req, res) => {
  const row = db.prepare("SELECT * FROM discovered_programs WHERE student_id=? AND program_id=?").get(req.params.id, req.params.programId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  if (b.verificationStatus && !VALID_STATUSES.includes(b.verificationStatus)) {
    return res.status(400).json({ error: "bad_request", message: `verificationStatus must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const camelToSnake = {
    programName: "program_name", programType: "program_type", schoolDepartment: "school_department",
    eligibility: "eligibility", whoCanApply: "who_can_apply", applicationDeadline: "application_deadline",
    applicationProcess: "application_process", benefits: "benefits", requirements: "requirements", notes: "notes",
    sourceUrl: "source_url", verificationStatus: "verification_status", confidenceLevel: "confidence_level",
    relevantTracks: "relevant_tracks_json", actionNeeded: "action_needed",
  };
  const updates = {};
  for (const [camel, snake] of Object.entries(camelToSnake)) {
    if (b[camel] === undefined) continue;
    if (!EDITABLE_COLS.includes(snake) && snake !== "relevant_tracks_json") continue;
    updates[snake] = snake === "relevant_tracks_json" ? JSON.stringify(b[camel] || []) : b[camel];
  }
  if (b.markLastChecked) updates.last_checked = Date.now();
  updates.updated_at = Date.now();
  if (!Object.keys(updates).length) return res.json(row);
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE discovered_programs SET ${set} WHERE student_id=@student_id AND program_id=@program_id`)
    .run({ ...updates, student_id: req.params.id, program_id: req.params.programId });
  res.json(db.prepare("SELECT * FROM discovered_programs WHERE program_id=?").get(req.params.programId));
});

programsRouter.delete("/:id/discovered/:programId", (req, res) => {
  db.prepare("DELETE FROM discovered_programs WHERE student_id=? AND program_id=?").run(req.params.id, req.params.programId);
  res.json({ ok: true });
});

// ---------- Bulk clear: "Clear discovered programs" ----------
// Scoped to one college when collegeId is given (the common case -- the
// family is looking at one college's results and wants a clean slate before
// re-running "Research this college"), or every discovered program for this
// family when omitted. Only ever deletes discovered_programs rows -- never
// touches program_sources (the raw fetched-page audit trail) or any other
// table, and never affects another family's data (scoped by student_id).
programsRouter.delete("/:id/discovered", (req, res) => {
  const { collegeId } = req.query;
  const result = collegeId
    ? db.prepare("DELETE FROM discovered_programs WHERE student_id=? AND college_id=?").run(req.params.id, collegeId)
    : db.prepare("DELETE FROM discovered_programs WHERE student_id=?").run(req.params.id);
  res.json({ ok: true, removed: result.changes });
});

// ---------- CSV export: Programs & Opportunities ----------
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

programsRouter.get("/:id/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM discovered_programs WHERE student_id=? ORDER BY college_name, program_name").all(req.params.id);
  const header = [
    "College", "Program Name", "Program Type", "Department", "Eligibility", "Who Can Apply",
    "Application Deadline", "Application Process", "Benefits", "Requirements", "Relevant Tracks",
    "Verification Status", "Confidence Level", "Source URL", "Source", "Last Checked", "Action Needed", "Notes",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    let tracks = [];
    try { tracks = JSON.parse(r.relevant_tracks_json || "[]"); } catch { /* ignore */ }
    lines.push([
      csvEscape(r.college_name), csvEscape(r.program_name), csvEscape(r.program_type), csvEscape(r.school_department),
      csvEscape(r.eligibility), csvEscape(r.who_can_apply), csvEscape(r.application_deadline), csvEscape(r.application_process),
      csvEscape(r.benefits), csvEscape(r.requirements), csvEscape(tracks.join("; ")),
      csvEscape(r.verification_status), csvEscape(r.confidence_level), csvEscape(r.source_url), csvEscape(r.source_label),
      csvEscape(r.last_checked ? new Date(r.last_checked).toISOString().slice(0, 10) : ""),
      csvEscape(r.action_needed), csvEscape(r.notes),
    ].join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="programs-and-opportunities.csv"');
  res.send(lines.join("\n"));
});
