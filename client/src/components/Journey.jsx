// Journey.jsx, the family's roadmap: a 10-stage overview of where things
// stand right now (computed from the family's own saved data, never
// invented), plus a default senior-year timeline with one-click task
// creation into the Decision Plan's Timeline & Tasks list.
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { Spinner } from "./ui.jsx";
import { Arrow, Check, CircleHalf, CircleOpen, Warning } from "./icons.jsx";

const STATUS_STYLE = {
  "Not started": { color: "var(--muted)", glyph: <CircleOpen /> },
  "In progress": { color: "var(--target)", glyph: <CircleHalf /> },
  "Needs verification": { color: "var(--reach)", glyph: <Warning /> },
  "Complete": { color: "var(--safety)", glyph: <Check /> },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Not started"];
  return (
    <span className="pill" style={{ color: s.color, borderColor: s.color, cursor: "default" }}>
      {s.glyph} {status}
    </span>
  );
}

// Find the next occurrence of month/day (1-indexed month) on/after `today`.
function nextDate(today, month, day) {
  let year = today.getFullYear();
  let d = new Date(year, month - 1, day);
  if (d < today) d = new Date(year + 1, month - 1, day);
  return d.toISOString().slice(0, 10);
}

export function Journey({ studentId, profile, saved, onGo }) {
  const [items, setItems] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [summary, setSummary] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [essayPrompts, setEssayPrompts] = useState([]);
  const [timelineSummary, setTimelineSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [createdMsg, setCreatedMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listDecisionItems(studentId).catch(() => ({ items: [] })),
      api.listDiscoveredPrograms(studentId).catch(() => ({ programs: [] })),
      api.decisionPlanSummary(studentId).catch(() => null),
      api.listRequirements(studentId).catch(() => ({ requirements: [] })),
      api.listEssayPrompts(studentId).catch(() => ({ prompts: [] })),
      api.timelineJourneySummary(studentId).catch(() => null),
    ]).then(([itemsRes, progRes, summaryRes, reqRes, essayRes, timelineRes]) => {
      if (cancelled) return;
      setItems(itemsRes.items || []);
      setPrograms(progRes.programs || []);
      setSummary(summaryRes);
      setRequirements(reqRes.requirements || []);
      setEssayPrompts(essayRes.prompts || []);
      setTimelineSummary(timelineRes);
      setErr(null);
    }).catch((e) => !cancelled && setErr(e))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [studentId]);

  // Essay prompts still needing verification. Computed here (not a new
  // endpoint) since Journey already loads the full prompt list for the
  // existing "essays" stage above.
  const essayPromptsNeedingVerification = useMemo(
    () => essayPrompts.filter((p) => p.verification_status !== "Official source verified" && p.verification_status !== "User verified"),
    [essayPrompts]
  );

  const stages = useMemo(() => {
    const p = profile || {};
    const profileCore = !!p.state && !!p.grade && !!p.gpa && (!!p.sat || !!p.act);
    const profileAny = !!p.state || !!p.gpa || !!p.sat || !!p.act;
    const majorsChosen = (p.interests || []).length > 0;

    const verifiedProgramCollegeIds = new Set(
      programs.filter((pr) => pr.verification_status === "Official source verified" || pr.verification_status === "User verified").map((pr) => pr.college_id)
    );
    const savedCollegeIds = new Set((saved || []).map((s) => s.college_id));
    const allSavedVerified = savedCollegeIds.size > 0 && [...savedCollegeIds].every((id) => verifiedProgramCollegeIds.has(id));

    const trackedItems = items.filter((i) => i.career_track);

    // Application platform coverage: one "main application" record (no
    // program_label) per saved college is enough to count that college as
    // covered; a verified one counts it as fully resolved.
    const mainReqByCollege = new Map();
    for (const r of requirements) {
      if (!r.college_id) continue;
      const existing = mainReqByCollege.get(r.college_id);
      if (!existing || (!r.program_label && existing.program_label)) mainReqByCollege.set(r.college_id, r);
    }
    const savedIdsForPathways = new Set((saved || []).map((s) => s.college_id));
    const coveredCollegeCount = [...savedIdsForPathways].filter((id) => mainReqByCollege.has(id)).length;
    const verifiedCollegeCount = [...savedIdsForPathways].filter((id) => {
      const r = mainReqByCollege.get(id);
      return r && (r.verification_status === "Official source verified" || r.verification_status === "User verified");
    }).length;

    // Essay tracking: at least one prompt per saved college is "in progress";
    // every tracked prompt Final/Submitted is "Complete".
    const essayCollegeIds = new Set(essayPrompts.filter((p) => p.college_id).map((p) => p.college_id));
    const finishedEssayCount = essayPrompts.filter((p) => p.status === "Final" || p.status === "Submitted").length;

    const list = [
      {
        key: "profile", title: "1. Build Your Profile",
        status: profileCore ? "Complete" : profileAny ? "In progress" : "Not started",
        detail: "Academics, budget, interests, and goals, the foundation every other stage builds on.",
        action: "Go to Profile", view: "profile",
      },
      {
        key: "majors", title: "2. Choose Majors & Career Tracks",
        status: majorsChosen ? "Complete" : "Not started",
        detail: "Pick a primary interest (and, if relevant, a second major or minor) so matches and program research can be targeted.",
        action: "Go to Majors", view: "majors",
      },
      {
        key: "matches", title: "3. Generate & Review College Matches",
        status: (saved || []).length > 0 ? "Complete" : "Not started",
        detail: "Run matches against official College Scorecard data and save the colleges worth researching further.",
        action: "Go to Matches", view: "matches",
      },
      {
        key: "programs", title: "4. Research Programs at Your Colleges",
        status: programs.length === 0 ? "Not started" : allSavedVerified ? "Complete" : anyCollegeVerified ? "Needs verification" : "In progress",
        detail: "Use \"Research this college\" to pull official majors, minors, and special programs, always source-labeled, never invented.",
        action: "Go to Programs & Opportunities", view: "programs",
      },
      {
        key: "courses", title: "5. Build a Course & Prep Plan by Track",
        status: trackedItems.length === 0 ? "Not started" : trackedItems.length === items.length && items.length > 0 ? "Complete" : "In progress",
        detail: "Review recommended courses, tests, and portfolio/audition prep for each career track under consideration.",
        action: "Go to Courses", view: "courses",
      },
      {
        key: "pathways", title: "6. Confirm Application Platforms & Deadlines",
        status: !savedIdsForPathways.size ? "Not started"
          : verifiedCollegeCount === savedIdsForPathways.size ? "Complete"
          : coveredCollegeCount > 0 ? "In progress" : "Not started",
        detail: "Record which application platform (Common App, UC Application, ApplyTexas, etc.) each college uses, plus every deadline type.",
        action: "Go to Application Pathways", view: "applicationPathways",
      },
      {
        key: "essays", title: "7. Track & Write Your Essays",
        status: !essayPrompts.length ? "Not started"
          : finishedEssayCount === essayPrompts.length ? "Complete"
          : essayCollegeIds.size > 0 ? "In progress" : "Not started",
        detail: "Find or add each college's essay prompts, brainstorm by track, and track status from Not started through Submitted.",
        action: "Go to Essay Center", view: "essays",
      },
      {
        key: "finalList", title: "8. Build Your Final Application List",
        status: !(saved || []).length ? "Not started" : summary?.balanceNotice ? "Needs verification" : "In progress",
        detail: "Settle on a balanced set of colleges by category (Reach/Target/Safety/Financial Safety) that you would actually be happy to attend.",
        action: "Go to My List", view: "saved",
      },
      {
        key: "tasks", title: "9. Set Deadlines & Tasks",
        status: !summary || summary.tasks.total === 0 ? "Not started" : summary.tasks.overdue > 0 ? "Needs verification" : summary.tasks.open > 0 ? "In progress" : "Complete",
        detail: "Track every application, testing, essay, and financial-aid deadline in one place.",
        action: "Go to Apply", view: "applicationPathways",
      },
      {
        key: "export", title: "10. Export & Final Review",
        status: (saved || []).length > 0 && summary?.needsVerification === 0 ? "Complete" : (saved || []).length > 0 ? "In progress" : "Not started",
        detail: "Export your list, Programs & Opportunities, Apply records, and Essay Center to CSV for a final family review.",
        action: "Go to Settings", view: "settings",
      },
    ];
    return list;
  }, [profile, saved, items, programs, summary, requirements, essayPrompts]);


  const createTask = async (periodLabel, text, due) => {
    try {
      await api.addDecisionTask(studentId, {
        taskType: "timeline", dueDate: due, priority: "Medium", status: "To do",
        notes: `${periodLabel}: ${text}`,
      });
      setCreatedMsg(`Task added: "${text}"`);
      setTimeout(() => setCreatedMsg(null), 3000);
    } catch (e) {
      setCreatedMsg(`Couldn't add task: ${e.message}`);
    }
  };

  if (loading) return <Spinner label="Loading your Journey…" />;

  return (
    <div className="stack">
      {/* No <h1> here: Journey renders inside the Dashboard, which owns the
          page title. */}
      <div>
        <h2>Your roadmap</h2>
        <p className="lead">Where things stand right now, computed from your own profile, matches, program
          research, application platforms, and essays. Nothing here is assumed.</p>
      </div>

      {err && <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>Some Journey data couldn't be loaded: {err.message}</div>}

      <div className="grid cols-2">
        {stages.map((s) => (
          <div key={s.key} className="card pad stack">
            <div className="row spread">
              <h3>{s.title}</h3>
              <StatusPill status={s.status} />
            </div>
            <p className="note">{s.detail}</p>
            <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => onGo(s.view)}>{s.action} <Arrow /></button>
          </div>
        ))}
      </div>

      <div className="card pad stack">
        <h3>Upcoming Deadlines &amp; Verification</h3>
        <p className="note">Pulled straight from Application Timeline and Essay Center. Nothing here is invented; it just tells you what needs attention next.</p>

        <div className="grid cols-2">
          <div>
            <div className="note" style={{ fontWeight: 600 }}>Upcoming application deadlines</div>
            {!timelineSummary?.upcomingDeadlines?.length ? (
              <div className="note">None on file yet. Add deadlines in Application Pathways.</div>
            ) : (
              <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                {timelineSummary.upcomingDeadlines.map((d) => (
                  <div key={d.eventId} className="note">
                    <strong>{d.collegeName}</strong>, {d.eventLabel || d.eventType}: {d.eventDate} ({d.nextOccurrenceIso})
                    {d.verificationStatus !== "Official source verified" && d.verificationStatus !== "User verified" ? <span style={{ color: "var(--amber)" }}> · needs verification</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="note" style={{ fontWeight: 600 }}>Timeline events needing verification</div>
            {!timelineSummary?.eventsNeedingVerification?.length ? (
              <div className="note">Nothing pending.</div>
            ) : (
              <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                {timelineSummary.eventsNeedingVerification.map((e) => (
                  <div key={e.eventId} className="note"><strong>{e.collegeName}</strong>, {e.eventType}: {e.eventDate || "no date yet"} ({e.verificationStatus})</div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="note" style={{ fontWeight: 600 }}>Essay prompts needing verification</div>
            {!essayPromptsNeedingVerification.length ? (
              <div className="note">Nothing pending.</div>
            ) : (
              <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                {essayPromptsNeedingVerification.slice(0, 10).map((p) => (
                  <div key={p.prompt_id} className="note"><strong>{p.college_name || "Unknown college"}</strong>, {p.essay_type} ({p.verification_status})</div>
                ))}
                {essayPromptsNeedingVerification.length > 10 && <div className="note">+ {essayPromptsNeedingVerification.length - 10} more</div>}
              </div>
            )}
          </div>
          <div>
            <div className="note" style={{ fontWeight: 600 }}>Colleges missing an application timeline</div>
            {!timelineSummary?.collegesMissingTimeline?.length ? (
              <div className="note">Every saved college has at least one timeline event.</div>
            ) : (
              <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                {timelineSummary.collegesMissingTimeline.map((c) => (
                  <div key={c.collegeId} className="row spread" style={{ gap: 8 }}>
                    <span className="note">{c.collegeName}</span>
                    <button className="btn ghost sm" onClick={() => onGo("applicationPathways", c.collegeId)}>Add timeline <Arrow /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
