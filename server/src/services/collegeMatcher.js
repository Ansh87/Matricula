// collegeMatcher.js - Import College List: turns whatever a family typed or
// pasted (short names, nicknames, abbreviations, misspellings) into official
// College Scorecard records, honestly. Two layers, always in this order:
//   1. A curated alias/nickname/common-misspelling table (ALIASES below) --
//      the same "known, hand-verified list" pattern already used elsewhere in
//      this app (TOP_STEM, TOP_FINANCE, IVY_IDS, SERVICE_ACADEMY_NAMES). This
//      is what resolves "CMU", "MIT", "UIUC", "Georgia Tech", "UC Berkley"
//      (misspelled), "Cornel" (misspelled), and ambiguous multi-campus
//      systems like "Rutgers".
//   2. A generic fallback for anything NOT in the alias table: live College
//      Scorecard name search (school.name, a substring search) plus a local
//      string-similarity re-rank, so a family typing a school's real full
//      name (or a name close to one) still works even though it was never
//      hand-curated.
// NEVER guesses when uncertain -- callers (routes/collegeImport.js) apply the
// confidence rules (high/medium/low/ambiguous/no-match) and only high
// confidence is auto-add-eligible.
import { searchColleges } from "./scorecard.js";

export const CONFIDENCE = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence", AMBIGUOUS: "Ambiguous", NONE: "No match" };

export function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/[-–-]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Classic Levenshtein edit distance, then converted to a 0..1 similarity
// ratio (1 = identical). Used ONLY for local, deterministic fuzzy correction
// -- no ML, no external service, same "never invent, only compute" style as
// the rest of the app's scoring code.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}
export function similarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

