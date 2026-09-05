// essayCenter.js -- the "Essay Center" backend (spec Parts D-K).
//
// Scope, deliberately narrow and safety-first:
//  - Prompt TRACKING (college, platform, prompt text, word limit, deadline,
//    status) -- not essay writing. This module never generates a final essay
//    for submission and never auto-submits anything.
//  - Prompt DISCOVERY is a bounded, same-domain, robots.txt-aware crawl that
//    reuses services/programDiscovery.js's fetch/robots/link helpers rather
//    than duplicating them. It only ever surfaces sentences that literally
//    appear on an official page -- it never invents prompt text. When nothing
//    essay-shaped is found, the caller shows "Essay prompts not verified yet.
//    Check the official application portal." rather than guessing.
//  - Essay STRATEGY BY TRACK and SAMPLE STRUCTURES (exported from this file)
//    are static, generic brainstorming aids (themes, evidence to consider,
//    reflection questions, outline shapes) -- never a finished or fillable
//    essay, and never copied from any real student's successful essay.
//  - The STORY BANK lets a family record their own authentic material once
//    and reuse it across prompts; nothing here is generated on their behalf.
//
// Draft/outline metadata (draft title, outline notes, story angle) lives
// directly on essay_prompts rather than a separate "essay_drafts_metadata"
// table -- one row per prompt already needs exactly one set of these fields,
// so a second table would only add a join with no benefit. Essay-related
// to-dos are tracked through the existing application_tasks table (task_type
// "essay_research"), not a new "essay_tasks" table, for the same reason the
// Applications/Decision Plan overlap was fixed earlier: two tables tracking
// the same kind of to-do drift out of sync.
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import { getCollegeById } from "./scorecard.js";
import {
  fetchPage, isAllowedByRobots, extractLinks, isSameOfficialDomain,
  sleep, hostOf, splitSentences, isPdfUrl,
} from "./programDiscovery.js";
import { DEADLINE_EVENT_TYPES } from "./applicationTimeline.js";

function newId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return Date.now(); }

export const ESSAY_STATUSES = ["Not started", "Brainstorming", "Outline", "Drafting", "Needs review", "Final", "Submitted"];
export const ESSAY_TYPES = [
  "Common App main essay", "Coalition essay", "UC Personal Insight Question",
  "College-specific supplemental essay", "Honors / scholarship essay",
  "Major / program-specific essay", "Other",
];
export const YNU = ["Yes", "No", "Unknown"];

// Previous-Year Essay Prompt Archive (Part A/B) -- an explicit classification
// separate from the free-text prompt_cycle label ("2026-2027") so the UI can
// group/warn without parsing that string. Never inferred automatically for a
// discovered prompt beyond "Unknown" -- the family (or a deliberate "save as
// previous-year" action) is what sets Current/Previous.
export const CYCLE_TYPES = ["Current cycle", "Previous cycle", "Unknown"];
export const PREVIOUS_YEAR_PROMPT_WARNING =
  "Previous-year prompts are useful for planning, but they may change. Always confirm the current application cycle in the official college application portal.";
export const PROMPTS_NOT_VERIFIED_NOTICE = "Essay prompts not verified yet. Check the official application portal.";

// A single, family-facing rollup status for a prompt -- one badge to look at
// instead of cross-referencing cycle_type + verification_status by hand.
// Auto-computed by derivePromptStatus() below on insert/update whenever the
// caller doesn't explicitly set one (e.g. a family member editing "Notes"
// shouldn't silently change this); never a second source of truth that can
// drift from cycle_type/verification_status -- it is always recomputed from
// them unless a manual value ("User entered") is explicitly requested.
export const PROMPT_STATUSES = [
  "Current-cycle verified", "Previous-year prompt", "Needs manual verification",
  "Unknown", "Outdated / needs recheck", "User entered",
];

// Where a stored prompt's text actually came from -- distinguishes a
// college's own official page from a shared-platform prompt (Common App,
// UC, Coalition) from a family's own manual entry, so the dashboard can
// explain *why* something is trusted (or isn't) at a glance.
export const PROMPT_SOURCE_TYPES = [
  "Official college admissions site", "Official honors/scholarship page", "Official special-program page",
  "Common App platform prompt", "UC system platform prompt", "Coalition/Scoir platform prompt",
  "Third-party (unverified)", "User entered",
];

// Computes the family-facing PROMPT_STATUSES value from the two things that
// actually drive it (cycle_type, verification_status) -- called on every
// insert/update in this service and in the routes layer so prompt_status
// never has to be set by hand except for a genuine manual entry ("User
// entered", which the family/route sets explicitly and this function leaves
// alone).
export function derivePromptStatus({ cycleType, verificationStatus, manual }) {
  if (manual) return "User entered";
  if (verificationStatus === "Outdated / needs recheck") return "Outdated / needs recheck";
  if (cycleType === "Previous cycle") return "Previous-year prompt";
  if (cycleType === "Current cycle" && (verificationStatus === "Official source verified" || verificationStatus === "User verified")) {
    return "Current-cycle verified";
  }
  if (!verificationStatus || verificationStatus === "Needs manual verification") return "Needs manual verification";
  if (!cycleType || cycleType === "Unknown") return "Unknown";
  return "Needs manual verification";
}

