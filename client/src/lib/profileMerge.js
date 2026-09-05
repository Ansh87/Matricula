// profileMerge.js - single source of truth for turning AI-parsed document data
// into profile fields. Used by both App.jsx and ProfileForm.jsx so the mapping
// logic never diverges.

// Canonical interest labels used by the profile chips.
const INTEREST_CANON = {
  "cs": "Computer Science",
  "computer science": "Computer Science",
  "computerscience": "Computer Science",
  "software engineering": "Computer Science",
  "software": "Computer Science",
  "ai": "Artificial Intelligence",
  "artificial intelligence": "Artificial Intelligence",
  "artificial intelligence / ml": "Artificial Intelligence",
  "machine learning": "Artificial Intelligence",
  "ml": "Artificial Intelligence",
  "ai/ml": "Artificial Intelligence",
  "deep learning": "Artificial Intelligence",
  "data science": "Data Science",
  "data analytics": "Data Science",
  "analytics": "Data Science",
  "statistics": "Data Science",
  "cybersecurity": "Cybersecurity",
  "cyber security": "Cybersecurity",
  "information security": "Cybersecurity",
  "electrical engineering": "Electrical Engineering",
  "ee": "Electrical Engineering",
  "computer engineering": "Computer Engineering",
  "finance": "Finance",
  "finance / fintech": "Finance",
  "fintech": "Finance",
  "quantitative finance": "Finance",
  "economics": "Economics",
  "econ": "Economics",
  "business": "Business Analytics",
  "business analytics": "Business Analytics",
  "public policy": "Public Policy",
  "policy": "Public Policy",
  "mathematics": "Mathematics",
  "math": "Mathematics",
  "biomedical engineering": "Biomedical Engineering",
  "mechanical engineering": "Mechanical Engineering",
};

export function canonicalInterest(raw) {
  if (!raw || typeof raw !== "string") return null;
  const k = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (INTEREST_CANON[k]) return INTEREST_CANON[k];
  // try splitting on separators and matching the first recognizable part
  for (const part of k.split(/[\/,;|&+]/).map((s) => s.trim())) {
    if (INTEREST_CANON[part]) return INTEREST_CANON[part];
  }
  // partial containment
  for (const [key, val] of Object.entries(INTEREST_CANON)) {
    if (k.includes(key)) return val;
  }
  return null;
}

// Pull the first present value among alias keys.
function pick(obj, ...aliases) {
  for (const a of aliases) {
    if (obj == null) return undefined;
    if (obj[a] !== undefined && obj[a] !== null && obj[a] !== "") return obj[a];
  }
  return undefined;
}

// Coerce to a number, tolerating strings like "4.42", "1520", "10 AP courses".
export function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(true|yes|y|1)$/i.test(v.trim());
  if (typeof v === "number") return v > 0;
  return undefined;
}

const AWARD_LEVELS = ["none", "school", "local", "regional", "state", "national", "international"];
function normalizeAward(v) {
  if (!v || typeof v !== "string") return undefined;
  const k = v.toLowerCase();
  for (const lvl of [...AWARD_LEVELS].reverse()) {
    if (k.includes(lvl)) return lvl;
  }
  return undefined;
}

/**
 * Normalize a parsed-document object into profile-shaped fields.
 * Returns ONLY the fields that were confidently extracted (no nulls for
 * fields we couldn't read), so a merge never wipes existing data.
 */
