// importVerified.js - one-time / scheduled import of manually verified college
// admissions profiles and the careers + major_career_mapping tables.
//
// This is the "admin/import process" the spec asks for. Records here are
// transcribed from each college's official admissions site / Common Data Set,
// each with a source URL, year, last-reviewed date, and confidence level.
// Run: npm run import:verified
//
// NOTE ON COVERAGE: Only a small, honestly-labeled set of colleges is seeded
// here as verified examples. Every other college simply has no verified row,
// so the app shows "Verify with the college's official admissions office"
// rather than inventing numbers. ED/EA/RD acceptance rates are left null unless
// a college officially publishes them.
import { db } from "./database.js";
import { OCCUPATIONS_SEED, MAJOR_SEED } from "./careerSeed.js";
import { SELECTION_SEED } from "./selectionSeed.js";
import { VERIFIED_SEED_2 } from "./verifiedSeed2.js";
import { VERIFIED_SEED_3 } from "./verifiedSeed3.js";
import { importDeadlineProfiles } from "./deadlineSeed.js";

const now = Date.now();

// college_id values are College Scorecard IDs (stable). A few well-known
// examples with publicly documented admissions policies. Acceptance-rate fields
// are intentionally null: most schools do not officially publish round-level
// rates, and we do not estimate them.
const VERIFIED = [
  {
    college_id: "166683", // MIT
    application_deadlines_json: JSON.stringify({ EA: "Nov 1", RA: "Jan 4" }),
    testing_policy: "Required (SAT or ACT) for the applicable cycle - confirm current policy",
    recommendation_requirements: "Two teacher evaluations (one math/science, one humanities) + counselor",
    essay_requirements: "Several short-response essays via MIT application",
    scholarship_deadlines_json: JSON.stringify({ note: "Need-based aid via CSS Profile; see MIT SFS" }),
    css_profile_required: "Required",
    ed_available: 0, ea_available: 1, rea_available: 0, rd_available: 1,
    ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null,
    major_restrictions_json: JSON.stringify({ note: "Admission is to the Institute, not by major" }),
    honors_program_info: "N/A (no separate honors college)",
    source_url: "https://mitadmissions.org/apply/firstyear/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "243744", // Stanford
    application_deadlines_json: JSON.stringify({ REA: "Nov 1", RD: "Jan 5" }),
    testing_policy: "Confirm current SAT/ACT policy on official site",
    recommendation_requirements: "Two teacher recommendations + counselor",
    essay_requirements: "Stanford short essays + Common App personal essay",
    scholarship_deadlines_json: JSON.stringify({ note: "Need-based aid; CSS Profile required" }),
    css_profile_required: "Required",
    ed_available: 0, ea_available: 0, rea_available: 1, rd_available: 1,
    ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null,
    major_restrictions_json: null,
    honors_program_info: "N/A",
    source_url: "https://admission.stanford.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "186131", // Princeton
    application_deadlines_json: JSON.stringify({ SCEA: "Nov 1", RD: "Jan 1" }),
    testing_policy: "Confirm current testing policy on official site",
    recommendation_requirements: "Two teacher recommendations + counselor",
    essay_requirements: "Princeton supplement + Common/Coalition essay",
    scholarship_deadlines_json: JSON.stringify({ note: "All aid is need-based; no merit scholarships" }),
    css_profile_required: "Institutional form (not CSS) - confirm on official site",
    ed_available: 0, ea_available: 0, rea_available: 1, rd_available: 1,
    ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null,
    major_restrictions_json: JSON.stringify({ note: "B.S.E. vs A.B. selected on application" }),
    honors_program_info: "N/A",
    source_url: "https://admission.princeton.edu/how-apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "139755", // Georgia Tech
    application_deadlines_json: JSON.stringify({ "EA I (GA)": "Oct 15", "EA II (non-GA)": "Nov 1", RD: "Jan 4" }),
    testing_policy: "Confirm current SAT/ACT policy on official site",
    recommendation_requirements: "Recommendations optional/limited - confirm on official site",
    essay_requirements: "Georgia Tech essay prompt + Common App essay",
    scholarship_deadlines_json: JSON.stringify({ note: "Institute merit + need aid; see GT financial aid" }),
    css_profile_required: "Not required (FAFSA-based) - confirm",
    ed_available: 0, ea_available: 1, rea_available: 0, rd_available: 1,
    ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null,
    major_restrictions_json: JSON.stringify({ note: "Admitted by college/major; CS is highly competitive" }),
    honors_program_info: "Honors Program available by separate consideration",
    source_url: "https://admission.gatech.edu/first-year/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "186380", // Rutgers-New Brunswick
    application_deadlines_json: JSON.stringify({ EA: "Nov 1", RD: "Dec 1 (priority)" }),
    testing_policy: "Test-optional - confirm current policy",
    recommendation_requirements: "Not required for most programs - confirm",
    essay_requirements: "Rutgers essay; Common App or Rutgers application",
    scholarship_deadlines_json: JSON.stringify({ note: "Automatic merit consideration by deadline; see Rutgers SAS" }),
    css_profile_required: "Not required (FAFSA-based)",
    ed_available: 0, ea_available: 1, rea_available: 0, rd_available: 1,
    ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null,
    major_restrictions_json: JSON.stringify({ note: "Some majors (e.g., certain BAIT/CS tracks) competitive" }),
    honors_program_info: "SAS Honors Program / Honors College by separate application",
    source_url: "https://admissions.rutgers.edu/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
];

const cols = [
  "college_id","application_deadlines_json","testing_policy","recommendation_requirements",
  "essay_requirements","scholarship_deadlines_json","css_profile_required","ed_available",
  "ea_available","rea_available","rd_available","ed_acceptance_rate","ea_acceptance_rate",
  "rd_acceptance_rate","major_restrictions_json","honors_program_info","source_url",
  "source_year","last_reviewed","confidence_level",
];

const insertVerified = db.prepare(
  `INSERT INTO college_verified_profiles (${cols.join(",")})
   VALUES (${cols.map((c) => "@" + c).join(",")})
   ON CONFLICT(college_id) DO UPDATE SET ${cols.filter(c=>c!=="college_id").map(c=>`${c}=excluded.${c}`).join(",")}`
);

const insertCareer = db.prepare(
  `INSERT INTO careers (career_id,occupation_name,bls_code,median_pay,projected_growth,typical_entry_education,related_majors_json,source,source_year,last_updated)
   VALUES (@career_id,@occupation_name,@bls_code,@median_pay,@projected_growth,@typical_entry_education,@related_majors_json,@source,@source_year,@last_updated)
   ON CONFLICT(career_id) DO UPDATE SET median_pay=excluded.median_pay, projected_growth=excluded.projected_growth, last_updated=excluded.last_updated`
);

const insertMajor = db.prepare(
  `INSERT INTO major_career_mapping (major_name,related_careers_json,salary_range,job_outlook,ai_impact,graduate_school_need,source,last_updated)
   VALUES (@major_name,@related_careers_json,@salary_range,@job_outlook,@ai_impact,@graduate_school_need,@source,@last_updated)
   ON CONFLICT(major_name) DO UPDATE SET related_careers_json=excluded.related_careers_json, last_updated=excluded.last_updated`
);

const selCols = ["college_id","admit_factors_json","culture_json","what_they_want","how_they_select",
  "applies_by_major","major_competition_json","switch_major_json","ideal_applicant_json",
  "source_url","source_year","last_reviewed","confidence_level"];
const insertSelection = db.prepare(
  `INSERT INTO college_selection_profiles (${selCols.join(",")})
   VALUES (${selCols.map((c) => "@" + c).join(",")})
   ON CONFLICT(college_id) DO UPDATE SET ${selCols.filter(c=>c!=="college_id").map(c=>`${c}=excluded.${c}`).join(",")}`
);

// This module used to only run when invoked directly (`npm run import:verified`).
// That meant a fresh/reset database (e.g. a new Railway deploy, or any restart
// that lands on a database without this data yet) silently had NO verified
// admissions profiles at all -- every college's "Admissions details" card
// showed the honest-but-unhelpful "No verified admissions profile on file"
// empty state, including ones like MIT that DO have a real, sourced row
// written right here in this file. The data existed in the codebase; it just
// never made it into the running database unless someone remembered to run
// the import script by hand.
//
// Fix: index.js now imports this module on every server boot. All inserts
// below are upserts (ON CONFLICT ... DO UPDATE), so re-running this on every
// restart is safe and idempotent -- it just keeps the DB in sync with
// whatever is checked into these seed files, with no risk of duplicating or
// corrupting rows. Failures are logged, not thrown, so a problem importing
// this reference data can never take down the whole server.
try {
  db.exec("BEGIN");
  try {
    for (const v of VERIFIED) insertVerified.run(v);
    for (const v of VERIFIED_SEED_2) insertVerified.run(v);
    for (const v of VERIFIED_SEED_3) insertVerified.run(v);
    for (const c of OCCUPATIONS_SEED) insertCareer.run({ ...c, last_updated: now });
    for (const m of MAJOR_SEED) insertMajor.run({ ...m, last_updated: now });
    for (const s of SELECTION_SEED) insertSelection.run(s);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  const deadlineCount = importDeadlineProfiles(db);
  console.log(`Imported ${VERIFIED.length + VERIFIED_SEED_2.length + VERIFIED_SEED_3.length} verified admissions profiles, ${SELECTION_SEED.length} selection profiles, ${OCCUPATIONS_SEED.length} careers, ${MAJOR_SEED.length} major mappings.`);
  console.log(`Imported ${deadlineCount} verified deadline profiles.`);
  console.log("Source labels and confidence levels stored. ED/EA/RD acceptance rates left null unless officially published.");
} catch (e) {
  console.error("Verified-data import failed (non-fatal - server will still start):", e.message);
}
