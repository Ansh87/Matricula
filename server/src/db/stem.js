// stem.js - STEM-strength ratings for a curated set of colleges, used to power a
// "Top STEM colleges" ranking. Ratings reflect widely-recognized strength of
// undergraduate STEM (CS/engineering/science) programs based on reputation,
// research, and outcomes. These are editorial rankings, clearly labeled as such
// - NOT an official government dataset. Live outcome data (earnings, grad rate)
// still comes from College Scorecard and is shown alongside.
//
// score: 0-100 STEM strength (editorial). specialties: notable STEM areas.
//
// NOTE (cleanup pass): this list previously had ~14 exact-duplicate rows (the
// same college_id listed twice, sometimes with a different score) plus one
// real data bug - Purdue appeared under two DIFFERENT ids (243780 and
// 240727); 243780 is Purdue's actual IPEDS/College Scorecard UNITID, so the
// 240727 row was simply wrong and has been removed. Deduped down to 38
// distinct colleges, then expanded with 12 more real, verified colleges to
// reach a genuine Top 50 (ids confirmed against IPEDS/College Scorecard, not
// guessed).
//
// SEPARATE, MORE SERIOUS FIX: several colleges here were tagged with another
// real college's id, so the app was silently pulling and showing the WRONG
// college's live official Scorecard data (admit rate, cost, earnings) under
// the right name. Every id below was independently re-verified against
// IPEDS/College Scorecard before this pass. Corrections made:
//   - "Carnegie Mellon" was tagged 201645 (that's actually Case Western
//     Reserve University). Real CMU id is 211440. Also fixed in
//     verifiedSeed2.js, selectionSeed.js, deadlineSeed.js. Case Western is now
//     correctly listed below under its own real id (201645).
//   - "Emory University" was tagged 139959 (that's actually University of
//     Georgia). Real Emory id is 139658.
//   - "UC San Diego" was tagged 110644 (that's actually UC Davis). Real UCSD
//     id is 110680.
//   - "UC Santa Barbara" was tagged 445188 (that's actually UC Merced). Real
//     UCSB id is 110705.
//   - "Arizona State University" was tagged 104179 (that's actually
//     University of Arizona, a different school). Real ASU id is 104151.
// (Purdue, business.js, and finance.js had similar errors - see comments in
// those files.)

const S = (id, name, score, tier, specialties) => ({ id, name, score, tier, specialties });