export function normalizeParsed(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  const out = {};

  const gpa = toNumber(pick(parsed, "gpa", "unweightedGPA", "unweighted_gpa", "unweightedGpa"));
  if (gpa != null) out.gpa = gpa;

  const gpaW = toNumber(pick(parsed, "gpaWeighted", "weightedGPA", "weighted_gpa", "weightedGpa"));
  if (gpaW != null) out.gpaWeighted = gpaW;

  const sat = toNumber(pick(parsed, "sat", "SAT", "satTotal", "sat_total"));
  if (sat != null) out.sat = sat;

  const satSuper = toNumber(pick(parsed, "satSuper", "satSuperscore", "sat_superscore"));
  if (satSuper != null) out.satSuper = satSuper;

  const act = toNumber(pick(parsed, "act", "ACT", "actComposite", "act_composite"));
  if (act != null) out.act = act;

  const ap = toNumber(pick(parsed, "apCount", "APCount", "ap_count", "rigorousCourseCount", "apCourses"));
  if (ap != null) out.apCount = Math.round(ap);

  const gradYear = toNumber(pick(parsed, "gradYear", "graduationYear", "graduation_year"));
  if (gradYear != null && gradYear > 2000) out.gradYear = Math.round(gradYear);

  const rank = toNumber(pick(parsed, "classRank", "class_rank"));
  if (rank != null) out.classRank = Math.round(rank);

  const size = toNumber(pick(parsed, "classSize", "class_size"));
  if (size != null) out.classSize = Math.round(size);

  const award = normalizeAward(pick(parsed, "awards", "highestAwardLevel", "awardLevel"));
  if (award) out.awards = award;

  // Experience flags
  for (const [key, aliases] of Object.entries({
    hasResearch: ["hasResearch", "research"],
    hasInternship: ["hasInternship", "internship"],
    hasLeadership: ["hasLeadership", "leadership"],
    hasVolunteer: ["hasVolunteer", "volunteer", "volunteering", "communityService"],
  })) {
    const v = toBool(pick(parsed, ...aliases));
    if (v !== undefined) out[key] = v;
  }

  // Interests -> canonical chip labels
  const rawInterests = pick(parsed, "interests", "intendedMajors", "majors");
  if (Array.isArray(rawInterests)) {
    const mapped = rawInterests.map(canonicalInterest).filter(Boolean);
    if (mapped.length) out.interests = [...new Set(mapped)];
  } else if (typeof rawInterests === "string") {
    const mapped = rawInterests.split(/[,;|]/).map(canonicalInterest).filter(Boolean);
    if (mapped.length) out.interests = [...new Set(mapped)];
  }

  // Free-text activities: combine activities/projects/awards_detail/summary
  const chunks = [];
  // Turn a structured entry into readable text that KEEPS role, category, and
  // level - collapsing to just the name loses the detail scoring relies on.
  const describeEntry = (x) => {
    if (typeof x === "string") return x.trim();
    if (!x || typeof x !== "object") return "";
    const name = x.name || x.title || "";
    if (!name) return "";
    const lead = x.role && x.role !== name ? `${x.role}, ${name}` : name;
    const tail = [x.category, x.level].filter(Boolean).join(", ");
    const desc = x.summary || x.description || "";
    let out = tail ? `${lead} - ${tail}` : lead;
    if (desc) out += `: ${desc}`;
    return out.trim();
  };
  const pushList = (v) => {
    if (!v) return;
    const arr = Array.isArray(v) ? v : [v];
    arr.forEach((item) => { const t = describeEntry(item); if (t) chunks.push(t); });
  };
  pushList(pick(parsed, "activities", "extracurriculars"));
  pushList(pick(parsed, "projects", "portfolioProjects"));
  pushList(pick(parsed, "awards_detail", "awardsDetail"));
  const text = chunks.filter(Boolean).join("; ").trim();
  if (text) out.activitiesText = text;
  const summary = pick(parsed, "summary");
  if (typeof summary === "string" && summary.trim()) out.summary = summary.trim();

  // Simple string passthroughs
  for (const k of ["name", "highSchool", "city", "state"]) {
    const v = pick(parsed, k);
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  if (out.state) out.state = out.state.toUpperCase().slice(0, 2);

  return out;
}

/**
 * Merge parsed document data into the current profile.
 * Returns { profile, applied } where `applied` lists the field names changed.
 * Only overwrites fields the parser confidently extracted.
 */
export function mergeParsedIntoProfile(currentProfile, parsed) {
  const norm = normalizeParsed(parsed);
  const applied = [];
  const next = { ...currentProfile };
  for (const [k, v] of Object.entries(norm)) {
    // For activitiesText, append rather than clobber existing notes.
    if (k === "activitiesText" && currentProfile.activitiesText) {
      if (!currentProfile.activitiesText.includes(v)) {
        next.activitiesText = `${currentProfile.activitiesText}; ${v}`;
        applied.push(k);
      }
      continue;
    }
    if (k === "interests" && Array.isArray(currentProfile.interests) && currentProfile.interests.length) {
      const merged = [...new Set([...currentProfile.interests, ...v])];
      if (merged.length !== currentProfile.interests.length) { next.interests = merged; applied.push(k); }
      continue;
    }
    next[k] = v;
    applied.push(k);
  }
  return { profile: next, applied };
}
