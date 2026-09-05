// CareerPlanner.jsx - a decision aid for future-safe career tracks. Content is
// balanced (no "AI will take all jobs"). All track content is driven from the
// scenario catalog (GET /api/colleges/scenarios) - the SAME source Matches uses
// - so names, roles, majors, skills, risks, projects, and BLS source notes can
// never drift away from Matches. There is NO separate hardcoded track list here.
//
// This is a reference view. It does NOT touch scoring, Matches, scenario logic,
// Balanced List, Best Fit, Browse, Profile, or document parsing.
import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { SourceBadge, Spinner } from "./ui.jsx";

// A small labeled list block (only renders when the catalog provides items).
function MetaList({ label, items, color }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="k" style={{ fontSize: 11 }}>{label}</div>
      <ul className="note" style={{ fontSize: 12.5, margin: "4px 0 0", paddingLeft: 18, color: color || undefined }}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

export function CareerPlanner() {
  const [scenarios, setScenarios] = useState([]);
  const [selId, setSelId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Everything comes from the scenario catalog Matches uses - single source.
  useEffect(() => {
    let cancelled = false;
    api.scenarios()
      .then((r) => {
        if (cancelled) return;
        const list = r.scenarios || [];
        setScenarios(list);
        setSelId((prev) => prev || r.defaultScenario || list[0]?.id || null);
      })
      .catch(() => { if (!cancelled) setScenarios([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = scenarios.find((s) => s.id === selId) || null;

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Career planning</div>
        <h1>Future-safe career tracks</h1>
        <p className="lead">A balanced guide to where computing and engineering careers are heading - and how to
          combine a technical core with a hard-to-automate domain. Choose a career track to see roles, majors,
          skills, risks, and projects. For personalized recommendations, use Advisor or Matches.</p>
      </div>

      {/* Career Market Overview - high level, source-labeled */}
      <div className="card pad">
        <div className="row spread"><h2>Career market overview</h2><SourceBadge level="official">BLS OOH 2024–34</SourceBadge></div>
        <p className="note" style={{ marginTop: 8, fontSize: 13.5 }}>
          AI and automation are increasing demand for people who can <strong>build, evaluate, secure, and apply</strong>
          {" "}intelligent systems. Roles that apply computing or engineering to a real domain are projected to grow
          quickly, while routine coding is more exposed.
        </p>
        <p className="note" style={{ marginTop: 8, fontSize: 13.5 }}>
          AI is changing entry-level coding work, so the safer strategy is <strong>not</strong> to avoid CS. The safer
          strategy is to combine a technical core with a hard-to-automate domain such as data science, cybersecurity,
          finance/quant, systems/EECS, math/statistics, applied physics, or an engineering discipline.
        </p>
      </div>

      {/* Interactive track selector - names come from the catalog */}
      <div className="card pad">
        <label className="lbl">Choose a career track</label>
        <p className="note" style={{ marginTop: 2, marginBottom: 8 }}>
          These are the same tracks you can select in <strong>Matches</strong>. Pick one to see the full breakdown.
        </p>
        {loading && <Spinner label="Loading career tracks…" />}
        {!loading && (
          <div className="chips">
            {scenarios.map((s) => (
              <span key={s.id} className={`chip ${selId === s.id ? "on" : ""}`} onClick={() => setSelId(s.id)}>{s.scenarioName}</span>
            ))}
          </div>
        )}
      </div>

      {/* Selected-track detail - 100% from catalog metadata */}
      {selected && (
        <div className="card pad">
          <div className="row spread wrap" style={{ gap: 8, alignItems: "flex-start" }}>
            <h2 style={{ maxWidth: "70%" }}>{selected.scenarioName}</h2>
            {selected.sourceNotes && selected.sourceNotes.length > 0 && <SourceBadge level="official">BLS</SourceBadge>}
          </div>
          {selected.description && <p className="note" style={{ marginTop: 4, fontSize: 13.5 }}>{selected.description}</p>}

          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <div>
              <div className="k" style={{ fontSize: 11 }}>What it means</div>
              <p className="note" style={{ fontSize: 12.5 }}>
                Primary <strong>{selected.primaryField}</strong>, with <strong>{selected.secondaryField}</strong>
                {selected.supportingFields && selected.supportingFields.length ? <> and supporting depth in {selected.supportingFields.join(", ")}.</> : "."}
              </p>
              {selected.careerIntent && (
                <><div className="k" style={{ fontSize: 11, marginTop: 8 }}>Career intent</div>
                  <p className="note" style={{ fontSize: 12.5 }}>{selected.careerIntent}</p></>
              )}
              <MetaList label="Example future roles" items={selected.futureRoles} />
              <MetaList label="Recommended majors" items={selected.recommendedMajors} />
              <MetaList label="Double-major ideas" items={selected.doubleMajorIdeas} />
            </div>
            <div>
              <MetaList label="Skills to build" items={selected.skillsToBuild} />
              <MetaList label="Suggested projects" items={selected.projectIdeas} />
              <MetaList label="Risks / cautions" items={selected.risks} color="var(--reach)" />
              {selected.riskHedge && (
                <><div className="k" style={{ fontSize: 11, marginTop: 8 }}>Why it may be future-safe</div>
                  <p className="note" style={{ fontSize: 12.5 }}>{selected.riskHedge}</p></>
              )}
            </div>
          </div>

          {/* Source-labeled BLS outlook notes */}
          {selected.sourceNotes && selected.sourceNotes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="k" style={{ fontSize: 11 }}>Projected demand - source-labeled outlook</div>
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                {selected.sourceNotes.map((n, i) => (
                  <span key={i} className="pill" style={{ background: "var(--safety-b)" }}>
                    {n.occupation}: {n.growth} ({n.projectionPeriod}) · {n.source}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="row spread" style={{ marginTop: 10, alignItems: "center" }}>
            <span className="note" style={{ fontSize: 11 }}>Future-safety signal & risk/caution are directional, not guarantees.</span>
            <span className="note" style={{ fontSize: 11 }}>
              Select "{selected.scenarioName}" in <strong>Matches</strong> to rank colleges for this track.
            </span>
          </div>
        </div>
      )}

      <div className="disclaimer">
        Career outlooks are projections, not guarantees. Students should verify current data and combine market trends
        with personal strengths, college fit, internships, projects, and long-term interests. Sources: U.S. Bureau of
        Labor Statistics Occupational Outlook Handbook (OOH), 2024–34 employment projections; U.S. Department of
        Education College Scorecard for program-level cost and earnings outcomes where available.
      </div>
    </div>
  );
}