// ---------------------------------------------------------------------------
// Curated alias table. Keys are normalized (see normalizeName) short names,
// nicknames, abbreviations, and hand-picked common misspellings. A value is
// either a single official-name string (resolves unambiguously) or an array
// of { name, campusLabel } when the short form is genuinely ambiguous across
// multiple real campuses -- those always require the family to pick.
// Official names are written to match College Scorecard's own school.name
// field as closely as possible; the live search step re-verifies the match
// against the real record rather than trusting this list blindly.
// ---------------------------------------------------------------------------
export const ALIASES = {
  // Explicit spec examples.
  "cmu": "Carnegie Mellon University",
  "uiuc": "University of Illinois Urbana-Champaign",
  "u of i": "University of Illinois Urbana-Champaign",
  "university of illinois": "University of Illinois Urbana-Champaign",
  "ucla": "University of California-Los Angeles",
  "uc berkley": "University of California-Berkeley", // common misspelling
  "uc berkeley": "University of California-Berkeley",
  "berkeley": "University of California-Berkeley",
  "cal": "University of California-Berkeley",
  "cornel": "Cornell University", // common misspelling
  "cornell": "Cornell University",
  "mit": "Massachusetts Institute of Technology",
  "princeton": "Princeton University",
  "caltech": "California Institute of Technology",
  "cal tech": "California Institute of Technology",
  "georgia tech": "Georgia Institute of Technology-Main Campus",
  "gt": "Georgia Institute of Technology-Main Campus",
  "gatech": "Georgia Institute of Technology-Main Campus",
  // Ambiguous multi-campus systems -- always shown as choices, never guessed.
  "rutgers": [
    { name: "Rutgers University-New Brunswick", campusLabel: "New Brunswick" },
    { name: "Rutgers University-Newark", campusLabel: "Newark" },
    { name: "Rutgers University-Camden", campusLabel: "Camden" },
  ],
  "osu": [
    { name: "Ohio State University-Main Campus", campusLabel: "Ohio State" },
    { name: "Oregon State University", campusLabel: "Oregon State" },
    { name: "Oklahoma State University-Main Campus", campusLabel: "Oklahoma State" },
  ],
  "msu": [
    { name: "Michigan State University", campusLabel: "Michigan State" },
    { name: "Mississippi State University", campusLabel: "Mississippi State" },
  ],
  "uw": [
    { name: "University of Washington-Seattle Campus", campusLabel: "Washington" },
    { name: "University of Wisconsin-Madison", campusLabel: "Wisconsin" },
  ],
  "ut": [
    { name: "University of Texas at Austin", campusLabel: "Austin" },
    { name: "University of Texas at Dallas", campusLabel: "Dallas" },
    { name: "University of Texas at San Antonio", campusLabel: "San Antonio" },
  ],
  "um": [
    { name: "University of Michigan-Ann Arbor", campusLabel: "Michigan" },
    { name: "University of Maryland-College Park", campusLabel: "Maryland" },
    { name: "University of Miami", campusLabel: "Miami" },
  ],
  // Common, unambiguous abbreviations/nicknames.
  "ut austin": "University of Texas at Austin",
  "texas": "University of Texas at Austin",
  "uw madison": "University of Wisconsin-Madison",
  "wisc": "University of Wisconsin-Madison",
  "uw seattle": "University of Washington-Seattle Campus",
  "u washington": "University of Washington-Seattle Campus",
  "umich": "University of Michigan-Ann Arbor",
  "u michigan": "University of Michigan-Ann Arbor",
  "michigan": "University of Michigan-Ann Arbor",
  "umd": "University of Maryland-College Park",
  "maryland": "University of Maryland-College Park",
  "umass": "University of Massachusetts-Amherst",
  "u mass": "University of Massachusetts-Amherst",
  "psu": "Pennsylvania State University-Main Campus",
  "penn state": "Pennsylvania State University-Main Campus",
  "penn": "University of Pennsylvania",
  "upenn": "University of Pennsylvania",
  "u penn": "University of Pennsylvania",
  "pitt": "University of Pittsburgh-Pittsburgh Campus",
  "tamu": "Texas A & M University-College Station",
  "texas a&m": "Texas A & M University-College Station",
  "vt": "Virginia Polytechnic Institute and State University",
  "virginia tech": "Virginia Polytechnic Institute and State University",
  "uva": "University of Virginia-Main Campus",
  "u virginia": "University of Virginia-Main Campus",
  "unc": "University of North Carolina at Chapel Hill",
  "unc chapel hill": "University of North Carolina at Chapel Hill",
  "ucsd": "University of California-San Diego",
  "uc san diego": "University of California-San Diego",
  "ucsb": "University of California-Santa Barbara",
  "uc santa barbara": "University of California-Santa Barbara",
  "uc davis": "University of California-Davis",
  "uc irvine": "University of California-Irvine",
  "usc": "University of Southern California",
  "nyu": "New York University",
  "bu": "Boston University",
  "bc": "Boston College",
  "northeastern": "Northeastern University",
  "neu": "Northeastern University",
  "jhu": "Johns Hopkins University",
  "johns hopkins": "Johns Hopkins University",
  "gwu": "George Washington University",
  "gw": "George Washington University",
  "asu": "Arizona State University-Tempe",
  "arizona state": "Arizona State University-Tempe",
  "fsu": "Florida State University",
  "uf": "University of Florida",
  "florida": "University of Florida",
  "uga": "University of Georgia",
  "georgia": "University of Georgia",
  "duke": "Duke University",
  "stanford": "Stanford University",
  "northwestern": "Northwestern University",
  "vandy": "Vanderbilt University",
  "vanderbilt": "Vanderbilt University",
  "wustl": "Washington University in St Louis",
  "wash u": "Washington University in St Louis",
  "emory": "Emory University",
  "tufts": "Tufts University",
  "brandeis": "Brandeis University",
  "cwru": "Case Western Reserve University",
  "case western": "Case Western Reserve University",
  "rit": "Rochester Institute of Technology",
  "rpi": "Rensselaer Polytechnic Institute",
  "wpi": "Worcester Polytechnic Institute",
  "smu": "Southern Methodist University",
  "tcu": "Texas Christian University",
  "baylor": "Baylor University",
  "rice": "Rice University",
  "nd": "University of Notre Dame",
  "notre dame": "University of Notre Dame",
  "brown": "Brown University",
  "columbia": "Columbia University in the City of New York",
  "dartmouth": "Dartmouth College",
  "harvard": "Harvard University",
  "yale": "Yale University",
  "purdue": "Purdue University-Main Campus",
  "indiana": "Indiana University-Bloomington",
  "iu": "Indiana University-Bloomington",
  "ohio state": "Ohio State University-Main Campus",
  "oregon state": "Oregon State University",
  "oklahoma state": "Oklahoma State University-Main Campus",
  "michigan state": "Michigan State University",
  "mississippi state": "Mississippi State University",
  "alabama": "The University of Alabama",
  "auburn": "Auburn University",
  "clemson": "Clemson University",
  "miami": "University of Miami",
  "syracuse": "Syracuse University",
  "colorado": "University of Colorado Boulder",
  "cu boulder": "University of Colorado Boulder",
  "unl": "University of Nebraska-Lincoln",
  "nebraska": "University of Nebraska-Lincoln",
  "ku": "University of Kansas",
  "kansas": "University of Kansas",
  "mizzou": "University of Missouri-Columbia",
  "missouri": "University of Missouri-Columbia",
  "iowa": "University of Iowa",
  "minnesota": "University of Minnesota-Twin Cities",
  "umn": "University of Minnesota-Twin Cities",
};

