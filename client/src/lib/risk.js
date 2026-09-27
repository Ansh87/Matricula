// risk.js. Client-side "real risk" labeling helpers for evidence-aware
// Match cards. This is a presentation-only labeling layer: it never touches
// fit/admission/cost SCORES computed by the server, and it never invents a
// school-specific fact. It only reasons from data the family already has
// (discovered programs, their own Decision Plan entries) plus generic,
// well-known caution categories (mirrors server/src/services/decisionSupport.js
// CAUTION_KEYWORDS so the same majors get flagged consistently everywhere).

const CAUTION_KEYWORDS = [
  "computer science", "cs ", " cs", "engineering", "business", "data science",
  "nursing", "direct admit", "direct-admit", "direct to major", "impacted",
];

export function needsMajorRiskCaution(text) {
  const t = ` ${(text || "").toLowerCase()} `;
  return CAUTION_KEYWORDS.some((k) => t.includes(k));
}

export const MAJOR_RISK_CAUTION_NOTE =
  "The college's general admit rate may not reflect this major. Some programs (CS, Engineering, Business, Data Science, Nursing, or any direct-admit major) admit separately and are often more competitive than the overall rate. Verify major-specific admission rules on the official site.";

// Summarize what evidence exists for a college's programs, without claiming
// anything that hasn't actually been verified.
export function programEvidenceSummary(programs) {
  const list = programs || [];
  if (!list.length) {
    return { count: 0, verifiedCount: 0, label: "No programs researched yet", level: "unavailable" };
  }
  const verified = list.filter((p) => p.verification_status === "Official source verified" || p.verification_status === "User verified");
  const cipOnly = list.filter((p) => p.verification_status === "College Scorecard / CIP inferred");
  if (verified.length) {
    return {
      count: list.length, verifiedCount: verified.length,
      label: `${verified.length} verified program record${verified.length === 1 ? "" : "s"} (of ${list.length} found)`,
      level: "official",
    };
  }
  if (cipOnly.length) {
    return {
      count: list.length, verifiedCount: 0,
      label: `${cipOnly.length} field-of-study match(es) from College Scorecard, not yet school-specific verified`,
      level: "unavailable",
    };
  }
  return { count: list.length, verifiedCount: 0, label: `${list.length} record(s) still need verification`, level: "unavailable" };
}

// Real-world admission risk label for a college/track pairing, distinct from
// the numeric fit/admission score. Reasons only from: (a) whether the family
// has recorded a major_risk on a Decision Plan item for this college, or
// (b) whether the intended major falls in a well-known "admits separately"
// category and no school-specific evidence has been recorded yet.
export function admissionRiskLabel({ decisionItem, majorText }) {
  if (decisionItem?.major_risk && decisionItem.major_risk !== "Unknown") {
    return { label: decisionItem.major_risk, note: null, level: decisionItem.major_risk === "Normal" ? "safe" : "caution" };
  }
  if (needsMajorRiskCaution(majorText)) {
    return { label: "Needs verification", note: MAJOR_RISK_CAUTION_NOTE, level: "caution" };
  }
  return { label: "Not yet assessed", note: "Add this college to your Decision Plan to record major-specific admission risk.", level: "unknown" };
}

export function costRiskLabel({ decisionItem }) {
  if (!decisionItem) return { label: "Not yet assessed", level: "unknown" };
  if (decisionItem.cost_risk && decisionItem.cost_risk !== "Unknown") {
    return { label: decisionItem.cost_risk, level: decisionItem.cost_risk === "Low" ? "safe" : decisionItem.cost_risk === "High" ? "caution" : "watch" };
  }
  if (!decisionItem.npc_completed) {
    return { label: "Unknown. Run the net price calculator", level: "caution" };
  }
  return { label: "Unknown", level: "watch" };
}

export function verificationStatusLabel({ decisionItem, programs }) {
  if (decisionItem?.program_verification_status) return decisionItem.program_verification_status;
  const summary = programEvidenceSummary(programs);
  if (summary.verifiedCount > 0) return "Official source verified";
  if (summary.count > 0) return "Needs manual verification";
  return "Not researched yet";
}

export function decisionStatusLabel(decisionItem) {
  return decisionItem?.decision_status || "Not on Decision Plan yet";
}
