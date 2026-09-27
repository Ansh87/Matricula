// regions.js. Informational-only region grouping + application-route
// guidance for the Application Pathways "Region view" (Part C). This is
// general knowledge about how U.S. college application platforms are
// typically organized by region/state-system, NOT a claim about any specific
// college's actual application route, always verify per college.
const STATE_TO_REGION = {
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast", RI: "Northeast",
  CT: "Northeast", NJ: "Northeast", PA: "Northeast",
  NY: "Northeast (NY public systems)",
  DE: "Mid-Atlantic", MD: "Mid-Atlantic", DC: "Mid-Atlantic", VA: "Mid-Atlantic", WV: "Mid-Atlantic",
  NC: "South", SC: "South", GA: "South", FL: "South", AL: "South", MS: "South",
  TN: "South", KY: "South", LA: "South", AR: "South",
  TX: "Texas",
  OH: "Midwest", MI: "Midwest", IN: "Midwest", IL: "Midwest", WI: "Midwest",
  MN: "Midwest", IA: "Midwest", MO: "Midwest", ND: "Midwest", SD: "Midwest",
  NE: "Midwest", KS: "Midwest",
  CA: "California",
  OR: "West Coast", WA: "West Coast",
  NV: "West / Mountain", AZ: "West / Mountain", UT: "West / Mountain", CO: "West / Mountain",
  ID: "West / Mountain", MT: "West / Mountain", WY: "West / Mountain", NM: "West / Mountain",
  AK: "West / Mountain", HI: "West / Mountain",
  OK: "South",
};

// Region -> likely application routes. Informational only; every college
// must still be verified individually (see college_application_requirements).
const REGION_GUIDANCE = {
  Northeast: {
    label: "Northeast",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application"],
    note: "Most Northeast private and national universities use Common App or Coalition/Scoir; some (e.g. MIT) use their own application.",
  },
  "Northeast (NY public systems)": {
    label: "New York",
    likelyRoutes: ["applySUNY", "CUNY Application", "Common App", "College-specific application"],
    note: "New York's public systems (SUNY, CUNY) mostly use their own shared applications; many NY private colleges use Common App.",
  },
  "Mid-Atlantic": {
    label: "Mid-Atlantic",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application"],
    note: "Mostly Common App / Coalition territory, with some college-specific forms for flagship publics and service academies.",
  },
  South: {
    label: "South",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application", "Other state/system application"],
    note: "Many Southern public-university systems run their own state application in addition to accepting Common App. Verify per state/college.",
  },
  Texas: {
    label: "Texas",
    likelyRoutes: ["ApplyTexas", "Common App", "College-specific application"],
    note: "Most Texas public universities (UT Austin, Texas A&M, etc.) use ApplyTexas; some also accept Common App. College-specific supplements are common.",
  },
  Midwest: {
    label: "Midwest",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application"],
    note: "Mostly Common App / Coalition territory; some large public systems have their own application.",
  },
  California: {
    label: "California",
    likelyRoutes: ["UC Application", "Cal State Apply", "Common App", "College-specific application"],
    note: "UC campuses share one UC Application; CSU campuses share Cal State Apply (a separate system); many California private colleges use Common App.",
  },
  "West Coast": {
    label: "West Coast (OR/WA)",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application"],
    note: "Mostly Common App / Coalition territory outside California.",
  },
  "West / Mountain": {
    label: "West / Mountain",
    likelyRoutes: ["Common App", "Coalition / Scoir", "College-specific application"],
    note: "Mostly Common App / Coalition territory; some state flagships have their own application.",
  },
};

export function regionForState(state) {
  return STATE_TO_REGION[String(state || "").toUpperCase()] || null;
}

export function regionGuidance(regionKey) {
  return REGION_GUIDANCE[regionKey] || null;
}

export function allRegionGuidance() {
  return REGION_GUIDANCE;
}
