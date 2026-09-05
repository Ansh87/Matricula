// decisionSupport.js - rule-based (no invented facts) helpers for the Decision
// Plan: major-specific admission-risk defaults, cost-risk defaults, and the
// Strategy Notes generator. Everything here either (a) reflects data already
// on the decision_plan_item / discovered_programs / verification_checklist
// rows the family entered or verified, or (b) is generic, non-school-specific
// planning language. Nothing that looks like a school-specific fact is ever
// synthesized - unknowns are always phrased as "Verify with official source."

// Majors/fields where a general university-wide admit rate is well known to be
// a poor proxy for the real difficulty of getting into THAT specific program
// (impacted majors, direct-admit schools, capped enrollment, etc). When a
// program/track matches one of these and the family hasn't recorded
// school-specific evidence, we default to a caution flag - never to a specific
// risk level we can't support.
const CAUTION_KEYWORDS = [
  "computer science", "cs ", " cs", "engineering", "business", "data science",
  "nursing", "direct admit", "direct-admit", "direct to major", "impacted",
];

export function needsMajorRiskCaution(text) {
  const t = ` ${(text || "").toLowerCase()} `;
  return CAUTION_KEYWORDS.some((k) => t.includes(k));
}

export const MAJOR_RISK_WARNING =
  "The general admit rate may not reflect this major or school. Verify major-specific admission rules.";

export const ADMISSION_BASIS_OPTIONS = [
  "University-wide admission", "School/college-level admission", "Direct-to-major admission",
  "Impacted/capped major", "Internal transfer required", "Unknown",
];
export const MAJOR_RISK_OPTIONS = ["Normal", "Higher than university average", "Highly competitive", "Unknown"];
export const COST_RISK_OPTIONS = ["Low", "Medium", "High", "Unknown"];
export const ADMISSION_CATEGORY_OPTIONS = ["Dream / Lottery", "Reach", "Target", "Safety", "Financial Safety", "In-state Anchor"];
export const DECISION_STATUS_OPTIONS = ["Keep", "Maybe", "Remove", "Need to verify", "Applied", "Accepted", "Rejected", "Waitlisted"];
export const APPLICATION_ROUND_OPTIONS = ["ED", "EA", "REA", "RD", "Rolling"];

// Cost risk default from whatever the family has filled in so far. Never
// invents a sticker price or net price - only reasons from fields present.
export function defaultCostRisk({ npcCompleted, estimatedFamilyCost, budget, averageNetPrice }) {
  if (!npcCompleted) return "Unknown";
  if (estimatedFamilyCost == null || budget == null) return "Unknown";
  if (estimatedFamilyCost <= budget) return "Low";
  if (estimatedFamilyCost <= budget * 1.25) return "Medium";
  return "High";
}

function safe(v, fallback = "Verify with official source.") {
  const s = (v ?? "").toString().trim();
  return s.length ? s : fallback;
}

function listOrNote(arr, fallback) {
  if (!arr || !arr.length) return fallback;
  return arr.join("; ");
}

