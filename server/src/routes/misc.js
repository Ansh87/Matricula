// misc routes: careers (BLS), student profile, saved list, application tracker,
// and a grounded AI advisor that explains results using only available data.
import express from "express";
import multer from "multer";
import { db } from "../db/database.js";
import { listMajors, majorToCareers, careerFor, getSeries } from "../services/bls.js";
import { recommendMajors, recommendDoubleMajors } from "../services/majorRecommend.js";
import { answerAdvisor, buildEssayGrounding } from "../services/advisor.js";
import { buildStrategy } from "../services/strategyPlanner.js";
import { getVerified } from "../services/verified.js";
import { deriveProfileSignals } from "../services/profileSignals.js";
import { mergeSelectionContexts, mergeDoubleMajorPathway } from "../services/selectionContext.js";
import {
  listDoubleMajorVerifications, createDoubleMajorVerification,
  updateDoubleMajorVerification, deleteDoubleMajorVerification, isConfirmedDoubleMajor,
} from "../services/doubleMajorVerification.js";
import { matchNames } from "../services/collegeMatcher.js";
import { parseImportInput } from "../services/collegeImportParse.js";
import { getCollegeById } from "../services/scorecard.js";
import { scoreCollege } from "../services/scoring.js";

// ---------- Careers ----------
export const careersRouter = express.Router();

careersRouter.get("/majors", (_req, res) => res.json({ majors: listMajors() }));


// POST /api/careers/recommend-majors { profile } -> majors that fit the student
careersRouter.post("/recommend-majors", (req, res) => {
  const { profile } = req.body || {};
  if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
  res.json({ majors: recommendMajors(profile), doubleMajors: recommendDoubleMajors(profile) });
});

careersRouter.get("/major/:name", (req, res) => {
  const out = majorToCareers(req.params.name);
  if (!out) return res.status(404).json({ error: "not_found", message: "Unknown major. See /api/careers/majors." });
  res.json(out);
});

careersRouter.get("/occupation/:key", (req, res) => {
  const out = careerFor(req.params.key);
  if (!out) return res.status(404).json({ error: "not_found" });
  res.json(out);
});

careersRouter.post("/bls/series", async (req, res) => {
  try {
    const { seriesIds } = req.body || {};
    if (!Array.isArray(seriesIds) || !seriesIds.length)
      return res.status(400).json({ error: "bad_request", message: "seriesIds[] required" });
    res.json(await getSeries(seriesIds));
  } catch (err) {
    res.status(502).json({ error: "upstream", message: "Unable to retrieve BLS series data right now.", detail: err.message });
  }
});

// ---------- Students / list / tracker ----------
export const studentRouter = express.Router();
// User isolation: for authenticated requests, force the :id used by every
// handler below to be the Firebase UID, so a user can only ever read/write their
// OWN rows regardless of what id appears in the URL. router.param runs before
// any :id route handler. Falls back to the URL id in dev-bypass/no-auth.
studentRouter.param("id", (req, _res, next, _value) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});
// POST /api/students/:id/signals - what the matching engine derives from the
// profile's free text. Shown in the UI so nothing is a black box.
studentRouter.post("/:id/signals", (req, res) => {
  const profile = req.body?.profile || {};
  res.json({ signals: deriveProfileSignals(profile) });
});

const upsertStudent = db.prepare(`
  INSERT INTO students (student_id,name,grade,graduation_year,state_residence,budget,
    academic_profile_json,extracurricular_profile_json,interests_json,career_goals_json,created_at,updated_at)
  VALUES (@student_id,@name,@grade,@graduation_year,@state_residence,@budget,
    @academic_profile_json,@extracurricular_profile_json,@interests_json,@career_goals_json,@created_at,@updated_at)
  ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,grade=excluded.grade,
    graduation_year=excluded.graduation_year,state_residence=excluded.state_residence,budget=excluded.budget,
    academic_profile_json=excluded.academic_profile_json,extracurricular_profile_json=excluded.extracurricular_profile_json,
    interests_json=excluded.interests_json,career_goals_json=excluded.career_goals_json,updated_at=excluded.updated_at`);

studentRouter.put("/:id", (req, res) => {
  const p = req.body || {};
  const now = Date.now();
  upsertStudent.run({
    student_id: req.params.id,
    name: p.name ?? null, grade: p.grade ?? null, graduation_year: p.graduationYear ?? null,
    state_residence: p.state ?? null, budget: p.budget ?? null,
    // Store the entire profile object so every field (GPA weighted, ACT, rank,
    // ED willingness, etc.) round-trips, not just a fixed subset.
    academic_profile_json: JSON.stringify(p ?? {}),
    extracurricular_profile_json: JSON.stringify(p.extracurricular ?? {}),
    interests_json: JSON.stringify(p.interests ?? []),
    career_goals_json: JSON.stringify(p.careerGoals ?? []),
    created_at: now, updated_at: now,
  });
  res.json({ ok: true });
});

studentRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM students WHERE student_id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  let profile = {};
  try { profile = JSON.parse(row.academic_profile_json || "{}"); } catch { /* ignore */ }
  res.json({ ...row, profile });
});

// saved college list
const upsertList = db.prepare(`
  INSERT INTO student_college_list (student_id,college_id,college_name,city,state,category,admission_probability_range,
    overall_fit_score,academic_fit_score,major_fit_score,career_fit_score,financial_fit_score,
    admission_rate,estimated_net_cost,
    application_round,status,notes,created_at,updated_at,
    selection_contexts_json,source_context,primary_major,secondary_major,double_major_label,
    double_major_status,double_major_verification_status,double_major_notes,double_major_pathways_json,selected_at,
    import_batch_id,original_uploaded_name,matched_official_name,match_confidence,
    profile_score_at_import,admission_category_at_import)
  VALUES (@student_id,@college_id,@college_name,@city,@state,@category,@admission_probability_range,@overall_fit_score,
    @academic_fit_score,@major_fit_score,@career_fit_score,@financial_fit_score,
    @admission_rate,@estimated_net_cost,
    @application_round,
    @status,@notes,@created_at,@updated_at,
    @selection_contexts_json,@source_context,@primary_major,@secondary_major,@double_major_label,
    @double_major_status,@double_major_verification_status,@double_major_notes,@double_major_pathways_json,@selected_at,
    @import_batch_id,@original_uploaded_name,@matched_official_name,@match_confidence,
    @profile_score_at_import,@admission_category_at_import)
  ON CONFLICT(student_id,college_id) DO UPDATE SET college_name=excluded.college_name,city=excluded.city,state=excluded.state,
    category=excluded.category,
    admission_probability_range=excluded.admission_probability_range,overall_fit_score=excluded.overall_fit_score,
    academic_fit_score=excluded.academic_fit_score,major_fit_score=excluded.major_fit_score,
    career_fit_score=excluded.career_fit_score,financial_fit_score=excluded.financial_fit_score,
    admission_rate=excluded.admission_rate,estimated_net_cost=excluded.estimated_net_cost,
    application_round=excluded.application_round,status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at,
    selection_contexts_json=excluded.selection_contexts_json,
    primary_major=excluded.primary_major,secondary_major=excluded.secondary_major,
    double_major_label=excluded.double_major_label,double_major_status=excluded.double_major_status,
    double_major_verification_status=excluded.double_major_verification_status,double_major_notes=excluded.double_major_notes,
    double_major_pathways_json=excluded.double_major_pathways_json,selected_at=excluded.selected_at,
    import_batch_id=excluded.import_batch_id,original_uploaded_name=excluded.original_uploaded_name,
    matched_official_name=excluded.matched_official_name,match_confidence=excluded.match_confidence,
    profile_score_at_import=excluded.profile_score_at_import,admission_category_at_import=excluded.admission_category_at_import`);

