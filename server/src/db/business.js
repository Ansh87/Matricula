// business.js - editorial strength ratings for undergraduate BUSINESS programs
// (general management, marketing, strategy, entrepreneurship, business
// analytics). Distinct from finance.js, which focuses narrowly on finance.
//
// EDITORIAL rankings reflecting widely-recognized program reputation and
// outcomes - NOT an official government ranking. Live cost/earnings data still
// comes from College Scorecard and is shown alongside.
//
// score: 0-100 business strength (editorial).
//
// DATA-INTEGRITY FIX: several ids here were wrong (same errors as in
// finance.js, since both files were built together), so the app was silently
// pulling a DIFFERENT college's live official data under the labeled name.
// Corrected against IPEDS/College Scorecard:
//   - "University of Michigan (Ross)" was tagged 174914 (University of St
//     Thomas, unrelated). Real Michigan id is 170976.
//   - "NYU (Stern)" was tagged 196097 (not NYU). Real NYU id is 193900.
//   - "Indiana University (Kelley)" was tagged 209542 (not Indiana). Real
//     Indiana University Bloomington id is 151351.
//   - "Georgetown University" was tagged 139658 (that's actually Emory
//     University). Real Georgetown id is 131496.
//   - "Boston College" and "Boston University" had their ids SWAPPED. Real
//     Boston College id is 164924; real Boston University id is 164988.
//   - "Arizona State (W. P. Carey)" was tagged 104179 (that's actually
//     University of Arizona, a different school). Real ASU id is 104151.
// UConn id below has not been independently re-verified (falls outside the
// app's Top 30 view) - flagged rather than silently trusted.

const B = (id, name, score, tier, specialties) => ({ id, name, score, tier, specialties });

export const TOP_BUSINESS = [
  B("215062", "University of Pennsylvania (Wharton)", 100, "Elite Business", ["management", "entrepreneurship", "marketing", "M&T"]),
  B("170976", "University of Michigan (Ross)", 92, "Top Business", ["BBA", "management", "consulting"]),
  B("110635", "UC Berkeley (Haas)", 91, "Top Business", ["business admin", "entrepreneurship"]),
  B("193900", "NYU (Stern)", 90, "Top Business", ["business", "marketing", "NYC"]),
  B("228778", "UT Austin (McCombs)", 88, "Top Business", ["BBA", "business honors (BHP)"]),
  B("234076", "University of Virginia (McIntire)", 88, "Top Business", ["commerce", "management"]),
  B("199120", "UNC Chapel Hill (Kenan-Flagler)", 86, "Top Business", ["business admin", "consulting"]),
  B("151351", "Indiana University (Kelley)", 84, "Strong Business", ["management", "marketing", "consulting workshop"]),
  B("123961", "USC (Marshall)", 84, "Strong Business", ["business admin", "entrepreneurship (Greif)"]),
  B("166683", "MIT (Sloan)", 90, "Top Business", ["management science", "analytics", "entrepreneurship"]),
  B("190415", "Cornell (Dyson)", 87, "Top Business", ["applied economics & management", "hotel admin"]),
  B("147767", "Northwestern University", 85, "Strong Business", ["economics", "Kellogg certificate", "consulting"]),
  B("139755", "Georgia Tech (Scheller)", 80, "Strong Business", ["business analytics", "supply chain", "IT management"]),
  B("134130", "University of Florida (Warrington)", 80, "Strong Business", ["business admin", "marketing"]),
  B("145637", "UIUC (Gies)", 80, "Strong Business", ["accountancy", "information systems"]),
  B("164924", "Boston College (Carroll)", 81, "Strong Business", ["management", "marketing"]),
  B("164988", "Boston University (Questrom)", 77, "Solid Business", ["business admin", "marketing"]),
  B("214777", "Penn State (Smeal)", 78, "Solid Business", ["supply chain", "marketing"]),
  B("204796", "Ohio State (Fisher)", 76, "Solid Business", ["business admin", "logistics"]),
  B("240444", "UW–Madison", 78, "Solid Business", ["marketing", "real estate", "risk management"]),
  B("163286", "University of Maryland (Smith)", 76, "Solid Business", ["business analytics", "supply chain"]),
  B("186380", "Rutgers-New Brunswick", 74, "Solid Business", ["business analytics", "supply chain", "marketing"]),
  B("110662", "UCLA", 82, "Strong Business", ["business economics", "management"]),
  B("144050", "University of Chicago", 86, "Top Business", ["economics", "business economics"]),
  B("198419", "Duke University", 83, "Strong Business", ["economics", "markets & management"]),
  B("221999", "Vanderbilt University", 78, "Solid Business", ["economics", "human & organizational development"]),
  B("131496", "Georgetown University", 84, "Strong Business", ["business (McDonough)", "international business"]),
  B("130794", "Yale University", 80, "Strong Business", ["economics", "management studies"]),
  B("166027", "Harvard University", 86, "Top Business", ["economics", "recruiting"]),
  B("186131", "Princeton University", 82, "Strong Business", ["economics", "ORFE"]),
  B("190150", "Columbia University", 85, "Strong Business", ["economics", "NYC recruiting"]),
  B("129020", "University of Connecticut", 70, "Emerging Business", ["business admin", "marketing"]),
  B("104151", "Arizona State (W. P. Carey)", 72, "Emerging Business", ["supply chain", "business analytics"]),
  B("100751", "University of Alabama (Culverhouse)", 69, "Emerging Business", ["business admin", "marketing"]),
  B("186584", "Stevens Institute of Technology", 71, "Emerging Business", ["business & technology", "analytics"]),
].sort((a, b) => b.score - a.score);

const BY_ID = new Map(TOP_BUSINESS.map((s) => [String(s.id), s]));
export function businessFor(id) { return BY_ID.get(String(id)) || null; }
export function businessRank(id) {
  const i = TOP_BUSINESS.findIndex((s) => String(s.id) === String(id));
  return i === -1 ? null : i + 1;
}
