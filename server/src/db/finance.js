// finance.js - editorial strength ratings for undergraduate FINANCE programs
// (finance, quantitative finance, business economics with a finance focus, and
// the feeder programs Wall Street / quant firms recruit from most heavily).
//
// These are EDITORIAL rankings reflecting widely-recognized program reputation,
// placement into finance careers, and recruiting presence - NOT an official
// government ranking. Live cost/outcome data still comes from College Scorecard
// and is shown alongside. Nothing here is invented outcome data.
//
// score: 0-100 finance strength (editorial). specialties: notable areas.
//
// DATA-INTEGRITY FIX: several ids here were wrong, so the app was silently
// pulling a DIFFERENT college's live official data under the labeled name.
// Corrected against IPEDS/College Scorecard:
//   - "Georgetown University" was tagged 139658 (that's actually Emory
//     University). Real Georgetown id is 131496.
//   - "University of Michigan (Ross)" was tagged 174914 (that's actually
//     University of St Thomas, an unrelated school). Real Michigan id is
//     170976 (same id used for Michigan in stem.js).
//   - "NYU (Stern)" was tagged 196097 (not NYU). Real NYU id is 193900.
//   - "Indiana University (Kelley)" was tagged 209542 (not Indiana). Real
//     Indiana University Bloomington id is 151351.
//   - "Boston College" and "Boston University" had their ids SWAPPED (each
//     was showing the other school's live data). Real Boston College id is
//     164924; real Boston University id is 164988.
// Kansas and UConn ids below have not been independently re-verified (they
// fall outside the app's Top 30 view) - flagged here rather than silently
// trusted.

const F = (id, name, score, tier, specialties) => ({ id, name, score, tier, specialties });

export const TOP_FINANCE = [
  F("215062", "University of Pennsylvania (Wharton)", 100, "Elite Finance", ["finance", "M&T", "investment banking", "quant"]),
  F("190415", "Cornell University", 93, "Top Finance", ["applied economics", "ORIE", "hotel/real estate finance"]),
  F("186131", "Princeton University", 94, "Top Finance", ["ORFE", "economics", "quant finance"]),
  F("166683", "MIT (Sloan)", 95, "Elite Finance", ["finance", "quant", "financial engineering"]),
  F("190150", "Columbia University", 92, "Top Finance", ["economics", "financial economics", "NYC recruiting"]),
  F("130794", "Yale University", 88, "Top Finance", ["economics", "asset management"]),
  F("166027", "Harvard University", 92, "Top Finance", ["economics", "applied math", "recruiting"]),
  F("131496", "Georgetown University", 87, "Top Finance", ["finance (McDonough)", "DC/NYC recruiting"]),
  F("147767", "Northwestern University", 88, "Top Finance", ["economics", "MMSS", "Kellogg certificate"]),
  F("144050", "University of Chicago", 91, "Top Finance", ["economics", "financial mathematics", "quant"]),
  F("198419", "Duke University", 86, "Top Finance", ["economics", "financial economics"]),
  F("221999", "Vanderbilt University", 80, "Strong Finance", ["economics", "financial economics"]),
  F("234076", "University of Virginia (McIntire)", 89, "Top Finance", ["finance (McIntire)", "commerce"]),
  F("170976", "University of Michigan (Ross)", 88, "Top Finance", ["finance (Ross)", "BBA"]),
  F("228778", "UT Austin (McCombs)", 85, "Top Finance", ["finance (McCombs)", "BHP honors"]),
  F("110635", "UC Berkeley (Haas)", 87, "Top Finance", ["business (Haas)", "economics"]),
  F("199120", "UNC Chapel Hill (Kenan-Flagler)", 83, "Strong Finance", ["finance", "business"]),
  F("186380", "Rutgers-New Brunswick", 74, "Solid Finance", ["finance", "business analytics"]),
  F("193900", "NYU (Stern)", 91, "Top Finance", ["finance (Stern)", "NYC recruiting", "quant"]),
  F("164924", "Boston College (Carroll)", 80, "Strong Finance", ["finance", "accounting"]),
  F("164988", "Boston University (Questrom)", 76, "Solid Finance", ["finance", "business"]),
  F("214777", "Penn State (Smeal)", 76, "Solid Finance", ["finance (Smeal)", "risk management"]),
  F("204796", "Ohio State (Fisher)", 74, "Solid Finance", ["finance", "business"]),
  F("240444", "UW–Madison", 76, "Solid Finance", ["finance", "actuarial science", "risk management"]),
  F("145637", "UIUC (Gies)", 78, "Solid Finance", ["finance (Gies)", "accountancy"]),
  F("155317", "University of Kansas", 66, "Emerging Finance", ["finance", "business"]),
  F("134130", "University of Florida (Warrington)", 79, "Strong Finance", ["finance", "business"]),
  F("110662", "UCLA", 82, "Strong Finance", ["business economics", "economics"]),
  F("123961", "USC (Marshall)", 82, "Strong Finance", ["finance (Marshall)", "business"]),
  F("151351", "Indiana University (Kelley)", 80, "Strong Finance", ["finance (Kelley)", "investment banking workshop"]),
  F("139755", "Georgia Tech (Scheller)", 78, "Solid Finance", ["quantitative finance", "business analytics"]),
  F("163286", "University of Maryland (Smith)", 74, "Solid Finance", ["finance", "business"]),
  F("186584", "Stevens Institute of Technology", 73, "Solid Finance", ["quantitative finance", "financial engineering"]),
  F("129020", "University of Connecticut", 70, "Emerging Finance", ["finance", "risk management"]),
  F("100751", "University of Alabama", 68, "Emerging Finance", ["finance", "business"]),
].sort((a, b) => b.score - a.score);

const BY_ID = new Map(TOP_FINANCE.map((s) => [String(s.id), s]));
export function financeFor(id) { return BY_ID.get(String(id)) || null; }
export function financeRank(id) {
  const i = TOP_FINANCE.findIndex((s) => String(s.id) === String(id));
  return i === -1 ? null : i + 1;
}
