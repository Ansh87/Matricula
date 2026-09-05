// advisor.js - the AI college advisor. When a Gemini key is configured, it
// answers using the student's real profile + their scored college list as
// grounding, following the spec's guardrails (no guarantees, cite data,
// separate fact from estimate, recommend counselor review). Without a key, it
// falls back to the deterministic keyword answers so the feature always works.
import { config } from "../config.js";
import { db } from "../db/database.js";
import { PUBLISHED_EXAMPLE_ESSAYS } from "./essayCenter.js";

const SYSTEM_GUARDRAILS = `You are Matricula's college advisor for a single high-school student and their family.
Rules you MUST follow:
- Never guarantee admission or say the student "will" or "won't" get in. Admissions are holistic and unpredictable.
- Use ONLY the data provided in context (the student's profile and their scored college list). Do NOT invent college facts, admission rates, deadlines, or scholarships.
- For essay prompts and sample essays specifically: use ONLY what's listed in STUDENT'S ESSAY DATA below, quoted exactly as given. Never invent, paraphrase from memory, or guess a college's actual essay prompt wording, even if you believe you know it. If the student asks about a college with no tracked prompts listed, say plainly that none are tracked yet and point them to the Essay Center's "Find prompts" feature for that college -- do not fill the gap with a guess.
- Separate facts (from official data) from estimates (fit scores, categories). Say when something is an estimate.
- Be concrete and personal: reference the student's actual numbers and their actual list when relevant.
- Encourage an authentic student voice; never write dishonest essays or suggest fake activities.
- Recommend confirming with the school counselor and each college's official site for anything high-stakes.
- Keep answers focused and practical (a few short paragraphs max). No stereotypes; no advice based on protected characteristics.`;

export async function answerAdvisor({ question, profile, recommendations, essayContext }) {
  if (config.gemini.apiKey) {
    const viaAI = await answerWithGemini({ question, profile, recommendations, essayContext });
    if (viaAI) return viaAI;
  }
  return { answer: keywordAnswer({ question, profile, recommendations, essayContext }), source: "rules", disclaimer: DISCLAIMER };
}

const DISCLAIMER = "Planning aid only. Not a substitute for your school counselor or a college's admissions office.";

// ---------------------------------------------------------------------------
// Essay grounding (so "what essays do I need for X" answers real, sourced
// data instead of the model inventing or half-remembering prompt text).
// Reuses the same tables/lists Essay Center itself reads from -- never a
// second, separate essay data source that could drift out of sync.
// ---------------------------------------------------------------------------
function normalizeCollegeName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function matchesPublishedExample(savedName, entry) {
  const n = normalizeCollegeName(savedName);
  if (!n) return false;
  const entryName = normalizeCollegeName(entry.college);
  if (n.includes(entryName) || entryName.includes(n)) return true;
  return (entry.aliases || []).some((a) => { const na = normalizeCollegeName(a); return n.includes(na) || na.includes(n); });
}

export function buildEssayGrounding(studentId) {
  if (!studentId) return { colleges: [] };
  const saved = db.prepare("SELECT college_id, college_name FROM student_college_list WHERE student_id=?").all(studentId);
  const prompts = db.prepare("SELECT college_id, college_name, essay_type, prompt_text, word_limit, cycle_type, verification_status FROM essay_prompts WHERE student_id=?").all(studentId);
  const promptsByCollege = new Map();
  for (const p of prompts) {
    const key = p.college_id || p.college_name || "?";
    if (!promptsByCollege.has(key)) promptsByCollege.set(key, []);
    promptsByCollege.get(key).push(p);
  }
  const colleges = saved.map((s) => ({
    collegeId: s.college_id,
    collegeName: s.college_name,
    trackedPrompts: (promptsByCollege.get(s.college_id) || []).map((t) => ({
      type: t.essay_type, text: t.prompt_text, wordLimit: t.word_limit, cycle: t.cycle_type, status: t.verification_status,
    })),
    publishedExampleLinks: PUBLISHED_EXAMPLE_ESSAYS.filter((e) => matchesPublishedExample(s.college_name, e))
      .map((e) => ({ title: e.title, url: e.url, isRealApplicantEssay: e.isRealApplicantEssay, description: e.description })),
  }));
  return { colleges };
}

