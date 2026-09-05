// programDiscovery.js - the "Programs" backend. Three layers, all conservative:
//
//  Layer 1: seed from the College Scorecard / CIP data we already fetch for
//           major verification (scorecard.js:getPrograms). Broad field-of-study
//           evidence only - NOT a claim that a school-specific program page
//           was checked. Labeled "College Scorecard / CIP inferred".
//
//  Layer 2: the family pastes an official URL (program page, admissions page,
//           department page, special-program page, Common Data Set, net price
//           calculator). We fetch that ONE page/document and heuristically
//           extract structured fields. We never invent a fact that wasn't
//           found on the page - a field we can't confidently locate is left
//           null and the record is flagged "Needs manual verification".
//
//  Layer 3: bounded, same-domain crawl from a college's official site, used
//           only when the family asks to "discover programs" for a specific
//           college. Hard caps (25 pages, depth 2), robots.txt-aware, no PDFs
//           unless explicitly opted in, every page cached, every extracted
//           record keeps its exact source URL.
//
// Nothing here ever fabricates a program name, deadline, or eligibility rule.
// Extraction quality is reported via confidence_level, and verification_status
// defaults to "Needs manual verification" until a human (the family) confirms
// it - see routes/programs.js for the explicit "mark verified" actions.
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { db, cacheGet, cacheSet } from "../db/database.js";
import { getPrograms, getCollegeById } from "./scorecard.js";

const USER_AGENT = "MatriculaBot/1.0 (+family college-planning research tool; conservative bounded crawl)";
const FETCH_TIMEOUT_MS = 10000;
const CRAWL_MAX_PAGES = 40;
const CRAWL_MAX_DEPTH = 2;
const CRAWL_DELAY_MS = 300; // be polite between requests to the same host

// Classification vocabulary. Order matters - first match wins, so more
// specific terms are listed before generic ones (e.g. "cybersecurity" before
// "engineering", "data science" before "science").
const PROGRAM_TYPE_KEYWORDS = [
  ["honors", "Honors program"],
  ["scholars program", "Scholars program"],
  ["scholar program", "Scholars program"],
  ["bridge program", "Bridge / transition program"],
  ["transition program", "Bridge / transition program"],
  ["access program", "Bridge / transition program"],
  ["research program", "Research opportunity"],
  ["undergraduate research", "Research opportunity"],
  ["fellowship", "Research opportunity"],
  ["certificate", "Certificate"],
  ["concentration", "Concentration"],
  ["cybersecurity", "Cybersecurity program"],
  ["data science", "CS / AI / Data program"],
  ["artificial intelligence", "CS / AI / Data program"],
  ["computer science", "CS / AI / Data program"],
  ["quant", "Finance / Quant program"],
  ["finance", "Finance / Quant program"],
  ["business", "Business program"],
  ["stem", "STEM program"],
  ["engineering", "Engineering program"],
  ["pre-college", "First-year support program"],
  ["first-year program", "First-year support program"],
  ["first year experience", "First-year support program"],
  ["scholarship", "Scholarship-linked program"],
  ["leadership", "Leadership program"],
  ["cohort", "Leadership program"],
  ["internship", "Career / internship pipeline"],
  ["career pipeline", "Career / internship pipeline"],
  ["direct admit", "Direct-to-major program"],
  ["direct-admit", "Direct-to-major program"],
  ["minor", "Minor"],
  ["major in", "Major"],
];

function newId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return Date.now(); }

function isPdfUrl(url) { return /\.pdf(\?|#|$)/i.test(url); }

function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return null; } }

