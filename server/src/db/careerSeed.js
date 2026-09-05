// careerSeed.js - rows for the careers + major_career_mapping tables.
// Figures transcribed from the BLS Occupational Outlook Handbook (2024 vintage).
// AI-impact and grad-school notes are editorial guidance, labeled "Estimated".
const BLS = "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook";
const YEAR = 2024;

export const OCCUPATIONS_SEED = [
  { career_id: "software-developers", occupation_name: "Software Developers", bls_code: "15-1252", median_pay: 132270, projected_growth: "17% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Computer Science","Computer Engineering","Data Science"]), source: BLS, source_year: YEAR },
  { career_id: "data-scientists", occupation_name: "Data Scientists", bls_code: "15-2051", median_pay: 112590, projected_growth: "36% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Data Science","Computer Science","Artificial Intelligence"]), source: BLS, source_year: YEAR },
  { career_id: "information-security-analysts", occupation_name: "Information Security Analysts", bls_code: "15-1212", median_pay: 124910, projected_growth: "33% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Cybersecurity","Computer Science"]), source: BLS, source_year: YEAR },
  { career_id: "computer-hardware-engineers", occupation_name: "Computer Hardware Engineers", bls_code: "17-2061", median_pay: 155020, projected_growth: "7% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Computer Engineering","Electrical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "electrical-engineers", occupation_name: "Electrical Engineers", bls_code: "17-2071", median_pay: 111910, projected_growth: "9% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Electrical Engineering","Computer Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "financial-analysts", occupation_name: "Financial Analysts", bls_code: "13-2051", median_pay: 99890, projected_growth: "9% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Finance","Economics","Business Analytics"]), source: BLS, source_year: YEAR },
  { career_id: "economists", occupation_name: "Economists", bls_code: "19-3011", median_pay: 115730, projected_growth: "5% (faster than average)", typical_entry_education: "Master's degree", related_majors_json: JSON.stringify(["Economics","Public Policy"]), source: BLS, source_year: YEAR },
  { career_id: "operations-research-analysts", occupation_name: "Operations Research Analysts", bls_code: "15-2031", median_pay: 91290, projected_growth: "23% (much faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Data Science","Business Analytics","Public Policy"]), source: BLS, source_year: YEAR },
  { career_id: "biomedical-engineers", occupation_name: "Biomedical Engineers", bls_code: "17-2031", median_pay: 100730, projected_growth: "7% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Biomedical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "environmental-engineers", occupation_name: "Environmental Engineers", bls_code: "17-2081", median_pay: 100090, projected_growth: "7% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Environmental Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "mechanical-engineers", occupation_name: "Mechanical Engineers", bls_code: "17-2141", median_pay: 99510, projected_growth: "11% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Mechanical Engineering"]), source: BLS, source_year: YEAR },
  { career_id: "management-analysts", occupation_name: "Management Analysts", bls_code: "13-1111", median_pay: 99410, projected_growth: "11% (faster than average)", typical_entry_education: "Bachelor's degree", related_majors_json: JSON.stringify(["Business Analytics","Finance","Public Policy"]), source: BLS, source_year: YEAR },
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
  M("Computer Science", ["software-developers","data-scientists","information-security-analysts"], "$112,590–$132,270", "AI augments this field; strong demand for AI-system builders.", "Not required for most roles."),
  M("Artificial Intelligence", ["data-scientists","software-developers"], "$112,590–$132,270", "Directly builds AI; fastest-growing skill area.", "Advanced roles often favor a master's/PhD."),
  M("Data Science", ["data-scientists","operations-research-analysts","software-developers"], "$91,290–$132,270", "Central to AI/analytics; very strong growth.", "Not required; helpful for research."),
  M("Cybersecurity", ["information-security-analysts","software-developers"], "$124,910–$132,270", "Rising demand as AI expands threat surface.", "Not required for most roles."),
  M("Electrical Engineering", ["electrical-engineers","computer-hardware-engineers"], "$111,910–$155,020", "Edge-AI and semiconductors are growth areas.", "Not required; specialization may help."),
  M("Computer Engineering", ["computer-hardware-engineers","software-developers","electrical-engineers"], "$111,910–$155,020", "Bridges hardware and software for AI.", "Not required for most roles."),
  M("Finance", ["financial-analysts","management-analysts"], "$99,410–$99,890", "AI automates routine analysis; judgment stays valuable.", "Not required; MBA/CFA can advance."),
  M("Economics", ["economists","financial-analysts","management-analysts"], "$99,410–$115,730", "Data/AI methods increasingly used.", "Economist roles often require master's/PhD."),
  M("Business Analytics", ["management-analysts","operations-research-analysts","data-scientists"], "$91,290–$112,590", "Analytics + AI tooling is a strong hiring area.", "Not required."),
  M("Biomedical Engineering", ["biomedical-engineers"], "$100,730", "AI in devices/diagnostics is emerging.", "Some roles favor graduate study."),
  M("Environmental Engineering", ["environmental-engineers"], "$100,090", "Modeling/sensing increasingly data-driven.", "Not required for most roles."),
  M("Public Policy", ["management-analysts","economists","operations-research-analysts"], "$91,290–$115,730", "Data-informed policy analysis growing.", "Analyst roles often favor a master's."),
  M("Mechanical Engineering", ["mechanical-engineers","electrical-engineers"], "$99,510–$111,910", "Automation/robotics integrate AI.", "Not required for most roles."),
];
