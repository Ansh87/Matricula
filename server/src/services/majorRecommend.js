// majorStrategy.js - recommends majors that fit the STUDENT (not just a career
// lookup). Uses interests, career goals, and academic strengths to rank a
// curated set of majors, each with why-it-fits, related careers, grad-school
// signal, and BLS-backed outlook. Nothing invented: outlook/pay come from the
// bundled BLS snapshot via careerSeed; fit reasoning is rules-based.
import { majorToCareers } from "./bls.js";

// Curated majors with the signals we match against. gradSchool: whether the
// field typically needs grad school for full career access.
const MAJORS = [
  { name: "Computer Science", tags: ["math","ai","cs","problem-solving","tech","logic"], goals: ["High salary potential","Startup/entrepreneurship","Research opportunities"], gradSchool: false, blurb: "Software, algorithms, and systems - highest-demand tech path with strong pay straight out of undergrad." },
  { name: "Artificial Intelligence", tags: ["ai","math","cs","research","data"], goals: ["Research opportunities","High salary potential"], gradSchool: true, blurb: "Machine learning and intelligent systems. Cutting-edge roles often favor a master's or PhD." },
  { name: "Data Science", tags: ["math","data","cs","statistics","business"], goals: ["High salary potential","Stable career"], gradSchool: false, blurb: "Statistics + programming + domain insight. Broad demand across every industry." },
  { name: "Computer Engineering", tags: ["cs","hardware","ee","math","tech"], goals: ["High salary potential","Stable career"], gradSchool: false, blurb: "Bridges CS and electrical engineering - chips, embedded systems, robotics." },
  { name: "Electrical Engineering", tags: ["ee","hardware","math","physics"], goals: ["Stable career","Research opportunities"], gradSchool: false, blurb: "Circuits, signals, power, and devices. Versatile and stable engineering path." },
  { name: "Finance", tags: ["business","finance","math","economics"], goals: ["High salary potential","Startup/entrepreneurship"], gradSchool: false, blurb: "Markets, valuation, and capital. High earning ceiling; strong internships matter." },
  { name: "Economics", tags: ["economics","math","business","policy","analysis"], goals: ["High salary potential","Graduate school","Impact/public service"], gradSchool: false, blurb: "Incentives, markets, and data. Flexible foundation for finance, policy, law, or grad school." },
  { name: "Business Analytics", tags: ["business","data","statistics","tech"], goals: ["High salary potential","Stable career"], gradSchool: false, blurb: "Business decisions driven by data - a practical blend of analytics and management." },
  { name: "Biomedical Engineering", tags: ["biology","engineering","health","research","math"], goals: ["Research opportunities","Impact/public service"], gradSchool: true, blurb: "Engineering for medicine and healthcare. Many roles and advancement favor grad school." },
  { name: "Mechanical Engineering", tags: ["engineering","physics","math","hardware"], goals: ["Stable career"], gradSchool: false, blurb: "Design and build physical systems - broad, stable, hands-on engineering." },
  { name: "Public Policy", tags: ["policy","economics","analysis","impact","writing"], goals: ["Impact/public service","Graduate school"], gradSchool: true, blurb: "Data-informed policy and governance. Advancement often needs a master's (MPP/MPA)." },
  { name: "Mathematics", tags: ["math","logic","research","statistics"], goals: ["Research opportunities","Graduate school","High salary potential"], gradSchool: true, blurb: "The foundation for quant, data, and research fields. Very flexible; grad school for research roles." },
];

function tagsForProfile(profile) {
  const t = new Set();
  const interests = (profile.interests || []).map((s) => s.toLowerCase());
  const text = interests.join(" ") + " " + (profile.activitiesText || "").toLowerCase();
  const add = (re, tag) => { if (re.test(text)) t.add(tag); };
  add(/comput|software|coding|program/, "cs");
  add(/\bai\b|artificial intelligence|machine learning|\bml\b/, "ai");
  add(/data|analytic|statistic/, "data");
  add(/finance|invest|trading|market/, "finance");
  add(/econ/, "economics");
  add(/business|entrepreneur|startup/, "business");
  add(/electric|circuit|hardware|robot/, "ee");
  add(/mech|physics/, "physics");
  add(/bio|health|medic/, "biology");
  add(/policy|government|public/, "policy");
  add(/math/, "math");
  add(/research|patent|ieee|paper/, "research");
  // Career goals also contribute.
  return t;
}

