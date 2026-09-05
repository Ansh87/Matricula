// verifiedSeed2.js - verified admissions-details profiles for the colleges that
// have selection profiles but weren't in the original 5. Transcribed from each
// college's official admissions site. Round-level acceptance rates are LEFT NULL
// (most colleges don't officially publish them; we never invent them).
//
// Helper builds a full row from a compact spec; unspecified fields default to
// safe "confirm on official site" values.

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
  source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
});

export const VERIFIED_SEED_2 = [
  // Carnegie Mellon (real IPEDS/Scorecard UNITID is 211440 - 201645 is actually
  // Case Western Reserve University; this was misassigned to CMU app-wide)
  V({ id: "211440", url: "https://www.cmu.edu/admission/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 3" }, css: "Required (CSS Profile) - confirm",
      recs: "Counselor + teacher recommendation(s)", essays: "CMU-specific short essays + Common App essay",
      majorRestrictions: { note: "Admitted by individual college/program; School of Computer Science is separately, extremely competitive" },
      honors: "Program-specific honors/research; no single honors college" }),
  // UC Berkeley
  V({ id: "110635", url: "https://admissions.berkeley.edu/", ed: false, ea: false, rd: true,
      deadlines: { "UC application": "Nov 1–30 filing period" }, testing: "Test-blind (SAT/ACT not considered)",
      recs: "Not required (letters not part of standard UC review)", essays: "4 UC Personal Insight Questions",
      css: "Not required (FAFSA/California Dream Act)", majorRestrictions: { note: "EECS/CS and other majors far more competitive; admitted by college/major" },
      honors: "Regents' & Chancellor's Scholarship; college honors programs" }),
  // UIUC
  V({ id: "145637", url: "https://admissions.illinois.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 5" }, recs: "Not required for most programs - confirm",
      essays: "Program-specific essays", css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Admitted by major; Grainger CS and CS+X extremely competitive; limited internal transfer into CS" },
      honors: "Campus Honors Program + college honors" }),
  // Purdue
  V({ id: "243780", url: "https://www.admissions.purdue.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15 (priority)" }, recs: "Not required",
      essays: "Purdue short-answer essays", css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "Admitted by major; CS is a direct competitive admit; engineering enters via First-Year Engineering then places by GPA" },
      honors: "Purdue Honors College by separate application" }),
  // University of Michigan
  V({ id: "170976", url: "https://admissions.umich.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Feb 1" }, recs: "One teacher + counselor recommendation",
      essays: "Michigan supplement (community + why-school) + Common App essay", css: "Not required (CSS not used; FAFSA)",
      majorRestrictions: { note: "Admitted by college (LSA, Engineering, Ross); Ross & CS-Engineering competitive; cross-college transfer is a process" },
      honors: "LSA Honors Program by separate consideration" }),
  // UT Austin
  V({ id: "228778", url: "https://admissions.utexas.edu/", ed: false, ea: false, rd: true,
      deadlines: { "Priority": "Nov 1", "Regular": "Dec 1" }, testing: "Confirm current policy; Texas auto-admit is rank-based",
      recs: "Optional", essays: "Required Apply Texas / Common App essay + short answers",
      css: "Not required (FAFSA/TASFA)", majorRestrictions: { note: "Auto-admission to UT ≠ admission to major; CS and McCombs separately, highly competitive" },
      honors: "Multiple honors programs (Turing, Plan II, etc.) by separate, elite application" }),
  // NJIT
  V({ id: "186867", url: "https://www.njit.edu/admissions/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1 (priority)", RD: "Rolling" }, testing: "Test-optional - confirm",
      recs: "Optional", essays: "Optional/short - confirm", css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "STEM readiness (math/science) is the key signal; admit bar reachable for prepared students" },
      honors: "Albert Dorman Honors College by separate application" }),
  // Penn State
  V({ id: "214777", url: "https://admissions.psu.edu/", ed: false, ea: true, rd: true,
      deadlines: { "Priority (best consideration)": "Nov 1", "Final": "Rolling until full" },
      testing: "Test-optional - confirm", recs: "Not required", essays: "Personal statement (Penn State activities/essay)",
      css: "Not required (FAFSA-based)", majorRestrictions: { note: "Many majors are 'entrance-to-major' - enter pre-major, meet GPA/course gates to declare (CS, engineering, Smeal business)" },
      honors: "Schreyer Honors College by separate, competitive application" }),
  // University of Maryland
  V({ id: "163286", url: "https://admissions.umd.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 15" }, testing: "Test-optional - confirm",
      recs: "Optional", essays: "Maryland short-answer essays", css: "Not required (FAFSA-based)",
      majorRestrictions: { note: "CS and some engineering are Limited Enrollment Programs (LEPs) with higher bars and gateway criteria" },
      honors: "Honors College (incl. ACES, Gemstone) by separate consideration" }),
  // Stevens
  V({ id: "186584", url: "https://www.stevens.edu/admission-aid", ed: true, ea: true, rd: true,
      deadlines: { ED_I: "Nov 15", ED_II: "Jan 15", EA: "Nov 15", RD: "Feb 1" },
      testing: "Test-optional - confirm", recs: "Counselor + teacher recommendation",
      essays: "Common App essay + Stevens supplement", css: "Confirm on financial aid site",
      majorRestrictions: { note: "Strong STEM prep expected; demonstrated interest helps" },
      honors: "Clark Scholars / Pinnacle Scholars programs by separate selection" }),
  // Harvard
  V({ id: "166027", url: "https://college.harvard.edu/admissions", ed: false, ea: false, rea: true, rd: true,
      deadlines: { REA: "Nov 1", RD: "Jan 1" }, testing: "Testing required for applicable cycle - confirm",
      recs: "Two teacher recommendations + counselor", essays: "Harvard supplement + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major; concentration declared sophomore year" },
      honors: "Honors degrees are academic distinctions, not a separate program" }),
  // Yale
  V({ id: "130794", url: "https://admissions.yale.edu/", ed: false, ea: false, rea: true, rd: true,
      deadlines: { SCEA: "Nov 1", RD: "Jan 2" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Yale-specific short + supplemental essays + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major; majors declared sophomore year" },
      honors: "N/A (no separate honors college)" }),
  // Columbia
  V({ id: "190150", url: "https://undergrad.admissions.columbia.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 1" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Columbia-specific lists + short essays + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Apply to Columbia College or SEAS (engineering); majors declared later within each" },
      honors: "N/A (no separate honors college)" }),
  // Cornell
  V({ id: "190415", url: "https://admissions.cornell.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 2" }, testing: "Confirm current testing policy (varies by college)",
      recs: "Two teacher recommendations + counselor", essays: "College-specific supplemental essay + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Admitted BY specific undergraduate college (Engineering, A&S, CALS, Dyson, etc.); college choice shapes odds & requirements" },
      honors: "College-specific honors programs" }),
  // UPenn
  V({ id: "215062", url: "https://admissions.upenn.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 5" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Penn-specific essays (why Penn / why school) + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Admitted by undergraduate school (CAS, SEAS, Wharton, Nursing); Wharton & coordinated dual-degrees dramatically harder" },
      honors: "Coordinated dual-degree / specialized programs (M&T, VIPER, etc.) by separate, elite application" }),
  // Brown
  V({ id: "217156", url: "https://admission.brown.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 3" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Brown-specific essays (Open Curriculum, community) + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major (Open Curriculum). PLME (8-yr med) & RISD dual-degree are separate, extremely competitive" },
      honors: "N/A (Open Curriculum; honors are departmental)" }),
  // Dartmouth
  V({ id: "182670", url: "https://admissions.dartmouth.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 3" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor + optional peer recommendation", essays: "Dartmouth-specific supplement + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major; majors declared sophomore year" },
      honors: "Departmental honors / senior thesis; no separate honors college" }),
  // Northwestern
  V({ id: "147767", url: "https://admissions.northwestern.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 3" }, testing: "Confirm current testing policy",
      recs: "One teacher + counselor recommendation", essays: "Why-Northwestern essay + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Admitted by undergraduate school (Weinberg, McCormick engineering, Medill, etc.); school fit matters; demonstrated interest considered" },
      honors: "Combined/accelerated programs (e.g., HPME history) by separate application" }),
  // Duke
  V({ id: "198419", url: "https://admissions.duke.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED: "Nov 1", RD: "Jan 2" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Duke-specific supplement + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Apply to Trinity (arts & sciences) or Pratt (engineering); switching between them possible, easier early" },
      honors: "Program II (self-designed) + merit scholarship programs" }),
  // Johns Hopkins
  V({ id: "162928", url: "https://apply.jhu.edu/", ed: true, ea: false, rd: true,
      deadlines: { ED_I: "Nov 1", ED_II: "Jan 2", RD: "Jan 2" }, testing: "Confirm current testing policy",
      recs: "Two teacher recommendations + counselor", essays: "Hopkins-specific essay + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major; Biomedical Engineering is a flagship, rigorous department" },
      honors: "N/A (no separate honors college); legacy no longer considered" }),
  // Caltech
  V({ id: "110404", url: "https://www.admissions.caltech.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", RD: "Jan 3" }, testing: "Testing required (reinstated) - confirm",
      recs: "Math/science + humanities teacher recommendations + counselor", essays: "Caltech STEM-focused supplemental essays + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "No admission by major; 'option' declared after first year; all paths intensely quantitative" },
      honors: "N/A (entire curriculum is rigorous)" }),
  // UCLA
  V({ id: "110662", url: "https://admission.ucla.edu/", ed: false, ea: false, rd: true,
      deadlines: { "UC application": "Nov 1–30 filing period" }, testing: "Test-blind (SAT/ACT not considered)",
      recs: "Not required (standard UC review)", essays: "4 UC Personal Insight Questions",
      css: "Not required (FAFSA/California Dream Act)", majorRestrictions: { note: "CS/engineering (Samueli) among hardest admits; admitted by college/major; impacted-major transfer is GPA-gated" },
      honors: "College Honors Program; Regents Scholarship" }),
  // USC
  V({ id: "123961", url: "https://admission.usc.edu/", ed: false, ea: true, rd: true,
      deadlines: { EA: "Nov 1", "Scholarship priority": "Nov 1", RD: "Jan 15" }, testing: "Confirm current testing policy",
      recs: "One teacher (or counselor) recommendation", essays: "USC supplemental essays + short answers + Common App essay",
      css: "Required (CSS Profile) for aid", majorRestrictions: { note: "Review tied to school/major; Cinematic Arts, Viterbi CS, Marshall business far more selective than overall rate" },
      honors: "Merit scholarships (Trustee, Presidential) tied to Nov 1 priority; Thematic Option honors" }),
];