// Builds the 7 Strategy Notes fields from: the decision-plan item, the
// student's profile, any discovered_programs evidence linked to this college,
// and the verification checklist (used to derive concrete "actions before
// applying"). Purely templated/deterministic - no LLM call, so it never
// hallucinates a school-specific fact.
export function generateStrategyNotes({ item, profile = {}, programs = [], checklist = null }) {
  const collegeName = item.college_name || "this college";
  const programName = item.program_name || "the intended program";
  const track = item.career_track || profile.primaryMajor || null;

  const evidenceCount = programs.length;
  const verifiedPrograms = programs.filter((p) =>
    ["Official source verified", "User verified"].includes(p.verification_status));

  const whyCollege = evidenceCount
    ? `${collegeName} is on this list with ${evidenceCount} program/opportunity record${evidenceCount === 1 ? "" : "s"} found for it` +
      (verifiedPrograms.length ? `, ${verifiedPrograms.length} of which ${verifiedPrograms.length === 1 ? "is" : "are"} verified.` : ", still needing verification.") +
      ` Admission category recorded: ${safe(item.admission_category, "not yet set")}.`
    : `No Programs-tab evidence has been linked to ${collegeName} yet. Add an official program URL or run College Scorecard seeding before relying on this college in the final list. Verify with official source.`;

  const whyProgram = programs.length
    ? `Evidence for ${programName}: ${programs.slice(0, 3).map((p) => `${p.program_name} (${p.verification_status})`).join("; ")}.`
    : `No specific program evidence recorded yet for ${programName} at ${collegeName}. Verify with official source.`;

  let bestRound = "Verify with official source.";
  const cat = (item.admission_category || "").toLowerCase();
  if (cat.includes("reach") || cat.includes("dream")) {
    bestRound = "If this college offers Early Decision/REA and it is a genuine top choice, applying early can meaningfully raise odds at reach schools that reward demonstrated first-choice interest - but ED is binding and forecloses comparing aid offers. Confirm ED/EA/REA availability and binding terms on the official admissions page before deciding.";
  } else if (cat.includes("target")) {
    bestRound = "EA (non-binding) is often a reasonable way to get an early read at a target school without giving up the ability to compare offers. Confirm the college actually offers EA - not all do.";
  } else if (cat.includes("safety")) {
    bestRound = "RD or rolling admission is usually sufficient for a safety/financial-safety school; save ED/EA bandwidth for reach/target schools. Confirm the college's actual deadlines.";
  }

  const activities = [];
  if (profile.hasResearch) activities.push("research experience");
  if (profile.hasInternship) activities.push("internship experience");
  if (profile.hasLeadership) activities.push("leadership roles");
  if (profile.hasVolunteer) activities.push("service/volunteer work");
  const activitiesToEmphasize = activities.length
    ? `Emphasize: ${activities.join(", ")} - especially any that connect directly to ${track || "the intended program"}.`
    : "No standout activity flags are set on the profile yet. Add resume/activity detail in Profile so this can be more specific.";

  const risks = [];
  if (needsMajorRiskCaution(`${programName} ${track || ""}`) && (item.major_risk === "Unknown" || !item.major_risk)) {
    risks.push(MAJOR_RISK_WARNING);
  } else if (item.major_risk && item.major_risk !== "Normal") {
    risks.push(`Major-specific admission risk recorded as "${item.major_risk}" (basis: ${safe(item.admission_basis, "unknown")}).`);
  }
  if (item.cost_risk && item.cost_risk !== "Low") risks.push(`Cost risk recorded as "${item.cost_risk}".`);
  if (item.program_verification_status && item.program_verification_status.includes("Needs")) {
    risks.push("Program is still unverified - do not finalize this college until an official source confirms the program details.");
  }

  const actions = [];
  if (checklist) {
    if (!checklist.official_program_page_checked) actions.push("Open and read the official program page.");
    if (checklist.exact_major_exists === "Unknown") actions.push("Confirm the exact major/track exists (not just a related field).");
    if (!checklist.deadline_checked) actions.push("Confirm the exact application deadline on the official site.");
    if (!checklist.direct_admission_checked && needsMajorRiskCaution(programName)) actions.push("Confirm whether this program requires direct admission or an internal transfer after enrollment.");
  } else {
    actions.push("Start the Program Verification Checklist for this college/program.");
  }
  if (!item.npc_completed) actions.push("Run the college's Net Price Calculator and record the estimate.");

  const questions = [
    `Is ${programName} a direct-admit program, or can students declare it after enrolling?`,
    "What are this program's specific eligibility, deadline, and capacity limits (vs. the university-wide numbers)?",
    "Are there internal transfer restrictions or GPA thresholds to stay in / switch into this program?",
  ];

  return {
    whyCollege,
    whyProgram,
    bestRound,
    essayAngle: track
      ? `Consider an essay angle that connects genuine interest/experience in ${track} to this specific college - but only reference college-specific programs/resources you have verified actually exist. Verify with official source before naming any specific lab, class, or professor.`
      : "Set a primary major/track in Profile to get a more specific essay-angle suggestion. Verify with official source before naming any specific lab, class, or professor.",
    activitiesToEmphasize,
    risks: listOrNote(risks, "No elevated risks flagged from recorded data yet."),
    actionsBeforeApplying: listOrNote(actions, "No outstanding verification actions recorded."),
    questionsForAdmissions: questions.join(" | "),
  };
}

