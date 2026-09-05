// bls.js - U.S. Bureau of Labor Statistics career data.
//
// The BLS public API (v2) serves time series by series ID (e.g. employment,
// wages). Occupation-level median pay + projected growth for careers come from
// the Occupational Outlook Handbook / Employment Projections program, which is
// most reliably distributed as published datasets rather than a single live
// numeric endpoint. So this module:
//   1. Exposes a live BLS API passthrough (getSeries) when BLS_API_KEY is set.
//   2. Serves a bundled, explicitly-dated OOH snapshot for occupation cards,
//      each row carrying its own source + year + national/regional flag.
// Nothing here is invented: figures are transcribed from BLS OOH and labeled.
import { config } from "../config.js";

const BLS_SOURCE = "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook";
// Snapshot vintage. Update via a documented refresh; shown to users verbatim.
const BLS_YEAR = 2024;

// occupation median pay (annual, national), 2024 OOH values.
// growth = projected % change 2023–2033. Values transcribed from BLS OOH.
const OCCUPATIONS = {
  "software-developers": {
    occupation: "Software Developers", blsCode: "15-1252",
    medianPay: 132270, growth: "17% (much faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "data-scientists": {
    occupation: "Data Scientists", blsCode: "15-2051",
    medianPay: 112590, growth: "36% (much faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "information-security-analysts": {
    occupation: "Information Security Analysts", blsCode: "15-1212",
    medianPay: 124910, growth: "33% (much faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "computer-hardware-engineers": {
    occupation: "Computer Hardware Engineers", blsCode: "17-2061",
    medianPay: 155020, growth: "7% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "electrical-engineers": {
    occupation: "Electrical Engineers", blsCode: "17-2071",
    medianPay: 111910, growth: "9% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "financial-analysts": {
    occupation: "Financial Analysts", blsCode: "13-2051",
    medianPay: 99890, growth: "9% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "economists": {
    occupation: "Economists", blsCode: "19-3011",
    medianPay: 115730, growth: "5% (faster than average)",
    entryEducation: "Master's degree",
  },
  "operations-research-analysts": {
    occupation: "Operations Research Analysts", blsCode: "15-2031",
    medianPay: 91290, growth: "23% (much faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "biomedical-engineers": {
    occupation: "Biomedical Engineers", blsCode: "17-2031",
    medianPay: 100730, growth: "7% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "environmental-engineers": {
    occupation: "Environmental Engineers", blsCode: "17-2081",
    medianPay: 100090, growth: "7% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "mechanical-engineers": {
    occupation: "Mechanical Engineers", blsCode: "17-2141",
    medianPay: 99510, growth: "11% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
  "management-analysts": {
    occupation: "Management Analysts", blsCode: "13-1111",
    medianPay: 99410, growth: "11% (faster than average)",
    entryEducation: "Bachelor's degree",
  },
};

// Major -> occupation keys. AI-impact + grad-school flags are our editorial
// guidance (labeled "Estimated"), NOT presented as BLS facts.
const MAJOR_MAP = {
  "Computer Science": {
    careers: ["software-developers", "data-scientists", "information-security-analysts"],
    aiImpact: "AI augments this field; strong long-term demand for builders of AI systems.",
    gradSchool: "Not required for most roles.",
  },
  "Artificial Intelligence": {
    careers: ["data-scientists", "software-developers"],
    aiImpact: "Directly builds AI; among the fastest-growing skill areas.",
    gradSchool: "Advanced roles/research often favor a master's or PhD.",
  },
  "Data Science": {
    careers: ["data-scientists", "operations-research-analysts", "software-developers"],
    aiImpact: "Central to AI/analytics; very strong projected growth.",
    gradSchool: "Not required; helpful for research roles.",
  },
  "Cybersecurity": {
    careers: ["information-security-analysts", "software-developers"],
    aiImpact: "AI both aids defense and expands the threat surface; rising demand.",
    gradSchool: "Not required for most roles.",
  },
  "Electrical Engineering": {
    careers: ["electrical-engineers", "computer-hardware-engineers"],
    aiImpact: "Hardware/edge-AI and semiconductors are growth areas.",
    gradSchool: "Not required; specialization may benefit.",
  },
  "Computer Engineering": {
    careers: ["computer-hardware-engineers", "software-developers", "electrical-engineers"],
    aiImpact: "Bridges hardware and software for AI systems.",
    gradSchool: "Not required for most roles.",
  },
  "Finance": {
    careers: ["financial-analysts", "management-analysts"],
    aiImpact: "AI automates routine analysis; quantitative + judgment skills stay valuable.",
    gradSchool: "Not required; MBA/CFA can advance.",
  },
  "Economics": {
    careers: ["economists", "financial-analysts", "management-analysts"],
    aiImpact: "Data/AI methods increasingly used in economic analysis.",
    gradSchool: "Economist roles frequently require a master's/PhD.",
  },
  "Business Analytics": {
    careers: ["management-analysts", "operations-research-analysts", "data-scientists"],
    aiImpact: "Analytics + AI tooling is a strong hiring area.",
    gradSchool: "Not required.",
  },
  "Biomedical Engineering": {
    careers: ["biomedical-engineers"],
    aiImpact: "AI in medical devices/diagnostics is emerging.",
    gradSchool: "Some roles/research favor graduate study.",
  },
  "Environmental Engineering": {
    careers: ["environmental-engineers"],
    aiImpact: "Modeling/sensing increasingly data-driven.",
    gradSchool: "Not required for most roles.",
  },
  "Public Policy": {
    careers: ["management-analysts", "economists", "operations-research-analysts"],
    aiImpact: "Data-informed policy analysis is growing.",
    gradSchool: "Policy analyst roles often favor a master's.",
  },
  "Mechanical Engineering": {
    careers: ["mechanical-engineers", "electrical-engineers"],
    aiImpact: "Automation/robotics integrate AI.",
    gradSchool: "Not required for most roles.",
  },
};

export function listMajors() {
  return Object.keys(MAJOR_MAP);
}

export function careerFor(key) {
  const o = OCCUPATIONS[key];
  if (!o) return null;
  return { ...o, source: BLS_SOURCE, sourceYear: BLS_YEAR, scope: "National" };
}

export function majorToCareers(major) {
  const m = MAJOR_MAP[major];
  if (!m) return null;
  const careers = m.careers.map(careerFor).filter(Boolean);
  const pays = careers.map((c) => c.medianPay);
  const salaryRange = pays.length
    ? `$${Math.min(...pays).toLocaleString()}–$${Math.max(...pays).toLocaleString()} (national median)`
    : "Data unavailable";
  return {
    major,
    careers,
    salaryRange,
    aiImpact: m.aiImpact,           // labeled Estimated in UI
    gradSchoolNeed: m.gradSchool,   // labeled Estimated in UI
    source: BLS_SOURCE,
    sourceYear: BLS_YEAR,
    disclaimer: "Salaries are national medians and estimates, not guarantees. Regional pay varies.",
  };
}

// Optional live BLS passthrough (series data) when a key is configured.
export async function getSeries(seriesIds) {
  if (!config.bls.apiKey) {
    return { available: false, reason: "BLS_API_KEY not set; using bundled OOH snapshot." };
  }
  const res = await fetch(config.bls.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid: seriesIds, registrationkey: config.bls.apiKey }),
  });
  if (!res.ok) throw new Error(`BLS responded ${res.status}`);
  return { available: true, data: await res.json(), source: "U.S. Bureau of Labor Statistics API v2" };
}

export { BLS_SOURCE, BLS_YEAR };
