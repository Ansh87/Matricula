// colleges.js - /api/colleges/* routes. All live-data access to College
// Scorecard happens here, server-side, behind our own key. Errors are honest:
// on upstream failure with no cache we return a clear message, never fake data.
import express from "express";
import { searchColleges, getCollegeById, getByState, getPrograms, searchByAdmissionBand, scanAllColleges, searchByMajor, searchMajorCombos, suggestCombinations, verifyProgramAvailability, cipsForMajorPublic } from "../services/scorecard.js";
import { getVerified } from "../services/verified.js";
import { db } from "../db/database.js";
import { config } from "../config.js";
import { programNotesFor } from "../db/programsSeed.js";
import { scanOfficialSiteMajors } from "../services/programDiscovery.js";

// IPEDS/Scorecard IDs of the 8 Ivy League universities.
const IVY_IDS = new Set(["166027","190150","215062","217156","130794","182670","186131","190415"]);
// Brown 217156, Columbia 190150, Cornell 190415, Dartmouth 182670,
// Harvard 166027, Penn 215062, Princeton 186131, Yale 130794.
import { getSelection, cultureFit } from "../services/selection.js";
import { majorStrategyFor } from "../services/majorStrategy.js";
import { simulate, leverList } from "../services/simulator.js";
import { TOP_STEM, stemFor, stemRank } from "../db/stem.js";
import { TOP_FINANCE } from "../db/finance.js";
import { TOP_BUSINESS } from "../db/business.js";
import { scoreCollege, normalizeCategory, coarseCategory, overallFit } from "../services/scoring.js";
import { buildBalancedList } from "../services/balancedList.js";
import { SCENARIOS, getScenario, scenarioFit, scenarioFitVerified, scenarioVerificationPlan, DEFAULT_SCENARIO_ID } from "../services/scenarios.js";

// Canonical Profile matching-interest list: the student's primary major, second
// major/minor, and academic interests, deduped (case-insensitive) and cleaned.
// Used ONLY to build the profile passed into scoring/verification on the
// Profile-based (no-scenario) paths, so Profile matching reflects the actual
// major fields - not just the legacy `interests` array. Never mutates the saved
// profile.
function profileMatchingInterests(profile) {
  return [
    profile.primaryMajor,
    profile.secondaryMajor,
    ...(profile.interests || []),
  ]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
}

// A shallow copy of the profile whose `interests` is the canonical matching list.
// Only the interests field changes; everything else (academics, budget, etc.) is
// preserved. The original profile object is left untouched.
function scoringProfileFor(profile) {
  return { ...profile, interests: profileMatchingInterests(profile) };
}

