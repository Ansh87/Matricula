// majors.js -- the canonical, CIP-backed major/interest list shared by every
// major search field across Matricula: Profile's Intended Major fields,
// Explorer's Single/Double-Major Planner (Majors.jsx), and the Academic
// Interests picker. One list, defined once, so every major search offers the
// exact same options instead of drifting per page.
//
// This is not an invented/hardcoded convenience list -- every entry here has
// real College Scorecard CIP-code backing in server/src/services/scorecard.js
// (MAJOR_CIP_MAP) or a BLS career mapping in server/src/services/bls.js
// (MAJOR_MAP), which is what the recommendation/scoring/college-by-major
// endpoints actually match against. Moved out of ProfileForm.jsx (its
// original home) without changing a single entry, so nothing downstream that
// keyed off these exact strings changes behavior.
export const ALL_MAJORS = [
  "Computer Science","Artificial Intelligence","Data Science","Cybersecurity","Electrical Engineering",
  "Computer Engineering","Aerospace Engineering","Mechanical Engineering","Chemical Engineering",
  "Industrial Engineering","Operations Research","Biomedical Engineering","Materials Science / Materials Engineering",
  "Environmental Engineering","Energy Systems","Finance","Economics","Business Analytics","Mathematics",
  "Statistics","Physics","Applied Physics","Engineering Physics","Business / Product Strategy",
  "Data Analytics","Information Technology","Software Engineering","Civil Engineering","Accounting",
  "Business (General)","Management","Marketing","Chemistry","Biology","Biochemistry","Neuroscience",
  "Public Policy","Political Science","Psychology","Nursing","Public Health","English","History","Philosophy",
];

// Local, instant "search" over the in-memory list above -- no network call,
// which is both faster than a round trip and keeps this consistent with the
// "don't fetch the whole database just to implement autocomplete" guidance:
// there's no database here to begin with, just this static, already-loaded
// array. Callers still apply the same 2-character minimum as network-backed
// searches (see useAutocompleteSearch) for a consistent feel across the app.
export function searchMajors(query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  return ALL_MAJORS.filter((m) => m.toLowerCase().includes(q)).slice(0, limit);
}
