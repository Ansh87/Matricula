// applicationPathways.js. Grouping/aggregation logic for the Application
// Pathways module (Part A/B/C). Reads the family's saved college list plus
// whatever application-requirement records they've entered/verified, and
// produces: (1) the Application Route Planner (colleges grouped by platform,
// so the family sees real workload. "These 6 all go through Common App"),
// and (2) the Region view (informational-only regional application guidance).
// Nothing here invents a fact about a specific college, an unverified
// college always shows under "Unknown, needs verification."
import { db } from "../db/database.js";
import { regionForState, regionGuidance } from "./regions.js";

// Prefer the general (no program_label) requirement row for a college when
// grouping by platform, since a family may have a second row for a separate
// honors/scholarship application under the same college.
function primaryRequirementByCollege(requirements) {
  const map = new Map();
  for (const r of requirements) {
    if (!r.college_id) continue;
    const existing = map.get(r.college_id);
    if (!existing || (!r.program_label && existing.program_label)) map.set(r.college_id, r);
  }
  return map;
}

function earliestDeadlineOf(req) {
  if (!req) return null;
  const candidates = [req.ea_deadline, req.ed_deadline, req.rea_scea_deadline, req.priority_deadline, req.rd_deadline, req.rolling_deadline].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    const da = Date.parse(a), db2 = Date.parse(b);
    if (!isNaN(da) && !isNaN(db2)) return da - db2;
    return String(a).localeCompare(String(b));
  })[0];
}

function isVerified(req) {
  return !!req && (req.verification_status === "Official source verified" || req.verification_status === "User verified");
}

// Very-well-known, name-pattern-based platform suggestions for large public
// university systems where every campus shares one application platform --
// this is the same kind of public, well-established fact as "MIT is in
// Cambridge, Massachusetts," not a guess about any individual college's
// requirements. Still surfaced only as a *suggestion*: it never marks a
// record verified, is always shown with its reason, and the family can
// change or reject it. This directly replaces the old behavior where every
// college with no manually-entered record showed the exact same generic
// "possible routes for this region" list regardless of which college it was
// (e.g. a UC campus showing Cal State Apply and ApplyTexas-style noise).
// Patterns cover both the official College Scorecard name ("University of
// California-Berkeley") AND the common short/abbreviated form ("UC
// Berkeley"). Some parts of this app (e.g. the Top STEM/Business/Finance
// editorial rankings) save the short form as the college's name, so a
// pattern that only matched the long official form silently missed those.
// stateGate is a soft cross-check, not a requirement: if the college's state
// is on file AND contradicts the pattern (e.g. name matches "UC ..." but the
// saved state is "TX"), the suggestion is skipped. If state is simply
// missing, which turned out to be common, see the /top-stem/fit fix above
// that was silently leaving it null, the name pattern alone is trusted,
// since "University of California" / "UC <campus>" is specific enough on
// its own to not need a state to confirm it.
const SYSTEM_PATTERNS = [
  { re: /university of california|^uc[\s-]/i, platformId: "uc_application", stateGate: "CA", reason: "University of California campuses share one UC Application." },
  { re: /california state university|^cal state|^cal poly|^csu[\s-]/i, platformId: "cal_state_apply", stateGate: "CA", reason: "California State University campuses share Cal State Apply." },
  { re: /state university of new york|\bsuny\b/i, platformId: "apply_suny", stateGate: "NY", reason: "SUNY campuses share applySUNY." },
  { re: /city university of new york|\bcuny\b/i, platformId: "cuny_application", stateGate: "NY", reason: "CUNY campuses share the CUNY Application." },
  { re: /university of texas|texas a&m|texas state university|texas tech|\but austin\b/i, platformId: "apply_texas", stateGate: "TX", reason: "Most Texas public universities use ApplyTexas." },
];