// Same registrable domain or subdomain of it (e.g. business.rutgers.edu is
// "same official domain" as rutgers.edu). Deliberately simple - this app never
// crawls off a family-provided/known official domain.
function isSameOfficialDomain(url, officialDomain) {
  const h = hostOf(url);
  if (!h || !officialDomain) return false;
  const base = officialDomain.replace(/^https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
  return h === base || h.endsWith(`.${base}`);
}

async function timedFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, ...(opts.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// --- robots.txt (very small, conservative parser: only "User-agent: *" and our
// own token are honored; any Disallow under either blocks the path). ---
const robotsCache = new Map();
async function isAllowedByRobots(url) {
  const h = hostOf(url);
  if (!h) return false;
  const robotsUrl = `https://${h}/robots.txt`;
  let rules = robotsCache.get(h);
  if (!rules) {
    rules = [];
    try {
      const res = await timedFetch(robotsUrl);
      if (res.ok) {
        const text = await res.text();
        let applies = false;
        for (const raw of text.split("\n")) {
          const line = raw.trim();
          if (!line || line.startsWith("#")) continue;
          const [keyRaw, ...rest] = line.split(":");
          const key = (keyRaw || "").trim().toLowerCase();
          const val = rest.join(":").trim();
          if (key === "user-agent") applies = val === "*" || /matricula/i.test(val);
          else if (key === "disallow" && applies && val) rules.push(val);
        }
      }
    } catch { /* robots.txt unreachable - proceed conservatively (no extra rules) */ }
    robotsCache.set(h, rules);
  }
  const path = (() => { try { return new URL(url).pathname; } catch { return "/"; } })();
  return !rules.some((r) => path.startsWith(r));
}

// --- HTML fetch + text extraction ---
async function fetchPage(url) {
  const cacheKey = `program_source_fetch:${url}`;
  const cached = cacheGet(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached.data;

  const res = await timedFetch(url);
  const contentType = res.headers.get("content-type") || "";
  const out = { ok: res.ok, status: res.status, contentType, url: res.url || url };
  if (res.ok && contentType.includes("text/html")) {
    out.html = await res.text();
  } else if (res.ok && contentType.includes("application/pdf")) {
    out.isPdf = true;
  }
  cacheSet(cacheKey, out);
  return out;
}

function extractPdfText(buffer) {
  // Lazily imported: pdf-parse pulls in a large default-test PDF at import
  // time in some versions, so only load it when a PDF is actually opened.
  return import("pdf-parse").then((m) => (m.default || m)(buffer)).then((r) => r.text || "");
}

function splitSentences(text) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

// Find the first sentence window containing any of `keywords`. Returns null
// (never a guess) when nothing on the page matches.
function findNear(sentences, keywords, windowSize = 2, maxLen = 400) {
  const lower = sentences.map((s) => s.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (keywords.some((k) => lower[i].includes(k))) {
      const slice = sentences.slice(i, Math.min(sentences.length, i + windowSize)).join(" ");
      return slice.length > maxLen ? slice.slice(0, maxLen).trim() + "…" : slice;
    }
  }
  return null;
}

const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\brolling\b/i;

function findDeadline(sentences) {
  const near = findNear(sentences, ["deadline", "due date", "must apply by", "applications are due"], 1, 200);
  if (near) {
    const m = near.match(DATE_RE);
    return { text: near, date: m ? m[0] : null };
  }
  return { text: null, date: null };
}

function guessProgramType(titleAndText) {
  const t = titleAndText.toLowerCase();
  for (const [kw, label] of PROGRAM_TYPE_KEYWORDS) {
    if (t.includes(kw)) return label;
  }
  return "Other / needs manual verification";
}

function guessDepartment(sentences) {
  for (const s of sentences) {
    const m = s.match(/\b(School of [A-Z][\w &-]+|College of [A-Z][\w &-]+|Department of [A-Z][\w &-]+)\b/);
    if (m) return m[0];
  }
  return null;
}

// Feature 7 (double-major verification strengthening): when a family
// researches a college, flag pages whose text mentions double-major-related
// policy language, as a breadcrumb pointing the family at pages worth
// checking manually -- this NEVER creates or updates a double_major_
// verifications record by itself (that would mean guessing which specific
// major pair the family cares about, and inventing that association would
// violate the "never invent facts" rule). It only ever adds a note to the
// discovered_programs record so the family knows to look here.
const DOUBLE_MAJOR_KEYWORDS = [
  "double major", "second major", "additional major", "dual degree",
  "concurrent degree", "intercollege degree", "intercollege transfer",
  "major declaration", "school-to-school transfer", "school to school transfer",
  "college restrictions", "school restrictions", "minor", "concentration",
  "certificate", "track",
];
export function findDoubleMajorKeywordEvidence(text) {
  const hay = String(text || "").toLowerCase();
  return DOUBLE_MAJOR_KEYWORDS.filter((k) => hay.includes(k));
}

// Core heuristic extractor shared by Layer 2 (manual URL) and Layer 3 (crawl).
// Returns a structured record PLUS a confidence_level derived from how many
// target fields were actually found on the page - never invented.
export function extractProgramFromHtml(html, url) {
  const $ = cheerio.load(html);
  $("script,style,nav,footer,noscript").remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").trim().slice(0, 200) || null;
  const bodyText = $("body").text() || "";
  const sentences = splitSentences(bodyText);

  const eligibility = findNear(sentences, ["eligib", "must be a", "open to students"]);
  const whoCanApply = findNear(sentences, ["who can apply", "open to", "applicants must", "students who"]);
  const { text: deadlineText, date: deadlineDate } = findDeadline(sentences);
  const applicationProcess = findNear(sentences, ["how to apply", "application process", "to apply,", "apply online", "apply by submitting"]);
  const benefits = findNear(sentences, ["benefit", "you will receive", "students receive", "provides students", "includes"]);
  const requirements = findNear(sentences, ["requirement", "prerequisite", "must have completed", "required to"]);
  const department = guessDepartment(sentences);
  const programType = guessProgramType(`${title || ""} ${bodyText.slice(0, 2000)}`);

  const fieldsFound = [eligibility, whoCanApply, deadlineText, applicationProcess, benefits, requirements].filter(Boolean).length;
  const confidence_level = fieldsFound >= 4 ? "high" : fieldsFound >= 2 ? "medium" : "low";
  const doubleMajorKeywordHits = findDoubleMajorKeywordEvidence(`${title || ""} ${bodyText.slice(0, 4000)}`);

  return {
    title,
    programName: title,
    programType,
    schoolDepartment: department,
    eligibility,
    whoCanApply,
    applicationDeadline: deadlineDate || deadlineText,
    applicationProcess,
    benefits,
    requirements,
    confidence_level,
    fieldsFound,
    doubleMajorKeywordHits,
    sourceUrl: url,
    // First ~3000 chars of visible body text, used only to check for a strong
    // program keyword when deciding whether a crawled page is worth saving -
    // never stored, never shown to the family.
    bodyExcerpt: bodyText.replace(/\s+/g, " ").slice(0, 3000),
  };
}

// --- Quality gate for Layer 3 (automatic crawl) results only. Layer 2 (a
// family-pasted URL) is always trusted -- the family chose that link on
// purpose. Layer 3 visits dozens of pages automatically and, without a gate,
// happily "discovers" navigation furniture (an "Apply" button, a footer
// "State and System Resources" link, a careers page) as if it were a real
// program. Two checks, both conservative (reject only, never invent):
//   1. isJunkTitle - an exact-match blocklist of common site furniture titles.
//   2. hasStrongProgramSignal / fieldsFound - require either a decent amount
//      of extracted structured info, OR a specific program-shaped phrase in
//      the title/url/body (e.g. "Honors Program", "Major in Computer Science").
//      A page that matches neither is almost never an actual program page.
const JUNK_EXACT_TITLES = new Set([
  "apply", "apply now", "apply online", "apply to texas", "admissions", "admission",
  "home", "homepage", "welcome", "contact", "contact us", "search", "search results",
  "sitemap", "site map", "accessibility", "accessibility statement", "privacy",
  "privacy policy", "privacy notice", "terms of use", "terms", "terms and conditions",
  "login", "sign in", "log in", "my portal", "news", "news & events", "news and events",
  "events", "calendar", "directory", "faculty directory", "staff directory", "careers",
  "careers at", "employment", "jobs", "job openings", "page not found", "not found",
  "404", "404 error", "error", "copyright", "state and system resources", "give now",
  "giving", "alumni", "visit", "visit campus", "campus tour", "maps & directions",
  "maps and directions", "parking", "covid-19", "coronavirus updates",
]);

const STRONG_PROGRAM_KEYWORDS = [
  "honors program", "honors college", "scholars program", "scholar program",
  "bridge program", "transition program", "access program", "research program",
  "undergraduate research", "fellowship program", "certificate program", "certificate in",
  "concentration in", "minor in", "major in", "b.s. in", "b.a. in", "bachelor of",
  "bs in", "ba in", "direct admit", "direct-admit", "direct to major",
  "leadership program", "internship program", "co-op program", "cooperative education",
  "dual degree", "combined degree", "accelerated program", "pre-med program",
  "pre-law program", "study abroad program", "scholarship program",
  "cybersecurity program", "data science program", "computer science program",
  "engineering program", "business program", "nursing program",
];

function isJunkTitle(title) {
  if (!title) return true;
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length < 3) return true;
  return JUNK_EXACT_TITLES.has(t);
}

function hasStrongProgramSignal(url, title, bodyExcerpt) {
  const hay = `${url} ${title || ""} ${bodyExcerpt || ""}`.toLowerCase();
  return STRONG_PROGRAM_KEYWORDS.some((k) => hay.includes(k));
}

function passesLayer3QualityGate(url, extracted) {
  if (isJunkTitle(extracted.title)) return false;
  return extracted.fieldsFound >= 2 || hasStrongProgramSignal(url, extracted.title, extracted.bodyExcerpt);
}

// --- Dedupe: normalize a program name so near-identical titles (case,
// punctuation, whitespace) collapse to the same key within one college. ---
function normalizeProgramName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findExistingProgram(studentId, collegeId, programName) {
  const norm = normalizeProgramName(programName);
  if (!collegeId || !norm) return null;
  const rows = db.prepare("SELECT program_id, program_name FROM discovered_programs WHERE student_id=? AND college_id=?").all(studentId, collegeId);
  return rows.find((r) => normalizeProgramName(r.program_name) === norm) || null;
}

// ---------------------------------------------------------------------------
// Layer 1 - seed discovered_programs from existing College Scorecard/CIP data.
// ---------------------------------------------------------------------------
const insertProgram = db.prepare(`
  INSERT INTO discovered_programs (
    program_id, student_id, college_id, college_name, program_name, program_type, school_department,
    eligibility, who_can_apply, application_deadline, application_process, benefits, requirements,
    relevant_tracks_json, cip_code, credential_level, earnings_median, debt_median, data_year,
    source_url, source_id, source_label, confidence_level, verification_status, last_checked, notes,
    action_needed, created_at, updated_at
  ) VALUES (
    @program_id, @student_id, @college_id, @college_name, @program_name, @program_type, @school_department,
    @eligibility, @who_can_apply, @application_deadline, @application_process, @benefits, @requirements,
    @relevant_tracks_json, @cip_code, @credential_level, @earnings_median, @debt_median, @data_year,
    @source_url, @source_id, @source_label, @confidence_level, @verification_status, @last_checked, @notes,
    @action_needed, @created_at, @updated_at
  )
`);

// Default "what to do next" text derived purely from verification status -
// never a claim about the program itself, just a process nudge.
function defaultActionNeeded(verificationStatus) {
  if (verificationStatus === "Official source verified" || verificationStatus === "User verified") {
    return "Ready to include in Decision Plan strategy - recheck before the application deadline.";
  }
  if (verificationStatus === "College Scorecard / CIP inferred") {
    return "Find and check the official program page for exact details.";
  }
  if (verificationStatus === "Outdated / needs recheck") {
    return "Revisit the source URL and confirm details are still current.";
  }
  return "Review the source and confirm this is a real, current program.";
}

export async function seedProgramsFromScorecard(studentId, collegeId) {
  const result = await getPrograms(collegeId);
  if (!result || !result.programs?.length) {
    return { added: 0, message: "College Scorecard returned no field-of-study (CIP) data for this college." };
  }
  const existing = db.prepare(
    "SELECT program_name FROM discovered_programs WHERE student_id=? AND college_id=? AND source_label='College Scorecard / CIP inferred'"
  ).all(studentId, collegeId).map((r) => r.program_name);
  const existingSet = new Set(existing);
  const ts = now();
  let added = 0;
  for (const p of result.programs) {
    if (existingSet.has(p.title)) continue;
    insertProgram.run({
      program_id: newId("prog"),
      student_id: studentId,
      college_id: collegeId,
      college_name: result.name || null,
      program_name: p.title,
      program_type: "Major",
      school_department: null,
      eligibility: null,
      who_can_apply: null,
      application_deadline: null,
      application_process: null,
      benefits: null,
      requirements: null,
      relevant_tracks_json: JSON.stringify([]),
      cip_code: p.cipCode || null,
      credential_level: String(p.credentialLevel || ""),
      earnings_median: null, // College Scorecard's field-of-study earnings endpoint is not wired up; never guessed
      debt_median: null,
      data_year: null,
      source_url: null,
      source_id: null,
      source_label: "College Scorecard / CIP inferred",
      confidence_level: "medium",
      verification_status: "College Scorecard / CIP inferred",
      last_checked: ts,
      notes: "Inferred from College Scorecard / CIP field-of-study data. This confirms a broad field of study is offered at the institution level - it does NOT confirm a specific program page, honors track, or special-program variant. Needs manual verification against the official program page for anything beyond the major itself.",
      action_needed: defaultActionNeeded("College Scorecard / CIP inferred"),
      created_at: ts,
      updated_at: ts,
    });
    added++;
  }
  return { added, total: result.programs.length };
}

// ---------------------------------------------------------------------------
// Layer 2 - manual official URL ingestion.
// ---------------------------------------------------------------------------
const insertSource = db.prepare(`
  INSERT INTO program_sources (source_id, student_id, college_id, college_name, url, source_type,
    discovery_method, fetch_status, http_status, raw_title, notes, last_checked, created_at)
  VALUES (@source_id, @student_id, @college_id, @college_name, @url, @source_type,
    @discovery_method, @fetch_status, @http_status, @raw_title, @notes, @last_checked, @created_at)
`);

export async function addOfficialUrl(studentId, { collegeId, collegeName, url, sourceType, allowPdf }) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error("A full official URL (https://...) is required."), { status: 400 });
  }
  const sourceId = newId("src");
  const ts = now();

  if (isPdfUrl(url) && !allowPdf) {
    insertSource.run({
      source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
      url, source_type: sourceType || "other", discovery_method: "manual_url", fetch_status: "skipped_pdf",
      http_status: null, raw_title: null, notes: "PDF source - not fetched automatically. Re-add with allowPdf to extract text.",
      last_checked: ts, created_at: ts,
    });
    return { source: { sourceId, fetchStatus: "skipped_pdf" }, program: null };
  }

  let page;
  try {
    page = await fetchPage(url);
  } catch (err) {
    insertSource.run({
      source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
      url, source_type: sourceType || "other", discovery_method: "manual_url", fetch_status: "failed",
      http_status: null, raw_title: null, notes: `Fetch failed: ${err.message.slice(0, 200)}`,
      last_checked: ts, created_at: ts,
    });
    return { source: { sourceId, fetchStatus: "failed", error: err.message }, program: null };
  }

  if (page.isPdf) {
    let text = "";
    try {
      const buf = Buffer.from(await (await timedFetch(url)).arrayBuffer());
      text = await extractPdfText(buf);
    } catch { /* fall through with empty text; still record the source */ }
    const extracted = text ? extractProgramFromHtml(`<html><body><pre>${escapeHtml(text)}</pre></body></html>`, url) : null;
    insertSource.run({
      source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
      url, source_type: sourceType || "other", discovery_method: "manual_url", fetch_status: text ? "ok" : "failed",
      http_status: page.status || null, raw_title: extracted?.title || null, notes: "PDF document.",
      last_checked: ts, created_at: ts,
    });
    if (!extracted) return { source: { sourceId, fetchStatus: "failed" }, program: null };
    const { program, created } = saveExtractedProgram(studentId, { collegeId, collegeName, sourceId, url, sourceType, extracted, sourceLabel: `Official PDF source (${hostOf(url) || "unknown domain"})` });
    return { source: { sourceId, fetchStatus: "ok" }, program, duplicate: !created };
  }

  if (!page.ok || !page.html) {
    insertSource.run({
      source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
      url, source_type: sourceType || "other", discovery_method: "manual_url", fetch_status: "failed",
      http_status: page.status || null, raw_title: null, notes: `HTTP ${page.status || "error"}`,
      last_checked: ts, created_at: ts,
    });
    return { source: { sourceId, fetchStatus: "failed", httpStatus: page.status }, program: null };
  }

  const extracted = extractProgramFromHtml(page.html, url);
  insertSource.run({
    source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
    url, source_type: sourceType || "other", discovery_method: "manual_url", fetch_status: "ok",
    http_status: page.status, raw_title: extracted.title, notes: null, last_checked: ts, created_at: ts,
  });
  const { program, created } = saveExtractedProgram(studentId, { collegeId, collegeName, sourceId, url, sourceType, extracted, sourceLabel: `Official source (${hostOf(url) || "unknown domain"})` });
  return { source: { sourceId, fetchStatus: "ok" }, program, duplicate: !created };
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

