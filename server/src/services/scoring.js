// scoring.js - transparent, rule-based fit + admission-probability engine.
// It consumes ONLY real values from College Scorecard (admission rate, SAT,
// net price, grad rate, earnings). When an input field is null (unavailable),
// the corresponding sub-score is returned as null rather than guessed, and the
// overall score is computed from whatever real signals exist.
//
// Every probability is expressed as a RANGE + label, never a false-precision %.

import { MAJOR_CIP_MAP } from "./scorecard.js";
import { deriveProfileSignals } from "./profileSignals.js";

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ACT->SAT concordance (approximate, College Board/ACT official table).
function actToSat(act) {
  if (act == null) return null;
  const map = { 36:1590,35:1540,34:1500,33:1460,32:1430,31:1400,30:1370,29:1340,28:1310,27:1280,26:1240,25:1210,24:1180,23:1140,22:1110,21:1080,20:1040,19:1010,18:970 };
  return map[Math.round(act)] ?? null;
}

// --- Extracurricular strength: from parsed activities, awards, research,
// leadership. Feeds both the profile picture and a modest admission nudge at
// holistic colleges. 0-100. Everything here comes from the student's own
// profile/documents; nothing invented.
export function ecStrength(profile) {
  // Delegates to the shared signal extractor so that pasted resume/activities
  // text genuinely moves this score (and the UI can show the same signals).
  return deriveProfileSignals(profile).extracurricularStrength;
}

// --- Academic fit: reflects FOUR YEARS of coursework, not just one test.
// A transparent base (SAT/ACT vs the college's midpoint) plus a set of BOUNDED
// nudges - unweighted GPA, weighted-GPA rigor gap, AP/IB/Honors count, course
// rigor, class rank, and research. Every nudge is individually capped so no
// single input can dominate the score. Each cap is stated inline for clarity.
export function academicFit(profile, c) {
  if (c.satMidpoint == null && c.admissionRate == null) return null;

  // --- Base: SAT/ACT vs the college's midpoint. Still central, but its swing
  // is capped to +/-22 so a very high or low test can't single-handedly set the
  // score. When no test is available, we start from a neutral 50 and lean on
  // the coursework signals below (test-optional friendly).
  let base = 50;
  const effectiveSat = profile.satSuper || profile.sat || actToSat(profile.actSuper || profile.act);
  if (c.satMidpoint != null && effectiveSat) {
    const delta = effectiveSat - c.satMidpoint; // + means student above midpoint
    const testSwing = clamp(delta / 6, -22, 22); // ~1 pt / 6 SAT pts, capped +/-22
    base = 50 + testSwing;
  }
  let score = base;

  // --- Unweighted GPA (0-4 scale): a core four-year signal. Capped at +/-12.
  if (profile.gpa) {
    score += clamp((profile.gpa - 3.5) * 10, -12, 12);
  }

  // --- Weighted GPA: a RIGOR/CONTEXT signal. Weighted scales vary by school
  // (5.0, 4.5, etc.), so instead of assuming a scale we reward the GAP between
  // weighted and unweighted GPA - how much harder-than-average the courseload
  // was. Scale-independent, and capped small (+6) so it supplements, never leads.
  if (profile.gpaWeighted != null && profile.gpa != null) {
    const rigorGap = profile.gpaWeighted - profile.gpa; // e.g. 4.42 - 4.0 = 0.42
    if (rigorGap > 0) score += clamp(rigorGap * 12, 0, 6); // ~+6 at a 0.5 gap
  }

  // --- AP/IB/Honors count: a rigor signal with diminishing returns. Each course
  // adds ~1.2 pts, capped at +8 (reached around 7 courses) so a big number can't
  // dominate. A student with 10+ rigorous courses gets the full +8.
  if (profile.apCount != null && profile.apCount > 0) {
    score += clamp(profile.apCount * 1.2, 0, 8);
  }

  // --- Course rigor flag ("most rigorous load available"): flat +4 rigor signal.
  if (profile.rigorHigh) score += 4;

  // --- Class rank: a small positive signal (top-decile boosts). Max +6.
  if (profile.classRank && profile.classSize) {
    const pct = profile.classRank / profile.classSize; // lower is better
    if (pct <= 0.05) score += 6;
    else if (pct <= 0.10) score += 4;
    else if (pct <= 0.25) score += 2;
  }

  // --- Research: a small academic-readiness signal for selective schools. +3.
  if (profile.hasResearch) score += 3;

  return Math.round(clamp(score));
}

