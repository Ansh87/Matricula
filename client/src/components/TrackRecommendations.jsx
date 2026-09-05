// TrackRecommendations.jsx - Advisor's dynamic career-track recommender.
//
// Lightweight, CLIENT-ONLY heuristics: it ranks the SAME scenario catalog that
// Matches and Career Planner use (GET /api/colleges/scenarios) against the saved
// Profile. No College Scorecard calls, no scoring-engine changes, no hardcoded
// track list, and no hardcoded "CS+AI is always best" - the ranking is entirely
// profile-driven, so it changes with the profile.
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { Spinner } from "./ui.jsx";

// --- helpers ---------------------------------------------------------------
const lc = (x) => String(x || "").toLowerCase();
const tokens = (x) => lc(x).split(/[^a-z0-9+]+/).filter((t) => t.length > 2);

// Keyword groups used to read intent from free-text / goals / interests.
const KW = {
  finance: ["finance", "fintech", "quant", "investing", "trading", "economics", "business analytics", "markets", "risk"],
  cyber: ["cyber", "security", "infosec", "ctf", "capture the flag", "threat", "malware", "cryptography"],
  physics: ["physics", "applied physics", "quantum", "engineering physics", "photonics"],
  ai: ["ai", "artificial intelligence", "machine learning", "ml", "data science", "deep learning", "neural"],
  aerospace: ["aerospace", "drone", "autonomy", "flight", "spacecraft", "avionics", "uav"],
  mechanical: ["mechanical", "robotics", "automation", "manufacturing", "autonomous vehicle", "mechatronic"],
  chemical: ["chemical", "materials", "energy", "battery", "process", "pharma", "biotech"],
  biomedical: ["biomedical", "health", "medical device", "bioinformatics", "imaging", "diagnostics", "biotech"],
  environmental: ["environmental", "climate", "water", "sustainability", "energy systems", "infrastructure"],
  eecs: ["electrical", "computer engineering", "embedded", "hardware", "chip", "semiconductor", "systems", "vlsi", "fpga"],
};

// Map each scenario id to the keyword group(s) that signal domain intent for it.
const SCENARIO_KW = {
  cs_ai_ds: ["ai"],
  cs_finance_quant: ["finance"],
  cs_math_or: ["ai"], // math/optimization overlaps analytics/AI signals
  eecs_ai_systems: ["eecs"],
  cs_cyber_security: ["cyber"],
  quantum_physics_eecs: ["physics"],
  aerospace_ai_autonomy: ["aerospace"],
  mech_robotics_ai: ["mechanical"],
  industrial_or_ai: ["finance"], // OR/optimization overlaps analytics
  chemical_ai_energy_materials: ["chemical"],
  biomedical_health_ai: ["biomedical"],
  materials_semiconductor_energy: ["chemical", "eecs"],
  environmental_energy_systems: ["environmental"],
};

// Which scenarios benefit from research strength / math-science strength.
const RESEARCH_HEAVY = new Set(["quantum_physics_eecs", "cs_ai_ds", "biomedical_health_ai", "materials_semiconductor_energy", "chemical_ai_energy_materials", "aerospace_ai_autonomy"]);
const ENGINEERING = new Set(["eecs_ai_systems", "aerospace_ai_autonomy", "mech_robotics_ai", "chemical_ai_energy_materials", "biomedical_health_ai", "materials_semiconductor_energy", "environmental_energy_systems", "industrial_or_ai"]);
const MATH_HEAVY = new Set(["cs_ai_ds", "cs_math_or", "cs_finance_quant", "quantum_physics_eecs", "industrial_or_ai", "eecs_ai_systems"]);

// Goal-based nudge sets (Fix 5). Small, explainable boosts from profile goals.
const GRAD_SCHOOL_BOOST = new Set(["quantum_physics_eecs", "biomedical_health_ai", "materials_semiconductor_energy", "chemical_ai_energy_materials", "cs_ai_ds"]);
const HIGH_INCOME_BOOST = new Set(["cs_finance_quant", "cs_ai_ds", "cs_cyber_security", "eecs_ai_systems", "industrial_or_ai"]);
const STABLE_BOOST = new Set(["cs_cyber_security", "eecs_ai_systems", "industrial_or_ai", "cs_ai_ds", "environmental_energy_systems", "biomedical_health_ai"]);
const HIGH_RISK_BOOST = new Set(["cs_ai_ds", "cs_finance_quant", "quantum_physics_eecs"]);

function fitLabel(score, max) {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.62) return "Strong Fit";
  if (pct >= 0.42) return "Good Fit";
  if (pct >= 0.24) return "Exploratory Fit";
  return "Lower Evidence";
}

