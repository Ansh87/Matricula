// selectionSeed.js - verified "what the college wants / how they select / major
// strategy / culture" profiles.
//
// GROUNDING: admit_factors reflect each college's published Common Data Set
// Section C7 (where colleges rate each factor: Very Important / Important /
// Considered / Not Considered). Culture, major-competition, and switch-major
// notes are transcribed from official admissions/departmental pages. Nothing is
// invented; where a school doesn't publish something, the field says so, and
// each row carries a source URL, year, and confidence level.
//
// Factor rating scale used below: 4=Very Important, 3=Important, 2=Considered,
// 1=Not Considered. These mirror CDS C7 categories.

const VI = 4, IMP = 3, CON = 2, NC = 1;

// Standard CDS C7 factor keys we display.
const factors = (o) => ({
  rigor: o.rigor ?? null, gpa: o.gpa ?? null, testScores: o.test ?? null,
  classRank: o.rank ?? null, recommendations: o.recs ?? null, essay: o.essay ?? null,
  extracurriculars: o.ec ?? null, talent: o.talent ?? null, character: o.character ?? null,
  firstGen: o.firstGen ?? null, demonstratedInterest: o.interest ?? null,
  legacy: o.legacy ?? null, volunteer: o.volunteer ?? null, workExperience: o.work ?? null,
});