// Shared "add or merge a college into My List" logic -- used by the normal
// single-college save (PUT /:id/list/:collegeId below) AND by Import College
// List's confirm step (routes/collegeImport.js), so both paths behave
// IDENTICALLY: same merge-not-duplicate rule, same accumulated selection
// contexts, same double-major pathway handling. Only ONE place decides how a
// college gets added to My List.
export function upsertListItem(studentId, collegeId, b) {
  const ts = Date.now();
  const existing = db.prepare("SELECT * FROM student_college_list WHERE student_id=? AND college_id=?")
    .get(studentId, collegeId);

  const context = b.context || null; // e.g. "Selected from Double Major Search", "Added from Imported List"
  const selectionContextsJson = mergeSelectionContexts(existing?.selection_contexts_json, context);

  const hasDoubleMajorInfo = !!(b.primaryMajor && b.secondaryMajor);
  let pathwaysJson = existing?.double_major_pathways_json || null;
  if (hasDoubleMajorInfo) {
    pathwaysJson = mergeDoubleMajorPathway(existing?.double_major_pathways_json, {
      primaryMajor: b.primaryMajor, secondaryMajor: b.secondaryMajor,
      label: b.doubleMajorLabel || `${b.primaryMajor} + ${b.secondaryMajor}`,
      status: b.doubleMajorStatus || "Needs official verification",
      verificationStatus: b.doubleMajorVerificationStatus || "Needs manual verification",
      notes: b.doubleMajorNotes || null,
      addedAt: ts,
    });
  }

  // Import fields are additive and only ever set on the row that actually
  // came from an import (first import wins for original/matched name+batch,
  // same "preserve what's already there" rule the double-major fields use) --
  // a college saved from Matches and LATER also found in an import keeps its
  // original source_context but still gains "Added from Imported List" in
  // selection_contexts_json and the import metadata, satisfying "Also found
  // in imported list" without overwriting how it was first added.
  const isImport = !!b.importBatchId;

  upsertList.run({
    student_id: studentId, college_id: collegeId,
    college_name: b.name ?? b.college_name ?? null, city: b.city ?? null, state: b.state ?? null,
    category: b.category ?? null, admission_probability_range: b.range ?? null,
    overall_fit_score: b.overall ?? null, academic_fit_score: b.academic ?? null,
    major_fit_score: b.major ?? null, career_fit_score: b.career ?? null,
    financial_fit_score: b.financial ?? null,
    // Raw official admission rate + this student's estimated net cost --
    // same values scoreCollege() already computes, just persisted here too so
    // My List cards can show Fit/Admit/Est. cost/Major fit without a live
    // re-fetch. Preserves whatever was already on the row when a caller
    // doesn't have fresh values to offer (e.g. a plain status/notes edit),
    // rather than blanking out a previously-evaluated card.
    admission_rate: b.admissionRate !== undefined ? b.admissionRate : (existing?.admission_rate ?? null),
    estimated_net_cost: b.netCost !== undefined ? b.netCost : (existing?.estimated_net_cost ?? null),
    application_round: b.round ?? null,
    status: b.status ?? existing?.status ?? "Considering", notes: b.notes ?? existing?.notes ?? null,
    created_at: existing?.created_at ?? ts, updated_at: ts,
    selection_contexts_json: selectionContextsJson,
    source_context: existing?.source_context || context || "Selected manually",
    // Flat fields mirror the most-recently-added double-major pathway (simple
    // display + CSV); the full set of pathways lives in double_major_pathways_json.
    primary_major: hasDoubleMajorInfo ? b.primaryMajor : (existing?.primary_major ?? null),
    secondary_major: hasDoubleMajorInfo ? b.secondaryMajor : (existing?.secondary_major ?? null),
    double_major_label: hasDoubleMajorInfo ? (b.doubleMajorLabel || `${b.primaryMajor} + ${b.secondaryMajor}`) : (existing?.double_major_label ?? null),
    double_major_status: hasDoubleMajorInfo ? (b.doubleMajorStatus || "Needs official verification") : (existing?.double_major_status ?? null),
    double_major_verification_status: hasDoubleMajorInfo ? (b.doubleMajorVerificationStatus || "Needs manual verification") : (existing?.double_major_verification_status ?? null),
    double_major_notes: hasDoubleMajorInfo ? (b.doubleMajorNotes ?? existing?.double_major_notes ?? null) : (existing?.double_major_notes ?? null),
    double_major_pathways_json: pathwaysJson,
    selected_at: existing?.selected_at ?? ts,
    import_batch_id: isImport ? b.importBatchId : (existing?.import_batch_id ?? null),
    original_uploaded_name: isImport ? (b.originalUploadedName ?? null) : (existing?.original_uploaded_name ?? null),
    matched_official_name: isImport ? (b.matchedOfficialName ?? null) : (existing?.matched_official_name ?? null),
    match_confidence: isImport ? (b.matchConfidence ?? null) : (existing?.match_confidence ?? null),
    profile_score_at_import: isImport ? (b.profileScoreAtImport ?? null) : (existing?.profile_score_at_import ?? null),
    admission_category_at_import: isImport ? (b.admissionCategoryAtImport ?? null) : (existing?.admission_category_at_import ?? null),
  });
  return db.prepare("SELECT * FROM student_college_list WHERE student_id=? AND college_id=?").get(studentId, collegeId);
}

// ---------- Scholarships (manual tracker) ----------
const scholCols = ["name","provider","amount","renewable","eligibility","deadline","essays",
  "recommendations","gpa_requirement","major_requirement","residency","citizenship","link","status","notes"];

studentRouter.get("/:id/scholarships", (req, res) => {
  const rows = db.prepare("SELECT * FROM scholarships WHERE student_id=? ORDER BY deadline IS NULL, deadline ASC").all(req.params.id);
  res.json({ scholarships: rows });
});