// --- Financial fit: net price (or in/out tuition) vs family budget, adjusted
// by the student's stated cost preference and in-state status.
export function financialFit(profile, c, inState) {
  const cost = estNetCost(profile, c, inState);
  if (cost == null) return null;
  if (!profile.budget) return null;
  const ratio = cost / profile.budget;
  let score;
  if (ratio <= 0.7) score = 100;
  else if (ratio <= 1.0) score = Math.round(100 - (ratio - 0.7) * 100);
  else if (ratio <= 1.4) score = Math.round(70 - (ratio - 1.0) * 100);
  else score = clamp(Math.round(30 - (ratio - 1.4) * 40), 0, 30);

  // Cost preference nudges.
  const pref = profile.costPref || "any";
  if (pref === "in_state" && inState) score = clamp(score + 12);
  if (pref === "in_state" && !inState) score = clamp(score - 8);
  if (pref === "value") {
    // reward strong earnings-to-cost.
    if (c.medianEarnings && cost && c.medianEarnings / cost > 3) score = clamp(score + 8);
  }
  if (pref === "aid" && c.averageNetPrice != null && c.averageNetPrice < cost * 0.8) score = clamp(score + 6);
  return clamp(Math.round(score));
}

// Best available cost estimate, clearly derived from official fields.
export function estNetCost(profile, c, inState) {
  if (c.averageNetPrice != null) return c.averageNetPrice;
  if (inState && c.tuitionInState != null) return c.tuitionInState;
  if (!inState && c.tuitionOutOfState != null) return c.tuitionOutOfState;
  return null;
}

// --- ROI: 4-year net cost vs. projected early-career earnings. Returns a
// distinct score plus the underlying figures (all from official Scorecard
// fields - earnings and net price). Payback = years of the earnings premium
// (over a ~$40k HS-diploma baseline) needed to recoup 4-year cost.
export function computeROI(profile, c, inState) {
  const annualNet = estNetCost(profile, c, inState);
  const earnings = c.medianEarnings; // median 10-yr-after-entry earnings
  if (annualNet == null || earnings == null) {
    return { score: null, fourYearCost: annualNet != null ? annualNet * 4 : null, earnings: earnings ?? null, paybackYears: null, note: "ROI needs both net price and earnings; one isn't published for this college." };
  }
  const fourYearCost = annualNet * 4;
  const BASELINE = 40000; // approx. median earnings without a bachelor's
  const premium = Math.max(earnings - BASELINE, 1);
  const paybackYears = +(fourYearCost / premium).toFixed(1);
  // Score: lower payback is better. <2y excellent, >12y poor.
  let score;
  if (paybackYears <= 2) score = 100;
  else if (paybackYears <= 12) score = Math.round(100 - (paybackYears - 2) * 7);
  else score = clamp(Math.round(30 - (paybackYears - 12) * 3), 0, 30);
  return {
    score: clamp(score),
    fourYearCost,
    earnings,
    annualNet,
    paybackYears,
    debt: c.medianDebt ?? null,
    note: "Estimate from official net price and median earnings; your actual aid and outcome will differ.",
  };
}