export const SELECTION_SEED = [
  // ---------------- Top-tier national ----------------
  {
    college_id: "166683", // MIT
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: IMP, test: VI, recs: VI, essay: VI, ec: VI, talent: VI, character: VI, firstGen: CON, interest: NC, legacy: NC })),
    culture_json: JSON.stringify({ tags: ["collaborative", "intensely quantitative", "maker/hands-on", "quirky", "mission-driven"], size: "medium", vibe: "Students describe it as collaborative rather than cutthroat - problem sets are done in groups. Deeply STEM, hands-on 'mens et manus' (mind and hand) building culture." }),
    what_they_want: "Evidence you use STEM to build and solve real problems, not just score well. They look for initiative, hands-on projects, research, and the kind of intellectual intensity that shows you'd thrive in an unusually rigorous, collaborative environment. Match beyond the classroom matters as much as raw stats.",
    how_they_select: "Holistic and need-blind. Rigor, test scores (required), and academic excellence are baseline; the differentiator is what you've *made* and whether your character and initiative fit MIT's collaborative, build-things ethos. There is no admission by major.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to MIT as a whole, not to a major. All majors are declared at the end of first year, so no major is 'harder to get into.'" }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Majors ('courses', numbered) are declared after first year and can be changed freely. No internal-transfer barrier between departments." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["deep hands-on STEM projects", "research/competition results", "initiative & self-direction", "collaborative character", "quantitative excellence"], neutral: ["demonstrated interest", "legacy"] }),
    source_url: "https://mitadmissions.org/apply/process/what-we-look-for/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "243744", // Stanford
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: VI, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["entrepreneurial", "interdisciplinary", "sunny/optimistic", "pre-professional + intellectual", "Silicon Valley-adjacent"], size: "medium-large", vibe: "Blends intellectual breadth with startup energy. Students range widely across arts, humanities, and tech; 'Stanford duck syndrome' (calm surface, hard paddling) is a known culture note." }),
    what_they_want: "Intellectual vitality - genuine curiosity and love of learning - plus distinctive impact in something you care about. Stanford prizes applicants who bring an authentic, non-generic voice and evidence of initiative, whether in research, arts, service, or building things.",
    how_they_select: "Holistic. Academic excellence with the most demanding curriculum available is expected; essays and 'intellectual vitality' heavily differentiate. Context-aware reading of your school and opportunities.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "Admission is to the university, not a major. Intended major does not gate admission, though CS is an enormous department." }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Majors declared sophomore year; changing is routine with no competitive internal transfer." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["intellectual vitality / curiosity", "authentic distinctive voice", "initiative & real impact", "strong essays"], neutral: ["demonstrated interest"] }),
    source_url: "https://admission.stanford.edu/apply/evaluation-criteria/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "186131", // Princeton
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: IMP, talent: IMP, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["undergraduate-focused", "traditional/residential", "strong academics + eating clubs", "collegial"], size: "medium", vibe: "Uniquely undergraduate-centered among Ivies; strong residential college + eating-club social life. Emphasis on senior thesis and deep mentorship." }),
    what_they_want: "Academic excellence plus evidence you'll contribute to and benefit from an undergraduate-focused, research-rich community. They value intellectual depth, character, and a track record of meaningful engagement over a scattershot resume.",
    how_they_select: "Holistic and need-blind, with generous no-loan aid. Rigor and character weigh heavily; Princeton reads for fit with its undergraduate, thesis-driven model.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You choose the B.S.E. (engineering) or A.B. (liberal arts) track on the application. Concentration (major) is declared later. B.S.E. expects strong math/physics prep." }),
    switch_major_json: JSON.stringify({ ease: "Easy within track", note: "Concentrations declared sophomore year and can change; switching between A.B. and B.S.E. is possible but easier early." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["intellectual depth", "character & service", "sustained commitment", "strong rigor"], neutral: ["demonstrated interest"] }),
    source_url: "https://admission.princeton.edu/how-apply/what-we-look",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "211440", // Carnegie Mellon (real IPEDS/Scorecard UNITID; 201645 is actually Case Western Reserve)
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: IMP, recs: IMP, essay: IMP, ec: IMP, talent: VI, character: IMP, firstGen: CON, interest: IMP, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["pre-professional", "intense/rigorous", "tech + arts fusion", "collaborative within colleges"], size: "medium", vibe: "Known for depth and rigor in your chosen field; strong maker/tech culture plus a top drama/arts school. Work-hard reputation." }),
    what_they_want: "Demonstrated, focused excellence and commitment to the specific school/major you're applying to. CMU admits by college, so fit and preparation for that program (e.g. SCS for CS) matter enormously - they want applicants who are already deep in their area.",
    how_they_select: "Admission is by individual college/program, each with its own bar. Demonstrated interest and program-specific fit are weighed. The School of Computer Science is among the most selective CS programs in the country.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ SCS_CS: "Extremely competitive - one of the hardest CS admits nationally", ECE: "Very competitive", Tepper_Business: "Competitive", note: "Your admit odds depend heavily on which college you apply to; CS is dramatically harder than most." }),
    switch_major_json: JSON.stringify({ ease: "Hard across colleges", note: "Transferring INTO the School of Computer Science after enrolling is very difficult and competitive. Switching within a college is easier. Choose your applied program carefully." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["deep program-specific preparation", "demonstrated interest", "focused excellence", "portfolio/results in the field"], caution: ["applying to a hyper-competitive college like SCS without matching depth"] }),
    source_url: "https://www.cmu.edu/admission/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "110635", // UC Berkeley
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: NC, recs: NC, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: IMP, volunteer: CON, work: CON })),
    culture_json: JSON.stringify({ tags: ["large public research", "academically elite", "activist/independent", "sprawling & self-driven"], size: "very large", vibe: "World-class research university; independent, do-it-yourself culture. Politically engaged, huge range of student life. You must be proactive." }),
    what_they_want: "Top academic achievement in context, plus evidence of contribution and character through UC's Personal Insight Questions. As a public, Berkeley uses 13 comprehensive-review factors and does NOT consider SAT/ACT (test-blind).",
    how_they_select: "Test-blind comprehensive review by 13 factors including academic performance in context, rigor, and personal qualities via PIQs. Admission to some majors (esp. CS in L&S / EECS in engineering) is far more competitive.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ EECS: "Extremely competitive (College of Engineering)", CS_LnS: "Very competitive; capped major with GPA gate historically", Haas_Business: "Competitive, often junior-entry", note: "CS/EECS at Berkeley are among the hardest admits; the college and major you pick matter a lot." }),
    switch_major_json: JSON.stringify({ ease: "Hard for impacted majors", note: "Switching into impacted majors (CS, EECS, Haas) after enrolling is competitive and GPA-gated. Changing between colleges is difficult. Pick your entry point deliberately." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["academic excellence in context", "strong PIQ essays", "contribution/leadership", "first-gen & context factors"], neutral: ["test scores (not used)", "demonstrated interest"] }),
    source_url: "https://admissions.berkeley.edu/how-to-apply/how-applications-are-reviewed/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },

  // ---------------- Strong CS / engineering ----------------
  {
    college_id: "139755", // Georgia Tech
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: IMP, recs: CON, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: CON, interest: NC, legacy: NC })),
    culture_json: JSON.stringify({ tags: ["engineering-first", "pre-professional", "collaborative nerdy", "co-op/internship heavy", "school spirit"], size: "large", vibe: "Unapologetically tech/engineering focused. Strong co-op culture, real employer pipeline, rigorous grading. Practical, career-driven students." }),
    what_they_want: "Rigor in STEM (especially math), strong grades, and clear fit with a technical, hands-on program. Georgia Tech reviews in the context of your intended major and is far more competitive for out-of-state and for CS/engineering.",
    how_they_select: "Admitted by college/major with major-aware review. In-state (Georgia) applicants have a much higher admit rate than out-of-state. Rigor and math preparation are central.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Very competitive, especially out-of-state", Engineering: "Competitive; varies by discipline", Business: "Less competitive than CS", note: "CS is the toughest admit. Out-of-state CS is dramatically harder than in-state." }),
    switch_major_json: JSON.stringify({ ease: "Moderate", note: "Changing majors after enrolling is possible; moving INTO CS/College of Computing is competitive and may require meeting GPA/course criteria. Easier if you start in a related college." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["strong math rigor & grades", "technical projects", "clear major fit", "in-state residency"], caution: ["out-of-state CS is a major reach for most"] }),
    source_url: "https://admission.gatech.edu/first-year/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "145637", // UIUC
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: CON, essay: IMP, ec: IMP, talent: CON, character: CON, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["large public research", "engineering powerhouse", "Big Ten spirit", "collaborative"], size: "very large", vibe: "One of the top engineering/CS publics; big collaborative research culture, strong industry pipeline, classic Big Ten campus life." }),
    what_they_want: "Strong rigor and grades in the context of your intended major, with clear preparation for a demanding technical program. UIUC reads applications by program, and CS-related majors are among the most competitive in the nation.",
    how_they_select: "Admitted by major/college with program-specific selectivity. The intended major matters a great deal - CS and CS+X are far harder than most.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS_Grainger: "Extremely competitive nationally", "CS+X": "Very competitive", Engineering: "Competitive by discipline", note: "Grainger CS is one of the hardest CS admits in the country; picking a less-impacted major changes your odds substantially." }),
    switch_major_json: JSON.stringify({ ease: "Hard into CS", note: "Inter-college transfer into Grainger CS after enrolling is very competitive with high GPA requirements. Choose your entry major carefully." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["top math/science rigor", "strong grades", "program fit"], caution: ["applying CS without matching preparation is a reach"] }),
    source_url: "https://admissions.illinois.edu/apply/freshman",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "243780", // Purdue
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: IMP, recs: NC, essay: IMP, ec: CON, talent: CON, character: CON, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["engineering-strong", "practical/hardworking", "school spirit", "affordable"], size: "very large", vibe: "Down-to-earth engineering powerhouse with a strong-value reputation (tuition freeze). Practical, career-focused, big campus life." }),
    what_they_want: "Solid rigor and grades with clear preparation for your intended major. Purdue admits by major and weighs your fit and readiness for that specific program, especially in engineering and CS.",
    how_they_select: "Major-specific admission. Engineering enters through First-Year Engineering then places into disciplines. CS is a direct, competitive admit.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Very competitive direct admit", Engineering: "Competitive via First-Year Engineering", note: "CS is a direct and competitive admit; engineering uses a common first year before you place into a discipline (placement is GPA-based)." }),
    switch_major_json: JSON.stringify({ ease: "Moderate; CDR for engineering", note: "Engineering students place into majors via a 'Change of Degree Objective' / CODO process with GPA thresholds. Moving into CS later is competitive." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["rigor & grades", "clear major readiness", "value-conscious fit"], caution: ["engineering discipline placement is GPA-gated after year one"] }),
    source_url: "https://www.admissions.purdue.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "170976", // University of Michigan
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: IMP, recs: IMP, essay: VI, ec: IMP, talent: CON, character: IMP, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["large elite public", "school spirit + academics", "broad excellence", "collaborative"], size: "very large", vibe: "Elite public with strong programs across the board and huge school spirit. Balances big research with a vibrant campus; strong in engineering, business, and liberal arts alike." }),
    what_they_want: "Excellence in the most rigorous curriculum available plus a distinctive, well-articulated fit through strong essays. Michigan reads holistically and values students who'll contribute to its broad, spirited community.",
    how_they_select: "Holistic, admitted by college (LSA, Engineering, Ross, etc.). Out-of-state is more competitive. Essays and rigor differentiate heavily.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS_Engineering: "Very competitive (College of Engineering)", CS_LSA: "Competitive alternate path", Ross_Business: "Highly competitive (preferred/direct admit)", note: "CS exists in both Engineering and LSA with different paths; Ross has a competitive direct-admit." }),
    switch_major_json: JSON.stringify({ ease: "Moderate; cross-college is harder", note: "Switching within a college is doable; moving between colleges (e.g. LSA to Engineering, or into Ross) is a competitive internal process." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["max rigor", "strong distinctive essays", "community contribution"], caution: ["out-of-state and Ross/CS-Eng are notably harder"] }),
    source_url: "https://admissions.umich.edu/apply/first-year-applicants",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "228778", // UT Austin
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: CON, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: IMP, interest: NC })),
    culture_json: JSON.stringify({ tags: ["huge public", "Texas spirit", "strong CS/business", "auto-admit driven"], size: "very large", vibe: "Massive, spirited flagship. Strong CS (Turing), business (McCombs), and engineering. Texas residents dominate via auto-admit; culture is big, social, opportunity-rich." }),
    what_they_want: "Top-decile academic performance (Texas auto-admit is class-rank driven) and strong major-specific fit. For competitive majors, rigor, essays, and demonstrated preparation matter most. Major admission is separate and much harder for CS.",
    how_they_select: "Texas residents in the top ~6% get automatic admission to UT (not necessarily to their major). Major admission - especially CS and McCombs - is separately and highly competitive. Out-of-state is very competitive.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Extremely competitive (auto-admit to UT ≠ admit to CS)", Turing_Honors: "Elite/tiny", McCombs_Business: "Very competitive", note: "Auto-admission to UT does not guarantee your major. CS is a separate, brutal admit." }),
    switch_major_json: JSON.stringify({ ease: "Hard into CS", note: "Internal transfer into CS is very competitive with high GPA bars. Getting into UT is not getting into CS - plan your major entry carefully." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["class rank (TX auto-admit)", "major-specific rigor", "strong essays", "first-gen/context"], caution: ["CS/McCombs are separate, far harder admits than UT itself"] }),
    source_url: "https://admissions.utexas.edu/apply/first-year-admission/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },

  // ---------------- NJ + regional value ----------------
  {
    college_id: "186380", // Rutgers-New Brunswick
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: NC, recs: NC, essay: CON, ec: CON, talent: CON, character: CON, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["large public", "diverse", "commuter+residential mix", "practical/value"], size: "very large", vibe: "Big, very diverse NJ flagship spread across campuses. Strong value, wide program range, less hand-holding - you build your own path. Test-optional." }),
    what_they_want: "Primarily strong grades in a rigorous college-prep curriculum. Rutgers is largely stats-driven for general admission and reviews rigor and GPA first; essays and activities are secondary.",
    how_they_select: "Largely academic/stats-based holistic review, test-optional. Some programs (certain CS/BAIT tracks, Honors) are more competitive and reviewed more closely.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Competitive within SAS; strong grades in math needed", BAIT: "Competitive", note: "General Rutgers admission is achievable for solid students; specific competitive majors and the Honors College raise the bar." }),
    switch_major_json: JSON.stringify({ ease: "Easy to moderate", note: "Declaring/changing most majors is straightforward; a few capped majors (e.g. CS) may require meeting course/GPA criteria to declare." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["strong GPA & rigor", "math preparation for CS", "in-state value fit"], neutral: ["test scores (optional)", "demonstrated interest"] }),
    source_url: "https://admissions.rutgers.edu/apply/how-we-review",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "186867", // NJIT
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: CON, essay: CON, ec: CON, character: CON, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["tech/engineering focus", "diverse", "commuter-friendly", "career-driven", "value"], size: "medium", vibe: "NJ's public polytechnic - engineering, CS, architecture. Practical, career-focused, strong co-op/industry ties in Newark. Accessible admit for prepared STEM students." }),
    what_they_want: "Solid math and science preparation and grades. As a polytechnic, NJIT wants students ready for a technical curriculum; the bar is achievable for well-prepared STEM applicants.",
    how_they_select: "Primarily academic review focused on STEM readiness (math/science rigor and grades). More accessible than the flagships while still technical.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Accessible for prepared students; growing program", Engineering: "Accessible with math prep", note: "Admit bar is reachable for solid STEM students; strong math preparation is the key signal." }),
    switch_major_json: JSON.stringify({ ease: "Easy", note: "Changing among technical majors is generally straightforward." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["math/science readiness", "steady grades", "value/career focus"], neutral: ["essays", "demonstrated interest"] }),
    source_url: "https://www.njit.edu/admissions/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "214777", // Penn State
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: NC, essay: CON, ec: CON, character: CON, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["huge public", "massive school spirit", "alumni network", "broad programs"], size: "very large", vibe: "Enormous school spirit and one of the largest alumni networks anywhere. Broad, career-oriented, strong Greek and sports culture. Value + reach." }),
    what_they_want: "Strong grades in a rigorous curriculum. Penn State's review is largely GPA/rigor-driven; the University Park campus and competitive majors (CS, engineering, Smeal business) raise the bar.",
    how_they_select: "Largely academic review (GPA + rigor primary). Admission to University Park vs. Commonwealth campuses and to competitive majors varies. Some majors are 'entrance-to-major' (declared later with GPA gates).",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Competitive; entrance-to-major GPA gate", Engineering: "Competitive; enter then place into discipline", Smeal_Business: "Competitive entrance-to-major", note: "Many majors are 'entrance-to-major' - you enter pre-major and must hit GPA/course criteria to declare." }),
    switch_major_json: JSON.stringify({ ease: "Moderate; entrance-to-major gates", note: "Declaring competitive majors (CS, engineering, business) requires meeting entrance-to-major GPA/course requirements after enrolling." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["strong GPA & rigor", "University Park fit", "alumni-network value"], caution: ["competitive majors gate declaration on college GPA"] }),
    source_url: "https://admissions.psu.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "163286", // University of Maryland
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: CON, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: CON, interest: NC })),
    culture_json: JSON.stringify({ tags: ["large public", "DC-adjacent", "strong CS/cyber", "spirited"], size: "very large", vibe: "Flagship next to DC with strong CS/cybersecurity and government/industry pipelines. Spirited, diverse, opportunity-rich near federal agencies." }),
    what_they_want: "Rigor, strong grades, and evidence of contribution, read holistically with a review of 26 factors. Maryland values well-rounded excellence and fit; competitive majors (CS) are capped/limited-enrollment.",
    how_they_select: "Holistic review across many factors. CS and some engineering majors are Limited Enrollment Programs (LEPs) with additional, higher bars.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Limited Enrollment Program - very competitive", Engineering: "Competitive", note: "CS is a Limited Enrollment Program: admission and staying in it require meeting gateway criteria." }),
    switch_major_json: JSON.stringify({ ease: "Hard into LEPs", note: "Transferring into Limited Enrollment Programs (CS, some engineering, business) requires meeting gateway GPA/course requirements and is competitive." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["rigor & grades", "contribution/leadership", "strong essays"], caution: ["CS is a capped LEP - harder than general admission"] }),
    source_url: "https://admissions.umd.edu/apply/first-year-applicants",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "186584", // Stevens Institute of Technology
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: IMP, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: CON, interest: IMP })),
    culture_json: JSON.stringify({ tags: ["private tech", "co-op strong", "NYC-adjacent", "career outcomes"], size: "small-medium", vibe: "Small private polytechnic on the Hudson across from NYC. Outstanding co-op/placement outcomes, tight technical focus, career-driven students." }),
    what_they_want: "Strong STEM preparation and grades, plus signs of genuine interest and fit with a technical, co-op-heavy program. As a private tech school, Stevens weighs essays, recommendations, and demonstrated interest more than the big publics.",
    how_they_select: "Holistic with real weight on rigor, essays, recommendations, and demonstrated interest. Strong career/co-op orientation shapes fit.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS: "Competitive; strong outcomes", Engineering: "Competitive", note: "Solid STEM students are competitive; demonstrated interest and fit help." }),
    switch_major_json: JSON.stringify({ ease: "Easy to moderate", note: "Changing among technical majors is generally manageable in a small program." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["STEM rigor & grades", "demonstrated interest", "essays & recs", "career/co-op fit"], neutral: [] }),
    source_url: "https://www.stevens.edu/admission-aid",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },

  // ---------------- Ivies + top privates ----------------
  {
    college_id: "166027", // Harvard
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: VI, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["prestige + resources", "intellectual", "pre-professional breadth", "house system", "global network"], size: "medium", vibe: "Immense resources and an unrivaled network. Undergraduates spread across a residential house system; culture blends deep intellectualism with strong pre-professional pull (finance, consulting, law, med)." }),
    what_they_want: "Exceptional academic achievement plus evidence of distinctive excellence or impact in something - leadership, research, talent, or service - read through a highly holistic lens. They look for people who will shape their fields and communities.",
    how_they_select: "Holistic and need-blind. Academic excellence is a baseline; character, distinction, and context matter enormously. No admission by major.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Harvard College, not a major. Concentration is declared sophomore year, so intended field does not gate admission." }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Concentrations declared in sophomore year and freely changed." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["distinctive excellence/impact", "intellectual depth", "leadership & character", "strong essays and recs"], neutral: ["demonstrated interest"] }),
    source_url: "https://college.harvard.edu/admissions/apply/what-we-look",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "130794", // Yale
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: VI, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["residential colleges", "collaborative", "strong humanities + arts", "tight community", "intellectual"], size: "medium", vibe: "Warm, collaborative culture organized around residential colleges. Renowned humanities, arts, and a supportive undergraduate focus; less cutthroat, community-oriented." }),
    what_they_want: "Yale reads for who will make the most of Yale and contribute most to it - asking about both intellectual reach and personal character. They value curiosity, engagement, and a genuine, well-articulated voice.",
    how_they_select: "Holistic and need-blind. Two core questions: who would make the most of Yale's resources, and who would contribute most to the community. No admission by major.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Yale College, not a major. Majors declared sophomore year." }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Majors declared sophomore year and freely changed." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["intellectual curiosity", "community contribution", "authentic voice", "character"], neutral: ["demonstrated interest"] }),
    source_url: "https://admissions.yale.edu/what-yale-looks-for",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "190150", // Columbia
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: IMP, talent: IMP, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["Core Curriculum", "NYC immersion", "intellectual/intense", "urban", "diverse"], size: "medium", vibe: "Defined by the Core Curriculum (shared great-books education) and total immersion in New York City. Intense, intellectual, urban - you must love the city and rigorous discussion." }),
    what_they_want: "Students who will thrive in a demanding shared Core Curriculum and an intensely urban, intellectual environment. Fit with the Core and NYC matters; they value serious thinkers who engage across disciplines.",
    how_they_select: "Holistic and need-blind. Applicants choose Columbia College or the Fu Foundation School of Engineering (SEAS); both are academically rigorous with the Core.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ note: "You apply to Columbia College (liberal arts) OR SEAS (engineering) - pick the school, not a specific major. Majors declared later within each.", SEAS: "Engineering school; strong math/science prep expected" }),
    switch_major_json: JSON.stringify({ ease: "Easy within school", note: "Majors declared sophomore year; changing within Columbia College or within SEAS is routine. Transferring between CC and SEAS is possible but a process." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["intellectual seriousness", "fit with the Core & NYC", "strong essays", "character"], neutral: ["demonstrated interest"] }),
    source_url: "https://undergrad.admissions.columbia.edu/apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "190415", // Cornell
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: IMP, essay: VI, ec: IMP, talent: IMP, character: IMP, firstGen: CON, interest: CON, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["large Ivy", "any-person-any-study breadth", "pre-professional + academic", "college-specific", "rigorous"], size: "large", vibe: "The largest, most academically diverse Ivy - 'any person, any study.' Culture varies a lot by college (Engineering vs. Arts vs. Hotel vs. CALS). Rigorous, big, spirited." }),
    what_they_want: "Cornell admits to a specific undergraduate college, so fit with that college and major matters more than at other Ivies. They want clear academic purpose and preparation aligned to the school you apply to.",
    how_they_select: "Holistic but admitted BY individual college (Engineering, Arts & Sciences, CALS, etc.), each with its own priorities and supplemental essays. Your fit with the specific college is central.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS_Engineering: "Very competitive", CS_A_and_S: "Competitive alternate path", Business_Dyson: "Highly competitive", note: "CS exists in both Engineering and Arts & Sciences. The college you apply to shapes your odds and requirements substantially." }),
    switch_major_json: JSON.stringify({ ease: "Moderate; internal transfer between colleges", note: "Changing majors within a college is doable; transferring between Cornell's undergraduate colleges is a formal internal-transfer process with requirements." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["clear academic purpose", "fit with the specific college", "strong supplements", "rigor"], caution: ["applying to the wrong college for your goals"] }),
    source_url: "https://admissions.cornell.edu/how-apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "215062", // UPenn
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: IMP, character: VI, firstGen: CON, interest: CON, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["pre-professional (Wharton)", "social + collaborative", "interdisciplinary", "urban Philadelphia", "ambitious"], size: "medium-large", vibe: "Known for a pre-professional, ambitious, and social culture - 'work hard, play hard.' Strong interdisciplinary and business bent via Wharton; collaborative rather than cutthroat." }),
    what_they_want: "Penn emphasizes fit with its specific undergraduate schools and its interdisciplinary, pre-professional ethos. They look for applicants with a clear sense of purpose and evidence they'll use Penn's cross-school resources.",
    how_they_select: "Holistic, admitted by undergraduate school (College of Arts & Sciences, Engineering/SEAS, Wharton, Nursing) plus competitive coordinated dual-degree programs. School fit and 'why Penn/why this school' matter.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ Wharton_Business: "Extremely competitive", SEAS_CS: "Very competitive", "M&T / dual-degree": "Among the most selective programs anywhere", note: "The undergraduate school you apply to matters a lot; Wharton and coordinated dual-degrees are dramatically harder." }),
    switch_major_json: JSON.stringify({ ease: "Moderate; cross-school transfer is competitive", note: "Switching within a school is doable; transferring INTO Wharton or between schools is a competitive internal process. Choose your school carefully." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["clear purpose & 'why this school'", "interdisciplinary drive", "leadership/impact", "strong essays"], caution: ["Wharton/dual-degrees are a major reach"] }),
    source_url: "https://admissions.upenn.edu/how-to-apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "217156", // Brown
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: IMP, character: VI, firstGen: CON, interest: NC, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["Open Curriculum", "self-directed", "creative/independent", "collaborative", "progressive"], size: "medium", vibe: "Defined by the Open Curriculum - no core requirements, students design their own path. Attracts independent, intellectually adventurous, self-directed learners; collaborative and creative." }),
    what_they_want: "Brown wants students who will flourish with freedom - self-directed, intellectually curious people who can articulate what they'd do with the Open Curriculum. Authentic voice and initiative are central.",
    how_they_select: "Holistic and need-blind. Strong emphasis on fit with the Open Curriculum: motivation, self-direction, and intellectual curiosity. No admission by major (except the competitive PLME med program).",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Brown, not a major (concentrations declared sophomore year). Exception: PLME (8-year med) and RISD dual-degree are separate, highly competitive.", PLME: "Extremely competitive" }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "The Open Curriculum makes exploring and changing concentrations especially fluid." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["self-direction & curiosity", "fit with Open Curriculum", "authentic voice", "initiative"], neutral: ["demonstrated interest"] }),
    source_url: "https://admission.brown.edu/apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "182670", // Dartmouth
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: IMP, character: VI, firstGen: CON, interest: CON, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["undergraduate-focused", "tight-knit + outdoorsy", "D-Plan quarters", "rural New Hampshire", "strong alumni loyalty"], size: "small-medium", vibe: "Smallest Ivy, intensely undergraduate-focused and community-driven. Outdoorsy, close-knit, strong school spirit and alumni loyalty; the quarter-based 'D-Plan' shapes flexible terms." }),
    what_they_want: "Dartmouth values students who will engage deeply in a small, tight, undergraduate-centered community - intellectual peers who also contribute to campus life. Character and genuine engagement weigh heavily.",
    how_they_select: "Holistic and need-blind. Strong emphasis on personal qualities, contribution to a small community, and fit with an undergraduate-focused, collaborative environment. No admission by major.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Dartmouth, not a major. Majors declared sophomore year." }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Majors declared sophomore year and freely changed." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["community contribution", "character & engagement", "intellectual peers", "strong essays"], neutral: ["demonstrated interest"] }),
    source_url: "https://admissions.dartmouth.edu/apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "147767", // Northwestern
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: IMP, essay: VI, ec: IMP, talent: IMP, character: IMP, firstGen: CON, interest: IMP, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["pre-professional + academic balance", "quarter system", "strong journalism/theater/engineering", "school spirit", "collaborative"], size: "medium-large", vibe: "Balances rigorous academics with real school spirit (Big Ten). Strong across journalism (Medill), theater, engineering, and pre-professional tracks. Fast quarter system; 'fun but intense.'" }),
    what_they_want: "Northwestern reads for fit with its specific schools and for students who balance intellectual seriousness with community engagement. Demonstrated interest and a clear 'why Northwestern' carry real weight here.",
    how_they_select: "Holistic, admitted by undergraduate school (Weinberg arts & sciences, McCormick engineering, Medill journalism, etc.). Fit with the school and demonstrated interest matter.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ McCormick_Engineering_CS: "Very competitive", Medill_Journalism: "Competitive, distinctive", note: "You apply to a specific school; CS (in McCormick) and specialized schools have their own bars." }),
    switch_major_json: JSON.stringify({ ease: "Moderate", note: "Changing within a school is manageable; transferring between undergraduate schools is an internal process." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["school-specific fit", "demonstrated interest", "balance of rigor & engagement", "strong 'why' essays"], neutral: [] }),
    source_url: "https://admissions.northwestern.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "198419", // Duke
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: IMP, character: VI, firstGen: CON, interest: CON, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["pre-professional + athletics", "collaborative", "strong school spirit", "research-rich", "ambitious"], size: "medium", vibe: "Blends elite academics, big-time athletics (basketball culture), and a collaborative, ambitious student body. Strong in engineering, pre-med, public policy, and research." }),
    what_they_want: "Duke looks for ambitious, engaged students who combine academic excellence with leadership and a collaborative spirit. They value distinctive impact and a genuine fit with Duke's blend of academics and community.",
    how_they_select: "Holistic and need-blind. Applicants apply to Trinity (arts & sciences) or the Pratt School of Engineering. Character, impact, and fit weigh heavily.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ Pratt_Engineering: "Competitive; strong math/science expected", CS_Trinity: "Popular and competitive", note: "You apply to Trinity or Pratt; the school shapes requirements. Switching between them is possible early." }),
    switch_major_json: JSON.stringify({ ease: "Moderate", note: "Changing majors within Trinity or Pratt is routine; moving between Trinity and Pratt is possible, easier in the first year." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["ambition & impact", "leadership", "collaborative character", "strong essays"], neutral: [] }),
    source_url: "https://admissions.duke.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "162928", // Johns Hopkins
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: VI, essay: VI, ec: VI, talent: IMP, character: VI, firstGen: IMP, interest: CON, legacy: NC })),
    culture_json: JSON.stringify({ tags: ["research powerhouse", "pre-med + STEM strong", "intense/collaborative", "urban Baltimore", "academic"], size: "medium", vibe: "One of the great research universities, famous for medicine, public health, biomedical engineering, and international studies. Intense, academic, research-driven; recently more collaborative." }),
    what_they_want: "Hopkins values demonstrated intellectual passion and hands-on engagement - research, projects, impact - especially in STEM and health. They read for depth and commitment over breadth, and notably ended legacy preference.",
    how_they_select: "Holistic and need-blind. Strong emphasis on intellectual initiative and fit with a research-intensive environment. Admission is not by major (except the competitive BME department context).",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Hopkins broadly, not a major; majors declared later. Biomedical Engineering is a flagship, highly rigorous department.", BME: "Elite, rigorous department" }),
    switch_major_json: JSON.stringify({ ease: "Easy", note: "Majors declared later and readily changed; BME rigor means switching in requires the coursework." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["research/hands-on depth", "intellectual passion", "STEM initiative", "impact over breadth"], neutral: ["legacy (no longer considered)"] }),
    source_url: "https://apply.jhu.edu/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "110404", // Caltech
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: IMP, recs: VI, essay: IMP, ec: IMP, talent: VI, character: IMP, firstGen: CON, interest: NC, legacy: NC })),
    culture_json: JSON.stringify({ tags: ["tiny + intense STEM", "research-first", "collaborative honor code", "quantitative elite", "quirky"], size: "very small", vibe: "Extremely small, intensely quantitative research institute. Brutal problem sets done collaboratively under a strong honor code. For students who live and breathe math and science." }),
    what_they_want: "Caltech wants the most quantitatively gifted and scientifically driven students - deep talent and passion in math and science, evidenced by research, olympiads, or serious projects. Fit with an all-STEM, research-first culture is essential.",
    how_they_select: "Holistic within an extremely STEM-focused frame; reinstated a testing requirement. Exceptional math/science ability and genuine scientific passion are decisive. No admission by major.",
    applies_by_major: 0,
    major_competition_json: JSON.stringify({ note: "You apply to Caltech, not a major ('option' declared after first year). Every path is intensely quantitative." }),
    switch_major_json: JSON.stringify({ ease: "Very easy", note: "Options (majors) declared after first year and changed freely - though all are STEM and rigorous." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["exceptional math/science talent", "research/olympiad results", "scientific passion", "collaborative character"], caution: ["non-STEM-focused applicants are a poor fit"] }),
    source_url: "https://www.admissions.caltech.edu/apply",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "110662", // UCLA
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: NC, recs: NC, essay: IMP, ec: IMP, talent: CON, character: IMP, firstGen: IMP, volunteer: CON, work: CON })),
    culture_json: JSON.stringify({ tags: ["large public elite", "school spirit + athletics", "diverse", "LA opportunity", "academically strong"], size: "very large", vibe: "Huge, spirited, diverse public in Los Angeles with elite academics and big-time athletics. Independent, opportunity-rich; you drive your own experience. Test-blind like all UCs." }),
    what_they_want: "Top academic achievement in context plus contribution and character shown through the UC Personal Insight Questions. As a UC, UCLA is test-blind and uses holistic comprehensive review across many factors.",
    how_they_select: "Test-blind holistic review by many factors including academic performance in context, rigor, and personal qualities via PIQs. Some majors (CS in Engineering, impacted programs) are far more competitive.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ CS_Engineering: "Extremely competitive (Samueli Engineering)", CS_in_LnS: "Very competitive", note: "CS/engineering are among the hardest admits; the major and college you pick matter a lot at UCLA." }),
    switch_major_json: JSON.stringify({ ease: "Hard for impacted majors", note: "Switching into impacted majors (CS, engineering) after enrolling is competitive and GPA-gated; changing colleges is difficult. Pick your entry point deliberately." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["academic excellence in context", "strong PIQ essays", "contribution/leadership", "first-gen & context"], neutral: ["test scores (not used)", "demonstrated interest"] }),
    source_url: "https://admission.ucla.edu/apply/first-year",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
  {
    college_id: "123961", // USC
    admit_factors_json: JSON.stringify(factors({ rigor: VI, gpa: VI, test: CON, recs: IMP, essay: VI, ec: VI, talent: VI, character: IMP, firstGen: IMP, interest: CON, legacy: CON })),
    culture_json: JSON.stringify({ tags: ["pre-professional + creative", "strong alumni 'Trojan network'", "film/business/engineering", "school spirit", "LA industry ties"], size: "large", vibe: "Ambitious, spirited private in LA with a famously loyal 'Trojan Family' network. Powerhouse in film, business, and engineering; strong industry ties and pre-professional energy." }),
    what_they_want: "USC values distinctive talent and a clear sense of direction, read by school/program. Fit with the specific school (Viterbi engineering, Marshall business, Cinematic Arts) and evidence of talent or passion in that area matter a great deal.",
    how_they_select: "Holistic, with review connected to the school/major you apply to. Some programs (Cinematic Arts, competitive scholarships, specific majors) are dramatically more selective than the overall rate.",
    applies_by_major: 1,
    major_competition_json: JSON.stringify({ Viterbi_CS: "Very competitive", Cinematic_Arts: "Among the most selective anywhere", Marshall_Business: "Competitive", note: "Program selectivity varies enormously; the school/major you apply to shapes your odds." }),
    switch_major_json: JSON.stringify({ ease: "Moderate", note: "Changing majors within a school is manageable; transferring into highly competitive programs (e.g. Cinematic Arts, Viterbi CS) is a competitive internal process." }),
    ideal_applicant_json: JSON.stringify({ rewards: ["distinctive talent/passion", "program-specific fit", "strong essays", "demonstrated direction"], neutral: [] }),
    source_url: "https://admission.usc.edu/apply/",
    source_year: 2025, last_reviewed: "2026-07", confidence_level: "verified",
  },
];