// ---------------------------------------------------------------------------
// ESSAY_PROMPT_AUTOFILL_PROFILES -- hand-verified essay prompts for specific
// colleges, checked directly against the college's own official application
// page (or, where that page was stale, cross-checked against multiple
// independent current-cycle sources -- see each entry's notes). Mirrors
// TIMELINE_AUTOFILL_PROFILES in deadlineSeed.js: tried first for instant,
// sourced results; "Find prompts" (the live crawl below) is always the
// fallback for any college not listed here. Never a guess -- if wording is
// uncertain, the entry says so and points to the official portal.
// ---------------------------------------------------------------------------
export const ESSAY_PROMPT_AUTOFILL_PROFILES = [
  {
    key: "columbia", re: /\bcolumbia university\b/i, collegeName: "Columbia University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-20",
    sourceUrl: "https://undergrad.admissions.columbia.edu/apply/process/columbia-questions",
    notes: "Columbia's own \"Columbia-Specific Questions\" page was still showing a stale \"2023-2024\" cycle label (5 questions, no question about engaging with differing perspectives) when checked directly on 2026-07-20 -- the same staleness pattern already seen on Columbia's deadlines page. The 6-question list below adds that question and matches multiple independent sources for the current cycle, cross-checked the same day (selectiveadmissions.com, College Essay Guy, Ivy Coach, PrepMaven, AdmissionSight). Wording for the other five is close to but not word-for-word identical between the official (stale) page and current-cycle third-party sources -- confirm exact current wording on Columbia's own application portal once logged in before finalizing any essay.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "List a selection of texts, resources and outlets that have contributed to your intellectual development outside of academic courses, including but not limited to books, journals, websites, podcasts, essays, plays, presentations, videos, museums and other content that you enjoy.", wordLimit: "100 words or fewer" },
      { essayType: "College-specific supplemental essay", promptText: "Tell us about an aspect of your life so far or your lived experience that is important to you, and describe how it has shaped the way you would learn from and contribute to Columbia's multidimensional and collaborative environment.", wordLimit: "150 words or fewer" },
      { essayType: "College-specific supplemental essay", promptText: "At Columbia, students representing a wide range of perspectives are invited to live and learn together. How do you engage with people whose perspectives differ from your own?", wordLimit: "150 words or fewer" },
      { essayType: "College-specific supplemental essay", promptText: "In college/university, students are often challenged in ways they could not have anticipated. Please describe a barrier or obstacle you have faced and discuss the personal qualities, skills or insights you have developed as a result.", wordLimit: "150 words or fewer" },
      { essayType: "College-specific supplemental essay", promptText: "Why are you interested in attending Columbia University? We encourage you to consider the aspect(s) that you find unique and compelling about Columbia.", wordLimit: "150 words or fewer" },
      { essayType: "College-specific supplemental essay", promptText: "What attracts you to your preferred areas of study at Columbia College or Columbia Engineering?", wordLimit: "150 words or fewer" },
    ],
  },
  {
    key: "mit", re: /\bmassachusetts institute of technology\b|^mit$/i, collegeName: "Massachusetts Institute of Technology",
    confidence: "verified", lastChecked: "2026-07-20",
    sourceUrl: "https://mitadmissions.org/apply/firstyear/essays-activities-academics/",
    notes: "Read directly from MIT's own \"Essays, activities & academics\" page on 2026-07-20, for the 2026-2027 application. MIT does not use the Common App essay or any shared-platform prompts -- these are MIT's own short-answer questions, required in addition to the (also MIT-specific) activities list and self-reported coursework form.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "What field of study appeals to you the most right now? (Note: Applicants select from a drop-down list.) Reflect on what has led you to this interest.", wordLimit: "approximately 100-200 words" },
      { essayType: "College-specific supplemental essay", promptText: "While some reach their goals following well-trodden paths, others blaze their own trails achieving the unexpected. In what ways have you done something different than what was expected in your educational journey?", wordLimit: "approximately 100-200 words" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on how your personal and academic experiences have influenced the types of problems you would want to tackle with an MIT education, and who you would like to work on those problems with.", wordLimit: "approximately 100-200 words" },
      { essayType: "College-specific supplemental essay", promptText: "How did you manage a situation or challenge that you didn't expect? What did you learn from it?", wordLimit: "approximately 100-200 words" },
      { essayType: "College-specific supplemental essay", promptText: "What do you do just for fun?", wordLimit: "40-50 words" },
      { essayType: "College-specific supplemental essay", promptText: "Who is someone you admire, whether you know them personally or look up to them from afar? Tell us why.", wordLimit: "40-50 words" },
      { essayType: "College-specific supplemental essay", promptText: "What's a topic, academic or non-academic, that you could talk about for hours?", wordLimit: "40-50 words" },
      { essayType: "College-specific supplemental essay", promptText: "MIT values both \"generalists\" with varied interests and \"specialists\" who focus deeply on one or a few passions. Which do you think best describes you, and why?", wordLimit: "40-50 words" },
    ],
  },

  {
    key: "ucberkeley", re: /\buniversity of california,? berkeley\b|\bberkeley\b/i, collegeName: "University of California, Berkeley",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.berkeley.edu/apply-to-berkeley/application-resources/personal-insight-questions/",
    notes: "Confirmed directly on Berkeley's own admissions site (and cross-checked against UCLA, UCSD, UC Davis, UC Irvine, and UC Santa Barbara's own sites the same day): none of the UC campuses have a campus-specific supplemental essay. All UC applicants answer 4 of the 8 shared systemwide Personal Insight Questions, which this app attaches automatically once the application platform is set to \"UC Application\" -- no additional Berkeley-only essay exists.",
    prompts: [],
  },
  {
    key: "ucla", re: /\buniversity of california,? los angeles\b|\bucla\b/i, collegeName: "University of California, Los Angeles",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.ucla.edu/apply/personal-insight-questions",
    notes: "Confirmed directly on UCLA's own admissions site: no UCLA-specific essay exists. UCLA's page points applicants back to the shared UC systemwide Personal Insight Questions (4 of 8, 350 words each), which this app attaches automatically once the application platform is set to \"UC Application.\"",
    prompts: [],
  },
  {
    key: "ucsd", re: /\buniversity of california,? san diego\b|\bucsd\b|\buc san diego\b/i, collegeName: "University of California, San Diego",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.ucsd.edu/first-year/application-requirements.html",
    notes: "Confirmed directly on UCSD's own admissions site: no UCSD-specific essay exists, only the shared UC systemwide Personal Insight Questions (4 of 8, 350 words each), attached automatically once the application platform is set to \"UC Application.\"",
    prompts: [],
  },
  {
    key: "ucdavis", re: /\buniversity of california,? davis\b|\buc davis\b/i, collegeName: "University of California, Davis",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.ucdavis.edu/admissions/undergraduate/apply/personal-insight-questions",
    notes: "Confirmed directly on UC Davis's own admissions site: no Davis-specific essay exists, only the shared UC systemwide Personal Insight Questions (4 of 8, 350 words each), attached automatically once the application platform is set to \"UC Application.\"",
    prompts: [],
  },
  {
    key: "ucirvine", re: /\buniversity of california,? irvine\b|\buc irvine\b/i, collegeName: "University of California, Irvine",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.uci.edu/apply/first-year-students/index.php",
    notes: "Confirmed directly on UC Irvine's own admissions site: no UCI-specific essay exists, only the shared UC systemwide Personal Insight Questions (4 of 8, 350 words each), attached automatically once the application platform is set to \"UC Application.\"",
    prompts: [],
  },
  {
    key: "ucsb", re: /\buniversity of california,? santa barbara\b|\bucsb\b|\buc santa barbara\b/i, collegeName: "University of California, Santa Barbara",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.sa.ucsb.edu/how-to-apply",
    notes: "Confirmed directly on UCSB's own admissions site: no UCSB-specific essay exists, only the shared UC systemwide Personal Insight Questions (4 of 8, 350 words each), attached automatically once the application platform is set to \"UC Application.\"",
    prompts: [],
  },
  {
    key: "uw", re: /\buniversity of washington\b/i, collegeName: "University of Washington",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admit.washington.edu/apply/first-year/how-to-apply/writing-section/",
    notes: "Confirmed directly on UW's own admissions site: UW switched to Common-App-only (it no longer accepts the Coalition App) and does NOT require a separate UW-specific essay. The required essay is simply the standard Common App personal essay (650 words, 7 prompts), which this app attaches automatically once the platform is set to Common App, plus two Common-App-native OPTIONAL sections (250-word \"Challenges and Circumstances,\" 300-word \"Additional Information\") that are not UW-specific either. A UW Honors Program applicant must also submit a separate Honors-specific essay, but its exact current wording could not be verified on an official page this session -- check the Honors Program application directly. Some UW page text still shows prior-cycle labels (\"autumn 2025-26\"); recheck in Aug-Sept 2026 once UW refreshes its pages for the new cycle, though the core no-supplement finding is unlikely to change.",
    prompts: [],
  },
  {
    key: "usc", re: /\buniversity of southern california\b|^usc$/i, collegeName: "University of Southern California",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.usc.edu/prospective-students/how-to-apply/first-year-students/",
    notes: "USC delivers its actual essay prompts only inside the logged-in Common App portal (USC-specific member questions), not as standalone text on admission.usc.edu -- the wording below is cross-checked across multiple independent essay-prompt trackers (Ivy Coach, AdmissionSight, GradGPT) that report identical text for the 2025-26 cycle, but GradGPT (updated July 2026) explicitly flags that prompts are \"not yet officially confirmed for the 2026-27 cycle.\" Treat this as the current best-known pattern, not a confirmed-current official quote -- verify directly inside the Common App before finalizing an essay. Some USC schools (Dornsife, Viterbi, Marshall) also have their own optional supplemental essays not included here.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Describe how you plan to pursue your academic interests and why you want to explore them at USC specifically. Please feel free to address your first- and second-choice major selections.", wordLimit: "approximately 250 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Starting with the beginning of high school/secondary school, if you have had a gap where you were not enrolled in school during a fall or spring term, please address this gap in your educational history. You do not need to address a summer break.", wordLimit: "approximately 250 words", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Describe yourself in three words", wordLimit: "3 one-word answers", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What is your favorite snack?", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Best movie of all time:", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Dream job:", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "If your life had a theme song, what would it be?", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Dream trip:", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What TV show will you binge watch next?", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Which well-known person or fictional character would be your ideal roommate?", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Favorite book:", wordLimit: "100 characters", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "If you could teach a class on any topic, what would it be?", wordLimit: "100 characters", required: "Yes" },
    ],
  },
  {
    key: "asu", re: /\barizona state university\b|^asu$/i, collegeName: "Arizona State University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.asu.edu/apply/first-year/admission",
    notes: "General ASU admission is confirmed directly (quote): \"ASU does not have a preference for which application you use to apply, and we do not require an essay or personal statement for either of these options.\" The 3 prompts below are ONLY for Barrett, The Honors College's separate application (choose 1 of 3) -- Barrett's own page states prompts \"can change from year to year,\" and the Fall 2027 Barrett application does not open until September 9, 2026, so these are the last-confirmed set (verified through at least the 2024-25/2025-26 cycles), not guaranteed for the cycle that opens this September. Reconfirm once Barrett's Fall 2027 application opens.",
    prompts: [
      { essayType: "Honors / scholarship essay", promptText: "Barrett's core values are Community and Belonging, Leadership and Agency, and Courage and Curiosity. All three pairs are important to who we are, but which of these couplings most resonate with you and why? In answering the why, be specific by reflecting on both your lived experiences and the ways Barrett will be foundational to your time at ASU and beyond.", wordLimit: "300-500 words", required: "No" },
      { essayType: "Honors / scholarship essay", promptText: "Briefly tell us about something you enjoy and why. This can be an organized activity or something you informally pursue in your free time. The bulk of your essay should then be spent speaking to how this interest makes you a good fit for Barrett (not college in general, but specifically the honors experience at ASU).", wordLimit: "300-500 words", required: "No" },
      { essayType: "Honors / scholarship essay", promptText: "Barrett students complete a thesis as the culmination of their honors college experience. In an essay of no more than 250 words, share your thoughts on the value of this capstone project to your educational goals. Please be specific and include any ideas you have for a possible topic.", wordLimit: "no more than 250 words", required: "No" },
    ],
  },
  {
    key: "michigan", re: /\buniversity of michigan\b/i, collegeName: "University of Michigan",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.umich.edu/apply/first-year-applicants/essay-questions",
    notes: "Read directly from Michigan's own essay-questions page. Two required essays; a third, optional 300-word \"Challenges and Circumstances\" essay also exists but is not counted toward the 2 required.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "At the University of Michigan, we are focused on developing leaders and citizens who will challenge the present and enrich the future. In your essay, share with us how you are prepared to contribute to these goals. This could include the people, places, experiences, or aspirations that have shaped your journey and future plans.", wordLimit: "100-300 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Describe the unique qualities that attract you to the specific undergraduate college or school (including preferred admission and dual degree programs) to which you are applying at the University of Michigan. How would that curriculum support your interests?", wordLimit: "100-550 words", required: "Yes" },
    ],
  },
  {
    key: "purdue", re: /\bpurdue university\b/i, collegeName: "Purdue University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.purdue.edu/become-student/guide/",
    notes: "Read directly from Purdue's application guide page (last modified June 2026). Two essays required of all applicants; two more required only for John Martinson Honors College applicants.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "How will opportunities at Purdue support your interests, both in and out of the classroom?", wordLimit: "250 words or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Briefly discuss your reasons for choosing your major and your interest in studying at this campus location (Indianapolis or West Lafayette).", wordLimit: "250 words or fewer", required: "Yes" },
      { essayType: "Honors / scholarship essay", promptText: "Explain your vision, ideas or goals for how you hope to shape your honors experience while at Purdue. Please put this in the context of the four pillars which are the foundation of the John Martinson Honors College.", wordLimit: "500 words or fewer", required: "No" },
      { essayType: "Honors / scholarship essay", promptText: "Please describe the interdisciplinary nature of your chosen field of study and how it complements or supports other fields. (Example: You might describe how your work in a liberal arts career may impact or inform the work of an engineer.)", wordLimit: "500 words or fewer", required: "No" },
    ],
  },
  {
    key: "osu", re: /\bohio state university\b|^osu$/i, collegeName: "Ohio State University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://undergrad.osu.edu/apply/freshmen-columbus/common-app",
    notes: "Confirmed directly: Ohio State requires only the standard Common App personal essay (attached automatically once the platform is set to Common App), plus non-essay Ohio State-specific questions (preferred admission plan, fee waiver, major, pre-professional interest, alternate campus, Honors/Scholars interest, Morrill Scholarship interest) -- no additional Ohio-State-specific essay exists for general admission. Morrill Scholarship Program applicants only must also write a separate MSP essay, outside the general application.",
    prompts: [],
  },
  {
    key: "wisconsin", re: /\buniversity of wisconsin.madison\b|\buw.madison\b/i, collegeName: "University of Wisconsin-Madison",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.wisc.edu/essays/",
    notes: "Read directly from UW-Madison's own essays page. The first essay is required of every applicant regardless of platform. The second essay is required ONLY for applicants using the Universities of Wisconsin Application directly (not Common App, since Common App's own personal essay substitutes for it).",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Tell us why you would like to attend the University of Wisconsin-Madison. In addition, please include why you are interested in studying the major(s) you have selected. If you selected undecided, please describe your areas of possible academic interest.", wordLimit: "max 650 words (site recommends 300-500)", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Each student is unique. Please tell us about the particular life experiences, talents, commitments, and/or interests you will bring to our campus.", wordLimit: "max 650 words", required: "No" },
    ],
  },
  {
    key: "pennstate", re: /\bpennsylvania state university\b|\bpenn state\b/i, collegeName: "Pennsylvania State University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.psu.edu/admission/undergraduate/how-to-apply",
    notes: "Confirmed directly: Common App's own official partner listing for Penn State states \"No personal essay required - First Year.\" Penn State has no required essay of any kind; an optional personal statement exists (it would become the \"Penn State Personal Statement\" if submitted), but its exact current wording is not published on any live psu.edu page -- it appears only inside the login-gated MyPennState application. Not reproducing third-party-quoted wording that couldn't be verified against an official source.",
    prompts: [],
  },
  {
    key: "maryland", re: /\buniversity of maryland\b/i, collegeName: "University of Maryland, College Park",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.umd.edu/apply/essay-questions",
    notes: "Read directly from Maryland's own essay-questions page. Choose exactly 1 of these 7 prompts -- do not write all 7. Required regardless of application platform (Common App or Coalition).",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.", wordLimit: "no more than 650 words -- choose 1 of 7", required: "No" },
    ],
  },
  {
    key: "casewestern", re: /\bcase western reserve university\b/i, collegeName: "Case Western Reserve University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://case.edu/admission/apply/deadlines-and-requirements",
    notes: "Confirmed directly (page timestamped July 8, 2026), quote: \"All first-year students must complete an essay via the Common App or Coalition with Scoir. What you share in your essay is completely up to you.\" No CWRU-specific general essay exists -- the shared Common App/Coalition main essay covers it. A separate Arts Supplement essay exists, required only for music/music-education majors and Arts Achievement Scholarship (music/art studio) applicants, optional for everyone else, due 15 days after the application deadline via the applicant portal -- exact prompt text not published on the general requirements page.",
    prompts: [],
  },
  {
    key: "coloradoboulder", re: /\buniversity of colorado boulder\b|\bcu boulder\b/i, collegeName: "University of Colorado Boulder",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.colorado.edu/admissions/process/first-year/apply",
    notes: "Read directly from CU Boulder's own apply page. This is in addition to (not instead of) the standard Common App personal essay, which this app attaches automatically once the platform is set to Common App.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "What do you hope to study, and why, at CU Boulder? Or if you don't know quite yet, think about your studies so far, extracurricular/after-school activities, jobs, volunteering, future goals or anything else that has shaped your interests.", wordLimit: "250 words", required: "Yes" },
    ],
  },
  {
    key: "ufl", re: /\buniversity of florida\b/i, collegeName: "University of Florida",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.ufl.edu/apply/freshman/",
    notes: "Confirmed directly: general UF admission has no essay beyond the standard Common App personal essay plus a UF Supplement described only as \"a few additional short-answer questions\" (not a general essay). UF's Honors Program and Innovation Academy both confirmed to require an ADDITIONAL essay for students opting into those programs, but exact current wording is not published on any UF-controlled page -- it's visible only inside the live Common App form once that program is selected. Not reproducing third-party-quoted wording that couldn't be verified against an official source.",
    prompts: [],
  },
  {
    key: "nyu", re: /\bnew york university\b|^nyu$/i, collegeName: "New York University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://meet.nyu.edu/advice/application-tips/your-guide-to-the-nyu-supplemental-essay/",
    notes: "Sourced from NYU's own official admissions blog (written by an NYU Assistant Director of Admissions), explicitly titled \"2025-26 NYU Supplemental Essay Question\" (published Aug 2025) -- the 2026-27 refresh was not yet published as of this check (July 2026). NYU typically republishes a fresh guide each August, and this exact prompt has a strong track record of reuse, but it is not yet confirmed current. Recheck in August 2026.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "We are looking for students who want to be bridge builders-students who can connect people, groups, and ideas to span divides, foster understanding, and promote collaboration within a dynamic, interconnected, and vibrant global academic community. We are eager for you to tell us how your experiences have helped you understand what qualities and efforts are needed to bridge divides so that people can better learn and work together. Please consider one or more of the following questions in your essay: Tell us about a time you encountered a perspective different from your own. What did you learn-about yourself, the other person, or the world? Or, tell us about an experience you've had working with others who have different backgrounds or perspectives. What challenges did your group face? Did you overcome them, and if so, how? What role did you try to play in helping people to work together, and what did you learn from your efforts? Or, tell us about someone you've observed who does a particularly good job helping people think or work together. How does this person set the stage for common exploration or work? How do they react when difficulties or dissensions arise?", wordLimit: "250 words or less", required: "Yes" },
    ],
  },
  {
    key: "northeastern", re: /\bnortheastern university\b/i, collegeName: "Northeastern University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.northeastern.edu/application-information/first-year-applicants/",
    notes: "Confirmed directly: Northeastern's official first-year requirements checklist lists only the Common/Coalition App, recommendations, transcripts, optional testing, and English proficiency -- no Northeastern-specific essay appears anywhere.",
    prompts: [],
  },
  {
    key: "bu", re: /\bboston university\b/i, collegeName: "Boston University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.bu.edu/admissions/apply/first-year/application-credentials/",
    notes: "Confirmed directly that BU DOES require its own writing-supplement essay in addition to the Common App main essay (official quote: \"Essays: You must submit two essays in the space provided on the Common Application\"). However, BU's own site does not publish the literal supplement prompt text -- it lives inside the Common App's BU-specific \"Writing Supplement,\" viewable only with an active application. Multiple third-party sources describe a choice between two ~300-word prompts (a social/community issue, or what excites you about being a BU student), but this could not be confirmed from an official source, so exact wording is not reproduced here. Kilachand Honors College applicants complete an additional required essay if opting into that program. Check the official application portal for exact current wording.",
    prompts: [],
  },
  {
    key: "rpi", re: /\brensselaer polytechnic institute\b|^rpi$/i, collegeName: "Rensselaer Polytechnic Institute",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://undergrad.admissions.rpi.edu/apply",
    notes: "Read directly from RPI's own apply page, labeled \"Application Options - Fall 2027.\" Official quote: \"The general essay/personal statement submitted with your application satisfies RPI's essay requirements,\" except for 5 specific programs, each requiring one additional program-specific essay (no stated word limit on the page).",
    prompts: [
      { essayType: "Major / program-specific essay", promptText: "State your reasons for aspiring to a career in medicine.", wordLimit: "not specified", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "State your reasons for choosing architecture as your profession.", wordLimit: "not specified", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "Discuss your interests in the field of electronic arts, and state how this is reflected in your portfolio, if one has been submitted.", wordLimit: "not specified", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "State your reasons for choosing the field of games and simulation arts and sciences, making reference to your portfolio if one has been submitted.", wordLimit: "not specified", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "Describe your interest in the music major and your goals. Please include completed course work in music, private music instruction, musical performance and production experience, or completed independent projects.", wordLimit: "not specified", required: "No" },
    ],
  },
  {
    key: "wpi", re: /\bworcester polytechnic institute\b|^wpi$/i, collegeName: "Worcester Polytechnic Institute",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.wpi.edu/admissions/undergraduate/apply/how-to",
    notes: "WPI's own \"How to Apply\" checklist does not explicitly list a supplemental essay, but its application-timeline page instructs applicants to \"finish up your essay\" and warns not to \"overlook questions asking why you're interested in attending a particular college,\" implying a WPI-specific writing-supplement question exists inside the Common App -- but WPI's site never states the requirement explicitly nor publishes prompt text. Could not confirm whether a required WPI-specific supplement exists, or its wording, from any official page. Check the official application portal directly.",
    prompts: [],
  },
  {
    key: "stevens", re: /\bstevens institute of technology\b/i, collegeName: "Stevens Institute of Technology",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.stevens.edu/admission-aid/undergraduate-admissions/first-year-students",
    notes: "Confirmed directly that Stevens DOES require an essay (listed as a distinct required application component), but exact current wording could not be verified from an official Stevens page. Third-party sources widely report a prompt tied to Stevens's motto \"Inspired by humanity, powered by technology\" (250-500 words), and Stevens's own marketing copy uses that exact motto phrase -- suggestive but not a confirmed direct quote of an essay prompt, so not reproduced here. Check the official application portal for exact current wording.",
    prompts: [],
  },
  {
    key: "harveymudd", re: /\bharvey mudd college\b/i, collegeName: "Harvey Mudd College",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.hmc.edu/admission/apply/first-year-students/",
    notes: "Read directly from Harvey Mudd's own first-year application checklist page (live, ED I/II deadlines Nov 15/Jan 5 for the correct upcoming cycle).",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Harvey Mudd College seeks to educate engineers, scientists, and mathematicians well versed in all of these areas and in the humanities, social sciences and the arts so that they may assume leadership in their fields with a clear understanding of the impact of their work on society. – HMC Mission Statement. \"Scientific research is a human endeavor. The choices of topics that we research are based on our biases, our beliefs, and what we bring: our cultures and our families. The kinds of problems that people put their talents to solving depends on their values.\" – Dr. Clifton Poodry. HMC's collaborative community is guided by our mission statement. Through an intentional interdisciplinary curriculum, our students seek to build a skillset adaptable to society's needs. How has your own background influenced the types of problems you want to solve, the people you want to work with, and the impact you hope your work can have?", wordLimit: "500 words or less", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Many students choose HMC because they don't want to give up their interests in the Humanities, Social Sciences and the Arts – or HSA as we call it at HMC. Briefly describe what you'd like to learn about in your dream HSA class. Your class can either be one chosen from existing classes at HMC, or you are welcome to create your own.", wordLimit: "100 words or less", required: "Yes" },
    ],
  },
  {
    key: "rosehulman", re: /\brose-hulman institute of technology\b|\brose.hulman\b/i, collegeName: "Rose-Hulman Institute of Technology",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.rose-hulman.edu/admissions-and-aid/the-application-process/application-and-deadlines/index.html",
    notes: "Confirmed directly: Rose-Hulman's official \"completed application should include\" checklist lists only application, transcript, one letter of recommendation, and fee (plus int'l docs) -- no essay of any kind is required. Page explicitly labeled for the Fall 2027 cycle.",
    prompts: [],
  },
  {
    key: "mines", re: /\bcolorado school of mines\b/i, collegeName: "Colorado School of Mines",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://undergraduate-admissions.mines.edu/first-year/",
    notes: "Read directly from Mines's own first-year page (confirmed \"Fall 2027\" cycle). Both short responses are OPTIONAL but Mines \"strongly encourages\" submitting both for best consideration -- not technically required.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "What element on the periodic table best represents you and why?", wordLimit: "not specified", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Why do you want to be an Oredigger? You can share what you want to study, your future involvement and activities, or anything else about the Mines experience that excites you.", wordLimit: "not specified", required: "No" },
    ],
  },
  {
    key: "duke", re: /\bduke university\b/i, collegeName: "Duke University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.duke.edu/apply/",
    notes: "Duke's own page explicitly states: \"The following question was required of all first-year applicants during the 2025-26 application cycle... Short-answer questions for the 2026-27 application cycle have not yet been finalized.\" The prompts below are the most recently published (2025-26) version, shown as a strong starting point -- NOT yet confirmed for the live 2026-27 cycle. Recheck this page in fall 2026 once Duke publishes final prompts. Applicants choose 1 of the 4 optional prompts in addition to the required one.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "What is your impression of Duke as a university and community, and why do you believe it is a good match for your goals, values, and interests? If there is something specific that attracts you to our academic offerings in Trinity College of Arts and Sciences or the Pratt School of Engineering, or to our co-curricular opportunities, feel free to include that, too.", wordLimit: "250 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "We believe a wide range of viewpoints and experiences is essential to maintaining Duke's vibrant living and learning community. Please share anything in this context that might help us better understand you and your potential contributions to Duke.", wordLimit: "250 words -- choose 1 of 4 optional", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Meaningful dialogue often involves respectful disagreement. Provide an example of a difference of opinion you've had with someone you care about. What did you learn from it?", wordLimit: "250 words -- choose 1 of 4 optional", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "What's the last thing that you've been really excited about?", wordLimit: "250 words -- choose 1 of 4 optional", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Duke recently launched an initiative \"to bring together Duke experts across all disciplines who are advancing artificial intelligence (AI) research, addressing the most pressing ethical challenges posed by AI, and shaping the future of AI in the classroom\" (ai.duke.edu). Tell us about a situation when you would or would not choose to use AI (when possible and permitted). What shapes your thinking?", wordLimit: "250 words -- choose 1 of 4 optional", required: "No" },
    ],
  },
  {
    key: "northwestern", re: /\bnorthwestern university\b/i, collegeName: "Northwestern University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.northwestern.edu/apply/requirements.html",
    notes: "Read directly from Northwestern's own page, explicitly headed \"Northwestern 2026-27 First-Year Writing Supplements.\" One required essay (optional for QuestBridge applicants); 5 additional optional prompts, of which applicants are encouraged to answer 1-2.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "We want to be sure we're considering your application in the context of your personal experiences: What aspects of your background (your identity, your school setting, your community, your household, etc.) have most shaped how you see yourself engaging in Northwestern's community, be it academically, extracurricularly, culturally, politically, socially, or otherwise?", wordLimit: "300 words or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Painting \"The Rock\" is a tradition at Northwestern that invites all forms of expression-students promote campus events or extracurricular groups, support social or activist causes, show their Wildcat spirit (what we call \"Purple Pride\"), celebrate their culture, and more. What would you paint on The Rock, and why?", wordLimit: "fewer than 200 words -- optional, 1-2 of 5 encouraged", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Northwestern fosters a distinctively interdisciplinary culture. We believe discovery and innovation thrive at the intersection of diverse ideas, perspectives, and academic interests. Within this setting, if you could dream up an undergraduate class, research project, or creative effort (a start-up, a design prototype, a performance, etc.), what would it be? Who might be some ideal classmates or collaborators?", wordLimit: "fewer than 200 words -- optional, 1-2 of 5 encouraged", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Community and belonging matter at Northwestern. Tell us about one or more communities, networks, or student groups you see yourself connecting with on campus.", wordLimit: "fewer than 200 words -- optional, 1-2 of 5 encouraged", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Northwestern's location is special: on the shore of Lake Michigan, steps from downtown Evanston, just a few miles from Chicago. What aspects of our location are most compelling to you, and why?", wordLimit: "fewer than 200 words -- optional, 1-2 of 5 encouraged", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Northwestern is a place where people with diverse backgrounds from all over the world can study, live, and talk with one another. This range of experiences and viewpoints immeasurably enriches learning. How might your individual background contribute to this diversity of perspectives in Northwestern's classrooms and around our campus?", wordLimit: "fewer than 200 words -- optional, 1-2 of 5 encouraged", required: "No" },
    ],
  },
  {
    key: "jhu", re: /\bjohns hopkins university\b/i, collegeName: "Johns Hopkins University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/",
    notes: "JHU's page section is explicitly headed \"2025-2026 Supplemental Essay Prompt,\" and the deadlines table on the same page still lists the PRIOR cycle's dates (ED I Nov 1 2025 / RD Jan 2 2026) despite page metadata showing a June 29, 2026 edit -- strongly suggesting JHU has not yet published 2026-27 content. Shown as the most recently published version; recheck in August 2026 once JHU posts updated dates/essay for the new cycle.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Tell us about an important first in your life-big or small-that has shaped you.", wordLimit: "350-word limit", required: "Yes" },
    ],
  },
  {
    key: "rice", re: /\brice university\b/i, collegeName: "Rice University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.rice.edu/apply/first-year-domestic-applicants",
    notes: "Read directly from Rice's own page, explicitly labeled \"Essay Prompts (2026-2027).\" Two short essays are always required; then choose 1 of 2 longer prompts about the residential college system. Architecture applicants have two additional required essays not listed here (250 words each, about architecture specifically). \"The Box\" (an uploaded image) is also part of the application but is non-evaluative and has no text prompt.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Please explain what draws you to the academic areas you selected above and how you hope to explore them at Rice University.", wordLimit: "150 word limit", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Based upon your exploration of Rice University, what elements of the Rice experience appeal to you?", wordLimit: "150 word limit", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "The Residential College System is at the heart of Rice student life and is heavily influenced by the particular cultural traditions and unique life experiences each student brings. What life experiences and/or unique perspectives are you looking forward to sharing with fellow Owls in the residential college system?", wordLimit: "500 word limit -- choose 1 of 2", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Rice is strengthened by its diverse community of learning and discovery that produces leaders and change agents across the spectrum of human endeavor. What perspectives shaped by your background, experiences, upbringing, and/or cultural identity inspire you to join our community of change agents at Rice?", wordLimit: "500 word limit -- choose 1 of 2", required: "No" },
    ],
  },
  {
    key: "vanderbilt", re: /\bvanderbilt university\b/i, collegeName: "Vanderbilt University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.vanderbilt.edu/apply/personal-essay-and-short-answer-prompts/",
    notes: "Read directly from Vanderbilt's own personal-essay-and-short-answer-prompts page (live, footer copyright 2026, no \"not yet finalized\" caveat), but the prompt itself carries no explicit cycle-year label the way Rice's or Northwestern's do. Likely current but recommend a follow-up check closer to the application opening in August 2026.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Vanderbilt University's motto, Crescere aude, is Latin for \"dare to grow.\" In your response, reflect on how one or more aspects of your identity, culture, or background has played a role in your personal growth, and how it will contribute to our campus community as you dare to grow at Vanderbilt.", wordLimit: "approximately 250 words", required: "Yes" },
    ],
  },
  {
    key: "utaustin", re: /\buniversity of texas at austin\b|\but austin\b/i, collegeName: "University of Texas at Austin",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.utexas.edu/apply/application-materials/essays-and-short-answers/",
    notes: "Read directly from UT Austin's own essays-and-short-answers page (last modified January 7, 2026). UT requires its own short-answer questions regardless of application platform (ApplyTexas or Common App); the Common App personal essay, where used, satisfies UT's essay requirement separately.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Why are you interested in the major you indicated as your first-choice major?", wordLimit: "no more than 40 lines, about 250-300 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Think of all the activities - both in and outside of school - that you have been involved with during high school. Which one are you most proud of and why?", wordLimit: "no more than 40 lines, about 250-300 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Please share background on events or special circumstances that you feel may have impacted your high school academic performance.", wordLimit: "no more than 40 lines, about 250-300 words", required: "No" },
    ],
  },
  {
    key: "tamu", re: /\btexas a&m university\b|\btexas a & m\b/i, collegeName: "Texas A&M University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.tamu.edu/apply/freshman/index.html",
    notes: "Read directly from Texas A&M's own freshman apply page (last modified July 6, 2026; deadlines table explicitly lists the Fall 2027 cycle). Six essays are required; one additional essay is optional.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Tell us your story. What unique opportunities or challenges have you experienced throughout your high school career that have shaped who you are today?", wordLimit: "750 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Describe a life event which you feel has prepared you to be successful in college.", wordLimit: "250 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "In a few words, what are some of your life goals and objectives?", wordLimit: "100 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "In a few words, why have you chosen your academic major(s)?", wordLimit: "100 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "We know you have a lot of options. In a few words, why did you choose to apply to Texas A&M?", wordLimit: "100 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Briefly describe any educational plans you have beyond earning your bachelor's degree.", wordLimit: "100 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Are there experiences or opportunities that have shaped or influenced your abilities or academic record, which you have not already written about?", wordLimit: "250 words max", required: "No" },
    ],
  },
  {
    key: "vatech", re: /\bvirginia tech\b|\bvirginia polytechnic\b/i, collegeName: "Virginia Tech",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.vt.edu/admissions/undergraduate/apply/ut-prosim-short-answer-questions.html",
    notes: "Page is explicitly titled \"Ut Prosim Profile: 2025-2026 Short Answer Questions,\" and the companion freshman-requirements page states \"Information current as of July 2025\" -- Virginia Tech has not yet published 2026-27 cycle prompts as of this check. Virginia Tech requires no personal statement; instead all 4 of these \"Ut Prosim Profile\" questions are required regardless of the optional Common App essay. Recheck closer to the application opening.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Virginia Tech's motto is \"Ut Prosim\" which means 'That I May Serve'. Share how you contribute to a community that is important to you. How long have you been involved? What have you learned and how would you like to share that with others at Virginia Tech?", wordLimit: "120 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Virginia Tech's Principles of Community supports access and inclusion by affirming the dignity and value of every person, respecting differences, promoting mutual understanding and open expression, and strives to eliminate bias and discrimination. Have you had an experience when you or someone you know were not being included? Did you reach out to anyone for assistance, direction, or resources? Were you able to affect change and/or influence others? Did this experience change your perspective and if so, how?", wordLimit: "120 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Share a time when you were most proud of yourself either as a role model or when you displayed your leadership. What specific skills did you contribute to the experience? How did others rely on you for guidance? What did you learn about yourself during this time?", wordLimit: "120 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Describe a goal that you have set and the steps you will take to achieve it. What made you set this goal for yourself? What is your timeline to achieve this goal? Who do you seek encouragement or guidance from and how do they support your progress as you work on this goal?", wordLimit: "120 words", required: "Yes" },
    ],
  },
  {
    key: "ncstate", re: /\bnorth carolina state university\b|\bnc state\b/i, collegeName: "North Carolina State University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.ncsu.edu/apply/first-year/",
    notes: "Read directly from NC State's own first-year apply page (live, footer copyright 2026, deadlines consistent with the 2026-27 cycle), but the short-answer prompt carries no explicit cycle-year label, so it cannot be 100% confirmed unchanged from prior years; NC State's own page also does not state a word limit for it (third-party sources cite ~250 words -- unconfirmed, not used here). This is in addition to the standard Common App essay, attached automatically once the platform is set to Common App. University Honors Program applicants must also submit one additional required essay (≤600 words) -- exact prompt text not shown on this page.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Explain why you selected the academic program(s) above and why you are interested in studying these at NC State.", wordLimit: "not specified on the official page", required: "Yes" },
    ],
  },

  {
    key: "caltech", re: /\bcalifornia institute of technology\b|\bcaltech\b/i, collegeName: "California Institute of Technology",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.admissions.caltech.edu/apply/first-year-applicants/supplemental-application-essays",
    notes: "Read directly from Caltech's own page, explicitly headed \"Fall 2026 Supplemental Application Essays\" (site footer copyright 2026) -- the live page for this cycle. Caltech uses Common App or QuestBridge purely as delivery platforms, but layers its own distinct \"Caltech Specific Questions\" on top -- these are NOT the standard Common App essay. All Fall 2026 applicants must also review Caltech's published guidelines on the ethical use of AI before submitting these essays.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "If you had to choose an area of interest or two today, what would you choose? Why did you choose your proposed area of interest? If you selected 'other', what topics are you interested in pursuing?", wordLimit: "100-200 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Regardless of your STEM interest listed above, take this opportunity to nerd out and talk to us about whatever STEM rabbit hole you have found yourself falling into. Be as specific or broad as you would like.", wordLimit: "50-150 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Select one of the following two STEM Experience prompts to respond to: (1) Tell us how you initially found your interest and passion for science or for a particular STEM topic, and how you have pursued or developed your interest or passion over the last few years. (2) Tell us about a meaningful STEM-related experience from the last few years and share how and why it inspired your curiosity.", wordLimit: "100-200 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "The creativity, inventiveness, and innovation of Caltech's students, faculty, and researchers have won Nobel Prizes and put rovers on Mars. But Techers also innovate in smaller-scale ways everyday, from imagining new ways to design solar cells or how to 3D-print dorm decor, to cooking up new recipes in the kitchen. How have you been a creator, inventor, or innovator in your own life?", wordLimit: "100-200 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Choose two of the four questions below and answer both in 250 words or less: What is an interest or hobby you do for fun, and why does it bring you joy? If you could teach a class on any topic or concept, what would it be and why? What is a core piece of your identity or being that shapes how you view and/or interact with the world? What is a concept that blew your mind or baffled you when you first encountered it?", wordLimit: "250 words combined for the 2 chosen questions", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "OPTIONAL: Have you had any extenuating circumstances (such as limited course selection or disruptions), that have affected your coursework, but that are not described elsewhere in your application? If so, tell us about them here.", wordLimit: "not specified", required: "No" },
    ],
  },
  {
    key: "harvard", re: /\bharvard\b/i, collegeName: "Harvard College",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://college.harvard.edu/admissions/apply/application-requirements",
    notes: "Read directly from Harvard's own page. Unlike most peer schools, Harvard's page carries no explicit cycle-year label -- these 5 short-answer questions have been stable for multiple years, but Harvard doesn't explicitly confirm 2026-27 currency. All 5 are required.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Harvard has long recognized the importance of enrolling a student body with a diversity of perspectives and experiences. How will the life experiences that shaped who you are today enable you to contribute to Harvard?", wordLimit: "150 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Describe a time when you strongly disagreed with someone about an idea or issue. How did you communicate or engage with this person? What did you learn from this experience?", wordLimit: "150 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Briefly describe any of your extracurricular activities, employment experience, travel, or family responsibilities that have shaped who you are.", wordLimit: "150 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "How do you hope to use your Harvard education in the future?", wordLimit: "150 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Top 3 things your roommates might like to know about you.", wordLimit: "150 words", required: "Yes" },
    ],
  },
  {
    key: "yale", re: /\byale university\b|^yale$/i, collegeName: "Yale University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.yale.edu/essay-topics",
    notes: "Read directly from Yale's own essay-topics page, which explicitly says \"Review the 2025-2026 essay topics for all applications\" -- the just-concluded cycle, not yet confirmed for 2026-27. Applies to Common App/Coalition applicants (QuestBridge applicants get a separate short-answer questionnaire). Choose 1 of the 3 longer essay options.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Tell us about a topic or idea that excites you and is related to one or more academic areas you selected above. Why are you drawn to it?", wordLimit: "200 words or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on how your interests, values, and/or experiences have drawn you to Yale.", wordLimit: "125 words or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What inspires you?", wordLimit: "200 characters or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "If you could teach any college course, write a book, or create an original piece of art of any kind, what would it be?", wordLimit: "200 characters or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Other than a family member, who is someone who has had a significant influence on you? What has been the impact of their influence?", wordLimit: "200 characters or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What is something about you that is not included anywhere else in your application?", wordLimit: "200 characters or fewer", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on a time you discussed an issue important to you with someone holding an opposing view. Reflect on the outcome. Would you do anything differently?", wordLimit: "400 words or fewer -- choose 1 of 3", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on your membership in a community to which you feel connected. Why is this community meaningful to you? You may define community however you like.", wordLimit: "400 words or fewer -- choose 1 of 3", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Reflect on an element of your personal experience that you feel will enrich your college for the better. Tell us about the process that led to this personal experience.", wordLimit: "400 words or fewer -- choose 1 of 3", required: "No" },
    ],
  },
  {
    key: "princeton", re: /\bprinceton university\b|^princeton$/i, collegeName: "Princeton University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.princeton.edu/apply/princeton-specific-questions",
    notes: "Read directly from Princeton's own page, which explicitly says \"Below you will find the questions for the 2025-26 application cycle\" -- the just-concluded cycle, not yet confirmed for 2026-27. Applicants answer the academic-interest essay (A.B./undecided version OR B.S.E. version, depending on intended degree), both Your Voice essays, and all three More About You short answers.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "What academic areas most pique your curiosity, and how do the programs offered at Princeton suit your particular interests?", wordLimit: "250 words -- A.B./undecided applicants", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Please describe why you are interested in studying engineering at Princeton, including your intended major(s) if known and how your goals might be realized through the Princeton engineering curriculum. You might consider your engineering-related experiences, such as courses, extracurricular activities, summer programs, employment or internships, and how you might use your Princeton education in the future.", wordLimit: "250 words -- B.S.E. applicants", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Princeton values community and encourages students, faculty, staff and leadership to engage in respectful conversations that can expand their perspectives and challenge their ideas and beliefs. As a prospective member of this community, reflect on how your lived experiences will impact the conversations you will have in the classroom, the dining hall or other campus spaces. What lessons have you learned in life thus far? What will your classmates learn from you? In short, how has your lived experience shaped who you are?", wordLimit: "500 words -- Your Voice #1", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "At Princeton, we value diverse perspectives and the ability to have respectful dialogue about difficult issues. Share a time when you had a conversation with a person who held an opinion different from your own. How did it affect your perspective?", wordLimit: "250 words -- Your Voice #2", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What is a new skill you would like to learn in college?", wordLimit: "50 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What brings you joy?", wordLimit: "50 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "What song represents the soundtrack of your life at this moment?", wordLimit: "50 words", required: "Yes" },
    ],
  },
  {
    key: "cornell", re: /\bcornell university\b/i, collegeName: "Cornell University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.cornell.edu/how-to-apply/first-year-applicants/cornell-first-year-writing-supplement-prompts",
    notes: "IMPORTANT: Cornell's own page explicitly states the prompts below are \"for those applying for Fall 2026 entry\" and that \"the Fall 2027 application essay question will be available in late summer 2026.\" Cornell has ALSO confirmed it is dropping its university-wide essay requirement for the 2026-27 cycle -- so even the structure (not just the wording) may change. Treat these as historical reference only until Cornell republishes. Cornell requires ONE essay, specific to the college/school within Cornell the student applies to (no general essay). Word limits vary 100-650 words by school; Engineering requires 2 long essays + 4 short essays. This entry lists the Arts & Sciences prompt as the default reference -- always confirm the exact prompt for the specific Cornell school on the official page, since they differ.",
    prompts: [
      { essayType: "Major / program-specific essay", promptText: "Cornell's mission is to discover, preserve, and disseminate knowledge; to educate the next generation of global citizens; and to promote a culture of broad inquiry throughout and beyond the Cornell community. Cornell's motto, \"I would found an institution where any person can find instruction in any study,\" reflects our historical (and ongoing) commitment to Access, Opportunity and Inclusion. Reflect on how your life experiences will help inform your contributions to a Cornell community guided by this motto.", wordLimit: "650 words -- College of Arts & Sciences prompt (reference only; check the specific school you're applying to)", required: "Yes" },
    ],
  },
  {
    key: "dartmouth", re: /\bdartmouth\b/i, collegeName: "Dartmouth College",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.dartmouth.edu/glossary-term/writing-supplement",
    notes: "Read directly from Dartmouth's own page, labeled for the \"Class of 2030\" (Fall 2026 entry) and \"Updated July 29, 2025\" -- not yet confirmed for the 2026-27 cycle. Applicants write: the required first essay, plus 1 of 2 for the second, plus 1 of 7 for the third.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "As you seek admission to Dartmouth's Class of 2030, what aspects of the college's academic program, community, and/or campus environment attract your interest? How is Dartmouth a good fit for you?", wordLimit: "100 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "'Let your life speak' is a Quaker saying and one that resonates with the ethos of Dartmouth's most famous graduate, Dr. Seuss, Class of 1925. As you contemplate your future or the future of the world, what would you like your life to say?", wordLimit: "250 words -- choose 1 of 2", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "\"Be yourself,\" Oscar Wilde advised. \"Everyone else is taken.\" Introduce yourself.", wordLimit: "250 words -- choose 1 of 2", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Curiosity is a guiding element of Toni Morrison's philosophy on life. \"I feel most alive when I'm... ​,\" Morrison remarked in a 1994 interview. Reflecting on Morrison's quote, what excites your intellectual curiosity and why?", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Dolores Huerta, a civil rights activist, famously said, 'We criticize and separate ourselves from people, but we need to come together.' Speak about a time when you have tried to bring people together.", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "In the aftermath of World War II, Dartmouth President John Sloane Dickey, Class of 1929, proclaimed, 'The world's troubles are your troubles ... and there is nothing wrong with the world that better human beings cannot fix.' Which of the world's 'troubles' inspires you to act? How might your course of study at Dartmouth prepare you to address it?", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Author Matt Haig writes, 'Read like a drug addict, if that is what you have to do. Read like a mother who has just been told her child has a fever and will die within the hour and that the only thing that can save them is that particular bit of ink and paper. Because, reader, it is.' Which book(s) most inspire you? Feel free to think outside the box.", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "In the aftermath of World War II, Dartmouth President John Sloane Dickey, Class of 1929, proclaimed, \"The world's troubles are your troubles...\" On a lighter note, celebrate your nerdy side and describe an academic passion that keeps you up at night.", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "\"It's not easy being green,\" observed Kermit the Frog. Discuss a time when you felt different in a way that was uncomfortable or challenging.", wordLimit: "250 words -- choose 1 of 7", required: "No" },
      { essayType: "College-specific supplemental essay", promptText: "Speaking of the numerous flavors of empanadas she sampled while in Argentina, Mindy Kaling '01 wrote in a 2018 New York Times op-ed, \"Even now, the thought of it makes me smile.\" Kaling shared that these treats, sold on a street corner, helped shape her future as both a chef and a writer. Describe your own experience with a formative failure that eventually blossomed into success.", wordLimit: "250 words -- choose 1 of 7", required: "No" },
    ],
  },
  {
    key: "brown", re: /\bbrown university\b/i, collegeName: "Brown University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.brown.edu/apply/how-apply",
    notes: "Brown's own page confirms these are \"our essays for the 2025-2026 application cycle\" -- not yet confirmed for 2026-27. Brown's essay-question subpage renders via JavaScript accordion, so exact wording here is cross-verified identically across several independent admissions-consultancy sources rather than pulled directly as static HTML -- treat as high-confidence but recommend a manual double-check of admission.brown.edu/apply/how-apply before finalizing. Both essays are required; several very short-answer questions (3-word, 50-word, 100-word) also exist but exact current wording for those specifically was not independently confirmed.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Brown's Open Curriculum allows students to explore broadly while also diving deeply into their academic pursuits. Tell us about any academic interests that excite you, and how you might pursue them at Brown.", wordLimit: "approximately 200-250 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Students entering Brown often find that making their home on College Hill naturally invites reflection on where they came from. Share how an aspect of your growing up has inspired or challenged you, and what unique contributions this might allow you to make to the Brown community.", wordLimit: "approximately 200-250 words", required: "Yes" },
    ],
  },
  {
    key: "upenn", re: /\buniversity of pennsylvania\b|\bupenn\b/i, collegeName: "University of Pennsylvania",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.upenn.edu/how-to-apply/preparing-your-application/writing",
    notes: "Read directly from Penn's own page, headed \"2025-26 Short Answer and Essay Prompts\" -- not yet confirmed for 2026-27. The two short-answer questions are required of all first-year applicants; a third, school-specific prompt is also required and depends on which Penn school the student applies to (College of Arts & Sciences prompt shown here as reference -- Wharton, Engineering, and Nursing each have a DIFFERENT school-specific prompt, always confirm the right one). Additional program-specific essays exist for dual-degree/specialized programs (Huntsman, LSM, M&T, NHCM, VIPER, VIC) not included here.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Write a short thank-you note to someone you have not yet thanked and would like to acknowledge.", wordLimit: "150-200 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "How will you explore community at Penn? Consider how Penn will help shape your perspective, and how your experiences and perspective will help shape Penn.", wordLimit: "150-200 words", required: "Yes" },
    ],
  },
  {
    key: "georgetown", re: /\bgeorgetown university\b/i, collegeName: "Georgetown University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://uadmissions.georgetown.edu/applying/first-year-application/",
    notes: "Georgetown does NOT use the Common App as its primary system -- it has its own \"Georgetown Application\" (uapply.georgetown.edu). New this cycle: Georgetown is also piloting Common App acceptance starting August 2026 for Fall 2027 entry, per an official Georgetown news release. Confirmed directly that Georgetown requires a general essay plus a school-specific essay (College, School of Foreign Service, McDonough School of Business, or School of Nursing & Health Studies each have their own prompt), consistent with Georgetown's long-standing structure -- but the EXACT verbatim wording for the current cycle is not published on any public Georgetown page as of this check (it lives inside the login-gated Application Supplement, and Georgetown's usual downloadable PDF reference forms had not yet been posted). Do not rely on third-party-quoted wording for this college -- check the official Application Supplement directly once you've started an application, or recheck this page in Aug-Sept 2026 when Georgetown typically posts its PDF forms.",
    prompts: [],
  },
  {
    key: "cmu", re: /\bcarnegie mellon\b|^cmu$/i, collegeName: "Carnegie Mellon University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.cmu.edu/admission/admission/admission-consideration",
    notes: "Read directly from CMU's own page (last modified May 2026, tied to the just-concluded Fall 2026 cycle, not yet explicitly confirmed for 2026-27). CMU currently uses a SINGLE universal set of 3 Writing Supplement questions for all applicants regardless of college/school (Engineering, Computer Science, Mellon College of Science, Dietrich, Tepper, etc. all answer the same 3 questions) -- distinct per-school essays were not found on the current official site. One additional essay is required only for School of Drama/Dramaturgy applicants.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Most students choose their intended major or area of study based on a passion or inspiration that's developed over time - what passion or inspiration led you to choose this area of study?", wordLimit: "300 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Many students pursue college for a specific degree, career opportunity or personal goal. Whichever it may be, learning will be critical to achieve your ultimate goal. As you think ahead to the process of learning during your college years, how will you define a successful college experience?", wordLimit: "300 words max", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Consider your application as a whole. What do you personally want to emphasize about your application for the admission committee's consideration? Highlight something that's important to you or something you haven't had a chance to share. Tell us, don't show us (no websites please).", wordLimit: "300 words max", required: "Yes" },
      { essayType: "Major / program-specific essay", promptText: "Why are you interested in studying dramaturgy, and what experience do you bring to the area of study?", wordLimit: "less than 750 words -- School of Drama/Dramaturgy applicants only", required: "No" },
    ],
  },
  {
    key: "uiuc", re: /\buniversity of illinois.*urbana|\buiuc\b/i, collegeName: "University of Illinois Urbana-Champaign",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.admissions.illinois.edu/Apply/Freshman/essays",
    notes: "Read directly from UIUC's own essays page, which explicitly says \"Following are our writing prompts for first-year students applying for fall 2026 admission\" -- the just-concluded cycle, not yet confirmed for 2026-27. Applicants answer 2 prompts total, and which 2 depends on whether they've declared a major: the first pair for students with a first-choice major, the second pair for undeclared students. A third \"second-choice major\" prompt applies only if a second-choice major was selected.",
    prompts: [
      { essayType: "Major / program-specific essay", promptText: "Explain, in detail, an experience you've had in the past 3 to 4 years related to your first-choice major. This can be an experience from an extracurricular activity, in a class you've taken, or through something else.", wordLimit: "approximately 150 words -- applicants with a declared major", required: "Yes" },
      { essayType: "Major / program-specific essay", promptText: "Describe your personal and/or career goals after graduating from Illinois and how your selected first-choice major will help you achieve them.", wordLimit: "approximately 150 words -- applicants with a declared major", required: "Yes" },
      { essayType: "Major / program-specific essay", promptText: "What are your academic interests? Please include 2-3 majors you're considering at Illinois and why.", wordLimit: "approximately 150 words -- undeclared/undecided applicants", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "What are your future career or academic goals? You may include courses you took in high school and how these impacted your goals.", wordLimit: "approximately 150 words -- undeclared/undecided applicants", required: "No" },
      { essayType: "Major / program-specific essay", promptText: "Please explain your interest in your second-choice major or your overall academic or career goals.", wordLimit: "approximately 150 words -- only if a second-choice major was selected", required: "No" },
    ],
  },
  {
    key: "gatech", re: /\bgeorgia institute of technology\b|\bgeorgia tech\b/i, collegeName: "Georgia Institute of Technology",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.gatech.edu/first-year/personal-essays",
    notes: "Read directly from Georgia Tech's own page, which states \"Below are the Georgia Tech essay questions for 2026 applications\" -- the just-concluded cycle, not yet explicitly confirmed for 2026-27.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "Why do you want to study your chosen major, and why do you want to study that major at Georgia Tech?", wordLimit: "max 300 words", required: "Yes" },
    ],
  },
  {
    key: "rutgers", re: /\brutgers\b/i, collegeName: "Rutgers University-New Brunswick",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.rutgers.edu/apply/first-year-applicants",
    notes: "Confirmed directly, quote: \"Please note there are no supplemental essays required for the Common App.\" The shared Common App main essay (attached automatically once the platform is set to Common App) fully satisfies Rutgers' essay requirement. Applicants using the separate, non-Common-App Rutgers Application instead choose from Rutgers' own 7-topic essay list (3,800-character limit) -- this duplicates rather than adds to the requirement, so isn't listed here. A short statement is required only if a student opts into consideration for the Honors College.",
    prompts: [],
  },
  {
    key: "stanford", re: /\bstanford university\b|^stanford$/i, collegeName: "Stanford University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.stanford.edu/apply/first-year/apply.html",
    notes: "Read directly from Stanford's own page, \"Updated on October 1, 2025\" (2025-26 cycle) -- Stanford's own page states the application and \"Stanford Questions\" become available in early August each year, so 2026-27 content was not yet published as of this check. Stanford also requires 5 additional short-answer questions (50 words each) beyond the 3 essays below, but their exact current wording could not be verified from the official page in this pass (only their existence and word limit were confirmed) -- do not rely on third-party paraphrases for those; recheck once the 2026-27 Stanford Questions go live in August.",
    prompts: [
      { essayType: "College-specific supplemental essay", promptText: "The Stanford community is deeply curious and driven to learn in and out of the classroom. Reflect on an idea or experience that makes you genuinely excited about learning.", wordLimit: "100-250 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Virtually all of Stanford's undergraduates live on campus. Write a note to your future roommate that reveals something about you or that will help your roommate-and us-get to know you better.", wordLimit: "100-250 words", required: "Yes" },
      { essayType: "College-specific supplemental essay", promptText: "Please describe what aspects of your life experiences, interests and character would help you make a distinctive contribution as an undergraduate to Stanford University.", wordLimit: "100-250 words", required: "Yes" },
    ],
  },
];

