// scenarios.js - Major / career-track SCENARIOS for a single student.
//
// The student is not "Computer Science only," nor a flat bag of equal interests.
// Instead we model a small set of realistic major/career TRACKS, each with a
// primary field (weighted most), a secondary field, supporting fields, and a
// career intent. A college's scenario fit is a WEIGHTED blend so that matching
// one minor supporting field never yields a perfect major score.
//
// This module is additive and self-contained: it does not modify majorFit,
// academicFit, classify, or any existing scoring. It reuses the same official
// College Scorecard CIP program data that majorFit already consumes.

import { MAJOR_CIP_MAP } from "./scorecard.js";

// --- Weights per spec: primary 50, secondary 25, supporting 15, career 10.
export const SCENARIO_WEIGHTS = { primary: 0.50, secondary: 0.25, supporting: 0.15, career: 0.10 };

// --- CIP codes (undotted 4-digit, matching MAJOR_CIP_MAP) for fields the
// scenarios reference that aren't already keyed in MAJOR_CIP_MAP. We keep these
// local so we don't mutate the shared map.
const EXTRA_CIP = {
  "operations research": ["2705", "1435", "5213", "2703"], // OR / mgmt science
  "applied physics": ["4008", "1412"],                     // physics / engineering physics
  "engineering physics": ["1412", "4008"],
  "quantitative finance": ["5208", "2701", "2705"],        // finance + math + stats
  "financial engineering": ["1436", "5208", "2701"],
  "quantum": ["4008", "1412", "1410", "1409", "1107"],     // physics/EE/CompE/CS blend
  "robotics": ["1443", "1409", "1410", "1419"],            // robotics / CompE / EE / mech
  "systems engineering": ["1427", "1409", "1410"],
  // New engineering fields (NCES CIP 2020 4-digit).
  "industrial engineering": ["1435", "1427", "1436"],      // industrial / systems / mfg
  "materials science": ["1411", "4010"],                   // materials eng / materials sci (NOT EE 1410)
  "materials engineering": ["1411", "4010"],               // true materials pathways only
  "semiconductor": ["1411", "1410", "1409"],               // materials-first, then EE/CompE as context
  "environmental engineering": ["1414", "1401"],
  "energy systems": ["1425", "1410", "1407", "0303"],      // engineering + EE + chem + natural resources
  "aerospace engineering": ["1402"],
  "mechanical engineering": ["1419"],
  "chemical engineering": ["1407"],
  "biomedical engineering": ["1405"],
  "bioinformatics": ["2611", "3070", "1105"],              // bioinformatics / data science
  "health informatics": ["5107", "3070"],
};

// NARROW, DISAMBIGUATING CIP sets. The shared MAJOR_CIP_MAP deliberately pads
// several entries with general CS codes (1101/1107) so broad interest searches
// are forgiving. But for SCENARIO secondary/supporting fields we need
// specificity: a pure-CS college must NOT register as a "Cybersecurity" or
// "Finance" match just because it offers general CS. When a field appears here,
// we match ONLY these codes, so distinguishing fields stay distinguishing.
const NARROW_CIP = {
  "cybersecurity": ["1110", "4303"],       // dedicated cyber, not general CS
  "finance": ["5208"],
  "economics": ["4506"],
  "electrical engineering": ["1410"],
  "computer engineering": ["1409"],
  "mathematics": ["2701"],
  "statistics": ["2705", "2706"],
  "physics": ["4008"],
  "artificial intelligence": ["1102", "3017"], // AI/ML-specific, not plain CS
  // New engineering fields - narrow so they distinguish (not general CS/eng).
  "aerospace engineering": ["1402"],
  "mechanical engineering": ["1419"],
  "chemical engineering": ["1407"],
  "biomedical engineering": ["1405"],
  "industrial engineering": ["1435"],
  "materials science": ["1411", "4010"],
  "materials engineering": ["1411"],
  "environmental engineering": ["1414"],
  "energy systems": ["1425"],
  "robotics": ["1443"],
};