// Score one scenario against the profile. Returns { score, evidence[] }.
function scoreTrack(sc, profile, mathScience, researchStrong) {
  let score = 0;
  const evidence = [];

  const primaryField = lc(sc.primaryField);
  const secondaryField = lc(sc.secondaryField);
  const supporting = (sc.supportingFields || []).map(lc);
  const majors = [profile.primaryMajor, profile.secondaryMajor].filter(Boolean).map(lc);
  const interests = (profile.interests || []).map(lc);
  const matchField = (val, field) => field.includes(val) || val.includes(field);

  // 1. Major overlap - weighted by WHERE it matches (primary field matters most).
  //    A student's primary major matching the track's PRIMARY field is the
  //    strongest possible signal, so domain-specific tracks rank for the right
  //    students rather than generic bonuses dominating.
  const primaryMajor = lc(profile.primaryMajor);
  const secondMajor = lc(profile.secondaryMajor);
  if (primaryMajor) {
    if (matchField(primaryMajor, primaryField)) { score += 6; evidence.push(`Your primary major (${primaryMajor}) is this track's primary field.`); }
    else if (matchField(primaryMajor, secondaryField)) { score += 4; evidence.push(`Your primary major (${primaryMajor}) is this track's secondary field.`); }
    else if (supporting.some((f) => matchField(primaryMajor, f))) { score += 2.5; evidence.push(`Your primary major (${primaryMajor}) is a supporting field here.`); }
  }
  if (secondMajor) {
    if (matchField(secondMajor, primaryField) || matchField(secondMajor, secondaryField)) { score += 2.5; evidence.push(`Your second major (${secondMajor}) aligns with this track.`); }
    else if (supporting.some((f) => matchField(secondMajor, f))) { score += 1.5; }
  }

  // Interest overlap (lighter than majors).
  const allFields = [primaryField, secondaryField, ...supporting];
  let interestHits = 0;
  for (const it of interests) { if (allFields.some((f) => matchField(it, f))) interestHits++; }
  if (interestHits) { score += Math.min(interestHits * 1.2, 3.6); evidence.push(`${interestHits} of your academic interests match this track's fields.`); }

  // 2. Preferred track boost.
  if (profile.preferredScenarioId && profile.preferredScenarioId === sc.id) {
    score += 3; evidence.push("You selected this as your preferred career track.");
  }

  // 3 & 4. Keyword overlap from goals + activities/research/projects text.
  const freeText = [profile.activitiesText, (profile.careerGoals || []).join(" ")].filter(Boolean).map(lc).join(" ");
  const groups = SCENARIO_KW[sc.id] || [];
  let kwHits = 0;
  for (const g of groups) { for (const kw of KW[g] || []) { if (freeText.includes(kw)) kwHits++; } }
  if (kwHits) { score += Math.min(kwHits * 1.2, 4); evidence.push("Your activities/goals mention keywords related to this track."); }

  // 5. Math/science strength - a smaller, tie-breaking nudge for quantitative
  //    tracks (not large enough to override direct major/interest evidence).
  if (mathScience && (MATH_HEAVY.has(sc.id) || ENGINEERING.has(sc.id))) {
    score += 1; evidence.push("Your math/science profile supports this quantitative track.");
  }

  // 6. Research strength for research-heavy tracks (small nudge).
  if (researchStrong && RESEARCH_HEAVY.has(sc.id)) {
    score += 1; evidence.push("Your research experience supports this research-oriented track.");
  }

  // 7. Goal-based nudges (small, explainable). These read existing optional
  //    profile fields; each adds a modest boost and an evidence line.
  const gradInterest = /^(yes|likely|planning|definitely|interested)/i.test(lc(profile.gradSchoolInterest));
  if (gradInterest && GRAD_SCHOOL_BOOST.has(sc.id)) {
    score += 1; evidence.push("Your graduate-school interest fits this research/advanced-study track.");
  }
  const highIncome = /^(high|maximize|maximum)/i.test(lc(profile.incomeGoal));
  if (highIncome && HIGH_INCOME_BOOST.has(sc.id)) {
    score += 1; evidence.push("Your earning-potential goal aligns with this track's career outlook.");
  }
  const risk = lc(profile.riskTolerance);
  if (/^(stable|low|conservative)/i.test(risk) && STABLE_BOOST.has(sc.id)) {
    score += 1; evidence.push("Your preference for career stability fits this track.");
  } else if (/^(high|entrepreneur|startup|aggressive)/i.test(risk) && HIGH_RISK_BOOST.has(sc.id)) {
    score += 1; evidence.push("Your higher risk tolerance fits this fast-moving, high-upside track.");
  }

  return { score, evidence };
}

