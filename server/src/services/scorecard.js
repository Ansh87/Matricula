// scorecard.js - talks to the U.S. Dept. of Education College Scorecard API.
// The API key lives only here (server-side). We cache responses, attach source
// metadata to every field, and NEVER invent values: a missing field becomes null
// and is rendered downstream as "Data unavailable".
import { config } from "../config.js";
import { cacheGet, cacheSet } from "../db/database.js";
import { classifyComboEvidence } from "./doubleMajorVerification.js";

const SOURCE = "U.S. Department of Education College Scorecard";

// Fields we request. "latest.*" resolves to the most recent available cohort.
// BASE_FIELDS: used for broad national scans and general college lookups.
// Deliberately EXCLUDES latest.programs.cip_4_digit - that field returns a
// large nested array per college, and requesting it for ~2,000 colleges makes
// the scan enormous (slow, timeout-prone, and easy to trip rate limits).
const BASE_FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.ownership", // 1 public, 2 private nonprofit, 3 private for-profit
  "school.region_id",
  "school.school_url",
  "school.price_calculator_url",
  "latest.student.size",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.midpoint.critical_reading",
  "latest.admissions.sat_scores.midpoint.math",
  "latest.admissions.sat_scores.average.overall",
  "latest.admissions.sat_scores.25th_percentile.critical_reading",
  "latest.admissions.sat_scores.75th_percentile.critical_reading",
  "latest.admissions.sat_scores.25th_percentile.math",
  "latest.admissions.sat_scores.75th_percentile.math",
  "latest.admissions.act_scores.midpoint.cumulative",
  "latest.admissions.act_scores.25th_percentile.cumulative",
  "latest.admissions.act_scores.75th_percentile.cumulative",
  "latest.admissions.test_requirements",
  "school.locale", // campus setting: 11-13 city, 21-23 suburb, 31-33 town, 41-43 rural
  "school.carnegie_undergrad",
  "school.religious_affiliation",
  "latest.student.demographics.student_faculty_ratio",
  "latest.aid.students_with_any_loan",
  "latest.cost.attendance.academic_year",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.avg_net_price.overall",
  "latest.completion.completion_rate_4yr_150nt",
  "latest.student.retention_rate.four_year.full_time",
  "latest.earnings.10_yrs_after_entry.median",
  "latest.aid.median_debt.completers.overall",
].join(",");

// PROGRAM_FIELDS: ONLY for major/program verification lookups.
const PROGRAM_FIELDS = "id,school.name,latest.programs.cip_4_digit";

// Back-compat alias: existing callers use FIELDS for the standard college data.
const FIELDS = BASE_FIELDS;


const OWNERSHIP = { 1: "Public", 2: "Private nonprofit", 3: "Private for-profit" };

// Scorecard locale codes -> campus setting.
function localeSetting(code) {
  const n = Number(code);
  if (!n) return null;
  if (n >= 11 && n <= 13) return "Urban (city)";
  if (n >= 21 && n <= 23) return "Suburban";
  if (n >= 31 && n <= 33) return "Town";
  if (n >= 41 && n <= 43) return "Rural";
  return null;
}
const CARNEGIE_UG = {
  // A readable label for a few common undergraduate-instructional categories.
  5: "Four-year, higher part-time", 6: "Four-year, medium full-time selective",
  7: "Four-year, medium full-time inclusive", 8: "Four-year, full-time more selective",
  9: "Four-year, full-time selective", 10: "Four-year, full-time inclusive",
  11: "Four-year, full-time selective", 12: "Four-year, full-time more selective",
};
const RELIGIOUS = {
  22: "Roman Catholic", 51: "Baptist", 54: "Lutheran", 58: "Methodist",
  66: "Presbyterian", 71: "Jewish", 24: "Roman Catholic", 27: "Roman Catholic",
  "-1": null, "-2": null,
};
const TEST_REQ = {
  1: "Required", 2: "Recommended", 3: "Neither required nor recommended",
  4: "Considered but not required", 5: "Not used for admission",
};
const REGION = {
  0: "U.S. Service Schools", 1: "New England", 2: "Mid East", 3: "Great Lakes",
  4: "Plains", 5: "Southeast", 6: "Southwest", 7: "Rocky Mountains",
  8: "Far West", 9: "Outlying Areas",
};

