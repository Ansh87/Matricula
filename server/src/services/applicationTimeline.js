// applicationTimeline.js, the "Application Timeline" backend (per college,
// per family). Tracks every deadline/event type a family needs to plan
// around (application opens, ED/EA/REA/priority/RD/rolling deadlines,
// scholarship/honors/program-specific/portfolio-audition deadlines, financial
// aid/CSS Profile/FAFSA priority deadlines, decision notification, enrollment
// deposit, admitted-student events). Nothing here is ever hardcoded as a
// permanent "always true" fact for a college. Every row is either entered
// by the family or extracted from one specific official page at one specific
// time, and always keeps source_url, cycle_year, last_checked, and
// verification_status so the family can judge how current it is.
//
// Extraction (Part G) reuses the same bounded, robots.txt-aware, same-domain
// crawl primitives as Programs/Essay Center (services/programDiscovery.js) --
// it never crawls off a college's own official domain, and every extracted
// event keeps its exact source URL. When confidence is low (no clear event
// keyword + date pair), nothing is invented; the family sees "Needs manual
// verification" and can add events by hand instead.
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import { getCollegeById } from "./scorecard.js";
import { findAutofillProfile } from "../db/deadlineSeed.js";
import {
  fetchPage, isAllowedByRobots, extractLinks, isSameOfficialDomain,
  sleep, hostOf, isPdfUrl,
} from "./programDiscovery.js";

function newId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return Date.now(); }

export const EVENT_TYPES = [
  "Application opens",
  "Early Decision deadline",
  "Early Action deadline",
  "REA / SCEA deadline",
  "Priority deadline",
  "Regular Decision deadline",
  "Rolling admission opens",
  "Rolling admission priority date",
  "Scholarship deadline",
  "Honors deadline",
  "Program-specific deadline",
  "Portfolio / audition deadline",
  "Financial aid deadline",
  "CSS Profile deadline",
  "FAFSA priority deadline",
  "Decision notification",
  "Enrollment deposit deadline",
  "Admitted student event",
  "Other",
];

// The subset of event types that represent an actual "you must act by this
// date" deadline for the main application. Used to compute "earliest
// upcoming deadline" for Decision Plan / Journey without pulling in
// notification dates or informational events.
export const DEADLINE_EVENT_TYPES = [
  "Early Decision deadline", "Early Action deadline", "REA / SCEA deadline",
  "Priority deadline", "Regular Decision deadline", "Rolling admission opens",
  "Rolling admission priority date",
];

// A minimal, conservative "expected" checklist used only to tell the family
// what's still missing for a college, never auto-filled, never assumed to
// apply to every college (e.g. not every college has Early Decision).
export const CORE_EVENT_TYPES_CHECKLIST = [
  "Application opens", "Regular Decision deadline", "Decision notification", "Enrollment deposit deadline",
];

export const APPLICATION_ROUNDS = [
  "ED", "EA", "REA/SCEA", "Priority", "RD", "Rolling", "Honors/Scholarship", "Program-specific", "Other",
];

function newTimelineId() { return newId("tl"); }

// ---------------------------------------------------------------------------
// Manual + shared row helpers
// ---------------------------------------------------------------------------
const insertEvent = db.prepare(`
  INSERT INTO college_application_timeline_events (
    event_id, student_id, college_id, college_name, program_label, application_round,
    event_type, event_label, event_date, event_month_day, cycle_year, source_url,
    source_label, last_checked, verification_status, notes, created_at, updated_at
  ) VALUES (
    @event_id, @student_id, @college_id, @college_name, @program_label, @application_round,
    @event_type, @event_label, @event_date, @event_month_day, @cycle_year, @source_url,
    @source_label, @last_checked, @verification_status, @notes, @created_at, @updated_at
  )
`);

// ---------------------------------------------------------------------------
// Date parsing helpers. Best-effort only. Never invents a date; if the text
// can't be confidently parsed into a month/day, sorting/next-occurrence
// helpers simply return null and the event is shown as "date not parseable --
// verify manually" rather than silently dropped or guessed.
// ---------------------------------------------------------------------------
const MONTH_NAMES = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(st|nd|rd|th)?(,?\s+(\d{4}))?\b/i;
const ROLLING_RE = /\brolling\b/i;