export function findEssayAutofillProfile(collegeName) {
  if (!collegeName) return null;
  for (const p of ESSAY_PROMPT_AUTOFILL_PROFILES) {
    if (p.re.test(collegeName)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Platform-level prompt rules (Part F) -- some prompts belong to the shared
// APPLICATION PLATFORM, not to any one college: every Common App college's
// applicants answer the same Common App main essay; every UC campus uses the
// same 8 Personal Insight Questions. These are attached whenever a family
// sets a college's application platform to one of these, IN ADDITION to
// (never instead of) that college's own supplemental prompts -- explicitly
// NOT assuming every Common App college shares the same supplement, since
// only the platform-level main essay is actually shared. Keyed by the
// db/applicationPlatforms.js platform_id, not a name guess, so this only
// fires when the family (or a verified platform suggestion) has actually
// set that platform for the college.
// ---------------------------------------------------------------------------
export const PLATFORM_PROMPT_SETS = {
  common_app: {
    essayType: "Common App main essay",
    sourceType: "Common App platform prompt",
    sourceUrl: "https://www.commonapp.org/apply/essay-prompts",
    sourceLabel: "Common App -- First-year essay prompts (2026-2027 cycle, announced Feb 27, 2026)",
    lastChecked: "2026-07-20",
    confidence: "verified",
    notes: "Common App's own essay-prompts page requires JavaScript to display its prompt list, so this wording was cross-checked across multiple independent quoting sources (College Essay Guy, IvyWise, Admittedly, Expert Admissions) the same day, all citing Common App's Feb 27, 2026 announcement that the 2026-2027 prompts are unchanged from 2025-2026. Applies to the Common App main personal essay only -- this college may still have its own separate supplemental questions, tracked separately.",
    wordLimit: "250-650 words",
    prompts: [
      "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.",
      "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?",
      "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?",
      "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?",
      "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.",
      "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?",
      "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.",
    ],
  },
  uc_application: {
    essayType: "UC Personal Insight Question",
    sourceType: "UC system platform prompt",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/personal-insight-questions.html",
    sourceLabel: "UC Admissions -- Personal insight questions (first-year applicants)",
    lastChecked: "2026-07-20",
    confidence: "verified",
    notes: "Read directly from UC's own first-year Personal Insight Questions page. Choose 4 of these 8 -- the same 4 responses are sent to every UC campus on the application, so these are tracked once per student rather than once per UC campus.",
    wordLimit: "350 words maximum (choose 4 of 8)",
    prompts: [
      "Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.",
      "Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.",
      "What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?",
      "Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.",
      "Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement?",
      "Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.",
      "What have you done to make your school or your community a better place?",
      "Beyond what has already been shared in your application, what do you believe makes you a strong candidate for admissions to the University of California?",
    ],
  },
};

// Attaches a platform's shared prompt set (Common App main essay / UC PIQs)
// to one college, if that college's platform matches. Same insert-or-refresh,
// never-duplicate behavior as autofillEssayPrompts. Safe to call for every
// college regardless of platform -- it's a no-op (filled: false) when the
// platform isn't one with a shared prompt set.
export function attachPlatformPrompts(studentId, { collegeId, collegeName, platformId }) {
  const set = PLATFORM_PROMPT_SETS[platformId];
  if (!set) return { filled: false, reason: platformId ? `"${platformId}" doesn't have a shared platform prompt set -- only Common App and UC Application do.` : "No application platform set yet." };

  const ts = now();
  const added = [];
  const refreshed = [];
  for (const promptText of set.prompts) {
    const existing = findExistingPrompt(studentId, collegeId, promptText);
    if (existing) {
      db.prepare("UPDATE essay_prompts SET source_url=?, last_checked=?, updated_at=? WHERE prompt_id=?")
        .run(set.sourceUrl, ts, ts, existing.prompt_id);
      refreshed.push(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(existing.prompt_id));
      continue;
    }
    const promptId = newId("essay");
    const cycleType = "Current cycle";
    const verificationStatus = "Official source verified";
    insertPrompt.run({
      ...PROMPT_INSERT_DEFAULTS,
      prompt_id: promptId, student_id: studentId, college_id: collegeId || null,
      college_name: collegeName || null, platform_id: platformId, program_label: null,
      essay_type: set.essayType, prompt_text: promptText, word_limit: set.wordLimit,
      required: "Yes", deadline: null, prompt_cycle: null, cycle_type: cycleType,
      status: "Not started", draft_title: null, outline_notes: null, student_story_angle: null,
      related_track: null, related_activities: null,
      notes: `${set.notes} This is a shared platform prompt, not specific to ${collegeName || "this college"} -- check separately whether ${collegeName || "this college"} also has its own supplemental questions.`,
      verification_status: verificationStatus, source_url: set.sourceUrl, last_checked: ts,
      created_at: ts, updated_at: ts,
      source_label: set.sourceLabel, source_type: set.sourceType,
      prompt_status: derivePromptStatus({ cycleType, verificationStatus }),
    });
    added.push(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(promptId));
  }
  return { filled: true, added, refreshed, sourceUrl: set.sourceUrl, confidence: set.confidence, essayType: set.essayType };
}

// Applies a matched reference profile's prompts for one college -- same
// insert-or-refresh behavior as autofillTimelineEvents in
// applicationTimeline.js (dedupes against already-tracked prompts by
// normalized text, refreshes source/last_checked on a repeat call rather
// than creating duplicates).
export function autofillEssayPrompts(studentId, { collegeId, collegeName }) {
  const profile = findEssayAutofillProfile(collegeName);
  if (!profile) {
    return {
      filled: false,
      reason: `No hand-verified reference prompts yet for "${collegeName || "this college"}." Use "Find prompts" to search the college's official site, or add prompts by hand.`,
    };
  }

  const ts = now();
  const verificationStatus = profile.confidence === "verified" ? "Official source verified" : "Needs manual verification";
  const added = [];
  const refreshed = [];
  const noteParts = [
    profile.notes || null,
    "Auto-filled from hand-verified reference data -- always confirm exact wording and word limits on the official application portal before finalizing an essay.",
  ].filter(Boolean).join(" ");

  for (const p of profile.prompts) {
    const existing = findExistingPrompt(studentId, collegeId, p.promptText);
    if (existing) {
      db.prepare("UPDATE essay_prompts SET source_url=?, last_checked=?, updated_at=? WHERE prompt_id=?")
        .run(profile.sourceUrl, ts, ts, existing.prompt_id);
      refreshed.push(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(existing.prompt_id));
      continue;
    }
    const promptId = newId("essay");
    const cycleType = "Current cycle";
    insertPrompt.run({
      ...PROMPT_INSERT_DEFAULTS,
      prompt_id: promptId, student_id: studentId, college_id: collegeId || null,
      college_name: collegeName || profile.collegeName || null, platform_id: null, program_label: null,
      essay_type: p.essayType, prompt_text: p.promptText, word_limit: p.wordLimit,
      required: p.required || "Yes", deadline: null, prompt_cycle: null, cycle_type: cycleType,
      status: "Not started", draft_title: null, outline_notes: null, student_story_angle: null,
      related_track: null, related_activities: null,
      notes: noteParts,
      verification_status: verificationStatus, source_url: profile.sourceUrl, last_checked: ts,
      created_at: ts, updated_at: ts,
      source_label: `Reference data (checked ${profile.lastChecked})`,
      source_type: "Official college admissions site",
      prompt_status: derivePromptStatus({ cycleType, verificationStatus }),
    });
    added.push(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(promptId));
  }

  return {
    filled: true,
    collegeName: profile.collegeName,
    confidence: profile.confidence,
    sourceUrl: profile.sourceUrl,
    lastChecked: profile.lastChecked,
    added, refreshed,
    notice: profile.confidence === "verified"
      ? "Prompts filled in from a source checked directly against the college's own page. Still confirm exact wording before finalizing an essay."
      : "Prompts filled in from cross-checked reference data, but the college's own official page hadn't been refreshed for the newest cycle when last checked. Confirm exact wording on the official application portal before finalizing an essay.",
  };
}

// Reference-first, live-crawl-fallback essay prompt lookup -- same pattern
// as autofillOrDiscoverTimeline in applicationTimeline.js. Tries the
// hand-verified profile above first; if no profile matches, falls through
// to the bounded official-domain crawl (findEssayPrompts) automatically.
// When platformId is given (Common App / UC Application), the shared
// platform prompt set (Part F) is ALSO attached, in addition to whichever
// college-specific prompts were found -- never one instead of the other,
// since a Common App college's applicants need both the Common App main
// essay AND that college's own supplement.
export async function autofillOrDiscoverEssayPrompts(studentId, { collegeId, collegeName, platformId }) {
  const platformResult = platformId ? attachPlatformPrompts(studentId, { collegeId, collegeName, platformId }) : null;
  const platformAdded = platformResult?.filled ? platformResult.added.length : 0;
  const platformRefreshed = platformResult?.filled ? platformResult.refreshed.length : 0;

  const auto = autofillEssayPrompts(studentId, { collegeId, collegeName });
  if (auto.filled) {
    return {
      method: "reference", filled: true,
      collegeId, collegeName: auto.collegeName || collegeName,
      confidence: auto.confidence,
      promptsAdded: auto.added.length + platformAdded, promptsRefreshed: auto.refreshed.length + platformRefreshed,
      sourceUrl: auto.sourceUrl, lastChecked: auto.lastChecked, notice: auto.notice,
      platformPromptsAttached: platformAdded + platformRefreshed > 0,
    };
  }

  try {
    const found = await findEssayPrompts(studentId, { collegeId, collegeName });
    if (found.skipped) {
      return {
        method: "site_search", filled: platformAdded + platformRefreshed > 0, collegeId, collegeName,
        promptsAdded: platformAdded, notice: found.reason || found.notice,
        platformPromptsAttached: platformAdded + platformRefreshed > 0,
      };
    }
    return {
      method: "site_search", filled: found.promptsFound > 0 || platformAdded + platformRefreshed > 0, collegeId, collegeName,
      promptsAdded: found.promptsFound + platformAdded, pagesChecked: found.pagesFetched, domain: found.domain, notice: found.notice,
      platformPromptsAttached: platformAdded + platformRefreshed > 0,
    };
  } catch (err) {
    return {
      method: "site_search", filled: platformAdded + platformRefreshed > 0, collegeId, collegeName,
      promptsAdded: platformAdded, notice: `Could not check the official site: ${err.message}`,
      platformPromptsAttached: platformAdded + platformRefreshed > 0,
    };
  }
}

// ---------------------------------------------------------------------------
// "Find essay requirements for all my colleges" -- the same reference-first/
// live-discovery-fallback pull as autofillOrDiscoverEssayPrompts above, run
// once per college across BOTH Saved Colleges and the Decision Plan list
// (same dedup as the /college-options route -- a family's "list" spans both,
// and this button is exactly what closes the gap where only whichever
// college the family happened to click "Find" for individually ever got
// prompts). Runs sequentially, not in parallel, to stay polite to each
// college's own server -- the caller should show a busy state.
export async function findEssayPromptsForAllColleges(studentId) {
  const saved = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const planned = db.prepare("SELECT college_id, college_name FROM decision_plan_items WHERE student_id=?").all(studentId);
  const seen = new Map();
  for (const r of [...saved, ...planned]) {
    const key = r.college_id || `name:${String(r.college_name || "").toLowerCase().trim()}`;
    if (!key || key === "name:") continue;
    if (!seen.has(key)) seen.set(key, { collegeId: r.college_id || null, collegeName: r.college_name || key });
  }
  const colleges = [...seen.values()];

  const results = [];
  let referenceCount = 0, foundCount = 0, notFoundCount = 0;
  for (const c of colleges) {
    let platformId = null;
    if (c.collegeId) {
      const reqRow = db.prepare("SELECT platform_id FROM college_application_requirements WHERE student_id=? AND college_id=? AND platform_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1").get(studentId, c.collegeId);
      platformId = reqRow?.platform_id || null;
    }
    const r = await autofillOrDiscoverEssayPrompts(studentId, { collegeId: c.collegeId, collegeName: c.collegeName, platformId });
    if (r.method === "reference") referenceCount++;
    else if (r.filled) foundCount++;
    else notFoundCount++;
    results.push(r);
  }

  return {
    totalColleges: colleges.length, referenceCount, foundCount, notFoundCount,
    results,
    notice: "Every prompt added here still keeps its own source and verification status -- check anything marked \"Needs manual verification\" against the official application portal before relying on it.",
  };
}

// ---------------------------------------------------------------------------
// Essay Center coverage summary -- one glance at every saved/Decision Plan
// college's essay-prompt AND timeline status, so a family never has to click
// into each college one at a time to find out what's still missing. Every
// college lands in exactly one prompt-coverage bucket (checked in priority
// order below) plus an independent timeline flag, since a college can be
// e.g. "previous-year prompts only" AND "timeline missing" at the same time.
// Read-only aggregation -- never writes anything, mirrors the same saved +
// Decision Plan dedup used by findEssayPromptsForAllColleges/college-options.
// ---------------------------------------------------------------------------
const CURRENT_VERIFIED_STATUSES = ["Official source verified", "User verified"];

export function buildEssayCoverageSummary(studentId) {
  const saved = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const planned = db.prepare("SELECT college_id, college_name FROM decision_plan_items WHERE student_id=?").all(studentId);
  const seen = new Map();
  for (const r of [...saved, ...planned]) {
    const key = r.college_id || `name:${String(r.college_name || "").toLowerCase().trim()}`;
    if (!key || key === "name:") continue;
    if (!seen.has(key)) seen.set(key, { collegeId: r.college_id || null, collegeName: r.college_name || key });
  }
  const colleges = [...seen.values()];

  const buckets = {
    currentVerified: [], previousYearOnly: [], needsVerification: [], noPromptsYet: [],
  };
  const timelineMissing = [];

  for (const c of colleges) {
    const prompts = c.collegeId
      ? db.prepare("SELECT cycle_type, verification_status FROM essay_prompts WHERE student_id=? AND college_id=?").all(studentId, c.collegeId)
      : db.prepare("SELECT cycle_type, verification_status FROM essay_prompts WHERE student_id=? AND college_id IS NULL AND LOWER(college_name)=LOWER(?)").all(studentId, c.collegeName);

    const entry = { collegeId: c.collegeId, collegeName: c.collegeName };

    if (!prompts.length) {
      buckets.noPromptsYet.push(entry);
    } else if (prompts.some((p) => p.cycle_type === "Current cycle" && CURRENT_VERIFIED_STATUSES.includes(p.verification_status))) {
      buckets.currentVerified.push(entry);
    } else if (prompts.some((p) => p.cycle_type === "Previous cycle") && !prompts.some((p) => p.cycle_type === "Current cycle")) {
      buckets.previousYearOnly.push(entry);
    } else {
      buckets.needsVerification.push(entry);
    }

    const timelineRows = c.collegeId
      ? db.prepare("SELECT event_date FROM college_application_timeline_events WHERE student_id=? AND college_id=? AND event_date IS NOT NULL AND event_date != ''").all(studentId, c.collegeId)
      : [];
    if (!timelineRows.length) timelineMissing.push(entry);
  }

  return {
    totalColleges: colleges.length,
    currentCycleVerified: buckets.currentVerified,
    previousYearOnly: buckets.previousYearOnly,
    needsVerification: buckets.needsVerification,
    noPromptsYet: buckets.noPromptsYet,
    timelineMissing,
    notice: "This checks every college in your saved list and Decision Plan. \"Previous-year prompts only\" means the college's essay questions may change before the next application opens -- always confirm on the official application portal.",
  };
}

// ---------------------------------------------------------------------------
// Prompt Discovery (Part E) -- bounded crawl, reusing programDiscovery.js's
// primitives instead of duplicating fetch/robots/link-extraction logic.
// ---------------------------------------------------------------------------
const ESSAY_URL_HINTS = [
  "essay", "essays", "prompt", "prompts", "supplement", "supplemental", "personal-statement",
  "personal statement", "writing-supplement", "short-answer", "short answer", "why-us",
  "why us", "application-requirements", "first-year-application", "apply/first-year",
  // Part B: official honors/scholarship/special-program pages and the UC PIQ
  // page often carry their own separate essay/writing requirement, distinct
  // from the main application essay -- these hints let the same bounded,
  // official-domain-only crawl reach those pages too.
  "honors", "scholars-program", "scholarship", "special-program", "special program",
  "personal-insight", "personal insight", "piq", "portfolio", "audition",
];
const CRAWL_MAX_PAGES = 28;
// A real essay-prompt page is very often nested three clicks deep from a
// college's homepage (Home -> Apply -> Application Materials -> Essays, for
// example) -- a depth cap of 2 stops one level short of that and silently
// finds nothing even when the page is perfectly readable. Verified against
// UT Austin's real site structure, which needs depth 3 to reach its actual
// essay page.
const CRAWL_MAX_DEPTH = 3;
// Below this many visible characters (after stripping script/style/nav), a
// fetched page is almost certainly a JavaScript-rendered shell rather than a
// real content page (confirmed against a real example: UChicago's essay page
// returns an empty body server-side and only fills in via client-side JS).
// Used to give an honest, specific notice instead of a generic "not found."
const THIN_PAGE_TEXT_THRESHOLD = 150;

function visibleTextLength(html) {
  try {
    const $ = cheerio.load(html);
    $("script,style,nav,footer,noscript,header").remove();
    return $("body").text().replace(/\s+/g, " ").trim().length;
  } catch { return 0; }
}

function classifyEssayType(url, title) {
  const h = (hostOf(url) || "").toLowerCase();
  const hay = `${url} ${title || ""}`.toLowerCase();
  if (h.includes("commonapp")) return "Common App main essay";
  if (h.includes("coalitionforcollegeaccess") || h.includes("scoir")) return "Coalition essay";
  if (h.includes("universityofcalifornia") || hay.includes("personal insight")) return "UC Personal Insight Question";
  if (hay.includes("honors") || hay.includes("scholarship")) return "Honors / scholarship essay";
  if (hay.includes("major") || hay.includes("department of") || hay.includes("school of")) return "Major / program-specific essay";
  return "College-specific supplemental essay";
}

const WORD_LIMIT_RANGE_RE = /\b(\d{2,4})\s*(?:to|-|–)\s*(\d{2,4})\s*words?\b/i;
const WORD_LIMIT_RE = /\b(\d{2,4})\s*[- ]?words?\b/i;

function findWordLimit(text) {
  if (!text) return null;
  const rangeM = text.match(WORD_LIMIT_RANGE_RE);
  if (rangeM) return `${rangeM[1]}-${rangeM[2]} words`;
  const m = text.match(WORD_LIMIT_RE);
  return m ? `${m[1]} words` : null;
}

// A "prompt-shaped" sentence taken verbatim from the page: it either ends
// in a question mark, or opens with a common prompt stem ("Describe...",
// "Tell us...", "In 250 words..."), AND has essay-context nearby (this, the
// previous, or the next text unit -- or the nearest heading above it --
// mentions essay/prompt/response/word-limit language, or the page itself
// was already classified as an essay-type page). Every candidate is also
// checked against a junk-phrase blocklist of common nav/hero/CTA copy
// ("Ready to start your journey?", "Apply now", etc.) that reads as a
// question but is not a prompt.
const PROMPT_STEM_RE = /^(describe|tell us|discuss|reflect on|please share|share (a|an|one)|explain|in \d|what|why|how (do|did|has|would)|if you|choose one|write about)/i;
const ESSAY_CONTEXT_RE = /(essay|prompt|response|personal statement|word limit|words? or fewer|words? maximum|maximum of \d+ words|personal insight question)/i;
const HEADING_CONTEXT_RE = /(essay|prompt|writing|supplement|personal insight|short answer|application requirement)/i;

// Common hero/nav/CTA copy that is grammatically question- or stem-shaped
// but is never an essay prompt. Exact/substring match on the normalized
// candidate text (case-insensitive, punctuation-insensitive).
const JUNK_PHRASE_RE = /(ready to start your journey|start your journey|start your application|apply now|apply today|request (more )?info|schedule a visit|visit campus|plan your visit|explore programs|explore majors|learn more|get started|join us|create an account|sign in|log in|find your fit|discover your future|why choose us|take the next step|connect with us|contact admissions|request information|visit us|see yourself here)/i;

export function isJunkPromptText(text) {
  const t = String(text || "").trim();
  if (t.length < 40 || t.length > 700) return true;
  const normalized = t.toLowerCase().replace(/\s+/g, " ");
  if (JUNK_PHRASE_RE.test(normalized)) return true;
  // Real prompts are close to full sentences -- reject anything with too
  // few words to plausibly be an actual essay question (catches short
  // run-together heading/CTA fragments the length check alone might miss).
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) return true;
  return false;
}

export function extractEssayPromptsFromHtml(html, url) {
  const $ = cheerio.load(html);
  $("script,style,nav,footer,noscript,header,button,form").remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").trim().slice(0, 200) || null;
  const essayType = classifyEssayType(url, title);

  // Walk block-level elements individually (rather than flattening the whole
  // body to one text blob) so unrelated headings/CTAs sitting next to each
  // other in the markup don't get concatenated into one run-on "sentence"
  // that happens to end in a question mark. Track the nearest heading above
  // each block as extra context (e.g. a block under "<h2>Essay Prompts</h2>"
  // is a much stronger candidate even without an explicit "word limit" nearby).
  const units = []; // { text, heading }
  let currentHeading = "";
  $("body")
    .find("h1,h2,h3,h4,h5,h6,p,li,blockquote,td,dd")
    .each((_, el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (!t) return;
      if (/^h[1-6]$/.test(tag)) {
        currentHeading = t;
        return; // headings are context, not prompt candidates themselves
      }
      units.push({ text: t, heading: currentHeading });
    });

  // Fallback for pages with no matched block elements (rare, but don't want
  // to silently find nothing on an unusually-structured page).
  if (!units.length) {
    const bodyText = $("body").text() || "";
    for (const s of splitSentences(bodyText)) units.push({ text: s, heading: "" });
  }

  // Expand each block into sentences (a <p> can contain multiple prompts /
  // multiple sentences), keeping the block's heading as that sentence's context.
  const sentenceUnits = [];
  for (const u of units) {
    for (const s of splitSentences(u.text)) sentenceUnits.push({ text: s, heading: u.heading });
  }

  const candidates = [];
  for (let i = 0; i < sentenceUnits.length; i++) {
    const s = sentenceUnits[i].text.trim();
    if (isJunkPromptText(s)) continue;
    const isQuestion = s.endsWith("?");
    const isStem = PROMPT_STEM_RE.test(s);
    if (!isQuestion && !isStem) continue;
    const context = `${sentenceUnits[i - 1]?.text || ""} ${s} ${sentenceUnits[i + 1]?.text || ""}`;
    const headingContext = sentenceUnits[i].heading || "";
    const hasContext = ESSAY_CONTEXT_RE.test(context) || HEADING_CONTEXT_RE.test(headingContext);
    if (!hasContext) continue;
    candidates.push({ promptText: s, wordLimit: findWordLimit(`${headingContext} ${context}`) });
  }

  // De-dupe near-identical candidates on this one page (repeated nav/footer
  // text before removal, etc.) - never de-dupes across pages here; that
  // happens against the DB in findExistingPrompt.
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = c.promptText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return { title, essayType, prompts: unique.slice(0, 15) };
}

function normalizePromptText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function findExistingPrompt(studentId, collegeId, promptText) {
  const norm = normalizePromptText(promptText);
  if (!collegeId || !norm) return null;
  const rows = db.prepare("SELECT prompt_id, prompt_text FROM essay_prompts WHERE student_id=? AND college_id=?").all(studentId, collegeId);
  return rows.find((r) => normalizePromptText(r.prompt_text) === norm) || null;
}

const insertPrompt = db.prepare(`
  INSERT INTO essay_prompts (
    prompt_id, student_id, college_id, college_name, platform_id, program_label, essay_type,
    prompt_text, word_limit, required, deadline, prompt_cycle, cycle_type, status, draft_title, outline_notes,
    student_story_angle, related_track, related_activities, notes, verification_status,
    source_url, last_checked, created_at, updated_at,
    application_round, school_or_program, character_limit, source_label, source_type, prompt_status
  ) VALUES (
    @prompt_id, @student_id, @college_id, @college_name, @platform_id, @program_label, @essay_type,
    @prompt_text, @word_limit, @required, @deadline, @prompt_cycle, @cycle_type, @status, @draft_title, @outline_notes,
    @student_story_angle, @related_track, @related_activities, @notes, @verification_status,
    @source_url, @last_checked, @created_at, @updated_at,
    @application_round, @school_or_program, @character_limit, @source_label, @source_type, @prompt_status
  )
`);
// Every insertPrompt.run() call must supply all of these columns (better-sqlite3
// requires every named parameter to be bound) -- this default object is spread
// first so call sites only need to override what's actually different,
// instead of repeating every new column at each of the four call sites below.
const PROMPT_INSERT_DEFAULTS = {
  application_round: null, school_or_program: null, character_limit: null,
  source_label: null, source_type: null, cycle_type: "Unknown", prompt_status: "Unknown",
};

// "Find essay prompts" -- the one-button family workflow. Resolves the
// college's official domain from College Scorecard when not given directly
// (same pattern as researchCollege in programDiscovery.js), then crawls a
// small, essay-hinted slice of that domain. Every stored prompt keeps its
// exact source_url and last_checked timestamp; nothing is ever invented.
export async function findEssayPrompts(studentId, { collegeId, collegeName, domain, startUrl, promptCycle }) {
  let cleanDomain = domain ? domain.replace(/^https?:\/\//, "").replace(/\/.*/, "") : null;
  let resolvedFrom = cleanDomain ? "provided" : null;
  let resolvedCollegeName = collegeName || null;

  if (!cleanDomain && collegeId) {
    try {
      const found = await getCollegeById(collegeId);
      const websiteUrl = found?.college?.websiteUrl;
      if (websiteUrl) {
        cleanDomain = websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*/, "");
        resolvedFrom = "college_scorecard";
      }
      if (found?.college?.name && !resolvedCollegeName) resolvedCollegeName = found.college.name;
    } catch { /* Scorecard lookup failed - proceed without a resolved domain */ }
  }

  if (!cleanDomain) {
    return {
      skipped: true,
      promptsFound: 0,
      notice: "Essay prompts not verified yet. Check the official application portal.",
      reason: "No official website domain is known for this college yet. Add one under Advanced, or check the official application portal directly.",
    };
  }

  const start = startUrl && isSameOfficialDomain(startUrl, cleanDomain) ? startUrl : `https://${cleanDomain}/`;
  const visited = new Set();
  const queue = [{ url: start, depth: 0 }];
  let pagesFetched = 0, promptsFound = 0, robotsBlocked = 0, offDomainSkipped = 0, pdfSkipped = 0;
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
      const looksEssayRelated = depth === 0 || ESSAY_URL_HINTS.some((h) => hay.includes(h));
      if (looksEssayRelated) {
        contentPagesSeen++;
        if (visibleTextLength(page.html) < THIN_PAGE_TEXT_THRESHOLD) thinPagesSeen++;
        const { essayType, prompts } = extractEssayPromptsFromHtml(page.html, url);
        const ts = now();
        for (const p of prompts) {
          const existing = findExistingPrompt(studentId, collegeId, p.promptText);
          if (existing) {
            db.prepare("UPDATE essay_prompts SET source_url=?, last_checked=?, updated_at=? WHERE prompt_id=?")
              .run(url, ts, ts, existing.prompt_id);
            continue;
          }
          const promptId = newId("essay");
          insertPrompt.run({
            ...PROMPT_INSERT_DEFAULTS,
            prompt_id: promptId, student_id: studentId, college_id: collegeId || null,
            college_name: resolvedCollegeName || null, platform_id: null, program_label: null,
            essay_type: essayType, prompt_text: p.promptText, word_limit: p.wordLimit,
            required: "Unknown", deadline: null, prompt_cycle: promptCycle || null, cycle_type: "Unknown",
            status: "Not started", draft_title: null, outline_notes: null, student_story_angle: null,
            related_track: null, related_activities: null,
            notes: "Found on the college's own official site -- confirm wording, word limit, and that it's still current on the official application portal before treating it as final.",
            verification_status: "Needs manual verification", source_url: url, last_checked: ts,
            created_at: ts, updated_at: ts,
            source_label: `Found on the official college site (${hostOf(url) || "official source"})`,
            source_type: "Official college admissions site",
            prompt_status: derivePromptStatus({ cycleType: "Unknown", verificationStatus: "Needs manual verification" }),
          });
          created.push(db.prepare("SELECT * FROM essay_prompts WHERE prompt_id=?").get(promptId));
          promptsFound++;
        }
      }

      if (depth < CRAWL_MAX_DEPTH) {
        const links = extractLinks(page.html, page.url || url).filter((l) => isSameOfficialDomain(l, cleanDomain));
        for (const l of links) {
          const lower = l.toLowerCase();
          const isHinted = ESSAY_URL_HINTS.some((h) => lower.includes(h));
          const worthQueueing = depth > 0 || isHinted || /admission|apply|first-year|freshman/i.test(lower);
          if (worthQueueing && !visited.has(l) && queue.length + pagesFetched < CRAWL_MAX_PAGES * 3) {
            // Essay/prompt-hinted links jump to the front of the queue so a
            // page nested several clicks deep on a large site still gets
            // reached within the page budget, instead of losing out to a lot
            // of shallower, less-relevant pages visited first in strict
            // breadth-first order.
            if (isHinted) queue.unshift({ url: l, depth: depth + 1 });
            else queue.push({ url: l, depth: depth + 1 });
          }
        }
      }
    }
    await sleep(250);
  }

  // If every essay-hinted page we actually managed to fetch came back
  // (almost) empty, this is very likely a JavaScript-rendered site whose
  // real content only appears after client-side scripts run -- something a
  // server-side fetch can never see, regardless of crawl depth or page
  // budget. Say so plainly instead of leaving the family staring at a
  // generic "not found" with no idea why.
  const likelyJsRendered = promptsFound === 0 && contentPagesSeen > 0 && thinPagesSeen === contentPagesSeen;

  return {
    domain: cleanDomain, resolvedFrom, pagesFetched, promptsFound, robotsBlocked, offDomainSkipped, pdfSkipped,
    maxPages: CRAWL_MAX_PAGES, maxDepth: CRAWL_MAX_DEPTH, prompts: created, likelyJsRendered,
    notice: promptsFound > 0
      ? "Prompts found automatically - always verify exact wording and word limits on the official application portal before finalizing an essay."
      : likelyJsRendered
        ? `This college's essay/application pages appear to require JavaScript to display their content, so they can't be read automatically. Check the official page yourself: https://${cleanDomain}/`
        : "Essay prompts not verified yet. Check the official application portal.",
  };
}

