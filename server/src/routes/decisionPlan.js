// routes/decisionPlan.js - the "Decision Plan" tab API: final application list
// builder, program verification checklist, major-specific admission risk, cost
// risk, strategy notes, course/prep plan, timeline/tasks, and CSV export.
// Mounted behind requireAuth; router.param("id") forces every request onto the
// authenticated Firebase UID, identical to the existing studentRouter/
// programsRouter pattern - no user can read or write another family's plan.
import express from "express";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import {
  generateStrategyNotes, needsMajorRiskCaution, MAJOR_RISK_WARNING,
  ADMISSION_BASIS_OPTIONS, MAJOR_RISK_OPTIONS, COST_RISK_OPTIONS,
  ADMISSION_CATEGORY_OPTIONS, DECISION_STATUS_OPTIONS, APPLICATION_ROUND_OPTIONS,
  buildFinalListGuidance,
} from "../services/decisionSupport.js";
import { DEADLINE_EVENT_TYPES } from "../services/applicationTimeline.js";
import { buildDecisionPlanEssayStatus } from "../services/essayCenter.js";
import { buildVerificationCenter } from "../services/verificationCenter.js";

export const decisionPlanRouter = express.Router();

decisionPlanRouter.param("id", (req, _res, next) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});

const newId = (p) => `${p}_${crypto.randomUUID()}`;
const now = () => Date.now();

decisionPlanRouter.get("/:id/options", (_req, res) => {
  res.json({
    admissionBasis: ADMISSION_BASIS_OPTIONS, majorRisk: MAJOR_RISK_OPTIONS, costRisk: COST_RISK_OPTIONS,
    admissionCategory: ADMISSION_CATEGORY_OPTIONS, decisionStatus: DECISION_STATUS_OPTIONS, applicationRound: APPLICATION_ROUND_OPTIONS,
    majorRiskWarning: MAJOR_RISK_WARNING,
  });
});