function num(v) {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

// Build our normalized college object from a raw Scorecard record.
// Every data point that could be missing is explicitly null when absent.
function normalize(raw) {
  const satMidReading = num(raw["latest.admissions.sat_scores.midpoint.critical_reading"]);
  const satMidMath = num(raw["latest.admissions.sat_scores.midpoint.math"]);
  const satAvg = num(raw["latest.admissions.sat_scores.average.overall"]);
  const satMidpoint =
    satMidReading != null && satMidMath != null ? satMidReading + satMidMath : satAvg;

  // SAT 25th/75th combined (reading+math) when both sections present.
  const sat25r = num(raw["latest.admissions.sat_scores.25th_percentile.critical_reading"]);
  const sat25m = num(raw["latest.admissions.sat_scores.25th_percentile.math"]);
  const sat75r = num(raw["latest.admissions.sat_scores.75th_percentile.critical_reading"]);
  const sat75m = num(raw["latest.admissions.sat_scores.75th_percentile.math"]);
  const sat25 = sat25r != null && sat25m != null ? sat25r + sat25m : null;
  const sat75 = sat75r != null && sat75m != null ? sat75r + sat75m : null;

  const loanPct = num(raw["latest.aid.students_with_any_loan"]);

  // Bachelor's-level program CIP codes (credential level 3), when the caller
  // requested the programs field. Empty array => no program data available
  // (which is different from "offers nothing" - we say so honestly downstream).
  const rawPrograms = rawProgramArray(raw);
  const hasProgramData = rawPrograms.length > 0;
  const bachelor = hasProgramData ? bachelorPrograms(raw) : [];
  const bachelorCips = [...new Set(bachelor.map((p) => p.cipCode))];
  const bachelorProgramTitles = [...new Set(bachelor.map((p) => p.title).filter(Boolean))];

  return {
    id: String(raw.id),
    name: raw["school.name"] ?? null,
    city: raw["school.city"] ?? null,
    state: raw["school.state"] ?? null,
    controlType: OWNERSHIP[raw["school.ownership"]] ?? null,
    ownership: raw["school.ownership"] ?? null,
    region: REGION[raw["school.region_id"]] ?? null,
    setting: localeSetting(raw["school.locale"]),
    carnegie: CARNEGIE_UG[raw["school.carnegie_undergrad"]] ?? null,
    religiousAffiliation: RELIGIOUS[raw["school.religious_affiliation"]] ?? null,
    studentFacultyRatio: num(raw["latest.student.demographics.student_faculty_ratio"]),
    websiteUrl: raw["school.school_url"] ?? null,
    netPriceCalculatorUrl: raw["school.price_calculator_url"] ?? null,
    size: num(raw["latest.student.size"]),
    admissionRate: num(raw["latest.admissions.admission_rate.overall"]),
    satMidpoint,
    sat25, sat75,
    actMidpoint: num(raw["latest.admissions.act_scores.midpoint.cumulative"]),
    act25: num(raw["latest.admissions.act_scores.25th_percentile.cumulative"]),
    act75: num(raw["latest.admissions.act_scores.75th_percentile.cumulative"]),
    testPolicy: TEST_REQ[raw["latest.admissions.test_requirements"]] ?? null,
    tuitionInState: num(raw["latest.cost.tuition.in_state"]),
    tuitionOutOfState: num(raw["latest.cost.tuition.out_of_state"]),
    averageNetPrice: num(raw["latest.cost.avg_net_price.overall"]),
    costOfAttendance: num(raw["latest.cost.attendance.academic_year"]),
    pctWithLoans: loanPct != null ? Math.round(loanPct * 100) : null,
    graduationRate: num(raw["latest.completion.completion_rate_4yr_150nt"]),
    retentionRate: num(raw["latest.student.retention_rate.four_year.full_time"]),
    medianEarnings: num(raw["latest.earnings.10_yrs_after_entry.median"]),
    medianDebt: num(raw["latest.aid.median_debt.completers.overall"]),
    bachelorCips,
    bachelorProgramTitles,
    hasProgramData,
    source: SOURCE,
    sourceYear: "latest available",
    lastUpdated: new Date().toISOString(),
  };
}

// Robust fetch: an explicit timeout, one retry on transient network failures,
// and preservation of the underlying cause code so "fetch failed" is never an
// opaque dead end again.
async function fetchJson(url, { timeoutMs = 30000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        const err = new Error("College Scorecard rate limit reached (429).");
        err.code = "RATE_LIMIT";
        throw err;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`College Scorecard responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
        err.code = "UPSTREAM";
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      // Never retry a definitive answer from the server.
      if (err.code === "RATE_LIMIT" || err.code === "UPSTREAM") throw err;

      const cause = err.cause?.code || err.name || "";
      lastErr = new Error(
        err.name === "AbortError"
          ? `Request to College Scorecard timed out after ${timeoutMs / 1000}s (the response may be too large).`
          : `Network request to College Scorecard failed (${cause || err.message}).`
      );
      lastErr.code = err.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      lastErr.cause = err.cause;
      if (attempt < retries) await sleep(600); // brief backoff, then retry once
    }
  }
  throw lastErr;
}

function buildUrl(params) {
  const u = new URL(config.scorecard.baseUrl);
  u.searchParams.set("api_key", config.scorecard.apiKey);
  u.searchParams.set("fields", FIELDS);
  // Operating, bachelor-granting (predominant degree = 3), 4-year (level = 1).
  u.searchParams.set("school.operating", "1");
  u.searchParams.set("school.degrees_awarded.predominant", "3");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Returns { data, meta:{ cached, fetchedAt, stale, source } } - never throws
// fake data. On failure it surfaces the error so routes can respond honestly.
async function cachedFetch(cacheKey, url) {
  const cached = cacheGet(cacheKey);
  const fresh = cached && Date.now() - cached.fetchedAt < config.cacheTtlMs;
  if (fresh) {
    return { data: cached.data, meta: { cached: true, fetchedAt: cached.fetchedAt, stale: false, source: SOURCE } };
  }
  try {
    const json = await fetchJson(url);
    cacheSet(cacheKey, json);
    return { data: json, meta: { cached: false, fetchedAt: Date.now(), stale: false, source: SOURCE } };
  } catch (err) {
    // Live call failed - fall back to cache ONLY if we have it, flagged stale.
    if (cached) {
      const stale = Date.now() - cached.fetchedAt > config.staleAfterMs;
      return {
        data: cached.data,
        meta: { cached: true, fetchedAt: cached.fetchedAt, stale, source: SOURCE, degraded: true, error: err.message },
      };
    }
    throw err; // No cache, no data - route will report "unable to retrieve".
  }
}

export async function searchColleges({ name, state, control, major, page = 0, perPage = 25 }) {
  const params = { page: String(page), per_page: String(perPage) };
  if (name) params["school.name"] = name;
  if (state) params["school.state"] = state;
  if (control === "public") params["school.ownership"] = "1";
  if (control === "private") params["school.ownership"] = "2";
  // Optional major filter, using verified undotted CIP codes.
  if (major) {
    const cips = cipsForMajorPublic(major);
    if (cips.length) {
      params["latest.programs.cip_4_digit.code"] = cips.map(normalizeCip).join(",");
      params["latest.programs.cip_4_digit.credential.level"] = "3";
    }
  }
  const key = `search:${name || ""}:${state || ""}:${control || ""}:${major || ""}:${page}:${perPage}`;
  const { data, meta } = await cachedFetch(key, buildUrl(params));
  return {
    results: (data.results || []).map(normalize),
    total: data.metadata?.total ?? null,
    page: data.metadata?.page ?? page,
    perPage: data.metadata?.per_page ?? perPage,
    meta,
  };
}

// Scan the Scorecard set of operating, bachelor's-granting colleges by
// paginating 100 at a time. Cached 24h. Resilient: if a page fails (e.g. rate
// limit), we keep whatever we already fetched rather than failing the whole
// request. A small delay between pages avoids tripping per-second limits.
export async function scanAllColleges({ state, control, maxPages = 30 } = {}) {
  const cacheKey = `scanall:${state || "US"}:${control || "any"}`;
  const cached = cacheGet(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < config.cacheTtlMs) {
    const payload = cached.data || {};
    return { results: (payload.list || []).map(normalize), meta: { cached: true, fetchedAt: cached.fetchedAt, source: SOURCE }, pages: payload.pages, partial: payload.partial };
  }

  const perPage = 100;
  const all = [];
  let page = 0, partial = false, total = null, lastErr = null;
  while (page < maxPages) {
    const params = { page: String(page), per_page: String(perPage) };
    if (state) params["school.state"] = state;
    if (control === "public") params["school.ownership"] = "1";
    if (control === "private") params["school.ownership"] = "2";
    try {
      const json = await fetchJson(buildUrl(params));
      const results = json.results || [];
      all.push(...results);
      total = json.metadata?.total ?? total;
      const seen = (page + 1) * perPage;
      if (results.length < perPage || (total != null && seen >= total)) break;
      page++;
      await sleep(120); // gentle throttle between pages
    } catch (err) {
      lastErr = err;
      partial = true;
      break; // stop scanning, use what we have
    }
  }
  if (page >= maxPages - 1 && total != null && all.length < total) partial = true;

  if (all.length) {
    cacheSet(cacheKey, { list: all, pages: page + 1, partial });
    return {
      results: all.map(normalize),
      meta: { cached: false, fetchedAt: Date.now(), source: SOURCE, degraded: !!lastErr, error: lastErr?.message, partial },
      pages: page + 1, partial,
    };
  }
  // Nothing fetched at all. Fall back to stale cache if we have it.
  if (cached) {
    const payload = cached.data || {};
    return { results: (payload.list || []).map(normalize), meta: { cached: true, fetchedAt: cached.fetchedAt, source: SOURCE, degraded: true, error: lastErr?.message }, pages: payload.pages, partial: payload.partial };
  }
  throw (lastErr || new Error("No colleges returned."));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function getCollegeById(id) {  const key = `college:${id}`;
  const { data, meta } = await cachedFetch(key, buildUrl({ id: String(id) }));
  const rec = (data.results || [])[0];
  if (!rec) return null;
  return { college: normalize(rec), meta };
}

// Find colleges that offer a given major/field. Scorecard doesn't do free-text
// program search well, so we map common majors to 4-digit CIP codes and use
// Scorecard's per-school program list (latest.programs.cip_4_digit) to verify a
// bachelor's-level program actually exists before returning the college.
//
// NOTE ON CIP CODES: these follow the NCES CIP 2020 structure. Scorecard
// represents them as 4-digit strings (e.g. "1107" = Computer Science). They are
// best-effort and should be confirmed against live Scorecard responses; the
// filtering logic degrades gracefully if a code doesn't match.
export const MAJOR_CIP_MAP = {
  "computer science": ["1107", "1101", "1102", "3008"],
  "data science": ["3070", "3071", "1107", "2705", "1101"],
  "data analytics": ["3071", "3070", "5213"],
  "cybersecurity": ["1110", "1101", "1107", "4303"],
  "artificial intelligence": ["1101", "1107", "3017", "3070"],
  "information technology": ["1101", "1103", "1109", "1110"],
  "software": ["1102", "1107", "1101"],
  "electrical engineering": ["1410"],
  "computer engineering": ["1409"],
  "mechanical engineering": ["1419"],
  "civil engineering": ["1408"],
  "chemical engineering": ["1407"],
  "aerospace engineering": ["1402"],
  "biomedical engineering": ["1405"],
  "engineering": ["1401", "1408", "1409", "1410", "1419"],
  "finance": ["5208"],
  "accounting": ["5203"],
  "business": ["5201", "5202", "5206"],
  "business analytics": ["5213", "3071"],
  "management": ["5202"],
  "marketing": ["5214"],
  "economics": ["4506"],
  "mathematics": ["2701"],
  "statistics": ["2705", "2706"],
  "physics": ["4008"],
  "chemistry": ["4005"],
  "biology": ["2601"],
  "biochemistry": ["2602"],
  "neuroscience": ["2610", "3016"],
  "public policy": ["4405", "4404"],
  "political science": ["4510"],
  "psychology": ["4201"],
  "nursing": ["5138"],
  "public health": ["5122"],
  "english": ["2301"],
  "history": ["5401"],
  "philosophy": ["3801"],
};

// Readable titles for CIP families (for match annotation).
const CIP_TITLES = {
  "1107": "Computer Science", "1101": "Computer & Information Sciences, General",
  "1102": "Computer Programming", "1103": "Information Science", "1109": "Computer Systems Networking",
  "1110": "Computer/Information Security", "3008": "Mathematics & Computer Science",
  "3070": "Data Science", "3071": "Data Analytics", "2705": "Statistics", "2706": "Mathematical Statistics",
  "3017": "Behavioral/Cognitive Science", "4303": "Cybersecurity",
  "1409": "Computer Engineering", "1410": "Electrical & Electronics Engineering",
  "1419": "Mechanical Engineering", "1408": "Civil Engineering", "1407": "Chemical Engineering",
  "1402": "Aerospace Engineering", "1405": "Biomedical Engineering", "1401": "Engineering, General",
  "5208": "Finance", "5203": "Accounting", "5201": "Business/Commerce, General",
  "5202": "Business Administration & Management", "5206": "Business/Managerial Economics",
  "5213": "Business Analytics", "5214": "Marketing", "4506": "Economics",
  "2701": "Mathematics", "4008": "Physics", "4005": "Chemistry", "2601": "Biology, General",
  "2602": "Biochemistry", "2610": "Neuroscience", "4405": "Public Policy Analysis",
  "4404": "Public Administration", "4510": "Political Science", "4201": "Psychology",
  "5138": "Nursing", "5122": "Public Health", "2301": "English", "5401": "History", "3801": "Philosophy",
};

export function cipsForMajor(major) {
  const key = (major || "").toLowerCase().trim();
  if (MAJOR_CIP_MAP[key]) return { primary: MAJOR_CIP_MAP[key], key };
  // partial match (e.g. "computer science and engineering")
  for (const k of Object.keys(MAJOR_CIP_MAP)) {
    if (key.includes(k) || k.includes(key)) return { primary: MAJOR_CIP_MAP[k], key: k };
  }
  return { primary: [], key };
}

// Normalize a CIP code to 4 digits, no dot: "11.07" -> "1107", 1107 -> "1107".
export function normalizeCip(v) {
  if (v == null) return "";
  const s = String(v).replace(/[^0-9]/g, "");
  return s;
}

// Credential level may be a number or a string, and may live in several places.
function credentialLevel(p) {
  const lvl = p?.credential?.level ?? p?.credential_level ?? p?.["credential.level"];
  return Number(lvl);
}

// Extract a CIP code from any of the shapes Scorecard/our cache may produce.
function programCip(p) {
  return normalizeCip(p?.code ?? p?.cip_4_digit ?? p?.["cip_4_digit.code"] ?? p?.cipCode);
}

function programTitle(p) {
  return p?.title ?? p?.credential?.title ?? p?.["cip_4_digit.title"] ?? null;
}

// Pull the raw program array from any of the shapes it may appear in.
export function rawProgramArray(raw) {
  const arr = raw?.["latest.programs.cip_4_digit"]
    ?? raw?.latest?.programs?.cip_4_digit
    ?? raw?.programs?.cip_4_digit
    ?? [];
  return Array.isArray(arr) ? arr : [];
}

// Bachelor's-level (credential level 3) programs from a raw Scorecard record.
function bachelorPrograms(raw) {
  return rawProgramArray(raw)
    .filter((p) => credentialLevel(p) === 3)
    .map((p) => ({
      cipCode: programCip(p),
      title: programTitle(p) || CIP_TITLES[programCip(p)] || "Program",
      credentialLevel: 3,
    }))
    .filter((p) => p.cipCode);
}

function matchPrograms(programs, cipList) {
  const set = new Set(cipList);
  const exact = programs.filter((p) => set.has(p.cipCode));
  return exact.map((p, i) => ({ ...p, matchType: i === 0 ? "exact" : "related" }));
}

const MAJOR_SOURCE = "U.S. Department of Education College Scorecard";
const MAJOR_DISCLAIMER = "Program availability is based on College Scorecard field-of-study data and should be confirmed on each college's official catalog/admissions site.";

// Scorecard's nested CIP filter expects UNDOTTED 4-digit codes (e.g. "1107").
// Verified empirically: code=11.07 returns 0 results; code=1107 returns matches.
// Do not "helpfully" insert a dot here - it silently zeroes out every search.
function apiCip(c) { return normalizeCip(c); }

// Major-search candidate-pool sizes. "Standard" is the default and is what
// keeps this fast enough for Railway; "Deep" is an explicit, opt-in, advanced
// option the user must choose - it is never run automatically. These bound
// how many raw Scorecard records we scan before verifying program matches,
// NOT a cap on how many verified results we show (all verified matches within
// the scanned pool are returned; the client windows through them).
export const MAJOR_SEARCH_STANDARD_POOL = 500;
export const MAJOR_SEARCH_DEEP_POOL = 2000;
// Short-lived cache for major-search results (separate from the 24h general
// cache): search inputs are more varied and results should refresh sooner.
const MAJOR_SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Page through College Scorecard for colleges whose bachelor's-level program
// list includes ANY of `cips`, up to `poolLimit` raw candidates. Mirrors the
// resilient, throttled pattern used by scanAllColleges()/verifyProgramAvailability()
// above: a page failure stops the scan and returns what was already fetched
// (partial:true) rather than failing the whole search.
async function fetchMajorCandidatePool({ cips, state = null, control = null, poolLimit }) {
  const perPage = 100;
  const maxPages = Math.max(1, Math.ceil(poolLimit / perPage));
  const all = [];
  let page = 0, partial = false, total = null, lastErr = null;
  while (page < maxPages && all.length < poolLimit) {
    const u = new URL(config.scorecard.baseUrl);
    u.searchParams.set("api_key", config.scorecard.apiKey);
    u.searchParams.set("fields", "id,school.name,school.city,school.state,school.ownership,latest.admissions.admission_rate.overall,latest.cost.avg_net_price.overall,latest.completion.completion_rate_4yr_150nt,latest.earnings.10_yrs_after_entry.median,latest.programs.cip_4_digit");
    u.searchParams.set("school.operating", "1");
    // Predominant bachelor's-degree institutions only (excludes certificate-only
    // / mostly-2-year schools), matching the pool used for Matches/Best Fit.
    u.searchParams.set("school.degrees_awarded.predominant", "3");
    if (state) u.searchParams.set("school.state", state);
    if (control === "public") u.searchParams.set("school.ownership", "1");
    if (control === "private") u.searchParams.set("school.ownership", "2");
    if (cips.length) {
      u.searchParams.set("latest.programs.cip_4_digit.code", cips.map(apiCip).join(","));
      u.searchParams.set("latest.programs.cip_4_digit.credential.level", "3");
    }
    u.searchParams.set("sort", "latest.student.size:desc");
    u.searchParams.set("per_page", String(perPage));
    u.searchParams.set("page", String(page));
    try {
      const json = await fetchJson(u.toString());
      const results = json.results || [];
      all.push(...results);
      total = json.metadata?.total ?? total;
      page++;
      const seen = page * perPage;
      if (results.length < perPage || (total != null && seen >= total)) break;
      await sleep(120); // gentle throttle between pages, same as scanAllColleges
    } catch (err) {
      lastErr = err;
      partial = true;
      break; // stop scanning, keep whatever we already have
    }
  }
  if (page >= maxPages && total != null && all.length < total) partial = true;
  return { raws: all.slice(0, poolLimit), total, pagesFetched: page, partial, error: lastErr };
}

// Search colleges offering ONE major. Scans a candidate pool (Standard: up to
// 500 colleges; Deep: up to 2,000, opt-in only) instead of a single page of
// ~25, then verifies bachelor's-level program evidence for every candidate in
// the pool. The verification/normalize logic below is UNCHANGED from before -
// only how many raw candidates it runs against has changed.
export async function searchByMajor({ major, state = null, control = null, deep = false }) {
  const { primary } = cipsForMajor(major);
  const mode = deep ? "deep" : "standard";
  const poolLimit = deep ? MAJOR_SEARCH_DEEP_POOL : MAJOR_SEARCH_STANDARD_POOL;

  const key = `bymajor:v2:${(major || "").toLowerCase()}:${state || "US"}:${control || "any"}:${mode}`;
  const cached = cacheGet(key);
  const fresh = cached && Date.now() - cached.fetchedAt < MAJOR_SEARCH_CACHE_TTL_MS;
  if (fresh) {
    return { ...cached.data, cached: true, fetchedAt: cached.fetchedAt };
  }

  const pool = await fetchMajorCandidatePool({ cips: primary, state, control, poolLimit });

  // No live data at all AND nothing cached - surface the honest upstream error.
  if (!pool.raws.length && pool.error && !cached) throw pool.error;

  const colleges = [];
  for (const raw of pool.raws) {
    const programs = bachelorPrograms(raw);
    const matching = matchPrograms(programs, primary);
    if (!matching.length) continue; // require verified bachelor's program evidence
    const n = normalize(raw);
    colleges.push({
      id: n.id, name: n.name, city: n.city, state: n.state, controlType: n.controlType,
      admissionRate: n.admissionRate, sat25: n.sat25, sat75: n.sat75,
      averageNetPrice: n.averageNetPrice, graduationRate: n.graduationRate, medianEarnings: n.medianEarnings,
      matchingPrograms: matching,
      verifiedOffersMajor: true,
      matchConfidence: "official-field-of-study",
    });
  }

  const result = {
    major,
    cipCodesUsed: primary,
    mode, // "standard" | "deep"
    candidatePoolLimit: poolLimit,
    candidatePoolScanned: pool.raws.length,
    rawResultCount: pool.raws.length, // back-compat alias (previously "raw API results")
    scoredCount: colleges.length,
    partial: pool.partial,
    scanTotalAvailable: pool.total,
    source: MAJOR_SOURCE,
    disclaimer: MAJOR_DISCLAIMER,
    colleges,
  };

  if (colleges.length || pool.raws.length) cacheSet(key, result);
  else if (cached) return { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetchedAt };

  return { ...result, cached: false, fetchedAt: Date.now() };
}

// Page through College Scorecard for the double-major candidate pool: colleges
// whose bachelor's-level programs include major1's CIP codes, requesting the
// FULL nested program list per record (all_programs_nested=true) so major2 can
// also be checked against the same record without a second request. Mirrors
// fetchMajorCandidatePool()'s resilient, throttled pagination pattern above -
// a page failure stops the scan and returns what was already fetched
// (partial:true) instead of failing the whole search.
async function fetchComboCandidatePool({ cips1, state = null, control = null, poolLimit }) {
  const perPage = 100;
  const maxPages = Math.max(1, Math.ceil(poolLimit / perPage));
  const all = [];
  let page = 0, partial = false, total = null, lastErr = null;
  while (page < maxPages && all.length < poolLimit) {
    const u = new URL(config.scorecard.baseUrl);
    u.searchParams.set("api_key", config.scorecard.apiKey);
    u.searchParams.set("fields", "id,school.name,school.city,school.state,school.ownership,latest.admissions.admission_rate.overall,latest.programs.cip_4_digit");
    u.searchParams.set("school.operating", "1");
    u.searchParams.set("school.degrees_awarded.predominant", "3");
    if (state) u.searchParams.set("school.state", state);
    if (control === "public") u.searchParams.set("school.ownership", "1");
    if (control === "private") u.searchParams.set("school.ownership", "2");
    if (cips1.length) {
      u.searchParams.set("latest.programs.cip_4_digit.code", cips1.map(apiCip).join(","));
      u.searchParams.set("latest.programs.cip_4_digit.credential.level", "3");
      // Required: without it Scorecard returns ONLY the nested items that matched
      // major1, so major2 could never be checked against the same record.
      u.searchParams.set("all_programs_nested", "true");
    }
    u.searchParams.set("sort", "latest.student.size:desc");
    u.searchParams.set("per_page", String(perPage));
    u.searchParams.set("page", String(page));
    try {
      const json = await fetchJson(u.toString());
      const results = json.results || [];
      all.push(...results);
      total = json.metadata?.total ?? total;
      page++;
      const seen = page * perPage;
      if (results.length < perPage || (total != null && seen >= total)) break;
      await sleep(150); // slightly gentler throttle: all_programs_nested responses are larger
    } catch (err) {
      lastErr = err;
      partial = true;
      break;
    }
  }
  if (page >= maxPages && total != null && all.length < total) partial = true;
  return { raws: all.slice(0, poolLimit), total, pagesFetched: page, partial, error: lastErr };
}

// Qualitative double-major evidence label -- NOT a numeric score, and NEVER a
// claim that a college officially permits a double major. College Scorecard
// can only ever show that two program AREAS exist in its field-of-study data;
// it has no concept of a double-major/second-major/dual-degree POLICY, so
// this function can never return anything stronger than "programs exist,
// rules not verified." A pairing only ever earns the stronger "Confirmed
// double-major path" wording once a family attaches an official source via
// the double_major_verifications record (see services/doubleMajorVerification.js
// -- isConfirmedDoubleMajor()); that happens downstream of this shared/cached
// search, never here. classifyComboEvidence() also looks at the literal CIP
// title text Scorecard returned for the SECOND major -- this works identically
// for any major pair (e.g. "Computer Science" + "Artificial Intelligence" is
// just one example), never a hardcoded major.
function doubleMajorEvidenceStatus(m1, m2) {
  const evidence = classifyComboEvidence(m2[0]?.title);
  return {
    status: evidence.status,
    verificationStatus: "Needs manual verification",
    secondaryProgramTypeHint: evidence.secondaryProgramTypeHint,
  };
}

// Combination search: one or two majors. Scans a candidate pool (Standard: up
// to 500 colleges; Deep: up to 2,000, opt-in only) instead of the previous
// single page of ~20. Per-candidate match/filter logic is UNCHANGED - only how
// many raw candidates it runs against, and the pool-limit/cache/mode metadata,
// are new.
export async function searchMajorCombos({ major1, major2 = null, state = null, control = null, deep = false }) {
  const c1 = cipsForMajor(major1);
  const c2 = major2 ? cipsForMajor(major2) : null;
  const mode = deep ? "deep" : "standard";
  const poolLimit = deep ? MAJOR_SEARCH_DEEP_POOL : MAJOR_SEARCH_STANDARD_POOL;

  const key = `combos:v2:${major1.toLowerCase()}:${major2 ? major2.toLowerCase() : ""}:${state || "US"}:${control || "any"}:${mode}`;
  const cached = cacheGet(key);
  const fresh = cached && Date.now() - cached.fetchedAt < MAJOR_SEARCH_CACHE_TTL_MS;
  if (fresh) return { ...cached.data, cached: true, fetchedAt: cached.fetchedAt };

  const pool = await fetchComboCandidatePool({ cips1: c1.primary, state, control, poolLimit });
  if (!pool.raws.length && pool.error && !cached) throw pool.error;

  const colleges = [];
  for (const raw of pool.raws) {
    const programs = bachelorPrograms(raw);
    const m1 = matchPrograms(programs, c1.primary);
    if (!m1.length) continue;
    const n = normalize(raw);
    if (major2) {
      const m2 = matchPrograms(programs, c2.primary);
      if (!m2.length) continue; // must offer BOTH
      const evidence = doubleMajorEvidenceStatus(m1, m2);
      colleges.push({
        id: n.id, name: n.name, state: n.state, city: n.city,
        admissionRate: n.admissionRate,
        offersMajor1: true, offersMajor2: true,
        matchingMajor1Programs: m1, matchingMajor2Programs: m2,
        possibleCombination: true,
        verifiedDoubleMajorPolicy: "unverified",
        primaryProgramRequested: major1, secondaryProgramRequested: major2,
        doubleMajorStatus: evidence.status,
        doubleMajorVerificationStatus: evidence.verificationStatus,
        secondaryProgramTypeHint: evidence.secondaryProgramTypeHint,
        doubleMajorLabel: `${major1} + ${major2}`,
        officialProgramSource: "College Scorecard",
        warning: "College Scorecard confirms field/program availability, not whether a formal double major is allowed. Confirm with the college's catalog/advising office.",
      });
    } else {
      // single major: surface other related programs available at the school
      const relatedTitles = [...new Set(programs.map((p) => p.title))].slice(0, 10);
      colleges.push({
        id: n.id, name: n.name, state: n.state, city: n.city,
        admissionRate: n.admissionRate,
        matchingMajor1Programs: m1,
        relatedAvailablePrograms: relatedTitles,
        warning: "Related available programs do not guarantee a formal double major. Confirm with the college.",
      });
    }
  }
  const result = {
    major1, major2,
    cipCodesUsed: { major1: c1.primary, major2: c2?.primary || null },
    mode, // "standard" | "deep"
    candidatePoolLimit: poolLimit,
    candidatePoolScanned: pool.raws.length,
    scoredCount: colleges.length,
    partial: pool.partial,
    scanTotalAvailable: pool.total,
    source: MAJOR_SOURCE,
    disclaimer: MAJOR_DISCLAIMER,
    colleges,
  };

  if (colleges.length || pool.raws.length) cacheSet(key, result);
  else if (cached) return { ...cached.data, cached: true, stale: true, fetchedAt: cached.fetchedAt };

  return { ...result, cached: false, fetchedAt: Date.now() };
}

// Verify which of a set of colleges offer a bachelor's program in the given
// CIP list. Uses ONE program-only request filtered to those CIP codes, then
// returns a Set of matching college IDs. Cached by CIP set + state.
// Returns { verified:Set<id>, available:boolean, error }.
export async function verifyProgramAvailability({ cips, state = null, perPage = 100, maxPages = 5 }) {
  if (!cips || !cips.length) return { verified: new Set(), available: false, partial: false, complete: false, total: null, pagesFetched: 0, maxPages, error: "no CIP codes for this major" };
  const cacheKey = `progverify:${cips.slice().sort().join("_")}:${state || "US"}`;
  const cached = cacheGet(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < config.cacheTtlMs) {
    const partial = !!cached.data.partial;
    return { verified: new Set(cached.data.ids || []), available: true, cached: true,
      partial, complete: !partial, total: cached.data.total ?? null,
      pagesFetched: cached.data.pagesFetched ?? null, maxPages, error: null };
  }

  const ids = [];
  let total = null;
  let pagesFetched = 0;
  let stoppedByMaxPages = false;
  try {
    for (let page = 0; page < maxPages; page++) {
      const u = new URL(config.scorecard.baseUrl);
      u.searchParams.set("api_key", config.scorecard.apiKey);
      u.searchParams.set("fields", "id"); // ids only - tiny payload
      u.searchParams.set("school.operating", "1");
      if (state) u.searchParams.set("school.state", state);
      u.searchParams.set("latest.programs.cip_4_digit.code", cips.map(apiCip).join(","));
      u.searchParams.set("latest.programs.cip_4_digit.credential.level", "3");
      u.searchParams.set("per_page", String(perPage));
      u.searchParams.set("page", String(page));
      const json = await fetchJson(u.toString());
      const results = json.results || [];
      results.forEach((r) => ids.push(String(r.id)));
      pagesFetched = page + 1;
      total = json.metadata?.total ?? total;
      // Stop when this page wasn't full (we've reached the end) OR when the
      // reported total is already covered.
      const reachedEnd = results.length < perPage || (total != null && pagesFetched * perPage >= total);
      if (reachedEnd) break;
      // Otherwise there is more data. If we're about to exceed maxPages, the
      // result is truncated (partial).
      if (page + 1 >= maxPages) { stoppedByMaxPages = true; break; }
      await sleep(120);
    }

    // PARTIAL when the API has more matching colleges than we loaded. This is
    // true if (a) the reported total exceeds what our page budget can hold, or
    // (b) we stopped because we hit maxPages while a full page was still coming
    // back (more data beyond our window).
    const budget = perPage * maxPages;
    const partial =
      (total != null && total > budget) ||
      (total != null && total > ids.length) ||
      stoppedByMaxPages;

    cacheSet(cacheKey, { ids, total, pagesFetched, partial });
    return { verified: new Set(ids), available: true, partial, complete: !partial,
      total, pagesFetched, maxPages, error: null };
  } catch (err) {
    // Never fail the whole Matches tab because program verification failed.
    if (cached) {
      const partial = !!cached.data.partial;
      return { verified: new Set(cached.data.ids || []), available: true, cached: true, stale: true,
        partial, complete: !partial, total: cached.data.total ?? null,
        pagesFetched: cached.data.pagesFetched ?? null, maxPages, error: null };
    }
    return { verified: new Set(), available: false, partial: false, complete: false,
      total: null, pagesFetched, maxPages, error: err.message };
  }
}

export async function getByState(state, page = 0) {
  return searchColleges({ state, page, perPage: 50 });
}

// Search colleges by admission-rate band (e.g. {min:0.15,max:0.35}). Uses
// Scorecard's __range filter so we can guarantee a spread across selectivity.
export async function searchByAdmissionBand({ min, max }, perPage = 40) {
  const u = new URL(config.scorecard.baseUrl);
  u.searchParams.set("api_key", config.scorecard.apiKey);
  u.searchParams.set("fields", FIELDS);
  u.searchParams.set("school.operating", "1");
  u.searchParams.set("school.degrees_awarded.predominant", "3");
  const lo = min == null ? 0 : min;
  const hi = max == null ? 1 : max;
  u.searchParams.set("latest.admissions.admission_rate.overall__range", `${lo}..${hi}`);
  u.searchParams.set("sort", "latest.student.size:desc"); // bigger, better-known first
  u.searchParams.set("per_page", String(perPage));
  const key = `band:${lo}:${hi}:${perPage}`;
  const { data, meta } = await cachedFetch(key, u.toString());
  return { results: (data.results || []).map(normalize), meta };
}

// Fetch the list of academic programs (fields of study) a college offers, from
// College Scorecard's programs.cip_4_digit data. Returns program names grouped,
// with credential levels. Honest: if unavailable, returns empty with a note.
export async function getPrograms(id) {
  const key = `programs:${id}`;
  const u = new URL(config.scorecard.baseUrl);
  u.searchParams.set("api_key", config.scorecard.apiKey);
  u.searchParams.set("id", String(id));
  u.searchParams.set("fields", "id,school.name,latest.programs.cip_4_digit.title,latest.programs.cip_4_digit.credential.level,latest.academics.program_available.assoc_or_bachelors");
  const cached = cacheGet(key);
  const fresh = cached && Date.now() - cached.fetchedAt < config.cacheTtlMs;
  let data;
  if (fresh) { data = cached.data; }
  else {
    try {
      data = await fetchJson(u.toString());
      cacheSet(key, data);
    } catch (err) {
      if (cached) data = cached.data;
      else throw err;
    }
  }
  const rec = (data.results || [])[0];
  if (!rec) return null;
  const cips = rec["latest.programs.cip_4_digit"] || [];
  // Bachelor's-level programs (credential level 3), de-duplicated by title.
  const seen = new Set();
  const programs = [];
  for (const p of cips) {
    const title = p.title;
    const level = p.credential?.level;
    if (!title) continue;
    if (level && level < 3) continue; // level 3 = Bachelor's
    if (seen.has(title)) continue;
    seen.add(title);
    const cipCode = String(p.code || "").replace(".", "") || null;
    programs.push({ title, cipCode, credentialLevel: level || 3, category: cipCategory(cipCode) });
  }
  return { name: rec["school.name"], programs, source: SOURCE, sourceYear: "latest available" };
}

// Broad category from CIP 2-digit prefix (for grouping/filtering in the UI).
function cipCategory(cip) {
  if (!cip) return "Other";
  const two = cip.slice(0, 2);
  const map = {
    "11": "Computing", "14": "Engineering", "27": "Math & Statistics", "40": "Physical Sciences",
    "26": "Biological Sciences", "52": "Business", "45": "Social Sciences", "44": "Public Affairs",
    "42": "Psychology", "51": "Health", "23": "English", "54": "History", "38": "Philosophy",
    "30": "Interdisciplinary",
  };
  return map[two] || "Other";
}

// Suggest plausible double-major combinations from a college's available
// programs. Clearly labeled as inferred from availability, NOT a policy claim.
export function suggestCombinations(programs) {
  const titles = new Set(programs.map((p) => (p.title || "").toLowerCase()));
  const has = (kw) => [...titles].some((t) => t.includes(kw));
  const combos = [];
  const add = (m1, m2, reason) => combos.push({ major1: m1, major2: m2, reason, confidence: "inferred-from-program-availability" });
  if (has("computer science") && has("econom")) add("Computer Science", "Economics", "Both fields appear available and align with tech/business and quant careers.");
  if (has("computer science") && has("mathemat")) add("Computer Science", "Mathematics", "A common rigorous pairing that appears available here.");
  if ((has("data") || has("statist")) && has("econom")) add("Data Science", "Economics", "Analytics + economics; both appear available.");
  if (has("finance") && (has("computer") || has("data"))) add("Finance", "Computer Science", "FinTech-oriented pairing; both appear available.");
  if (has("electrical") && has("computer")) add("Electrical Engineering", "Computer Science", "Hardware + software; both appear available.");
  if (has("public") && (has("data") || has("statist"))) add("Public Policy", "Data Science", "Policy + analytics; both appear available.");
  return combos.slice(0, 6);
}

export { SOURCE as SCORECARD_SOURCE };

// Public helper: CIP codes for an interest label (used by the recommend route).
export function cipsForMajorPublic(major) {
  return cipsForMajor(major).primary || [];
}
