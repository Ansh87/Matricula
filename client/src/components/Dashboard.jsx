// Dashboard.jsx - home overview: profile completeness, list balance, open
// verification items, upcoming deadlines, essay workload, final list health,
// and recommended next steps. Pulls together the whole app, the family
// command center. Every card below reads from data that already exists and
// is already computed elsewhere (Decision Plan summary, Verification
// Center, Decision Plan items). Nothing here is a new formula or a new
// fetch that duplicates logic; it's the same endpoints DecisionPlan.jsx
// already calls, just surfaced one level up. Anything that fails to load or
// comes back empty is shown as "Needs review," never guessed at.
import React, { useMemo, useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { CategoryTag } from "./ui.jsx";
import { Arrow, Check, CircleFilled, CircleOpen, Diamond, Triangle } from "./icons.jsx";

function completeness(p) {
  const checks = [
    ["Basics (state, grade)", !!p.state && !!p.grade],
    ["GPA", !!p.gpa],
    ["Test scores", !!p.sat || !!p.act],
    ["Course rigor / AP count", p.apCount != null],
    ["Intended majors", (p.interests || []).length > 0],
    ["Career goals", (p.careerGoals || []).length > 0],
    ["Budget", !!p.budget],
    ["Activities / experience", !!p.activitiesText || p.hasResearch || p.hasInternship || p.hasLeadership],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), checks };
}

