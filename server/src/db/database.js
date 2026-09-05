// database.js -- SQLite via Node's built-in node:sqlite (Node 22+). No native
// compilation needed. Implements all spec tables + an api_cache table.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { seedCoursePlans } from "./coursePlans.js";
import { seedApplicationPlatforms } from "./applicationPlatforms.js";

// Ensure the database's parent directory exists. This matters when DB_PATH points
// at a mounted persistent volume (e.g. /data/matricula.db on Railway) whose
// directory must exist before the file can be opened.
const dbDir = path.dirname(path.resolve(config.dbPath));
fs.mkdirSync(dbDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY, name TEXT, grade INTEGER, graduation_year INTEGER,
  state_residence TEXT, budget INTEGER, academic_profile_json TEXT,
  extracurricular_profile_json TEXT, interests_json TEXT, career_goals_json TEXT,
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS colleges (
  college_id TEXT PRIMARY KEY, unit_id TEXT, name TEXT, city TEXT, state TEXT,
  region TEXT, control_type TEXT, institution_type TEXT, source TEXT,
  source_year INTEGER, last_updated INTEGER
);
CREATE TABLE IF NOT EXISTS college_scorecard_data (
  college_id TEXT PRIMARY KEY, admission_rate REAL, sat_midpoint INTEGER,
  act_midpoint INTEGER, tuition_in_state INTEGER, tuition_out_of_state INTEGER,
  average_net_price INTEGER, graduation_rate REAL, retention_rate REAL,
  median_earnings INTEGER, debt_median INTEGER, size INTEGER,
  source_year INTEGER, last_updated INTEGER
);
CREATE TABLE IF NOT EXISTS college_verified_profiles (
  college_id TEXT PRIMARY KEY, application_deadlines_json TEXT, testing_policy TEXT,
  recommendation_requirements TEXT, essay_requirements TEXT, scholarship_deadlines_json TEXT,
  css_profile_required TEXT, ed_available INTEGER, ea_available INTEGER, rea_available INTEGER,
  rd_available INTEGER, ed_acceptance_rate REAL, ea_acceptance_rate REAL, rd_acceptance_rate REAL,
  major_restrictions_json TEXT, honors_program_info TEXT, source_url TEXT, source_year INTEGER,
  last_reviewed TEXT, confidence_level TEXT
);
CREATE TABLE IF NOT EXISTS student_college_list (
  student_id TEXT, college_id TEXT, college_name TEXT, city TEXT, state TEXT,
  category TEXT, admission_probability_range TEXT,
  overall_fit_score REAL, academic_fit_score REAL, major_fit_score REAL, career_fit_score REAL,
  financial_fit_score REAL, application_round TEXT, status TEXT, notes TEXT,
  created_at INTEGER, updated_at INTEGER, PRIMARY KEY (student_id, college_id)
);
CREATE TABLE IF NOT EXISTS application_tracker (
  student_id TEXT, college_id TEXT, college_name TEXT, application_round TEXT, application_deadline TEXT,
  scholarship_deadline TEXT, fafsa_deadline TEXT, css_deadline TEXT, transcript_status TEXT,
  recommendation_status TEXT, essay_status TEXT, supplement_status TEXT, interview_status TEXT,
  portfolio_status TEXT, submitted_status TEXT, decision_status TEXT, financial_aid_received TEXT,
  final_net_cost INTEGER, status TEXT, student_notes TEXT, parent_notes TEXT, updated_at INTEGER,
  PRIMARY KEY (student_id, college_id)
);
CREATE TABLE IF NOT EXISTS college_deadline_profiles (
  college_id TEXT PRIMARY KEY,
  application_deadlines_json TEXT,
  deadline_source_url TEXT,
  deadline_last_reviewed TEXT,
  css_profile_required TEXT,
  css_profile_deadline TEXT,
  css_profile_source_url TEXT,
  fafsa_priority_deadline TEXT,
  fafsa_source_url TEXT,
  scholarship_deadline TEXT,
  scholarship_source_url TEXT,
  honors_deadline TEXT,
  honors_source_url TEXT,
  portfolio_deadline TEXT,
  portfolio_source_url TEXT,
  interview_deadline TEXT,
  interview_source_url TEXT,
  deadline_confidence_level TEXT,
  notes TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS scholarships (
  scholarship_id TEXT PRIMARY KEY, student_id TEXT, name TEXT, provider TEXT, amount TEXT,
  renewable TEXT, eligibility TEXT, deadline TEXT, essays TEXT, recommendations TEXT,
  gpa_requirement TEXT, major_requirement TEXT, residency TEXT, citizenship TEXT,
  link TEXT, status TEXT, notes TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY, student_id TEXT, kind TEXT, filename TEXT, mimetype TEXT,
  size INTEGER, text_excerpt TEXT, stored_path TEXT, parsed_json TEXT,
  uploaded_at INTEGER
);
CREATE TABLE IF NOT EXISTS careers (
  career_id TEXT PRIMARY KEY, occupation_name TEXT, bls_code TEXT, median_pay INTEGER,
  projected_growth TEXT, typical_entry_education TEXT, related_majors_json TEXT,
  source TEXT, source_year INTEGER, last_updated INTEGER
);
CREATE TABLE IF NOT EXISTS major_career_mapping (
  major_name TEXT PRIMARY KEY, related_careers_json TEXT, salary_range TEXT, job_outlook TEXT,
  ai_impact TEXT, graduate_school_need TEXT, source TEXT, last_updated INTEGER
);
CREATE TABLE IF NOT EXISTS college_selection_profiles (
  college_id TEXT PRIMARY KEY,
  admit_factors_json TEXT,
  culture_json TEXT,
  what_they_want TEXT,
  how_they_select TEXT,
  applies_by_major INTEGER,
  major_competition_json TEXT,
  switch_major_json TEXT,
  ideal_applicant_json TEXT,
  source_url TEXT, source_year INTEGER, last_reviewed TEXT, confidence_level TEXT
);

-- ============================================================================
-- Matricula (second-generation) tables below this line.
-- Every row that holds family/student-entered or student-facing data is keyed
-- by student_id = the Firebase UID (see middleware/firebaseAuth.js). There is
-- no shared "local-student" row in this app's tables outside local dev bypass
-- (AUTH_DEV_BYPASS uses a single fixed dev-only uid, never a real family's
-- data). Every route that touches these tables forces :id to req.user.uid via
-- router.param, exactly like the existing studentRouter pattern.
-- ============================================================================

-- Layer 2 raw source records: one row per official URL the family adds, plus
-- pages picked up by the bounded official-domain crawl (Layer 3). Always kept
-- even if extraction was thin -- the point is an auditable trail of what was
-- fetched, when, and what came back.
CREATE TABLE IF NOT EXISTS program_sources (
  source_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  url TEXT NOT NULL,
  source_type TEXT,
  discovery_method TEXT,
  fetch_status TEXT,
  http_status INTEGER,
  raw_title TEXT,
  notes TEXT,
  last_checked INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_program_sources_student ON program_sources(student_id);

-- Structured program/opportunity records, from any of the 3 discovery layers.
-- "Program" is deliberately broad -- major, minor, concentration, certificate,
-- honors/scholars/bridge/access program, research program, direct-admit
-- pipeline, scholarship-linked cohort, etc. (see program_type).
CREATE TABLE IF NOT EXISTS discovered_programs (
  program_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  program_name TEXT NOT NULL,
  program_type TEXT,
  school_department TEXT,
  eligibility TEXT,
  who_can_apply TEXT,
  application_deadline TEXT,
  application_process TEXT,
  benefits TEXT,
  requirements TEXT,
  relevant_tracks_json TEXT,
  cip_code TEXT,
  credential_level TEXT,
  earnings_median INTEGER,
  debt_median INTEGER,
  data_year INTEGER,
  source_url TEXT,
  source_id TEXT,
  source_label TEXT,
  confidence_level TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  last_checked INTEGER,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_discovered_programs_student ON discovered_programs(student_id);
CREATE INDEX IF NOT EXISTS idx_discovered_programs_college ON discovered_programs(student_id, college_id);

-- Final Application List Builder rows: the family's real working decision list.
CREATE TABLE IF NOT EXISTS decision_plan_items (
  item_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  program_id TEXT,
  program_name TEXT,
  special_programs_json TEXT,
  career_track TEXT,
  admission_category TEXT,
  program_verification_status TEXT,
  admission_basis TEXT,
  major_risk TEXT,
  cost_risk TEXT,
  application_round TEXT,
  decision_status TEXT NOT NULL DEFAULT 'Keep',
  action_needed TEXT,
  sticker_price INTEGER,
  average_net_price INTEGER,
  income_band_net_price INTEGER,
  merit_aid_possibility TEXT,
  need_based_aid_strength TEXT,
  net_price_calculator_url TEXT,
  npc_completed INTEGER DEFAULT 0,
  estimated_family_cost INTEGER,
  financial_safety INTEGER,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_decision_plan_items_student ON decision_plan_items(student_id);

-- Program Verification Checklist -- one row per decision plan item.
CREATE TABLE IF NOT EXISTS verification_checklists (
  checklist_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  college_id TEXT,
  program_id TEXT,
  official_program_page_checked INTEGER DEFAULT 0,
  exact_major_exists TEXT DEFAULT 'Unknown',
  minor_concentration_exists TEXT DEFAULT 'Unknown',
  special_program_exists TEXT DEFAULT 'Unknown',
  honors_research_option_exists TEXT DEFAULT 'Unknown',
  ug_research_lab_available TEXT DEFAULT 'Unknown',
  direct_admission_checked INTEGER DEFAULT 0,
  internal_transfer_rules_checked INTEGER DEFAULT 0,
  program_restrictions_checked INTEGER DEFAULT 0,
  deadline_checked INTEGER DEFAULT 0,
  notes TEXT,
  source_url TEXT,
  last_checked_date TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_verification_checklists_student ON verification_checklists(student_id);
CREATE INDEX IF NOT EXISTS idx_verification_checklists_item ON verification_checklists(item_id);

-- Strategy Notes per college/program -- generated from profile + evidence, never
-- invented school-specific facts. Unknown fields say "Verify with official source."
CREATE TABLE IF NOT EXISTS strategy_notes (
  note_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  college_id TEXT,
  why_college TEXT,
  why_program TEXT,
  best_round TEXT,
  essay_angle TEXT,
  activities_to_emphasize TEXT,
  risks TEXT,
  actions_before_applying TEXT,
  questions_for_admissions TEXT,
  auto_generated INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_strategy_notes_student ON strategy_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_strategy_notes_item ON strategy_notes(item_id);

-- Course/prep plans: reference content seeded per Career Track (server/src/db/
-- coursePlans.js). Not student-owned -- it's the same evidence-based curriculum
-- guidance for every family, so it is NOT keyed by student_id. Per-student
-- notes on top of a track's plan are stored in decision_plan_items.notes /
-- strategy_notes instead, keeping this table a clean, shared reference.
CREATE TABLE IF NOT EXISTS course_plans (
  track_id TEXT PRIMARY KEY,
  track_name TEXT,
  senior_year_courses TEXT,
  college_early_course_direction TEXT,
  math_expectations TEXT,
  domain_expectations TEXT,
  suggested_projects TEXT,
  suggested_skills TEXT,
  risks_if_weak_prep TEXT,
  updated_at INTEGER
);

-- Timeline and Tasks.
CREATE TABLE IF NOT EXISTS application_tasks (
  task_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  program_id TEXT,
  program_name TEXT,
  task_type TEXT,
  due_date TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'To do',
  notes TEXT,
  source_url TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_application_tasks_student ON application_tasks(student_id);

-- ============================================================================
-- Application Pathways + Essay Center (real-application-process modules).
-- Same UID-isolation rule as everything above: every row here that is
-- student-facing is keyed by student_id = the Firebase UID. application_platforms
-- is the one exception -- shared, read-only reference metadata about how the
-- major application routes work (Common App, UC App, ApplyTexas, etc.), the
-- same pattern as course_plans.
-- ============================================================================

-- Shared reference: application platform metadata (see db/applicationPlatforms.js).
CREATE TABLE IF NOT EXISTS application_platforms (
  platform_id TEXT PRIMARY KEY,
  platform_name TEXT,
  category TEXT,
  approximate_coverage TEXT,
  region_system TEXT,
  official_url TEXT,
  notes TEXT,
  updated_at INTEGER
);

-- Per-college application requirements: which platform, which deadlines,
-- what's required. One or more rows per college (a second row lets a family
-- track a separate honors/scholarship application alongside the main one).
CREATE TABLE IF NOT EXISTS college_application_requirements (
  requirement_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  program_label TEXT,
  platform_id TEXT,
  platform_name TEXT,
  application_url TEXT,
  application_opens_date TEXT,
  ea_deadline TEXT,
  ed_deadline TEXT,
  rea_scea_deadline TEXT,
  priority_deadline TEXT,
  rd_deadline TEXT,
  rolling_deadline TEXT,
  honors_app_required TEXT DEFAULT 'Unknown',
  scholarship_app_required TEXT DEFAULT 'Unknown',
  program_specific_app_required TEXT DEFAULT 'Unknown',
  portfolio_required TEXT DEFAULT 'Unknown',
  interview_required TEXT DEFAULT 'Unknown',
  recommendations_required TEXT DEFAULT 'Unknown',
  transcript_required TEXT DEFAULT 'Unknown',
  test_policy TEXT,
  application_fee TEXT,
  fee_waiver_available TEXT DEFAULT 'Unknown',
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  source_url TEXT,
  last_checked INTEGER,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_car_student ON college_application_requirements(student_id);
CREATE INDEX IF NOT EXISTS idx_car_college ON college_application_requirements(student_id, college_id);

-- Essay prompts: one row per essay a family is tracking for a college. Draft/
-- outline fields are brainstorming notes, never a claim to hold the student's
-- final submitted essay text.
CREATE TABLE IF NOT EXISTS essay_prompts (
  prompt_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  platform_id TEXT,
  program_label TEXT,
  essay_type TEXT,
  prompt_text TEXT,
  word_limit TEXT,
  required TEXT DEFAULT 'Unknown',
  deadline TEXT,
  prompt_cycle TEXT,
  status TEXT NOT NULL DEFAULT 'Not started',
  draft_title TEXT,
  outline_notes TEXT,
  student_story_angle TEXT,
  related_track TEXT,
  related_activities TEXT,
  notes TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  source_url TEXT,
  last_checked INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_essay_prompts_student ON essay_prompts(student_id);
CREATE INDEX IF NOT EXISTS idx_essay_prompts_college ON essay_prompts(student_id, college_id);

-- Story bank: reusable authentic material the student can draw from across
-- multiple essays/colleges, instead of writing a generic essay each time.
CREATE TABLE IF NOT EXISTS essay_story_bank (
  story_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  story_title TEXT,
  theme TEXT,
  related_activity TEXT,
  challenge TEXT,
  action_taken TEXT,
  impact TEXT,
  what_it_reveals TEXT,
  possible_prompts TEXT,
  tracks_supported_json TEXT,
  risk_notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_essay_story_bank_student ON essay_story_bank(student_id);

-- ============================================================================
-- Application Timeline (per-college deadline/event tracking, cross-linked with
-- Application Pathways, Essay Center, Decision Plan, and Journey). Same
-- UID-isolation rule: every row is keyed by student_id = the Firebase UID.
-- Nothing here is ever seeded globally with invented or "always true" dates --
-- every row is either entered by the family or extracted from one specific
-- official page at one specific time, and always keeps its own source_url,
-- cycle_year, last_checked, and verification_status so the family can judge
-- how current it is. See services/applicationTimeline.js for the conservative,
-- bounded extraction helper and conflict-detection logic.
-- ============================================================================
CREATE TABLE IF NOT EXISTS college_application_timeline_events (
  event_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  program_label TEXT,
  application_round TEXT,
  event_type TEXT NOT NULL,
  event_label TEXT,
  event_date TEXT,
  event_month_day TEXT,
  cycle_year TEXT,
  source_url TEXT,
  source_label TEXT,
  last_checked INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_timeline_events_student ON college_application_timeline_events(student_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_college ON college_application_timeline_events(student_id, college_id);

-- ============================================================================
-- Double-major OFFICIAL confirmation layer. Categorically distinct from the
-- primary_major/secondary_major/double_major_status columns on
-- student_college_list and decision_plan_items above: those columns only ever
-- reflect what College Scorecard's field-of-study data suggests (two program
-- areas exist), which can NEVER by itself confirm a college's real
-- double-major/second-major/dual-degree policy. A row here represents the
-- family (or an official-source citation) actually confirming that policy --
-- see services/doubleMajorVerification.js for the exact "confirmed" gate.
-- ============================================================================
CREATE TABLE IF NOT EXISTS double_major_verifications (
  verification_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT,
  primary_program_requested TEXT,
  secondary_program_requested TEXT,
  primary_official_program_name TEXT,
  secondary_official_program_name TEXT,
  primary_program_type TEXT DEFAULT 'Unknown',
  secondary_program_type TEXT DEFAULT 'Unknown',
  official_policy_name TEXT,
  double_major_policy_type TEXT DEFAULT 'Unknown',
  double_major_allowed_status TEXT DEFAULT 'Unknown',
  source_url TEXT,
  source_label TEXT,
  source_type TEXT,
  last_checked TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Needs manual verification',
  restrictions TEXT,
  notes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dmv_student ON double_major_verifications(student_id);
CREATE INDEX IF NOT EXISTS idx_dmv_college ON double_major_verifications(student_id, college_id);
-- Search/results persistence (Issue 1): one JSON "state" blob per student per
-- page area (Browse Colleges, Matches, Single/Double Major Search, Programs,
-- Essay Center, etc.). The client owns the shape of state_json entirely --
-- this table never interprets it, so it can never drift out of sync with
-- what each page actually needs to restore. Isolated by student_id (Firebase
-- UID) exactly like every other per-student table in this app.
CREATE TABLE IF NOT EXISTS saved_search_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  state_json TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  last_viewed_at INTEGER,
  UNIQUE(student_id, page_key)
);
CREATE INDEX IF NOT EXISTS idx_sss_student ON saved_search_sessions(student_id);
`);

const getCacheStmt = db.prepare("SELECT payload, fetched_at FROM api_cache WHERE cache_key = ?");
const setCacheStmt = db.prepare(
  "INSERT INTO api_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) " +
  "ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at"
);

export function cacheGet(key) {
  const row = getCacheStmt.get(key);
  if (!row) return null;
  return { data: JSON.parse(row.payload), fetchedAt: row.fetched_at };
}
export function cacheSet(key, data) {
  setCacheStmt.run(key, JSON.stringify(data), Date.now());
}


// --- Safe migrations: add a column only when it doesn't already exist. ---
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// Full extracted text for AI parsing. text_excerpt stays a short UI preview.
addColumnIfMissing("documents", "extracted_text", "TEXT");
addColumnIfMissing("documents", "extract_reason", "TEXT");
// Plain-language "what to do about this program record" field shown on every
// Programs & Opportunities card (Journey upgrade).
addColumnIfMissing("discovered_programs", "action_needed", "TEXT");
// Previous-Year Essay Prompt Archive: explicit classification of whether a
// tracked prompt is believed current-cycle, a saved previous-year prompt (kept
// for planning only), or simply unknown -- separate from prompt_cycle (the
// free-text "2026-2027" label) so the UI can group/warn without parsing that
// string. Defaults to 'Unknown' for every existing row; never inferred or
// guessed retroactively -- the family (or the discovery notice) sets it.
addColumnIfMissing("essay_prompts", "cycle_type", "TEXT DEFAULT 'Unknown'");

// Essay Center strengthening (real-application-planning upgrade): a few more
// fields the family-facing prompt dashboard needs, all additive and all
// defaulted so existing rows/features are unaffected.
//   application_round   -- which round this prompt applies to (ED/EA/RD/...),
//                          so a prompt can be tied to the matching Application
//                          Timeline deadline the same way requirement records are.
//   school_or_program    -- which specific school/college-within-a-university
//                          this prompt is for (e.g. "Columbia Engineering" vs
//                          "Columbia College", or "Cornell College of Arts and
//                          Sciences") -- distinct from program_label, which is
//                          used for honors/scholarship/major-specific *tracks*.
//   character_limit      -- some platforms (e.g. UC) cap by character, not word.
//   source_label          -- human-readable citation ("MIT Admissions -- Essays,
//                          activities & academics page"), shown next to source_url.
//   source_type           -- one of PROMPT_SOURCE_TYPES (services/essayCenter.js):
//                          distinguishes an official college page from a Common
//                          App/UC/Coalition platform prompt vs a user entry.
//   prompt_status         -- one of PROMPT_STATUSES (services/essayCenter.js): a
//                          single, family-facing rollup status ("Current-cycle
//                          verified", "Previous-year prompt", "Needs manual
//                          verification", "Outdated / needs recheck", "User
//                          entered", "Unknown"). Auto-set from cycle_type +
//                          verification_status when not given explicitly; never
//                          a second, independently-drifting source of truth --
//                          see derivePromptStatus() in services/essayCenter.js.
addColumnIfMissing("essay_prompts", "application_round", "TEXT");
addColumnIfMissing("essay_prompts", "school_or_program", "TEXT");
addColumnIfMissing("essay_prompts", "character_limit", "TEXT");
addColumnIfMissing("essay_prompts", "source_label", "TEXT");
addColumnIfMissing("essay_prompts", "source_type", "TEXT");
addColumnIfMissing("essay_prompts", "prompt_status", "TEXT DEFAULT 'Unknown'");

// Selection-context tracking on the saved list (My List): remembers WHERE a
// college was selected from (Single Major Search, Double Major Search, Career
// Track Search, Best Fit, Balanced List, or manually), plus double-major
// context when relevant. A college can be selected from more than one place
// -- selection_contexts_json holds the full accumulated set so re-adding the
// same college from a new place merges into the existing row instead of
// creating a confusing duplicate card. double_major_pathways_json holds every
// distinct primary+secondary pairing considered for this college (e.g. CS+AI
// AND CS+Finance), while the flat primary_major/secondary_major/... columns
// mirror the most-recently-added pathway for simple display and CSV export.
// See services/selectionContext.js for the merge logic and label constants.
addColumnIfMissing("student_college_list", "selection_contexts_json", "TEXT");
addColumnIfMissing("student_college_list", "source_context", "TEXT");
addColumnIfMissing("student_college_list", "primary_major", "TEXT");
addColumnIfMissing("student_college_list", "secondary_major", "TEXT");
addColumnIfMissing("student_college_list", "double_major_label", "TEXT");
addColumnIfMissing("student_college_list", "double_major_status", "TEXT");
addColumnIfMissing("student_college_list", "double_major_verification_status", "TEXT");
addColumnIfMissing("student_college_list", "double_major_notes", "TEXT");
addColumnIfMissing("student_college_list", "double_major_pathways_json", "TEXT");
addColumnIfMissing("student_college_list", "selected_at", "INTEGER");

// Same double-major context on Decision Plan items, so a family working the
// Final List Builder can see the primary/secondary majors and verification
// status without flipping back to My List.
addColumnIfMissing("decision_plan_items", "primary_major", "TEXT");
addColumnIfMissing("decision_plan_items", "secondary_major", "TEXT");
addColumnIfMissing("decision_plan_items", "double_major_status", "TEXT");
addColumnIfMissing("decision_plan_items", "double_major_verification_status", "TEXT");
addColumnIfMissing("decision_plan_items", "double_major_notes", "TEXT");
addColumnIfMissing("decision_plan_items", "source_context", "TEXT");

// Import College List: a family can paste/upload a list of college names and
// have them matched to official College Scorecard records, reviewed, then
// added to My List. These columns record exactly what was imported and how
// confident the match was, so "Imported List" badges and CSV exports can be
// honest about provenance -- separate from (and layered on top of) the
// selection-context columns above, using the same merge-not-duplicate rule.
// See services/collegeMatcher.js and routes/collegeImport.js.
addColumnIfMissing("student_college_list", "import_batch_id", "TEXT");
addColumnIfMissing("student_college_list", "original_uploaded_name", "TEXT");
addColumnIfMissing("student_college_list", "matched_official_name", "TEXT");
addColumnIfMissing("student_college_list", "match_confidence", "TEXT");
addColumnIfMissing("student_college_list", "profile_score_at_import", "REAL");
addColumnIfMissing("student_college_list", "admission_category_at_import", "TEXT");

// "Evaluate Against My Profile" (Issue 2): the raw official admission rate
// and this student's estimated net cost, captured alongside the existing fit
// scores (overall/academic/major/career/financial_fit_score above) so every
// My List card can show the same Fit / Admit / Est. cost / Major fit pills
// MatchCard.jsx already shows on Matches -- same values, same source
// (scoreCollege()), just persisted here so they survive without re-scoring.
// Null until the college has been scored at least once (add, import, or an
// Evaluate Against My Profile run) -- never guessed.
addColumnIfMissing("student_college_list", "admission_rate", "REAL");
addColumnIfMissing("student_college_list", "estimated_net_cost", "REAL");

// Same import-provenance fields on Decision Plan items, so an imported
// college's card there can also show the Imported List badge + admission
// category at import time without re-querying My List.
addColumnIfMissing("decision_plan_items", "import_batch_id", "TEXT");
addColumnIfMissing("decision_plan_items", "original_uploaded_name", "TEXT");
addColumnIfMissing("decision_plan_items", "matched_official_name", "TEXT");
addColumnIfMissing("decision_plan_items", "match_confidence", "TEXT");
addColumnIfMissing("decision_plan_items", "profile_score_at_import", "REAL");
addColumnIfMissing("decision_plan_items", "admission_category_at_import", "TEXT");

// --- One-time cleanup: earlier versions of the official-domain crawl (Layer 3
// program discovery) had no quality gate and no de-duplication, so families
// who ran "Research this college" before this fix may have site-furniture
// junk ("Apply to Texas", "State and System Resources") and duplicate rows
// (the same program discovered from two pages) sitting in their data. This
// runs once per boot, is cheap (the table is small per family), and only
// ever deletes rows that were auto-discovered by the crawl - never anything
// the family added manually or a College Scorecard / CIP record.
function cleanupLowQualityDiscoveredPrograms() {
  const JUNK_EXACT_TITLES = new Set([
    "apply", "apply now", "apply online", "apply to texas", "admissions", "admission",
    "home", "homepage", "welcome", "contact", "contact us", "search", "search results",
    "sitemap", "site map", "accessibility", "accessibility statement", "privacy",
    "privacy policy", "privacy notice", "terms of use", "terms", "terms and conditions",
    "login", "sign in", "log in", "my portal", "news", "news & events", "news and events",
    "events", "calendar", "directory", "faculty directory", "staff directory", "careers",
    "careers at", "employment", "jobs", "job openings", "page not found", "not found",
    "404", "404 error", "error", "copyright", "state and system resources", "give now",
    "giving", "alumni", "visit", "visit campus", "campus tour", "maps & directions",
    "maps and directions", "parking", "covid-19", "coronavirus updates",
  ]);
  const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  const crawlRows = db.prepare(
    "SELECT program_id, student_id, college_id, program_name, updated_at FROM discovered_programs WHERE source_label LIKE 'Official domain crawl%'"
  ).all();

  // 1. Delete exact junk titles.
  const del = db.prepare("DELETE FROM discovered_programs WHERE program_id=?");
  let junkDeleted = 0;
  for (const r of crawlRows) {
    const t = String(r.program_name || "").trim().toLowerCase();
    if (JUNK_EXACT_TITLES.has(t)) { del.run(r.program_id); junkDeleted++; }
  }

  // 2. Collapse duplicates (same student + college + normalized name), keeping
  // whichever row was updated most recently.
  const remaining = db.prepare(
    "SELECT program_id, student_id, college_id, program_name, updated_at FROM discovered_programs WHERE source_label LIKE 'Official domain crawl%'"
  ).all();
  const groups = new Map();
  for (const r of remaining) {
    const key = `${r.student_id}::${r.college_id}::${normalize(r.program_name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let dupesDeleted = 0;
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    for (const dupe of rows.slice(1)) { del.run(dupe.program_id); dupesDeleted++; }
  }

  if (junkDeleted || dupesDeleted) {
    console.log(`Program Discovery cleanup: removed ${junkDeleted} site-furniture record(s) and ${dupesDeleted} duplicate record(s) from earlier crawl runs.`);
  }
}
cleanupLowQualityDiscoveredPrograms();

// --- One-time cleanup: the first version of Essay Prompt Discovery had no
// junk-phrase gate and flattened each page's whole body into one text blob,
// so a hero/CTA heading sitting next to unrelated nav copy could get read as
// a single run-on "sentence" ending in "?" and saved as if it were a real
// essay prompt (e.g. "Admissions and financial aid Ready to start your
// journey?"). This runs once per boot and only ever deletes rows that were
// auto-discovered and never reviewed by the family -- never a manually
// entered prompt, and never anything already marked verified. Mirrors the
// self-contained cleanup pattern above (duplicated, not imported, to avoid a
// database.js <-> essayCenter.js circular import).
function cleanupLowQualityEssayPrompts() {
  const JUNK_PHRASE_RE = /(ready to start your journey|start your journey|start your application|apply now|apply today|request (more )?info|schedule a visit|visit campus|plan your visit|explore programs|explore majors|learn more|get started|join us|create an account|sign in|log in|find your fit|discover your future|why choose us|take the next step|connect with us|contact admissions|request information|visit us|see yourself here)/i;
  const isJunk = (text) => {
    const t = String(text || "").trim();
    if (t.length < 40 || t.length > 700) return true;
    const normalized = t.toLowerCase().replace(/\s+/g, " ");
    if (JUNK_PHRASE_RE.test(normalized)) return true;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) return true;
    return false;
  };

  const rows = db.prepare(
    "SELECT prompt_id, prompt_text FROM essay_prompts WHERE notes LIKE 'Automatically found%' AND verification_status='Needs manual verification'"
  ).all();
  const del = db.prepare("DELETE FROM essay_prompts WHERE prompt_id=?");
  let removed = 0;
  for (const r of rows) {
    if (isJunk(r.prompt_text)) { del.run(r.prompt_id); removed++; }
  }
  if (removed) {
    console.log(`Essay Center cleanup: removed ${removed} low-quality auto-discovered prompt(s) from earlier crawl runs.`);
  }
}
cleanupLowQualityEssayPrompts();

// Seed the reference course/prep plans (Decision Plan tab). Idempotent upsert.
seedCoursePlans(db);
// Seed the reference application-platform metadata (Application Pathways tab).
seedApplicationPlatforms(db);

export default db;
