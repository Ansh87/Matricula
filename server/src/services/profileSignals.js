// profileSignals.js - turns free text (activities, resume, portfolio summary,
// projects, awards) into concrete signals the scoring engine uses. Keyword-based
// and transparent: the UI shows the user exactly which signals were detected, so
// nothing is a black box.

function textOf(profile) {
  const parts = [
    profile.activitiesText,
    profile.summary,
    profile.resumeText,
    profile.portfolioText,
    profile.parsedText,
  ];
  const pushObjs = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((x) => {
      if (typeof x === "string") parts.push(x);
      else if (x && typeof x === "object") parts.push([x.role, x.name, x.title, x.category, x.level, x.description].filter(Boolean).join(" "));
    });
  };
  pushObjs(profile.activities);
  pushObjs(profile.projects);
  pushObjs(profile.awards_detail || profile.awardsDetail);
  return parts.filter(Boolean).join("\n").toLowerCase();
}

// Split activities on newlines, semicolons, and bullets - not just newlines.
export function splitActivities(text) {
  if (!text) return [];
  return String(text)
    .split(/\n|;|\u2022|•|\|/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const RX = {
  patent: /\bpatent|provisional patent|inventor\b/,
  publication: /\bieee\b|publication|published|research paper|journal|conference proceedings|preprint|arxiv/,
  research: /\bresearch\b|\blab\b|laboratory|professor|principal investigator|thesis/,
  internship: /\bintern\b|internship|co-op|coop\b/,
  leadership: /founder|co-founder|president|captain|team lead|\blead\b|director|chair|head of|editor-in-chief|organizer/,
  service: /volunteer|nonprofit|non-profit|tutoring|community service|mentor|charity|outreach/,
  national: /national|international|finalist|olympiad|semifinalist|usaco|usamo|intel isef|regeneron|siemens/,
  state: /\bstate\b|regional|county championship/,
  stemComp: /hackathon|olympiad|science fair|robotics competition|math competition|usaco|isef|debate championship/,
  project: /\bapp\b|built|deployed|github|netlify|prototype|open source|shipped|launched|website/,
};

function strengthFrom(count, hits) {
  // Simple, explainable: no hits -> None; some -> Medium; multiple/strong -> Strong.
  if (!hits) return "None";
  if (hits >= 2 || count >= 3) return "Strong";
  return "Medium";
}

export function deriveProfileSignals(profile) {
  const text = textOf(profile);
  const items = splitActivities(profile.activitiesText || "");
  const count = items.length;
  const hit = (rx) => (rx.test(text) ? (text.match(new RegExp(rx.source, "g")) || []).length : 0);

  const hasPatent = hit(RX.patent) > 0;
  const hasPublication = hit(RX.publication) > 0;
  const researchHits = hit(RX.research) + (hasPublication ? 1 : 0) + (hasPatent ? 1 : 0);
  const internshipHits = hit(RX.internship);
  const leadershipHits = hit(RX.leadership);
  const serviceHits = hit(RX.service);
  const projectHits = hit(RX.project) + (hasPatent ? 1 : 0);
  const nationalHits = hit(RX.national);
  const stateHits = hit(RX.state);
  const stemHits = hit(RX.stemComp);

  // Explicit profile checkboxes OR text evidence - either counts.
  const hasResearch = !!profile.hasResearch || researchHits > 0;
  const hasInternship = !!profile.hasInternship || internshipHits > 0;
  const hasLeadership = !!profile.hasLeadership || leadershipHits > 0;
  const hasVolunteer = !!profile.hasVolunteer || serviceHits > 0;

  const awardStrength = nationalHits > 0 || profile.awards === "national" || profile.awards === "international"
    ? "National"
    : stateHits > 0 || ["state", "regional"].includes(profile.awards) ? "State/Regional"
    : profile.awards && profile.awards !== "none" ? "School/Local" : "None";

  // A 0-100 extracurricular strength derived from the above (transparent).
  let ec = 30;
  if (count >= 3) ec += 8;
  if (count >= 6) ec += 6;
  if (hasResearch) ec += 12;
  if (hasPublication) ec += 8;
  if (hasPatent) ec += 8;
  if (hasLeadership) ec += 10;
  if (hasInternship) ec += 6;
  if (hasVolunteer) ec += 5;
  if (projectHits > 0) ec += 6;
  if (stemHits > 0) ec += 5;
  if (awardStrength === "National") ec += 12;
  else if (awardStrength === "State/Regional") ec += 7;
  else if (awardStrength === "School/Local") ec += 3;
  ec = Math.max(0, Math.min(100, ec));

  return {
    hasResearch, hasInternship, hasLeadership, hasVolunteer,
    hasFounderExperience: /founder|co-founder/.test(text),
    hasPublication, hasPatent,
    hasNationalAward: awardStrength === "National",
    hasStateAward: awardStrength === "State/Regional",
    hasSTEMCompetition: stemHits > 0,
    extracurricularStrength: ec,
    researchStrength: strengthFrom(count, researchHits),
    leadershipStrength: strengthFrom(count, leadershipHits),
    awardStrength,
    projectStrength: strengthFrom(count, projectHits),
    serviceStrength: strengthFrom(count, serviceHits),
    activityCount: count,
  };
}