// ---------------------------------------------------------------------------
// Essay Strategy by Track (Part F) -- brainstorming aids only. Every entry
// is generic guidance (the kind a school counselor would give), never a
// finished sentence meant to be copied into an essay. Track ids reuse the
// app's existing Career Track taxonomy (db/coursePlans.js /
// services/scenarios.js) where one exists, so the language stays consistent
// with what Matches/Advisor/Courses already tell the family. Two tracks
// ("Human rights / digital ethics" and "Undecided STEM") don't have a
// matching academic track elsewhere in the app -- they're essay-specific
// interest categories, added here with their own ids.
export const ESSAY_TRACK_STRATEGY = [
  {
    trackId: "cs_ai_ds",
    trackName: "CS + AI / Data Science",
    strongThemes: ["Curiosity about how systems learn from data", "A specific problem you tried to model or predict", "Tension between technical capability and responsible use of AI"],
    evidenceToUse: ["A real ML/data project, even a small one - what you built, what broke, what you learned from the failure", "Competitions (hackathons, Kaggle, science fair) framed around the decision points, not just the result", "Coursework or self-study that shows sustained curiosity, not just a single class"],
    activitiesToMention: ["Independent or club-based ML/data projects", "Research or shadowing with a professor/mentor", "Teaching or explaining a technical concept to someone else (shows communication, not just skill)"],
    risksToAvoid: ["Listing tools/frameworks like a resume instead of telling a story", "Claiming an AI project 'changed the world' - scale honestly", "Ignoring failure or ambiguity; admissions readers value what you learned when something didn't work"],
    reflectionQuestions: ["What's a moment your model or analysis was wrong, and what did that teach you?", "What real question were you actually trying to answer - not just 'build an ML model'?", "Where do you sit on the line between what AI can do and what it should do?"],
    possibleOutline: ["Open on a specific, small moment (a bug, a surprising result, a dataset quirk)", "Zoom out to the problem you were really trying to solve", "Show the thinking/iteration, not just the finished product", "Close on what it revealed about how you think or what you want to keep exploring"],
  },
  {
    trackId: "cs_finance_quant",
    trackName: "CS + Finance / FinTech / Quant",
    strongThemes: ["Where numbers meet real decisions with consequences", "A market, economic, or personal-finance question you couldn't let go of", "Building a model and discovering its limits"],
    evidenceToUse: ["A backtest, valuation model, or economics research project - focus on the reasoning, not just the return", "Investment club, case competitions, or independent market research", "Any experience where you had to explain a quantitative idea to a non-technical audience"],
    activitiesToMention: ["Investment/finance clubs or competitions", "Independent research using public financial/economic data", "Internships or shadowing in a finance-adjacent role, even informal"],
    risksToAvoid: ["Sounding purely profit-motivated without a personal 'why'", "Overstating market predictions as if they were guaranteed", "Jargon-heavy writing that a general reader can't follow"],
    reflectionQuestions: ["What's a financial or economic decision (yours, your family's, or in the news) that first hooked your interest?", "What did a model get wrong, and what did that teach you about risk?", "How do you think about the human side of markets, not just the math?"],
    possibleOutline: ["Open on a concrete number or decision that mattered", "Explain what you built or analyzed to understand it better", "Show a moment of being wrong or surprised", "Close on what kind of thinker/builder that experience is turning you into"],
  },
  {
    trackId: "cs_cyber_security",
    trackName: "CS + Cybersecurity",
    strongThemes: ["Thinking like both an attacker and a defender", "Trust, risk, and the human side of security failures", "A specific vulnerability, CTF challenge, or system you tried to break or protect"],
    evidenceToUse: ["CTF write-ups or a security lab project - walk through your reasoning, not just the final flag", "A secure-coding or networking project", "A moment you noticed a security or privacy problem in something ordinary (an app, a school system)"],
    activitiesToMention: ["CTF teams or cybersecurity clubs", "Independent security research or responsible-disclosure experience (if any)", "Networking/systems coursework or self-study"],
    risksToAvoid: ["Anything that could read as bragging about unauthorized access - always frame within legal/ethical bounds", "Pure technical play-by-play with no reflection on why it mattered", "Overclaiming expertise you don't yet have"],
    reflectionQuestions: ["What's a moment you thought like an attacker to become a better defender?", "Why does trust in systems matter to you personally, not just abstractly?", "What's a security problem you noticed in everyday life that most people don't think about?"],
    possibleOutline: ["Open on a specific challenge or vulnerability you investigated", "Show your reasoning process, including dead ends", "Connect it to a broader idea about trust, risk, or responsibility", "Close on what kind of protector/builder you want to become"],
  },
  {
    trackId: "eecs_ai_systems",
    trackName: "EECS / Computer Engineering + AI Systems",
    strongThemes: ["Where hardware and software meet", "Building something physical that also has to 'think'", "The gap between a clean idea and a messy, real circuit/board"],
    evidenceToUse: ["An embedded systems, robotics, or hardware+ML project - describe the debugging, not just the demo", "Competitions (robotics, maker fairs) framed around a specific technical decision", "Moments where a physical constraint forced a creative software solution, or vice versa"],
    activitiesToMention: ["Robotics teams or maker/hardware clubs", "Embedded systems or circuits projects (school or independent)", "Any project pairing hardware with applied ML"],
    risksToAvoid: ["Treating hardware and software as separate stories instead of one integrated idea", "Overloading with technical specs instead of narrative", "Skipping the failure/debugging process, which is often the most interesting part"],
    reflectionQuestions: ["What's a moment a physical constraint changed how you thought about the software (or vice versa)?", "What does it feel like when a system you built actually works for the first time?", "What unsolved hardware+AI problem do you want to keep working on?"],
    possibleOutline: ["Open in the middle of a build/debug moment", "Explain what you were trying to make work and why it mattered to you", "Show the iteration across hardware and software", "Close on the bigger question that experience opened up"],
  },
  {
    trackId: "engineering_robotics_aerospace",
    trackName: "Engineering / Robotics / Aerospace",
    strongThemes: ["Designing something that has to work in the physical world, not just on paper", "Iteration - prototype, fail, redesign", "A specific mechanical, controls, or systems problem you wrestled with"],
    evidenceToUse: ["A robotics build, CAD project, or controls/autonomy project - focus on design decisions and trade-offs", "Competitions (FIRST Robotics, aerospace/design competitions) told through one specific moment, not the whole season", "A failure (a part that broke, a system that didn't balance) and what you changed"],
    activitiesToMention: ["Robotics or engineering clubs/competitions", "Independent CAD/build projects", "Internships, camps, or mentorships in engineering settings"],
    risksToAvoid: ["Team-story essays that never mention your individual contribution", "Listing every competition instead of going deep on one moment", "Technical detail with no personal reflection"],
    reflectionQuestions: ["What's a design decision you made that didn't work, and what did you change?", "What does 'good engineering' mean to you, beyond just making something work?", "What real-world problem do you want your engineering to eventually solve?"],
    possibleOutline: ["Open on a specific build/test moment, ideally one that went wrong", "Explain the design thinking behind your fix", "Show what changed in how you approach problems", "Close on what kind of engineer you want to become"],
  },
  {
    trackId: "applied_physics_quantum",
    trackName: "Applied Physics / Quantum",
    strongThemes: ["Wrestling with an idea most people find counterintuitive", "The gap between elegant theory and messy experiment/simulation", "Sustained curiosity about a fundamental question"],
    evidenceToUse: ["A simulation, research placement, or independent study project - describe the specific question you investigated", "A moment a physics concept genuinely reframed how you see something ordinary", "Olympiad, research, or lab experience told through one real moment, not a full CV list"],
    activitiesToMention: ["Physics research or lab placements (school-based or external)", "Physics/math competitions", "Independent study or simulation projects"],
    risksToAvoid: ["Trying to explain quantum mechanics to prove expertise instead of telling a personal story", "Overly abstract writing with no concrete anchor", "Name-dropping advanced concepts without showing genuine understanding"],
    reflectionQuestions: ["What's a physics idea that took you a long time to really understand, and what changed when it clicked?", "Where did theory and your actual experiment/simulation disagree, and what did you do?", "What question about how the universe works do you most want to keep chasing?"],
    possibleOutline: ["Open on a specific confusing or surprising moment in an experiment/simulation", "Walk through how you worked through it", "Connect it to why this kind of thinking appeals to you", "Close on the open question you want to keep pursuing"],
  },
  {
    trackId: "business_data_leadership",
    trackName: "Business / Leadership",
    strongThemes: ["A real decision you had to make with incomplete information", "Leading (or failing to lead) a team through a specific problem", "Where data, people, and strategy intersect"],
    evidenceToUse: ["A club, business project, or leadership role - focus on one hard decision, not a title list", "A market/business analysis project told through the reasoning process", "A moment you had to persuade, negotiate, or manage disagreement"],
    activitiesToMention: ["Leadership roles (with a specific accomplishment, not just the title)", "Business/investment clubs or competitions", "Entrepreneurial projects, even small or informal ones"],
    risksToAvoid: ["Resume-style listing of titles and awards instead of one grounded story", "Vague claims like 'I'm a natural leader' without a specific moment as evidence", "Taking full credit for team accomplishments"],
    reflectionQuestions: ["What's a decision you got wrong as a leader, and what did you learn?", "What does leadership look like when nobody's watching or when it's not going well?", "What kind of impact do you want your work to have on people, not just numbers?"],
    possibleOutline: ["Open in the middle of a specific decision or conflict", "Show your reasoning and what you tried", "Be honest about what didn't go perfectly", "Close on how it shaped the kind of leader/builder you want to be"],
  },
  {
    trackId: "human_rights_digital_ethics",
    trackName: "Human Rights / Digital Ethics",
    strongThemes: ["A moment technology's impact on people became personal or concrete to you", "Tension between innovation and harm, access and exclusion", "Advocacy or research grounded in a specific case, not abstract principle"],
    evidenceToUse: ["A research project, essay, or advocacy effort on a digital-rights or ethics topic - anchor it in one real case or person", "Debate, Model UN, journalism, or policy work told through a specific argument you developed", "A moment you changed your own mind after encountering a counterargument"],
    activitiesToMention: ["Human rights, policy, or ethics-focused clubs and research", "Journalism or writing that engages with a real ethical dilemma", "Community or advocacy work connected to technology's effects on people"],
    risksToAvoid: ["Broad statements about 'changing the world' without a concrete anchor", "One-sided arguments that never acknowledge complexity or trade-offs", "Performative activism language instead of genuine, specific engagement"],
    reflectionQuestions: ["What's a specific case where technology helped or harmed a real person or community, that you can't stop thinking about?", "Where do you sit on a genuine trade-off (privacy vs. safety, innovation vs. access) - and why?", "What would you actually want to change, and what's one concrete step toward it?"],
    possibleOutline: ["Open on a specific case, person, or moment, not an abstract topic", "Show your thinking evolve, including a real counterargument you took seriously", "Explain what you did (research, advocacy, writing) in response", "Close on what you still want to understand or do next"],
  },
  {
    trackId: "undecided_stem",
    trackName: "Undecided STEM",
    strongThemes: ["Genuine curiosity that spans more than one field, told honestly", "A specific project or question that pulled several interests together", "Comfort with not having a single, fixed answer yet"],
    evidenceToUse: ["Two or three real STEM experiences that share a common thread (a way of thinking, a type of problem) - name the thread explicitly", "A project that combined disciplines (e.g. biology + coding, physics + design)", "A moment of choosing to explore rather than specialize too early, and why"],
    activitiesToMention: ["Any STEM clubs, research, or projects - but chosen for what they reveal about how you think, not to look broad for its own sake", "Coursework or self-study that shows range with intent, not scattershot involvement"],
    risksToAvoid: ["Listing unrelated activities with no connecting idea", "Sounding directionless rather than genuinely exploratory", "Apologizing for being undecided instead of owning it as a real approach"],
    reflectionQuestions: ["What's the common thread across the different things you're curious about?", "What's a specific moment two different interests collided in one project?", "What do you hope to discover in college that will help you decide, and why does that excite you rather than worry you?"],
    possibleOutline: ["Open on a specific project or moment that sits at the intersection of your interests", "Name the connecting thread explicitly", "Show evidence across more than one area", "Close on what you want college to help you figure out, and why that's exciting rather than a gap"],
  },
];

