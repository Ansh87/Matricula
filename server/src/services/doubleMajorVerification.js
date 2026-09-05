// doubleMajorVerification.js - the "official confirmation" layer for double
// majors. Everything in scorecard.js's searchMajorCombos() only ever proves
// that TWO program-area codes exist in College Scorecard's field-of-study
// data for a college; it can never prove a college's actual double-major /
// second-major / dual-degree POLICY, because Scorecard has no such data.
// Records in double_major_verifications are the one place that gap gets
// closed -- and only ever by an official source URL the family (or, later,
// the official-domain crawl as a suggested-source breadcrumb) attaches, never
// by inference. A record is "confirmed" only when every field in
// isConfirmedDoubleMajor() below is present -- there is no partial-credit
// confirmed state.
import { db } from "../db/database.js";

export const PROGRAM_TYPES = [
  "Major", "Minor", "Concentration", "Track", "Certificate",
  "Course cluster", "Graduate-only program", "Unknown",
];

export const DOUBLE_MAJOR_POLICY_TYPES = [
  "Double major", "Second major", "Additional major", "Dual degree",
  "Intercollege dual degree", "Major + minor", "Concentration only", "Not allowed", "Unknown",
];

export const DOUBLE_MAJOR_ALLOWED_STATUSES = [
  "Confirmed allowed", "Confirmed with restrictions", "Confirmed not allowed",
  "Programs exist, rules not verified", "Second program is not an undergraduate major", "Unknown",
];

export const OFFICIAL_SOURCE_TYPES = [
  "College catalog", "Undergraduate bulletin", "Registrar page", "Academic advising page",
  "Department page", "School/college degree requirements page", "Official double-major policy page", "Official program page",
];

// The verification-status vocabulary shared with everything else in the app
// that tracks "has this been checked against an official source" (essay
// prompts, timeline events, application requirements, discovered programs).
export const DOUBLE_MAJOR_VERIFICATION_STATUSES = [
  "Official source verified", "User verified", "Needs manual verification", "Unknown",
];
export const DOUBLE_MAJOR_VERIFIED_STATUSES = ["Official source verified", "User verified"];

// Family-facing status labels for a double-major SEARCH RESULT or a saved
// pathway on My List/Decision Plan -- distinct from double_major_allowed_status
// (which only ever appears on a full verification record). This is the label
// shown before/instead of opening a full verification record.
export const DOUBLE_MAJOR_DISPLAY_STATUSES = [
  "Confirmed double-major path",
  "Confirmed with restrictions",
  "Programs exist - double-major rules not verified",
  "Second program is not confirmed as an undergraduate major",
  "Needs official verification",
  "Not confirmed",
];

// The ONE gate for "confirmed." Every field below must be present -- a
// verification record missing even one (e.g. no source_url, or a status of
// "Needs manual verification") is NOT confirmed, no matter how complete the
// rest of the record looks. This function is the single source of truth for
// that gate; nothing else in the app should independently decide a pairing is
// "confirmed."
export function isConfirmedDoubleMajor(v) {
  if (!v) return false;
  return !!(
    v.primary_official_program_name &&
    v.secondary_official_program_name &&
    v.official_policy_name &&
    v.source_url &&
    v.source_type && OFFICIAL_SOURCE_TYPES.includes(v.source_type) &&
    v.last_checked &&
    DOUBLE_MAJOR_VERIFIED_STATUSES.includes(v.verification_status)
  );
}

// Map a verification record (possibly confirmed, possibly not) to the
// family-facing display status. Used by My List / Decision Plan / search
// results whenever a matching verification record exists.
export function displayStatusForRecord(v) {
  if (!v) return "Needs official verification";
  if (isConfirmedDoubleMajor(v)) {
    return v.double_major_allowed_status === "Confirmed with restrictions"
      ? "Confirmed with restrictions" : "Confirmed double-major path";
  }
  if (v.double_major_allowed_status === "Second program is not an undergraduate major") {
    return "Second program is not confirmed as an undergraduate major";
  }
  if (v.double_major_allowed_status === "Confirmed not allowed") return "Not confirmed";
  return "Needs official verification";
}

// GENERIC program-type signal from a College Scorecard program TITLE string.
// Deliberately not tied to any specific major (Computer Science/AI is just
// one example) -- applies the same literal-keyword check to whatever the
// title text actually says, for any major pair. Scorecard's field-of-study
// titles are usually just the plain CIP category name and rarely say
// "concentration"/"minor"/etc, so the honest default is "Unknown" -- this
// only ever returns a specific type when the title text itself says so.
const TYPE_HINT_PATTERNS = [
  [/\bminor\b/i, "Minor"],
  [/\bconcentration\b/i, "Concentration"],
  [/\bcertificate\b/i, "Certificate"],
  [/\btrack\b/i, "Track"],
];
export function programTypeHintFromTitle(title) {
  const t = String(title || "");
  for (const [re, type] of TYPE_HINT_PATTERNS) if (re.test(t)) return type;
  return "Unknown";
}

