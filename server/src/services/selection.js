// selection.js - reads verified selection profiles and computes a culture/fit
// analysis for a given student. "What they want / how they select / major
// strategy / culture fit" all flow from here. Nothing is invented: if a college
// has no verified selection profile, we say so rather than guessing.
import { db } from "../db/database.js";

const getStmt = db.prepare("SELECT * FROM college_selection_profiles WHERE college_id = ?");

const FACTOR_LABELS = {
  rigor: "Course rigor", gpa: "GPA", testScores: "Test scores", classRank: "Class rank",
  recommendations: "Recommendations", essay: "Essays", extracurriculars: "Extracurriculars",
  talent: "Talent/ability", character: "Character/personal qualities", firstGen: "First-generation",
  demonstratedInterest: "Demonstrated interest", legacy: "Legacy", volunteer: "Volunteer work",
  workExperience: "Work experience",
};
const RATING_WORD = { 4: "Very important", 3: "Important", 2: "Considered", 1: "Not considered" };

function j(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

export function getSelection(collegeId) {
  const row = getStmt.get(String(collegeId));
  if (!row) {
    return { available: false, note: "No verified selection profile on file for this college yet. What a college looks for is best confirmed on its official admissions site and Common Data Set." };
  }
  const admitFactors = j(row.admit_factors_json) || {};
  const factors = Object.entries(admitFactors)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ key: k, label: FACTOR_LABELS[k] || k, rating: v, word: RATING_WORD[v] }))
    .sort((a, b) => b.rating - a.rating);
  return {
    available: true,
    collegeId: row.college_id,
    factors,
    culture: j(row.culture_json),
    whatTheyWant: row.what_they_want,
    howTheySelect: row.how_they_select,
    appliesByMajor: !!row.applies_by_major,
    majorCompetition: j(row.major_competition_json),
    switchMajor: j(row.switch_major_json),
    idealApplicant: j(row.ideal_applicant_json),
    source: { url: row.source_url, year: row.source_year, lastReviewed: row.last_reviewed, confidence: row.confidence_level },
  };
}

// Culture / selection fit: compares the student's own strengths against the
// factors THIS college actually weights most. Honest and explainable - it tells
// the student where they're aligned and where they're light, per the college's
// stated priorities. Returns null if no verified profile exists.
export function cultureFit(profile, sel) {
  if (!sel?.available) return null;

  // crude student strength signals (0-1) from the profile
  const strong = {
    rigor: profile.rigorHigh ? 1 : profile.apCount >= 6 ? 0.8 : profile.apCount >= 3 ? 0.55 : 0.3,
    gpa: profile.gpa ? Math.max(0, Math.min(1, (profile.gpa - 3.0) / 1.0)) : 0.5,
    testScores: profile.sat ? Math.max(0, Math.min(1, (profile.sat - 1200) / 400)) : 0.4,
    extracurriculars: ecStrength(profile),
    essay: 0.6, // unknown at this stage; neutral-positive
    character: 0.6,
    talent: (profile.awards && profile.awards !== "none") ? 0.8 : 0.5,
    recommendations: 0.6,
    demonstratedInterest: 0.5,
    firstGen: profile.firstGen ? 1 : 0,
  };

  const aligned = [], gaps = [];
  let scoreSum = 0, weightSum = 0;
  for (const f of sel.factors) {
    if (f.rating < 3) continue; // only Important / Very Important shape fit
    const s = strong[f.key];
    if (s == null) continue;
    const w = f.rating; // 3 or 4
    scoreSum += s * w; weightSum += w;
    if (s >= 0.7) aligned.push(f.label);
    else if (s <= 0.45) gaps.push(f.label);
  }
  const score = weightSum ? Math.round((scoreSum / weightSum) * 100) : null;

  return {
    score,
    aligned,
    gaps,
    summary: buildSummary(score, aligned, gaps, sel),
  };
}

function ecStrength(p) {
  const lvl = (p.awards || "").toLowerCase();
  let base = 0.4;
  if ((p.careerGoals || []).length) base += 0.1;
  if (lvl.includes("national") || lvl.includes("international")) base += 0.4;
  else if (lvl.includes("state") || lvl.includes("regional")) base += 0.25;
  else if (lvl.includes("school") || lvl.includes("local")) base += 0.1;
  return Math.max(0, Math.min(1, base));
}

function buildSummary(score, aligned, gaps, sel) {
  const bits = [];
  if (score == null) return "Not enough profile detail to assess culture fit.";
  const vibe = sel.culture?.tags?.slice(0, 3).join(", ");
  if (score >= 70) bits.push(`You align well with what this college weights most${vibe ? ` and its ${vibe} culture` : ""}.`);
  else if (score >= 45) bits.push(`Partial fit with this college's priorities${vibe ? ` (${vibe})` : ""}.`);
  else bits.push(`This college weights things where your current profile is lighter.`);
  if (aligned.length) bits.push(`Strengths for them: ${aligned.join(", ")}.`);
  if (gaps.length) bits.push(`Where to strengthen: ${gaps.join(", ")}.`);
  bits.push("This is an estimate from the college's stated priorities, not a prediction - admissions are holistic.");
  return bits.join(" ");
}

export { FACTOR_LABELS, RATING_WORD };