async function answerWithGemini({ question, profile, recommendations, essayContext }) {
  // Build a compact, grounded context from the scored list (top 25 to keep it small).
  const list = (recommendations || []).slice(0, 25).map((r) => ({
    name: r.college?.name,
    state: r.college?.state,
    category: r.admission?.category,
    admitRate: r.college?.admissionRate,
    satMid: r.college?.satMidpoint,
    netCost: r.netCost,
    overall: r.overall,
    roiPayback: r.roi?.paybackYears,
    round: r.round?.round,
  }));
  const prof = {
    grade: profile.grade, state: profile.state, gpa: profile.gpa, gpaWeighted: profile.gpaWeighted,
    sat: profile.satSuper || profile.sat, act: profile.actSuper || profile.act, apCount: profile.apCount,
    interests: profile.interests, careerGoals: profile.careerGoals, budget: profile.budget,
    hasResearch: profile.hasResearch, hasLeadership: profile.hasLeadership, willingED: profile.willingED,
    gradSchoolInterest: profile.gradSchoolInterest,
  };
  const prompt = `${SYSTEM_GUARDRAILS}

STUDENT PROFILE (JSON):
${JSON.stringify(prof)}

STUDENT'S SCORED COLLEGE LIST (JSON, estimates from official data):
${JSON.stringify(list)}

STUDENT'S ESSAY DATA (JSON) -- per saved college: prompts already tracked in the Essay Center (trackedPrompts, exact text as entered/found), and any officially-published sample-essay links (publishedExampleLinks). If a college here has an empty trackedPrompts array, none are tracked yet -- say so and suggest the Essay Center's "Find prompts" feature instead of guessing what the prompts might be:
${JSON.stringify(essayContext || { colleges: [] })}

STUDENT QUESTION: "${question}"

Answer in this shape (plain text, no markdown headers):
1) A direct, personal answer grounded in the data above.
2) One line naming what data you used.
3) If relevant, one short "next step" suggestion.
Remember: estimates not guarantees; recommend counselor review for big decisions.`;

  const model = config.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
    });
    if (!res.ok) return null; // fall back to keyword
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;
    return { answer: text, source: `Google Gemini (${model})`, disclaimer: DISCLAIMER };
  } catch {
    return null;
  }
}

// Generic words that show up in lots of college names AND in ordinary
// questions about essays/applications -- excluded from the single-word
// fallback match so a question like "what essays do I need" doesn't
// accidentally "name" a college whose name happens to contain "college" or
// "essay" (e.g. a saved program literally titled with those words).
const NAME_MATCH_STOPWORDS = new Set([
  "college", "university", "state", "institute", "school", "academy",
  "essay", "essays", "prompt", "prompts", "application", "applications",
  "the", "and", "for", "of", "at",
]);
function findNamedCollege(q, cols) {
  const nq = normalizeCollegeName(q);
  for (const c of cols) {
    const nc = normalizeCollegeName(c.collegeName);
    if (!nc) continue;
    if (nq.includes(nc)) return c;
    const words = nc.split(" ").filter((w) => w.length >= 4 && !NAME_MATCH_STOPWORDS.has(w));
    if (words.some((w) => nq.includes(w))) return c;
  }
  return null;
}