// Classify a Scorecard-only (unverified) combo evidence pair into the
// family-facing display status + a program-type hint for the secondary
// field. `secondaryTitle` is whatever CIP title Scorecard returned for the
// SECOND major searched -- works identically for any major pair, not a
// specific hardcoded field.
export function classifyComboEvidence(secondaryTitle) {
  const hint = programTypeHintFromTitle(secondaryTitle);
  if (hint !== "Unknown") {
    return { status: "Second program is not confirmed as an undergraduate major", secondaryProgramTypeHint: hint };
  }
  return { status: "Programs exist - double-major rules not verified", secondaryProgramTypeHint: "Unknown" };
}

// ---------------- CRUD (student-scoped; callers force student_id = UID) ----------------

const newId = () => `dmv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function listDoubleMajorVerifications(studentId, collegeId = null) {
  if (collegeId) {
    return db.prepare("SELECT * FROM double_major_verifications WHERE student_id=? AND college_id=? ORDER BY updated_at DESC").all(studentId, collegeId);
  }
  return db.prepare("SELECT * FROM double_major_verifications WHERE student_id=? ORDER BY updated_at DESC").all(studentId);
}

export function getDoubleMajorVerification(studentId, verificationId) {
  return db.prepare("SELECT * FROM double_major_verifications WHERE student_id=? AND verification_id=?").get(studentId, verificationId);
}

const FIELD_MAP = {
  collegeId: "college_id", collegeName: "college_name",
  primaryProgramRequested: "primary_program_requested", secondaryProgramRequested: "secondary_program_requested",
  primaryOfficialProgramName: "primary_official_program_name", secondaryOfficialProgramName: "secondary_official_program_name",
  primaryProgramType: "primary_program_type", secondaryProgramType: "secondary_program_type",
  officialPolicyName: "official_policy_name", doubleMajorPolicyType: "double_major_policy_type",
  doubleMajorAllowedStatus: "double_major_allowed_status", sourceUrl: "source_url", sourceLabel: "source_label",
  sourceType: "source_type", lastChecked: "last_checked", verificationStatus: "verification_status",
  restrictions: "restrictions", notes: "notes",
};

export function createDoubleMajorVerification(studentId, b) {
  const ts = Date.now();
  const verificationId = newId();
  const row = { verification_id: verificationId, student_id: studentId, created_at: ts, updated_at: ts };
  for (const [camel, snake] of Object.entries(FIELD_MAP)) row[snake] = b[camel] ?? null;
  row.primary_program_type = row.primary_program_type || "Unknown";
  row.secondary_program_type = row.secondary_program_type || "Unknown";
  row.double_major_policy_type = row.double_major_policy_type || "Unknown";
  row.double_major_allowed_status = row.double_major_allowed_status || "Unknown";
  row.verification_status = row.verification_status || "Needs manual verification";
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO double_major_verifications (${cols.join(",")}) VALUES (${cols.map((c) => `@${c}`).join(",")})`).run(row);
  return getDoubleMajorVerification(studentId, verificationId);
}

export function updateDoubleMajorVerification(studentId, verificationId, b) {
  const existing = getDoubleMajorVerification(studentId, verificationId);
  if (!existing) return null;
  const updates = {};
  for (const [camel, snake] of Object.entries(FIELD_MAP)) if (b[camel] !== undefined) updates[snake] = b[camel];
  updates.updated_at = Date.now();
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE double_major_verifications SET ${set} WHERE student_id=@student_id AND verification_id=@verification_id`)
    .run({ ...updates, student_id: studentId, verification_id: verificationId });
  return getDoubleMajorVerification(studentId, verificationId);
}

export function deleteDoubleMajorVerification(studentId, verificationId) {
  db.prepare("DELETE FROM double_major_verifications WHERE student_id=? AND verification_id=?").run(studentId, verificationId);
}

// Find a verification record for a specific college + requested pairing
// (case-insensitive), if one exists. Used to decide My List / search-result
// badges without duplicating the matching logic in every caller.
export function findVerificationForPair(studentId, collegeId, primaryRequested, secondaryRequested) {
  const rows = listDoubleMajorVerifications(studentId, collegeId);
  const norm = (s) => String(s || "").toLowerCase().trim();
  return rows.find((r) => norm(r.primary_program_requested) === norm(primaryRequested)
    && norm(r.secondary_program_requested) === norm(secondaryRequested)) || null;
}