// Remove exact-duplicate text lines (trimmed) while preserving order and distinct
// entries. Used to clean explanation reasons/concerns after scenario rewriting.
function uniqueTextLines(lines) {
  return [...new Set((lines || []).filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

// Service academies / military-pathway colleges. These aren't normal options:
// they require nomination, a military service commitment, physical/medical
// qualification, and strong interest in military life. Matches excludes them by
// default (the user can opt in). List is explicit and conservative - it does NOT
// match normal universities that merely host ROTC.
const SERVICE_ACADEMY_NAMES = [
  "united states air force academy",
  "united states naval academy",
  "united states military academy",
  "united states coast guard academy",
  "united states merchant marine academy",
  "citadel military college of south carolina",
  "virginia military institute",
];
function isServiceAcademyOrMilitaryPathway(college) {
  const name = String(college?.name || "").toLowerCase();
  return SERVICE_ACADEMY_NAMES.some((x) => name.includes(x));
}
const SERVICE_ACADEMY_CONCERN =
  "Service academy / military-pathway option - verify nomination requirements, service commitment, physical/medical qualifications, and military lifestyle fit.";

// Attach the service-academy concern to a scored college (when included).
function addServiceAcademyConcern(s) {
  if (!isServiceAcademyOrMilitaryPathway(s.college)) return;
  s.explanation = s.explanation || {};
  s.explanation.concerns = Array.isArray(s.explanation.concerns) ? s.explanation.concerns : [];
  if (!s.explanation.concerns.includes(SERVICE_ACADEMY_CONCERN)) {
    s.explanation.concerns.push(SERVICE_ACADEMY_CONCERN);
  }
}

// Apply a program-verification result to a college for NORMAL (non-scenario)
// matching, honoring partial/truncated lookups. Rules:
//  - lookup unavailable        -> record an error note (unknown)
//  - complete + id present     -> programVerified = true
//  - complete + id absent      -> programVerified = false (confirmed no-match)
//  - PARTIAL  + id present     -> programVerified = true
//  - PARTIAL  + id absent      -> NOT false; record "partial" note (unknown),
//                                 because the id may live beyond the loaded pages
function applyProgramVerification(c, verify) {
  if (!verify.available) {
    c.programVerificationError = verify.error || "program lookup unavailable";
    return;
  }
  if (verify.verified.has(String(c.id))) {
    c.programVerified = true;
    return;
  }
  if (verify.partial) {
    // Truncated results: a missing id is unknown, never confirmed-absent.
    c.programVerificationError = "program lookup partial - major availability not fully verified";
  } else {
    c.programVerified = false; // complete lookup, genuinely not offered
  }
}

// Build a lightweight, scenario-aware program-verification object. Runs one
// tiny `fields=id` verifyProgramAvailability() query per scenario field
// (primary, secondary, each supporting) - NOT the heavy program arrays. Returns
// verified-id Sets the scenario scorer uses to grade each college.
async function buildScenarioVerification(scenario, state) {
  const plan = scenarioVerificationPlan(scenario);

  const runField = async ({ cips }) => {
    if (!cips || !cips.length) return { ids: new Set(), available: false, partial: false, complete: false, error: "no CIP codes for field" };
    const v = await verifyProgramAvailability({ cips, state: state || undefined });
    return { ids: v.verified || new Set(), available: !!v.available,
      partial: !!v.partial, complete: !!v.available && !v.partial, error: v.error || null };
  };

  const primary = await runField(plan.primary);
  const secondary = await runField(plan.secondary);
  const supportingVerifiedIdsByField = new Map();
  for (const s of plan.supporting) {
    supportingVerifiedIdsByField.set(s.field, await runField(s));
  }

  // Overall status: verified if primary ran; partial if only some ran; etc.
  const ran = [primary.available, secondary.available, ...plan.supporting.map((s) => supportingVerifiedIdsByField.get(s.field)?.available)];
  const anyRan = ran.some(Boolean);
  const allRan = ran.every(Boolean);
  const anyPartial = primary.partial || secondary.partial || plan.supporting.some((s) => supportingVerifiedIdsByField.get(s.field)?.partial);
  const anyError = primary.error || secondary.error || plan.supporting.some((s) => supportingVerifiedIdsByField.get(s.field)?.error);
  const verificationStatus = !anyRan ? (anyError ? "error" : "unavailable") : (!allRan || anyPartial) ? "partial" : "verified";

  return {
    primaryVerifiedIds: primary.ids, primaryAvailable: primary.available, primaryPartial: primary.partial,
    secondaryVerifiedIds: secondary.ids, secondaryAvailable: secondary.available, secondaryPartial: secondary.partial,
    supportingVerifiedIdsByField,
    verificationStatus,
  };
}

// Build a temporary scenario profile: same student, but interests replaced by
// the scenario's own fields so the major-fit GATE reflects the selected track.
// Only interests change - academics, budget, state, EC all stay as-is.
function scenarioProfileFor(profile, scenario) {
  return {
    ...profile,
    interests: [scenario.primaryField, scenario.secondaryField, ...(scenario.supportingFields || [])],
  };
}

// Attach scenario fit to a scored college (additive - never alters overall/admission).
// Returns a blended ranking score = 70% base overall + 30% scenario fit, so the
// chosen scenario reshapes ordering without discarding the honest overall fit.
// When `verification` (lightweight scenario-aware) is supplied, uses it; else
// falls back to the program-array scorer (for records that carry bachelorCips).
function withScenario(s, scenario, verification = null) {
  if (!scenario) return s;
  const sf = verification
    ? scenarioFitVerified(scenario, s.college || {}, verification)
    : scenarioFit(scenario, s.college || {});
  s.scenario = { id: scenario.id, name: scenario.scenarioName, ...sf };

  // Scenario-mode major/program score: replace the flat base majorFit (which is a
  // saturated 100 whenever the scenario primary field is verified) with the
  // scenario's WEIGHTED fit (primary + secondary + supporting + career). This
  // makes subs.major - and therefore overall - scenario-aware, instead of every
  // verified-primary school getting an identical 100. We do NOT touch majorFit()
  // or overallFit() or the weighting constants; we only substitute the value fed
  // into overallFit for scenario mode, then recompute overall and scenarioRank
  // from that scenario-aware overall. Debug fields expose the before/after.
  const scenarioMajorScore = s.scenario?.score;
  if (s.subs && typeof scenarioMajorScore === "number") {
    s.originalMajorFit = s.subs.major;
    s.originalOverall = s.overall;
    s.subs = { ...s.subs, major: scenarioMajorScore };
    s.overall = overallFit(s.subs);
    s.scenarioMajorFit = scenarioMajorScore;
    s.scenarioAdjustedOverall = s.overall;
  }

  // scenarioRank uses the (now scenario-aware) overall, keeping the 70/30 blend.
  const base = s.overall != null ? s.overall : 45;
  s.scenarioRank = Math.round(base * 0.7 + sf.score * 0.3);

  // Career-Track-aware explanation wording. In scenario mode the match is about
  // the selected TRACK, not the student's "intended major", so rewrite the
  // major-related reasons/concerns and add concise per-field evidence. This is
  // wording only - no score or ranking change.
  rewriteExplanationForScenario(s, scenario);
  return s;
}

// Replace the Profile-oriented major reason/concern text with Career-Track
// wording, and append concise scenario-field evidence from the breakdown. Only
// touches the major-related explanation lines; leaves academic/financial/etc.
function rewriteExplanationForScenario(s, scenario) {
  if (!s.explanation) return;
  const bd = s.scenario?.breakdown;
  const trackName = scenario.scenarioName;

  // Drop the Profile-oriented major lines (they mention Profile majors/interests
  // or intended major) and substitute a Career-Track line.
  const isMajorLine = (t) => /profile majors\/interests|intended major|bachelor's program aligned/i.test(t);
  if (Array.isArray(s.explanation.reasons)) {
    s.explanation.reasons = s.explanation.reasons.filter((t) => !isMajorLine(t));
  }
  if (Array.isArray(s.explanation.concerns)) {
    s.explanation.concerns = s.explanation.concerns.filter((t) => !isMajorLine(t));
  } else {
    s.explanation.concerns = [];
  }
  s.explanation.reasons = s.explanation.reasons || [];

  // Primary-field status decides the headline line.
  const primStatus = bd?.primary?.status;
  if (primStatus === "verified") {
    s.explanation.reasons.unshift(`Official program data confirms programs aligned with the selected Career Track (${trackName}).`);
  } else if (primStatus === "no-match") {
    s.explanation.concerns.unshift(`Official program data doesn't confirm the selected Career Track's primary field at this college - confirm on the college's official website.`);
  } else {
    s.explanation.concerns.unshift(`Program data is partially verified through College Scorecard - confirm exact major availability on the college's official website.`);
  }

  // Concise per-field evidence (only fields that are actually verified / partial).
  if (bd) {
    if (bd.primary?.status === "verified") {
      s.explanation.reasons.push(`Selected track primary field verified: ${bd.primary.field}.`);
    }
    if (bd.secondary?.status === "verified") {
      s.explanation.reasons.push(`Selected track secondary field verified: ${bd.secondary.field}.`);
    }
    const supStatuses = bd.supporting?.statuses || [];
    const supVerified = supStatuses.filter((x) => x.status === "verified").map((x) => x.field);
    const supPartial = supStatuses.filter((x) => x.status === "unavailable").map((x) => x.field);
    if (supVerified.length) {
      s.explanation.reasons.push(`Supporting fields verified: ${supVerified.join(", ")}.`);
    }
    if (supPartial.length) {
      s.explanation.concerns.push(`Supporting fields partially verified: ${supPartial.join(", ")}.`);
    }
  }

  // Remove any exact-duplicate lines introduced by rewriting/appending.
  s.explanation.reasons = uniqueTextLines(s.explanation.reasons);
  s.explanation.concerns = uniqueTextLines(s.explanation.concerns);
}

export const collegesRouter = express.Router();

function honestError(res, err) {
  const usingDemoKey = config.scorecard.usingDemoKey;
  const errorType = err.code === "RATE_LIMIT" ? "rate_limit"
    : err.code === "TIMEOUT" ? "timeout"
    : err.code === "NETWORK" ? "network"
    : (err.code || "upstream");

  let message;
  if (errorType === "rate_limit") {
    message = usingDemoKey
      ? "College Scorecard rate limit reached on the shared DEMO_KEY. Add your own free COLLEGE_SCORECARD_API_KEY."
      : "College Scorecard rate limit reached. Wait a few minutes and try again.";
  } else if (errorType === "timeout") {
    message = "The College Scorecard request timed out - the response was likely too large. This has been reported; try a narrower search (add a state filter).";
  } else if (errorType === "network") {
    message = `Could not reach College Scorecard from the server (${err.cause?.code || "network error"}). Check internet access, VPN, proxy, or firewall rules for node.exe.`;
  } else if (usingDemoKey) {
    message = "College Scorecard API failed. You are using the shared DEMO_KEY, which may be rate-limited. Add your own free COLLEGE_SCORECARD_API_KEY.";
  } else {
    message = "College Scorecard API failed even though COLLEGE_SCORECARD_API_KEY is configured. Check internet access, key validity, API status, or request size.";
  }

  const suggestion = errorType === "timeout"
    ? "Narrow the search with a state filter, or retry - large program requests can exceed the timeout."
    : errorType === "network"
    ? "Verify node.exe can reach api.data.gov (VPN/proxy/firewall). A browser working does not guarantee Node can connect."
    : usingDemoKey
    ? "Get a free key at https://api.data.gov/signup and set COLLEGE_SCORECARD_API_KEY in server/.env."
    : "Verify the key is valid and check https://api.data.gov status.";

  // Diagnostic object - never includes the API key.
  const diagnostic = {
    usingDemoKey,
    errorType,
    detail: err.message,
    cause: err.cause?.code || null,
    endpoint: "College Scorecard schools API",
    suggestion,
  };

  return res.status(errorType === "rate_limit" ? 429 : 502).json({
    error: errorType, message, diagnostic,
  });
}

// GET /api/colleges/search?name=&state=&page=
collegesRouter.get("/search", async (req, res) => {
  try {
    const { name, state, page } = req.query;
    const out = await searchColleges({ name, state, page: Number(page) || 0 });
    res.json(out);
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/by-state?state=NJ&page=
collegesRouter.get("/by-state", async (req, res) => {
  try {
    const { state, page } = req.query;
    if (!state) return res.status(400).json({ error: "bad_request", message: "state is required" });
    const out = await getByState(state, Number(page) || 0);
    res.json(out);
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/simulator/levers  -> available what-if levers
// (defined before "/:id" so it isn't captured by the id param route)
collegesRouter.get("/simulator/levers", (_req, res) => res.json({ levers: leverList() }));

// GET /api/colleges/top-stem  -> curated Top-30 STEM colleges enriched with live
// College Scorecard data (earnings, grad rate, cost, admit rate). Editorial STEM
// ranking is clearly labeled; live outcome data is official.

// ---------- Curated lists (STEM / Finance / Business) ----------
// One route serves all three. Each is an EDITORIAL ranking, clearly labeled.
const CURATED = {
  stem: {
    list: TOP_STEM,
    scoreKey: "stemScore",
    rankingType: "STEM (editorial)",
    note: "STEM strength is an editorial ranking of undergraduate CS/engineering/science reputation and outcomes - not an official government ranking. Earnings, cost, graduation, and admit rate are live from College Scorecard.",
  },
  finance: {
    list: TOP_FINANCE,
    scoreKey: "financeScore",
    rankingType: "Finance (editorial)",
    note: "Finance strength is an editorial ranking of undergraduate finance program reputation and recruiting outcomes - not an official government ranking. Earnings, cost, graduation, and admit rate are live from College Scorecard.",
  },
  business: {
    list: TOP_BUSINESS,
    scoreKey: "businessScore",
    rankingType: "Business (editorial)",
    note: "Business strength is an editorial ranking of undergraduate business program reputation and outcomes - not an official government ranking. Earnings, cost, graduation, and admit rate are live from College Scorecard.",
  },
};

// POST /api/colleges/top-list/:kind?limit=30  { profile } -> ranked + personal fit
collegesRouter.post("/top-list/:kind", async (req, res) => {
  const cfg = CURATED[String(req.params.kind).toLowerCase()];
  if (!cfg) return res.status(404).json({ error: "not_found", message: "Unknown list. Use stem, finance, or business." });
  const { profile } = req.body || {};
  const limit = Math.min(Number(req.query.limit) || 30, cfg.list.length);

  const out = [];
  for (const [i, s] of cfg.list.slice(0, limit).entries()) {
    let scored = null, official = null;
    try {
      const f = await getCollegeById(s.id);
      if (f) {
        official = f.college;
        const sc = scoreCollege(profile || {}, f.college);
        const sel = getSelection(s.id);
        scored = {
          category: sc.admission.category,
          normalizedCategory: normalizeCategory(sc.admission.category),
          coarseCategory: coarseCategory(sc.admission.category),
          label: sc.admission.label, range: sc.admission.range,
          overall: sc.overall, netCost: sc.netCost,
          cultureFit: sel.available ? cultureFit(profile || {}, sel)?.score ?? null : null,
        };
      }
    } catch { /* degrade to ranking only - never fake numbers */ }
    out.push({
      rank: i + 1, id: s.id, name: s.name, tier: s.tier, specialties: s.specialties,
      [cfg.scoreKey]: s.score, score: s.score,
      official: official ? {
        admissionRate: official.admissionRate, satMidpoint: official.satMidpoint,
        averageNetPrice: official.averageNetPrice, medianEarnings: official.medianEarnings,
        graduationRate: official.graduationRate, state: official.state, controlType: official.controlType,
      } : null,
      scored,
    });
  }
  res.json({ kind: req.params.kind, rankingType: cfg.rankingType, note: cfg.note,
    total: cfg.list.length, colleges: out });
});

collegesRouter.get("/top-stem", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, TOP_STEM.length);
  const list = TOP_STEM.slice(0, limit);
  // Enrich each with live Scorecard data where reachable; failures degrade to
  // the ranking + name only (never fake numbers).
  const enriched = await Promise.all(list.map(async (s, i) => {
    let official = null;
    try { const f = await getCollegeById(s.id); official = f?.college || null; } catch { /* leave null */ }
    return {
      rank: i + 1, id: s.id, name: s.name, stemScore: s.score, tier: s.tier,
      specialties: s.specialties,
      official: official ? {
        admissionRate: official.admissionRate, satMidpoint: official.satMidpoint,
        averageNetPrice: official.averageNetPrice, medianEarnings: official.medianEarnings,
        graduationRate: official.graduationRate, state: official.state, controlType: official.controlType,
      } : null,
    };
  }));
  res.json({
    rankingType: "STEM (editorial)",
    note: "STEM strength is an editorial ranking of undergraduate CS/engineering/science reputation and outcomes - not an official government ranking. Earnings, cost, graduation, and admit rate are live from College Scorecard.",
    colleges: enriched,
  });
});

// POST /api/colleges/top-stem/fit  { profile }  -> Top STEM ranked with the
// student's estimated category + culture fit for each.
collegesRouter.post("/top-stem/fit", async (req, res) => {
  try {
    const { profile } = req.body || {};
    const limit = Math.min(Number(req.query.limit) || 30, TOP_STEM.length);
    const out = [];
    for (const [i, s] of TOP_STEM.slice(0, limit).entries()) {
      let scored = null;
      let official = null;
      try {
        const f = await getCollegeById(s.id);
        if (f) {
          official = {
            admissionRate: f.college.admissionRate, satMidpoint: f.college.satMidpoint,
            averageNetPrice: f.college.averageNetPrice, medianEarnings: f.college.medianEarnings,
            graduationRate: f.college.graduationRate, state: f.college.state, controlType: f.college.controlType,
          };
          const sc = scoreCollege(profile || {}, f.college);
          const sel = getSelection(s.id);
          scored = {
            category: sc.admission.category, label: sc.admission.label, range: sc.admission.range,
            overall: sc.overall, netCost: sc.netCost,
            cultureFit: sel.available ? cultureFit(profile || {}, sel)?.score ?? null : null,
          };
        }
      } catch { /* degrade */ }
      // official is included here (matching the plain /top-stem route) so
      // the client's Admit/Earnings/Net-price badges and the college's state
      // (needed when saving to a list) aren't silently blank just because a
      // profile happens to be set.
      out.push({ rank: i + 1, id: s.id, name: s.name, stemScore: s.score, tier: s.tier, specialties: s.specialties, official, scored });
    }
    res.json({ rankingType: "STEM (editorial)", colleges: out,
      note: "STEM ranking is editorial; fit categories and culture fit are estimates from your profile and official data." });
  } catch (err) { honestError(res, err); }
});


// GET /api/colleges/browse?name=&state=&control=&major=&page=&perPage=
// Standalone college search. Works WITHOUT running Matches, paginates, and
// never returns the whole database at once. Not personalized.
collegesRouter.get("/browse", async (req, res) => {
  try {
    const { name, state, control, major } = req.query;
    const page = Math.max(0, Number(req.query.page) || 0);
    const perPage = Math.min(Math.max(Number(req.query.perPage) || 25, 10), 50);
    const out = await searchColleges({
      name: name || undefined,
      state: state ? String(state).toUpperCase() : undefined,
      control: control && control !== "all" ? control : undefined,
      major: major || undefined,
      page, perPage,
    });
    res.json({
      colleges: out.results,
      total: out.total, page: out.page, perPage: out.perPage,
      hasMore: out.total != null ? (out.page + 1) * out.perPage < out.total : out.results.length === out.perPage,
      source: "U.S. Department of Education College Scorecard",
      note: "Browse results are not personalized recommendations.",
      meta: out.meta,
    });
  } catch (err) { honestError(res, err); }
});

// POST /api/colleges/:id/evaluate { profile } -> score ONE college on demand.
// Used by Browse's "Evaluate against my profile" so we never pre-score 2,000.
collegesRouter.post("/:id/evaluate", async (req, res) => {
  try {
    const { profile, scenario: scenarioId } = req.body || {};
    if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
    const found = await getCollegeById(req.params.id);
    if (!found) return res.status(404).json({ error: "not_found", message: "College not found." });
    // Base score uses the canonical Profile matching list (primary + second major
    // + interests) so on-demand evaluation reflects the student's major fields.
    const s = scoreCollege(scoringProfileFor(profile), found.college);
    s.normalizedCategory = normalizeCategory(s.admission?.category);
    s.coarseCategory = coarseCategory(s.admission?.category);
    // Optional major/career-track scenario fit. getCollegeById does NOT fetch
    // program arrays, so build lightweight scenario verification (scoped to this
    // college's state) and score via the verified-id path.
    if (scenarioId) {
      const scenario = getScenario(scenarioId);
      if (scenario) {
        const scenVerify = await buildScenarioVerification(scenario, found.college?.state);
        withScenario(s, scenario, scenVerify);
      }
    }
    res.json({ scored: s, note: "Estimated fit based on your profile." });
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/scenarios -> the list of major/career-track scenarios + default.
collegesRouter.get("/scenarios", (req, res) => {
  res.json({ scenarios: SCENARIOS, defaultScenario: DEFAULT_SCENARIO_ID });
});

// GET /api/colleges/by-major?major=Computer Science&state=NJ
// Uses College Scorecard field-of-study (CIP) program data to return only
// colleges with a matching bachelor's-level program. Never returns a college
// just for being large/selective.
collegesRouter.get("/by-major", async (req, res) => {
  try {
    const major = (req.query.major || "").trim();
    const state = (req.query.state || "").trim() || null;
    const control = (req.query.control || "").trim() || null;
    const deep = String(req.query.deep || "").toLowerCase() === "true";
    if (!major) return res.status(400).json({ error: "bad_request", message: "major query required" });
    const out = await searchByMajor({ major, state, control, deep });
    if (deep) {
      out.deepSearchWarning = "Deep search may take longer. Results still need official verification.";
    }
    res.json(out);
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/major-combos?major1=Computer Science&major2=Finance&state=NJ
collegesRouter.get("/major-combos", async (req, res) => {
  try {
    const major1 = (req.query.major1 || "").trim();
    const major2 = (req.query.major2 || "").trim() || null;
    const state = (req.query.state || "").trim() || null;
    const control = (req.query.control || "").trim() || null;
    const deep = String(req.query.deep || "").toLowerCase() === "true";
    if (!major1) return res.status(400).json({ error: "bad_request", message: "major1 required" });
    const out = await searchMajorCombos({ major1, major2, state, control, deep });
    if (deep) out.deepSearchWarning = "Deep search may take longer. Results still need official verification.";
    res.json(out);
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/:id/deadlines -> verified deadline profile (if seeded)
collegesRouter.get("/:id/deadlines", (req, res) => {
  const row = db.prepare("SELECT * FROM college_deadline_profiles WHERE college_id=?").get(req.params.id);
  if (!row) {
    return res.json({
      available: false,
      note: "No verified deadline profile on file for this college yet. Confirm all dates on the college's official admissions and financial-aid sites.",
      disclaimer: "Deadlines can change each admission cycle. Always confirm dates on the college's official admissions and financial aid websites before submitting applications.",
    });
  }
  res.json({
    available: true,
    collegeId: row.college_id,
    applicationDeadlines: safeParse(row.application_deadlines_json),
    deadlineSourceUrl: row.deadline_source_url,
    lastReviewed: row.deadline_last_reviewed,
    cssProfileRequired: row.css_profile_required,
    cssProfileDeadline: row.css_profile_deadline,
    cssProfileSourceUrl: row.css_profile_source_url,
    fafsaPriorityDeadline: row.fafsa_priority_deadline,
    fafsaSourceUrl: row.fafsa_source_url,
    scholarshipDeadline: row.scholarship_deadline,
    scholarshipSourceUrl: row.scholarship_source_url,
    honorsDeadline: row.honors_deadline,
    honorsSourceUrl: row.honors_source_url,
    portfolioDeadline: row.portfolio_deadline,
    portfolioSourceUrl: row.portfolio_source_url,
    interviewDeadline: row.interview_deadline,
    interviewSourceUrl: row.interview_source_url,
    confidence: row.deadline_confidence_level,
    notes: row.notes,
    disclaimer: "Deadlines can change each admission cycle. Always confirm dates on the college's official admissions and financial aid websites before submitting applications.",
  });
});
function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

// GET /api/colleges/:id/similar -> colleges with comparable selectivity & type
collegesRouter.get("/:id/similar", async (req, res) => {
  try {
    const base = await getCollegeById(req.params.id);
    if (!base || base.admissionRate == null) return res.json({ similar: [] });
    const lo = Math.max(0, base.admissionRate - 0.12);
    const hi = Math.min(1, base.admissionRate + 0.12);
    const band = await searchByAdmissionBand({ min: lo, max: hi }, 12).catch(() => ({ results: [] }));
    const similar = (band.results || [])
      .filter((c) => c.id !== String(req.params.id))
      .slice(0, 6)
      .map((c) => ({ id: c.id, name: c.name, state: c.state, admissionRate: c.admissionRate, medianEarnings: c.medianEarnings }));
    res.json({ similar });
  } catch (err) { res.json({ similar: [] }); } // non-critical; never error the modal
});

// GET /api/colleges/:id/programs -> official program list + verified combos
collegesRouter.get("/:id/programs", async (req, res) => {
  try {
    const official = await getPrograms(req.params.id).catch(() => null);
    const notes = programNotesFor(req.params.id);
    if (!official && !notes) {
      return res.json({ available: false, note: "Program data isn't available for this college right now. Confirm majors on the college's official site." });
    }
    // Cross-check link: this CIP list is organized by federal taxonomy, not by
    // the college's own department/major page structure, so the two rarely
    // read the same. Surface the college's actual site so a family can open it
    // side by side and confirm for themselves, rather than trusting a list
    // that has no visible link back to a source they can check.
    let officialWebsiteUrl = null;
    try {
      const found = await getCollegeById(req.params.id);
      officialWebsiteUrl = found?.college?.websiteUrl || null;
    } catch { /* non-critical -- program list still renders without the link */ }
    res.json({
      available: true,
      id: req.params.id,
      name: official?.name || null,
      source: official?.source || "U.S. Department of Education College Scorecard",
      sourceYear: official?.sourceYear || "latest available",
      programs: official?.programs || [],
      suggestedCombinations: official?.programs ? suggestCombinations(official.programs) : [],
      verifiedCombinationNotes: notes || null,
      officialWebsiteUrl,
      disclaimer: "College Scorecard field-of-study data indicates program availability, but formal double-major rules must be confirmed with the college's official catalog or advising office. This federal CIP list is organized differently than a college's own department/major pages -- both are real, but they won't always match program-for-program.",
    });
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/:id/programs/official-site -> live, on-demand, NOT
// persisted scan of the college's own domain for department/major pages, as
// a direct comparison alongside the federal CIP list above. See
// services/programDiscovery.js's Layer 4 comment for the full rationale.
collegesRouter.get("/:id/programs/official-site", async (req, res) => {
  try {
    const found = await getCollegeById(req.params.id).catch(() => null);
    const websiteUrl = found?.college?.websiteUrl || null;
    const collegeName = found?.college?.name || null;
    if (!websiteUrl) {
      return res.json({
        available: false,
        note: "No official website is on file for this college in College Scorecard, so this scan can't run. Open the college's site directly to check its majors.",
      });
    }
    const domain = websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*/, "");
    const result = await scanOfficialSiteMajors({ collegeId: req.params.id, collegeName, domain, startUrl: websiteUrl });
    res.json({ available: true, collegeName, officialWebsiteUrl: websiteUrl, ...result });
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/:id  -> official + verified + selection profile merged.
// Resilient: verified/selection profiles are local and must still return even
// if the live Scorecard fetch fails, so the modal is never blank for seeded
// colleges.
collegesRouter.get("/:id", async (req, res) => {
  const verified = getVerified(req.params.id);
  const selection = getSelection(req.params.id);
  let found = null, liveError = null;
  try {
    found = await getCollegeById(req.params.id);
  } catch (err) {
    liveError = err.message;
  }
  if (!found) {
    // No live data. If we have ANY verified/selection info, still return it so
    // the modal renders; otherwise report the upstream problem.
    if (verified?.available || selection?.available) {
      // Try to recover a name from the scan cache; otherwise the client supplies
      // the name it already has from the card that opened this modal.
      let name = null;
      try {
        const cached = (await getCollegeById(req.params.id).catch(() => null));
        name = cached?.college?.name || null;
      } catch { /* ignore */ }
      return res.json({
        college: { id: req.params.id, name },
        meta: { degraded: true, source: "College Scorecard", error: liveError || "Live data unavailable" },
        verified, selection,
        note: "Live official data is temporarily unavailable, but verified admissions details are shown below.",
      });
    }
    return res.status(liveError ? 502 : 404).json({
      error: liveError ? "upstream" : "not_found",
      message: liveError
        ? (config.scorecard.usingDemoKey
            ? "Couldn't load official data. You're using the shared DEMO_KEY, which may be rate-limited. Add your own free COLLEGE_SCORECARD_API_KEY."
            : "Couldn't load official data even though your COLLEGE_SCORECARD_API_KEY is configured. Check internet access, key validity, or API status.")
        : "College not found in College Scorecard.",
    });
  }
  res.json({ college: found.college, meta: found.meta, verified, selection });
});

// POST /api/colleges/:id/fit  { profile } -> culture/selection fit for this school
collegesRouter.post("/:id/fit", async (req, res) => {
  try {
    const { profile } = req.body || {};
    const selection = getSelection(req.params.id);
    const fit = cultureFit(profile || {}, selection);
    res.json({ selection, cultureFit: fit });
  } catch (err) { honestError(res, err); }
});

// GET /api/colleges/:id/major-strategy?interests=Computer Science,Finance
collegesRouter.get("/:id/major-strategy", (req, res) => {
  const interests = (req.query.interests || "").split(",").map((s) => s.trim()).filter(Boolean);
  res.json(majorStrategyFor(req.params.id, interests));
});

// POST /api/colleges/:id/simulate  { profile, levers:[key...] }
collegesRouter.post("/:id/simulate", async (req, res) => {
  try {
    const { profile, levers } = req.body || {};
    if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
    const found = await getCollegeById(req.params.id);
    if (!found) return res.status(404).json({ error: "not_found" });
    res.json(simulate(profile, found.college, levers || []));
  } catch (err) { honestError(res, err); }
});

// POST /api/colleges/score  { profile, collegeId }  -> fit + probability for one
collegesRouter.post("/score", async (req, res) => {
  try {
    const { profile, collegeId } = req.body || {};
    if (!profile || !collegeId) return res.status(400).json({ error: "bad_request", message: "profile and collegeId required" });
    const found = await getCollegeById(collegeId);
    if (!found) return res.status(404).json({ error: "not_found" });
    res.json({ scored: scoreCollege(scoringProfileFor(profile), found.college), meta: found.meta });
  } catch (err) { honestError(res, err); }
});

// POST /api/colleges/recommend { profile }  -> live search + scored list
// Uses the student's state (in-state cost signal) plus a national pull.
collegesRouter.post("/recommend", async (req, res) => {
  try {
    const { profile, filters, includeServiceAcademies = false } = req.body || {};
    if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
    const f = filters || {};

    // Scan the full national set (cached 24h), optionally narrowed by state or
    // control at the source for speed. Score everything, then return all -
    // the client's filters decide what's shown.
    const scan = await scanAllColleges({
      state: f.state || undefined,
      control: (f.control === "public" || f.control === "private") ? f.control : undefined,
    });
    if (!scan.results.length) return res.status(502).json({ error: "upstream", message: "Unable to retrieve official data right now." });

    // Verify program availability with ONE lightweight, cached lookup (ids only).
    // Use the canonical Profile matching list (primary major + second major +
    // interests), so Profile matching reflects the student's actual major fields.
    const scoringProfile = scoringProfileFor(profile);
    const interestCips = [...new Set((scoringProfile.interests || []).flatMap((i) => cipsForMajorPublic(i)))];
    const verify = await verifyProgramAvailability({ cips: interestCips, state: f.state || undefined });

    const scored = scan.results
      .filter((c) => includeServiceAcademies || !isServiceAcademyOrMilitaryPathway(c))
      .map((c) => {
      applyProgramVerification(c, verify);
      const s = scoreCollege(scoringProfile, c);
      const sel = getSelection(c.id);
      s.hasSelection = sel.available;
      s.cultureFit = sel.available ? cultureFit(profile, sel) : null;
      s.isIvy = IVY_IDS.has(String(c.id));
      s.normalizedCategory = normalizeCategory(s.admission?.category);
      s.coarseCategory = coarseCategory(s.admission?.category);
      s.dataCompleteness = s.admission?.completeness ?? 0;
      Object.assign(s, evaluateMatch(s, scoringProfile));
      if (s.explanation) { s.explanation.reasons = uniqueTextLines(s.explanation.reasons); s.explanation.concerns = uniqueTextLines(s.explanation.concerns); }
      if (includeServiceAcademies) addServiceAcademyConcern(s);
      return s;
    }).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
    scored.forEach((s, i) => { s.rank = i + 1; });

    const matches = scored.filter((s) => s.isMatch);
    const countBy = (arr, key) => arr.reduce((m, s) => { const k = s[key] || "Insufficient Data"; m[k] = (m[k] || 0) + 1; return m; }, {});

    res.json({
      recommendations: scored,
      matchCount: matches.length,
      verifiedMatchCount: matches.filter((s) => s.matchType === "verified-major-match").length,
      relaxedMatchCount: matches.filter((s) => s.matchType === "relaxed-profile-match").length,
      meta: scan.meta,
      count: scored.length,
      scanned: scan.results.length,
      partial: scan.partial,
      categoryCounts: { matches: countBy(matches, "normalizedCategory"), allScored: countBy(scored, "normalizedCategory") },
      programVerification: {
        available: verify.available,
        status: verify.available ? "verified" : (verify.error ? "error" : "unavailable"),
        cipCodesUsed: interestCips,
        verifiedCount: verify.verified.size,
        cached: !!verify.cached,
        error: verify.error || null,
        note: verify.available ? null : "Program availability not verified - confirm on official college website.",
      },
      matchCriteria: "overall ≥ 55, academic fit ≥ 40, classifiable admission chance, sufficient official data. Verified major fit preferred; when program data is unavailable the college is included as a relaxed match and flagged.",
    });
  } catch (err) { honestError(res, err); }
});

// Classify a scored college into one of three match types. The key principle:
// missing program data is NOT evidence of a bad match. Only an affirmative
// "this college has no such program" excludes it.
//
//   verified-major-match  -> official data confirms the major; strong match
//   relaxed-profile-match -> profile fits; program availability NOT verified
//   not-match             -> fails the profile bar, or program is confirmed absent
function evaluateMatch(s, profile) {
  const coarse = coarseCategory(s.admission?.category);
  const overall = s.overall ?? 0;
  const academic = s.subs?.academic;
  const completeness = s.admission?.completeness ?? 0;
  const status = s.majorFit?.status ?? "unavailable";
  const blockReasons = [];

  const validCategory = ["Reach", "Target", "Safety"].includes(coarse);
  if (!validCategory) blockReasons.push("insufficient data to classify admission chance");
  if (overall < 55) blockReasons.push(`overall fit ${overall} below 55`);
  if (academic == null) blockReasons.push("academic fit could not be computed");
  else if (academic < 40) blockReasons.push(`academic fit ${academic} below 40`);
  if (completeness < 0.45) blockReasons.push("college publishes too little official data");

  if (blockReasons.length) {
    return { isMatch: false, matchType: "not-match", matchBlockReasons: blockReasons, programVerificationStatus: status };
  }

  if (status === "verified") {
    const mScore = s.subs?.major ?? 0;
    if (mScore >= 50) {
      return { isMatch: true, matchType: "verified-major-match", matchBlockReasons: [], programVerificationStatus: status };
    }
    blockReasons.push(`major fit ${mScore} below 50`);
    return { isMatch: false, matchType: "not-match", matchBlockReasons: blockReasons, programVerificationStatus: status };
  }

  if (status === "no-match") {
    // Affirmative evidence the college does not offer the major.
    return { isMatch: false, matchType: "not-match",
      matchBlockReasons: ["official program data shows no bachelor's program in your major"],
      programVerificationStatus: status };
  }

  // "unavailable" or "error": we simply don't know. Include it, flagged.
  return { isMatch: true, matchType: "relaxed-profile-match", matchBlockReasons: [], programVerificationStatus: status };
}

// POST /api/colleges/balanced-list { profile, size, filters, scenario } -> balanced list
// When `scenario` (a track id) is supplied, each college also gets a scenario fit,
// and the balanced pool is ordered by the blended scenario rank so the list is
// "Balanced Top N - <scenario>". Omitting `scenario` keeps the original behavior.
collegesRouter.post("/balanced-list", async (req, res) => {
  try {
    const { profile, size = 10, filters, scenario: scenarioId, includeServiceAcademies = false } = req.body || {};
    if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
    const scenario = scenarioId ? getScenario(scenarioId) : null;
    const f = filters || {};
    const scan = await scanAllColleges({
      state: f.state || undefined,
      control: (f.control === "public" || f.control === "private") ? f.control : undefined,
    });
    if (!scan.results.length) return res.status(502).json({ error: "upstream", message: "Unable to retrieve official data right now." });

    // Scenario-aware verification (lightweight, per scenario field). When a
    // scenario is active we ALSO build a scenario profile whose interests are the
    // scenario's own fields, so the major-fit gate reflects the selected track
    // rather than the flat profile.interests. Academic/financial/EC/state/budget
    // scoring always uses the ORIGINAL profile.
    const scenVerify = scenario ? await buildScenarioVerification(scenario, f.state) : null;
    const gateProfile = scenario ? scenarioProfileFor(profile, scenario) : profile;

    // Profile-based (no-scenario) path uses the canonical matching list (primary
    // major + second major + interests). Scenario path keeps the original profile
    // (its major-fit is driven by the scenario primary-field verification).
    const scoringProfile = scenario ? profile : scoringProfileFor(profile);
    const interestCips = [...new Set((scoringProfile.interests || []).flatMap((i) => cipsForMajorPublic(i)))];
    const verify = scenario ? null : await verifyProgramAvailability({ cips: interestCips, state: f.state || undefined });
    const scored = scan.results
      .filter((c) => includeServiceAcademies || !isServiceAcademyOrMilitaryPathway(c))
      .map((c) => {
      if (scenario) {
        // Major gate keyed on the scenario's PRIMARY field verification.
        // Honor partial lookups: a missing id under a truncated primary lookup
        // is unknown, NOT confirmed-absent, so it isn't excluded as no-match.
        if (!scenVerify.primaryAvailable) {
          c.programVerificationError = "scenario program lookup unavailable";
        } else if (scenVerify.primaryVerifiedIds.has(String(c.id))) {
          c.programVerified = true;
        } else if (scenVerify.primaryPartial) {
          c.programVerificationError = "Program availability not fully verified - confirm on official college website.";
        } else {
          c.programVerified = false; // complete primary lookup, genuinely absent
        }
      } else {
        applyProgramVerification(c, verify);
      }
      const s = scoreCollege(scoringProfile, c); // canonical interests on profile path
      s.normalizedCategory = normalizeCategory(s.admission?.category);
      s.coarseCategory = coarseCategory(s.admission?.category);
      Object.assign(s, evaluateMatch(s, gateProfile)); // scenario-aware gate
      if (s.explanation) { s.explanation.reasons = uniqueTextLines(s.explanation.reasons); s.explanation.concerns = uniqueTextLines(s.explanation.concerns); }
      withScenario(s, scenario, scenVerify);
      if (includeServiceAcademies) addServiceAcademyConcern(s);
      return s;
    });
    // Build from qualified matches only; fall back to all scored if too few.
    let pool = scored.filter((s) => s.isMatch);
    const usePool = pool.length >= 8 ? pool : scored.filter((s) => s.overall != null);
    // When a scenario is active, pre-sort the pool by scenario rank so the
    // quota-based balanced builder draws the strongest scenario fits first.
    const ordered = scenario
      ? [...usePool].sort((a, b) => (b.scenarioRank ?? -1) - (a.scenarioRank ?? -1))
      : usePool;
    const list = buildBalancedList(ordered, profile, Number(size));
    res.json({
      ...list,
      scenario: scenario ? { id: scenario.id, name: scenario.scenarioName } : null,
      builtFrom: pool.length >= 8 ? "personalized matches" : "all scored colleges (too few verified matches)",
      programVerificationStatus: scenario
        ? scenVerify.verificationStatus
        : (verify.available ? "verified" : (verify.error ? "error" : "unavailable")),
    });
  } catch (err) { honestError(res, err); }
});

// POST /api/colleges/best-fit { profile, size, filters, scenario } -> top colleges
// ranked by blended scenario fit (Best Fit by scenario). Reach-heavy by design.
collegesRouter.post("/best-fit", async (req, res) => {
  try {
    const { profile, size = 20, filters, scenario: scenarioId, includeServiceAcademies = false } = req.body || {};
    if (!profile) return res.status(400).json({ error: "bad_request", message: "profile required" });
    const scenario = scenarioId ? getScenario(scenarioId) : null;
    const f = filters || {};
    const scan = await scanAllColleges({
      state: f.state || undefined,
      control: (f.control === "public" || f.control === "private") ? f.control : undefined,
    });
    if (!scan.results.length) return res.status(502).json({ error: "upstream", message: "Unable to retrieve official data right now." });

    const scenVerify = scenario ? await buildScenarioVerification(scenario, f.state) : null;
    const gateProfile = scenario ? scenarioProfileFor(profile, scenario) : profile;

    // Profile-based (no-scenario) path uses the canonical matching list.
    const scoringProfile = scenario ? profile : scoringProfileFor(profile);
    const interestCips = [...new Set((scoringProfile.interests || []).flatMap((i) => cipsForMajorPublic(i)))];
    const verify = scenario ? null : await verifyProgramAvailability({ cips: interestCips, state: f.state || undefined });
    const scored = scan.results
      .filter((c) => includeServiceAcademies || !isServiceAcademyOrMilitaryPathway(c))
      .map((c) => {
      if (scenario) {
        if (!scenVerify.primaryAvailable) {
          c.programVerificationError = "scenario program lookup unavailable";
        } else if (scenVerify.primaryVerifiedIds.has(String(c.id))) {
          c.programVerified = true;
        } else if (scenVerify.primaryPartial) {
          c.programVerificationError = "Program availability not fully verified - confirm on official college website.";
        } else {
          c.programVerified = false;
        }
      } else {
        applyProgramVerification(c, verify);
      }
      const s = scoreCollege(scoringProfile, c);
      s.normalizedCategory = normalizeCategory(s.admission?.category);
      s.coarseCategory = coarseCategory(s.admission?.category);
      Object.assign(s, evaluateMatch(s, gateProfile));
      if (s.explanation) { s.explanation.reasons = uniqueTextLines(s.explanation.reasons); s.explanation.concerns = uniqueTextLines(s.explanation.concerns); }
      withScenario(s, scenario, scenVerify);
      if (includeServiceAcademies) addServiceAcademyConcern(s);
      return s;
    });
    const pool = scored.filter((s) => s.isMatch && s.overall != null);
    const rankKey = scenario ? (x) => (x.scenarioRank ?? -1) : (x) => (x.overall ?? -1);
    const colleges = pool.sort((a, b) => rankKey(b) - rankKey(a)).slice(0, Number(size));
    res.json({
      colleges,
      scenario: scenario ? { id: scenario.id, name: scenario.scenarioName } : null,
      total: pool.length,
      programVerificationStatus: scenario
        ? scenVerify.verificationStatus
        : (verify.available ? "verified" : (verify.error ? "error" : "unavailable")),
    });
  } catch (err) { honestError(res, err); }
});