// Returns { program, created }. If a program with the same normalized name
// already exists for this student+college (e.g. the crawl visited two pages
// describing the same honors program, or "Research this college" was run
// twice), the existing row's source/last-checked is refreshed instead of
// inserting a duplicate.
function saveExtractedProgram(studentId, { collegeId, collegeName, sourceId, url, sourceType, extracted, sourceLabel, track }) {
  const ts = now();
  const programName = extracted.programName || "Untitled program (see source)";

  const existing = findExistingProgram(studentId, collegeId, programName);
  if (existing) {
    db.prepare(`
      UPDATE discovered_programs
      SET source_url=@source_url, source_id=@source_id, source_label=@source_label,
          last_checked=@last_checked, updated_at=@updated_at
      WHERE program_id=@program_id
    `).run({ source_url: url, source_id: sourceId, source_label: sourceLabel, last_checked: ts, updated_at: ts, program_id: existing.program_id });
    return { program: db.prepare("SELECT * FROM discovered_programs WHERE program_id=?").get(existing.program_id), created: false };
  }

  const programId = newId("prog");
  insertProgram.run({
    program_id: programId,
    student_id: studentId,
    college_id: collegeId || null,
    college_name: collegeName || null,
    program_name: programName,
    program_type: extracted.programType,
    school_department: extracted.schoolDepartment,
    eligibility: extracted.eligibility,
    who_can_apply: extracted.whoCanApply,
    application_deadline: extracted.applicationDeadline,
    application_process: extracted.applicationProcess,
    benefits: extracted.benefits,
    requirements: extracted.requirements,
    relevant_tracks_json: JSON.stringify(track ? [track] : []),
    cip_code: null,
    credential_level: null,
    earnings_median: null,
    debt_median: null,
    data_year: null,
    source_url: url,
    source_id: sourceId,
    source_label: sourceLabel,
    confidence_level: extracted.confidence_level,
    verification_status: "Needs manual verification",
    last_checked: ts,
    notes: [
      extracted.fieldsFound === 0
        ? "Automatic extraction found no clearly labeled program fields on this page. Please review the source URL directly and fill in fields manually."
        : `Automatic extraction found ${extracted.fieldsFound}/6 target fields on this page. Review against the source before treating this as verified.`,
      extracted.doubleMajorKeywordHits?.length
        ? `This page mentions double-major-related language (${extracted.doubleMajorKeywordHits.slice(0, 5).join(", ")}). If you're considering a double major here, check this page and confirm the official policy in Double Major Search's "Confirm with an official source" form.`
        : null,
    ].filter(Boolean).join(" "),
    action_needed: defaultActionNeeded("Needs manual verification"),
    created_at: ts,
    updated_at: ts,
  });
  return { program: db.prepare("SELECT * FROM discovered_programs WHERE program_id=?").get(programId), created: true };
}