// --- Major / Program fit: does this college actually offer the student's
// intended major at bachelor's level? Uses official Scorecard CIP program data.
// Returns { score, status, matchedTitles }.
//   status: "verified"    -> official program data confirms a match
//           "no-match"    -> official program data present, but NO match
//           "unavailable" -> college publishes no program data; we cannot claim
export function majorFit(profile, c) {
  const interests = profile.interests || [];
  if (!interests.length) return { score: null, status: "unavailable", matchedTitles: [], note: "No intended major entered." };

  // Preferred path: a lightweight program-verification lookup already told us
  // whether this college offers a bachelor's program in the student's major.
  if (typeof c.programVerified === "boolean") {
    if (c.programVerified) {
      return { score: 100, status: "verified", matchedTitles: [],
        note: "Official College Scorecard field-of-study data confirms a bachelor's program in your intended major." };
    }
    return { score: 15, status: "no-match", matchedTitles: [],
      note: "Official program data doesn't show a bachelor's program in your intended major." };
  }

  // The lookup itself failed - that's an error, not evidence of anything.
  // Score neutral-low (45): unknown/unverified major data must NOT be rewarded
  // as if a match were confirmed, but the college is not excluded on this basis.
  if (c.programVerificationError) {
    return { score: 45, status: "error", matchedTitles: [],
      note: "Program availability not fully verified - confirm on official college website." };
  }

  // Fallback: full program arrays present on the record (e.g. major search).
  // Same neutral-low treatment for unavailable/partial program data.
  if (!c.hasProgramData || !Array.isArray(c.bachelorCips) || !c.bachelorCips.length) {
    return { score: 45, status: "unavailable", matchedTitles: [],
      note: "Program availability not fully verified - confirm on official college website." };
  }

  const collegeCips = new Set(c.bachelorCips);
  const matchedTitles = [];
  let matchedInterests = 0;

  for (const interest of interests) {
    const cips = cipsForInterest(interest);
    if (!cips.length) continue;
    const hit = cips.some((cip) => collegeCips.has(cip));
    if (hit) {
      matchedInterests++;
      const titles = c.bachelorProgramTitles || [];
      const t = titles.find((x) => x.toLowerCase().includes(interest.toLowerCase().split(" ")[0]));
      if (t) matchedTitles.push(t);
    }
  }

  if (!matchedInterests) {
    return { score: 15, status: "no-match", matchedTitles: [],
      note: "Official program data doesn't show a bachelor's program in your intended major." };
  }

  const frac = matchedInterests / interests.length;
  const score = clamp(Math.round(55 + frac * 45));
  return { score, status: "verified", matchedTitles: [...new Set(matchedTitles)].slice(0, 3),
    note: `Official College Scorecard field-of-study data shows a bachelor's program matching ${matchedInterests} of your ${interests.length} intended major(s).` };
}

function cipsForInterest(interest) {
  const key = (interest || "").toLowerCase().trim();
  if (MAJOR_CIP_MAP[key]) return MAJOR_CIP_MAP[key];
  for (const k of Object.keys(MAJOR_CIP_MAP)) {
    if (key.includes(k) || k.includes(key)) return MAJOR_CIP_MAP[k];
  }
  return [];
}

// --- Career/ROI fit: median earnings vs debt (both official).
export function careerFit(c) {
  if (c.medianEarnings == null) return null;
  // Normalize earnings 30k..100k -> 40..100; subtract debt burden.
  let score = clamp(40 + ((c.medianEarnings - 30000) / 70000) * 60);
  if (c.medianDebt != null && c.medianEarnings > 0) {
    const burden = c.medianDebt / c.medianEarnings; // debt-to-earnings
    score = clamp(score - burden * 40);
  }
  return Math.round(score);
}

// --- Outcome fit: graduation + retention (official).
export function outcomeFit(c) {
  const parts = [];
  if (c.graduationRate != null) parts.push(c.graduationRate * 100);
  if (c.retentionRate != null) parts.push(c.retentionRate * 100);
  if (!parts.length) return null;
  return Math.round(clamp(parts.reduce((a, b) => a + b, 0) / parts.length));
}

// --- Overall fit: weighted mean of whatever sub-scores are available.
// Weights per spec: academic 25, major 25, financial 15, career 15, outcome 10, ec 10.
// Null sub-scores are skipped and remaining weights re-normalize, so a college
// with no program data isn't unfairly punished in the *score* (it's handled by
// the Match filter instead, which requires verified major fit).
export const DEFAULT_WEIGHTS = { academic: 0.25, major: 0.25, financial: 0.15, career: 0.15, outcome: 0.10, ec: 0.10 };

export function overallFit(subs, weights = DEFAULT_WEIGHTS) {
  let sum = 0, wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (subs[k] != null) { sum += subs[k] * w; wsum += w; }
  }
  if (wsum === 0) return null;
  return Math.round(sum / wsum);
}

// --- Admission probability: derived from official admission rate + academic
// standing + extracurricular strength (holistic nudge). Returns a labeled
// RANGE. Sub-8% acceptance is always Reach.
// Canonical admission buckets. Everything downstream maps through these.
export const CATEGORIES = ["Far Reach", "Reach", "Target", "Likely", "Safety", "Financial Safety", "Insufficient Data"];

