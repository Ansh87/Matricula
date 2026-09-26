// api.js -- the browser's only channel to data. Everything goes through our own
// /api/* routes; no external API keys ever touch the client.
import { auth, firebaseConfigured } from "./firebase.js";
import { isNative, NATIVE_API_BASE_URL } from "./platform.js";

// apiUrl: the single place an "/api/..." path becomes a real URL.
//  - Website (Railway): stays a relative path -> same-origin, no CORS, unchanged.
//  - Native iOS app: the frontend is bundled inside the app (capacitor://localhost),
//    so relative paths would hit the app bundle, not the server. Prefix the
//    Railway backend instead. The server already allows cross-origin requests.
export function apiUrl(path) {
  if (!isNative || /^https?:\/\//i.test(path)) return path;
  return `${NATIVE_API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Attach the current user's Firebase ID token to every /api request.
// Firebase refreshes/caches the token internally; we never store it ourselves.
async function afetch(path, options = {}) {
  const url = apiUrl(path);
  const opts = { ...options };
  opts.headers = { ...(options.headers || {}) };
  try {
    if (firebaseConfigured && auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) opts.headers.Authorization = `Bearer ${token}`;
    }
  } catch { /* no token available; request proceeds and protected routes 401 */ }
  return fetch(url, opts);
}

const j = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Prefer the server's own message. Fall back to a plain-language explanation
    // for the two statuses that otherwise surface as a bare, confusing code.
    let msg = data.message;
    if (!msg && r.status === 503) {
      msg = "The server's authentication isn't configured yet (FIREBASE_SERVICE_ACCOUNT_JSON is missing). Sign-in-protected features like document upload won't work until it's set.";
    } else if (!msg && r.status === 401) {
      msg = "You're not signed in (or your session expired). Sign in again and retry.";
    } else if (!msg) {
      msg = `Request failed (${r.status})`;
    }
    throw Object.assign(new Error(msg), { payload: data, status: r.status });
  }
  return data;
};

export const api = {
  health: () => afetch("/api/health").then(j),

  searchColleges: (params) => {
    const q = new URLSearchParams(params).toString();
    return afetch(`/api/colleges/search?${q}`).then(j);
  },
  byState: (state, page = 0) => afetch(`/api/colleges/by-state?state=${state}&page=${page}`).then(j),
  college: (id) => afetch(`/api/colleges/${id}`).then(j),
  cultureFit: (id, profile) =>
    afetch(`/api/colleges/${id}/fit`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  majorStrategy: (id, interests) =>
    afetch(`/api/colleges/${id}/major-strategy?interests=${encodeURIComponent((interests || []).join(","))}`).then(j),
  simLevers: () => afetch(`/api/colleges/simulator/levers`).then(j),
  topStem: (limit = 30) => afetch(`/api/colleges/top-stem?limit=${limit}`).then(j),
  topStemFit: (profile, limit = 30) =>
    afetch(`/api/colleges/top-stem/fit?limit=${limit}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  simulate: (id, profile, levers) =>
    afetch(`/api/colleges/${id}/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, levers }),
    }).then(j),
  recommend: (profile, filters, includeServiceAcademies = false) =>
    afetch("/api/colleges/recommend", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, filters, includeServiceAcademies }),
    }).then(j),
  scoreOne: (profile, collegeId) =>
    afetch("/api/colleges/score", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, collegeId }),
    }).then(j),

  majors: () => afetch("/api/careers/majors").then(j),
  major: (name) => afetch(`/api/careers/major/${encodeURIComponent(name)}`).then(j),

  saveStudent: (id, p) =>
    afetch(`/api/students/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    }).then(j),
  getStudent: (id) => afetch(`/api/students/${id}`).then(j),
  // What the matching engine actually detected from the profile's free text
  // (activities/resume/portfolio) -- research/leadership/awards signals and
  // the resulting extracurricular strength score used in Match. Read-only;
  // never changes what's computed, just shows it.
  getProfileSignals: (id, profile) =>
    afetch(`/api/students/${id}/signals`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  getList: (id) => afetch(`/api/students/${id}/list`).then(j),
  saveListItem: (id, collegeId, b) =>
    afetch(`/api/students/${id}/list/${collegeId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(j),
  removeListItem: (id, collegeId) =>
    afetch(`/api/students/${id}/list/${collegeId}`, { method: "DELETE" }).then(j),
  getTracker: (id) => afetch(`/api/students/${id}/tracker`).then(j),
  saveTracker: (id, collegeId, b) =>
    afetch(`/api/students/${id}/tracker/${collegeId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(j),

  advisor: (question, profile, recommendations) => {
    // Send ONLY the fields the advisor reads. The full scored list is several
    // megabytes and exceeds the server's request-size limit (HTTP 413).
    const slim = (recommendations || []).map((r) => ({
      college: {
        name: r.college?.name,
        state: r.college?.state,
        admissionRate: r.college?.admissionRate,
        satMidpoint: r.college?.satMidpoint,
      },
      admission: { category: r.admission?.category },
      netCost: r.netCost,
      overall: r.overall,
    }));
    return afetch("/api/advisor/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, profile, recommendations: slim }),
    }).then(j);
  },

  listDocuments: (id) => afetch(`/api/documents/${id}`).then(j),
  uploadDocument: (id, kind, file) => {
    const fd = new FormData();
    fd.append("kind", kind); fd.append("file", file);
    return afetch(`/api/documents/${id}`, { method: "POST", body: fd }).then(j);
  },
  parseDocument: (id, docId) => afetch(`/api/documents/${id}/${docId}/parse`, { method: "POST" }).then(j),
  deleteDocument: (id, docId) => afetch(`/api/documents/${id}/${docId}`, { method: "DELETE" }).then(j),
  addPortfolioLink: (id, url) =>
    afetch(`/api/documents/${id}/link`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    }).then(j),
  buildProfileFromDocs: (id) => afetch(`/api/documents/${id}/build-profile`, { method: "POST" }).then(j),
  programs: (id) => afetch(`/api/colleges/${id}/programs`).then(j),
  // Live, on-demand scan of the college's OWN website for its department/major
  // pages -- a direct comparison next to the federal CIP list above. Not
  // persisted; re-run any time for a fresh look.
  officialSitePrograms: (id) => afetch(`/api/colleges/${id}/programs/official-site`).then(j),
  similarColleges: (id) => afetch(`/api/colleges/${id}/similar`).then(j),
  recommendMajors: (profile) =>
    afetch("/api/careers/recommend-majors", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  strategy: (id, profile) =>
    afetch(`/api/students/${id}/strategy`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  aidPlan: (id, profile) =>
    afetch(`/api/students/${id}/aid-plan`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  listScholarships: (id) => afetch(`/api/students/${id}/scholarships`).then(j),
  saveScholarship: (id, sid, data) =>
    afetch(`/api/students/${id}/scholarships/${sid}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(j),
  deleteScholarship: (id, sid) => afetch(`/api/students/${id}/scholarships/${sid}`, { method: "DELETE" }).then(j),
  scholarshipsExportCsvUrl: (id) => apiUrl(`/api/students/${id}/scholarships/export.csv`),
  collegesByMajor: (major, state, { control, deep } = {}) => {
    const q = new URLSearchParams({ major });
    if (state) q.set("state", state);
    if (control && control !== "all") q.set("control", control);
    if (deep) q.set("deep", "true");
    return afetch(`/api/colleges/by-major?${q.toString()}`).then(j);
  },
  collegeMajorCombos: (major1, major2, state, { control, deep } = {}) => {
    const q = new URLSearchParams({ major1 });
    if (major2) q.set("major2", major2);
    if (state) q.set("state", state);
    if (control && control !== "all") q.set("control", control);
    if (deep) q.set("deep", "true");
    return afetch(`/api/colleges/major-combos?${q.toString()}`).then(j);
  },
  collegeDeadlines: (id) => afetch(`/api/colleges/${id}/deadlines`).then(j),
  browseColleges: ({ name, state, control, major, page = 0, perPage = 25 }) => {
    const q = new URLSearchParams();
    if (name) q.set("name", name);
    if (state) q.set("state", state);
    if (control && control !== "all") q.set("control", control);
    if (major) q.set("major", major);
    q.set("page", String(page)); q.set("perPage", String(perPage));
    return afetch(`/api/colleges/browse?${q}`).then(j);
  },
  evaluateCollege: (id, profile) =>
    afetch(`/api/colleges/${id}/evaluate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  topList: (kind, profile, limit = 30) =>
    afetch(`/api/colleges/top-list/${kind}?limit=${limit}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  balancedList: (profile, size, filters, scenario, includeServiceAcademies = false) =>
    afetch("/api/colleges/balanced-list", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, size, filters, scenario, includeServiceAcademies }),
    }).then(j),
  bestFit: (profile, size, filters, scenario, includeServiceAcademies = false) =>
    afetch("/api/colleges/best-fit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, size, filters, scenario, includeServiceAcademies }),
    }).then(j),
  scenarios: () => afetch("/api/colleges/scenarios").then(j),
  evaluateWithScenario: (id, profile, scenario) =>
    afetch(`/api/colleges/${id}/evaluate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, scenario }),
    }).then(j),

  // ---------------- Programs (Program Discovery) ----------------
  seedProgramsFromScorecard: (id, collegeId) =>
    afetch(`/api/programs/${id}/seed-scorecard`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId }),
    }).then(j),
  addProgramSource: (id, body) =>
    afetch(`/api/programs/${id}/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  listProgramSources: (id, collegeId) =>
    afetch(`/api/programs/${id}/sources${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  discoverPrograms: (id, body) =>
    afetch(`/api/programs/${id}/discover`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  listDiscoveredPrograms: (id, params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return afetch(`/api/programs/${id}/discovered${q ? `?${q}` : ""}`).then(j);
  },
  addManualProgram: (id, body) =>
    afetch(`/api/programs/${id}/discovered/manual`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateDiscoveredProgram: (id, programId, body) =>
    afetch(`/api/programs/${id}/discovered/${programId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteDiscoveredProgram: (id, programId) =>
    afetch(`/api/programs/${id}/discovered/${programId}`, { method: "DELETE" }).then(j),
  clearDiscoveredPrograms: (id, collegeId) =>
    afetch(`/api/programs/${id}/discovered${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`, { method: "DELETE" }).then(j),
  // One-button "Research this college": Layer 1 (Scorecard/CIP) always, plus
  // Layer 3 (official-domain crawl) automatically when a website is on file.
  researchCollege: (id, body) =>
    afetch(`/api/programs/${id}/research`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  programsExportCsvUrl: (id) => apiUrl(`/api/programs/${id}/export.csv`),

  // ---------------- Decision Plan ----------------
  decisionPlanOptions: (id) => afetch(`/api/decision-plan/${id}/options`).then(j),
  listDecisionItems: (id) => afetch(`/api/decision-plan/${id}/items`).then(j),
  addDecisionItem: (id, body) =>
    afetch(`/api/decision-plan/${id}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateDecisionItem: (id, itemId, body) =>
    afetch(`/api/decision-plan/${id}/items/${itemId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteDecisionItem: (id, itemId) =>
    afetch(`/api/decision-plan/${id}/items/${itemId}`, { method: "DELETE" }).then(j),
  getChecklist: (id, itemId) => afetch(`/api/decision-plan/${id}/items/${itemId}/checklist`).then(j),
  updateChecklist: (id, itemId, body) =>
    afetch(`/api/decision-plan/${id}/items/${itemId}/checklist`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  getStrategyNotes: (id, itemId) => afetch(`/api/decision-plan/${id}/items/${itemId}/strategy-notes`).then(j),
  generateStrategyNotes: (id, itemId, profile) =>
    afetch(`/api/decision-plan/${id}/items/${itemId}/strategy-notes/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
  updateStrategyNotes: (id, itemId, body) =>
    afetch(`/api/decision-plan/${id}/items/${itemId}/strategy-notes`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  listCoursePlans: (id) => afetch(`/api/decision-plan/${id}/course-plans`).then(j),
  getCoursePlan: (id, trackId) => afetch(`/api/decision-plan/${id}/course-plans/${trackId}`).then(j),
  listDecisionTasks: (id) => afetch(`/api/decision-plan/${id}/tasks`).then(j),
  addDecisionTask: (id, body) =>
    afetch(`/api/decision-plan/${id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateDecisionTask: (id, taskId, body) =>
    afetch(`/api/decision-plan/${id}/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteDecisionTask: (id, taskId) =>
    afetch(`/api/decision-plan/${id}/tasks/${taskId}`, { method: "DELETE" }).then(j),
  decisionPlanExportUrl: (id) => apiUrl(`/api/decision-plan/${id}/export.csv`),
  decisionPlanSummary: (id) => afetch(`/api/decision-plan/${id}/summary`).then(j),
  decisionPlanEssayStatus: (id) => afetch(`/api/decision-plan/${id}/essay-status`).then(j),
  verificationCenter: (id) => afetch(`/api/decision-plan/${id}/verification-center`).then(j),
  verificationCenterExportCsvUrl: (id) => apiUrl(`/api/decision-plan/${id}/verification-center/export.csv`),
  decisionPlanTasksExportUrl: (id) => apiUrl(`/api/decision-plan/${id}/tasks/export.csv`),

  // ---------------- Application Pathways ----------------
  pathwaysPlatforms: (id) => afetch(`/api/application-pathways/${id}/platforms`).then(j),
  listRequirements: (id, collegeId) =>
    afetch(`/api/application-pathways/${id}/requirements${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  addRequirement: (id, body) =>
    afetch(`/api/application-pathways/${id}/requirements`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateRequirement: (id, reqId, body) =>
    afetch(`/api/application-pathways/${id}/requirements/${reqId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteRequirement: (id, reqId) =>
    afetch(`/api/application-pathways/${id}/requirements/${reqId}`, { method: "DELETE" }).then(j),
  autofillRequirementDetails: (id, reqId) =>
    afetch(`/api/application-pathways/${id}/requirements/${reqId}/autofill-details`, { method: "POST" }).then(j),
  platformSuggestion: (id, collegeName, state) =>
    afetch(`/api/application-pathways/${id}/platform-suggestion?collegeName=${encodeURIComponent(collegeName || "")}${state ? `&state=${encodeURIComponent(state)}` : ""}`).then(j),
  routePlanner: (id) => afetch(`/api/application-pathways/${id}/route-planner`).then(j),
  regionSummary: (id) => afetch(`/api/application-pathways/${id}/region-summary`).then(j),
  pathwaysExportCsvUrl: (id) => apiUrl(`/api/application-pathways/${id}/export.csv`),

  // ---------------- Essay Center ----------------
  essayMeta: (id) => afetch(`/api/essays/${id}/meta`).then(j),
  essayTrackStrategy: (id, trackId) =>
    afetch(`/api/essays/${id}/track-strategy${trackId ? `?trackId=${encodeURIComponent(trackId)}` : ""}`).then(j),
  essaySampleStructures: (id) => afetch(`/api/essays/${id}/sample-structures`).then(j),
  essayExampleLinks: (id) => afetch(`/api/essays/${id}/example-essay-links`).then(j),
  listEssayPrompts: (id, collegeId) =>
    afetch(`/api/essays/${id}/prompts${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  addEssayPrompt: (id, body) =>
    afetch(`/api/essays/${id}/prompts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateEssayPrompt: (id, promptId, body) =>
    afetch(`/api/essays/${id}/prompts/${promptId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteEssayPrompt: (id, promptId) =>
    afetch(`/api/essays/${id}/prompts/${promptId}`, { method: "DELETE" }).then(j),
  findEssayPrompts: (id, body) =>
    afetch(`/api/essays/${id}/prompts/find`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  findEssayPromptsForAllColleges: (id) =>
    afetch(`/api/essays/${id}/prompts/find-all`, { method: "POST" }).then(j),
  clearEssayPrompts: (id, collegeId) =>
    afetch(`/api/essays/${id}/prompts${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`, { method: "DELETE" }).then(j),
  essayCoverageSummary: (id) => afetch(`/api/essays/${id}/coverage-summary`).then(j),
  listStoryBank: (id) => afetch(`/api/essays/${id}/story-bank`).then(j),
  addStoryBankEntry: (id, body) =>
    afetch(`/api/essays/${id}/story-bank`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateStoryBankEntry: (id, storyId, body) =>
    afetch(`/api/essays/${id}/story-bank/${storyId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteStoryBankEntry: (id, storyId) =>
    afetch(`/api/essays/${id}/story-bank/${storyId}`, { method: "DELETE" }).then(j),
  essayWorkloadSummary: (id) => afetch(`/api/essays/${id}/workload-summary`).then(j),
  essayExportCsvUrl: (id) => apiUrl(`/api/essays/${id}/export.csv`),
  essayPromptsOverview: (id, collegeId, collegeName) => afetch(`/api/essays/${id}/prompts/overview?${collegeId ? `collegeId=${encodeURIComponent(collegeId)}` : `collegeName=${encodeURIComponent(collegeName || "")}`}`).then(j),
  essayCollegeOptions: (id) => afetch(`/api/essays/${id}/college-options`).then(j),
  essayStoryMatches: (id, promptId) => afetch(`/api/essays/${id}/prompts/${promptId}/story-matches`).then(j),
  createEssayTask: (id, promptId, body) =>
    afetch(`/api/essays/${id}/prompts/${promptId}/create-task`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    }).then(j),

  // ---------------- Application Timeline ----------------
  timelineMeta: (id) => afetch(`/api/application-timeline/${id}/meta`).then(j),
  listTimelineEvents: (id, collegeId) =>
    afetch(`/api/application-timeline/${id}/events${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  addTimelineEvent: (id, body) =>
    afetch(`/api/application-timeline/${id}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateTimelineEvent: (id, eventId, body) =>
    afetch(`/api/application-timeline/${id}/events/${eventId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteTimelineEvent: (id, eventId) =>
    afetch(`/api/application-timeline/${id}/events/${eventId}`, { method: "DELETE" }).then(j),
  findTimelineEvents: (id, body) =>
    afetch(`/api/application-timeline/${id}/events/find`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  timelineCollegeSummary: (id, collegeId) =>
    afetch(`/api/application-timeline/${id}/college-summary?collegeId=${encodeURIComponent(collegeId)}`).then(j),
  timelineConflicts: (id, collegeId) =>
    afetch(`/api/application-timeline/${id}/conflicts${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  timelineDecisionPlanSummary: (id) => afetch(`/api/application-timeline/${id}/decision-plan-summary`).then(j),
  timelineJourneySummary: (id) => afetch(`/api/application-timeline/${id}/journey-summary`).then(j),
  timelineExportCsvUrl: (id) => apiUrl(`/api/application-timeline/${id}/export.csv`),
  timelineAutofillPreview: (id, collegeName) =>
    afetch(`/api/application-timeline/${id}/autofill-preview?collegeName=${encodeURIComponent(collegeName || "")}`).then(j),
  autofillTimelineEvents: (id, body) =>
    afetch(`/api/application-timeline/${id}/events/autofill`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  populateAllTimelines: (id) =>
    afetch(`/api/application-timeline/${id}/events/populate-all`, { method: "POST" }).then(j),
  setupApplicationPlanning: (id, body) =>
    afetch(`/api/application-timeline/${id}/setup-planning`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),

  // ---------------- Double-major OFFICIAL verification records ----------------
  // Distinct from Double Major Search results (College Scorecard evidence
  // only): a record here exists only once a family attaches an official
  // source confirming the actual double-major/second-major/dual-degree policy.
  listDoubleMajorVerifications: (id, collegeId) =>
    afetch(`/api/students/${id}/double-major-verifications${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ""}`).then(j),
  addDoubleMajorVerification: (id, body) =>
    afetch(`/api/students/${id}/double-major-verifications`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  updateDoubleMajorVerification: (id, verificationId, body) =>
    afetch(`/api/students/${id}/double-major-verifications/${verificationId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),
  deleteDoubleMajorVerification: (id, verificationId) =>
    afetch(`/api/students/${id}/double-major-verifications/${verificationId}`, { method: "DELETE" }).then(j),

  // ---------------- Import College List ----------------
  // Paste text goes as JSON; a CSV/text file upload goes as multipart (same
  // pattern as uploadDocument -- no Content-Type header, so the browser sets
  // the multipart boundary itself).
  importParseText: (id, text) =>
    afetch(`/api/students/${id}/import/parse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }).then(j),
  importParseFile: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return afetch(`/api/students/${id}/import/parse`, { method: "POST", body: fd }).then(j);
  },
  importMatch: (id, names, state, profile) =>
    afetch(`/api/students/${id}/import/match`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names, state, profile }),
    }).then(j),
  importConfirm: (id, body) =>
    afetch(`/api/students/${id}/import/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(j),

  // ---------------- Search/results persistence (Issue 1) ----------------
  // One JSON state blob per (student, page key) -- see lib/persistedSearch.js
  // for the hook that reads/writes these on every relevant page.
  getSearchState: (id, pageKey) =>
    afetch(`/api/students/${id}/search-state/${encodeURIComponent(pageKey)}`).then(j),
  saveSearchState: (id, pageKey, state) =>
    afetch(`/api/students/${id}/search-state/${encodeURIComponent(pageKey)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }),
    }).then(j),
  clearSearchState: (id, pageKey) =>
    afetch(`/api/students/${id}/search-state/${encodeURIComponent(pageKey)}`, { method: "DELETE" }).then(j),

  // ---------------- Evaluate Against My Profile (My List) ----------------
  evaluateMyList: (id, profile) =>
    afetch(`/api/students/${id}/list/evaluate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
    }).then(j),
};