export function getTrackStrategy(trackId) {
  if (!trackId) return ESSAY_TRACK_STRATEGY;
  return ESSAY_TRACK_STRATEGY.filter((t) => t.trackId === trackId);
}

// ---------------------------------------------------------------------------
// Sample Structures (Part G) -- outline shapes, opening approaches, and
// strong-vs-weak FRAGMENT examples only. Never a full essay, never lifted
// from a real student's work. Always paired with the authenticity/revision
// checklists and an explicit disclaimer (enforced in the route response and
// again in the client UI) that the student must write the final essay
// themselves, in their own voice, consistent with each college's AI-use
// policy.
export const SAMPLE_STRUCTURES = {
  disclaimer: "These are generic outline shapes and short fragment examples for brainstorming only - not full essays, and not copied from any real student's work. The final essay must be written by the student, in the student's own voice, and must follow each college's specific policy on AI use in applications.",
  openingApproaches: [
    { name: "In-scene opening", description: "Drop the reader into one specific, small moment - mid-action - rather than summarizing your whole background first.", strongFragment: "The soldering iron slipped, and the smell of burnt plastic told me before I looked down that I'd just ruined three hours of work.", weakFragment: "Ever since I was young, I have always been passionate about engineering and technology." },
    { name: "Honest-question opening", description: "Open with the real, specific question you were wrestling with - not a rhetorical or generic one.", strongFragment: "Why did the model predict rain with 90% confidence on the one day it stayed sunny?", weakFragment: "Have you ever wondered how technology can change the world?" },
    { name: "Small-detail opening", description: "Start with one concrete, sensory detail that anchors the story before zooming out.", strongFragment: "Four sticky notes, all in my handwriting, all disagreeing with each other.", weakFragment: "I am a hardworking and dedicated student who loves to learn." },
  ],
  outlineShapes: [
    { name: "Moment → Meaning", steps: ["Open on one specific, small moment", "Show what you did and what you were thinking", "Zoom out to what it revealed about you", "Close on how it changed your direction or thinking"] },
    { name: "Problem → Attempt → Failure → Insight", steps: ["State the real problem you were trying to solve", "Describe your first attempt", "Be honest about what didn't work", "Explain what you learned and what you'd do differently"] },
    { name: "Thread across experiences", steps: ["Name the connecting idea or question up front", "Give two or three brief, concrete examples that share that thread", "Explain why the thread matters to you personally", "Close on where you want to take it next"] },
  ],
  revisionChecklist: [
    "Could this sentence have been written by any applicant, or only by me?",
    "Is there at least one specific, concrete detail (a number, a place, a name, a smell, an exact quote) in the opening paragraph?",
    "Does the essay show a moment of difficulty, failure, or uncertainty - not just success?",
    "Does the last paragraph say something new, or does it just repeat the introduction?",
    "Read it aloud - does it sound like how the student actually talks and thinks?",
  ],
  authenticityChecklist: [
    "The student can explain, in their own words, why every sentence is there.",
    "No fact, achievement, or story detail was invented or exaggerated.",
    "The essay was written by the student, with AI (if used at all) limited to brainstorming/feedback in a way consistent with each college's specific AI-use policy - never used to generate the submitted text itself.",
    "A trusted adult who knows the student well would say 'this sounds like them.'",
  ],
};