// ONE shared normalizer. The legacy UI groups into Reach/Target/Safety.
export function normalizeCategory(cat) {
  if (!cat) return "Insufficient Data";
  const k = String(cat).toLowerCase().trim();
  if (["far reach", "high reach"].includes(k)) return "Far Reach";
  if (k === "reach") return "Reach";
  if (k === "target") return "Target";
  if (k === "likely") return "Likely";
  if (k === "safety") return "Safety";
  if (k === "financial safety") return "Financial Safety";
  return "Insufficient Data";
}

// Collapse the fine-grained buckets into the three the filters use.
export function coarseCategory(cat) {
  const c = normalizeCategory(cat);
  if (c === "Far Reach" || c === "Reach") return "Reach";
  if (c === "Target") return "Target";
  if (c === "Likely" || c === "Safety" || c === "Financial Safety") return "Safety";
  return "Insufficient Data";
}

// How much of the data we need is actually present (0..1). Used to refuse
// confident classification when the college publishes very little.
export function dataCompleteness(c) {
  const checks = [
    c.admissionRate != null,
    c.satMidpoint != null || c.actMidpoint != null,
    c.averageNetPrice != null || c.tuitionInState != null,
    c.graduationRate != null,
    c.medianEarnings != null,
    c.size != null,
  ];
  return checks.filter(Boolean).length / checks.length;
}

export function classify(profile, c, academic, ec) {
  const completeness = dataCompleteness(c);

  if (c.admissionRate == null) {
    return { category: "Insufficient Data", label: "Data unavailable", range: null, completeness,
      note: "Admission rate not published by College Scorecard for this school." };
  }

  const baseRate = c.admissionRate * 100; // percent

  // HARD RULES on raw selectivity - these are properties of the college, not
  // the student. No profile, however strong, makes a <10% admit school a safety.
  if (baseRate < 6) {
    return { category: "Far Reach", label: "Very Low", range: "below 15%", completeness,
      note: "Extremely selective. Even exceptional applicants are frequently denied. Not a guarantee." };
  }
  if (baseRate < 10) {
    return { category: "Reach", label: "Very Low", range: "below 15%", completeness,
      note: "Highly selective. Admissions are holistic and unpredictable." };
  }

  // Academic + EC adjustment for everything else.
  let adj = baseRate;
  if (academic != null) adj = baseRate * (0.6 + academic / 125); // academic 0..100 -> 0.6..1.4
  if (ec != null) {
    const holisticWeight = baseRate < 25 ? 0.20 : baseRate < 50 ? 0.12 : 0.05;
    adj = adj * (1 + ((ec - 50) / 100) * holisticWeight);
  }

  // Refuse a confident "safety" call when we barely know the school, or when
  // we can't judge the student's academic standing against it.
  const canCallSafe = completeness >= 0.5 && academic != null;

  let category, label, range;
  if (adj >= 85 && baseRate >= 60) { category = "Safety"; label = "Very High"; range = "70%+"; }
  else if (adj >= 70) { category = "Likely"; label = "Very High"; range = "70%+"; }
  else if (adj >= 50) { category = "Likely"; label = "High"; range = "50–70%"; }
  else if (adj >= 30) { category = "Target"; label = "Moderate"; range = "30–50%"; }
  else if (adj >= 15) { category = "Reach"; label = "Low"; range = "15–30%"; }
  else { category = "Far Reach"; label = "Very Low"; range = "below 15%"; }

  // Downgrade an over-confident Safety/Likely when data is thin.
  if (!canCallSafe && (category === "Safety" || category === "Likely")) category = "Target";

  // A "Financial Safety" is a Likely/Safety admit that also fits the budget.
  const netCost = estNetCost(profile, c, profile.state && c.state === profile.state);
  if ((category === "Safety" || category === "Likely") && profile.budget && netCost != null && netCost <= profile.budget) {
    category = "Financial Safety";
  }

  return { category, label, range, completeness,
    note: "Admissions are holistic and unpredictable. This estimate is not a guarantee." };
}