export function recommendMajors(profile) {
  const ptags = tagsForProfile(profile);
  const goals = new Set(profile.careerGoals || []);
  const scored = MAJORS.map((m) => {
    let score = 0;
    for (const tag of m.tags) if (ptags.has(tag)) score += 10;
    for (const g of m.goals) if (goals.has(g)) score += 6;
    // direct interest name match is a strong signal
    if ((profile.interests || []).some((i) => i.toLowerCase() === m.name.toLowerCase())) score += 25;
    // Grad-school preference: boost grad-heavy majors if interested, slightly
    // discount if the student wants to stop at a bachelor's.
    if (m.gradSchool && profile.gradSchoolInterest === "yes") score += 8;
    if (m.gradSchool && profile.gradSchoolInterest === "no") score -= 6;
    // Risk tolerance: entrepreneurial/high-upside majors for risk-takers.
    const highUpside = ["Finance", "Computer Science", "Artificial Intelligence"].includes(m.name);
    if (highUpside && profile.riskTolerance === "high-upside") score += 5;
    if (highUpside && profile.riskTolerance === "stable") score -= 3;
    // Income direction.
    if (profile.incomeGoal === "high" && m.goals.includes("High salary potential")) score += 4;
    if (profile.incomeGoal === "impact" && m.goals.includes("Impact/public service")) score += 4;
    const careers = majorToCareers(m.name);
    return {
      name: m.name,
      score,
      blurb: m.blurb,
      gradSchool: m.gradSchool,
      careers: careers?.careers?.slice(0, 4) || [],
      why: buildWhy(m, ptags, goals),
    };
  }).filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}

// Suggest strong double-major / sub-major combinations from the student's top
// fitting majors. Pairs are curated for real academic synergy.
const SYNERGIES = {
  "Computer Science": ["Economics", "Mathematics", "Data Science", "Finance", "Artificial Intelligence"],
  "Finance": ["Computer Science", "Economics", "Data Science", "Business Analytics"],
  "Economics": ["Computer Science", "Mathematics", "Data Science", "Public Policy"],
  "Data Science": ["Computer Science", "Economics", "Business Analytics", "Mathematics"],
  "Artificial Intelligence": ["Computer Science", "Mathematics", "Data Science"],
  "Electrical Engineering": ["Computer Engineering", "Computer Science", "Mathematics"],
  "Biomedical Engineering": ["Data Science", "Computer Science", "Mathematics"],
  "Mathematics": ["Computer Science", "Economics", "Data Science", "Finance"],
  "Public Policy": ["Economics", "Data Science"],
};

export function recommendDoubleMajors(profile) {
  const top = recommendMajors(profile).map((m) => m.name);
  if (!top.length) return [];
  const seen = new Set();
  const pairs = [];
  for (const primary of top.slice(0, 4)) {
    const partners = SYNERGIES[primary] || [];
    for (const partner of partners) {
      // Prefer partners that are ALSO a fit for the student.
      const key = [primary, partner].sort().join(" + ");
      if (seen.has(key)) continue;
      seen.add(key);
      const bothFit = top.includes(partner);
      pairs.push({
        combo: `${primary} + ${partner}`,
        primary, partner,
        strength: bothFit ? "Strong" : "Worth exploring",
        why: bothFit
          ? `Both fit your profile, and together they're a high-demand, complementary pairing.`
          : `${partner} complements ${primary} well and broadens your career options.`,
      });
    }
  }
  // Strong pairs first, cap the list.
  return pairs.sort((a, b) => (b.strength === "Strong" ? 1 : 0) - (a.strength === "Strong" ? 1 : 0)).slice(0, 6);
}

function buildWhy(m, ptags, goals) {
  const bits = [];
  const matchedTags = m.tags.filter((t) => ptags.has(t));
  if (matchedTags.length) bits.push(`matches your interest in ${prettyTags(matchedTags)}`);
  const matchedGoals = m.goals.filter((g) => goals.has(g));
  if (matchedGoals.length) bits.push(`supports your goal of ${matchedGoals[0].toLowerCase()}`);
  if (!bits.length) return "A possible fit based on your profile.";
  return "Recommended because it " + bits.join(" and ") + ".";
}

function prettyTags(tags) {
  const map = { cs: "computer science", ai: "AI", data: "data", finance: "finance", economics: "economics", business: "business", ee: "electronics/hardware", physics: "physics", biology: "biology/health", policy: "policy", math: "math", research: "research" };
  const names = [...new Set(tags.map((t) => map[t] || t))];
  return names.slice(0, 3).join(", ");
}
