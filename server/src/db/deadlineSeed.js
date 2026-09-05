// deadlineSeed.js - verified deadline profiles for seeded colleges. Dates that
// recur year to year (e.g. common EA/RD dates) are marked "verified" with a
// source URL and last-reviewed date; anything uncertain is left null and shows
// "Data unavailable" rather than a guess. ALWAYS confirmed on official sites.
//
// IMPORTANT: deadlines change each cycle. These are labeled with confidence and
// a source URL so the user can verify. We do NOT invent dates.

export const DEADLINE_PROFILES = [
  {
    college_id: "166683", // MIT
    application_deadlines_json: JSON.stringify({ EA: "Nov 1", RA: "Jan 4" }),
    deadline_source_url: "https://mitadmissions.org/apply/firstyear/deadlines-requirements/",
    deadline_last_reviewed: "2025-10",
    css_profile_required: "yes",
    css_profile_deadline: "EA: Nov 1 · RA: Feb 15",
    css_profile_source_url: "https://sfs.mit.edu/",
    fafsa_priority_deadline: "EA: Nov 1 · RA: Feb 15",
    fafsa_source_url: "https://sfs.mit.edu/",
    scholarship_deadline: null, scholarship_source_url: null,
    honors_deadline: null, honors_source_url: null,
    portfolio_deadline: null, portfolio_source_url: null,
    interview_deadline: null, interview_source_url: null,
    deadline_confidence_level: "verified",
    notes: "MIT uses Early Action (non-restrictive) and Regular Action. No separate honors application.",
  },
  {
    college_id: "186131", // Princeton
    application_deadlines_json: JSON.stringify({ SCEA: "Nov 1", RD: "Jan 1" }),
    deadline_source_url: "https://admission.princeton.edu/how-apply/application-deadlines-requirements",
    deadline_last_reviewed: "2025-10",
    css_profile_required: "yes",
    css_profile_deadline: "SCEA: Nov 9 · RD: Feb 1",
    css_profile_source_url: "https://finaid.princeton.edu/",
    fafsa_priority_deadline: "SCEA: Nov 9 · RD: Feb 1",
    fafsa_source_url: "https://finaid.princeton.edu/",
    scholarship_deadline: null, scholarship_source_url: null,
    honors_deadline: null, honors_source_url: null,
    portfolio_deadline: null, portfolio_source_url: null,
    interview_deadline: null, interview_source_url: null,
    deadline_confidence_level: "verified",
    notes: "Single-Choice Early Action (restrictive). Princeton meets full demonstrated need with grants.",
  },
  {
    college_id: "186380", // Rutgers-New Brunswick
    application_deadlines_json: JSON.stringify({ EA: "Nov 1", RD: "Dec 1 (priority)" }),
    deadline_source_url: "https://admissions.rutgers.edu/apply/application-deadlines",
    deadline_last_reviewed: "2025-10",
    css_profile_required: "no",
    css_profile_deadline: null,
    css_profile_source_url: null,
    fafsa_priority_deadline: "Feb 15 (priority for state aid)",
    fafsa_source_url: "https://financialaid.rutgers.edu/",
    scholarship_deadline: "Dec 1 (with EA for merit consideration)",
    scholarship_source_url: "https://scholarships.rutgers.edu/",
    honors_deadline: "Dec 1 (Honors College - apply EA)",
    honors_source_url: "https://honorscollege.rutgers.edu/",
    portfolio_deadline: null, portfolio_source_url: null,
    interview_deadline: null, interview_source_url: null,
    deadline_confidence_level: "verified",
    notes: "Apply by Dec 1 EA for best scholarship and Honors College consideration. FAFSA only (no CSS).",
  },
  {
    college_id: "211440", // Carnegie Mellon (real IPEDS/Scorecard UNITID; 201645 is actually Case Western Reserve)
    application_deadlines_json: JSON.stringify({ ED: "Nov 2", RD: "Jan 4", "RD (Drama/Music)": "Dec 1" }),
    deadline_source_url: "https://www.cmu.edu/admission/admission/application-plans-deadlines",
    deadline_last_reviewed: "2026-07",
    css_profile_required: "yes",
    css_profile_deadline: null,
    css_profile_source_url: null,
    fafsa_priority_deadline: null,
    fafsa_source_url: null,
    scholarship_deadline: null, scholarship_source_url: null,
    honors_deadline: null, honors_source_url: null,
    portfolio_deadline: "College of Fine Arts applicants are encouraged to apply earlier to secure audition/portfolio review slots -- confirm exact date on the official CFA applicant page.",
    portfolio_source_url: "https://www.cmu.edu/admission/admission/college-of-fine-arts-applicants",
    interview_deadline: null, interview_source_url: null,
    deadline_confidence_level: "verified",
    notes: "ED notified by Dec 15, enroll by Feb 1. RD notified by Apr 1 (no later than), enroll by May 1. Schools of Drama and Music use a Dec 1 Regular Decision deadline instead of Jan 4. These are the cycle current as of the last-reviewed date above -- always confirm on CMU's own admission site before treating a date as final, since deadlines are republished each cycle and can shift by a day or two.",
  },
  {
    college_id: "139755", // Georgia Tech
    application_deadlines_json: JSON.stringify({ "EA I (GA residents)": "Oct 15", "EA II (non-GA)": "Nov 1", RD: "Jan 4" }),
    deadline_source_url: "https://admission.gatech.edu/first-year/dates-deadlines/",
    deadline_last_reviewed: "2025-10",
    css_profile_required: "no",
    css_profile_deadline: null, css_profile_source_url: null,
    fafsa_priority_deadline: "Jan 31",
    fafsa_source_url: "https://finaid.gatech.edu/",
    scholarship_deadline: "Apply EA for merit consideration",
    scholarship_source_url: "https://finaid.gatech.edu/scholarships/",
    honors_deadline: null, honors_source_url: null,
    portfolio_deadline: null, portfolio_source_url: null,
    interview_deadline: null, interview_source_url: null,
    deadline_confidence_level: "verified",
    notes: "Georgia residents have an earlier EA deadline than non-residents. CS is highly competitive.",
  },
];