export function extractMonthDay(text) {
  if (!text) return null;
  const m = String(text).match(DATE_RE);
  if (!m) return null;
  const month = MONTH_NAMES[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  if (!month || !day || day < 1 || day > 31) return null;
  return { month, day, year: m[5] ? parseInt(m[5], 10) : null };
}

// Next real-world occurrence of a month/day on/after `today`. Same "roll
// forward to next year if already passed" logic used elsewhere in this app
// (Journey.jsx's senior-year timeline). Returns an ISO date string or null.
export function nextOccurrenceIso(monthDay, today = new Date()) {
  if (!monthDay) return null;
  const { month, day, year } = monthDay;
  if (year) {
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let y = today.getFullYear();
  let d = new Date(y, month - 1, day);
  if (d < today) d = new Date(y + 1, month - 1, day);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Extraction (Part G). Conservative event-type keyword + nearby date match.
// Reuses the same block-level walk pattern as Essay Center's prompt extractor
// so unrelated headings/nav copy next to each other don't get concatenated
// into one false match.
// ---------------------------------------------------------------------------
const EVENT_KEYWORD_RULES = [
  // Order matters. More specific phrases before generic ones.
  [/restrictive early action|single.choice early action|\brea\b|\bscea\b/i, "REA / SCEA deadline"],
  [/early decision/i, "Early Decision deadline"],
  [/early action/i, "Early Action deadline"],
  [/priority deadline|priority date|priority filing/i, "Priority deadline"],
  [/regular decision|regular admission|regular action/i, "Regular Decision deadline"],
  [/rolling admission priority|rolling priority/i, "Rolling admission priority date"],
  [/rolling admission|rolling basis|applications? (are|is) reviewed on a rolling/i, "Rolling admission opens"],
  [/css profile/i, "CSS Profile deadline"],
  [/fafsa/i, "FAFSA priority deadline"],
  [/scholarship deadline|scholarship application (is|are) due|merit scholarship.*deadline/i, "Scholarship deadline"],
  [/honors (college|program).*(deadline|due|apply by)|honors application deadline/i, "Honors deadline"],
  [/portfolio (deadline|due|submission)/i, "Portfolio / audition deadline"],
  [/audition (deadline|due|schedule|sign.?up)/i, "Portfolio / audition deadline"],
  [/financial aid (deadline|priority|due)/i, "Financial aid deadline"],
  [/notified by|decisions? (will be |are )?released|admission decisions? (are|will be) available|notification date/i, "Decision notification"],
  [/enroll by|enrollment deposit|deposit deadline|reply by|intent to enroll/i, "Enrollment deposit deadline"],
  [/admitted student (day|event|program)/i, "Admitted student event"],
  [/applications? open|application (opens|available)|apply beginning/i, "Application opens"],
];

const ROUND_HINT_RULES = [
  [/restrictive early action|single.choice early action|\brea\b|\bscea\b/i, "REA/SCEA"],
  [/early decision/i, "ED"],
  [/early action/i, "EA"],
  [/priority/i, "Priority"],
  [/regular decision|regular admission/i, "RD"],
  [/rolling/i, "Rolling"],
  [/honors/i, "Honors/Scholarship"],
  [/scholarship/i, "Honors/Scholarship"],
];

function classifyEventType(text) {
  for (const [re, type] of EVENT_KEYWORD_RULES) if (re.test(text)) return type;
  return null;
}
function classifyRound(text) {
  for (const [re, round] of ROUND_HINT_RULES) if (re.test(text)) return round;
  return null;
}

// Walk block-level elements (same technique as essayCenter.js's prompt
// extractor) and look for a text unit that both names an event AND contains
// a parseable date (or "rolling") close by (same unit, or the immediately
// adjacent unit). Every match is conservative. If we can't find both an
// event keyword and a date/rolling signal near each other, nothing is
// recorded for that spot.
export function extractTimelineEventsFromHtml(html, url) {
  const $ = cheerio.load(html);
  $("script,style,nav,footer,noscript,header,button,form").remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").trim().slice(0, 200) || null;

  const units = [];
  let currentHeading = "";
  $("body")
    .find("h1,h2,h3,h4,h5,h6,p,li,blockquote,td,dd,dt")
    .each((_, el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (!t) return;
      if (/^h[1-6]$/.test(tag)) { currentHeading = t; return; }
      units.push({ text: t, heading: currentHeading });
    });

  const candidates = [];
  const seen = new Set();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const eventType = classifyEventType(u.text) || (currentHeadingMatches(u.heading) ? classifyEventType(u.heading) : null);
    if (!eventType) continue;

    const nearWindow = `${units[i - 1]?.text || ""} ${u.text} ${units[i + 1]?.text || ""}`;
    const monthDay = extractMonthDay(u.text) || extractMonthDay(nearWindow);
    const isRolling = ROLLING_RE.test(u.text) || (eventType.startsWith("Rolling") && ROLLING_RE.test(nearWindow));
    if (!monthDay && !isRolling) continue; // no confident date signal. Skip rather than guess

    const round = classifyRound(u.text) || classifyRound(u.heading) || null;
    const eventDateText = isRolling && !monthDay ? "Rolling" : formatMonthDay(monthDay);
    const key = `${eventType}::${eventDateText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      eventType,
      eventLabel: `${eventType}${round && !eventType.includes(round) ? ` (${round})` : ""}`,
      eventDate: eventDateText,
      eventMonthDay: monthDay ? `${String(monthDay.month).padStart(2, "0")}-${String(monthDay.day).padStart(2, "0")}` : null,
      applicationRound: round,
      cycleYear: monthDay?.year ? String(monthDay.year) : null,
      snippet: u.text.slice(0, 220),
    });
  }
  return { title, events: candidates.slice(0, 25) };
}

function currentHeadingMatches() { return false; } // headings alone are too weak a signal for a date-bearing event; reserved for future tightening

function formatMonthDay(monthDay) {
  if (!monthDay) return null;
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[monthDay.month]} ${monthDay.day}${monthDay.year ? `, ${monthDay.year}` : ""}`;
}

// ---------------------------------------------------------------------------
// "Verify deadlines", the one-button family workflow (Part G). Bounded,
// robots.txt-aware, same-official-domain crawl, hinted toward deadline/date
// pages. Every stored event keeps its exact source_url and last_checked
// timestamp; nothing is ever invented. Existing events with the same
// (event_type, application_round, event_date) for this college are refreshed
// (source/last_checked) rather than duplicated; a DIFFERENT date found for
// the same event_type+round is kept as a SEPARATE row so the conflict can be
// surfaced (Part E) rather than silently overwritten.
// ---------------------------------------------------------------------------
const TIMELINE_URL_HINTS = [
  "deadline", "deadlines", "dates", "apply", "admission", "admissions", "application",
  "financial-aid", "financial aid", "cost", "tuition", "scholarship", "honors",
  "first-year", "freshman", "how-to-apply",
];
const CRAWL_MAX_PAGES = 28;
// A real deadlines page is very often nested three clicks deep from a
// college's homepage (Home -> Apply -> Application Materials -> Deadlines,
// for example), a depth cap of 2 stops one level short of that and
// silently finds nothing even when the page is perfectly readable. Verified
// against a real college's site structure (UT Austin) needing depth 3.
const CRAWL_MAX_DEPTH = 3;
// Below this many visible characters (after stripping script/style/nav), a
// fetched page is almost certainly a JavaScript-rendered shell rather than a
// real content page. Used to give an honest, specific notice instead of a
// generic "not found."
const THIN_PAGE_TEXT_THRESHOLD = 150;

function visibleTextLength(html) {
  try {
    const $ = cheerio.load(html);
    $("script,style,nav,footer,noscript,header").remove();
    return $("body").text().replace(/\s+/g, " ").trim().length;
  } catch { return 0; }
}

function findExistingEvent(studentId, collegeId, eventType, applicationRound, eventDate) {
  if (!collegeId) return null;
  const rows = db.prepare(
    "SELECT event_id FROM college_application_timeline_events WHERE student_id=? AND college_id=? AND event_type=? AND IFNULL(application_round,'')=? AND IFNULL(event_date,'')=?"
  ).all(studentId, collegeId, eventType, applicationRound || "", eventDate || "");
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// "Auto-fill official dates", a second, faster path to the same table as
// "Verify deadlines," used when the selected college matches one of the
// hand-verified TIMELINE_AUTOFILL_PROFILES in db/deadlineSeed.js (same
// name-pattern technique as suggestPlatform in applicationPathways.js).
// Never invents anything the family hasn't seen sourced. Every inserted
// row keeps its source_url and is stamped with the profile's confidence
// level, and rows from a "recurring pattern, confirm" profile are still
// marked "Needs manual verification" rather than "Official source verified,"
// since the source page itself hadn't been refreshed for the newest cycle
// at the time it was checked. If no profile matches, nothing is guessed --
// the family is pointed to "Verify deadlines" (crawl) or manual entry.
// ---------------------------------------------------------------------------
export function findAutofillCandidate(collegeName) {
  return findAutofillProfile(collegeName);
}

export function autofillTimelineEvents(studentId, { collegeId, collegeName }) {
  const profile = findAutofillProfile(collegeName);
  if (!profile) {
    return {
      filled: false,
      reason: `No hand-verified reference dates yet for "${collegeName || "this college"}." Use "Verify deadlines" to search the college's official site, or add dates by hand.`,
    };
  }

  const ts = now();
  const verificationStatus = profile.confidence === "verified" ? "Official source verified" : "Needs manual verification";
  const added = [];
  const refreshed = [];

  for (const ev of profile.events) {
    const monthDay = extractMonthDay(ev.eventDate);
    const url = ev.sourceUrl || profile.sourceUrl;
    const noteParts = [
      ev.notes || null,
      profile.notes || null,
      "Auto-filled from hand-verified reference data, always confirm the exact date and cycle on the official application portal before treating it as final.",
    ].filter(Boolean);

    const existing = findExistingEvent(studentId, collegeId, ev.eventType, ev.applicationRound, ev.eventDate);
    if (existing) {
      db.prepare("UPDATE college_application_timeline_events SET source_url=?, source_label=?, last_checked=?, updated_at=? WHERE event_id=?")
        .run(url, `Reference data (${hostOf(url) || "official source"}, checked ${profile.lastChecked})`, ts, ts, existing.event_id);
      refreshed.push(db.prepare("SELECT * FROM college_application_timeline_events WHERE event_id=?").get(existing.event_id));
      continue;
    }

    const eventId = newTimelineId();
    insertEvent.run({
      event_id: eventId, student_id: studentId, college_id: collegeId || null,
      college_name: collegeName || profile.collegeName || null,
      program_label: ev.programLabel || null, application_round: ev.applicationRound || null,
      event_type: ev.eventType, event_label: ev.eventLabel,
      event_date: ev.eventDate, event_month_day: monthDay ? `${String(monthDay.month).padStart(2, "0")}-${String(monthDay.day).padStart(2, "0")}` : null,
      cycle_year: null,
      source_url: url, source_label: `Reference data (${hostOf(url) || "official source"}, checked ${profile.lastChecked})`,
      last_checked: ts, verification_status: verificationStatus,
      notes: noteParts.join(" "),
      created_at: ts, updated_at: ts,
    });
    added.push(db.prepare("SELECT * FROM college_application_timeline_events WHERE event_id=?").get(eventId));
  }

  return {
    filled: true,
    collegeName: profile.collegeName,
    confidence: profile.confidence,
    sourceUrl: profile.sourceUrl,
    lastChecked: profile.lastChecked,
    added, refreshed,
    // Application-detail fields (honors/scholarship/portfolio/interview/
    // recommendations/transcript required, test policy, fee, fee waiver),
    // when the reference profile has them, the client applies these to
    // the Add-record form and/or an existing requirement row, only ever
    // filling fields still at "Unknown"/blank.
    requirements: profile.requirements || null,
    notice: profile.confidence === "verified"
      ? "Dates auto-filled from a source checked directly against the college's own page. Still confirm before a real deadline. Dates can shift by a day or two each cycle."
      : "Dates auto-filled from a recurring pattern seen in recent cycles, but the official page hadn't been refreshed for the newest cycle when last checked. Confirm on the official site before relying on these.",
  };
}

export async function findTimelineEvents(studentId, { collegeId, collegeName, domain, startUrl, cycleYear }) {
  let cleanDomain = domain ? domain.replace(/^https?:\/\//, "").replace(/\/.*/, "") : null;
  let resolvedFrom = cleanDomain ? "provided" : null;
  let resolvedCollegeName = collegeName || null;

  if (!cleanDomain && collegeId) {
    try {
      const found = await getCollegeById(collegeId);
      const websiteUrl = found?.college?.websiteUrl;
      if (websiteUrl) { cleanDomain = websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*/, ""); resolvedFrom = "college_scorecard"; }
      if (found?.college?.name && !resolvedCollegeName) resolvedCollegeName = found.college.name;
    } catch { /* Scorecard lookup failed. Proceed without a resolved domain */ }
  }

  if (!cleanDomain) {
    return {
      skipped: true, eventsFound: 0,
      notice: "Deadlines not verified yet. Check the official application portal.",
      reason: "No official website domain is known for this college yet. Add one under Advanced, or check the official application portal directly.",
    };
  }

  const start = startUrl && isSameOfficialDomain(startUrl, cleanDomain) ? startUrl : `https://${cleanDomain}/`;
  const visited = new Set();
  const queue = [{ url: start, depth: 0 }];
  let pagesFetched = 0, eventsFound = 0, robotsBlocked = 0, offDomainSkipped = 0, pdfSkipped = 0;
  let contentPagesSeen = 0, thinPagesSeen = 0;
  const created = [];

  while (queue.length && pagesFetched < CRAWL_MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (!isSameOfficialDomain(url, cleanDomain)) { offDomainSkipped++; continue; }
    if (isPdfUrl(url)) { pdfSkipped++; continue; }

    const allowed = await isAllowedByRobots(url).catch(() => true);
    if (!allowed) { robotsBlocked++; continue; }

    let page;
    try { page = await fetchPage(url); } catch { continue; }
    pagesFetched++;

    if (page.ok && page.html) {
      const hay = url.toLowerCase();
      const looksRelevant = depth === 0 || TIMELINE_URL_HINTS.some((h) => hay.includes(h));
      if (looksRelevant) {
        contentPagesSeen++;
        if (visibleTextLength(page.html) < THIN_PAGE_TEXT_THRESHOLD) thinPagesSeen++;
        const { events } = extractTimelineEventsFromHtml(page.html, url);
        const ts = now();
        for (const ev of events) {
          const existing = findExistingEvent(studentId, collegeId, ev.eventType, ev.applicationRound, ev.eventDate);
          if (existing) {
            db.prepare("UPDATE college_application_timeline_events SET source_url=?, source_label=?, last_checked=?, updated_at=? WHERE event_id=?")
              .run(url, `Official source (${hostOf(url) || "unknown domain"})`, ts, ts, existing.event_id);
            continue;
          }
          const eventId = newTimelineId();
          insertEvent.run({
            event_id: eventId, student_id: studentId, college_id: collegeId || null,
            college_name: resolvedCollegeName || null, program_label: null,
            application_round: ev.applicationRound, event_type: ev.eventType, event_label: ev.eventLabel,
            event_date: ev.eventDate, event_month_day: ev.eventMonthDay, cycle_year: ev.cycleYear || cycleYear || null,
            source_url: url, source_label: `Official source (${hostOf(url) || "unknown domain"})`,
            last_checked: ts, verification_status: "Needs manual verification",
            notes: `Automatically found ("${ev.snippet}"). Confirm this date and cycle on the official application portal before treating it as final.`,
            created_at: ts, updated_at: ts,
          });
          created.push(db.prepare("SELECT * FROM college_application_timeline_events WHERE event_id=?").get(eventId));
          eventsFound++;
        }
      }
      if (depth < CRAWL_MAX_DEPTH) {
        const links = extractLinks(page.html, page.url || url).filter((l) => isSameOfficialDomain(l, cleanDomain));
        for (const l of links) {
          const lower = l.toLowerCase();
          const isHinted = TIMELINE_URL_HINTS.some((h) => lower.includes(h));
          const worthQueueing = depth > 0 || isHinted || /admission|apply|first-year|freshman/i.test(lower);
          if (worthQueueing && !visited.has(l) && queue.length + pagesFetched < CRAWL_MAX_PAGES * 3) {
            // Deadline-hinted links jump to the front of the queue so a page
            // nested several clicks deep on a large site still gets reached
            // within the page budget, instead of losing out to a lot of
            // shallower, less-relevant pages visited first in strict
            // breadth-first order.
            if (isHinted) queue.unshift({ url: l, depth: depth + 1 });
            else queue.push({ url: l, depth: depth + 1 });
          }
        }
      }
    }
    await sleep(250);
  }

  // If every deadline-hinted page we actually managed to fetch came back
  // (almost) empty, this is very likely a JavaScript-rendered site whose
  // real content only appears after client-side scripts run. Something a
  // server-side fetch can never see. Say so plainly instead of a generic
  // "not found" with no explanation.
  const likelyJsRendered = eventsFound === 0 && contentPagesSeen > 0 && thinPagesSeen === contentPagesSeen;

  return {
    domain: cleanDomain, resolvedFrom, pagesFetched, eventsFound, robotsBlocked, offDomainSkipped, pdfSkipped,
    maxPages: CRAWL_MAX_PAGES, maxDepth: CRAWL_MAX_DEPTH, events: created, likelyJsRendered,
    notice: eventsFound > 0
      ? "Dates found automatically, always verify the exact date and application cycle on the official application portal before relying on it."
      : likelyJsRendered
        ? `This college's pages appear to require JavaScript to display their content, so they can't be read automatically. Check the official page yourself: https://${cleanDomain}/`
        : "Deadlines not verified yet. Check the official application portal.",
  };
}

// ---------------------------------------------------------------------------
// Conflict detection (Part E). If two rows for the same college share the
// same event_type + application_round but disagree on event_date, and at
// least one came from an automatically-discovered or family-entered official
// source, flag it rather than silently pick one. Purely a same-student, same-
// college comparison, never compares across families.
// ---------------------------------------------------------------------------
export function detectConflicts(studentId, collegeId) {
  const rows = collegeId
    ? db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? AND college_id=?").all(studentId, collegeId)
    : db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=?").all(studentId);
  // Group by program_label too, a college can legitimately have two
  // different dates for the same event_type + round (e.g. CMU's Schools of
  // Drama/Music use a Dec 1 Regular Decision deadline instead of the main
  // Jan 4 one). Without program_label in the key, that legitimate variation
  // reads as a false "conflict" between two rows that were never meant to
  // agree in the first place.
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.college_id || r.college_name || "?"}::${r.event_type}::${r.application_round || ""}::${r.program_label || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const conflicts = [];
  for (const [key, group] of groups.entries()) {
    const distinctDates = new Set(group.map((r) => (r.event_date || "").trim()).filter(Boolean));
    if (distinctDates.size > 1) {
      conflicts.push({
        key, collegeId: group[0].college_id, collegeName: group[0].college_name,
        eventType: group[0].event_type, applicationRound: group[0].application_round,
        events: group.map((r) => ({ eventId: r.event_id, eventDate: r.event_date, sourceUrl: r.source_url, lastChecked: r.last_checked, verificationStatus: r.verification_status })),
        notice: "Conflicting official dates found. Verify manually before relying on this deadline.",
      });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Summaries (Parts D, H, I). Read-only aggregation, never invents anything
// beyond what's already stored.
// ---------------------------------------------------------------------------
function isVerified(row) {
  return row.verification_status === "Official source verified" || row.verification_status === "User verified";
}

export function buildCollegeTimelineSummary(studentId, collegeId) {
  const rows = db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=? AND college_id=? ORDER BY event_type").all(studentId, collegeId);
  const conflicts = detectConflicts(studentId, collegeId);
  const today = new Date();
  const withNext = rows.map((r) => {
    let iso = null;
    if (r.event_date && r.event_date !== "Rolling") {
      const md = extractMonthDay(r.event_date) || (r.event_month_day ? { month: parseInt(r.event_month_day.slice(0, 2), 10), day: parseInt(r.event_month_day.slice(3), 10), year: r.cycle_year ? parseInt(r.cycle_year, 10) : null } : null);
      iso = nextOccurrenceIso(md, today);
    }
    return { ...r, nextOccurrenceIso: iso };
  });
  const upcomingDeadlines = withNext
    .filter((r) => DEADLINE_EVENT_TYPES.includes(r.event_type) && r.nextOccurrenceIso)
    .sort((a, b) => a.nextOccurrenceIso.localeCompare(b.nextOccurrenceIso));
  const presentTypes = new Set(rows.map((r) => r.event_type));
  const missingEventTypes = CORE_EVENT_TYPES_CHECKLIST.filter((t) => !presentTypes.has(t));
  const needsVerificationCount = rows.filter((r) => !isVerified(r)).length;

  return {
    collegeId, events: withNext, conflicts,
    earliestUpcomingDeadline: upcomingDeadlines[0] || null,
    applicationRound: upcomingDeadlines[0]?.application_round || null,
    missingEventTypes,
    needsVerificationCount,
    timelineStatus: rows.length === 0 ? "Not started" : conflicts.length > 0 ? "Needs verification" : needsVerificationCount === 0 ? "Complete" : "In progress",
  };
}

export function buildDecisionPlanTimelineSummary(studentId) {
  const savedColleges = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const promptRows = db.prepare("SELECT college_id, COUNT(*) AS n FROM essay_prompts WHERE student_id=? AND college_id IS NOT NULL GROUP BY college_id").all(studentId);
  const essayCountByCollege = new Map(promptRows.map((r) => [r.college_id, r.n]));
  const byCollege = {};
  for (const c of savedColleges) {
    const summary = buildCollegeTimelineSummary(studentId, c.college_id);
    byCollege[c.college_id] = {
      collegeName: c.college_name,
      earliestUpcomingDeadline: summary.earliestUpcomingDeadline ? { eventLabel: summary.earliestUpcomingDeadline.event_label, date: summary.earliestUpcomingDeadline.event_date, nextOccurrenceIso: summary.earliestUpcomingDeadline.nextOccurrenceIso } : null,
      applicationRound: summary.applicationRound,
      essayCount: essayCountByCollege.get(c.college_id) || 0,
      timelineStatus: summary.timelineStatus,
      missingEventTypes: summary.missingEventTypes,
      deadlinesNeedingVerification: summary.needsVerificationCount,
      hasConflicts: summary.conflicts.length > 0,
    };
  }
  return byCollege;
}

export function buildJourneyTimelineSummary(studentId) {
  const savedColleges = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const allEvents = db.prepare("SELECT * FROM college_application_timeline_events WHERE student_id=?").all(studentId);
  const today = new Date();

  const upcomingDeadlines = [];
  const eventsNeedingVerification = [];
  const collegeIdsWithEvents = new Set();
  for (const r of allEvents) {
    if (r.college_id) collegeIdsWithEvents.add(r.college_id);
    if (!isVerified(r)) eventsNeedingVerification.push({ eventId: r.event_id, collegeName: r.college_name, eventType: r.event_type, eventDate: r.event_date, verificationStatus: r.verification_status });
    if (DEADLINE_EVENT_TYPES.includes(r.event_type) && r.event_date && r.event_date !== "Rolling") {
      const md = extractMonthDay(r.event_date) || (r.event_month_day ? { month: parseInt(r.event_month_day.slice(0, 2), 10), day: parseInt(r.event_month_day.slice(3), 10), year: r.cycle_year ? parseInt(r.cycle_year, 10) : null } : null);
      const iso = nextOccurrenceIso(md, today);
      if (iso) upcomingDeadlines.push({ eventId: r.event_id, collegeName: r.college_name, eventType: r.event_type, eventLabel: r.event_label, eventDate: r.event_date, nextOccurrenceIso: iso, verificationStatus: r.verification_status });
    }
  }
  upcomingDeadlines.sort((a, b) => a.nextOccurrenceIso.localeCompare(b.nextOccurrenceIso));

  const collegesMissingTimeline = savedColleges.filter((c) => !collegeIdsWithEvents.has(c.college_id)).map((c) => ({ collegeId: c.college_id, collegeName: c.college_name }));

  return {
    upcomingDeadlines: upcomingDeadlines.slice(0, 20),
    eventsNeedingVerification: eventsNeedingVerification.slice(0, 20),
    eventsNeedingVerificationCount: eventsNeedingVerification.length,
    collegesMissingTimeline,
  };
}

// ---------------------------------------------------------------------------
// "Auto-fill official dates" (single college), the real pull. Tries the
// instant, hand-verified reference data first; if this college isn't one of
// those, automatically falls through to a live, bounded, robots.txt-aware
// crawl of the college's OWN official site (same engine as "Verify
// deadlines") so a college the family just added, including one nobody has
// hand-checked yet, still gets a real attempt at real dates, not a dead
// end. Still never invents anything: if the live pull can't confidently find
// a date on the official site, it says so honestly instead of guessing.
export async function autofillOrDiscoverTimeline(studentId, { collegeId, collegeName }) {
  const auto = autofillTimelineEvents(studentId, { collegeId, collegeName });
  if (auto.filled) {
    return {
      method: "reference", filled: true,
      collegeId, collegeName: auto.collegeName || collegeName,
      confidence: auto.confidence, eventsAdded: auto.added.length, eventsRefreshed: auto.refreshed.length,
      sourceUrl: auto.sourceUrl, lastChecked: auto.lastChecked, notice: auto.notice,
    };
  }

  try {
    const found = await findTimelineEvents(studentId, { collegeId, collegeName });
    if (found.skipped) {
      return { method: "site_search", filled: false, collegeId, collegeName, eventsAdded: 0, notice: found.reason || found.notice };
    }
    return {
      method: "site_search", filled: found.eventsFound > 0, collegeId, collegeName,
      eventsAdded: found.eventsFound, pagesChecked: found.pagesFetched, domain: found.domain, notice: found.notice,
    };
  } catch (err) {
    return { method: "site_search", filled: false, collegeId, collegeName, eventsAdded: 0, notice: `Could not check the official site: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// "Populate timelines for all my saved colleges", the same real pull as
// above, run once per saved college instead of the family clicking it
// college by college. Runs sequentially (not in parallel) to stay polite to
// each college's own server, so a long saved list can take a while, the
// caller should show a busy state.
export async function populateAllTimelines(studentId) {
  const savedColleges = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const results = [];
  let autofilledCount = 0, crawledCount = 0, notFoundCount = 0;

  for (const c of savedColleges) {
    const r = await autofillOrDiscoverTimeline(studentId, { collegeId: c.college_id, collegeName: c.college_name || c.college_id });
    if (r.method === "reference") { autofilledCount++; results.push({ ...r, method: "Auto-filled from verified reference data" }); }
    else if (r.filled) { crawledCount++; results.push({ ...r, method: "Found by searching the official site" }); }
    else { notFoundCount++; results.push({ ...r, method: "Not found" }); }
  }

  return {
    totalColleges: savedColleges.length, autofilledCount, crawledCount, notFoundCount,
    results,
    notice: "Every date added here still keeps its own source and verification status, always confirm anything marked \"Needs manual verification\" before relying on it.",
  };
}
