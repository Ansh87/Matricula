// selectionContext.js - shared label constants and merge logic for tracking
// WHERE a saved college came from (My List) and, when relevant, its
// double-major context. Used by routes/misc.js (student_college_list) and
// routes/decisionPlan.js (decision_plan_items). Kept as one small, dependency
// -free module so both routes stay in sync on the same label strings instead
// of drifting.

export const SELECTION_CONTEXTS = [
  "Selected from Single Major Search",
  "Selected from Double Major Search",
  "Selected from Career Track Search",
  "Selected from Best Fit",
  "Selected from Balanced List",
  "Added from Imported List",
  "Selected manually",
];

// Family-facing status label for a double-major search result / saved
// pathway. Re-exported from doubleMajorVerification.js (the source of truth)
// so existing importers of this file don't need to change; kept here too to
// avoid a circular import between the two service files.
export const DOUBLE_MAJOR_STATUSES = [
  "Confirmed double-major path",
  "Confirmed with restrictions",
  "Programs exist - double-major rules not verified",
  "Second program is not confirmed as an undergraduate major",
  "Needs official verification",
  "Not confirmed",
];

export const DOUBLE_MAJOR_VERIFICATION_STATUSES = [
  "Official source verified",
  "User verified",
  "Needs manual verification",
  "Unknown",
];

// Statuses that count as "actually verified" for Verification Center purposes.
export const DOUBLE_MAJOR_VERIFIED_STATUSES = ["Official source verified", "User verified"];

function safeParseArray(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// Merge a newly-selected context into the existing accumulated set (dedup,
// preserve order of first appearance). Returns the new JSON string.
export function mergeSelectionContexts(existingJson, newContext) {
  const list = safeParseArray(existingJson);
  const ctx = newContext && SELECTION_CONTEXTS.includes(newContext) ? newContext : "Selected manually";
  if (!list.includes(ctx)) list.push(ctx);
  return JSON.stringify(list);
}

export function parseSelectionContexts(json) {
  return safeParseArray(json);
}

// Merge a newly-added double-major pathway (primary+secondary) into the
// existing list of pathways for this college, deduped by primary+secondary
// (case-insensitive). Updates the matching pathway in place if it already
// exists (e.g. re-running the search refreshes its status), otherwise appends
// a new one. Returns the new JSON string.
export function mergeDoubleMajorPathway(existingJson, pathway) {
  const list = safeParseArray(existingJson);
  const key = (p) => `${(p.primaryMajor || "").toLowerCase()}::${(p.secondaryMajor || "").toLowerCase()}`;
  const idx = list.findIndex((p) => key(p) === key(pathway));
  if (idx >= 0) list[idx] = { ...list[idx], ...pathway };
  else list.push(pathway);
  return JSON.stringify(list);
}

export function parseDoubleMajorPathways(json) {
  return safeParseArray(json);
}