// Curated Top-50 STEM colleges (national). Ordered by editorial STEM strength.
export const TOP_STEM = [
  S("166683", "MIT", 100, "Elite STEM", ["CS", "AI", "EECS", "all engineering", "physics"]),
  S("110404", "Caltech", 99, "Elite STEM", ["physics", "engineering", "CS", "research"]),
  S("243744", "Stanford", 98, "Elite STEM", ["CS", "AI", "engineering", "entrepreneurship"]),
  S("110635", "UC Berkeley", 97, "Elite STEM", ["EECS", "CS", "engineering", "research"]),
  S("211440", "Carnegie Mellon", 96, "Elite STEM", ["CS", "AI/ML", "robotics", "software"]),
  S("186131", "Princeton", 92, "Top STEM", ["CS", "engineering", "physics", "ORFE"]),
  S("145637", "UIUC", 94, "Top STEM", ["CS", "engineering", "computer engineering"]),
  S("139755", "Georgia Tech", 94, "Top STEM", ["CS", "all engineering", "co-op"]),
  S("170976", "University of Michigan", 92, "Top STEM", ["engineering", "CS", "research"]),
  S("162928", "Johns Hopkins", 91, "Top STEM", ["biomedical engineering", "research", "public health"]),
  S("190415", "Cornell", 91, "Top STEM", ["CS", "engineering", "applied sciences"]),
  S("228778", "UT Austin", 91, "Top STEM", ["CS (Turing)", "engineering"]),
  S("215062", "UPenn", 89, "Top STEM", ["CS (SEAS)", "bioengineering", "M&T"]),
  S("243780", "Purdue", 89, "Top STEM", ["engineering", "CS", "aerospace"]),
  S("166027", "Harvard", 88, "Top STEM", ["CS", "applied math", "research"]),
  S("190150", "Columbia", 90, "Top STEM", ["CS (SEAS)", "engineering", "data science"]),
  S("147767", "Northwestern", 86, "Strong STEM", ["engineering (McCormick)", "CS", "materials"]),
  S("198419", "Duke", 86, "Strong STEM", ["engineering (Pratt)", "CS", "biomedical"]),
  S("110662", "UCLA", 86, "Strong STEM", ["CS", "engineering (Samueli)"]),
  S("163286", "University of Maryland", 85, "Strong STEM", ["CS", "cybersecurity", "engineering"]),
  S("144050", "University of Chicago", 85, "Strong STEM", ["CS", "math", "physics"]),
  S("130794", "Yale", 84, "Strong STEM", ["CS", "biomedical", "applied physics"]),
  S("110680", "UC San Diego", 84, "Strong STEM", ["CS", "engineering (Jacobs)", "bioengineering"]),
  S("123961", "USC", 83, "Strong STEM", ["CS (Viterbi)", "engineering", "games"]),
  S("217156", "Brown", 82, "Strong STEM", ["CS", "applied math", "engineering"]),
  S("214777", "Penn State", 82, "Strong STEM", ["engineering", "CS", "materials"]),
  S("221999", "Vanderbilt University", 82, "Strong STEM", ["engineering", "CS", "biomedical"]),
  S("201645", "Case Western Reserve University", 81, "Strong STEM", ["biomedical engineering", "engineering", "CS"]),
  S("110705", "UC Santa Barbara", 81, "Strong STEM", ["CS", "engineering", "physics"]),
  S("182670", "Dartmouth", 80, "Strong STEM", ["engineering (Thayer)", "CS"]),
  S("186584", "Stevens Institute of Technology", 80, "Strong STEM", ["engineering", "CS", "co-op"]),
  S("110653", "UC Irvine", 80, "Strong STEM", ["CS", "engineering", "data science"]),
  S("240444", "UW–Madison", 82, "Strong STEM", ["CS", "engineering", "data science"]),
  S("167358", "Northeastern University", 80, "Strong STEM", ["CS", "engineering", "co-op"]),
  S("236948", "University of Washington", 87, "Top STEM", ["CS (Allen School)", "engineering", "research"]),
  S("227757", "Rice University", 83, "Strong STEM", ["CS", "engineering", "applied math"]),
  S("199120", "UNC Chapel Hill", 79, "Solid STEM", ["CS", "data science", "biology"]),
  S("186380", "Rutgers-New Brunswick", 78, "Solid STEM", ["CS", "engineering", "data science"]),
  S("186867", "NJIT", 76, "Solid STEM", ["engineering", "CS", "architecture"]),
  S("139658", "Emory University", 76, "Solid STEM", ["CS", "biology", "pre-health"]),
  S("228723", "Texas A&M University", 80, "Solid STEM", ["engineering", "CS", "aerospace"]),
  S("199193", "North Carolina State University", 79, "Solid STEM", ["engineering", "CS", "textiles"]),
  S("194824", "Rensselaer Polytechnic Institute", 78, "Solid STEM", ["engineering", "CS", "architecture"]),
  S("233921", "Virginia Tech", 78, "Solid STEM", ["engineering", "CS", "aerospace"]),
  S("168421", "Worcester Polytechnic Institute", 77, "Solid STEM", ["engineering", "CS", "robotics"]),
  S("215293", "University of Pittsburgh", 76, "Solid STEM", ["bioengineering", "CS", "engineering"]),
  S("195030", "University of Rochester", 75, "Solid STEM", ["optics", "engineering", "CS"]),
  S("126614", "University of Colorado Boulder", 76, "Solid STEM", ["aerospace engineering", "CS", "engineering"]),
  S("100751", "University of Alabama", 72, "Solid STEM", ["engineering", "CS"]),
  S("104151", "Arizona State University", 74, "Solid STEM", ["engineering (Fulton)", "CS"]),
].sort((a, b) => b.score - a.score);

const BY_ID = new Map(TOP_STEM.map((c) => [c.id, c]));
export function stemFor(id) { return BY_ID.get(String(id)) || null; }
export function stemRank(id) {
  const i = TOP_STEM.findIndex((c) => c.id === String(id));
  return i === -1 ? null : i + 1;
}