// ---------------------------------------------------------------------------
// Published Example Essays -- a small, hand-verified list of pages where a
// college's OWN admissions office has published real, successful applicant
// essays (with the student's permission), not a third-party aggregator site
// reproducing essays without verification. Each entry was checked by hand
// against the live official page before being added; last_checked is the
// verification date, and the family should still expect this list to drift
// out of date over time (colleges redesign sites, retire pages, or rotate
// which essays are featured) -- hence the disclaimer and re-check reminder.
// This app deliberately does NOT link general essay-aggregator sites
// (e.g. commercial "essays that worked" blogs) because those republish text
// without the college's own verification of authenticity or currency, which
// conflicts with this app's "official sources only" rule. Not every
// selective college publishes real essays this way, so this list is
// necessarily incomplete -- it is not a ranking or endorsement of any
// particular school.
// Every entry is hand-verified by fetching the live page before being added
// (see the session notes for verification dates). `isRealApplicantEssay`
// distinguishes real admitted-student essays (JHU, Conn College, Hamilton,
// Emory) from a college's own staff-written ILLUSTRATIVE example (UIUC's
// admissions blog explicitly says "we wrote about" / "we've provided an
// example response" -- useful and official, but not a real applicant's work,
// so it must never be presented as if it were one.
export const PUBLISHED_EXAMPLE_ESSAYS = [
  {
    college: "Johns Hopkins University",
    title: "Essays That Worked",
    url: "https://apply.jhu.edu/college-planning-guide/essays-that-worked/",
    description: "Real admitted-student essays, nominated by the Hopkins admissions committee, with notes on what stood out.",
    sourceType: "Official college admissions site",
    isRealApplicantEssay: true,
    lastChecked: "2026-07-19",
  },
  {
    college: "Connecticut College",
    title: "Essays That Worked",
    url: "https://www.conncoll.edu/admission/apply/essays-that-worked/",
    description: "A collection of outstanding admission essays from admitted students, published by the admissions office.",
    sourceType: "Official college admissions site",
    isRealApplicantEssay: true,
    lastChecked: "2026-07-19",
  },
  {
    college: "Hamilton College",
    title: "Essays That Worked",
    url: "https://www.hamilton.edu/admission/apply/college-essays-that-worked",
    description: "Exceptional admission essays from Hamilton's incoming class, published by the admissions office.",
    sourceType: "Official college admissions site",
    isRealApplicantEssay: true,
    lastChecked: "2026-07-19",
  },
  {
    college: "Emory University",
    title: "Application Tips (includes essay examples)",
    url: "https://apply.emory.edu/apply/first-year/tips/index.html",
    description: "Emory admissions' own application tips page, which includes real essay excerpts with admissions feedback on what worked.",
    sourceType: "Official college admissions site",
    isRealApplicantEssay: true,
    lastChecked: "2026-07-19",
  },
  {
    college: "University of Illinois Urbana-Champaign",
    aliases: ["UIUC", "University of Illinois", "Illinois Urbana-Champaign"],
    title: "Illinois College Essay Example Prompts",
    url: "https://blog.admissions.illinois.edu/uiuc-college-essay-example-prompts/",
    description: "Illinois's own admissions office wrote a full example response to one of its essay prompts to show applicants what a strong structure looks like. This is a staff-written illustration, NOT a real applicant's essay -- treat it purely as a structure example.",
    sourceType: "Official college admissions site (staff-written example)",
    isRealApplicantEssay: false,
    lastChecked: "2026-07-19",
  },
  {
    college: "Massachusetts Institute of Technology",
    aliases: ["MIT"],
    title: "\"my MIT admissions essays\" -- MIT Admissions Blog",
    url: "https://mitadmissions.org/blogs/tag/essay/",
    description: "MIT's own official admissions blog (run by MIT Admissions, not a third party) periodically has current MIT students republish the full, word-for-word text of the actual essays they submitted as applicants, with retrospective commentary on each -- for example \"my MIT admissions essays\" by Victor D. '27 (2025) and \"my application essays\" by Rona W. '23 (2019). This tag page indexes every confirmed real-essay post found on the blog.",
    sourceType: "Official college admissions site",
    isRealApplicantEssay: true,
    lastChecked: "2026-07-21",
  },
];