// ---------------------------------------------------------------------------
// TIMELINE_AUTOFILL_PROFILES -- name-pattern matched (same technique as
// applicationPathways.js's suggestPlatform/COLLEGE_PATTERNS), hand-verified
// application-timeline dates for well-known colleges. Used by the "Auto-fill
// official dates" button on a selected college's Application Timeline.
//
// Every entry was checked directly against the college's own admissions page
// (or, for the "Application opens" row shared by Common-App colleges,
// against commonapp.org) on the date in `lastChecked`. Nothing here is a
// guess -- if a college isn't listed, the button says so and the family uses
// "Verify deadlines" (crawl) or manual entry instead. Confidence is marked
// "verified" only when checked directly against the college's own current
// page; "recurring pattern -- confirm" when the source page still showed a
// stale prior-cycle label at check time (the underlying date has held for
// multiple years running, but the page itself hadn't yet been refreshed for
// the newest cycle) -- these are still shown as a starting point, just with
// an extra on-screen caution.
//
// IMPORTANT: deadlines shift by a day or two most cycles (weekday
// adjustments, calendar changes). Re-verify before a real deadline.
export const TIMELINE_AUTOFILL_PROFILES = [
  {
    key: "cmu", re: /\bcarnegie mellon\b|^cmu$/i, collegeName: "Carnegie Mellon University",
    confidence: "verified", lastChecked: "2026-07-19",
    sourceUrl: "https://www.cmu.edu/admission/admission/application-plans-deadlines",
    events: [
      { eventType: "Application opens", eventLabel: "Common App opens", eventDate: "Aug 1", applicationRound: null, sourceUrl: "https://www.commonapp.org/", sourceLabel: "commonapp.org (Common App is CMU's exclusive application platform)" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 2", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification (by)", eventDate: "Dec 15", applicationRound: "ED" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Early Decision enrollment deposit", eventDate: "Feb 1", applicationRound: "ED" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 4", applicationRound: "RD" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline (Drama/Music)", eventDate: "Dec 1", applicationRound: "RD", programLabel: "Drama/Music" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification (no later than)", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Regular Decision enrollment deposit", eventDate: "May 1", applicationRound: "RD" },
    ],
  },
  {
    key: "harvard", re: /\bharvard\b/i, collegeName: "Harvard College",
    confidence: "verified", lastChecked: "2026-07-19",
    sourceUrl: "https://college.harvard.edu/admissions/apply/first-year-applicants",
    events: [
      { eventType: "Application opens", eventLabel: "Common App opens", eventDate: "Aug 1", applicationRound: null, sourceUrl: "https://www.commonapp.org/" },
      { eventType: "REA / SCEA deadline", eventLabel: "Restrictive Early Action deadline", eventDate: "Nov 1", applicationRound: "REA/SCEA" },
      { eventType: "Decision notification", eventLabel: "Restrictive Early Action notification", eventDate: "Dec 15", applicationRound: "REA/SCEA", notes: "Harvard says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Harvard says \"end of March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply deadline", eventDate: "May 1", applicationRound: "RD", notes: "Harvard says \"early May,\" no deposit required." },
    ],
  },
  {
    key: "yale", re: /\byale university\b|^yale$/i, collegeName: "Yale University",
    confidence: "verified", lastChecked: "2026-07-19",
    sourceUrl: "https://admissions.yale.edu/timelines",
    events: [
      { eventType: "Application opens", eventLabel: "Common App opens", eventDate: "Aug 1", applicationRound: null, sourceUrl: "https://www.commonapp.org/" },
      { eventType: "REA / SCEA deadline", eventLabel: "Single-Choice Early Action deadline", eventDate: "Nov 1", applicationRound: "REA/SCEA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Dec 15", applicationRound: "REA/SCEA", notes: "Yale says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 2", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD", notes: "Yale says \"late March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Admitted student reply deadline", eventDate: "May 1", applicationRound: null },
    ],
  },
  {
    key: "columbia", re: /\bcolumbia university\b/i, collegeName: "Columbia University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-20",
    sourceUrl: "https://undergrad.admissions.columbia.edu/apply/firstyear",
    notes: "Columbia's own deadlines page still showed a 'Fall 2025 applications now available' label when this was last checked (2026-07) -- these dates match the last several cycles, but confirm on the official page once it's refreshed for the current cycle.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Columbia says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD", notes: "Columbia says \"late March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply deadline", eventDate: "May 1", applicationRound: "RD" },
    ],
    // Application-detail fields (Part of the requirement record's YNU/detail
    // fields) -- read directly off Columbia's own "First-Year Applicants"
    // page on 2026-07-20 (see sourceUrl). Columbia does not run a separate
    // honors-college or merit-scholarship application (aid is need-based
    // only), and general first-year applicants don't submit a portfolio
    // (arts-specific portfolio review is a separate, program-limited path).
    requirements: {
      honorsAppRequired: "No",
      scholarshipAppRequired: "No",
      programSpecificAppRequired: "No",
      portfolioRequired: "No",
      interviewRequired: "No",
      recommendationsRequired: "Yes",
      transcriptRequired: "Yes",
      testPolicy: "Test-optional (Columbia will require SAT/ACT scores again starting the 2027-2028 cycle)",
      applicationFee: "$85",
      feeWaiverAvailable: "Yes",
    },
  },
  {
    key: "cornell", re: /\bcornell university\b/i, collegeName: "Cornell University",
    confidence: "verified", lastChecked: "2026-07-19",
    sourceUrl: "https://faq.enrollment.cornell.edu/kb/article/199-when-is-the-application-deadline/",
    events: [
      { eventType: "Application opens", eventLabel: "Common App opens", eventDate: "Aug 1", applicationRound: null, sourceUrl: "https://www.commonapp.org/" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Cornell says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 2", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Cornell says \"early April.\"" },
    ],
  },
  {
    key: "dartmouth", re: /\bdartmouth\b/i, collegeName: "Dartmouth College",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-19",
    sourceUrl: "https://admissions.dartmouth.edu/apply-dartmouth",
    notes: "Confirmed via Dartmouth's own admissions glossary pages rather than a single deadlines table -- worth a quick check on the official Apply page before relying on it.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Dartmouth says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Dartmouth says \"late March/early April.\"" },
    ],
  },
  {
    key: "brown", re: /\bbrown university\b/i, collegeName: "Brown University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-19",
    sourceUrl: "https://admission.brown.edu/first-year",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Brown says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Brown says \"early April.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply deadline", eventDate: "May 1", applicationRound: "RD" },
    ],
  },
  {
    key: "upenn", re: /\buniversity of pennsylvania\b|\bupenn\b/i, collegeName: "University of Pennsylvania",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-19",
    sourceUrl: "https://admissions.upenn.edu/how-to-apply/first-year-applicants",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Penn says \"December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply deadline", eventDate: "May 1", applicationRound: "RD" },
    ],
  },
  {
    key: "georgetown", re: /\bgeorgetown university\b/i, collegeName: "Georgetown University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-19",
    sourceUrl: "https://uadmissions.georgetown.edu/applying/first-year/",
    notes: "Georgetown does NOT use the Common App -- it uses its own application system.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Dec 15", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
    ],
  },
  {
    key: "uiuc", re: /\buniversity of illinois.*urbana|\buiuc\b/i, collegeName: "University of Illinois Urbana-Champaign",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-19",
    sourceUrl: "https://www.admissions.illinois.edu/apply/freshman/dates",
    notes: "UIUC's own Dates & Deadlines page was still labeled for the prior cycle when this was last checked (2026-07) -- it typically refreshes closer to the application opening. Confirm on the official page before relying on it.",
    events: [
      { eventType: "Application opens", eventLabel: "myIllini application opens", eventDate: "Sep 1", applicationRound: null },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action status update", eventDate: "Jan 30", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 6", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Accept deadline", eventDate: "May 1", applicationRound: null },
    ],
  },
  {
    key: "mit", re: /\bmassachusetts institute of technology\b|^mit$/i, collegeName: "Massachusetts Institute of Technology",
    confidence: "verified", lastChecked: "2025-10",
    sourceUrl: "https://mitadmissions.org/apply/firstyear/deadlines-requirements/",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Action deadline", eventDate: "Jan 4", applicationRound: "RD" },
    ],
  },
  {
    key: "princeton", re: /\bprinceton university\b|^princeton$/i, collegeName: "Princeton University",
    confidence: "verified", lastChecked: "2025-10",
    sourceUrl: "https://admission.princeton.edu/how-apply/application-deadlines-requirements",
    events: [
      { eventType: "REA / SCEA deadline", eventLabel: "Single-Choice Early Action deadline", eventDate: "Nov 1", applicationRound: "REA/SCEA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
    ],
  },
  {
    key: "gatech", re: /\bgeorgia institute of technology\b|\bgeorgia tech\b/i, collegeName: "Georgia Institute of Technology",
    confidence: "verified", lastChecked: "2025-10",
    sourceUrl: "https://admission.gatech.edu/first-year/dates-deadlines/",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action I deadline (Georgia residents)", eventDate: "Oct 15", applicationRound: "EA" },
      { eventType: "Early Action deadline", eventLabel: "Early Action II deadline (non-Georgia residents)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 4", applicationRound: "RD" },
    ],
  },
  {
    key: "rutgers", re: /\brutgers\b/i, collegeName: "Rutgers University-New Brunswick",
    confidence: "verified", lastChecked: "2025-10",
    sourceUrl: "https://admissions.rutgers.edu/apply/application-deadlines",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Priority deadline", eventDate: "Dec 1", applicationRound: "Priority", notes: "Rutgers is rolling after this; Dec 1 is the priority date for best scholarship/Honors College consideration." },
    ],
  },
  {
    // Added directly in response to a family reporting this college showed
    // "Not found" despite the deadlines being easy to find by hand. Root
    // cause: Caltech's official deadlines page renders its whole deadline
    // table as an IMAGE (a screenshot embedded in the page), not as text --
    // this app's discovery only reads visible page TEXT (no OCR), so it
    // found a real page with zero extractable deadline text. Verified
    // directly against the page's own surrounding prose (which IS text) on
    // the date below.
    key: "caltech", re: /\bcalifornia institute of technology\b|\bcaltech\b/i, collegeName: "California Institute of Technology",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.admissions.caltech.edu/apply/first-year-applicants/deadlines",
    notes: "Caltech's deadlines page currently shows dates for the Fall 2026 entry cycle (REA due Nov 1, 2025; RD due Jan 5, 2026) -- that cycle has already concluded. These dates match Caltech's stable multi-year pattern (REA Nov 1, RD Jan 5) and are shown as a starting point for the next cycle; confirm the exact date once Caltech publishes it. Note: Caltech's own deadline table is an image, not text, so this app's automatic site search cannot read it directly -- this reference entry is the reliable path for this college going forward.",
    events: [
      { eventType: "REA / SCEA deadline", eventLabel: "Restrictive Early Action deadline", eventDate: "Nov 1", applicationRound: "REA/SCEA", notes: "You have until Nov 6 to submit remaining required/supplemental materials; standardized testing (if submitted) must be complete by Nov 30." },
      { eventType: "Decision notification", eventLabel: "Restrictive Early Action notification", eventDate: "Dec 15", applicationRound: "REA/SCEA", notes: "Caltech says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD", notes: "You have until Jan 11 to submit remaining required/supplemental materials; standardized testing (if submitted) must be complete by Dec 31." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 15", applicationRound: "RD", notes: "Caltech says \"mid-March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply deadline", eventDate: "May 1", applicationRound: null },
    ],
  },
  {
    // Added alongside Caltech above for the same reason: reported as "Not
    // found" despite the deadlines being real and public. Stanford's page IS
    // real text (unlike Caltech's), so this one is a gap in this app's
    // discovery/matching rather than a genuine JS/image barrier -- worth
    // fixing as a reference entry regardless, since it's now hand-verified.
    key: "stanford", re: /\bstanford university\b|^stanford$/i, collegeName: "Stanford University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.stanford.edu/apply/first-year/index.html",
    notes: "Stanford's page (last updated by Stanford on Oct 1, 2025) currently shows dates for the Fall 2026 entry cycle, which has already concluded. These dates match Stanford's stable pattern (REA Nov 1, RD Jan 5) and are shown as a starting point for the next cycle; confirm the exact date once Stanford publishes it.",
    events: [
      { eventType: "REA / SCEA deadline", eventLabel: "Restrictive Early Action deadline", eventDate: "Nov 1", applicationRound: "REA/SCEA" },
      { eventType: "Decision notification", eventLabel: "Restrictive Early Action notification", eventDate: "Dec 15", applicationRound: "REA/SCEA", notes: "Stanford says \"mid-December\" (for financial-aid applicants who met the Nov 15 priority deadline)." },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Stanford says \"early April.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Student reply date", eventDate: "May 1", applicationRound: null },
    ],
    requirements: {
      testPolicy: "Requires ACT or SAT scores",
      applicationFee: "$100",
      feeWaiverAvailable: "Yes",
      recommendationsRequired: "Yes",
      transcriptRequired: "Yes",
    },
  },
  // --------------------------------------------------------------------
  // Batch added in response to a family asking for verified timelines
  // across a broader top-30-50 STEM-college list. Every entry below was
  // fetched directly from the college's own official admissions page
  // (or, where noted, an image-based table was read/transcribed directly)
  // on 2026-07-21. Colleges whose official pages were still showing an
  // already-completed prior cycle (not yet republished for the next one)
  // are marked "recurring pattern -- confirm" with a note explaining why,
  // same convention as Columbia/Brown/Dartmouth above -- never marked
  // "verified" unless the page itself explicitly confirmed the current
  // cycle (an explicit year label, or "last modified" metadata close to
  // the check date).
  // --------------------------------------------------------------------
  {
    key: "ucberkeley", re: /\buniversity of california,? berkeley\b|\bberkeley\b/i, collegeName: "University of California, Berkeley",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "UC's systemwide page still shows the completed Fall 2026 cycle (filing period Oct 1 - Dec 1, 2025) -- the next cycle hadn't been republished as of this check. All UC campuses share ONE systemwide filing period per campus choice (no separate EA/ED/RD rounds). Confirm the exact date once UC republishes.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "ucla", re: /\buniversity of california,? los angeles\b|\bucla\b/i, collegeName: "University of California, Los Angeles",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "Same shared UC systemwide filing period as UC Berkeley -- see that entry's note; this page had not yet been republished for the next cycle as of this check.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "ucsd", re: /\buniversity of california,? san diego\b|\bucsd\b|\buc san diego\b/i, collegeName: "University of California, San Diego",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "Same shared UC systemwide filing period as UC Berkeley -- see that entry's note; this page had not yet been republished for the next cycle as of this check.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "ucdavis", re: /\buniversity of california,? davis\b|\buc davis\b/i, collegeName: "University of California, Davis",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "Same shared UC systemwide filing period as UC Berkeley -- see that entry's note; this page had not yet been republished for the next cycle as of this check.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "ucirvine", re: /\buniversity of california,? irvine\b|\buc irvine\b/i, collegeName: "University of California, Irvine",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "Same shared UC systemwide filing period as UC Berkeley -- see that entry's note; this page had not yet been republished for the next cycle as of this check.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "ucsb", re: /\buniversity of california,? santa barbara\b|\bucsb\b|\buc santa barbara\b/i, collegeName: "University of California, Santa Barbara",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    notes: "Same shared UC systemwide filing period as UC Berkeley -- see that entry's note; this page had not yet been republished for the next cycle as of this check.",
    events: [
      { eventType: "Application opens", eventLabel: "UC filing period opens", eventDate: "Oct 1", applicationRound: "UC filing period" },
      { eventType: "Regular Decision deadline", eventLabel: "UC filing period deadline", eventDate: "Dec 1", applicationRound: "UC filing period" },
      { eventType: "Decision notification", eventLabel: "Admission decision released", eventDate: "Mar 31", applicationRound: "UC filing period", notes: "UC says decisions release between March 1-31; some campuses release earlier." },
      { eventType: "FAFSA priority deadline", eventLabel: "Cal Grant GPA verification deadline", eventDate: "Mar 2" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Statement of Intent to Register (SIR)", eventDate: "May 1" },
    ],
  },
  {
    key: "uw", re: /\buniversity of washington\b/i, collegeName: "University of Washington",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admit.washington.edu/apply/dates-deadlines/",
    notes: "UW does not offer Early Action/Early Decision -- one autumn deadline. Page shows no explicit cycle year (presented as recurring policy); confirm before relying on it. Enrollment reply date is stated to vary by individual offer letter, with May 1 as the general national target.",
    events: [
      { eventType: "Application opens", eventLabel: "Application opens", eventDate: "Aug 1" },
      { eventType: "Regular Decision deadline", eventLabel: "Autumn quarter application deadline", eventDate: "Nov 15", applicationRound: "RD", notes: "Test score deadline (if submitting) is Dec 31." },
      { eventType: "Decision notification", eventLabel: "Decision notification", eventDate: "Mar 15", applicationRound: "RD", notes: "UW says \"March 1-15.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment Confirmation Deposit", eventDate: "May 1", notes: "UW says to check your individual offer letter for the exact date." },
    ],
  },
  {
    key: "usc", re: /\buniversity of southern california\b|^usc$/i, collegeName: "University of Southern California",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.usc.edu/prospective-students/how-to-apply/first-year-students/",
    notes: "Page metadata showed a last-modified date 9 days before this check and cited next-cycle-specific dates directly, confirming current-cycle content. Early Decision/Early Action are not offered for the Kaufman School of Dance, School of Dramatic Arts, or Thornton School of Music (Regular Decision only, Dec 1 deadline for those programs).",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding, most majors)", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (most majors)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "USC says \"mid-December,\" with option to defer to Regular Decision." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 31", applicationRound: "EA", notes: "USC says \"late January.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline (most majors)", eventDate: "Jan 10", applicationRound: "RD" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline (performing arts programs)", eventDate: "Dec 1", applicationRound: "RD", programLabel: "Kaufman School of Dance / School of Dramatic Arts / Thornton School of Music" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Commitment deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "asu", re: /\barizona state university\b|^asu$/i, collegeName: "Arizona State University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.asu.edu/apply/first-year/admission",
    notes: "ASU is rolling admission with no hard deadlines -- Nov 1 is a priority date for best scholarship/financial-aid consideration, not a cutoff. Two official ASU pages disagreed on the \"regular\" priority date (Feb 1 on one, Jan 15 on another); a Fall-specific deadline table exists but is JavaScript-rendered and could not be read directly -- confirm on the official site.",
    events: [
      { eventType: "Priority deadline", eventLabel: "Priority admission/scholarship date (not a hard deadline)", eventDate: "Nov 1" },
      { eventType: "FAFSA priority deadline", eventLabel: "FAFSA priority filing date", eventDate: "Jan 15" },
      { eventType: "Rolling admission opens", eventLabel: "Rolling admission continues after priority date", eventDate: "Rolling" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "Deposit portal typically opens Oct 1." },
    ],
  },
  {
    key: "michigan", re: /\buniversity of michigan\b/i, collegeName: "University of Michigan",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.umich.edu/apply/first-year-applicants/requirements-deadlines",
    notes: "Page explicitly states the next cycle's changes will post before the application opens Aug 1 -- these are the prior cycle's dates, shown as a starting point.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding)", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 24", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 30", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Feb 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 3", applicationRound: "RD", notes: "Michigan says \"early April.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Commitment deposit (ED)", eventDate: "Jan 6", applicationRound: "ED" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Commitment deposit (EA/RD)", eventDate: "May 1" },
    ],
  },
  {
    key: "purdue", re: /\bpurdue university\b/i, collegeName: "Purdue University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.purdue.edu/apply/deadlines.php",
    notes: "Page gives evergreen month/day dates with no cycle year and states applications open Aug 1 -- next cycle hadn't opened as of this check.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 15", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "If admitted after Apr 24, deposit is due within 3 weeks of your decision instead." },
    ],
  },
  {
    key: "osu", re: /\bohio state university\b|^osu$/i, collegeName: "Ohio State University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://undergrad.osu.edu/apply/freshmen-columbus/apply-step-by-step",
    notes: "Table columns explicitly labeled with the current cycle's year (dates shown carry the confirmed year).",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification (Ohio residents)", eventDate: "Dec 11", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification (non-Ohio/international)", eventDate: "Jan 22", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 5", applicationRound: "RD" },
      { eventType: "FAFSA priority deadline", eventLabel: "Priority financial aid date", eventDate: "Feb 1" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Acceptance deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "wisconsin", re: /\buniversity of wisconsin.madison\b|\buw.madison\b/i, collegeName: "University of Wisconsin-Madison",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.wisc.edu/deadlines/",
    notes: "No explicit cycle year found on the deadlines table; applications open Aug 1 so next cycle hadn't opened as of this check.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Fall Early Action deadline", eventDate: "Nov 1", applicationRound: "EA", notes: "Materials due Nov 10." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 31", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Fall Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Materials due Jan 22." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "Wisconsin references the national May 1 deadline." },
    ],
  },
  {
    key: "pennstate", re: /\bpennsylvania state university\b|\bpenn state\b/i, collegeName: "Pennsylvania State University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.psu.edu/resources/first-year-students/deadlines",
    notes: "No explicit cycle year found. Penn State's model is a fixed Early Action date followed by continuous rolling review (no separate hard Regular Decision deadline).",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "Recommended submission by Dec 1." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Dec 24", applicationRound: "EA" },
      { eventType: "Rolling admission opens", eventLabel: "Rolling review continues after Nov 1", eventDate: "Rolling", notes: "Fall application closes Jul 28; becomes more competitive over time, especially at University Park." },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "Not stated directly on the deadlines page itself; Penn State has granted a one-time extension to May 15 in a past cycle, so confirm independently." },
    ],
  },
  {
    key: "maryland", re: /\buniversity of maryland\b/i, collegeName: "University of Maryland, College Park",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.umd.edu/apply/application-deadlines",
    notes: "The page's own example footnote is stale (still describes a prior cycle), which specifically casts doubt on the Jan 20 Regular Decision date shown -- re-verify that one directly before relying on it. The Nov 1 Early Action date is a fixed calendar date each year and more reliably evergreen.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Feb 1", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 20", applicationRound: "RD", notes: "Flagged as possibly carried over from the prior cycle -- confirm on the official page." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "casewestern", re: /\bcase western reserve university\b/i, collegeName: "Case Western Reserve University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://case.edu/admission/apply/dates-deadlines",
    notes: "Page metadata showed a last-modified date about 5 weeks before this check, indicating live current-cycle content.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "Financial-aid documents due Nov 15." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Dec 19", applicationRound: "EA" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Financial-aid documents due Nov 15." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 5", applicationRound: "ED" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 15", applicationRound: "ED II", notes: "Financial-aid documents due Jan 22." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 6", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Financial-aid documents due Feb 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 20", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit (EA/RD)", eventDate: "May 1" },
    ],
  },
  {
    key: "coloradoboulder", re: /\buniversity of colorado boulder\b|\bcu boulder\b/i, collegeName: "University of Colorado Boulder",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.colorado.edu/admissions/process/first-year/apply",
    notes: "Application-open date and internal Common App reference codes carried the current cycle's year, confirming live current-cycle content.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Fall/Summer Early Action deadline", eventDate: "Nov 15", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Feb 1", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Fall/Summer Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "Exact date not explicitly stated on this page; shown as the national norm -- confirm on your offer letter." },
    ],
  },
  {
    key: "ufl", re: /\buniversity of florida\b/i, collegeName: "University of Florida",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.ufl.edu/apply/freshman/deadlines",
    notes: "Page explicitly titled with the current cycle's year range, confirming live current-cycle content.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding)", eventDate: "Oct 15", applicationRound: "ED", notes: "Materials due Oct 22." },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 11", applicationRound: "ED", notes: "Confirmation deadline Jan 8 or the decision is cancelled." },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "Materials due Nov 8." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 22", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Materials due Jan 22." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 19", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Confirmation deadline (EA/RD)", eventDate: "May 1" },
    ],
  },
  {
    key: "nyu", re: /\bnew york university\b|^nyu$/i, collegeName: "New York University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.nyu.edu/admissions/undergraduate-admissions/how-to-apply/all-freshmen-applicants.html",
    notes: "NYU's admitted-students page still referenced the prior cohort, indicating the site hasn't been visibly refreshed for the next cycle -- dates below are NYU's fixed recurring pattern.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 1", applicationRound: "ED II" },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 15", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
    ],
  },
  {
    key: "northeastern", re: /\bnortheastern university\b/i, collegeName: "Northeastern University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.northeastern.edu/application-information/admissions-deadlines-decisions/",
    notes: "Northeastern's own admitted-student resources page was still headlined for the prior cohort, indicating the site hasn't been republished for the next cycle -- dates below are Northeastern's fixed recurring pattern.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Jan 1", applicationRound: "ED", notes: "Northeastern says \"by January 1.\"" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 1", applicationRound: "ED II" },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Mar 1", applicationRound: "ED II" },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Feb 15", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "bu", re: /\bboston university\b/i, collegeName: "Boston University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.bu.edu/admissions/apply/deadlines/",
    notes: "No explicit cycle year on the deadlines page; BU's admitted-students navigation still referenced the prior cohort -- dates below are BU's fixed recurring pattern.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding)", eventDate: "Nov 2", applicationRound: "ED", notes: "Enrollment deposit due early-to-mid January." },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision 2 deadline (binding)", eventDate: "Jan 5", applicationRound: "ED II", notes: "Enrollment deposit due late February." },
      { eventType: "Decision notification", eventLabel: "Early Decision 2 notification", eventDate: "Feb 9", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD", notes: "CSS Profile/FAFSA also due Jan 5." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 28", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit (RD)", eventDate: "May 1" },
    ],
  },
  {
    key: "rpi", re: /\brensselaer polytechnic institute\b|^rpi$/i, collegeName: "Rensselaer Polytechnic Institute",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://undergrad.admissions.rpi.edu/apply",
    notes: "Page was explicitly labeled with the current cycle, confirming live current-cycle content.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Deposit due Jan 15." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 12", applicationRound: "ED" },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Dec 1", applicationRound: "EA", notes: "Deposit due May 1." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 30", applicationRound: "EA" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 6", applicationRound: "ED II", notes: "Deposit due Feb 15." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Jan 16", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Deposit due May 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 6", applicationRound: "RD" },
    ],
  },
  {
    key: "wpi", re: /\bworcester polytechnic institute\b|^wpi$/i, collegeName: "Worcester Polytechnic Institute",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.wpi.edu/admissions/undergraduate/apply/application-options",
    notes: "No explicit next-cycle year found on the page -- dates below are WPI's fixed recurring pattern.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED" },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED", notes: "WPI says \"mid-December.\"" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 5", applicationRound: "ED II" },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 15", applicationRound: "ED II", notes: "WPI says \"mid-February.\"" },
      { eventType: "Early Action deadline", eventLabel: "Early Action Round 1 deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action Round 1 notification", eventDate: "Jan 31", applicationRound: "EA", notes: "WPI says \"late January.\"" },
      { eventType: "Early Action deadline", eventLabel: "Early Action Round 2 deadline (non-binding)", eventDate: "Jan 5", applicationRound: "EA II" },
      { eventType: "Decision notification", eventLabel: "Early Action Round 2 notification", eventDate: "Feb 28", applicationRound: "EA II", notes: "WPI says \"late February.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Feb 1", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD", notes: "WPI says \"late March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "stevens", re: /\bstevens institute of technology\b/i, collegeName: "Stevens Institute of Technology",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.stevens.edu/admission-aid/undergraduate-admissions/admissions-timeline",
    notes: "No explicit next-cycle year confirmed on the page -- dates below are Stevens' fixed recurring pattern.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 15", applicationRound: "ED", notes: "CSS Profile/FAFSA due Nov 15; deposit due Jan 10." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED" },
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Dec 1", applicationRound: "EA", notes: "Deposit due May 1 (Mar 5 for priority housing)." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Feb 1", applicationRound: "EA" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 5", applicationRound: "ED II", notes: "Deposit due Mar 1." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 15", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD", notes: "Deposit due May 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
    ],
  },
  {
    key: "harveymudd", re: /\bharvey mudd college\b/i, collegeName: "Harvey Mudd College",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.hmc.edu/admission/apply/",
    notes: "Page's test-optional policy text and class-profile reference indicate this reflects the prior cycle, not yet republished -- dates below are Harvey Mudd's fixed recurring pattern. Whether the test-optional policy continues into the next cycle could not be verified.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 15", applicationRound: "ED", notes: "Reply/deposit date Jan 9." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 5", applicationRound: "ED II", notes: "Reply/deposit date Feb 27." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 15", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 5", applicationRound: "RD", notes: "Common App final cutoff for RD documents is Feb 6." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Reply/deposit date (RD)", eventDate: "May 1", applicationRound: "RD" },
    ],
  },
  {
    key: "rosehulman", re: /\brose-hulman institute of technology\b|\brose.hulman\b/i, collegeName: "Rose-Hulman Institute of Technology",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.rose-hulman.edu/admissions-and-aid/the-application-process/application-and-deadlines/index.html",
    notes: "No explicit cycle year confirmed directly on this page -- dates below are Rose-Hulman's fixed recurring pattern.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "If incomplete by this date, moves into the Regular Decision pool." },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Feb 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1" },
    ],
  },
  {
    key: "mines", re: /\bcolorado school of mines\b/i, collegeName: "Colorado School of Mines",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://www.mines.edu/undergraduate-admissions/first-year/",
    notes: "Page explicitly stated the application-open date for the current next cycle, confirming live current-cycle content.",
    events: [
      { eventType: "Priority deadline", eventLabel: "Priority (Early Action) deadline", eventDate: "Nov 1", applicationRound: "EA" },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Dec 15", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Applications after this date are reviewed on a rolling basis, space permitting." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Feb 15", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit / National Decision Day", eventDate: "May 1" },
    ],
  },
  {
    key: "duke", re: /\bduke university\b/i, collegeName: "Duke University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.duke.edu/apply/",
    notes: "Page explicitly stated it represents the current admission cycle's requirements and deadlines. Note: a separate, older Duke checklist page still shows the prior cycle's dates -- use this apply/ page as authoritative. Enrollment deposit date not independently confirmed on this page.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding)", eventDate: "Nov 2", applicationRound: "ED", notes: "Financial aid due Nov 2; additional documents due Nov 15." },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Duke says \"mid-December.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 4", applicationRound: "RD", notes: "Financial aid due Feb 1; midyear grades due Feb 15." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD", notes: "Duke says \"late March/early April.\"" },
    ],
  },
  {
    key: "northwestern", re: /\bnorthwestern university\b/i, collegeName: "Northwestern University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.northwestern.edu/apply/application-deadlines.html",
    notes: "Page showed explicit dates for the current next cycle. Flag: the page itself has an internal conflict for the Regular Decision deadline -- the summary table says Jan 4, the detailed section says Jan 2 -- shown here as Jan 4 (the summary table value) with the conflict noted; confirm directly with Northwestern before relying on the exact day.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Financial aid due Dec 1; enrollment deposit due Feb 1." },
      { eventType: "Decision notification", eventLabel: "Early Decision notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Northwestern's summary table says mid-December." },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 4", applicationRound: "RD", notes: "Northwestern's own page shows a conflicting Jan 2 date elsewhere on the same page -- confirm exact day directly." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD", notes: "Northwestern says \"March\" / \"late March.\"" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment/tuition deposit (RD)", eventDate: "May 1", applicationRound: "RD" },
      { eventType: "FAFSA priority deadline", eventLabel: "Financial aid deadline (RD)", eventDate: "Feb 1", applicationRound: "RD" },
    ],
  },
  {
    key: "jhu", re: /\bjohns hopkins university\b/i, collegeName: "Johns Hopkins University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://apply.jhu.edu/how-to-apply/application-deadlines-requirements/",
    notes: "Page shows the already-completed prior cycle's dates. JHU's own page states updated dates are made public each August -- next cycle wasn't posted yet as of this check.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Financial aid due Nov 15; reply-by date Jan 15." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 12", applicationRound: "ED" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 2", applicationRound: "ED II", notes: "Financial aid due Jan 15; reply-by date Feb 27." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 13", applicationRound: "ED II" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 2", applicationRound: "RD", notes: "Financial aid due Jan 15; reply-by date May 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 18", applicationRound: "RD" },
    ],
  },
  {
    key: "rice", re: /\brice university\b/i, collegeName: "Rice University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admission.rice.edu/apply/first-year-domestic-applicants",
    notes: "Page's own essay prompts were explicitly labeled with the current cycle's year range, confirming live current-cycle content.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Enrollment deposit due Jan 4 if admitted." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Rice says \"mid-December.\"" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 4", applicationRound: "ED II", notes: "Enrollment deposit due Mar 1 if admitted." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Jan 31", applicationRound: "ED II", notes: "Rice says \"late January.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 4", applicationRound: "RD" },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Apr 1", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit (RD)", eventDate: "May 1", applicationRound: "RD" },
    ],
  },
  {
    key: "vanderbilt", re: /\bvanderbilt university\b/i, collegeName: "Vanderbilt University",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.vanderbilt.edu/apply/",
    notes: "Page shows the already-completed prior cycle's dates (its own May 1 deposit deadline has already passed as of this check) -- next cycle not yet published.",
    events: [
      { eventType: "Early Decision deadline", eventLabel: "Early Decision I deadline (binding)", eventDate: "Nov 1", applicationRound: "ED", notes: "Matriculation deposit due Dec 31." },
      { eventType: "Decision notification", eventLabel: "Early Decision I notification", eventDate: "Dec 15", applicationRound: "ED", notes: "Vanderbilt says \"mid-December.\"" },
      { eventType: "Early Decision deadline", eventLabel: "Early Decision II deadline (binding)", eventDate: "Jan 1", applicationRound: "ED II", notes: "Matriculation deposit due Mar 1." },
      { eventType: "Decision notification", eventLabel: "Early Decision II notification", eventDate: "Feb 15", applicationRound: "ED II", notes: "Vanderbilt says \"mid-February.\"" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 1", applicationRound: "RD", notes: "Matriculation deposit due May 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD", notes: "Vanderbilt says \"late March.\"" },
    ],
  },
  {
    key: "utaustin", re: /\buniversity of texas at austin\b|\but austin\b/i, collegeName: "University of Texas at Austin",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.utexas.edu/apply/freshman/",
    notes: "Page shows the already-completed prior cycle's specific dates. UT Austin uses ApplyTexas/Common App with a Priority (Early) + one Regular deadline structure, not a private-school ED/EA/RD split. The month/day pattern typically repeats but wasn't independently confirmed for the next cycle.",
    events: [
      { eventType: "Priority deadline", eventLabel: "Priority (Early) application deadline", eventDate: "Oct 15", applicationRound: "Priority", notes: "Supplemental materials due Oct 22." },
      { eventType: "Decision notification", eventLabel: "Priority decision or deferral notice", eventDate: "Jan 15", applicationRound: "Priority" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular application deadline", eventDate: "Dec 1", applicationRound: "RD", notes: "Supplemental materials due Dec 10." },
      { eventType: "Decision notification", eventLabel: "Regular decision notification", eventDate: "Feb 15", applicationRound: "RD", notes: "Honors program decisions released by Mar 1." },
    ],
  },
  {
    key: "tamu", re: /\btexas a&m university\b|\btexas a & m\b/i, collegeName: "Texas A&M University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.tamu.edu/apply/freshman/index.html",
    notes: "Page's table was explicitly labeled with the current next cycle, confirming live current-cycle content. College Station fall entry uses a single deadline (no ED/EA/RD split).",
    events: [
      { eventType: "Regular Decision deadline", eventLabel: "Fall application deadline (College Station)", eventDate: "Dec 1", applicationRound: "Fall", notes: "All required documents, including the self-reported transcript, due Dec 15. Appeal deadline for incomplete files is Feb 1." },
      { eventType: "Decision notification", eventLabel: "Decision notification", eventDate: "Mar 31", applicationRound: "Fall", notes: "Most decisions release between Jan 1 and late March under holistic review; Top 10% auto-admits notified roughly 3 weeks after file completion." },
      { eventType: "Regular Decision deadline", eventLabel: "Fall application deadline (Galveston campus)", eventDate: "May 1", applicationRound: "Fall", programLabel: "Galveston campus", notes: "Documents due May 15." },
    ],
  },
  {
    key: "vatech", re: /\bvirginia tech\b|\bvirginia polytechnic\b/i, collegeName: "Virginia Tech",
    confidence: "recurring pattern -- confirm", lastChecked: "2026-07-21",
    sourceUrl: "https://www.vt.edu/admissions/undergraduate/apply/decision-plans.html",
    notes: "Virginia Tech's dedicated dates page did not render as text (appears JavaScript-rendered) and a search snippet suggested it still shows the prior cycle's title. The month/day deadline PATTERN below was confirmed from two other official VT pages, but notification and deposit dates could not be independently confirmed on an official page this check -- treat notification/deposit dates as unconfirmed estimates only.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "Most common decision plan at Virginia Tech." },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment deposit", eventDate: "May 1", notes: "National norm, not independently confirmed on an official VT page this check." },
    ],
  },
  {
    key: "ncstate", re: /\bnorth carolina state university\b|\bnc state\b/i, collegeName: "North Carolina State University",
    confidence: "verified", lastChecked: "2026-07-21",
    sourceUrl: "https://admissions.ncsu.edu/apply/deadlines/",
    notes: "Page explicitly referenced the current FAFSA cycle year, confirming live current-cycle content.",
    events: [
      { eventType: "Early Action deadline", eventLabel: "Early Action deadline (non-binding)", eventDate: "Nov 1", applicationRound: "EA", notes: "Materials due Nov 15. Also the deadline for studio-based majors (Architecture, Media Arts, Design & Technology, Fashion & Textile Design, Graphic & Experience Design, Industrial Design) and for University Honors consideration." },
      { eventType: "Decision notification", eventLabel: "Early Action notification", eventDate: "Jan 31", applicationRound: "EA" },
      { eventType: "Regular Decision deadline", eventLabel: "Regular Decision deadline", eventDate: "Jan 15", applicationRound: "RD", notes: "Materials due Feb 1." },
      { eventType: "Decision notification", eventLabel: "Regular Decision notification", eventDate: "Mar 31", applicationRound: "RD" },
      { eventType: "Enrollment deposit deadline", eventLabel: "Enrollment confirmation deposit (fall admits)", eventDate: "May 1" },
    ],
  },
];

export function findAutofillProfile(collegeName) {
  if (!collegeName) return null;
  for (const p of TIMELINE_AUTOFILL_PROFILES) {
    if (p.re.test(collegeName)) return p;
  }
  return null;
}

export function importDeadlineProfiles(db) {
  const cols = [
    "college_id", "application_deadlines_json", "deadline_source_url", "deadline_last_reviewed",
    "css_profile_required", "css_profile_deadline", "css_profile_source_url",
    "fafsa_priority_deadline", "fafsa_source_url", "scholarship_deadline", "scholarship_source_url",
    "honors_deadline", "honors_source_url", "portfolio_deadline", "portfolio_source_url",
    "interview_deadline", "interview_source_url", "deadline_confidence_level", "notes", "updated_at",
  ];
  const placeholders = cols.map((c) => `@${c}`).join(",");
  const stmt = db.prepare(`INSERT OR REPLACE INTO college_deadline_profiles (${cols.join(",")}) VALUES (${placeholders})`);
  const now = Date.now();
  for (const p of DEADLINE_PROFILES) {
    const row = {};
    cols.forEach((c) => { row[c] = c === "updated_at" ? now : (p[c] ?? null); });
    stmt.run(row);
  }
  return DEADLINE_PROFILES.length;
}
