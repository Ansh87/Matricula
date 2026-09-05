// routes/essayCenter.js -- the "Essay Center" tab API. Mounted behind
// requireAuth in index.js; router.param("id") forces the :id segment to the
// authenticated Firebase UID (identical pattern to every other per-student
// router in this app), so a user can never read or write another family's
// essay prompts, drafts, or story bank.
//
// Safety notes (see services/essayCenter.js for the full rationale):
//  - No route here ever generates or returns a finished essay for submission.
//  - No route auto-submits anything to any application platform.
//  - Draft text itself is never required or logged by this router -- only
//    lightweight planning fields (draft_title, outline_notes, story angle,
//    status) are stored, and nothing here writes essay content to server logs.
import express from "express";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import {
  ESSAY_STATUSES, ESSAY_TYPES, YNU, findEssayPrompts, ESSAY_TRACK_STRATEGY,
  getTrackStrategy, SAMPLE_STRUCTURES, hydrateStory, buildWorkloadSummary,
  PUBLISHED_EXAMPLE_ESSAYS, PUBLISHED_EXAMPLE_ESSAYS_DISCLAIMER,
  CYCLE_TYPES, PREVIOUS_YEAR_PROMPT_WARNING, PROMPTS_NOT_VERIFIED_NOTICE,
  autofillOrDiscoverEssayPrompts, PROMPT_STATUSES, PROMPT_SOURCE_TYPES,
  derivePromptStatus, findStoryMatchesForPrompt, PLATFORM_PROMPT_SETS,
  findEssayPromptsForAllColleges, buildEssayCoverageSummary,
} from "../services/essayCenter.js";
import { VERIFICATION_STATUSES } from "./applicationPathways.js";
import { DEADLINE_EVENT_TYPES } from "../services/applicationTimeline.js";

export const essaysRouter = express.Router();

essaysRouter.param("id", (req, _res, next) => {
  if (req.user && req.user.uid) req.params.id = req.user.uid;
  next();
});

const newId = (p) => `${p}_${crypto.randomUUID()}`;
const now = () => Date.now();

// ---------- Reference data (statuses, types, track strategy, sample structures) ----------
essaysRouter.get("/:id/meta", (_req, res) => {
  res.json({
    statuses: ESSAY_STATUSES, essayTypes: ESSAY_TYPES, ynu: YNU, verificationStatuses: VERIFICATION_STATUSES,
    cycleTypes: CYCLE_TYPES, previousYearWarning: PREVIOUS_YEAR_PROMPT_WARNING, notVerifiedNotice: PROMPTS_NOT_VERIFIED_NOTICE,
    promptStatuses: PROMPT_STATUSES, sourceTypes: PROMPT_SOURCE_TYPES,
    platformsWithSharedPrompts: Object.keys(PLATFORM_PROMPT_SETS),
    aiUseDisclaimer: "Matricula helps with brainstorming, outlining, prompt tracking, and revision planning. The student must write the final essay in their own voice and follow each college's AI-use policy.",
  });
});

// College selector (Part B): every college the family can pick from across
// Saved Colleges (My List / Matches) and the Decision Plan's own list,
// de-duplicated by college_id (falling back to a normalized name for
// manually-entered colleges with no College Scorecard match). Manual free-
// text entry is always available in the UI on top of this list -- this
// route only covers the two "already in the app somewhere" sources so the
// family doesn't have to retype a college they've already saved.
essaysRouter.get("/:id/college-options", (req, res) => {
  const saved = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(req.params.id);
  const planned = db.prepare("SELECT college_id, college_name FROM decision_plan_items WHERE student_id=?").all(req.params.id);
  const seen = new Map();
  for (const { source, rows } of [{ source: "Saved colleges", rows: saved }, { source: "Decision Plan", rows: planned }]) {
    for (const r of rows) {
      const key = r.college_id || `name:${String(r.college_name || "").toLowerCase().trim()}`;
      if (!key || key === "name:") continue;
      if (!seen.has(key)) seen.set(key, { collegeId: r.college_id || null, collegeName: r.college_name || key, sources: [] });
      if (!seen.get(key).sources.includes(source)) seen.get(key).sources.push(source);
    }
  }
  res.json({ colleges: [...seen.values()].sort((a, b) => String(a.collegeName).localeCompare(String(b.collegeName))) });
});

