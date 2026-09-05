// verifiedSeed3.js - verified admissions-details profiles for the colleges that
// appear in the app's curated Top 50 STEM / Top 30 Finance / Top 30 Business
// lists but weren't yet in verifiedSeed2.js. Same rule as the other verified
// seed files: application ROUND DATES (ED/EA/RD/priority deadlines) were
// checked directly against each college's own official admissions site or a
// close secondary source citing it. Round-level ED/EA/RD ACCEPTANCE RATES are
// always left null - colleges rarely publish these, and we never invent them.
// Fields not explicitly researched here (exact testing policy nuance,
// recommendation/essay requirements beyond the Common App baseline, CSS
// Profile status) use the same safe "confirm on official site" defaults as
// verifiedSeed2.js, rather than guessing.

const V = (o) => ({
  college_id: o.id,
  application_deadlines_json: JSON.stringify(o.deadlines || {}),
  testing_policy: o.testing || "Confirm current SAT/ACT policy on the official admissions site",
  recommendation_requirements: o.recs || "Confirm recommendation requirements on the official site",
  essay_requirements: o.essays || "Common App personal essay + any school-specific supplements",
  scholarship_deadlines_json: JSON.stringify(o.scholarships || { note: "See the college's financial aid office for scholarship deadlines" }),
  css_profile_required: o.css || "Confirm on the official financial aid site",
  ed_available: o.ed ? 1 : 0,
  ea_available: o.ea ? 1 : 0,
  rea_available: o.rea ? 1 : 0,
  rd_available: o.rd === false ? 0 : 1,
  ed_acceptance_rate: null, ea_acceptance_rate: null, rd_acceptance_rate: null, // never invented
  major_restrictions_json: JSON.stringify(o.majorRestrictions || null),
  honors_program_info: o.honors || "Confirm honors program availability on the official site",
  source_url: o.url,
  source_year: 2026, last_reviewed: "2026-07", confidence_level: "verified",
});