studentRouter.put("/:id/scholarships/:sid", (req, res) => {
  const b = req.body || {};
  const now = Date.now();
  const existing = db.prepare("SELECT scholarship_id FROM scholarships WHERE scholarship_id=?").get(req.params.sid);
  const vals = {};
  scholCols.forEach((c) => { vals[c] = b[c] ?? null; });
  if (existing) {
    const set = scholCols.map((c) => `${c}=@${c}`).join(",");
    db.prepare(`UPDATE scholarships SET ${set}, updated_at=@updated_at WHERE scholarship_id=@scholarship_id`)
      .run({ ...vals, updated_at: now, scholarship_id: req.params.sid });
  } else {
    const cols = ["scholarship_id","student_id",...scholCols,"created_at","updated_at"];
    const placeholders = cols.map((c) => `@${c}`).join(",");
    db.prepare(`INSERT INTO scholarships (${cols.join(",")}) VALUES (${placeholders})`)
      .run({ scholarship_id: req.params.sid, student_id: req.params.id, ...vals, created_at: now, updated_at: now });
  }
  res.json({ ok: true });
});

studentRouter.delete("/:id/scholarships/:sid", (req, res) => {
  db.prepare("DELETE FROM scholarships WHERE student_id=? AND scholarship_id=?").run(req.params.id, req.params.sid);
  res.json({ ok: true });
});

// CSV export -- same pattern as Programs/Decision Plan/Essay Center/
// Application Timeline, so the Scholarship Tracker isn't the one list in the
// app a family can't take with them.
function scholCsvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
studentRouter.get("/:id/scholarships/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM scholarships WHERE student_id=? ORDER BY deadline IS NULL, deadline ASC").all(req.params.id);
  const headers = ["Name", "Provider", "Amount", "Deadline", "Renewable", "Status", "GPA requirement",
    "Major requirement", "Residency", "Citizenship", "Required essays", "Required recommendations",
    "Eligibility/notes", "Link", "Notes"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.provider, r.amount, r.deadline, r.renewable, r.status, r.gpa_requirement,
      r.major_requirement, r.residency, r.citizenship, r.essays, r.recommendations,
      r.eligibility, r.link, r.notes,
    ].map(scholCsvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="scholarship-tracker.csv"');
  res.send(lines.join("\n"));
});

// ---------- Financial aid planner (per saved college) ----------
// Combines verified CSS/FAFSA info (seeded colleges) with official net price.
studentRouter.post("/:id/aid-plan", (req, res) => {
  const profile = req.body?.profile || {};
  const rows = db.prepare("SELECT * FROM student_college_list WHERE student_id=?").all(req.params.id);
  const items = rows.map((r) => {
    const v = getVerified(r.college_id);
    return {
      collegeId: r.college_id,
      name: r.college_name || r.college_id,
      // Net price itself is shown on the College Detail page (it needs the
      // student's budget/in-state status to compute); this planner surfaces
      // the aid FORMS each college requires, not a duplicate cost figure.
      cssProfile: v?.available ? (v.cssProfileRequired || "Check college") : "Check college",
      fafsa: "Required for federal aid (all colleges)",
      deadlines: v?.available ? v.applicationDeadlines : null,
      source: v?.available ? "verified" : "unavailable",
    };
  });
  res.json({
    items,
    general: {
      fafsa: "File the FAFSA (studentaid.gov) as early as October of senior year - it's required for all federal aid and most institutional aid.",
      css: "Some private colleges also require the CSS Profile (cssprofile.collegeboard.org) for institutional aid. Check each college.",
      sai: "Your Student Aid Index (SAI) from the FAFSA estimates what federal formulas expect your family to contribute. Net price calculators on each college's site give a school-specific estimate.",
      loans: "Borrow federal (Direct Subsidized/Unsubsidized) before private loans. Keep total borrowing under your expected first-year salary as a rule of thumb.",
      appeal: "If admitted with a gap between aid and cost, you can submit a financial-aid appeal to the college's aid office - especially with a competing offer or a change in circumstances.",
    },
    disclaimer: "General guidance plus verified form requirements for seeded colleges. Confirm every deadline and requirement with each college's financial-aid office.",
  });
});

studentRouter.get("/:id/list", (req, res) => {
  const rows = db.prepare("SELECT * FROM student_college_list WHERE student_id = ?").all(req.params.id);
  res.json({ list: rows });
});