function ScoreDot({ label }) {
  const color = label === "Strong Fit" ? "var(--safety)"
    : label === "Good Fit" ? "var(--amber)"
    : label === "Exploratory Fit" ? "var(--amber)" : "var(--muted)";
  return <span className="pill" style={{ background: "var(--paper-2)", color, fontWeight: 600 }}>{label}</span>;
}

export function TrackRecommendations({ profile, onRunMatches, onViewCoursePlan }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.scenarios()
      .then((r) => { if (!cancelled) setScenarios(r.scenarios || []); })
      .catch(() => { if (!cancelled) setScenarios([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ranked = useMemo(() => {
    if (!scenarios.length) return [];
    // Derive strength signals once.
    const sat = Number(profile.sat) || (Number(profile.act) ? Number(profile.act) * 45 : 0);
    const gpa = Number(profile.gpaWeighted) || Number(profile.gpa) || 0;
    const mathScience = sat >= 1400 || gpa >= 4.0 || (Number(profile.apCount) || 0) >= 6 || profile.rigorHigh === true;
    const researchStrong = profile.hasResearch === true || /research|publi|patent|lab/i.test(lc(profile.activitiesText));

    const scored = scenarios.map((sc) => {
      const { score, evidence } = scoreTrack(sc, profile, mathScience, researchStrong);
      return { sc, score, evidence };
    });
    const max = Math.max(...scored.map((x) => x.score), 1);
    return scored
      .map((x) => ({ ...x, label: fitLabel(x.score, max) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [scenarios, profile]);

  if (loading) return <div className="card pad"><Spinner label="Analyzing your profile…" /></div>;
  if (!ranked.length) return null;

  // If everything is Lower Evidence, tell the user their profile is thin.
  const anyEvidence = ranked.some((r) => r.evidence.length);

  return (
    <div className="card pad stack" style={{ gap: 12 }}>
      <div>
        <div className="eyebrow">Advisor</div>
        <h2 style={{ margin: "2px 0" }}>Recommended Career Tracks</h2>
        <p className="note" style={{ fontSize: 12.5 }}>
          Your strongest {ranked.length} tracks based on your Profile majors, interests, goals, activities, and
          academic strength. These use the same tracks as Matches and Career Planner.
        </p>
      </div>

      {!anyEvidence && (
        <div className="note" style={{ fontSize: 12, color: "var(--muted)" }}>
          Add a primary major, interests, and some activities/goals to your Profile for more tailored recommendations.
        </div>
      )}

      {ranked.map(({ sc, label, evidence }, i) => (
        <div key={sc.id} className="card pad" style={{ background: "var(--paper-2)" }}>
          <div className="row spread wrap" style={{ gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>{i + 1}. {sc.scenarioName}</strong>
            <ScoreDot label={label} />
          </div>

          {sc.riskHedge && <p className="note" style={{ fontSize: 12.5, marginTop: 6 }}><strong>Why it fits:</strong> {sc.careerIntent || sc.description}</p>}

          {evidence.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div className="k" style={{ fontSize: 11 }}>Evidence from your profile</div>
              <ul className="note" style={{ fontSize: 12, margin: "2px 0 0", paddingLeft: 18 }}>
                {evidence.slice(0, 3).map((e, j) => <li key={j}>{e}</li>)}
              </ul>
            </div>
          )}

          {(sc.risks || []).length > 0 && (
            <p className="note" style={{ fontSize: 12, marginTop: 6, color: "var(--reach)" }}>
              <strong>Caution:</strong> {sc.risks[0]}
            </p>
          )}

          {(sc.skillsToBuild || sc.projectIdeas) && (
            <p className="note" style={{ fontSize: 12, marginTop: 6 }}>
              <strong>Suggested next steps:</strong> {[...(sc.projectIdeas || []).slice(0, 1), ...(sc.skillsToBuild || []).slice(0, 2)].join("; ")}.
            </p>
          )}

          <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
            {onRunMatches ? (
              <button className="btn sm ghost" onClick={() => onRunMatches(sc.id)}>Run Matches for this track →</button>
            ) : (
              <span className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                Select "{sc.scenarioName}" in Matches to rank colleges for this track.
              </span>
            )}
            {onViewCoursePlan && (
              <button className="btn sm ghost" onClick={() => onViewCoursePlan(sc.id)}>See course &amp; prep plan →</button>
            )}
          </div>
        </div>
      ))}

      <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
        These are heuristic suggestions from your Profile, not admissions advice. Explore each in Career Planner and
        confirm with a counselor.
      </div>
    </div>
  );
}