// Keys in ALIASES that are common MISSPELLINGS of a school's real name (as
// opposed to a deliberate abbreviation/nickname like "CMU" or "MIT"). This
// distinction matters for the family-facing result wording: resolving "CMU"
// is just normal nickname handling ("Added"), while resolving "UC Berkley"
// or "Cornel" is a spelling fix worth calling out ("Corrected and added").
const MISSPELLING_ALIAS_KEYS = new Set(["uc berkley", "cornel"]);

// Fuzzy-fallback reference pool for misspellings NOT explicitly listed above
// -- every alias key/value already in ALIASES, deduped. Kept as a derived
// constant (not hand-duplicated) so it never drifts out of sync with ALIASES.
function buildReferencePool() {
  const pool = new Set();
  for (const [key, val] of Object.entries(ALIASES)) {
    pool.add(key);
    if (Array.isArray(val)) val.forEach((v) => pool.add(v.name));
    else pool.add(val);
  }
  return [...pool];
}
const REFERENCE_POOL = buildReferencePool();

// ---------------------------------------------------------------------------
// classifyName: pure, offline, deterministic. Decides which alias/fuzzy tier
// a raw input name falls into, WITHOUT touching the network. The route layer
// (routes/collegeImport.js) takes this and, for anything with a concrete
// candidate name, verifies it against live College Scorecard data before
// finalizing a confidence level -- classifyName alone never claims a college
// is real.
// ---------------------------------------------------------------------------
export function classifyName(rawName) {
  const norm = normalizeName(rawName);
  if (!norm) return { tier: "empty", candidates: [] };

  // 1. Exact alias key match.
  if (Object.prototype.hasOwnProperty.call(ALIASES, norm)) {
    const val = ALIASES[norm];
    if (Array.isArray(val)) return { tier: "alias-ambiguous", candidates: val.map((v) => ({ name: v.name, campusLabel: v.campusLabel, similarity: 1 })) };
    const tier = MISSPELLING_ALIAS_KEYS.has(norm) ? "alias-misspelling" : "alias-exact";
    return { tier, candidates: [{ name: val, similarity: 1 }] };
  }

  // 2. Exact literal match against the reference pool (e.g. the family typed
  // the school's real official-ish name in full, correctly).
  const exactRef = REFERENCE_POOL.find((r) => normalizeName(r) === norm);
  if (exactRef) return { tier: "alias-exact", candidates: [{ name: exactRef, similarity: 1 }] };

  // 3. Fuzzy correction against alias keys + reference pool (misspellings of
  // known short names or known official names -- e.g. a typo of "Cornell").
  const scored = REFERENCE_POOL
    .map((r) => ({ name: ALIASES[r] && !Array.isArray(ALIASES[r]) ? ALIASES[r] : r, sim: similarity(norm, r) }))
    .filter((x) => x.sim >= 0.55)
    .sort((a, b) => b.sim - a.sim);
  // Dedup by resolved name, keep best score per name.
  const byName = new Map();
  for (const s of scored) if (!byName.has(s.name) || byName.get(s.name) < s.sim) byName.set(s.name, s.sim);
  const ranked = [...byName.entries()].map(([name, sim]) => ({ name, similarity: sim })).sort((a, b) => b.similarity - a.similarity);

  if (ranked.length) {
    const top = ranked[0];
    const second = ranked[1];
    if (top.similarity >= 0.82 && (!second || top.similarity - second.similarity >= 0.08)) {
      return { tier: "fuzzy-corrected", candidates: [top] };
    }
    if (top.similarity >= 0.65) {
      return { tier: "fuzzy-weak", candidates: ranked.slice(0, 3) };
    }
  }

  // 4. Unknown to the curated layer entirely -- hand off to live search.
  return { tier: "freeform", candidates: [] };
}