export function Dashboard({ profile, saved, recs, studentId, onGo }) {
  const comp = useMemo(() => completeness(profile), [profile]);
  const byCat = useMemo(() => {
    const c = { Reach: 0, Target: 0, Safety: 0 };
    saved.forEach((s) => { if (c[s.category] != null) c[s.category]++; });
    return c;
  }, [saved]);

  // Balance guidance based on the saved list.
  const balanceNote = useMemo(() => {
    const total = saved.length;
    if (!total) return "You haven't saved any colleges yet. Generate matches and add a balanced set.";
    const tips = [];
    if (byCat.Safety < 2) tips.push("add 1-2 more safety schools you'd be happy to attend");
    if (byCat.Target < 3) tips.push("aim for 3-5 targets - they're the core of a strong list");
    if (byCat.Reach > 6) tips.push("you have a lot of reaches; make sure targets and safeties are solid");
    return tips.length ? "Suggestion: " + tips.join("; ") + "." : "Nice - your list looks reasonably balanced across reach, target, and safety.";
  }, [saved, byCat]);

  // Cross-page summary data (Verification Center, Decision Plan summary --
  // which already includes Final List Health, tasks due/overdue, and essay
  // coverage). Same endpoints DecisionPlan.jsx already uses; a failed fetch
  // leaves the field null/undefined, which every card below renders as
  // "Needs review" rather than a fabricated number.
  const [verification, setVerification] = useState(undefined);
  const [planSummary, setPlanSummary] = useState(undefined);
  const [decisionItems, setDecisionItems] = useState(undefined);
  useEffect(() => {
    if (!studentId) return;
    api.verificationCenter(studentId).then(setVerification).catch(() => setVerification(null));
    api.decisionPlanSummary(studentId).then(setPlanSummary).catch(() => setPlanSummary(null));
    api.listDecisionItems(studentId).then((r) => setDecisionItems(r.items || [])).catch(() => setDecisionItems(null));
  }, [studentId, saved.length]);

  // "Next recommended actions". Every condition below reuses a value
  // that's already computed above or by an existing backend summary (no new
  // thresholds invented for this dashboard). undefined = still loading,
  // null = failed to load ("Needs review"); both are handled explicitly.
  const nextActions = useMemo(() => {
    const actions = [];
    if (comp.pct < 100) actions.push({ label: "Profile incomplete", detail: `${comp.pct}% complete`, go: "profile" });
    if (!saved.length) actions.push({ label: "No colleges saved yet", detail: "Run Matches or Browse Colleges to start a list", go: "matches" });

    if (verification === null) actions.push({ label: "Verification items", detail: "Needs review - couldn't load", go: "decisionPlan" });
    else if (verification && verification.totalItems > 0) actions.push({ label: "Verification items open", detail: `${verification.totalItems} open item(s)`, go: "decisionPlan" });

    if (planSummary === null) actions.push({ label: "Deadlines", detail: "Needs review - couldn't load", go: "decisionPlan" });
    else if (planSummary) {
      if (planSummary.tasks?.overdue > 0) actions.push({ label: "Tasks overdue", detail: `${planSummary.tasks.overdue} overdue`, go: "decisionPlan" });
      else if (planSummary.tasks?.dueSoon > 0) actions.push({ label: "Upcoming deadlines", detail: `${planSummary.tasks.dueSoon} due in the next 14 days`, go: "decisionPlan" });
      if (planSummary.essayCoverageMissing > 0) actions.push({ label: "Essay prompts missing", detail: `${planSummary.essayCoverageMissing} college(s) with no essays tracked`, go: "essays" });
      if (planSummary.timelineMissing > 0) actions.push({ label: "Application timeline missing", detail: `${planSummary.timelineMissing} college(s)`, go: "applicationPathways" });
      // Only flag the final list once there IS one. With an empty Decision
      // Plan the health check reports "Not started", which used to surface
      // here as "Final list is too reach-heavy" - a complaint about a list
      // the family hasn't built yet. The label now carries the health
      // check's own first message instead of assuming reach-heaviness,
      // which was only ever one of the reasons it can need attention.
      const health = planSummary.finalListHealth;
      if (health && health.overallStatus && !["Strong balanced list", "Not started"].includes(health.overallStatus)) {
        actions.push({ label: "Final list needs attention", detail: health.messages?.[0] || health.overallStatus, go: "decisionPlan" });
      }
    }

    if (decisionItems === null) actions.push({ label: "Net price calculators (NPC)", detail: "Needs review - couldn't load", go: "decisionPlan" });
    else if (Array.isArray(decisionItems) && decisionItems.length) {
      const npcNotDone = decisionItems.filter((it) => it.college_id && !it.npc_completed).length;
      if (npcNotDone > 0) actions.push({ label: "NPC not completed", detail: `${npcNotDone} college(s)`, go: "decisionPlan" });
    }

    if (saved.length && byCat.Safety === 0) actions.push({ label: "Final list has no safety school", detail: "Add at least one you'd be happy to attend", go: "saved" });

    return actions;
  }, [comp.pct, saved.length, byCat.Safety, verification, planSummary, decisionItems]);

  // The old separate welcome/landing screen was folded into this page, so the
  // dashboard now opens with that hero instead of living behind an extra
  // click. A family that hasn't filled anything in yet gets the welcome copy
  // and "Start your profile"; once there's a profile, the same banner turns
  // into their own plan header and points at Journey.
  const started = comp.pct > 0 || saved.length > 0;

  return (
    <div className="stack">
      <div className="banner">
        <div className="hero-content">
          <div className="eyebrow">College planning, grounded in data</div>
          <h1>{profile.name ? `${profile.name}'s plan` : (started ? "Your college plan" : "College planning, backed by real data.")}</h1>
          <p className="lead">{started
            ? "A quick snapshot: your profile, your list balance, and where things stand."
            : "Find colleges that fit your profile, explore majors and career outcomes, and manage your application plan, using trusted U.S. education and labor data."}</p>
          <div className="row wrap" style={{ marginTop: 14, gap: 14 }}>
            {started
              ? <button className="btn amber" onClick={() => onGo("journey")}>Continue your Journey <Arrow /></button>
              : <button className="btn amber" onClick={() => onGo("profile")}>Start your profile <Arrow /></button>}
            <button className="btn ghost" onClick={() => onGo("about")} style={{ color: "#dbe6ef", borderColor: "#3a5670" }}>How it works</button>
          </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="n">{comp.pct}%</div><div className="l">Profile complete</div></div>
        <div className="kpi"><div className="n">{saved.length}</div><div className="l">Colleges saved</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{byCat.Reach}</div><div className="l"><Triangle /> Reach</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{byCat.Target}</div><div className="l"><Diamond /> Target</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{byCat.Safety}</div><div className="l"><CircleFilled /> Safety</div></div>
      </div>

      <div className="card pad stack" style={{ background: "var(--paper-2)" }}>
        <div className="row spread" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ marginBottom: 2 }}>Your full step-by-step roadmap lives in Journey</h3>
            <p className="note">
              {["Profile", "Majors/Tracks", "Matches", "Program research", "Admission risk",
                "Course plan", "Strategy", "Final list", "Deadlines", "Export"].map((stage, i) => (
                <React.Fragment key={stage}>{i > 0 && <> <Arrow /> </>}{stage}</React.Fragment>
              ))}. Journey tracks real status for each stage from your own data.
            </p>
          </div>
          <button className="btn ghost" onClick={() => onGo("journey")}>Open Journey <Arrow /></button>
        </div>
      </div>

      <div className="card pad stack">
        <h3>Profile completeness</h3>
        {comp.checks.map(([label, ok]) => (
          <div key={label} className="row" style={{ gap: 8 }}>
            <span style={{ color: ok ? "var(--safety)" : "var(--muted)" }}>{ok ? <Check /> : <CircleOpen />}</span>
            <span className="note" style={{ color: ok ? "var(--ink-900)" : "var(--muted)" }}>{label}</span>
          </div>
        ))}
        {comp.pct < 100 && <button className="btn amber sm" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={() => onGo("profile")}>Finish profile <Arrow /></button>}
      </div>

      <div className="card pad stack">
        <div className="row spread">
          <h3>List balance</h3>
          <button className="btn ghost sm" onClick={() => onGo("saved")}>View my list <Arrow /></button>
        </div>
        <p className="note">{balanceNote}</p>
        {saved.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {saved.slice(0, 8).map((s) => (
              <span key={s.college_id} className="pill" style={{ cursor: "default" }}>
                {s.college_name || s.college_id}{s.category ? ` · ${s.category}` : ""}
              </span>
            ))}
            {saved.length > 8 && <span className="note">+{saved.length - 8} more</span>}
          </div>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card pad stack">
          <div className="row spread"><h3>Open verification items</h3><button className="btn ghost sm" onClick={() => onGo("decisionPlan")}>Verification Center <Arrow /></button></div>
          {verification === undefined && <p className="note">Loading…</p>}
          {verification === null && <p className="note">Needs review - couldn't load right now.</p>}
          {verification && (
            <p className="note">{verification.totalItems > 0
              ? `${verification.totalItems} open item(s) across ${verification.totalColleges} college(s).`
              : "Nothing outstanding right now."}</p>
          )}
        </div>

        <div className="card pad stack">
          <div className="row spread"><h3>Upcoming deadlines</h3><button className="btn ghost sm" onClick={() => onGo("decisionPlan")}>Timeline & Tasks <Arrow /></button></div>
          {planSummary === undefined && <p className="note">Loading…</p>}
          {planSummary === null && <p className="note">Needs review - couldn't load right now.</p>}
          {planSummary && (
            <p className="note">
              {planSummary.tasks?.overdue > 0 && <strong style={{ color: "var(--reach)" }}>{planSummary.tasks.overdue} overdue. </strong>}
              {planSummary.tasks?.dueSoon > 0 ? `${planSummary.tasks.dueSoon} due in the next 14 days.` : (!planSummary.tasks?.overdue ? "Nothing due in the next 14 days." : "")}
              {planSummary.earliestUpcomingDeadline ? ` Earliest on file: ${planSummary.earliestUpcomingDeadline}.` : ""}
            </p>
          )}
        </div>

        <div className="card pad stack">
          <div className="row spread"><h3>Essay workload</h3><button className="btn ghost sm" onClick={() => onGo("essays")}>Essays <Arrow /></button></div>
          {planSummary === undefined && <p className="note">Loading…</p>}
          {planSummary === null && <p className="note">Needs review - couldn't load right now.</p>}
          {planSummary && (
            <p className="note">{planSummary.totalEssaysTracked ?? 0} essay(s) tracked.
              {planSummary.essayCoverageMissing > 0 ? ` ${planSummary.essayCoverageMissing} college(s) have none tracked yet.` : ""}</p>
          )}
        </div>

        <div className="card pad stack">
          <div className="row spread"><h3>Final list health</h3><button className="btn ghost sm" onClick={() => onGo("decisionPlan")}>Final List Health Check <Arrow /></button></div>
          {planSummary === undefined && <p className="note">Loading…</p>}
          {planSummary === null && <p className="note">Needs review - couldn't load right now.</p>}
          {planSummary && (!planSummary.finalListHealth || planSummary.finalListHealth.overallStatus === "Not started") && (
            <p className="note">Add colleges to your Decision Plan to see a health check.</p>
          )}
          {planSummary?.finalListHealth && planSummary.finalListHealth.overallStatus !== "Not started" && (
            <p className="note">
              <strong>{planSummary.finalListHealth.overallStatus}.</strong>{" "}
              {planSummary.finalListHealth.messages?.[0]}
            </p>
          )}
        </div>
      </div>

      <div className="card pad stack">
        <h3>Next recommended actions</h3>
        {(verification === undefined || planSummary === undefined || decisionItems === undefined) && !nextActions.length && (
          <p className="note">Loading…</p>
        )}
        {!nextActions.length && verification !== undefined && planSummary !== undefined && decisionItems !== undefined && (
          <p className="note">Nothing urgent right now - nice work.</p>
        )}
        {nextActions.map((a, i) => (
          <div key={i} className="row spread wrap" style={{ padding: "6px 0", borderBottom: i < nextActions.length - 1 ? "1px solid var(--line-2)" : "none", gap: 8 }}>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.label}</div><div className="note">{a.detail}</div></div>
            <button className="btn ghost sm" onClick={() => onGo(a.go)}>Open <Arrow /></button>
          </div>
        ))}
      </div>

      <div className="disclaimer">
        Planning aid only, not a guarantee. This dashboard summarizes your own entries and official data.
        Confirm deadlines, costs, and requirements with each college's official site.{" "}
        <button className="link" onClick={() => onGo("about")}>Read how it works &amp; the full disclaimer <Arrow /></button>
      </div>
    </div>
  );
}