// POST /api/students/:id/list/evaluate { profile } -- "Evaluate Against My
// Profile" (Issue 2). Re-scores every college already on My List against the
// CURRENT profile, using the exact same scoreCollege()/classify() every other
// save flow uses -- no new formula, no new admissions-category logic. Only
// the score-derived columns are touched (category, range, overall/academic/
// career/financial fit, updated_at); everything else on the row -- source
// context(s), imported-list provenance, double-major pathway/verification
// status, decision status, notes -- is left exactly as it was. Matching
// Decision Plan items get their admission_category refreshed too (mirroring
// what already happens when a college is first added from My List), but
// their family-entered decision_status, notes, major_risk, cost_risk,
// program_verification_status, and action_needed are left untouched --
// there is no existing formula that derives those from scoreCollege() alone,
// and inventing one here would be new classification logic this app doesn't do.
const updateListScoreStmt = db.prepare(`
  UPDATE student_college_list
  SET category=@category, admission_probability_range=@range, overall_fit_score=@overall,
      academic_fit_score=@academic, career_fit_score=@career, financial_fit_score=@financial,
      major_fit_score=@major, admission_rate=@admission_rate, estimated_net_cost=@estimated_net_cost,
      updated_at=@updated_at
  WHERE student_id=@student_id AND college_id=@college_id
`);
const updatePlanCategoryStmt = db.prepare(
  "UPDATE decision_plan_items SET admission_category=@category, updated_at=@updated_at WHERE student_id=@student_id AND college_id=@college_id"
);

studentRouter.post("/:id/list/evaluate", async (req, res) => {
  const studentId = req.params.id;
  const profile = req.body?.profile || {};
  const rows = db.prepare("SELECT * FROM student_college_list WHERE student_id=?").all(studentId);
  if (!rows.length) return res.json({ updated: 0, needsReview: 0, missingAdmissions: 0, missingCost: 0, programVerificationNeeded: 0, list: [] });

  const scoringProfile = importScoringProfile(profile);
  const planItems = db.prepare("SELECT college_id, program_verification_status FROM decision_plan_items WHERE student_id=?").all(studentId);
  const planByCollege = new Map(planItems.map((p) => [p.college_id, p]));

  let updated = 0, needsReview = 0, missingAdmissions = 0, missingCost = 0, programVerificationNeeded = 0;
  const now = Date.now();

  for (const row of rows) {
    let college = null;
    try {
      const found = await getCollegeById(row.college_id);
      college = found?.college || null;
    } catch { college = null; }

    if (!college) {
      // Can't re-check this college right now (removed from Scorecard, or a
      // live-lookup failure) -- leave its existing score/category untouched
      // rather than guessing, and flag it for the family to look at.
      needsReview++;
      const plan = planByCollege.get(row.college_id);
      if (plan && !["Official source verified", "User verified"].includes(plan.program_verification_status)) programVerificationNeeded++;
      continue;
    }

    const scored = scoreCollege(scoringProfile, college);
    const category = scored?.admission?.category || null;
    updateListScoreStmt.run({
      student_id: studentId, college_id: row.college_id,
      category, range: scored?.admission?.range || null, overall: scored?.overall ?? null,
      academic: scored?.subs?.academic ?? null, career: scored?.subs?.career ?? null, financial: scored?.subs?.financial ?? null,
      major: scored?.subs?.major ?? null,
      admission_rate: college.admissionRate ?? null, estimated_net_cost: scored?.netCost ?? null,
      updated_at: now,
    });
    if (planByCollege.has(row.college_id)) {
      updatePlanCategoryStmt.run({ student_id: studentId, college_id: row.college_id, category, updated_at: now });
    }
    updated++;
    if (!category || category === "Insufficient Data") missingAdmissions++;
    if (college.averageNetPrice == null && college.tuitionInState == null) missingCost++;
    const plan = planByCollege.get(row.college_id);
    if (plan && !["Official source verified", "User verified"].includes(plan.program_verification_status)) programVerificationNeeded++;
  }

  const list = db.prepare("SELECT * FROM student_college_list WHERE student_id=?").all(studentId);
  res.json({ updated, needsReview, missingAdmissions, missingCost, programVerificationNeeded, list });
});

// GET /api/students/:id/strategy  -> application strategy from saved list
studentRouter.post("/:id/strategy", (req, res) => {
  const rows = db.prepare("SELECT * FROM student_college_list WHERE student_id = ?").all(req.params.id);
  const profile = req.body?.profile || {};
  res.json(buildStrategy(rows, profile));
});

// Adding a college that's ALREADY on the list (e.g. from a different search
// page) merges into the existing row instead of creating a duplicate card:
// selection_contexts accumulates every place it's been selected from, and a
// double-major pathway (primary+secondary) is added to/updated within the
// existing pathway list rather than overwriting a previous pairing.
studentRouter.put("/:id/list/:collegeId", (req, res) => {
  const item = upsertListItem(req.params.id, req.params.collegeId, req.body || {});
  res.json({ ok: true, item });
});