essaysRouter.get("/:id/track-strategy", (req, res) => {
  const { trackId } = req.query;
  res.json({ tracks: getTrackStrategy(trackId || null) });
});

essaysRouter.get("/:id/sample-structures", (_req, res) => {
  res.json(SAMPLE_STRUCTURES);
});

// Real, officially-published example essays -- see services/essayCenter.js
// for why this list is short, hand-verified, and official-sources-only.
essaysRouter.get("/:id/example-essay-links", (_req, res) => {
  res.json({ links: PUBLISHED_EXAMPLE_ESSAYS, disclaimer: PUBLISHED_EXAMPLE_ESSAYS_DISCLAIMER });
});

// ---------- Prompts ----------
essaysRouter.get("/:id/prompts", (req, res) => {
  const { collegeId } = req.query;
  const rows = collegeId
    ? db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND college_id=? ORDER BY created_at DESC").all(req.params.id, collegeId)
    : db.prepare("SELECT * FROM essay_prompts WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json({ prompts: rows });
});

// Normalizes a program/school label for loose matching ("Drama/Music" vs
// "Drama", "School of Computer Science" vs "Computer Science") -- exact
// match or either string containing the other, case/whitespace-insensitive.
function normalizeLabel(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function programLabelsRelated(a, b) {
  const na = normalizeLabel(a), nb = normalizeLabel(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Turns one raw essay_prompts row into the shape the dashboard shows,
// including its own matched Application Timeline deadline (Part L).
//
// Bug fixed here (previously reported with Carnegie Mellon): a college can
// have MULTIPLE deadlines sharing the same event type/round -- e.g. CMU's
// general "Regular Decision deadline" (Jan 4, no program) and its separate
// "Regular Decision deadline (Drama/Music)" (Dec 1, program-specific). The
// old logic picked whichever deadline was chronologically earliest as a
// blanket fallback, so a general CS/engineering essay prompt could get
// silently matched to the Drama/Music deadline just because Dec 1 sorts
// before Jan 4. Matching now works in strict priority order and NEVER lets
// a program-specific deadline (Drama/Music, portfolio, audition, honors,
// scholarship, or any other program_label) leak onto a general prompt:
//
//   1. If the prompt itself is program-specific (program_label or
//      school_or_program set), only match a deadline whose own program_label
//      relates to it -- preferring one that also shares the prompt's
//      application_round when the prompt has one. If no matching
//      program-specific deadline exists on file, this prompt gets NO
//      deadline (never falls back to a different program's deadline, and
//      never falls back to the general deadline either, since the real
//      program deadline may fall earlier than the general one).
//   2. If the prompt is general (no program_label/school_or_program), only
//      match deadlines that are ALSO general (program_label empty/null) --
//      first by matching application_round if the prompt has one, otherwise
//      the earliest general deadline on file. Program-specific deadlines are
//      never considered for a general prompt, no matter how early they are.
//   3. If no safe match is found either way, essayDeadline is null and
//      essayDeadlineNotice explains the family should verify manually --
//      never a guess.
//
// Read-only cross-reference, same don't-merge-two-systems pattern as
// everywhere else in this app -- never written back into essay_prompts.
function attachEssayDeadline(prompt, deadlineRows, earliestGeneralDeadline) {
  const promptProgram = prompt.program_label || prompt.school_or_program || null;
  const promptRound = prompt.application_round || null;
  let matched = null;
  let matchedBy = null;

  if (promptProgram) {
    // Program-specific prompt (e.g. a Drama/Music, portfolio, or honors
    // essay): only ever match a deadline that is ITSELF tagged for a related
    // program -- never a different program's deadline, and never a silent
    // fallback to the general deadline.
    let candidates = deadlineRows.filter((d) => d.program_label && programLabelsRelated(d.program_label, promptProgram));
    if (promptRound) {
      const roundCandidates = candidates.filter((d) => d.application_round === promptRound);
      if (roundCandidates.length) candidates = roundCandidates;
    }
    if (candidates.length) { matched = candidates[0]; matchedBy = "program_label"; }
  } else {
    // General prompt: restrict the candidate pool to general-only deadlines
    // (program_label empty/null) before doing anything else, so a
    // Drama/Music/portfolio/audition/honors/scholarship deadline can never
    // be chosen here even if it happens to be the earliest date on file.
    const generalRows = deadlineRows.filter((d) => !d.program_label);
    if (promptRound) {
      const roundMatch = generalRows.find((d) => d.application_round === promptRound);
      if (roundMatch) { matched = roundMatch; matchedBy = "application_round"; }
    }
    if (!matched && earliestGeneralDeadline) { matched = earliestGeneralDeadline; matchedBy = "earliest_general_deadline_on_file"; }
  }

  return {
    ...prompt,
    essayDeadline: matched ? {
      eventLabel: matched.event_label, eventDate: matched.event_date,
      applicationRound: matched.application_round, cycleYear: matched.cycle_year,
      sourceUrl: matched.source_url, verificationStatus: matched.verification_status,
      matchedBy,
    } : null,
    essayDeadlineNotice: !matched ? "Essay prompt found, but application deadline still needs verification." : null,
  };
}

// Essay Prompt Overview (Part B) -- for one selected college: current-cycle
// prompts, previous-year prompts (if any were kept), and unknown/needs-
// verification prompts, grouped explicitly so the family never mistakes a
// previous-year prompt for the current one. Also cross-references Application
// Timeline (Part L) for each prompt's matching deadline, read-only -- never
// merged into essay_prompts itself, same don't-merge-two-systems pattern
// used by Decision Plan's CSV export. Accepts either a collegeId (saved/
// Decision Plan college with a College Scorecard match) or a collegeName
// (manually-entered college with no match yet).
essaysRouter.get("/:id/prompts/overview", (req, res) => {
  const { collegeId, collegeName } = req.query;
  if (!collegeId && !collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  const rows = collegeId
    ? db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND college_id=? ORDER BY updated_at DESC").all(req.params.id, collegeId)
    : db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND college_id IS NULL AND LOWER(college_name)=LOWER(?) ORDER BY updated_at DESC").all(req.params.id, collegeName);

  const timelineRows = collegeId
    ? db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? AND college_id=?").all(req.params.id, collegeId)
    : [];
  const deadlineRows = timelineRows.filter((t) => DEADLINE_EVENT_TYPES.includes(t.event_type) && t.event_date);
  deadlineRows.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  // The college-wide "applicationTimeline" summary below must never surface
  // a program-specific deadline (Drama/Music, portfolio, honors, etc.) as
  // if it were the college's general deadline -- restrict to general-only
  // rows (program_label empty/null) for this headline figure, same fix as
  // attachEssayDeadline above.
  const earliestDeadline = deadlineRows.filter((d) => !d.program_label)[0] || null;
  const deadlineVerified = earliestDeadline && (earliestDeadline.verification_status === "Official source verified" || earliestDeadline.verification_status === "User verified");

  const withDeadlines = rows.map((r) => attachEssayDeadline(r, deadlineRows, earliestDeadline));
  const current = withDeadlines.filter((r) => r.cycle_type === "Current cycle");
  const previous = withDeadlines.filter((r) => r.cycle_type === "Previous cycle");
  const unknown = withDeadlines.filter((r) => r.cycle_type !== "Current cycle" && r.cycle_type !== "Previous cycle");

  res.json({
    collegeId: collegeId || null, collegeName: collegeName || rows[0]?.college_name || null,
    current, previous, unknown,
    previousYearWarning: previous.length ? PREVIOUS_YEAR_PROMPT_WARNING : null,
    notVerifiedNotice: !rows.length || !rows.some((r) => r.verification_status === "Official source verified" || r.verification_status === "User verified")
      ? PROMPTS_NOT_VERIFIED_NOTICE : null,
    applicationTimeline: earliestDeadline ? {
      eventLabel: earliestDeadline.event_label, eventDate: earliestDeadline.event_date,
      applicationRound: earliestDeadline.application_round, cycleYear: earliestDeadline.cycle_year,
      sourceUrl: earliestDeadline.source_url, verificationStatus: earliestDeadline.verification_status,
    } : null,
    essayFoundButDeadlineUnverified: rows.length > 0 && (!earliestDeadline || !deadlineVerified)
      ? "Essay prompt found, but application deadline still needs verification."
      : null,
  });
});

// Part C/G field list -- covers every field the manual-entry form and the
// prompt-editing panel can set. sourceType/promptStatus are intentionally
// left out of direct client control for automatic writes (they're derived
// below via derivePromptStatus/defaulted to "User entered"), but a family
// can still override promptStatus explicitly if they have a specific reason
// to (e.g. marking something "Outdated / needs recheck" themselves).
const PROMPT_FIELD_MAP = {
  collegeId: "college_id", collegeName: "college_name", platformId: "platform_id", programLabel: "program_label",
  schoolOrProgram: "school_or_program", essayType: "essay_type", promptText: "prompt_text",
  wordLimit: "word_limit", characterLimit: "character_limit", required: "required",
  deadline: "deadline", applicationRound: "application_round", promptCycle: "prompt_cycle", cycleType: "cycle_type",
  status: "status", draftTitle: "draft_title",
  outlineNotes: "outline_notes", studentStoryAngle: "student_story_angle", relatedTrack: "related_track",
  relatedActivities: "related_activities", notes: "notes", verificationStatus: "verification_status",
  sourceUrl: "source_url", sourceLabel: "source_label", sourceType: "source_type", promptStatus: "prompt_status",
};

// "Add a prompt manually" (Part G) -- for prompts that only appear inside a
// logged-in application portal, or that a family found some other way. cycle
// type defaults to "Current cycle" (the family is entering what they believe
// is this year's prompt) but is always editable; source type defaults to
// "User entered" unless the family says otherwise (e.g. pasting from an
// official PDF they found).
essaysRouter.post("/:id/prompts", (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.collegeName) return res.status(400).json({ error: "bad_request", message: "collegeId or collegeName required" });
  if (!b.promptText && !b.essayType) return res.status(400).json({ error: "bad_request", message: "promptText or essayType required" });
  const ts = now();
  const promptId = newId("essay");
  const cols = ["prompt_id", "student_id", "created_at", "updated_at", "last_checked"];
  const vals = { prompt_id: promptId, student_id: req.params.id, created_at: ts, updated_at: ts, last_checked: ts };
  for (const [camel, snake] of Object.entries(PROMPT_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    cols.push(snake);
    vals[snake] = b[camel];
  }
  if (!vals.status) { cols.push("status"); vals.status = "Not started"; }
  if (!vals.verification_status) { cols.push("verification_status"); vals.verification_status = "Needs manual verification"; }
  if (!vals.cycle_type) { cols.push("cycle_type"); vals.cycle_type = "Current cycle"; }
  if (!vals.source_type) { cols.push("source_type"); vals.source_type = "User entered"; }
  if (!vals.prompt_status) {
    cols.push("prompt_status");
    vals.prompt_status = b.promptStatus || derivePromptStatus({ cycleType: vals.cycle_type, verificationStatus: vals.verification_status, manual: !b.sourceUrl });
  }
  const placeholders = cols.map((c) => `@${c}`).join(",");
  db.prepare(`INSERT INTO essay_prompts (${cols.join(",")}) VALUES (${placeholders})`).run(vals);
  res.json(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(promptId));
});

essaysRouter.put("/:id/prompts/:promptId", (req, res) => {
  const row = db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND prompt_id=?").get(req.params.id, req.params.promptId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  if (b.status && !ESSAY_STATUSES.includes(b.status)) {
    return res.status(400).json({ error: "bad_request", message: `status must be one of: ${ESSAY_STATUSES.join(", ")}` });
  }
  if (b.verificationStatus && !VERIFICATION_STATUSES.includes(b.verificationStatus)) {
    return res.status(400).json({ error: "bad_request", message: `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}` });
  }
  if (b.cycleType && !CYCLE_TYPES.includes(b.cycleType)) {
    return res.status(400).json({ error: "bad_request", message: `cycleType must be one of: ${CYCLE_TYPES.join(", ")}` });
  }
  const updates = {};
  for (const [camel, snake] of Object.entries(PROMPT_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    updates[snake] = b[camel];
  }
  // Keep the family-facing prompt_status rollup in sync whenever cycle_type
  // or verification_status change, unless this same request already set
  // promptStatus explicitly (a deliberate manual override, e.g. "Outdated /
  // needs recheck").
  if (b.promptStatus === undefined && (updates.cycle_type !== undefined || updates.verification_status !== undefined)) {
    updates.prompt_status = derivePromptStatus({
      cycleType: updates.cycle_type ?? row.cycle_type,
      verificationStatus: updates.verification_status ?? row.verification_status,
    });
  }
  if (b.markLastChecked) updates.last_checked = now();
  updates.updated_at = now();
  if (!Object.keys(updates).length) return res.json(row);
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE essay_prompts SET ${set} WHERE student_id=@student_id AND prompt_id=@prompt_id`)
    .run({ ...updates, student_id: req.params.id, prompt_id: req.params.promptId });
  res.json(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(req.params.promptId));
});

essaysRouter.delete("/:id/prompts/:promptId", (req, res) => {
  db.prepare("DELETE FROM essay_prompts WHERE student_id=? AND prompt_id=?").run(req.params.id, req.params.promptId);
  res.json({ ok: true });
});

// "Find essay requirements" (family-facing name for Part E discovery).
// Reference-first: tries a hand-verified profile (ESSAY_PROMPT_AUTOFILL_
// PROFILES) before falling back to a search of the college's own official
// site, same pattern as the Application Timeline's auto-fill/find. A
// domain/startUrl override always forces the official-site search directly,
// skipping the reference lookup. Also auto-resolves the college's
// application platform from its Application Pathways record (if the family
// already set one there) so Common App main essay / UC PIQs get attached
// alongside the college's own prompts without the family having to look
// the platform up a second time here.
essaysRouter.post("/:id/prompts/find", async (req, res) => {
  const b = req.body || {};
  if (!b.collegeId && !b.domain) return res.status(400).json({ error: "bad_request", message: "collegeId or domain required" });
  try {
    if (b.domain || b.startUrl) {
      const result = await findEssayPrompts(req.params.id, {
        collegeId: b.collegeId, collegeName: b.collegeName, domain: b.domain, startUrl: b.startUrl, promptCycle: b.promptCycle,
      });
      return res.json(result);
    }
    let platformId = b.platformId || null;
    if (!platformId && b.collegeId) {
      const reqRow = db.prepare("SELECT platform_id FROM college_application_requirements WHERE student_id=? AND college_id=? AND platform_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1").get(req.params.id, b.collegeId);
      platformId = reqRow?.platform_id || null;
    }
    const result = await autofillOrDiscoverEssayPrompts(req.params.id, { collegeId: b.collegeId, collegeName: b.collegeName, platformId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "discovery_failed", message: err.message, notice: "Essay prompts not verified yet. Check the official application portal." });
  }
});

// "Find essay requirements for all my colleges" -- runs the same reference-
// first/live-discovery-fallback lookup once per college across Saved
// Colleges AND the Decision Plan list (not just whichever single college the
// family happened to pick in the dashboard), so a family doesn't have to
// visit every college one at a time to build out their prompt archive.
// Sequential and can take a while for a long list -- the client shows a busy
// state and a per-college result summary when it's done.
essaysRouter.post("/:id/prompts/find-all", async (req, res) => {
  try {
    const result = await findEssayPromptsForAllColleges(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "find_all_failed", message: err.message });
  }
});

// Coverage summary (Issue 4): one glance at every saved/Decision Plan
// college's essay-prompt and timeline status, so the family can immediately
// see what's still missing without opening each college one at a time.
essaysRouter.get("/:id/coverage-summary", (req, res) => {
  res.json(buildEssayCoverageSummary(req.params.id));
});

// Bulk clear (Part unnumbered but requested directly by families): remove
// every tracked prompt, or every prompt for one college when ?collegeId= is
// given. A prompt added by mistake, a discovery run that pulled the wrong
// college's page, or simply wanting to start over should not require
// deleting rows one at a time.
essaysRouter.delete("/:id/prompts", (req, res) => {
  const { collegeId } = req.query;
  const result = collegeId
    ? db.prepare("DELETE FROM essay_prompts WHERE student_id=? AND college_id=?").run(req.params.id, collegeId)
    : db.prepare("DELETE FROM essay_prompts WHERE student_id=?").run(req.params.id);
  res.json({ ok: true, deleted: result.changes });
});

// ---------- Story Bank ----------
essaysRouter.get("/:id/story-bank", (req, res) => {
  const rows = db.prepare("SELECT * FROM essay_story_bank WHERE student_id=? ORDER BY updated_at DESC").all(req.params.id);
  res.json({ stories: rows.map(hydrateStory) });
});

const STORY_FIELD_MAP = {
  storyTitle: "story_title", theme: "theme", relatedActivity: "related_activity", challenge: "challenge",
  actionTaken: "action_taken", impact: "impact", whatItReveals: "what_it_reveals", possiblePrompts: "possible_prompts",
  riskNotes: "risk_notes",
};

essaysRouter.post("/:id/story-bank", (req, res) => {
  const b = req.body || {};
  if (!b.storyTitle) return res.status(400).json({ error: "bad_request", message: "storyTitle required" });
  const ts = now();
  const storyId = newId("story");
  const cols = ["story_id", "student_id", "created_at", "updated_at", "tracks_supported_json"];
  const vals = { story_id: storyId, student_id: req.params.id, created_at: ts, updated_at: ts, tracks_supported_json: JSON.stringify(Array.isArray(b.tracksSupported) ? b.tracksSupported : []) };
  for (const [camel, snake] of Object.entries(STORY_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    cols.push(snake);
    vals[snake] = b[camel];
  }
  const placeholders = cols.map((c) => `@${c}`).join(",");
  db.prepare(`INSERT INTO essay_story_bank (${cols.join(",")}) VALUES (${placeholders})`).run(vals);
  res.json(hydrateStory(db.prepare("SELECT * FROM essay_story_bank WHERE story_id=?").get(storyId)));
});

essaysRouter.put("/:id/story-bank/:storyId", (req, res) => {
  const row = db.prepare("SELECT * FROM essay_story_bank WHERE student_id=? AND story_id=?").get(req.params.id, req.params.storyId);
  if (!row) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  const updates = {};
  for (const [camel, snake] of Object.entries(STORY_FIELD_MAP)) {
    if (b[camel] === undefined) continue;
    updates[snake] = b[camel];
  }
  if (b.tracksSupported !== undefined) updates.tracks_supported_json = JSON.stringify(Array.isArray(b.tracksSupported) ? b.tracksSupported : []);
  updates.updated_at = now();
  if (!Object.keys(updates).length) return res.json(hydrateStory(row));
  const set = Object.keys(updates).map((c) => `${c}=@${c}`).join(",");
  db.prepare(`UPDATE essay_story_bank SET ${set} WHERE student_id=@student_id AND story_id=@story_id`)
    .run({ ...updates, student_id: req.params.id, story_id: req.params.storyId });
  res.json(hydrateStory(db.prepare("SELECT * FROM essay_story_bank WHERE story_id=?").get(req.params.storyId)));
});

essaysRouter.delete("/:id/story-bank/:storyId", (req, res) => {
  db.prepare("DELETE FROM essay_story_bank WHERE student_id=? AND story_id=?").run(req.params.id, req.params.storyId);
  res.json({ ok: true });
});

// Suggested story matches (Part J) -- for one prompt, ranks the family's own
// Story Bank entries by overlap with that prompt's text/track. Never writes
// or generates anything -- purely a ranked view over material the family
// already entered.
essaysRouter.get("/:id/prompts/:promptId/story-matches", (req, res) => {
  const prompt = db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND prompt_id=?").get(req.params.id, req.params.promptId);
  if (!prompt) return res.status(404).json({ error: "not_found" });
  const matches = findStoryMatchesForPrompt(req.params.id, { promptText: prompt.prompt_text, relatedTrack: prompt.related_track });
  res.json({ promptId: prompt.prompt_id, matches });
});

// "Create essay task" (Part L) -- turns a tracked prompt into a to-do on the
// same application_tasks table Decision Plan already reads from, so essay
// work shows up in one place with everything else instead of a second,
// disconnected task list. Due date is taken from the prompt's own matched
// Application Timeline deadline when known, then the prompt's own manually-
// entered deadline field, else left blank (never guessed).
essaysRouter.post("/:id/prompts/:promptId/create-task", (req, res) => {
  const prompt = db.prepare("SELECT * FROM essay_prompts WHERE student_id=? AND prompt_id=?").get(req.params.id, req.params.promptId);
  if (!prompt) return res.status(404).json({ error: "not_found" });
  const b = req.body || {};
  let dueDate = b.dueDate || prompt.deadline || null;
  if (!dueDate && prompt.application_round) {
    const tl = db.prepare(
      "SELECT event_date FROM college_application_timeline_events WHERE student_id=? AND college_id=? AND application_round=? AND event_type IN (" +
        DEADLINE_EVENT_TYPES.map(() => "?").join(",") + ") ORDER BY event_date LIMIT 1"
    ).get(req.params.id, prompt.college_id, prompt.application_round, ...DEADLINE_EVENT_TYPES);
    dueDate = tl?.event_date || null;
  }
  const ts = now();
  const taskId = `task_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO application_tasks (task_id, student_id, college_id, college_name, task_type, due_date, priority, status, notes, source_url, created_at, updated_at)
    VALUES (@task_id, @student_id, @college_id, @college_name, 'Essay', @due_date, @priority, 'To do', @notes, @source_url, @created_at, @updated_at)
  `).run({
    task_id: taskId, student_id: req.params.id, college_id: prompt.college_id || null, college_name: prompt.college_name || null,
    due_date: dueDate, priority: b.priority || "Medium",
    notes: `${prompt.essay_type || "Essay"}: ${String(prompt.prompt_text || "").slice(0, 140)}${prompt.prompt_text && prompt.prompt_text.length > 140 ? "..." : ""}`,
    source_url: prompt.source_url || null, created_at: ts, updated_at: ts,
  });
  res.json({ task: db.prepare("SELECT * FROM application_tasks WHERE task_id=?").get(taskId), dueDateSource: dueDate ? (b.dueDate ? "manual" : prompt.deadline ? "prompt_deadline" : "application_timeline") : null });
});

// ---------- Workload Planner (Part I) ----------
essaysRouter.get("/:id/workload-summary", (req, res) => {
  res.json(buildWorkloadSummary(req.params.id));
});

// ---------- CSV export ----------
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

essaysRouter.get("/:id/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM essay_prompts WHERE student_id=? ORDER BY college_name, essay_type").all(req.params.id);
  // Read-only cross-reference to Application Timeline, same don't-merge
  // pattern used elsewhere -- one earliest general-application deadline per
  // college, pulled in only for this export column.
  const timelineRows = db.prepare("SELECT college_id, event_type, event_date, application_round FROM college_application_timeline_events WHERE student_id=?").all(req.params.id);
  const deadlineByCollege = {};
  for (const t of timelineRows) {
    if (!t.college_id || !DEADLINE_EVENT_TYPES.includes(t.event_type) || !t.event_date) continue;
    const existing = deadlineByCollege[t.college_id];
    if (!existing || String(t.event_date).localeCompare(String(existing.event_date)) < 0) deadlineByCollege[t.college_id] = t;
  }
  const headers = [
    "College", "School/program", "Program/Honors label", "Essay type", "Prompt text", "Word limit", "Character limit",
    "Required", "Application round", "Deadline", "Prompt cycle", "Cycle type", "Prompt status", "Status",
    "Draft title", "Related track", "Related activities",
    "Verification status", "Source type", "Source label", "Source URL", "Last checked", "Notes",
    "Application timeline deadline", "Application round (from timeline)",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const tl = r.college_id ? deadlineByCollege[r.college_id] : null;
    lines.push([
      r.college_name, r.school_or_program, r.program_label, r.essay_type, r.prompt_text, r.word_limit, r.character_limit,
      r.required, r.application_round, r.deadline, r.prompt_cycle, r.cycle_type, r.prompt_status, r.status,
      r.draft_title, r.related_track, r.related_activities,
      r.verification_status, r.source_type, r.source_label, r.source_url,
      r.last_checked ? new Date(r.last_checked).toISOString().slice(0, 10) : "", r.notes,
      tl?.event_date || "", tl?.application_round || "",
    ].map(csvEscape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="essay-center.csv"');
  res.send(lines.join("\n"));
});
