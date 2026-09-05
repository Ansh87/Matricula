import { coarseCategory } from "./scoring.js";
// balancedList.js - builds a practical, balanced application list from scored
// matches (spec §6). Unlike "top N by score", this fills category quotas so the
// student ends up with a realistic mix of reach/target/safety plus financial
// safeties and an in-state public option.

// Target composition per list size.
const TARGETS = {
  10: { Reach: 3, Target: 4, Safety: 2, financialSafety: 1 },
  20: { Reach: 5, Target: 8, Safety: 5, financialSafety: 2 },
  30: { Reach: 8, Target: 12, Safety: 7, financialSafety: 3 },
};

// A "financial safety" = a likely admit whose estimated net cost fits the
// budget. We only claim this when we actually have cost data.
function isFinancialSafety(r, profile) {
  if (!profile.budget || r.netCost == null) return false;
  const cc = r.coarseCategory || coarseCategory(r.admission?.category);
  const likely = cc === "Safety" || cc === "Target";
  return likely && r.netCost <= profile.budget;
}

function isInStatePublic(r, profile) {
  return r.inState && r.college?.controlType === "Public";
}

export function buildBalancedList(scored, profile, size = 10) {
  const quota = TARGETS[size] || TARGETS[10];
  // Best-first within each category.
  const byScore = [...scored].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  const cc = (r) => r.coarseCategory || coarseCategory(r.admission?.category);
  const pools = {
    Reach: byScore.filter((r) => cc(r) === "Reach"),
    Target: byScore.filter((r) => cc(r) === "Target"),
    Safety: byScore.filter((r) => cc(r) === "Safety"),
  };

  const picked = [];
  const pickedIds = new Set();
  const take = (list, n, tag) => {
    let added = 0;
    for (const r of list) {
      if (added >= n) break;
      if (pickedIds.has(r.college.id)) continue;
      pickedIds.add(r.college.id);
      picked.push({ ...r, listRole: tag });
      added++;
    }
    return added;
  };

  const got = {
    Reach: take(pools.Reach, quota.Reach, "Reach"),
    Target: take(pools.Target, quota.Target, "Target"),
    Safety: take(pools.Safety, quota.Safety, "Safety"),
  };

  // Financial safeties: prefer ones already picked; otherwise add more.
  let finCount = picked.filter((r) => isFinancialSafety(r, profile)).length;
  if (finCount < quota.financialSafety) {
    const candidates = byScore.filter((r) => isFinancialSafety(r, profile) && !pickedIds.has(r.college.id));
    finCount += take(candidates, quota.financialSafety - finCount, "Financial safety");
  }

  // Ensure at least one in-state public option if one exists in the matches.
  const hasInState = picked.some((r) => isInStatePublic(r, profile));
  let addedInState = false;
  if (!hasInState) {
    const cand = byScore.find((r) => isInStatePublic(r, profile) && !pickedIds.has(r.college.id));
    if (cand) { pickedIds.add(cand.college.id); picked.push({ ...cand, listRole: "In-state public" }); addedInState = true; }
  }

  // FALLBACK FILL: quotas are the first priority, but if a bucket is empty/short
  // (e.g. a scenario pool with zero Target-band schools) the list can fall well
  // below `size` while valid candidates remain in OTHER buckets. Rather than
  // return a short list - or, worse, relabel Reach/Safety as Target - fill the
  // remaining slots with the best remaining eligible candidates in existing rank
  // order, preserving each school's TRUE category. This changes neither quota
  // targets nor Reach/Target/Safety classification.
  //
  // We distinguish two situations:
  //  - routine top-up: the quota totals (Reach+Target+Safety) are naturally below
  //    `size`, so filling remaining slots is normal and NOT worth a warning.
  //  - genuine shortage: a bucket came in UNDER its quota (e.g. 0 Target), which
  //    is the case worth surfacing to the student.
  const bucketShortfall = (got.Reach < quota.Reach) || (got.Target < quota.Target) || (got.Safety < quota.Safety);
  let fallbackUsed = false;
  if (picked.length < size) {
    const remaining = byScore.filter((r) => !pickedIds.has(r.college.id));
    for (const r of remaining) {
      if (picked.length >= size) break;
      pickedIds.add(r.college.id);
      picked.push({ ...r, listRole: cc(r), fallbackFill: true });
    }
    // Only flag fallback when a real category shortage drove it (not routine top-up).
    fallbackUsed = bucketShortfall && picked.some((r) => r.fallbackFill);
  }

  // Honest warnings when the match pool can't fill a category.
  const warnings = [];
  if (got.Reach < quota.Reach) warnings.push(`Only ${got.Reach} reach schools available (target ${quota.Reach}). Consider adding more selective options.`);
  if (got.Target < quota.Target) warnings.push(`Only ${got.Target} target schools available (target ${quota.Target}). Broaden your major or location filters.`);
  if (got.Safety < quota.Safety) warnings.push(`Your current matches do not include enough Safety schools (${got.Safety} of ${quota.Safety}). Add broader state/regional options.`);
  if (finCount < quota.financialSafety) warnings.push(`Only ${finCount} financial safety school(s) found (target ${quota.financialSafety}). Add affordable in-state or regional publics.`);
  if (!hasInState && !addedInState) warnings.push("No in-state public option found in your matches. In-state publics are usually the most affordable, predictable choice.");
  if (fallbackUsed) warnings.push("Balanced List used fallback fill because one category had too few candidates. Remaining slots were filled with the best available matches in their true categories.");

  return {
    size,
    target: quota,
    actual: {
      Reach: picked.filter((r) => cc(r) === "Reach").length,
      Target: picked.filter((r) => cc(r) === "Target").length,
      Safety: picked.filter((r) => cc(r) === "Safety").length,
      financialSafety: picked.filter((r) => isFinancialSafety(r, profile)).length,
      inStatePublic: picked.filter((r) => isInStatePublic(r, profile)).length,
    },
    colleges: picked,
    warnings,
    fallbackUsed,
    note: "A balanced list fills reach/target/safety quotas rather than simply taking the highest scores. Categories are estimates from official admit rates and your profile - not guarantees.",
  };
}