export const VERIFIED_SEED_3 = [
  // University of Chicago
  V({ id: "144050", url: "https://collegeadmissions.uchicago.edu/apply", ed: true, ea: true, rd: true,
      deadlines: { "ED I / EA": "Nov 3", "ED II / RD": "Jan 5" },
      majorRestrictions: { note: "No admission by major; the Core curriculum applies to all students regardless of eventual concentration." } }),
  // Vanderbilt University
  V({ id: "221999", url: "https://admissions.vanderbilt.edu/apply/", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 1" },
      majorRestrictions: { note: "Vanderbilt does not offer Early Action, only Early Decision I/II and Regular Decision." } }),
  // University of Washington (Seattle)
  V({ id: "236948", url: "https://admit.washington.edu/apply/first-year/", ed: false, ea: false, rd: true,
      deadlines: { "Autumn (main entry term)": "Nov 15", Winter: "Dec 31", Summer: "Mar 15" },
      majorRestrictions: { note: "UW does not offer Early Decision or Early Action; admission review is holistic on a single main deadline. Some majors (e.g. CS via the Allen School) require a separate, competitive application after enrollment." } }),
  // Rice University
  V({ id: "227757", url: "https://admission.rice.edu/apply/first-year-domestic-applicants", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 4" },
      testing: "Test-recommended (not required) - confirm current cycle policy",
      majorRestrictions: { note: "Applicants choose one of Rice's residential colleges' academic schools on the application; switching majors within Rice is generally flexible." } }),
  // UNC Chapel Hill
  V({ id: "199120", url: "https://admissions.unc.edu/apply/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Oct 15", RD: "Jan 15" },
      majorRestrictions: { note: "Early Action is also the priority deadline for Honors Carolina and several assured-admission professional programs." } }),
  // NYU
  V({ id: "193900", url: "https://www.nyu.edu/admissions/undergraduate-admissions.html", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", ED_II: "Jan 1", RD: "Jan 5" },
      majorRestrictions: { note: "Students apply directly to one of NYU's undergraduate colleges/schools (e.g. CAS, Stern, Tandon); some, like Stern, are more selective than the university average." } }),
  // University of Virginia
  V({ id: "234076", url: "https://admission.virginia.edu/apply", ed: true, ea: true, rd: true,
      deadlines: { "ED / EA": "Nov 1", RD: "Jan 5" },
      majorRestrictions: { note: "Applicants apply to one of UVA's undergraduate schools (College of Arts & Sciences, McIntire Commerce is admitted later/separately, Engineering, etc.)." } }),
  // Georgetown University
  V({ id: "131496", url: "https://uadmissions.georgetown.edu/applying/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 10" },
      majorRestrictions: { note: "Georgetown's Early Action is single-choice/restrictive: applicants may not apply Early anywhere else. No Early Decision option." } }),
  // Case Western Reserve University
  V({ id: "201645", url: "https://case.edu/admission/apply/deadlines-and-requirements", ed: true, ea: true, rd: true,
      deadlines: { "EA / ED I": "Nov 1", "ED II / RD": "Jan 15" },
      honors: "Multiple discipline-specific honors/scholar programs (e.g. Pre-Professional Scholars) by separate, competitive application" }),
  // Emory University
  V({ id: "139658", url: "https://apply.emory.edu/apply/first-year/plans-deadlines/index.html", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 1" },
      majorRestrictions: { note: "Applicants apply to Emory College or Oxford College (a two-year path that transitions to Emory College); no Early Action option." } }),
  // Texas A&M University
  V({ id: "228723", url: "https://admissions.tamu.edu/", ed: false, ea: true, rd: true,
      deadlines: { "Priority / EA": "Oct 15", RD: "Dec 1" },
      css: "Not required (FAFSA/TASFA-based)",
      majorRestrictions: { note: "Some majors (engineering, business) admit by major and are more competitive than the university average." } }),
  // North Carolina State University
  V({ id: "199193", url: "https://admissions.ncsu.edu/apply/deadlines", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Studio-based majors (e.g. design) have an earlier Nov 1 deadline with portfolio/essay due the same day. Some engineering/CS majors are direct, competitive admits." } }),
  // Rensselaer Polytechnic Institute (RPI)
  V({ id: "194824", url: "https://undergrad.admissions.rpi.edu/apply", ed: true, ea: true, rd: true,
      deadlines: { ED_I: "Nov 1", EA: "Dec 1", ED_II: "Jan 5", RD: "Jan 15" } }),
  // Virginia Tech
  V({ id: "233921", url: "https://www.vt.edu/admissions/undergraduate/apply/dates-and-deadlines.html", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Virginia Tech does not offer Early Decision, only Early Action (non-binding) and Regular Decision." } }),
  // Worcester Polytechnic Institute (WPI)
  V({ id: "168421", url: "https://www.wpi.edu/admissions/undergraduate/apply/application-options", ed: true, ea: true, rd: true,
      deadlines: { "ED I / EA I": "Nov 1", "ED II / EA II": "Jan 5", RD: "Feb 1" },
      honors: "Great Problems Seminar and project-based honors options; no separate honors college" }),
  // University of Pittsburgh
  V({ id: "215293", url: "https://admissions.pitt.edu/first-year-student/", ed: false, ea: false, rd: true,
      deadlines: { "Priority (rolling admission)": "Dec 1" },
      majorRestrictions: { note: "Pitt uses rolling admission rather than fixed ED/EA/RD rounds; Dec 1 is the suggested priority date for admission, merit scholarships, and the Honors College." } }),
  // University of Rochester
  V({ id: "195030", url: "https://admissions.rochester.edu/applying/dates-and-deadlines/", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 5" },
      majorRestrictions: { note: "Rochester does not offer Early Action, only Early Decision I/II and Regular Decision." } }),
  // University of Colorado Boulder
  V({ id: "126614", url: "https://www.colorado.edu/admissions/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 15", RD: "Jan 15" },
      css: "Not required (FAFSA-based)" }),
  // Northeastern University
  V({ id: "167358", url: "https://admissions.northeastern.edu/", ed: true, ea: true, rd: true,
      deadlines: { "ED I / EA": "Nov 1", "ED II / RD": "Jan 1" },
      honors: "University Honors Program by separate consideration" }),
  // University of Alabama
  V({ id: "100751", url: "https://admissions.ua.edu/freshman/steps/", ed: false, ea: false, rd: true,
      deadlines: { "Priority (scholarship)": "Nov 1", "Priority (admission)": "Jan 15" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Rolling admission; applying by the priority dates matters most for automatic merit scholarship consideration." } }),
  // Arizona State University
  V({ id: "104151", url: "https://admission.asu.edu/apply/first-year", ed: false, ea: false, rd: true,
      deadlines: { Priority: "Nov 1", Regular: "Jan 15" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Rolling admission with no hard cutoff; priority dates most affect financial aid/scholarship consideration." } }),
  // University of Wisconsin–Madison
  V({ id: "240444", url: "https://admissions.wisc.edu/apply-as-a-freshman/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15" },
      css: "Not required (FAFSA-based)" }),
  // Boston College
  V({ id: "164924", url: "https://www.bc.edu/bc-web/admission/apply.html", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 4" },
      majorRestrictions: { note: "Boston College does not offer Early Action; it moved from EA to Early Decision I/II." } }),
  // Boston University
  V({ id: "164988", url: "https://www.bu.edu/admissions/", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", "ED II / RD": "Jan 5" },
      majorRestrictions: { note: "BU does not offer Early Action, only Early Decision I/II (binding) and Regular Decision. Regular Decision applicants who want merit scholarship consideration should apply by Dec 1." } }),
  // Ohio State University (Columbus / Main Campus)
  V({ id: "204796", url: "https://undergrad.osu.edu/apply/freshmen-columbus/apply-step-by-step", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "The EA deadline also serves as the priority deadline for merit scholarships." } }),
  // University of Florida
  V({ id: "134130", url: "https://admissions.ufl.edu/", ed: false, ea: false, rd: true,
      deadlines: { Priority: "Nov 1", Final: "Mar 1" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "UF does not currently offer Early Decision/Action; the priority deadline gives full consideration for admission, scholarships, and aid." } }),
  // Indiana University Bloomington
  V({ id: "151351", url: "https://admissions.indiana.edu/apply/deadlines.html", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Feb 1" },
      css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Applying by the Nov 1 EA deadline gives the strongest admission and scholarship consideration; updated test scores accepted through Jan 15 for scholarships." } }),

  // ---- University of California system: UCSD, UCSB, UC Irvine follow the
  // same system-wide policy already documented for Berkeley/UCLA in
  // verifiedSeed2.js (single Nov 1-30 filing window, test-blind, 4 UC Personal
  // Insight Questions, no CSS Profile). Campus-specific major-competitiveness
  // notes below.
  V({ id: "110680", url: "https://admissions.ucsd.edu/", ed: false, ea: false, rd: true,
      deadlines: { "UC application": "Nov 1–30 filing period" }, testing: "Test-blind (SAT/ACT not considered)",
      recs: "Not required (letters not part of standard UC review)", essays: "4 UC Personal Insight Questions",
      css: "Not required (FAFSA/California Dream Act)",
      majorRestrictions: { note: "Admitted by college/major; CS (Jacobs School) and other high-demand majors are capped and more competitive than the campus overall rate." },
      honors: "Provost's Honors and college-specific honors programs" }),
  V({ id: "110705", url: "https://admissions.sa.ucsb.edu/", ed: false, ea: false, rd: true,
      deadlines: { "UC application": "Nov 1–30 filing period" }, testing: "Test-blind (SAT/ACT not considered)",
      recs: "Not required (letters not part of standard UC review)", essays: "4 UC Personal Insight Questions",
      css: "Not required (FAFSA/California Dream Act)",
      majorRestrictions: { note: "Admitted by college/major; College of Engineering and CS majors are capped/selective, more competitive than the campus overall rate." },
      honors: "College of Creative Studies (separate application) and college honors programs" }),
  V({ id: "110653", url: "https://admissions.uci.edu/", ed: false, ea: false, rd: true,
      deadlines: { "UC application": "Nov 1–30 filing period" }, testing: "Test-blind (SAT/ACT not considered)",
      recs: "Not required (letters not part of standard UC review)", essays: "4 UC Personal Insight Questions",
      css: "Not required (FAFSA/California Dream Act)",
      majorRestrictions: { note: "Admitted by school/major; CS (Donald Bren School) is a capped, highly competitive major relative to the campus overall rate." },
      honors: "Campuswide Honors Program by separate, competitive application" }),
];