export function scoreCollege(profile, c) {
  const inState = profile.state && c.state && profile.state === c.state;
  const academic = academicFit(profile, c);
  const financial = financialFit(profile, c, inState);
  const career = careerFit(c);
  const outcome = outcomeFit(c);
  const ec = ecStrength(profile);
  const mf = majorFit(profile, c);
  const subs = { academic, major: mf.score, financial, career, outcome, ec };
  const overall = overallFit(subs);
  const admission = classify(profile, c, academic, ec);
  const netCost = estNetCost(profile, c, inState);
  const roi = computeROI(profile, c, inState);
  const round = recommendRound(profile, c, admission);
  const testAdvice = testSubmitAdvice(profile, c);
  const risks = riskFactors(profile, c, admission, inState);
  const improvements = improvementTips(profile, c, admission);
  const verdict = finalVerdict(overall, admission, subs);
  const explanation = matchExplanation(profile, c, { academic, mf, financial, outcome, admission, netCost, inState });
  return { college: c, subs, overall, admission, netCost, roi, round, testAdvice, risks,
    improvements, verdict, inState, majorFit: mf, explanation };
}

// --- Why did this college match? Concrete reasons + concerns (spec §9).
export function matchExplanation(profile, c, ctx) {
  const { academic, mf, outcome, netCost, inState } = ctx;
  const reasons = [], concerns = [];

  if (mf.status === "verified") {
    reasons.push(mf.matchedTitles.length
      ? `Offers a program aligned with your Profile majors/interests (official program data: ${mf.matchedTitles.join(", ")}).`
      : "Official program data confirms a bachelor's program aligned with your Profile majors/interests.");
  } else if (mf.status === "no-match") {
    concerns.push("Official program data does not show a bachelor's program aligned with your Profile majors/interests.");
  } else {
    concerns.push("Program data is partially verified through College Scorecard - confirm exact major availability on the college's official website.");
  }

  if (academic != null) {
    if (academic >= 70) reasons.push("Your academic profile is at or above their typical admitted range.");
    else if (academic >= 45) reasons.push("Your academic profile is near their admitted range.");
    else concerns.push("Your academic profile is below their typical admitted range.");
  }

  if (netCost != null && profile.budget) {
    if (netCost <= profile.budget) reasons.push(`Estimated net cost (${fmtMoney(netCost)}) is within your budget.`);
    else concerns.push(`Estimated net cost (${fmtMoney(netCost)}) may exceed your budget of ${fmtMoney(profile.budget)}.`);
  }

  if (outcome != null && outcome >= 70) reasons.push("Strong graduation and outcome data.");
  if (c.admissionRate != null && c.admissionRate < 0.15) concerns.push("Reach school due to a very low admit rate.");
  if (inState && c.controlType === "Public") reasons.push("In-state public option - typically the most affordable, predictable choice.");

  return { reasons: reasons.slice(0, 5), concerns: concerns.slice(0, 4) };
}

function fmtMoney(n) { return n == null ? "n/a" : `$${Math.round(n).toLocaleString()}`; }

// Should the student submit test scores here? Compares their best score to the
// college's range and the college's test policy.
export function testSubmitAdvice(profile, c) {
  const sat = profile.satSuper || profile.sat;
  const act = profile.actSuper || profile.act;
  if (!sat && !act) return { submit: null, text: "No test score entered. Many colleges are test-optional - you can apply without one." };
  if (c.testPolicy && /not used|Not used/.test(c.testPolicy)) {
    return { submit: false, text: "This college is test-blind - scores aren't considered, so don't worry about submitting." };
  }
  // Compare SAT to range/midpoint.
  const hi = c.sat75 || (c.satMidpoint != null ? c.satMidpoint + 60 : null);
  const mid = c.satMidpoint;
  if (sat && mid != null) {
    if (sat >= (c.sat75 || mid)) return { submit: true, text: `Your SAT (${sat}) is at or above their upper range - submitting strengthens your application.` };
    if (sat >= mid) return { submit: true, text: `Your SAT (${sat}) is around their midpoint (${mid}) - submitting is generally fine.` };
    if (sat >= (c.sat25 || mid - 60)) return { submit: null, text: `Your SAT (${sat}) is in their lower-middle range - submitting is a judgment call; test-optional may be safer.` };
    return { submit: false, text: `Your SAT (${sat}) is below their typical range (mid ${mid}) - applying test-optional is likely the stronger choice.` };
  }
  return { submit: null, text: "Compare your score to this college's middle-50% range before deciding; test-optional is an option at many schools." };
}