studentRouter.delete("/:id/list/:collegeId", (req, res) => {
  db.prepare("DELETE FROM student_college_list WHERE student_id=? AND college_id=?")
    .run(req.params.id, req.params.collegeId);
  res.json({ ok: true });
});

// ---------- Double-major OFFICIAL verification records ----------
// The one place a double-major pairing can move from "Scorecard suggests both
// fields exist" to "an official college source confirms the policy." See
// services/doubleMajorVerification.js for the field list and the single
// isConfirmedDoubleMajor() gate every caller (My List badges, Decision Plan,
// Verification Center) relies on -- nothing here decides "confirmed" on its
// own.
studentRouter.get("/:id/double-major-verifications", (req, res) => {
  const collegeId = req.query.collegeId || null;
  const rows = listDoubleMajorVerifications(req.params.id, collegeId)
    .map((v) => ({ ...v, confirmed: isConfirmedDoubleMajor(v) }));
  res.json({ verifications: rows });
});

studentRouter.post("/:id/double-major-verifications", (req, res) => {
  const rec = createDoubleMajorVerification(req.params.id, req.body || {});
  res.json({ verification: { ...rec, confirmed: isConfirmedDoubleMajor(rec) } });
});

studentRouter.put("/:id/double-major-verifications/:verificationId", (req, res) => {
  const rec = updateDoubleMajorVerification(req.params.id, req.params.verificationId, req.body || {});
  if (!rec) return res.status(404).json({ error: "not_found" });
  res.json({ verification: { ...rec, confirmed: isConfirmedDoubleMajor(rec) } });
});

studentRouter.delete("/:id/double-major-verifications/:verificationId", (req, res) => {
  deleteDoubleMajorVerification(req.params.id, req.params.verificationId);
  res.json({ ok: true });
});

// ---------- Search/results persistence (Issue 1) ----------
// One JSON "state" blob per (student, page_key). The client fully owns the
// shape of state -- these routes just store/return it, isolated by Firebase
// UID via the studentRouter.param("id", ...) override above (same guarantee
// every other student-scoped route in this file relies on). Nothing here
// reads or interprets search results, so it can never go stale relative to
// what a page actually needs, and it can never leak into scoring/matching --
// it is purely "what was on screen last."
const upsertSearchState = db.prepare(`
  INSERT INTO saved_search_sessions (id, student_id, page_key, state_json, created_at, updated_at, last_viewed_at)
  VALUES (@id, @student_id, @page_key, @state_json, @now, @now, @now)
  ON CONFLICT(student_id, page_key) DO UPDATE SET
    state_json = excluded.state_json, updated_at = excluded.updated_at, last_viewed_at = excluded.last_viewed_at
`);
const getSearchStateStmt = db.prepare("SELECT * FROM saved_search_sessions WHERE student_id=? AND page_key=?");
const deleteSearchStateStmt = db.prepare("DELETE FROM saved_search_sessions WHERE student_id=? AND page_key=?");

studentRouter.get("/:id/search-state/:pageKey", (req, res) => {
  const row = getSearchStateStmt.get(req.params.id, req.params.pageKey);
  if (!row) return res.json({ state: null, updatedAt: null });
  let state = null;
  try { state = JSON.parse(row.state_json); } catch { state = null; }
  res.json({ state, updatedAt: row.updated_at });
});

studentRouter.put("/:id/search-state/:pageKey", (req, res) => {
  const state = (req.body && Object.prototype.hasOwnProperty.call(req.body, "state")) ? req.body.state : null;
  const now = Date.now();
  upsertSearchState.run({
    id: `sss_${req.params.id}_${req.params.pageKey}`, // deterministic -- one row per (student, page)
    student_id: req.params.id, page_key: req.params.pageKey,
    state_json: JSON.stringify(state ?? null), now,
  });
  res.json({ ok: true });
});

studentRouter.delete("/:id/search-state/:pageKey", (req, res) => {
  deleteSearchStateStmt.run(req.params.id, req.params.pageKey);
  res.json({ ok: true });
});

