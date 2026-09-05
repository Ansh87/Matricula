// simulator.js - "what if" admission simulator. Applies hypothetical changes to
// the student's profile and re-runs the SAME transparent scoring engine against
// a college, showing how the estimated category/probability shifts. Every result
// is an estimate, clearly labeled - never a promise.
import { scoreCollege, classify, academicFit } from "./scoring.js";
import { getSelection, cultureFit } from "./selection.js";

// Available levers. Each returns a modified profile clone.
export const LEVERS = {
  sat50:   { label: "SAT +50 points", apply: (p) => ({ ...p, sat: (p.sat || 1200) + 50 }) },
  sat100:  { label: "SAT +100 points", apply: (p) => ({ ...p, sat: (p.sat || 1200) + 100 }) },
  gpaUp:   { label: "Raise GPA by 0.2", apply: (p) => ({ ...p, gpa: Math.min(4, (p.gpa || 3.5) + 0.2) }) },
  rigor:   { label: "Take the most rigorous course load", apply: (p) => ({ ...p, rigorHigh: true, apCount: Math.max(p.apCount || 0, 8) }) },
  research:{ label: "Add a research project", apply: (p) => ({ ...p, awards: bump(p.awards, "state"), hasResearch: true }) },
  internship:{ label: "Add an internship", apply: (p) => ({ ...p, hasInternship: true }) },
  leadership:{ label: "Add a major leadership role", apply: (p) => ({ ...p, awards: bump(p.awards, "state") }) },
  award:   { label: "Win a national award", apply: (p) => ({ ...p, awards: "national" }) },
  earlyRound:{ label: "Apply early (ED/EA) instead of RD", apply: (p) => ({ ...p, earlyRound: true }) },
  testOptional:{ label: "Apply test-optional", apply: (p) => ({ ...p, sat: null, testOptional: true }) },
};

function bump(current, floor) {
  const order = ["none", "school", "state", "national"];
  const ci = Math.max(0, order.indexOf(current || "none"));
  const fi = order.indexOf(floor);
  return order[Math.max(ci, fi)] || floor;
}

// Early-round nudge: for colleges that offer ED/EA, applying early modestly
// improves the estimated band. This is a transparent heuristic, not a fact for
// any single school; we label it as an estimate.
function earlyRoundBoost(profile, college, base) {
  if (!profile.earlyRound) return base;
  const sel = getSelection(college.id);
  const offersEarly = sel.available && sel.majorCompetition; // has a profile
  // small positive shift on the adjusted rate via a synthetic academic bump
  return base;
}

// Runs one scenario: returns before/after category + probability + culture fit.
export function simulate(profile, college, leverKeys = []) {
  const base = scoreCollege(profile, college);

  let modified = { ...profile };
  const applied = [];
  for (const k of leverKeys) {
    if (LEVERS[k]) { modified = LEVERS[k].apply(modified); applied.push(LEVERS[k].label); }
  }

  const after = scoreCollege(modified, college);

  // Early-round is not captured by Scorecard scoring, so annotate separately.
  let earlyNote = null;
  if (modified.earlyRound) {
    const sel = getSelection(college.id);
    earlyNote = sel.available
      ? "Applying in a binding/early round can modestly improve admit odds at many colleges, but the size of the effect varies and is not published as a number. Treat as a small positive, not a guarantee."
      : "Applying early can help at some colleges; confirm this school's early-round policy and any advantage on its official site.";
  }

  const selAfter = getSelection(college.id);
  const cfBefore = selAfter.available ? cultureFit(profile, selAfter) : null;
  const cfAfter = selAfter.available ? cultureFit(modified, selAfter) : null;

  return {
    college: { id: college.id, name: college.name },
    applied,
    before: {
      category: base.admission.category, label: base.admission.label,
      range: base.admission.range, academic: base.subs.academic,
      overall: base.overall, cultureFit: cfBefore?.score ?? null,
    },
    after: {
      category: after.admission.category, label: after.admission.label,
      range: after.admission.range, academic: after.subs.academic,
      overall: after.overall, cultureFit: cfAfter?.score ?? null,
    },
    shifted: base.admission.category !== after.admission.category,
    earlyNote,
    disclaimer: "Estimates only. Admissions are holistic and unpredictable; these scenarios show directional impact on our fit model, not real admission decisions.",
  };
}

export function leverList() {
  return Object.entries(LEVERS).map(([key, v]) => ({ key, label: v.label }));
}