// Individual, well-known colleges whose primary application route is public,
// stable knowledge (the same kind of fact as "MIT is in Cambridge,
// Massachusetts"), each hand-verified directly against the college's own
// admissions page rather than assumed from reputation. Deliberately narrow --
// only colleges actually checked are listed here; everything else still
// falls through to "Unknown, needs verification" rather than guessing.
// Two of these entries (MIT, Georgetown) exist specifically to say a college
// does NOT use a shared platform, since assuming Common App for every
// selective school is a common and easy mistake.
const COLLEGE_PATTERNS = [
  { re: /\byale university\b|^yale$/i, platformId: "common_app", reason: "Yale accepts the Common App (also Coalition/Scoir or QuestBridge). Verified against admissions.yale.edu." },
  { re: /\bharvard\b/i, platformId: "common_app", reason: "Harvard accepts the Common App (also Coalition/Scoir or QuestBridge). Verified against college.harvard.edu." },
  { re: /\bprinceton university\b|^princeton$/i, platformId: "common_app", reason: "Princeton accepts the Common App (also QuestBridge). Verified against admission.princeton.edu." },
  { re: /\bcolumbia university\b/i, platformId: "common_app", reason: "Columbia accepts the Common App (also QuestBridge). Verified against undergrad.admissions.columbia.edu." },
  { re: /\bcornell university\b/i, platformId: "common_app", reason: "Cornell accepts the Common App. Verified against admissions.cornell.edu." },
  { re: /\bdartmouth\b/i, platformId: "common_app", reason: "Dartmouth accepts the Common App (also QuestBridge). Verified against admissions.dartmouth.edu." },
  { re: /\bbrown university\b/i, platformId: "common_app", reason: "Brown accepts the Common App (also QuestBridge). Verified against admission.brown.edu." },
  { re: /\buniversity of pennsylvania\b|\bupenn\b/i, platformId: "common_app", reason: "UPenn accepts the Common App (also QuestBridge). Verified against admissions.upenn.edu." },
  { re: /\bcarnegie mellon\b/i, platformId: "common_app", reason: "Carnegie Mellon uses the Common App exclusively. Verified against cmu.edu/admission." },
  { re: /\bgeorgia institute of technology\b|\bgeorgia tech\b/i, platformId: "common_app", reason: "Georgia Tech exclusively uses the Common App for first-year admission. Verified verbatim against admission.gatech.edu." },
  { re: /\buniversity of chicago\b|\buchicago\b/i, platformId: "common_app", reason: "UChicago accepts the Common App or the Coalition App. Verified against collegeadmissions.uchicago.edu." },
  { re: /\bmassachusetts institute of technology\b|^mit$/i, platformId: "college_specific", reason: "MIT does not use the Common App. It uses its own application system (myMIT). Verified against mitadmissions.org." },
  { re: /\bgeorgetown university\b/i, platformId: "college_specific", reason: "Georgetown does not use the Common App. It uses its own application system. Verified against uadmissions.georgetown.edu." },
  { re: /\buniversity of illinois.*urbana|\buiuc\b/i, platformId: "college_specific", reason: "UIUC's own myIllini application is the primary portal (Coalition and Common App are also accepted, but a myIllini account is created either way). Verified against admissions.illinois.edu." },
];

export function suggestPlatform(collegeName, state) {
  if (!collegeName) return null;
  for (const p of SYSTEM_PATTERNS) {
    if (!p.re.test(collegeName)) continue;
    if (p.stateGate && state && p.stateGate !== state) continue; // name matched, but a conflicting state is on file
    return { platformId: p.platformId, reason: p.reason };
  }
  for (const p of COLLEGE_PATTERNS) {
    if (p.re.test(collegeName)) return { platformId: p.platformId, reason: p.reason };
  }
  return null;
}

