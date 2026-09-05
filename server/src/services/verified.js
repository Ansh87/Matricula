// verified.js - manually verified, CDS/official-website-sourced admissions fields.
// These are the fields NOT available from Scorecard (ED/EA/RD options & rates,
// testing policy, deadlines, CSS requirement, essay/rec requirements).
//
// Rule: we NEVER invent ED/EA/RD acceptance rates. If a school's row omits a
// rate, the API returns null and the UI shows:
//   "Not publicly available. Verify with the college's official admissions office."
import { db } from "../db/database.js";

const getStmt = db.prepare("SELECT * FROM college_verified_profiles WHERE college_id = ?");

export function getVerified(collegeId) {
  const row = getStmt.get(String(collegeId));
  if (!row) {
    return {
      available: false,
      note: "No verified admissions profile on file for this college yet. Verify details with the college's official admissions office.",
    };
  }
  return {
    available: true,
    collegeId: row.college_id,
    applicationDeadlines: safeJson(row.application_deadlines_json),
    testingPolicy: row.testing_policy,
    recommendationRequirements: row.recommendation_requirements,
    essayRequirements: row.essay_requirements,
    scholarshipDeadlines: safeJson(row.scholarship_deadlines_json),
    cssProfileRequired: row.css_profile_required,
    rounds: {
      ed: !!row.ed_available,
      ea: !!row.ea_available,
      rea: !!row.rea_available,
      rd: !!row.rd_available,
    },
    // Acceptance rates: null => "Not publicly available".
    edAcceptanceRate: row.ed_acceptance_rate,
    eaAcceptanceRate: row.ea_acceptance_rate,
    rdAcceptanceRate: row.rd_acceptance_rate,
    majorRestrictions: safeJson(row.major_restrictions_json),
    honorsProgram: row.honors_program_info,
    source: {
      url: row.source_url,
      year: row.source_year,
      lastReviewed: row.last_reviewed,
      confidence: row.confidence_level, // official | verified | estimated | unavailable
    },
  };
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