// ---------------------------------------------------------------------------
// Layer 3 - bounded official-domain discovery.
// ---------------------------------------------------------------------------
function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    try {
      const abs = new URL(href, baseUrl).toString().split("#")[0];
      links.add(abs);
    } catch { /* ignore malformed href */ }
  });
  return [...links];
}

const PROGRAM_URL_HINTS = [
  "program", "programs", "major", "majors", "minor", "minors", "honors", "scholars", "bridge",
  "cohort", "concentration", "certificate", "admission", "apply", "transfer", "research",
  "internship", "fellowship", "scholarship", "pipeline", "pre-college", "precollege",
  "first-year", "undergraduate", "undergrad", "transition", "access", "leadership", "business",
  "engineering", "computer-science", "computer science", "data-science", "data science",
  "artificial-intelligence", "artificial intelligence", "cybersecurity", "finance", "quant",
  "stem", "special-program", "special program",
];

function looksLikeProgramPage(url, title) {
  const hay = `${url} ${title || ""}`.toLowerCase();
  return PROGRAM_URL_HINTS.some((h) => hay.includes(h));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function discoverFromOfficialDomain(studentId, { collegeId, collegeName, domain, startUrl, track }) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "");
  const start = startUrl && isSameOfficialDomain(startUrl, cleanDomain) ? startUrl : `https://${cleanDomain}/`;

  const visited = new Set();
  const queue = [{ url: start, depth: 0 }];
  let pagesFetched = 0;
  let programsFound = 0;
  let robotsBlocked = 0;
  let offDomainSkipped = 0;
  let pdfSkipped = 0;
  let lowQualitySkipped = 0;
  let duplicatesSkipped = 0;
  const createdPrograms = [];

  while (queue.length && pagesFetched < CRAWL_MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    if (!isSameOfficialDomain(url, cleanDomain)) { offDomainSkipped++; continue; }
    if (isPdfUrl(url)) { pdfSkipped++; continue; }

    const allowed = await isAllowedByRobots(url).catch(() => true);
    if (!allowed) { robotsBlocked++; continue; }

    let page;
    try {
      page = await fetchPage(url);
    } catch {
      continue;
    }
    pagesFetched++;

    if (page.ok && page.html) {
      const extracted = extractProgramFromHtml(page.html, url);
      const ts = now();
      if (looksLikeProgramPage(url, extracted.title)) {
        if (!passesLayer3QualityGate(url, extracted)) {
          lowQualitySkipped++;
        } else {
          const sourceId = newId("src");
          insertSource.run({
            source_id: sourceId, student_id: studentId, college_id: collegeId || null, college_name: collegeName || null,
            url, source_type: "discovered", discovery_method: "official_domain_crawl", fetch_status: "ok",
            http_status: page.status, raw_title: extracted.title, notes: null, last_checked: ts, created_at: ts,
          });
          const { program, created } = saveExtractedProgram(studentId, {
            collegeId, collegeName, sourceId, url, sourceType: "discovered", extracted,
            sourceLabel: `Official domain crawl (${cleanDomain})`, track,
          });
          if (created) { createdPrograms.push(program); programsFound++; }
          else duplicatesSkipped++;
        }
      }

      if (depth < CRAWL_MAX_DEPTH) {
        const links = extractLinks(page.html, page.url || url).filter((l) => isSameOfficialDomain(l, cleanDomain));
        for (const l of links) {
          if (!visited.has(l) && queue.length + pagesFetched < CRAWL_MAX_PAGES * 3) {
            queue.push({ url: l, depth: depth + 1 });
          }
        }
      }
    }
    await sleep(CRAWL_DELAY_MS);
  }

  return {
    domain: cleanDomain,
    pagesFetched,
    programsFound,
    robotsBlocked,
    offDomainSkipped,
    pdfSkipped,
    lowQualitySkipped,
    duplicatesSkipped,
    maxPages: CRAWL_MAX_PAGES,
    maxDepth: CRAWL_MAX_DEPTH,
    programs: createdPrograms,
  };
}