export const PUBLISHED_EXAMPLE_ESSAYS_DISCLAIMER =
  "These are published directly by each college's own admissions office -- never a third-party site's reproductions, and never generated by this app. Most are real essays from admitted students; one (Illinois) is a staff-written illustrative example, clearly labeled as such. Read for tone and structure only, and never copy language or structure into your own essay. Most colleges do not publish this resource at all, so this list is short and necessarily incomplete -- it is not a ranking of top colleges, just the schools we could verify. Links can go stale; if one doesn't load, search the college's own admissions site directly.";

// ---------------------------------------------------------------------------
// Story Bank helpers (Part H)
// ---------------------------------------------------------------------------
export function hydrateStory(row) {
  if (!row) return row;
  let tracksSupported = [];
  try { tracksSupported = JSON.parse(row.tracks_supported_json || "[]"); } catch { /* ignore */ }
  return { ...row, tracksSupported };
}

// Suggested story matches (Part J) -- a lightweight, transparent overlap
// score between one essay prompt and the family's own Story Bank entries, so
// the dashboard can suggest "you might use this story for this prompt"
// without ever writing anything on the student's behalf. Purely a ranking
// aid over material the family already entered themselves -- no AI call, no
// generated text, nothing invented. Scoring: +3 if the story's track list
// includes the prompt's related_track, +1 per shared meaningful word (5+
// letters, common-word list excluded) between the prompt text and the
// story's theme/challenge/impact/whatItReveals/possiblePrompts fields.
const STORY_MATCH_STOPWORDS = new Set([
  "about", "which", "their", "there", "these", "those", "would", "could",
  "should", "share", "story", "describe", "explain", "words", "essay",
  "prompt", "college", "university", "application", "person", "people",
]);
function meaningfulWords(text) {
  return new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 5 && !STORY_MATCH_STOPWORDS.has(w))
  );
}
export function findStoryMatchesForPrompt(studentId, { promptText, relatedTrack }) {
  const stories = db.prepare("SELECT * FROM essay_story_bank WHERE student_id=?").all(studentId).map(hydrateStory);
  if (!stories.length) return [];
  const promptWords = meaningfulWords(promptText);
  const scored = stories.map((s) => {
    let score = 0;
    if (relatedTrack && s.tracksSupported.includes(relatedTrack)) score += 3;
    const storyText = [s.theme, s.challenge, s.impact, s.what_it_reveals, s.possible_prompts, s.related_activity].filter(Boolean).join(" ");
    const storyWords = meaningfulWords(storyText);
    for (const w of promptWords) if (storyWords.has(w)) score += 1;
    return { story: s, score };
  }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((m) => ({ ...m.story, matchScore: m.score }));
}

// ---------------------------------------------------------------------------
// Essay Workload Planner (Part I)
// ---------------------------------------------------------------------------
function groupCount(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || "Unspecified";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function buildWorkloadSummary(studentId) {
  const prompts = db.prepare("SELECT * FROM essay_prompts WHERE student_id=?").all(studentId);
  const total = prompts.length;
  let common = 0, supplemental = 0, honors = 0, major = 0, other = 0;
  for (const p of prompts) {
    const t = p.essay_type || "";
    if (t === "Common App main essay" || t === "Coalition essay" || t === "UC Personal Insight Question") common++;
    else if (t === "Honors / scholarship essay") honors++;
    else if (t === "Major / program-specific essay") major++;
    else if (t === "College-specific supplemental essay") supplemental++;
    else other++;
  }
  const notStarted = prompts.filter((p) => (p.status || "Not started") === "Not started").length;
  const needsVerification = prompts.filter((p) => {
    const v = p.verification_status || "Needs manual verification";
    return v !== "Official source verified" && v !== "User verified";
  }).length;
  const deadlines = prompts.map((p) => p.deadline).filter(Boolean).sort((a, b) => {
    const da = Date.parse(a), db2 = Date.parse(b);
    if (!isNaN(da) && !isNaN(db2)) return da - db2;
    return String(a).localeCompare(String(b));
  });

  return {
    totalEssaysRequired: total,
    common, supplemental, honors, major, other,
    earliestDeadline: deadlines[0] || null,
    essaysNotStarted: notStarted,
    essaysNeedingVerification: needsVerification,
    groupedByPlatform: groupCount(prompts, (p) => p.essay_type),
    groupedByCollege: groupCount(prompts, (p) => p.college_name || p.college_id),
    groupedByDeadline: groupCount(prompts.filter((p) => p.deadline), (p) => p.deadline),
    groupedByTrack: groupCount(prompts.filter((p) => p.related_track), (p) => p.related_track),
  };
}

// ---------------------------------------------------------------------------
// Decision Plan integration (Part M) -- one essay-status summary per college
// on the family's Decision Plan list, read-only cross-reference (same don't-
// merge-two-systems pattern used throughout this app). Decision Plan's own
// route calls this rather than duplicating the logic.
// ---------------------------------------------------------------------------
export function buildDecisionPlanEssayStatus(studentId) {
  const items = db.prepare("SELECT item_id, college_id, college_name FROM decision_plan_items WHERE student_id=?").all(studentId);
  const prompts = db.prepare("SELECT * FROM essay_prompts WHERE student_id=?").all(studentId);
  const timelineRows = db.prepare("SELECT college_id, event_type, event_date, application_round FROM college_application_timeline_events WHERE student_id=?").all(studentId);
  const deadlineByCollege = {};
  for (const t of timelineRows) {
    if (!t.college_id || !DEADLINE_EVENT_TYPES.includes(t.event_type) || !t.event_date) continue;
    const existing = deadlineByCollege[t.college_id];
    if (!existing || String(t.event_date).localeCompare(String(existing.event_date)) < 0) deadlineByCollege[t.college_id] = t;
  }

  return items.map((it) => {
    const rows = it.college_id
      ? prompts.filter((p) => p.college_id === it.college_id)
      : prompts.filter((p) => !p.college_id && String(p.college_name || "").toLowerCase() === String(it.college_name || "").toLowerCase());

    const essayCount = rows.length;
    const currentPromptsVerified = rows.some((p) => p.cycle_type === "Current cycle" && (p.verification_status === "Official source verified" || p.verification_status === "User verified"));
    const previousYearPromptsAvailable = rows.some((p) => p.cycle_type === "Previous cycle");
    const promptsNeedingVerification = rows.filter((p) => p.verification_status !== "Official source verified" && p.verification_status !== "User verified").length;
    const notStarted = rows.filter((p) => (p.status || "Not started") === "Not started").length;
    const inProgress = rows.filter((p) => !["Not started", "Final", "Submitted"].includes(p.status || "Not started")).length;
    const specialProgramEssaysRequired = rows.some((p) => p.essay_type === "Honors / scholarship essay" || p.essay_type === "Major / program-specific essay" || p.program_label);
    const tl = it.college_id ? deadlineByCollege[it.college_id] : null;
    const promptDeadlines = rows.map((p) => p.deadline).filter(Boolean);
    const earliestEssayDeadline = [tl?.event_date, ...promptDeadlines].filter(Boolean).sort()[0] || null;

    let essayStatus;
    if (!essayCount) essayStatus = "No essays tracked yet";
    else if (notStarted === essayCount) essayStatus = "Not started";
    else if (notStarted === 0 && inProgress === 0) essayStatus = "All essays finalized/submitted";
    else essayStatus = `${inProgress + notStarted} of ${essayCount} not yet finalized`;

    let actionNeeded;
    if (!essayCount) actionNeeded = 'Use "Find essay requirements" in the Essay Center for this college.';
    else if (promptsNeedingVerification > 0) actionNeeded = `Verify ${promptsNeedingVerification} prompt(s) against the official application portal.`;
    else if (notStarted > 0) actionNeeded = `Start ${notStarted} essay(s).`;
    else actionNeeded = null;

    return {
      itemId: it.item_id, collegeId: it.college_id, collegeName: it.college_name,
      essayCount, currentPromptsVerified, previousYearPromptsAvailable, promptsNeedingVerification,
      essayStatus, earliestEssayDeadline, specialProgramEssaysRequired, actionNeeded,
    };
  });
}