// ---------- Import College List ----------
// A family pastes or uploads a list of college names; the app matches each
// one to an official College Scorecard record, shows a review screen (never
// auto-adds anything below High confidence), and only writes to My List once
// the family confirms. See services/collegeMatcher.js (matching + confidence)
// and services/collegeImportParse.js (paste/CSV/text -> name list). Nothing
// here is a separate matching/scoring formula -- college scoring reuses the
// exact same scoreCollege() used by every other page.
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/students/:id/import/parse -- multipart file (CSV/txt) OR JSON { text }.
studentRouter.post("/:id/import/parse", importUpload.single("file"), (req, res) => {
  try {
    let names;
    if (req.file) {
      names = parseImportInput({ text: req.file.buffer.toString("utf8"), filename: req.file.originalname, mimetype: req.file.mimetype });
    } else {
      names = parseImportInput({ text: (req.body && req.body.text) || "" });
    }
    if (!names.length) {
      return res.status(400).json({ error: "bad_request", message: "Couldn't find any college names in that list. Check the file or pasted text and try again." });
    }
    res.json({ names, count: names.length });
  } catch (err) {
    res.status(400).json({ error: "bad_request", message: "Couldn't read that file. Try pasting the list instead.", detail: err.message });
  }
});

// Same canonical Profile matching-interest list used by /api/colleges routes
// (primary major + second major + interests, deduped) -- duplicated here in
// one small function rather than importing from routes/colleges.js, to avoid
// a route-to-route dependency. Not a new formula: scoreCollege() itself is
// unchanged, this only shapes the `interests` array fed into it, exactly like
// scoringProfileFor() in colleges.js does.
function importScoringProfile(profile) {
  const interests = [profile.primaryMajor, profile.secondaryMajor, ...(profile.interests || [])]
    .filter(Boolean).map((x) => String(x).trim()).filter(Boolean)
    .filter((x, i, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  return { ...profile, interests };
}

// Score one matched college_id against the family's profile, for the review
// screen's "Suggested Reach/Target/Safety category" column -- the EXACT same
// scoreCollege() used everywhere else in the app, never a new formula. Never
// throws: a scoring failure just means the review row shows no suggested
// category yet (honest "needs review" rather than a fake one).
async function suggestedCategoryFor(collegeId, scoringProfile) {
  if (!collegeId) return null;
  try {
    const found = await getCollegeById(collegeId);
    if (!found?.college) return null;
    const scored = scoreCollege(scoringProfile, found.college);
    return { category: scored.admission?.category || "Insufficient Data", range: scored.admission?.range || null, overall: scored.overall ?? null };
  } catch { return null; }
}

// POST /api/students/:id/import/match  { names: [...], state?, profile? } ->
// per-name match results with confidence, for the review screen. Never
// writes to the database -- matching is read-only until the family confirms.
// When `profile` is supplied, each matched college_id (including ambiguous/
// low-confidence OPTIONS) also gets a suggested admission category so the
// review table can show it before anything is added.
studentRouter.post("/:id/import/match", async (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.slice(0, 200) : [];
  if (!names.length) return res.status(400).json({ error: "bad_request", message: "No college names to match." });
  const state = req.body?.state || null;
  const profile = req.body?.profile || null;
  const results = await matchNames(names, { state });

  if (profile) {
    const scoringProfile = importScoringProfile(profile);
    for (const r of results) {
      if (!r) continue;
      if (r.collegeId) r.suggested = await suggestedCategoryFor(r.collegeId, scoringProfile);
      if (Array.isArray(r.options)) {
        for (const opt of r.options) opt.suggested = await suggestedCategoryFor(opt.collegeId, scoringProfile);
      }
    }
  }

  const batchId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  res.json({ batchId, results });
});

// POST /api/students/:id/import/confirm
//   { profile, batchId, rows: [{ originalName, action: "add"|"skip"|"needs_review",
//     collegeId, officialName, matchConfidence, corrected }] }
// Only "add" rows are written. Every row (including skipped/needs-review) is
// echoed back in `results` so the client can render the full import summary
// (added / already in list / corrected and added / needs review / skipped /
// not found) without having to remember client-side state.
studentRouter.post("/:id/import/confirm", async (req, res) => {
  const b = req.body || {};
  const profile = b.profile || {};
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const batchId = b.batchId || `imp_${Date.now()}`;
  const scoringProfile = importScoringProfile(profile);

  const results = [];
  const summary = { added: 0, alreadyInList: 0, correctedAndAdded: 0, needsReview: 0, skipped: 0, notFound: 0 };

  for (const row of rows) {
    const originalName = row.originalName || "";
    if (row.action === "skip") {
      summary.skipped++;
      results.push({ originalName, matchedName: row.officialName || null, result: "Skipped", reason: "You chose not to add this college.", nextAction: null });
      continue;
    }
    if (row.action === "not_found") {
      summary.notFound++;
      results.push({ originalName, matchedName: null, result: "Not found", reason: "No official college record matched this name.", nextAction: "Search manually or check the spelling." });
      continue;
    }
    if (row.action === "needs_review" || !row.collegeId) {
      summary.needsReview++;
      results.push({ originalName, matchedName: row.officialName || null, result: "Needs review",
        reason: row.reason || "This match needs a closer look before adding.",
        nextAction: "Choose the correct college, or search manually." });
      continue;
    }

    // action === "add"
    const existing = db.prepare("SELECT * FROM student_college_list WHERE student_id=? AND college_id=?").get(req.params.id, row.collegeId);
    let scored = null, official = null;
    try {
      const found = await getCollegeById(row.collegeId);
      official = found?.college || null;
      if (official) scored = scoreCollege(scoringProfile, official);
    } catch { /* degrade to unscored add below -- never block the add on a scoring failure */ }

    upsertListItem(req.params.id, row.collegeId, {
      name: official?.name || row.officialName, city: official?.city || null, state: official?.state || null,
      category: scored?.admission?.category || null, range: scored?.admission?.range || null,
      overall: scored?.overall ?? null, academic: scored?.subs?.academic ?? null,
      career: scored?.subs?.career ?? null, financial: scored?.subs?.financial ?? null,
      major: scored?.subs?.major ?? null,
      admissionRate: official?.admissionRate ?? null, netCost: scored?.netCost ?? null,
      context: "Added from Imported List",
      importBatchId: batchId,
      originalUploadedName: originalName,
      matchedOfficialName: official?.name || row.officialName || null,
      matchConfidence: row.matchConfidence || null,
      profileScoreAtImport: scored?.overall ?? null,
      admissionCategoryAtImport: scored?.admission?.category || (official ? "Insufficient Data" : null),
    });

    if (existing) {
      summary.alreadyInList++;
      results.push({ originalName, matchedName: official?.name || row.officialName, result: "Already in My List",
        reason: "This college was already on your list -- we added \"Added from Imported List\" to it instead of creating a duplicate.", nextAction: null });
    } else if (row.corrected) {
      summary.correctedAndAdded++;
      results.push({ originalName, matchedName: official?.name || row.officialName, result: "Corrected and added",
        reason: `We corrected the spelling/short name to "${official?.name || row.officialName}".`, nextAction: null });
    } else {
      summary.added++;
      results.push({ originalName, matchedName: official?.name || row.officialName, result: "Added", reason: null, nextAction: null });
    }
  }

  res.json({ batchId, summary, results });
});

// application tracker
const trackCols = ["college_name","application_round","application_deadline","scholarship_deadline","fafsa_deadline",
  "css_deadline","transcript_status","recommendation_status","essay_status","supplement_status",
  "interview_status","portfolio_status","submitted_status","decision_status","financial_aid_received",
  "final_net_cost","status","student_notes","parent_notes"];

const upsertTrack = db.prepare(`
  INSERT INTO application_tracker (student_id,college_id,${trackCols.join(",")},updated_at)
  VALUES (@student_id,@college_id,${trackCols.map(c=>"@"+c).join(",")},@updated_at)
  ON CONFLICT(student_id,college_id) DO UPDATE SET ${trackCols.map(c=>`${c}=excluded.${c}`).join(",")},updated_at=excluded.updated_at`);

studentRouter.get("/:id/tracker", (req, res) => {
  const rows = db.prepare("SELECT * FROM application_tracker WHERE student_id = ?").all(req.params.id);
  res.json({ tracker: rows });
});

studentRouter.put("/:id/tracker/:collegeId", (req, res) => {
  const b = req.body || {};
  const row = { student_id: req.params.id, college_id: req.params.collegeId, updated_at: Date.now() };
  for (const c of trackCols) row[c] = b[c] ?? null;
  upsertTrack.run(row);
  res.json({ ok: true });
});

// ---------- Advisor (grounded; Gemini-powered when a key is set) ----------
export const advisorRouter = express.Router();

// Answers using ONLY the passed data (scored recs + profile) plus the
// signed-in student's own saved-college essay data (tracked prompts +
// officially-published sample-essay links) -- read from req.user.uid, never
// trusted from the client, same as every other per-student route. Uses
// Gemini when configured (with guardrails), otherwise a deterministic
// keyword fallback.
advisorRouter.post("/ask", async (req, res) => {
  const { question = "", profile = {}, recommendations = [] } = req.body || {};
  try {
    const essayContext = buildEssayGrounding(req.user?.uid);
    const out = await answerAdvisor({ question, profile, recommendations, essayContext });
    res.json(out);
  } catch (err) {
    res.status(500).json({ answer: "Sorry - I couldn't answer that just now. Try again.", disclaimer: "Planning aid only.", detail: err.message });
  }
});