// Deterministic fallback (also used when no key). Mirrors the prior behavior.
function keywordAnswer({ question, profile, recommendations, essayContext }) {
  const q = (question || "").toLowerCase();
  const withCat = (cat) => (recommendations || []).filter((r) => r.admission?.category === cat);
  if (/safety|likely|match/.test(q)) {
    const s = withCat("Safety").slice(0, 5).map((r) => r.college.name);
    return s.length ? `Based on official admission rates and your academics, these lean Safety/likely: ${s.join(", ")}. Admissions are still holistic and not guaranteed.`
      : "No clear Safety schools in the current list. Add some larger public universities in your state and re-run recommendations.";
  }
  if (/reach|hard|selective/.test(q)) {
    const r = withCat("Reach").slice(0, 5).map((x) => x.college.name);
    return r.length ? `These are Reach schools given published admission rates: ${r.join(", ")}. Keep 2–4 reaches balanced with targets and safeties.`
      : "No Reach schools currently flagged. If you want to aim higher, add more selective institutions.";
  }
  if (/cost|afford|money|net price|budget/.test(q)) {
    const priced = (recommendations || []).filter((r) => r.netCost != null).slice(0, 5);
    return priced.length ? `Estimated net costs (official College Scorecard figures where available): ${priced.map((r) => `${r.college.name} ≈ $${r.netCost.toLocaleString()}`).join("; ")}. Confirm with each college's official net price calculator.`
      : "Net price data isn't available for the current list. Check each college's official net price calculator.";
  }
  if (/major|career|salary|job/.test(q)) {
    const major = (profile.interests && profile.interests[0]) || "your intended major";
    return `Career outcomes for ${major} come from BLS data in the Careers and Majors tabs, with median pay and projected growth. Salaries are national medians and estimates, not guarantees.`;
  }
  if (/\bed\b|early decision|\bea\b|early action|round|when.*apply/.test(q)) {
    return "Application-round strategy depends on each school's category: reaches often benefit most from ED if you're willing to commit and the finances work; targets suit EA; safeties suit early/rolling. Open any college for its specific recommended round.";
  }
  if (/improve|chances|better|retake/.test(q)) {
    return "To strengthen your applications: keep test scores near or above each school's published SAT midpoint, deepen one or two extracurriculars into leadership or research, and balance reach/target/safety. Open a college to see what to improve for that specific school. These are general strategies, not guarantees.";
  }
  if (/essay|prompt|supplement/.test(q)) {
    const cols = essayContext?.colleges || [];
    if (!cols.length) {
      return "You haven't saved any colleges yet, so there's nothing to check for essays. Save colleges first, then open the Essay Center to track or find their real prompts.";
    }
    const named = findNamedCollege(q, cols);
    const focus = named ? [named] : cols;
    const withPrompts = focus.filter((c) => c.trackedPrompts.length);
    const withExamples = focus.filter((c) => c.publishedExampleLinks.length);
    const parts = [];
    if (withPrompts.length) {
      parts.push(withPrompts.map((c) => `${c.collegeName} -- ${c.trackedPrompts.slice(0, 3).map((p) => `"${p.text}"${p.wordLimit ? ` (${p.wordLimit})` : ""}`).join(" / ")}`).join(" | "));
    } else {
      parts.push(named ? `No essay prompts are tracked yet for ${named.collegeName}.` : "No essay prompts are tracked yet for your saved colleges.");
    }
    if (withExamples.length) {
      parts.push(`Officially published sample essays: ${withExamples.map((c) => `${c.collegeName} -- ${c.publishedExampleLinks.map((e) => e.url).join(", ")}`).join("; ")}.`);
    }
    parts.push('Open the Essay Center and use "Find prompts" to pull real prompts for any college, and see the full sample-essay list under Published Examples.');
    return parts.join(" ");
  }
  return "I can explain your Reach/Target/Safety split, estimated net costs (from College Scorecard), BLS career outcomes for your major, application-round strategy, and essay prompts already tracked for your saved colleges. Ask about any of those. I only use data actually available for your list -- I'll never guess a college's essay prompt wording. For a fuller conversation, add a free Gemini key on the server.";
}
