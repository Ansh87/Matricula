// majorStrategy.js - honest guidance on WHICH major to apply to at a given
// college, and whether you can switch later. Grounded in verified selection
// profiles (major competition + switch-major rules). It never claims a
// guaranteed "backdoor"; it lays out real trade-offs.
import { getSelection } from "./selection.js";

// For a target college + the student's fields of interest, explain the strategy.
export function majorStrategyFor(collegeId, interests = []) {
  const sel = getSelection(collegeId);
  if (!sel.available) {
    return {
      available: false,
      note: "No verified major-strategy data for this college yet. Check the college's official site for how it admits by major and whether majors can be changed after enrolling.",
    };
  }

  const comp = sel.majorCompetition || {};
  const sw = sel.switchMajor || {};
  const byMajor = sel.appliesByMajor;

  // Build honest talking points.
  const points = [];

  if (!byMajor) {
    points.push("This college admits to the institution as a whole, not by major - so your intended major does not change your odds. Apply as your true interest and declare later.");
  } else {
    points.push("This college admits by major or college, so your intended major materially affects your odds.");
    // Flag hyper-competitive majors among the student's interests.
    const hot = Object.entries(comp).filter(([k, v]) =>
      k !== "note" && /extremely|very competitive|hardest|brutal|limited enrollment/i.test(String(v)));
    if (hot.length) {
      points.push(`Most competitive here: ${hot.map(([k]) => prettyMajor(k)).join(", ")}. Applying directly to these is a bigger reach.`);
    }
    if (comp.note) points.push(comp.note);

    // Switch-later reality.
    if (sw.ease && /easy/i.test(sw.ease)) {
      points.push(`Switching majors later is rated "${sw.ease}". ${sw.note || ""} That makes a less-impacted entry major a reasonable strategy - but only if you'd genuinely be happy there.`);
    } else if (sw.ease && /hard|competitive/i.test(sw.ease)) {
      points.push(`Switching INTO the competitive major later is rated "${sw.ease}". ${sw.note || ""} So do NOT count on transferring in - apply to the major you actually want, and prepare strongly for it.`);
    } else if (sw.note) {
      points.push(`On changing majors later: ${sw.note}`);
    }
  }

  // Tie to the student's interests.
  const relevant = interests.filter((i) => Object.keys(comp).some((k) => k.toLowerCase().includes(shortKey(i))));
  if (relevant.length) {
    points.push(`For your interests (${interests.join(", ")}), weigh how competitive each is here against how hard it is to switch in later.`);
  }

  return {
    available: true,
    appliesByMajor: byMajor,
    majorCompetition: comp,
    switchMajor: sw,
    idealApplicant: sel.idealApplicant,
    strategy: points,
    honestNote: "This is strategy, not a loophole. Only apply to a major you'd actually want to study; admissions offices see through insincere 'easier major' plays, and switching in is often hard by design.",
    source: sel.source,
  };
}

function prettyMajor(k) {
  return k.replace(/_/g, " ").replace(/\bCS\b/, "Computer Science")
    .replace(/LnS/, "L&S").replace(/\b\w/g, (c) => c.toUpperCase());
}
function shortKey(interest) {
  const s = interest.toLowerCase();
  if (s.includes("computer") || s.includes("artificial")) return "cs";
  if (s.includes("business") || s.includes("finance")) return "business";
  if (s.includes("engineer")) return "engineering";
  return s.split(" ")[0];
}