// ---------------- Final Application List Builder ----------------
decisionPlanRouter.get("/:id/items", (req, res) => {
  const rows = db.prepare("SELECT * FROM decision_plan_items WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json({ items: rows });
});

decisionPlanRouter.post("/:id/items", (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  const ts = now();
  const itemId = newId("item");
  db.prepare(`
    INSERT INTO decision_plan_items (item_id, student_id, college_id, college_name, program_id, program_name,
      special_programs_json, career_track, admission_category, program_verification_status, admission_basis,
      major_risk, cost_risk, application_round, decision_status, action_needed, sticker_price, average_net_price,
      income_band_net_price, merit_aid_possibility, need_based_aid_strength, net_price_calculator_url,
      npc_completed, estimated_family_cost, financial_safety, notes, created_at, updated_at,
      primary_major, secondary_major, double_major_status, double_major_verification_status, double_major_notes, source_context,
      import_batch_id, original_uploaded_name, matched_official_name, match_confidence,
      profile_score_at_import, admission_category_at_import)
    VALUES (@item_id, @student_id, @college_id, @college_name, @program_id, @program_name,
      @special_programs_json, @career_track, @admission_category, @program_verification_status, @admission_basis,
      @major_risk, @cost_risk, @application_round, @decision_status, @action_needed, @sticker_price, @average_net_price,
      @income_band_net_price, @merit_aid_possibility, @need_based_aid_strength, @net_price_calculator_url,
      @npc_completed, @estimated_family_cost, @financial_safety, @notes, @created_at, @updated_at,
      @primary_major, @secondary_major, @double_major_status, @double_major_verification_status, @double_major_notes, @source_context,
      @import_batch_id, @original_uploaded_name, @matched_official_name, @match_confidence,
      @profile_score_at_import, @admission_category_at_import)
  `).run({
    item_id: itemId, student_id: req.params.id, college_id: b.collegeId || null, college_name: b.collegeName || null,
    program_id: b.programId || null, program_name: b.programName || null,
    special_programs_json: JSON.stringify(b.specialPrograms || []), career_track: b.careerTrack || null,
    admission_category: b.admissionCategory || null, program_verification_status: b.programVerificationStatus || "Needs manual verification",
    admission_basis: b.admissionBasis || "Unknown", major_risk: b.majorRisk || "Unknown", cost_risk: b.costRisk || "Unknown",
    application_round: b.applicationRound || null, decision_status: b.decisionStatus || "Keep", action_needed: b.actionNeeded || null,
    sticker_price: b.stickerPrice ?? null, average_net_price: b.averageNetPrice ?? null, income_band_net_price: b.incomeBandNetPrice ?? null,
    merit_aid_possibility: b.meritAidPossibility || null, need_based_aid_strength: b.needBasedAidStrength || null,
    net_price_calculator_url: b.netPriceCalculatorUrl || null, npc_completed: b.npcCompleted ? 1 : 0,
    estimated_family_cost: b.estimatedFamilyCost ?? null, financial_safety: b.financialSafety ? 1 : 0,
    notes: b.notes || null, created_at: ts, updated_at: ts,
    primary_major: b.primaryMajor || null, secondary_major: b.secondaryMajor || null,
    double_major_status: b.doubleMajorStatus || null, double_major_verification_status: b.doubleMajorVerificationStatus || null,
    double_major_notes: b.doubleMajorNotes || null, source_context: b.sourceContext || null,
    import_batch_id: b.importBatchId || null, original_uploaded_name: b.originalUploadedName || null,
    matched_official_name: b.matchedOfficialName || null, match_confidence: b.matchConfidence || null,
    profile_score_at_import: b.profileScoreAtImport ?? null, admission_category_at_import: b.admissionCategoryAtImport || null,
  });
  // Auto-create an empty verification checklist so the family always has one to fill in.
  db.prepare(`
    INSERT INTO verification_checklists (checklist_id, student_id, item_id, college_id, program_id, updated_at)
    VALUES (@checklist_id, @student_id, @item_id, @college_id, @program_id, @updated_at)
  `).run({ checklist_id: newId("chk"), student_id: req.params.id, item_id: itemId, college_id: b.collegeId || null, program_id: b.programId || null, updated_at: ts });

  const item = db.prepare("SELECT * FROM decision_plan_items WHERE item_id=?").get(itemId);
  res.json({ item, cautionWarning: needsMajorRiskCaution(`${b.programName || ""} ${b.careerTrack || ""}`) ? MAJOR_RISK_WARNING : null });
});

const ITEM_FIELD_MAP = {
  collegeId: "college_id", collegeName: "college_name", programId: "program_id", programName: "program_name",
  careerTrack: "career_track", admissionCategory: "admission_category", programVerificationStatus: "program_verification_status",
  admissionBasis: "admission_basis", majorRisk: "major_risk", costRisk: "cost_risk", applicationRound: "application_round",
  decisionStatus: "decision_status", actionNeeded: "action_needed", stickerPrice: "sticker_price",
  averageNetPrice: "average_net_price", incomeBandNetPrice: "income_band_net_price", meritAidPossibility: "merit_aid_possibility",
  needBasedAidStrength: "need_based_aid_strength", netPriceCalculatorUrl: "net_price_calculator_url",
  estimatedFamilyCost: "estimated_family_cost", notes: "notes",
  primaryMajor: "primary_major", secondaryMajor: "secondary_major", doubleMajorStatus: "double_major_status",
  doubleMajorVerificationStatus: "double_major_verification_status", doubleMajorNotes: "double_major_notes",
  sourceContext: "source_context",
  importBatchId: "import_batch_id", originalUploadedName: "original_uploaded_name",
  matchedOfficialName: "matched_official_name", matchConfidence: "match_confidence",
  profileScoreAtImport: "profile_score_at_import", admissionCategoryAtImport: "admission_category_at_import",
};
const BOOL_FIELDS = { npcCompleted: "npc_completed", financialSafety: "financial_safety" };
const JSON_FIELDS = { specialPrograms: "special_programs_json" };

decisionPlanRouter.put("/:id/items/:itemId", (req, res) => {
  const row = db.prepare("SELECT * FROM decision_plan_items WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  if (b.majorRisk && !MAJOR_RISK_OPTIONS.includes(b.majorRisk)) return res.status(400).json({ error: "bad_request", message: "invalid majorRisk" });
  if (b.costRisk && !COST_RISK_OPTIONS.includes(b.costRisk)) return res.status(400).json({ error: "bad_request", message: "invalid costRisk" });
  if (b.decisionStatus && !DECISION_STATUS_OPTIONS.includes(b.decisionStatus)) return res.status(400).json({ error: "bad_request", message: "invalid decisionStatus" });

  const updates = {};
  for (const [camel, snake] of Object.entries(ITEM_FIELD_MAP)) if (b[camel] !== undefined) updates[snake] = b[camel];
  for (const [camel, snake] of Object.entries(BOOL_FIELDS)) if (b[camel] !== undefined) updates[snake] = b[camel] ? 1 : 0;
  for (const [camel, snake] of Object.entries(JSON_FIELDS)) if (b[camel] !== undefined) updates[snake] = JSON.stringify(b[camel] || []);
  updates.updated_at = now();
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE decision_plan_items SET ${set} WHERE student_id=@student_id AND item_id=@item_id`)
    .run({ ...updates, student_id: req.params.id, item_id: req.params.itemId });

  const updated = db.prepare("SELECT * FROM decision_plan_items WHERE item_id=?").get(req.params.itemId);
  const caution = updated.major_risk === "Unknown" && needsMajorRiskCaution(`${updated.program_name || ""} ${updated.career_track || ""}`);
  res.json({ item: updated, cautionWarning: caution ? MAJOR_RISK_WARNING : null });
});

decisionPlanRouter.delete("/:id/items/:itemId", (req, res) => {
  db.prepare("DELETE FROM decision_plan_items WHERE student_id=? AND item_id=?").run(req.params.id, req.params.itemId);
  db.prepare("DELETE FROM verification_checklists WHERE student_id=? AND item_id=?").run(req.params.id, req.params.itemId);
  db.prepare("DELETE FROM strategy_notes WHERE student_id=? AND item_id=?").run(req.params.id, req.params.itemId);
  res.json({ ok: true });
});

// ---------------- Program Verification Checklist ----------------
decisionPlanRouter.get("/:id/items/:itemId/checklist", (req, res) => {
  let row = db.prepare("SELECT * FROM verification_checklists WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (!row) {
    const ts = now();
    const checklistId = newId("chk");
    db.prepare(`INSERT INTO verification_checklists (checklist_id, student_id, item_id, updated_at) VALUES (?,?,?,?)`)
      .run(checklistId, req.params.id, req.params.itemId, ts);
    row = db.prepare("SELECT * FROM verification_checklists WHERE checklist_id=?").get(checklistId);
  }
  res.json({ checklist: row });
});

const CHECKLIST_BOOL = ["official_program_page_checked", "direct_admission_checked", "internal_transfer_rules_checked", "program_restrictions_checked", "deadline_checked"];
const CHECKLIST_ENUM = ["exact_major_exists", "minor_concentration_exists", "special_program_exists", "honors_research_option_exists", "ug_research_lab_available"];
const CHECKLIST_TEXT = ["notes", "source_url", "last_checked_date", "verification_status"];

decisionPlanRouter.put("/:id/items/:itemId/checklist", (req, res) => {
  const b = req.body || {};
  const camelToSnake = {
    officialProgramPageChecked: "official_program_page_checked", exactMajorExists: "exact_major_exists",
    minorConcentrationExists: "minor_concentration_exists", specialProgramExists: "special_program_exists",
    honorsResearchOptionExists: "honors_research_option_exists", ugResearchLabAvailable: "ug_research_lab_available",
    directAdmissionChecked: "direct_admission_checked", internalTransferRulesChecked: "internal_transfer_rules_checked",
    programRestrictionsChecked: "program_restrictions_checked", deadlineChecked: "deadline_checked",
    notes: "notes", sourceUrl: "source_url", lastCheckedDate: "last_checked_date", verificationStatus: "verification_status",
  };
  const updates = {};
  for (const [camel, snake] of Object.entries(camelToSnake)) {
    if (b[camel] === undefined) continue;
    updates[snake] = CHECKLIST_BOOL.includes(snake) ? (b[camel] ? 1 : 0) : b[camel];
  }
  updates.updated_at = now();
  const existing = db.prepare("SELECT * FROM verification_checklists WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (!existing) {
    db.prepare(`INSERT INTO verification_checklists (checklist_id, student_id, item_id, updated_at) VALUES (?,?,?,?)`)
      .run(newId("chk"), req.params.id, req.params.itemId, now());
  }
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  if (Object.keys(updates).length) {
    db.prepare(`UPDATE verification_checklists SET ${set} WHERE student_id=@student_id AND item_id=@item_id`)
      .run({ ...updates, student_id: req.params.id, item_id: req.params.itemId });
  }
  res.json({ checklist: db.prepare("SELECT * FROM verification_checklists WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId) });
});

// ---------------- Strategy Notes ----------------
decisionPlanRouter.get("/:id/items/:itemId/strategy-notes", (req, res) => {
  const row = db.prepare("SELECT * FROM strategy_notes WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  res.json({ note: row || null });
});

decisionPlanRouter.post("/:id/items/:itemId/strategy-notes/generate", (req, res) => {
  const item = db.prepare("SELECT * FROM decision_plan_items WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: "not_found" });
  const profile = req.body?.profile || {};
  const programs = item.college_id
    ? db.prepare("SELECT * FROM discovered_programs WHERE student_id=? AND college_id=?").all(req.params.id, item.college_id)
    : [];
  const checklist = db.prepare("SELECT * FROM verification_checklists WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId) || null;
  const generated = generateStrategyNotes({ item, profile, programs, checklist });

  const ts = now();
  const existing = db.prepare("SELECT note_id FROM strategy_notes WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (existing) {
    db.prepare(`UPDATE strategy_notes SET why_college=@why_college, why_program=@why_program, best_round=@best_round,
      essay_angle=@essay_angle, activities_to_emphasize=@activities_to_emphasize, risks=@risks,
      actions_before_applying=@actions_before_applying, questions_for_admissions=@questions_for_admissions,
      auto_generated=1, updated_at=@updated_at WHERE note_id=@note_id`)
      .run({
        why_college: generated.whyCollege, why_program: generated.whyProgram, best_round: generated.bestRound,
        essay_angle: generated.essayAngle, activities_to_emphasize: generated.activitiesToEmphasize, risks: generated.risks,
        actions_before_applying: generated.actionsBeforeApplying, questions_for_admissions: generated.questionsForAdmissions,
        updated_at: ts, note_id: existing.note_id,
      });
  } else {
    db.prepare(`INSERT INTO strategy_notes (note_id, student_id, item_id, college_id, why_college, why_program, best_round,
        essay_angle, activities_to_emphasize, risks, actions_before_applying, questions_for_admissions, auto_generated,
        created_at, updated_at)
      VALUES (@note_id, @student_id, @item_id, @college_id, @why_college, @why_program, @best_round, @essay_angle,
        @activities_to_emphasize, @risks, @actions_before_applying, @questions_for_admissions, 1, @created_at, @updated_at)`)
      .run({
        note_id: newId("note"), student_id: req.params.id, item_id: req.params.itemId, college_id: item.college_id || null,
        why_college: generated.whyCollege, why_program: generated.whyProgram, best_round: generated.bestRound,
        essay_angle: generated.essayAngle, activities_to_emphasize: generated.activitiesToEmphasize, risks: generated.risks,
        actions_before_applying: generated.actionsBeforeApplying, questions_for_admissions: generated.questionsForAdmissions,
        created_at: ts, updated_at: ts,
      });
  }
  res.json({ note: db.prepare("SELECT * FROM strategy_notes WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId) });
});

decisionPlanRouter.put("/:id/items/:itemId/strategy-notes", (req, res) => {
  const b = req.body || {};
  const fields = ["why_college", "why_program", "best_round", "essay_angle", "activities_to_emphasize", "risks", "actions_before_applying", "questions_for_admissions"];
  const camelMap = { whyCollege: "why_college", whyProgram: "why_program", bestRound: "best_round", essayAngle: "essay_angle", activitiesToEmphasize: "activities_to_emphasize", risks: "risks", actionsBeforeApplying: "actions_before_applying", questionsForAdmissions: "questions_for_admissions" };
  const updates = {};
  for (const [camel, snake] of Object.entries(camelMap)) if (b[camel] !== undefined) updates[snake] = b[camel];
  updates.auto_generated = 0;
  updates.updated_at = now();
  const existing = db.prepare("SELECT note_id FROM strategy_notes WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId);
  if (!existing) {
    db.prepare(`INSERT INTO strategy_notes (note_id, student_id, item_id, created_at, updated_at) VALUES (?,?,?,?,?)`)
      .run(newId("note"), req.params.id, req.params.itemId, now(), now());
  }
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE strategy_notes SET ${set} WHERE student_id=@student_id AND item_id=@item_id`)
    .run({ ...updates, student_id: req.params.id, item_id: req.params.itemId });
  res.json({ note: db.prepare("SELECT * FROM strategy_notes WHERE student_id=? AND item_id=?").get(req.params.id, req.params.itemId) });
});

// ---------------- Course & Preparation Plan (reference, not per-user) ----------------
decisionPlanRouter.get("/:id/course-plans", (_req, res) => {
  res.json({ plans: db.prepare("SELECT * FROM course_plans ORDER BY track_name").all() });
});
decisionPlanRouter.get("/:id/course-plans/:trackId", (req, res) => {
  const row = db.prepare("SELECT * FROM course_plans WHERE track_id=?").get(req.params.trackId);
  if (!row) return res.status(404).json({ error: "not_found", message: "Unknown track id. See /course-plans for the full list." });
  res.json({ plan: row });
});

// ---------------- Timeline and Tasks ----------------
decisionPlanRouter.get("/:id/tasks", (req, res) => {
  res.json({ tasks: db.prepare("SELECT * FROM application_tasks WHERE student_id=? ORDER BY (due_date IS NULL), due_date ASC").all(req.params.id) });
});

decisionPlanRouter.post("/:id/tasks", (req, res) => {
  const b = req.body || {};
  const ts = now();
  const taskId = newId("task");
  db.prepare(`INSERT INTO application_tasks (task_id, student_id, college_id, college_name, program_id, program_name,
      task_type, due_date, priority, status, notes, source_url, created_at, updated_at)
    VALUES (@task_id,@student_id,@college_id,@college_name,@program_id,@program_name,@task_type,@due_date,@priority,
      @status,@notes,@source_url,@created_at,@updated_at)`)
    .run({
      task_id: taskId, student_id: req.params.id, college_id: b.collegeId || null, college_name: b.collegeName || null,
      program_id: b.programId || null, program_name: b.programName || null, task_type: b.taskType || "program_verification",
      due_date: b.dueDate || null, priority: b.priority || "Medium", status: b.status || "To do", notes: b.notes || null,
      source_url: b.sourceUrl || null, created_at: ts, updated_at: ts,
    });
  res.json(db.prepare("SELECT * FROM application_tasks WHERE task_id=?").get(taskId));
});

decisionPlanRouter.put("/:id/tasks/:taskId", (req, res) => {
  const row = db.prepare("SELECT * FROM application_tasks WHERE student_id=? AND task_id=?").get(req.params.id, req.params.taskId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  const camelMap = { collegeId: "college_id", collegeName: "college_name", programId: "program_id", programName: "program_name", taskType: "task_type", dueDate: "due_date", priority: "priority", status: "status", notes: "notes", sourceUrl: "source_url" };
  const updates = {};
  for (const [camel, snake] of Object.entries(camelMap)) if (b[camel] !== undefined) updates[snake] = b[camel];
  updates.updated_at = now();
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE application_tasks SET ${set} WHERE student_id=@student_id AND task_id=@task_id`)
    .run({ ...updates, student_id: req.params.id, task_id: req.params.taskId });
  res.json(db.prepare("SELECT * FROM application_tasks WHERE task_id=?").get(req.params.taskId));
});

decisionPlanRouter.delete("/:id/tasks/:taskId", (req, res) => {
  db.prepare("DELETE FROM application_tasks WHERE student_id=? AND task_id=?").run(req.params.id, req.params.taskId);
  res.json({ ok: true });
});

// ---------------- Family Command Center summary ----------------
// One aggregation endpoint the Decision Plan tab (and the Journey tab) can
// call to render a top-of-page status panel without re-deriving counts
// client-side. Purely a read/aggregation of data the family already entered
// or verified elsewhere -- invents nothing new.
decisionPlanRouter.get("/:id/summary", (req, res) => {
  const sid = req.params.id;
  const items = db.prepare("SELECT * FROM decision_plan_items WHERE student_id=?").all(sid);
  const tasks = db.prepare("SELECT * FROM application_tasks WHERE student_id=?").all(sid);
  const checklists = db.prepare("SELECT * FROM verification_checklists WHERE student_id=?").all(sid);
  const checklistByItem = new Map(checklists.map((c) => [c.item_id, c]));

  const byDecisionStatus = Object.fromEntries(DECISION_STATUS_OPTIONS.map((s) => [s, 0]));
  const byAdmissionCategory = Object.fromEntries(ADMISSION_CATEGORY_OPTIONS.map((s) => [s, 0]));
  let needsVerification = 0;
  let highOrUnknownMajorRisk = 0;
  let unresolvedCostRisk = 0;
  let missingNetPriceCalc = 0;

  for (const it of items) {
    if (byDecisionStatus[it.decision_status] !== undefined) byDecisionStatus[it.decision_status]++;
    if (byAdmissionCategory[it.admission_category] !== undefined) byAdmissionCategory[it.admission_category]++;
    const checklist = checklistByItem.get(it.item_id);
    const checklistComplete = checklist && checklist.official_program_page_checked && checklist.verification_status === "Official source verified";
    if (it.program_verification_status !== "Official source verified" && it.program_verification_status !== "User verified" || !checklistComplete) needsVerification++;
    if (it.major_risk === "Unknown" || it.major_risk === "Highly competitive") highOrUnknownMajorRisk++;
    if (it.cost_risk === "Unknown" || it.cost_risk === "High") unresolvedCostRisk++;
    if (!it.npc_completed) missingNetPriceCalc++;
  }

  const now2 = Date.now();
  const in14 = now2 + 14 * 24 * 3600 * 1000;
  const overdueTasks = tasks.filter((t) => t.status !== "Done" && t.due_date && new Date(t.due_date).getTime() < now2);
  const dueSoonTasks = tasks.filter((t) => t.status !== "Done" && t.due_date && new Date(t.due_date).getTime() >= now2 && new Date(t.due_date).getTime() <= in14);
  const openTasks = tasks.filter((t) => t.status !== "Done");

  const reachTargetSafety = {
    reach: byAdmissionCategory["Reach"] + byAdmissionCategory["Dream / Lottery"],
    target: byAdmissionCategory["Target"] + byAdmissionCategory["In-state Anchor"],
    safety: byAdmissionCategory["Safety"] + byAdmissionCategory["Financial Safety"],
  };
  const balanceNotice = items.length > 0 && (reachTargetSafety.safety === 0 || reachTargetSafety.target === 0)
    ? "This list is missing at least one Target or Safety school. Consider the portfolio balance before finalizing."
    : null;

  // Final List Health Check (Feature 2): a couple more read-only counts --
  // colleges with zero essay prompts tracked, colleges with no application
  // deadline on file -- feed into buildFinalListGuidance below alongside the
  // counts already computed above. Same don't-invent-data rule: these are
  // just cross-references to essay_prompts / college_application_timeline_events,
  // scoped to this Decision Plan's own colleges only.
  const collegeIds = items.map((it) => it.college_id).filter(Boolean);
  let essayCoverageMissing = 0;
  let timelineMissing = 0;
  let totalEssaysTracked = 0;
  let earliestUpcomingDeadline = null;
  if (collegeIds.length) {
    const placeholders = collegeIds.map(() => "?").join(",");
    const essayCounts = db.prepare(`SELECT college_id, COUNT(*) AS n FROM essay_prompts WHERE student_id=? AND college_id IN (${placeholders}) GROUP BY college_id`).all(sid, ...collegeIds);
    const essayCountByCollege = new Map(essayCounts.map((r) => [r.college_id, r.n]));
    totalEssaysTracked = essayCounts.reduce((sum, r) => sum + r.n, 0);
    essayCoverageMissing = collegeIds.filter((cid) => !essayCountByCollege.get(cid)).length;

    const timelineRows = db.prepare(`SELECT college_id, event_date FROM college_application_timeline_events WHERE student_id=? AND college_id IN (${placeholders}) AND event_date IS NOT NULL AND event_date != ''`).all(sid, ...collegeIds);
    const timelineCollegeSet = new Set(timelineRows.map((r) => r.college_id));
    timelineMissing = collegeIds.filter((cid) => !timelineCollegeSet.has(cid)).length;
    const sortedDeadlines = timelineRows.map((r) => r.event_date).filter(Boolean).sort();
    earliestUpcomingDeadline = sortedDeadlines[0] || null;
  }

  const finalListHealth = buildFinalListGuidance({
    totalColleges: items.length, byAdmissionCategory, reachTargetSafety, needsVerification,
    unresolvedCostRisk, missingNetPriceCalc, essayCoverageMissing, timelineMissing,
  });

  res.json({
    totalColleges: items.length,
    byDecisionStatus,
    byAdmissionCategory,
    reachTargetSafety,
    balanceNotice,
    needsVerification,
    highOrUnknownMajorRisk,
    unresolvedCostRisk,
    missingNetPriceCalc,
    essayCoverageMissing,
    timelineMissing,
    totalEssaysTracked,
    earliestUpcomingDeadline,
    finalListHealth,
    tasks: { total: tasks.length, open: openTasks.length, overdue: overdueTasks.length, dueSoon: dueSoonTasks.length },
    overdueTasks: overdueTasks.slice(0, 10),
    dueSoonTasks: dueSoonTasks.slice(0, 10),
    generatedAt: now2,
  });
});

// Verification Center (Feature 1) -- one cross-college list of everything
// still unresolved, pulled from data already tracked elsewhere in the app
// (essays, timeline, application requirements, programs, verification
// checklist, cost/NPC). See services/verificationCenter.js.
decisionPlanRouter.get("/:id/verification-center", (req, res) => {
  res.json(buildVerificationCenter(req.params.id));
});

// Essay status per college (Part M) -- read-only cross-reference to the
// Essay Center, same don't-merge-two-systems pattern as everywhere else:
// essay count, whether current-cycle prompts are verified, whether
// previous-year prompts are on file, how many still need verification,
// overall essay status, earliest essay deadline, whether a special-program
// essay is required, and one plain-language "what to do next" line.
decisionPlanRouter.get("/:id/essay-status", (req, res) => {
  res.json({ colleges: buildDecisionPlanEssayStatus(req.params.id) });
});

// ---------------- CSV export ----------------
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Feature 9: look up the official double-major verification record (if any)
// for a given college + primary/secondary pairing, for CSV export only. Never
// falls back to Scorecard-tier fields -- an export cell is either the real
// official value or blank, never a guess.
function lookupDmVerification(studentId, collegeId, primaryMajor, secondaryMajor) {
  if (!collegeId || !primaryMajor || !secondaryMajor) return null;
  return db.prepare(
    "SELECT * FROM double_major_verifications WHERE student_id=? AND college_id=? AND LOWER(primary_program_requested)=LOWER(?) AND LOWER(secondary_program_requested)=LOWER(?)"
  ).get(studentId, collegeId, primaryMajor, secondaryMajor) || null;
}
const DM_EXPORT_HEADERS = [
  "Primary program requested", "Secondary program requested",
  "Primary official program name", "Secondary official program name",
  "Primary program type", "Secondary program type",
  "Double-major policy type", "Double-major allowed status",
  "Double-major source URL", "Double-major last checked", "Double-major verification status",
];
function dmExportCells(v, primaryMajor, secondaryMajor) {
  return [
    primaryMajor || "", secondaryMajor || "",
    v?.primary_official_program_name || "", v?.secondary_official_program_name || "",
    v?.primary_program_type || "", v?.secondary_program_type || "",
    v?.double_major_policy_type || "", v?.double_major_allowed_status || "",
    v?.source_url || "", v?.last_checked || "", v?.verification_status || "",
  ];
}

// Verification Center CSV export -- same shape as the on-screen list, one
// row per unresolved item, so a family can share/print the full to-do list.
const DM_ISSUE_TYPES = new Set([
  "Double-major rules needing verification", "Verify primary major official name",
  "Verify second program official name", "Verify second program type (major, minor, concentration, certificate, or track)",
  "Verify school-to-school restrictions", "Verify direct-admit restrictions",
]);
decisionPlanRouter.get("/:id/verification-center/export.csv", (req, res) => {
  const vc = buildVerificationCenter(req.params.id);
  const headers = ["College", "Program/Track", "Issue type", "Status", "Priority", "Action needed", "Source URL", "Last checked", ...DM_EXPORT_HEADERS];
  const lines = [headers.join(",")];
  for (const it of vc.items) {
    let dmCells = ["", "", "", "", "", "", "", "", "", "", ""];
    if (it.collegeId && it.programOrTrack && DM_ISSUE_TYPES.has(it.issueType) && it.programOrTrack.includes(" + ")) {
      const [primaryMajor, secondaryMajor] = it.programOrTrack.split(" + ").map((s) => s.trim());
      const v = lookupDmVerification(req.params.id, it.collegeId, primaryMajor, secondaryMajor);
      dmCells = dmExportCells(v, primaryMajor, secondaryMajor);
    }
    lines.push([
      it.college, it.programOrTrack || "", it.issueType, it.status, it.priority, it.actionNeeded,
      it.sourceUrl || "", it.lastChecked ? new Date(it.lastChecked).toISOString().slice(0, 10) : "",
      ...dmCells,
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="verification-center-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\n"));
});

decisionPlanRouter.get("/:id/export.csv", (req, res) => {
  const items = db.prepare("SELECT * FROM decision_plan_items WHERE student_id=? ORDER BY college_name").all(req.params.id);

  // Read-only cross-references to Application Pathways and Essay Center for
  // the export, same don't-merge-two-systems pattern used on-screen: pulled
  // in here for the CSV only, never written back into decision_plan_items.
  const reqRows = db.prepare("SELECT * FROM college_application_requirements WHERE student_id=?").all(req.params.id);
  const pathwaysByCollege = {};
  for (const r of reqRows) {
    if (!r.college_id) continue;
    const existing = pathwaysByCollege[r.college_id];
    if (!existing || (!r.program_label && existing.program_label)) pathwaysByCollege[r.college_id] = r;
  }
  const promptRows = db.prepare("SELECT * FROM essay_prompts WHERE student_id=?").all(req.params.id);
  const essayByCollege = {};
  for (const p of promptRows) {
    if (!p.college_id) continue;
    if (!essayByCollege[p.college_id]) essayByCollege[p.college_id] = { total: 0, notStarted: 0, special: 0, cycles: new Set() };
    const m = essayByCollege[p.college_id];
    m.total += 1;
    if ((p.status || "Not started") === "Not started") m.notStarted += 1;
    if (p.essay_type === "Honors / scholarship essay" || p.essay_type === "Major / program-specific essay" || p.program_label) m.special += 1;
    if (p.prompt_cycle) m.cycles.add(p.prompt_cycle);
  }

  // Read-only cross-reference to Application Timeline (Part H) -- earliest
  // deadline event per college, same don't-merge-two-systems pattern as the
  // Applications-tracker and Essay-Center cross-references above.
  const timelineRows = db.prepare("SELECT college_id, event_type, event_label, event_date, application_round, verification_status FROM college_application_timeline_events WHERE student_id=?").all(req.params.id);
  const timelineByCollege = {};
  for (const t of timelineRows) {
    if (!t.college_id || !DEADLINE_EVENT_TYPES.includes(t.event_type) || !t.event_date) continue;
    const existing = timelineByCollege[t.college_id];
    if (!existing || String(t.event_date).localeCompare(String(existing.event_date)) < 0) timelineByCollege[t.college_id] = t;
  }

  const headers = [
    "College", "Program", "Special programs", "Track", "Category", "Verification status", "Major risk", "Cost risk",
    "Application round", "Decision", "Application platform", "Application route deadline", "Essay count",
    "Essays not started", "Special/honors essays", "Essay prompt cycle/year(s)",
    "Application Timeline: earliest deadline", "Application Timeline: round", "Application Timeline: verification status",
    "Source context", "Primary major", "Secondary major", "Double-major status", "Double-major verification status",
    ...DM_EXPORT_HEADERS,
    "Import batch ID", "Original uploaded name", "Matched official name", "Match confidence",
    "Admission category at import", "Profile score at import",
    "Action needed", "Notes", "Source URLs",
  ];
  const lines = [headers.join(",")];
  for (const it of items) {
    let specialPrograms = [];
    try { specialPrograms = JSON.parse(it.special_programs_json || "[]"); } catch { /* ignore */ }
    const programRows = it.college_id
      ? db.prepare("SELECT source_url FROM discovered_programs WHERE student_id=? AND college_id=? AND source_url IS NOT NULL").all(req.params.id, it.college_id)
      : [];
    const sourceUrls = [...new Set(programRows.map((r) => r.source_url))].join(" | ");
    const pw = it.college_id ? pathwaysByCollege[it.college_id] : null;
    const es = it.college_id ? essayByCollege[it.college_id] : null;
    const tl = it.college_id ? timelineByCollege[it.college_id] : null;
    const earliestDeadline = pw ? (pw.ea_deadline || pw.ed_deadline || pw.rea_scea_deadline || pw.priority_deadline || pw.rd_deadline || pw.rolling_deadline || "") : "";
    const dmVer = lookupDmVerification(req.params.id, it.college_id, it.primary_major, it.secondary_major);
    lines.push([
      it.college_name, it.program_name, specialPrograms.join("; "), it.career_track, it.admission_category,
      it.program_verification_status, it.major_risk, it.cost_risk, it.application_round, it.decision_status,
      pw?.platform_name || "Unknown -- needs verification", earliestDeadline,
      es?.total ?? 0, es?.notStarted ?? 0, es?.special ?? 0, es ? [...es.cycles].join("; ") : "",
      tl ? `${tl.event_label || tl.event_type}: ${tl.event_date}` : "", tl?.application_round || "", tl?.verification_status || "",
      it.source_context, it.primary_major, it.secondary_major, it.double_major_status, it.double_major_verification_status,
      ...dmExportCells(dmVer, it.primary_major, it.secondary_major),
      it.import_batch_id || "", it.original_uploaded_name || "", it.matched_official_name || "", it.match_confidence || "",
      it.admission_category_at_import || "", it.profile_score_at_import ?? "",
      it.action_needed, it.notes, sourceUrls,
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="decision-plan-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\n"));
});

// ---------------- CSV export: Timeline / Tasks ----------------
decisionPlanRouter.get("/:id/tasks/export.csv", (req, res) => {
  const tasks = db.prepare("SELECT * FROM application_tasks WHERE student_id=? ORDER BY (due_date IS NULL), due_date ASC").all(req.params.id);
  const headers = ["College", "Program", "Task type", "Due date", "Priority", "Status", "Notes", "Source URL"];
  const lines = [headers.join(",")];
  for (const t of tasks) {
    lines.push([
      t.college_name, t.program_name, t.task_type, t.due_date, t.priority, t.status, t.notes, t.source_url,
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="decision-plan-tasks-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\n"));
});