// ---------------------------------------------------------------------------
// "Research this college" - the one-button family workflow. Orchestrates
// Layer 1 (College Scorecard / CIP) and, when the college's official website
// is known from College Scorecard itself, Layer 3 (bounded official-domain
// discovery) automatically - the family never has to know or type a domain.
// If no official website is on file, Layer 3 is skipped and the response says
// so plainly; the family can still add a known link under "Advanced."
// ---------------------------------------------------------------------------
export async function researchCollege(studentId, { collegeId, collegeName, track, keyword }) {
  const summary = {
    collegeId, collegeName, track: track || null, keyword: keyword || null,
    scorecard: null, domainDiscovery: null, domainUsed: null,
    incompleteNotice: "Programs discovered from official sources. College program discovery may be incomplete - always verify final decisions on official college websites.",
  };

  // Layer 1: broad fields of study.
  try {
    summary.scorecard = await seedProgramsFromScorecard(studentId, collegeId);
  } catch (err) {
    summary.scorecard = { added: 0, error: err.message };
  }

  // Resolve the college's official site from College Scorecard itself, so the
  // family never has to already know or type a domain.
  let websiteUrl = null;
  try {
    const found = await getCollegeById(collegeId);
    websiteUrl = found?.college?.websiteUrl || null;
    if (found?.college?.name && !collegeName) summary.collegeName = found.college.name;
  } catch { /* Scorecard lookup failed - proceed without Layer 3 */ }

  if (websiteUrl) {
    const domain = websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*/, "");
    summary.domainUsed = domain;
    try {
      summary.domainDiscovery = await discoverFromOfficialDomain(studentId, {
        collegeId, collegeName: summary.collegeName, domain, startUrl: websiteUrl, track,
      });
    } catch (err) {
      summary.domainDiscovery = { error: err.message, pagesFetched: 0, programsFound: 0 };
    }
  } else {
    summary.domainDiscovery = {
      skipped: true,
      reason: "No official website is on file for this college in College Scorecard yet. Add a known official link under Advanced to help fill this in.",
    };
  }

  // Tag every program that already existed for this college with the
  // requested track/keyword hint if one was given and none is set yet, so
  // filtering by track in the UI catches programs found before this run too.
  if (track) {
    const rows = db.prepare(
      "SELECT program_id, relevant_tracks_json FROM discovered_programs WHERE student_id=? AND college_id=?"
    ).all(studentId, collegeId);
    const upd = db.prepare("UPDATE discovered_programs SET relevant_tracks_json=? WHERE program_id=?");
    for (const r of rows) {
      let tracks = [];
      try { tracks = JSON.parse(r.relevant_tracks_json || "[]"); } catch { /* ignore */ }
      if (!tracks.includes(track)) { tracks.push(track); upd.run(JSON.stringify(tracks), r.program_id); }
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Layer 4 - live official-site majors/departments scan (NOT persisted).
//
// Why this exists: the "All undergraduate programs" list elsewhere in this
// app comes from College Scorecard's federal CIP taxonomy, which a college
// reports to the Dept. of Education for every bachelor's program it grants.
// That's real, government-verified data - but it's organized by federal
// classification, not by how the college's own website groups its
// departments/majors, so the two lists rarely read the same for the same
// college (e.g. Scorecard may show "Nuclear Engineering" as its own CIP code
// even though a college's site lists it under a combined department page).
// Neither is wrong; they're just different lenses on the same real programs.
//
// This function gives families a way to see the college's OWN framing
// directly: a bounded, robots-aware crawl of the college's real domain
// (reusing the same fetch/robots/link primitives as the Layer 3 "Programs &
// Opportunities" crawl above) that looks specifically for major/department
// listing pages, and returns exactly what it found with a live link back to
// each source page. Nothing is persisted to the database and nothing is
// merged with the CIP list - it's a fresh, on-demand, side-by-side reference
// so a family can literally click through and confirm for themselves. This
// is inherently a heuristic best-effort scan (college websites are not
// standardized), so it can miss things or occasionally pick up a
// near-miss - every result carries its real source URL for that reason.
const MAJOR_PAGE_URL_HINTS = [
  "major", "majors", "department", "departments", "academics", "academic-programs",
  "programs-of-study", "program-of-study", "fields-of-study", "undergraduate-majors",
  "undergraduate-programs", "areas-of-study", "school-of", "college-of", "degrees",
  "course-catalog", "catalog",
];

// A page whose TITLE matches one of these is very likely an actual
// department/major page (as opposed to an admissions or news page that
// merely mentions majors in passing).
const MAJOR_TITLE_PATTERNS = [
  /^department of /i, /^school of /i, /^college of /i,
  /\bmajor(s)?\b/i, /\bb\.?s\.?\s*(in|,)/i, /\bb\.?a\.?\s*(in|,)/i,
  /\bbachelor of /i, /\bundergraduate program(s)?\b/i, /\bconcentration(s)?\b/i,
  /\bdegree program(s)?\b/i,
];

// Same junk-title exclusions as Layer 3 (apply,admissions,home,news,etc. are
// never real department pages), reused rather than duplicated.
function looksLikeMajorPage(url, title) {
  if (isJunkTitle(title)) return false;
  const hay = `${url}`.toLowerCase();
  const hintedUrl = MAJOR_PAGE_URL_HINTS.some((h) => hay.includes(h));
  const titleMatch = title ? MAJOR_TITLE_PATTERNS.some((re) => re.test(title)) : false;
  return hintedUrl || titleMatch;
}

// Cleans a raw <title> tag down to a readable department/major name - strips
// the usual " | University Name" / " - University Name" suffix noise.
function cleanMajorTitle(title, collegeName) {
  if (!title) return null;
  let t = title.replace(/\s*[|\-–-]\s*.*$/, "").trim();
  if (collegeName && t.toLowerCase() === collegeName.toLowerCase()) return null;
  return t.length >= 3 && t.length <= 120 ? t : title.slice(0, 120);
}

function normalizeTitleKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Live, on-demand, NOT persisted. Caps mirror Layer 3 (same politeness
// budget) but count separately since this is a distinct crawl run by a
// distinct button, not chained after "Research this college".
export async function scanOfficialSiteMajors({ collegeId, collegeName, domain, startUrl }) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "");
  const start = startUrl && isSameOfficialDomain(startUrl, cleanDomain) ? startUrl : `https://${cleanDomain}/`;

  const visited = new Set();
  const queue = [{ url: start, depth: 0 }];
  let pagesFetched = 0;
  const seenTitles = new Set();
  const found = [];
  const MAX_PAGES = 40;
  const MAX_DEPTH = 2;
  const MAX_RESULTS = 80;

  while (queue.length && pagesFetched < MAX_PAGES && found.length < MAX_RESULTS) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (!isSameOfficialDomain(url, cleanDomain) || isPdfUrl(url)) continue;

    const allowed = await isAllowedByRobots(url).catch(() => true);
    if (!allowed) continue;

    let page;
    try { page = await fetchPage(url); } catch { continue; }
    pagesFetched++;

    if (page.ok && page.html) {
      const $ = cheerio.load(page.html);
      $("script,style,nav,footer,noscript").remove();
      const rawTitle = ($("title").first().text() || $("h1").first().text() || "").trim().slice(0, 200) || null;

      if (looksLikeMajorPage(url, rawTitle)) {
        const cleaned = cleanMajorTitle(rawTitle, collegeName);
        const key = normalizeTitleKey(cleaned);
        if (cleaned && key && !seenTitles.has(key)) {
          seenTitles.add(key);
          found.push({ title: cleaned, url });
        }
      }

      if (depth < MAX_DEPTH) {
        const links = extractLinks(page.html, page.url || url).filter((l) => isSameOfficialDomain(l, cleanDomain));
        for (const l of links) {
          if (!visited.has(l) && queue.length + pagesFetched < MAX_PAGES * 3) queue.push({ url: l, depth: depth + 1 });
        }
      }
    }
    await sleep(CRAWL_DELAY_MS);
  }

  return {
    domain: cleanDomain,
    pagesFetched,
    maxPages: MAX_PAGES,
    majorsFound: found.length,
    majors: found,
    note: found.length
      ? `Found ${found.length} department/major page${found.length === 1 ? "" : "s"} on ${cleanDomain}. This is a best-effort scan of the college's own site, not an official or complete catalog - click through to confirm.`
      : `No clear department/major pages were found within a ${MAX_PAGES}-page scan of ${cleanDomain}. Some colleges list majors under a structure this scan doesn't recognize, or require JavaScript to render - open the site directly to check.`,
  };
}

// ---------------------------------------------------------------------------
// Shared crawl primitives, exported for reuse by other bounded-discovery
// features (e.g. Essay Center's "Find essay prompts", services/essayCenter.js)
// so they don't duplicate fetch/robots/link-extraction logic. Purely additive
// - nothing above this changes behavior for the existing Programs feature.
// ---------------------------------------------------------------------------
export {
  fetchPage,
  isAllowedByRobots,
  extractLinks,
  isSameOfficialDomain,
  timedFetch,
  sleep,
  hostOf,
  splitSentences,
  findNear,
  isPdfUrl,
};