// What makes this college risky for THIS student - honest, specific.
export function riskFactors(profile, c, admission, inState) {
  const out = [];
  const sat = profile.satSuper || profile.sat || actToSat(profile.actSuper || profile.act);
  if (c.satMidpoint != null && sat && sat < (c.sat25 || c.satMidpoint - 60)) {
    out.push("Your test score is below their typical admitted range.");
  }
  if (c.admissionRate != null && c.admissionRate < 0.10) out.push("Extremely low admit rate - even strong applicants are frequently denied.");
  if (admission?.category === "Reach") out.push("Classified as a reach; treat any acceptance as a bonus, not a plan.");
  if (!inState && c.tuitionOutOfState != null && profile.budget && c.tuitionOutOfState > profile.budget * 1.3) {
    out.push("Out-of-state cost runs well above your budget unless you get strong aid.");
  }
  if (c.graduationRate != null && c.graduationRate < 0.6) out.push("Lower graduation rate - worth asking why before committing.");
  if (profile.gpa && profile.gpa < 3.3 && c.admissionRate != null && c.admissionRate < 0.3) out.push("Your GPA is below what this selectivity level usually expects.");
  return out;
}

// What the student could improve to strengthen this specific application.
export function improvementTips(profile, c, admission) {
  const out = [];
  const sat = profile.satSuper || profile.sat;
  if (c.satMidpoint != null && sat && sat < c.satMidpoint) {
    const gap = c.satMidpoint - sat;
    out.push(`Raising your SAT ~${Math.min(gap, 100)} points would move you toward their midpoint.`);
  }
  if (!profile.hasResearch && c.admissionRate != null && c.admissionRate < 0.2) out.push("A research project or independent work stands out at selective schools like this.");
  if (!profile.hasLeadership) out.push("A clear leadership role (founder, captain, editor) strengthens a holistic review.");
  if ((profile.awards || "none") === "none") out.push("Earning a recognized award - even regional - adds credibility.");
  if (profile.apCount != null && profile.apCount < 5 && c.admissionRate != null && c.admissionRate < 0.25) out.push("More rigorous courses (AP/IB/honors) would reinforce your academic case.");
  if (!out.length) out.push("Your profile is already well-aligned here - focus on a strong, authentic essay.");
  return out.slice(0, 3);
}

// Final plain-English verdict.
export function finalVerdict(overall, admission, subs) {
  const cat = admission?.category;
  if (overall == null) return { label: "Consider", tone: "neutral" };
  if (cat === "Safety" && overall >= 65) return { label: "Strong backup - Apply", tone: "safety" };
  if (cat === "Target" && overall >= 65) return { label: "Apply", tone: "target" };
  if (cat === "Reach" && overall >= 70) return { label: "Worth a reach - Apply", tone: "reach" };
  if (overall >= 55) return { label: "Consider", tone: "neutral" };
  return { label: "Backup / lower priority", tone: "neutral" };
}

// --- Application-round strategy: which round makes sense for this student at
// this college, using official round availability + the student's ED openness.
export function recommendRound(profile, c, admission) {
  const cat = admission?.category;
  const willingED = !!profile.willingED;
  const needsAid = profile.costPref === "aid" || (profile.budget && profile.budget < 25000);
  // Base guidance by category.
  if (cat === "Reach") {
    if (willingED && !needsAid) return { round: "ED", why: "This is a reach - applying Early Decision gives the biggest admissions boost, but it's binding, so only commit if the finances work.", caution: needsAid ? "You flagged needing aid; ED limits your ability to compare offers." : null };
    return { round: "EA", why: "A reach school - apply Early Action if offered to show interest and hear back sooner, without a binding commitment.", caution: null };
  }
  if (cat === "Target") {
    return { round: willingED ? "EA or ED" : "EA", why: "A target - Early Action is a low-risk way to lock in an early answer; ED only if it's a clear top choice and finances allow.", caution: null };
  }
  if (cat === "Safety") {
    return { round: "EA / Rolling", why: "A likely admit - apply early or rolling to secure an acceptance early and reduce stress on the rest of your list.", caution: null };
  }
  return { round: "RD", why: "Regular Decision keeps your options open.", caution: null };
}

export function buildRecommendations(profile, colleges) {
  return colleges
    .map((c) => scoreCollege(profile, c))
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}