// ---------------------------------------------------------------------------
// Final List Health Check (Feature 2) -- deterministic guidance messages
// layered on top of the Decision Plan's existing summary counts (byAdmission
// Category, needsVerification, unresolvedCostRisk, missingNetPriceCalc, plus
// the essay/timeline coverage counts passed in from the Essay Center and
// Application Timeline summaries). Never an admissions guarantee -- every
// message is phrased as planning guidance, not a prediction of outcomes.
// Purely a function of counts the caller already computed; no new data
// source, no invented facts, no scoring/ranking logic touched.
// ---------------------------------------------------------------------------
export function buildFinalListGuidance({
  totalColleges, byAdmissionCategory, reachTargetSafety, needsVerification,
  unresolvedCostRisk, missingNetPriceCalc, essayCoverageMissing = 0, timelineMissing = 0,
}) {
  if (!totalColleges) {
    return { messages: ["Add colleges to your Decision Plan to see a health check for your final list."], overallStatus: "Not started" };
  }

  const messages = [];
  const reach = reachTargetSafety?.reach || 0;
  const target = reachTargetSafety?.target || 0;
  const safety = reachTargetSafety?.safety || 0;
  const financialSafety = byAdmissionCategory?.["Financial Safety"] || 0;
  const inStateAnchor = byAdmissionCategory?.["In-state Anchor"] || 0;

  if (reach > target + safety) messages.push("This list may be too reach-heavy -- consider adding more Target or Safety schools before finalizing.");
  if (target === 0) messages.push("Not enough Target schools -- this list currently has none recorded.");
  if (safety === 0) messages.push("Not enough Safety schools -- this list currently has none recorded.");
  if (financialSafety === 0) messages.push("This list still needs financial-safety confirmation -- no college is marked \"Financial Safety.\"");
  if (inStateAnchor === 0) messages.push("No in-state anchor recorded. If in-state affordability matters for your family, consider adding one.");
  if (needsVerification > totalColleges / 2) messages.push("This list has too many unverified program assumptions -- more than half the colleges still need program verification.");
  if (unresolvedCostRisk > 0) messages.push(`${unresolvedCostRisk} college(s) have unresolved or high cost risk -- run each one's Net Price Calculator before finalizing.`);
  if (missingNetPriceCalc > 0) messages.push(`Missing cost verification: ${missingNetPriceCalc} college(s) have not had a Net Price Calculator run yet.`);
  if (essayCoverageMissing > 0) messages.push(`${essayCoverageMissing} college(s) have no essay prompts tracked yet -- open Essay Center to check requirements.`);
  if (timelineMissing > 0) messages.push(`Missing timeline verification: ${timelineMissing} college(s) have no application deadlines on file yet.`);

  if (!messages.length) {
    messages.push("This list looks balanced for planning purposes -- Reach/Target/Safety mix, financial safety, and program verification all look reasonable so far.");
    messages.push("Ready for family review.");
  }

  const overallStatus = messages.some((m) => m.includes("too") || m.includes("Missing") || m.includes("Not enough") || m.includes("no college"))
    ? "Needs attention" : "Strong balanced list";

  return {
    messages, overallStatus,
    disclaimer: "This is planning guidance based on the categories and verification status you've recorded -- not an admissions guarantee or a prediction of acceptance odds.",
  };
}