export function buildRoutePlanner(studentId) {
  const savedColleges = db.prepare("SELECT college_id, college_name, state FROM student_college_list WHERE student_id=?").all(studentId);
  const requirements = db.prepare("SELECT * FROM college_application_requirements WHERE student_id=?").all(studentId);
  const byCollege = primaryRequirementByCollege(requirements);
  const platformNames = new Map(db.prepare("SELECT platform_id, platform_name FROM application_platforms").all().map((p) => [p.platform_id, p.platform_name]));

  const groups = new Map();
  for (const s of savedColleges) {
    const req = byCollege.get(s.college_id) || null;
    const platformId = req?.platform_id || "unknown";
    const platformName = req?.platform_name || "Unknown, needs verification";
    if (!groups.has(platformId)) groups.set(platformId, { platformId, platformName, colleges: [] });
    // For colleges with no record yet, attach a name-pattern suggestion (e.g.
    // a "University of California, X" college suggests the UC Application)
    // so "Unknown" isn't a dead end. It's shown as a one-click starting point.
    const suggestion = !req ? suggestPlatform(s.college_name, s.state) : null;
    groups.get(platformId).colleges.push({
      collegeId: s.college_id,
      collegeName: s.college_name || s.college_id,
      earliestDeadline: earliestDeadlineOf(req),
      verified: isVerified(req),
      honorsAppRequired: req?.honors_app_required || "Unknown",
      scholarshipAppRequired: req?.scholarship_app_required || "Unknown",
      programSpecificAppRequired: req?.program_specific_app_required || "Unknown",
      suggestedPlatformId: suggestion?.platformId || null,
      suggestedPlatformName: suggestion ? platformNames.get(suggestion.platformId) || suggestion.platformId : null,
      suggestedReason: suggestion?.reason || null,
    });
  }

  const result = [...groups.values()].map((g) => {
    const deadlines = g.colleges.map((c) => c.earliestDeadline).filter(Boolean).sort();
    const unverified = g.colleges.filter((c) => !c.verified).length;
    const extraApps = g.colleges.filter((c) => ["Yes"].includes(c.honorsAppRequired) || ["Yes"].includes(c.scholarshipAppRequired) || ["Yes"].includes(c.programSpecificAppRequired)).length;
    return {
      ...g,
      count: g.colleges.length,
      earliestDeadline: deadlines[0] || null,
      extraApplicationsNeeded: extraApps,
      actionNeeded: unverified > 0
        ? `${unverified} of ${g.colleges.length} college${g.colleges.length === 1 ? "" : "s"} in this group still need${g.colleges.length === 1 ? "s" : ""} application-route verification.`
        : "All colleges in this group have a verified application route.",
    };
  });
  result.sort((a, b) => b.count - a.count);
  return { groups: result, totalColleges: savedColleges.length };
}

export function buildRegionSummary(studentId) {
  const savedColleges = db.prepare("SELECT college_id, college_name, state FROM student_college_list WHERE student_id=?").all(studentId);
  const platformNames = new Map(db.prepare("SELECT platform_id, platform_name FROM application_platforms").all().map((p) => [p.platform_id, p.platform_name]));
  const groups = new Map();
  for (const s of savedColleges) {
    const regionKey = regionForState(s.state) || "Unknown region. State not set";
    if (!groups.has(regionKey)) groups.set(regionKey, []);
    // Per-college suggestion (see suggestPlatform above) so an individual
    // college shows its own likely route instead of the full list of every
    // route possible anywhere in its region (e.g. a UC campus no longer
    // shows Cal State Apply/Common App/college-specific alongside it).
    const suggestion = suggestPlatform(s.college_name, s.state);
    groups.get(regionKey).push({
      collegeId: s.college_id,
      collegeName: s.college_name || s.college_id,
      state: s.state,
      suggestedPlatformId: suggestion?.platformId || null,
      suggestedPlatformName: suggestion ? platformNames.get(suggestion.platformId) || suggestion.platformId : null,
      suggestedReason: suggestion?.reason || null,
    });
  }
  const result = [...groups.entries()].map(([regionKey, colleges]) => ({
    regionKey,
    guidance: regionGuidance(regionKey),
    colleges,
    count: colleges.length,
  }));
  result.sort((a, b) => b.count - a.count);
  return { regions: result, disclaimer: "Region guidance is general knowledge about how application platforms are typically organized, not a fact about any specific college. Always verify each college's real application route." };
}
