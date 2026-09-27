// applicationPlatforms.js. Seed data for the Application Pathways module.
// Shared, non-student reference metadata about the major application routes
// used by U.S. colleges (Common App, Coalition/Scoir, state-system apps,
// college-specific forms, etc.). This is general platform-level guidance --
// NOT a claim about which platform a specific college uses today. Per-college
// selections live in college_application_requirements and can always be
// manually corrected by the family; "approximate coverage" numbers are
// order-of-magnitude guidance, not live counts.
export const APPLICATION_PLATFORMS = [
  {
    platformId: "common_app",
    platformName: "Common App",
    category: "Shared national application",
    approximateCoverage: "1,000+ colleges",
    regionSystem: "National. Many East Coast, private, and national universities",
    officialUrl: "https://www.commonapp.org",
    notes: "One application and one main essay can be sent to many member colleges. Common App also lists each college's deadlines, fees, requirements, and campus-life info. Most colleges still require college-specific supplemental questions.",
  },
  {
    platformId: "coalition_scoir",
    platformName: "Coalition / Scoir",
    category: "Shared national application",
    approximateCoverage: "150+ colleges",
    regionSystem: "National. Alternative/shared route for many selective colleges",
    officialUrl: "https://www.scoir.com",
    notes: "An alternative shared application accepted alongside (or instead of) Common App at some colleges. Publishes its own essay prompts, separate from Common App's.",
  },
  {
    platformId: "uc_application",
    platformName: "UC Application",
    category: "Shared state-system application",
    approximateCoverage: "9 UC campuses",
    regionSystem: "California. University of California system",
    officialUrl: "https://apply.universityofcalifornia.edu",
    notes: "One application covers all UC campuses you apply to. Uses its own Personal Insight Questions (PIQs) instead of the Common App essay. Applicants choose from a set of UC-specific prompts.",
  },
  {
    platformId: "cal_state_apply",
    platformName: "Cal State Apply",
    category: "Shared state-system application",
    approximateCoverage: "22 CSU campuses",
    regionSystem: "California. California State University system",
    officialUrl: "https://www2.calstate.edu/apply",
    notes: "One application for California State University campuses, separate from the UC application.",
  },
  {
    platformId: "apply_texas",
    platformName: "ApplyTexas",
    category: "Shared state application",
    approximateCoverage: "Texas public universities + many Texas community/private colleges",
    regionSystem: "Texas",
    officialUrl: "https://www.applytexas.org",
    notes: "Covers most Texas public universities (e.g. UT Austin, Texas A&M) and many Texas community and private colleges. Some Texas schools also accept Common App.",
  },
  {
    platformId: "apply_suny",
    platformName: "applySUNY",
    category: "Shared state-system application",
    approximateCoverage: "Multiple SUNY campuses",
    regionSystem: "New York. State University of New York system",
    officialUrl: "https://www.suny.edu/apply",
    notes: "One SUNY application form can send documents to multiple SUNY campuses at once.",
  },
  {
    platformId: "cuny_application",
    platformName: "CUNY Application",
    category: "Shared state-system application",
    approximateCoverage: "Multiple CUNY campuses",
    regionSystem: "New York. City University of New York system",
    officialUrl: "https://www.cuny.edu/admissions/",
    notes: "One CUNY application form can send documents to multiple CUNY campuses at once.",
  },
  {
    platformId: "questbridge",
    platformName: "QuestBridge",
    category: "Selective partner program",
    approximateCoverage: "Partner colleges only",
    regionSystem: "National, for eligible students only",
    officialUrl: "https://www.questbridge.org",
    notes: "Only relevant if the student qualifies. QuestBridge's National College Match is specifically for high-achieving students from low-income backgrounds applying to partner colleges. Not a general-purpose application route.",
  },
  {
    platformId: "college_specific",
    platformName: "College-specific application",
    category: "Single-institution application",
    approximateCoverage: "One college (or one special program)",
    regionSystem: "Varies by institution",
    officialUrl: "",
    notes: "Some colleges (e.g. MIT, Georgetown) and many honors colleges / scholarship / special programs use their own application form and their own essay questions instead of a shared platform.",
  },
  {
    platformId: "other_state_system",
    platformName: "Other state/system application",
    category: "Shared state-system application",
    approximateCoverage: "Varies",
    regionSystem: "Varies. Other state public-university systems not listed above",
    officialUrl: "",
    notes: "Some states run their own shared system application not covered above. Verify directly with the college.",
  },
  {
    platformId: "unknown",
    platformName: "Unknown, needs verification",
    category: "Unverified",
    approximateCoverage: "N/A",
    regionSystem: "N/A",
    officialUrl: "",
    notes: "The application route for this college hasn't been confirmed yet. Check the college's official admissions page.",
  },
];

export function seedApplicationPlatforms(db) {
  const ts = Date.now();
  const stmt = db.prepare(`
    INSERT INTO application_platforms (platform_id, platform_name, category, approximate_coverage,
      region_system, official_url, notes, updated_at)
    VALUES (@platformId, @platformName, @category, @approximateCoverage, @regionSystem, @officialUrl, @notes, @updated_at)
    ON CONFLICT(platform_id) DO UPDATE SET platform_name=excluded.platform_name, category=excluded.category,
      approximate_coverage=excluded.approximate_coverage, region_system=excluded.region_system,
      official_url=excluded.official_url, notes=excluded.notes, updated_at=excluded.updated_at
  `);
  for (const p of APPLICATION_PLATFORMS) stmt.run({ ...p, updated_at: ts });
}
