// careerSeed.js - rows for the careers + major_career_mapping tables.
// Figures transcribed from the BLS Occupational Outlook Handbook (August 2026 edition: May 2025 wages, 2025-35 projections).
// AI-impact and grad-school notes are editorial guidance, labeled "Estimated".
const BLS = "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook";
const YEAR = 2025;

export const OCCUPATIONS_SEED = [
  { career_id: "software-developers", occupation_name: "Software Developers", bls_code: "15-1252", median_pay: 135980, projected_growth: "10% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Computer Science","Computer Engineering","Data Science"]), source: BLS, source_year: YEAR },
  { career_id: "data-scientists", occupation_name: "Data Scientists", bls_code: "15-2051", median_pay: 120230, projected_growth: "35% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Data Science","Computer Science","Artificial Intelligence"]), source: BLS, source_year: YEAR },
  { career_id: "information-security-analysts", occupation_name: "Information Security Analysts", bls_code: "15-1212", median_pay: 129180, projected_growth: "21% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Cybersecurity","Computer Science"]), source: BLS, source_year: YEAR },
  { career_id: "computer-hardware-engineers", occupation_name: "Computer Hardware Engineers", bls_code: "17-2061", median_pay: 161740, projected_growth: "9% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Computer Engineering","Electrical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "electrical-engineers", occupation_name: "Electrical Engineers", bls_code: "17-2071", median_pay: 120630, projected_growth: "10% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Electrical Engineering","Computer Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "financial-analysts", occupation_name: "Financial Analysts", bls_code: "13-2051", median_pay: 102740, projected_growth: "7% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Finance","Economics","Business Analytics"]), source: BLS, source_year: YEAR },
  { career_id: "economists", occupation_name: "Economists", bls_code: "19-3011", median_pay: 124720, projected_growth: "5% (faster than average)", typical_entry_education: "Master's degree", related_majors_json: JSON.stringify(["Economics","Public Policy"]), source: BLS, source_year: YEAR },
  { career_id: "operations-research-analysts", occupation_name: "Operations Research Analysts", bls_code: "15-2031", median_pay: 88940, projected_growth: "12% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Data Science","Business Analytics","Public Policy"]), source: BLS, source_year: YEAR },
  { career_id: "biomedical-engineers", occupation_name: "Biomedical Engineers", bls_code: "17-2031", median_pay: 109370, projected_growth: "8% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Biomedical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "environmental-engineers", occupation_name: "Environmental Engineers", bls_code: "17-2081", median_pay: 107110, projected_growth: "6% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Environmental Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "mechanical-engineers", occupation_name: "Mechanical Engineers", bls_code: "17-2141", median_pay: 104110, projected_growth: "11% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Mechanical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "management-analysts", occupation_name: "Management Analysts", bls_code: "13-1111", median_pay: 101860, projected_growth: "10% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Business Analytics","Finance","Public Policy"]), source: BLS, source_year: YEAR },
];

const M = (major_name, careers, salary_range, ai, grad) => ({
  major_name,
  related_careers_json: JSON.stringify(careers),
  salary_range,
  job_outlook: "See linked BLS occupations for projected growth",
  ai_impact: ai,
  graduate_school_need: grad,
  source: BLS,
});

export const MAJOR_SEED = [
  M("Computer Science", ["software-developers","data-scientists","information-security-analysts"], "$120,230-$135,980", "AI augments this field; strong demand for AI-system builders.", "Not required for most roles."),
  M("Artificial Intelligence", ["data-scientists","software-developers"], "$120,230-$135,980", "Directly builds AI; fastest-growing skill area.", "Advanced roles often favor a master's/PhD."),
  M("Data Science", ["data-scientists","operations-research-analysts","software-developers"], "$88,940-$135,980", "Central to AI/analytics; very strong growth.", "Not required; helpful for research."),
  M("Cybersecurity", ["information-security-analysts","software-developers"], "$129,180-$135,980", "Rising demand as AI expands threat surface.", "Not required for most roles."),
  M("Electrical Engineering", ["electrical-engineers","computer-hardware-engineers"], "$120,630-$161,740", "Edge-AI and semiconductors are growth areas.", "Not required; specialization may help."),
  M("Computer Engineering", ["computer-hardware-engineers","software-developers","electrical-engineers"], "$120,630-$161,740", "Bridges hardware and software for AI.", "Not required for most roles."),
  M("Finance", ["financial-analysts","management-analysts"], "$101,860-$102,740", "AI automates routine analysis; judgment stays valuable.", "Not required; MBA/CFA can advance."),
  M("Economics", ["economists","financial-analysts","management-analysts"], "$101,860-$124,720", "Data/AI methods increasingly used.", "Economist roles often require master's/PhD."),
  M("Business Analytics", ["management-analysts","operations-research-analysts","data-scientists"], "$88,940-$120,230", "Analytics + AI tooling is a strong hiring area.", "Not required."),
  M("Biomedical Engineering", ["biomedical-engineers"], "$109,370", "AI in devices/diagnostics is emerging.", "Some roles favor graduate study."),
  M("Environmental Engineering", ["environmental-engineers"], "$107,110", "Modeling/sensing increasingly data-driven.", "Not required for most roles."),
  M("Public Policy", ["management-analysts","economists","operations-research-analysts"], "$88,940-$124,720", "Data-informed policy analysis growing.", "Analyst roles often favor a master's."),
  M("Mechanical Engineering", ["mechanical-engineers","electrical-engineers"], "$104,110-$120,630", "Automation/robotics integrate AI.", "Not required for most roles."),
];
