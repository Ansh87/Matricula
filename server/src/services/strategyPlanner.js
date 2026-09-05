// strategyPlanner.js - analyzes the student's saved list against an ideal
// balance and produces concrete strategy guidance (spec §18). Uses only the
// saved list + profile; no invented data.

const IDEAL = { reach: [3, 5], target: [4, 6], safety: [2, 4] };

export function buildStrategy(saved, profile) {
  const counts = { Reach: 0, Target: 0, Safety: 0, Unknown: 0 };
  saved.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + 1; });
  const total = saved.length;

  const issues = [];
  if (counts.Reach > IDEAL.reach[1] + 2) issues.push(`Your list is reach-heavy (${counts.Reach} reaches). Add stronger targets and safeties you'd be happy to attend.`);
  if (counts.Target < IDEAL.target[0]) issues.push(`Only ${counts.Target} target schools - aim for ${IDEAL.target[0]}–${IDEAL.target[1]}. Targets are the core of a strong list.`);
  if (counts.Safety < IDEAL.safety[0]) issues.push(`Only ${counts.Safety} safety schools - add ${IDEAL.safety[0] - counts.Safety} more you're confident about and can afford.`);
  if (total < 6) issues.push("A typical balanced list has ~8–12 colleges; you have fewer than that so far.");
  if (total > 15) issues.push("You have a lot of applications - each one takes real effort. Consider trimming the weakest fits.");

  // Financial-safety check: an affordable, likely-admit school within budget.
  const budget = profile.budget;
  const finSafety = saved.filter((s) => s.category === "Safety" && s.state === profile.state);
  if (budget && !finSafety.length) issues.push("Consider adding an in-state public option as a financial safety - reliably affordable and likely to admit.");

  // Best ED pick: the highest-fit reach or target, if the student is ED-willing.
  let edPick = null;
  if (profile.willingED) {
    const edCandidates = saved.filter((s) => ["Reach", "Target"].includes(s.category))
      .sort((a, b) => (b.overall_fit_score ?? 0) - (a.overall_fit_score ?? 0));
    if (edCandidates.length) edPick = edCandidates[0];
  }

  const balanced = !issues.length && total >= 6;

  const summary = balanced
    ? `Your list of ${total} looks well balanced (${counts.Reach} reach, ${counts.Target} target, ${counts.Safety} safety).`
    : `Your list has ${total} colleges: ${counts.Reach} reach, ${counts.Target} target, ${counts.Safety} safety. A few adjustments would strengthen it.`;

  return {
    counts, total, ideal: IDEAL, issues, balanced, summary,
    edPick: edPick ? {
      name: edPick.college_name || edPick.college_id, collegeId: edPick.college_id, category: edPick.category,
      why: "Highest-fit reach/target on your list and you're open to ED - the strongest early-commitment play if the finances work.",
    } : null,
    recommendedApplications: Math.min(Math.max(total, 8), 12),
    testPlan: profile.testStrategy === "withhold"
      ? "You plan to apply test-optional. Double-check each school's policy - a strong score above their midpoint is usually worth submitting."
      : "Submit scores where they're at or above a college's middle-50%; consider test-optional where you're below it. Each college page shows a per-school recommendation.",
    disclaimer: "Strategy guidance from your saved list and official data. Confirm rounds, deadlines, and aid with each college and your counselor.",
  };
}