// Resolve a field name -> CIP list. When `narrow` is true and the field has a
// disambiguating NARROW_CIP entry, use ONLY those specific codes (prevents a
// general-CS college from matching Cybersecurity/Finance/etc.). Otherwise use
// the forgiving shared map + extras + loose substring match (as majorFit does).
export function cipsForField(field, narrow = false) {
  const key = (field || "").toLowerCase().trim();
  if (!key) return [];
  if (narrow && NARROW_CIP[key]) return NARROW_CIP[key];
  if (MAJOR_CIP_MAP[key]) return MAJOR_CIP_MAP[key];
  if (EXTRA_CIP[key]) return EXTRA_CIP[key];
  for (const k of Object.keys(MAJOR_CIP_MAP)) {
    if (key.includes(k) || k.includes(key)) return MAJOR_CIP_MAP[k];
  }
  for (const k of Object.keys(EXTRA_CIP)) {
    if (key.includes(k) || k.includes(key)) return EXTRA_CIP[k];
  }
  return [];
}

// --- The career-track scenarios. `id` is the stable key used by the API/UI.
// Each carries structured metadata so the Career Planner is driven entirely from
// this single catalog (no drift). Weights/scoring are unchanged; the extra
// metadata fields are display-only. sourceNotes use BLS OOH 2024–34 figures,
// each labeled with its source, occupation, and a "projection not a guarantee"
// caveat. No invented numbers.
export const SCENARIOS = [
  {
    id: "cs_ai_ds",
    scenarioName: "CS + AI / Data Science",
    primaryField: "Computer Science",
    secondaryField: "Artificial Intelligence",
    supportingFields: ["Data Science", "Statistics", "Mathematics"],
    careerIntent: "AI / ML engineer, data scientist, applied AI builder, research-oriented CS",
    riskHedge: "Broad, high-demand core CS with AI depth",
    description: "Best for AI engineer, ML engineer, data scientist, applied AI builder, and research-oriented CS.",
    futureRoles: ["AI/ML engineer", "Data scientist", "Applied AI builder", "Research-oriented CS", "MLOps engineer"],
    recommendedMajors: ["Computer Science", "Data Science"],
    doubleMajorIdeas: ["CS + Statistics", "CS + Mathematics", "Data Science + Economics"],
    skillsToBuild: ["Python & ML frameworks", "Linear algebra, probability & statistics", "Data pipelines", "A research or applied ML project"],
    projectIdeas: ["End-to-end ML model (collect, clean, train, present)", "Data pipeline or dashboard on a public dataset"],
    risks: ["Fast-moving tooling - fundamentals outlast frameworks", "Entry-level bar rising as routine coding automates"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Data Scientists", growth: "34%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "cs_finance_quant",
    scenarioName: "CS + Finance / FinTech / Quant",
    primaryField: "Computer Science",
    secondaryField: "Finance",
    supportingFields: ["Data Science", "Mathematics", "Statistics", "Economics"],
    careerIntent: "Quant developer, fintech engineer, financial data scientist, algorithmic trading, risk analytics, AI finance",
    riskHedge: "Domain-specialized CS with financial-sector optionality",
    description: "Best for quant developer, fintech engineer, financial data scientist, algorithmic trading, risk analytics, and AI finance.",
    futureRoles: ["Quant developer", "FinTech engineer", "Financial data scientist", "Algorithmic trading", "Risk analytics"],
    recommendedMajors: ["Computer Science", "Finance", "Mathematics"],
    doubleMajorIdeas: ["CS + Finance", "CS + Economics", "CS + Mathematics (finance electives)"],
    skillsToBuild: ["Probability & stochastic processes", "C++/Python", "Econometrics", "A fintech or markets internship"],
    projectIdeas: ["Portfolio-risk model or trading-rule backtest on public data", "Payment/fraud-analytics demo"],
    risks: ["Quant/trading is competitive; top seats often expect a master's", "Finance hiring is cyclical"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Data Scientists", growth: "34%", note: "Projection is for the occupation, not a guarantee for every student." },
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Operations Research Analysts", growth: "21%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "cs_math_or",
    scenarioName: "CS + Math / Statistics / Operations Research",
    primaryField: "Computer Science",
    secondaryField: "Mathematics",
    supportingFields: ["Statistics", "Operations Research", "Data Science"],
    careerIntent: "Optimization, AI research, data science, quant, logistics, modeling, analytics",
    riskHedge: "Rigorous quantitative foundation applicable across sectors",
    description: "Best for optimization, AI research, data science, quant, logistics, modeling, and analytics.",
    futureRoles: ["Operations research analyst", "Data scientist", "Quant", "Optimization engineer", "Decision scientist"],
    recommendedMajors: ["Computer Science", "Mathematics", "Statistics"],
    doubleMajorIdeas: ["CS + Mathematics", "CS + Statistics", "Math + Operations Research"],
    skillsToBuild: ["Linear algebra & optimization", "Statistics", "Algorithms", "A modeling/optimization project"],
    projectIdeas: ["Scheduling or routing optimizer with visualization", "Forecasting model on public data"],
    risks: ["Deepest research roles favor graduate study", "Pure-math paths need a clear applied direction"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Operations Research Analysts", growth: "21%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "eecs_ai_systems",
    scenarioName: "Electrical Engineering / Computer Engineering + AI Systems",
    primaryField: "Computer Engineering",
    secondaryField: "Electrical Engineering",
    supportingFields: ["Computer Science", "Systems Engineering", "Robotics"],
    careerIntent: "AI infrastructure, chips, robotics, embedded AI, autonomous systems, hardware/software systems",
    riskHedge: "Hardware+software breadth for systems and infrastructure roles",
    description: "Best for AI infrastructure, chips, robotics, embedded AI, autonomous systems, hardware/software systems, and systems engineering.",
    futureRoles: ["AI systems engineer", "Embedded AI engineer", "Semiconductor/chip systems engineer", "Robotics systems engineer", "Power/energy systems engineer", "Hardware/software systems engineer"],
    recommendedMajors: ["Computer Engineering", "Electrical Engineering"],
    doubleMajorIdeas: ["Computer Engineering + CS", "EE + CS", "EE + Physics"],
    skillsToBuild: ["Computer architecture & digital systems", "Signals & embedded systems", "C/C++ and hardware/software co-design", "A hardware+software capstone"],
    projectIdeas: ["Embedded controller (line-following / obstacle avoidance)", "FPGA or microcontroller AI-inference demo"],
    risks: ["Hardware timelines are longer", "Some roles concentrate in specific regions/industries"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Electrical & Electronics Engineers", growth: "7%", note: "Projection is for the occupation, not a guarantee for every student." },
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Software Developers", growth: "15%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "cs_cyber_security",
    scenarioName: "CS + Cybersecurity / AI Security",
    primaryField: "Computer Science",
    secondaryField: "Cybersecurity",
    supportingFields: ["Information Technology", "Data Science"],
    careerIntent: "Cybersecurity analyst, application security, AI security, threat detection, secure systems, defense tech, risk management",
    riskHedge: "Security specialization on a general CS base",
    description: "Best for cybersecurity analyst, application security, AI security, threat detection, secure systems, defense tech, and risk management.",
    futureRoles: ["Cybersecurity analyst", "Application/AI security engineer", "Threat detection", "Secure systems engineer", "Defense tech"],
    recommendedMajors: ["Computer Science", "Cybersecurity"],
    doubleMajorIdeas: ["CS + Cybersecurity", "CS with a security concentration"],
    skillsToBuild: ["Networks & operating systems", "Cryptography & secure coding", "Capture-the-flag (CTF) practice", "A security internship or CTF team"],
    projectIdeas: ["Log-monitoring / intrusion-detection demo", "Secure-coding audit of a small app"],
    risks: ["On-call demands & burnout in some roles", "Entry-level often expects internships or certifications"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Information Security Analysts", growth: "29%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "quantum_physics_eecs",
    scenarioName: "Quantum / Applied Physics / EECS Research Track",
    primaryField: "Physics",
    secondaryField: "Electrical Engineering",
    supportingFields: ["Applied Physics", "Engineering Physics", "Computer Engineering", "Computer Science"],
    careerIntent: "Quantum computing, quantum information, applied physics, engineering physics, advanced EECS research, graduate-school pathways",
    riskHedge: "Deep science/EECS foundation feeding research and graduate study",
    description: "Best for quantum computing, quantum information, applied physics, engineering physics, advanced EECS research, and graduate-school-oriented pathways.",
    futureRoles: ["Quantum computing/information researcher", "Applied physicist", "Engineering physicist", "Advanced EECS researcher"],
    recommendedMajors: ["Physics", "Applied Physics", "Engineering Physics"],
    doubleMajorIdeas: ["Physics + CS", "Physics + EE", "Engineering Physics + CS"],
    skillsToBuild: ["Quantum mechanics & linear algebra", "EE/CS electives", "Undergraduate research in a quantum/physics lab"],
    projectIdeas: ["Qubit/gate simulator", "Clear explainer of a quantum algorithm"],
    risks: ["Most quantum roles expect graduate school (often a PhD)", "Rarely a dedicated undergraduate 'Quantum Engineering' major - verify the pathway"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Computer & Information Research Scientists", growth: "20%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
    // Quantum has no standard undergraduate "Quantum Engineering" CIP; we treat
    // it as a research/pathway fit across physics + EECS + CS instead.
    isQuantum: true,
  },

  // ---------- New engineering tracks ----------
  {
    id: "aerospace_ai_autonomy",
    scenarioName: "Aerospace Engineering + AI / Autonomy",
    primaryField: "Aerospace Engineering",
    secondaryField: "Artificial Intelligence",
    supportingFields: ["Mechanical Engineering", "Computer Science", "Electrical Engineering", "Physics", "Robotics"],
    careerIntent: "Aerospace autonomy, drones, spacecraft systems, defense tech, simulation",
    riskHedge: "Engineering domain + AI systems",
    description: "Best for aerospace systems, autonomy, drones, flight simulation, spacecraft systems, and defense technology.",
    futureRoles: ["Aerospace systems engineer", "Autonomy engineer", "Drone systems engineer", "Flight simulation engineer", "Spacecraft systems engineer", "Defense technology engineer"],
    recommendedMajors: ["Aerospace Engineering", "Mechanical Engineering"],
    doubleMajorIdeas: ["Aerospace + CS", "Aerospace + EE", "Aerospace + Physics"],
    skillsToBuild: ["Controls & dynamics", "Simulation (CFD/flight sim)", "Programming for autonomy", "AI/ML fundamentals"],
    projectIdeas: ["Drone flight-control or path-planning simulation", "Rocket/spacecraft trajectory simulator"],
    risks: ["Safety-critical, regulation-heavy; long development cycles", "Defense/aerospace hiring can be clearance- or region-dependent"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Aerospace Engineers", growth: "6%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "mech_robotics_ai",
    scenarioName: "Mechanical Engineering / Robotics + AI Systems",
    primaryField: "Mechanical Engineering",
    secondaryField: "Robotics",
    supportingFields: ["Computer Science", "Electrical Engineering", "Artificial Intelligence", "Computer Engineering"],
    careerIntent: "Robotics, automation, autonomous vehicles, manufacturing automation, mechanical + AI systems",
    riskHedge: "Physical-systems engineering that resists automation",
    description: "Best for robotics, automation, autonomous vehicle systems, mechanical design + AI, and manufacturing automation.",
    futureRoles: ["Robotics engineer", "Automation engineer", "Mechanical design + AI systems engineer", "Autonomous vehicle systems engineer", "Manufacturing automation engineer"],
    recommendedMajors: ["Mechanical Engineering", "Robotics"],
    doubleMajorIdeas: ["Mechanical + CS", "Mechanical + EE", "Robotics + CS"],
    skillsToBuild: ["Dynamics & controls", "CAD & mechatronics", "Programming (Python/C++) & ROS", "AI/ML fundamentals"],
    projectIdeas: ["Simulated robot arm or mobile robot", "Automation cell / pick-and-place demo"],
    risks: ["Physical prototyping is slower and costlier than software", "Autonomous-vehicle timelines are uncertain"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Mechanical Engineers", growth: "9%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "industrial_or_ai",
    scenarioName: "Industrial Engineering / Operations Research + AI Optimization",
    primaryField: "Industrial Engineering",
    secondaryField: "Operations Research",
    supportingFields: ["Mathematics", "Statistics", "Data Science", "Computer Science"],
    careerIntent: "Operations research, supply-chain optimization, logistics/data science, decision science, quant/optimization",
    riskHedge: "Math + optimization + AI applied to operations",
    description: "Best for operations research, supply-chain optimization, logistics/data science, decision science, and quant/optimization.",
    futureRoles: ["Operations research analyst", "Supply chain optimization analyst", "Logistics/data scientist", "Decision scientist", "Quant/optimization engineer"],
    recommendedMajors: ["Industrial Engineering", "Operations Research"],
    doubleMajorIdeas: ["Industrial Eng + CS", "IE + Statistics", "OR + Data Science"],
    skillsToBuild: ["Optimization & linear programming", "Statistics & simulation", "Python & solver libraries", "A logistics/optimization project"],
    projectIdeas: ["Supply-chain or scheduling optimizer", "Queue/throughput simulation"],
    risks: ["Impact depends on organizational adoption", "Some roles favor a master's for the deepest modeling"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Operations Research Analysts", growth: "21%", note: "Projection is for the occupation, not a guarantee for every student." },
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Industrial Engineers", growth: "11%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "chemical_ai_energy_materials",
    scenarioName: "Chemical Engineering + AI / Energy / Materials",
    primaryField: "Chemical Engineering",
    secondaryField: "Materials Science",
    supportingFields: ["Energy Systems", "Data Science", "Physics", "Artificial Intelligence"],
    careerIntent: "Process engineering, energy systems, battery/materials, pharma/biotech process, manufacturing optimization",
    riskHedge: "Chemical/materials engineering across energy, biotech, and climate tech",
    description: "Best for process engineering, energy systems, battery/materials, pharma/biotech process, and manufacturing optimization.",
    futureRoles: ["Process engineer", "Energy systems engineer", "Battery/materials engineer", "Pharma/biotech process engineer", "Manufacturing optimization engineer"],
    recommendedMajors: ["Chemical Engineering", "Materials Science / Engineering"],
    doubleMajorIdeas: ["ChemE + Materials", "ChemE + Data Science", "ChemE + Environmental Eng"],
    skillsToBuild: ["Thermodynamics & transport", "Process simulation", "Data analysis for process optimization", "Materials characterization basics"],
    projectIdeas: ["Battery or fuel-cell performance model", "Process-optimization analysis on public data"],
    risks: ["Capital-intensive industries; slower iteration", "Some roles concentrate around specific plants/regions"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Chemical Engineers", growth: "3%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "biomedical_health_ai",
    scenarioName: "Biomedical Engineering + Health AI",
    primaryField: "Biomedical Engineering",
    secondaryField: "Data Science",
    supportingFields: ["Computer Science", "Artificial Intelligence", "Statistics", "Bioinformatics"],
    careerIntent: "Medical devices, health AI, bioinformatics, imaging/diagnostics, biotech data science",
    riskHedge: "Healthcare demand + devices + data + AI",
    description: "Best for medical device engineering, health AI, bioinformatics, imaging/diagnostics, and biotech data science.",
    futureRoles: ["Medical device engineer", "Health AI analyst", "Bioinformatics engineer", "Imaging/diagnostics engineer", "Biotech data scientist"],
    recommendedMajors: ["Biomedical Engineering", "Data Science"],
    doubleMajorIdeas: ["Biomedical Eng + CS", "BME + Data Science", "BME + Statistics"],
    skillsToBuild: ["Physiology & device fundamentals", "Signal/image processing", "Python & ML for health data", "A bioinformatics or device project"],
    projectIdeas: ["Medical-image classifier on a public dataset", "Wearable-sensor signal-analysis demo"],
    risks: ["Regulated (FDA) and clinical-validation heavy", "Some roles expect graduate study"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Bioengineers & Biomedical Engineers", growth: "5%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "materials_semiconductor_energy",
    scenarioName: "Materials / Semiconductor / Energy Systems",
    primaryField: "Materials Science",
    secondaryField: "Electrical Engineering",
    supportingFields: ["Physics", "Chemical Engineering", "Energy Systems", "Computer Science"],
    careerIntent: "Semiconductor materials, battery materials, nanotechnology, energy storage, advanced manufacturing",
    riskHedge: "Foundational hardware, chips, batteries, and energy transition",
    description: "Best for semiconductor materials, battery materials, nanotechnology, energy storage, and advanced manufacturing.",
    futureRoles: ["Semiconductor materials engineer", "Battery materials engineer", "Nanotechnology researcher", "Energy storage engineer", "Advanced manufacturing engineer"],
    recommendedMajors: ["Materials Science / Engineering", "Electrical Engineering"],
    doubleMajorIdeas: ["Materials + EE", "Materials + Physics", "Materials + ChemE"],
    skillsToBuild: ["Solid-state & materials fundamentals", "Characterization techniques", "Fabrication/cleanroom basics", "Data analysis for materials"],
    projectIdeas: ["Battery-materials property study", "Semiconductor device or process explainer"],
    risks: ["Capital-intensive; often research/graduate-oriented", "Fab roles concentrate in specific regions"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Materials Engineers", growth: "6%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
  {
    id: "environmental_energy_systems",
    scenarioName: "Environmental / Energy Systems Engineering",
    primaryField: "Environmental Engineering",
    secondaryField: "Energy Systems",
    supportingFields: ["Chemical Engineering", "Data Science", "Physics", "Computer Science"],
    careerIntent: "Energy systems, environmental engineering, water systems, climate tech, sustainability infrastructure",
    riskHedge: "Long-term physical-world climate, water, and energy problems",
    description: "Best for energy systems, environmental engineering, water systems, climate technology, and sustainability infrastructure.",
    futureRoles: ["Energy systems analyst", "Environmental engineer", "Water systems engineer", "Climate technology analyst", "Sustainability infrastructure engineer"],
    recommendedMajors: ["Environmental Engineering", "Energy Systems / Engineering"],
    doubleMajorIdeas: ["Environmental Eng + Data Science", "Environmental Eng + ChemE", "Energy Systems + EE"],
    skillsToBuild: ["Environmental systems & thermodynamics", "GIS & data analysis", "Modeling for energy/water systems", "A sustainability project"],
    projectIdeas: ["Renewable-energy output model", "Water-quality or emissions dashboard"],
    risks: ["Policy- and funding-dependent in places", "Impact often at slower infrastructure timelines"],
    sourceNotes: [
      { source: "BLS Occupational Outlook Handbook", projectionPeriod: "2024–2034", occupation: "Environmental Engineers", growth: "7%", note: "Projection is for the occupation, not a guarantee for every student." },
    ],
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}

export const DEFAULT_SCENARIO_ID = "cs_ai_ds";

// --- Verification CIP plan for a scenario. Returns the exact CIP lists to run
// lightweight verifyProgramAvailability() against for each field. Primary uses
// the forgiving match (broad); secondary and supporting use NARROW codes so a
// general-CS college doesn't verify as Finance/Cyber/EE/Physics. The route uses
// this to build the scenario verification object without fetching program arrays.
export function scenarioVerificationPlan(scenario) {
  return {
    primary: { field: scenario.primaryField, cips: cipsForField(scenario.primaryField, false) },
    secondary: { field: scenario.secondaryField, cips: cipsForField(scenario.secondaryField, true) },
    supporting: (scenario.supportingFields || []).map((f) => ({ field: f, cips: cipsForField(f, true) })),
  };
}

// --- Does the college's official CIP program set contain ANY of these CIPs?
// Returns "verified" | "no-match" | "unavailable" (mirrors majorFit semantics:
// we only claim a match or non-match when official program data is present).
function fieldStatus(c, field, narrow = false) {
  const cips = cipsForField(field, narrow);
  if (!cips.length) return { status: "unavailable", matched: false };
  const hasData = c.hasProgramData && Array.isArray(c.bachelorCips) && c.bachelorCips.length;
  if (!hasData) return { status: "unavailable", matched: false };
  const set = new Set(c.bachelorCips);
  const matched = cips.some((cip) => set.has(cip));
  return { status: matched ? "verified" : "no-match", matched };
}

// Convert a field status to a 0..100 component score. Verified = full; no-match
// (official data present, no program) = low; unavailable (no data) = neutral-low
// 45, consistent with the major-verification scoring fix so unknown data is
// never rewarded as a confirmed match.
function fieldScore(status) {
  if (status === "verified") return 100;
  if (status === "no-match") return 15;
  return 45; // unavailable / unknown
}

// --- Career/outcome alignment: a light signal from official earnings. Scenarios
// with a quant/finance/systems intent lean on stronger median earnings; we keep
// this deliberately small (10% weight) and never invent data.
function careerAlignment(c) {
  if (c.medianEarnings == null) return 45; // unknown -> neutral-low, not rewarded
  // 60k -> ~55, 90k -> ~78, 120k+ -> ~95
  const s = 40 + ((c.medianEarnings - 40000) / 80000) * 55;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const label3 = (n) => (n >= 75 ? "Strong" : n >= 55 ? "Moderate" : n >= 40 ? "Partial" : "Weak");
const statusWord = (s) => (s === "verified" ? "verified" : s === "no-match" ? "not offered" : "not verified");

// --- Shared scoring core. Given the resolved primary/secondary/supporting field
// statuses (each { status, matched }) and the college's career signal, produce
// the weighted score + breakdown + quantum note. Both the program-array path
// (scenarioFit) and the lightweight verified-ID path (scenarioFitVerified) call
// this, so the weighting and shape are identical regardless of the data source.
function scoreFromStatuses(scenario, primary, secondary, supStatuses, career) {
  const supScores = supStatuses.map((s) => fieldScore(s.status));
  const supAvg = supScores.length ? supScores.reduce((a, b) => a + b, 0) / supScores.length : 45;

  const pScore = fieldScore(primary.status);
  const sScore = fieldScore(secondary.status);

  const score = Math.round(
    pScore * SCENARIO_WEIGHTS.primary +
    sScore * SCENARIO_WEIGHTS.secondary +
    supAvg * SCENARIO_WEIGHTS.supporting +
    career * SCENARIO_WEIGHTS.career
  );

  const breakdown = {
    primary:   { field: scenario.primaryField,   status: primary.status,   statusWord: statusWord(primary.status),   score: pScore },
    secondary: { field: scenario.secondaryField, status: secondary.status, statusWord: statusWord(secondary.status), score: sScore },
    supporting: {
      fields: scenario.supportingFields || [],
      statuses: supStatuses.map((s, i) => ({ field: (scenario.supportingFields || [])[i], status: s.status, statusWord: statusWord(s.status) })),
      score: Math.round(supAvg),
      label: label3(supAvg),
    },
    career: { intent: scenario.careerIntent, score: career },
  };

  const out = { score, label: label3(score), breakdown };

  // --- Quantum special handling: if the college shows research/physics/EECS
  // fit but no confirmed dedicated quantum undergraduate major, flag the pathway
  // as needing verification rather than claiming a quantum major exists.
  if (scenario.isQuantum) {
    const anyPathway = primary.matched || secondary.matched || supStatuses.some((s) => s.matched);
    if (anyPathway) {
      out.quantumNote = "Quantum research fit - undergraduate major pathway must be verified.";
    }
  }

  return out;
}

// --- scenarioFit: scores a college that carries full official program arrays
// (college.bachelorCips), e.g. from a major-search record. Unchanged behavior.
// Returns { score, label, breakdown, quantumNote? } - additive.
export function scenarioFit(scenario, c) {
  // Primary field uses the forgiving match (the student's core major); secondary
  // and supporting use NARROW matching so distinguishing fields (finance, cyber,
  // EE, physics) don't register off general CS codes.
  const primary = fieldStatus(c, scenario.primaryField);
  const secondary = fieldStatus(c, scenario.secondaryField, true);
  const supStatuses = (scenario.supportingFields || []).map((f) => fieldStatus(c, f, true));
  const career = careerAlignment(c);
  return scoreFromStatuses(scenario, primary, secondary, supStatuses, career);
}

// --- scenarioFitVerified: scores a college using LIGHTWEIGHT verified-ID sets
// instead of program arrays. This is the path used by broad Matches, where
// scanAllColleges() intentionally omits nested program arrays. `verification`
// is the object built by buildScenarioVerification() in the colleges route:
//   { primaryVerifiedIds: Set, secondaryVerifiedIds: Set,
//     supportingVerifiedIdsByField: Map<field, Set>, verificationStatus }
// A field is "verified" if this college's id is in the corresponding set;
// A field is "verified" when this college's id is in that field's verified set.
// A per-field MISS is treated as "unavailable" (neutral-low 45), NOT "no-match":
// a lightweight fields=id lookup covers only the CIP codes we queried, so a miss
// on one field isn't proof the college lacks it. This keeps secondary/supporting
// signals as positive-only bonuses and preserves the required ordering
// (primary-only > secondary/supporting-only > unknown). The single exception is
// a college where verification COMPLETELY covered every field but matched NONE -
// that is affirmative "verified no scenario match", scored lowest via no-match
// on the primary field. A PARTIAL/truncated lookup never triggers no-match,
// because a missing id may live beyond the loaded pages.
export function scenarioFitVerified(scenario, c, verification) {
  const id = String(c.id);

  const supEntries = (scenario.supportingFields || []).map((f) => verification.supportingVerifiedIdsByField.get(f));
  const primaryHit = verification.primaryAvailable && verification.primaryVerifiedIds.has(id);
  const secondaryHit = verification.secondaryAvailable && verification.secondaryVerifiedIds.has(id);
  const supHits = supEntries.map((e) => !!(e?.available && e.ids.has(id)));

  // "complete" means the lookup ran AND was not truncated. Fall back to
  // available-and-not-partial when an explicit complete flag isn't present.
  const isComplete = (e) => !!(e && (e.complete ?? (e.available && !e.partial)));
  const primaryComplete = verification.primaryAvailable && !verification.primaryPartial;
  const secondaryComplete = verification.secondaryAvailable && !verification.secondaryPartial;
  const allComplete = primaryComplete && secondaryComplete && supEntries.every(isComplete);
  const anyHit = primaryHit || secondaryHit || supHits.some(Boolean);

  // Per-field status: verified on a hit, otherwise unknown (neutral-low).
  const mk = (hit) => ({ status: hit ? "verified" : "unavailable", matched: hit });
  let primary = mk(primaryHit);
  const secondary = mk(secondaryHit);
  const supStatuses = supHits.map(mk);

  // Affirmative "verified no scenario match": every field was COMPLETELY checked
  // (not partial), none hit. Only then mark primary no-match (ranks below unknown).
  if (allComplete && !anyHit) primary = { status: "no-match", matched: false };

  const career = careerAlignment(c);
  return scoreFromStatuses(scenario, primary, secondary, supStatuses, career);
}