// ---------------------------------------------------------------------------
// matchOneName: the full pipeline for a single input name. Combines
// classifyName() with a live College Scorecard name search (when needed/
// available) to produce the final confidence tier + candidate college
// records the review screen shows. Never throws on a Scorecard outage --
// degrades to a clear "could not verify live" note instead of a fake match.
// ---------------------------------------------------------------------------
export async function matchOneName(rawName, { state } = {}) {
  const originalName = String(rawName || "").trim();
  const cls = classifyName(originalName);
  if (cls.tier === "empty") return null;

  const verify = async (name) => {
    try {
      const r = await searchColleges({ name, state: state || undefined, perPage: 8 });
      return { results: r.results || [], error: null };
    } catch (err) {
      return { results: [], error: err.message || "Could not reach College Scorecard." };
    }
  };

  // Pick the Scorecard result that best matches a candidate name (handles
  // Scorecard's substring search returning several similarly-named schools,
  // e.g. searching "Georgia Institute of Technology-Main Campus" should not
  // accidentally prefer an unrelated partial match).
  const bestOf = (results, targetName) => {
    if (!results.length) return null;
    return [...results].sort((a, b) => similarity(b.name, targetName) - similarity(a.name, targetName))[0];
  };

  if (cls.tier === "alias-ambiguous") {
    const options = [];
    for (const c of cls.candidates) {
      const { results } = await verify(c.name);
      const hit = bestOf(results, c.name);
      options.push({ officialName: c.name, campusLabel: c.campusLabel, collegeId: hit?.id || null, city: hit?.city || null, state: hit?.state || null, controlType: hit?.controlType || null });
    }
    return { originalName, confidence: CONFIDENCE.AMBIGUOUS, tier: cls.tier, options, note: `${originalName} could mean multiple campuses. Please select the correct campus.` };
  }

  if (cls.tier === "alias-exact" || cls.tier === "alias-misspelling" || cls.tier === "fuzzy-corrected") {
    const target = cls.candidates[0].name;
    const { results, error } = await verify(target);
    const hit = bestOf(results, target);
    if (!hit) {
      return { originalName, confidence: error ? CONFIDENCE.LOW : CONFIDENCE.NONE, tier: cls.tier, matchedName: target,
        note: error ? `Matched to "${target}" but could not verify it against live College Scorecard data right now.` : `"${target}" was not found in current College Scorecard data.` };
    }
    // "alias-exact" is a deliberate nickname/abbreviation (e.g. CMU, MIT,
    // UIUC) -- not a spelling fix, so it's NOT flagged as "corrected" even
    // though the text differs. "alias-misspelling" and "fuzzy-corrected" ARE
    // spelling fixes (e.g. "UC Berkley" -> Berkeley, "Cornel" -> Cornell).
    const corrected = cls.tier !== "alias-exact";
    return {
      originalName, confidence: CONFIDENCE.HIGH, tier: cls.tier,
      matchedName: hit.name, collegeId: hit.id, city: hit.city, state: hit.state, controlType: hit.controlType,
      corrected, correctedFrom: corrected ? originalName : null,
    };
  }

  if (cls.tier === "fuzzy-weak") {
    // Several plausible names, none confident enough to call a single best
    // match -- surface as ambiguous-ish choices rather than guessing, but at
    // LOW confidence overall (per spec: low confidence is never auto-added).
    const options = [];
    for (const c of cls.candidates) {
      const { results } = await verify(c.name);
      const hit = bestOf(results, c.name);
      options.push({ officialName: c.name, collegeId: hit?.id || null, city: hit?.city || null, state: hit?.state || null, controlType: hit?.controlType || null, similarity: c.similarity });
    }
    return { originalName, confidence: CONFIDENCE.LOW, tier: cls.tier, options, note: `Not confident about a match for "${originalName}". Choose the right college or search manually.` };
  }

  return matchOneNameFreeform(originalName, verify);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Match a whole imported list, one name at a time with a gentle delay between
// live Scorecard lookups (same throttling philosophy as the paginated major
// search in scorecard.js) so a 30-50 name paste doesn't trip a rate limit.
export async function matchNames(names, { state } = {}) {
  const out = [];
  for (const n of names) {
    out.push(await matchOneName(n, { state }));
    await sleep(120);
  }
  return out;
}

async function matchOneNameFreeform(originalName, verify) {
  // freeform: no curated hit at all -- fall back fully to live Scorecard
  // search on the raw name, then locally re-rank by string similarity.
  const { results, error } = await verify(originalName);
  if (error) return { originalName, confidence: CONFIDENCE.NONE, tier: "error", note: `Could not check College Scorecard for "${originalName}": ${error}` };
  if (!results.length) return { originalName, confidence: CONFIDENCE.NONE, tier: "freeform", note: `"${originalName}" was not found.` };

  const ranked = [...results].map((r) => ({ ...r, sim: similarity(r.name, originalName) })).sort((a, b) => b.sim - a.sim);
  const top = ranked[0], second = ranked[1];
  if (top.sim >= 0.9) {
    return { originalName, confidence: CONFIDENCE.HIGH, tier: "live-exact", matchedName: top.name, collegeId: top.id, city: top.city, state: top.state, controlType: top.controlType, corrected: false };
  }
  if (top.sim >= 0.7 && (!second || top.sim - second.sim >= 0.12)) {
    return { originalName, confidence: CONFIDENCE.MEDIUM, tier: "live-suggested", matchedName: top.name, collegeId: top.id, city: top.city, state: top.state, controlType: top.controlType, corrected: normalizeName(top.name) !== normalizeName(originalName), correctedFrom: originalName,
      note: `Best guess for "${originalName}" - please confirm this is the right college.` };
  }
  if (top.sim >= 0.45) {
    const options = ranked.slice(0, 5).map((r) => ({ officialName: r.name, collegeId: r.id, city: r.city, state: r.state, controlType: r.controlType, similarity: r.sim }));
    return { originalName, confidence: CONFIDENCE.LOW, tier: "live-weak", options, note: `Not confident about a match for "${originalName}". Choose the right college or search manually.` };
  }
  return { originalName, confidence: CONFIDENCE.NONE, tier: "live-none", note: `"${originalName}" was not found. Try the college's full official name, or search manually.` };
}
