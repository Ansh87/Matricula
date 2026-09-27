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
import { Journey } from "./Journey.jsx";
import { Strategy } from "./Strategy.jsx";
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

  // The old separate welcome/landing screen was folded into this page, so the
  // dashboard now opens with that hero instead of living behind an extra
  // click. A family that hasn't filled anything in yet gets the welcome copy
  // and "Start your profile"; once there's a profile, the same banner turns
  // into their own plan header and points at Journey.
  const started = comp.pct > 0 || saved.length > 0;
  const roadmapRef = React.useRef(null);
  const scrollToRoadmap = () => roadmapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

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
              ? <button className="btn amber" onClick={scrollToRoadmap}>Continue your roadmap <Arrow /></button>
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

      {/* Journey and Strategy, the two pages that used to live under Plan,
          render here. This is the home page for a reason: the roadmap and the
          list-balance read-out are what a family wants on opening the app,
          not one more click away.

          The cards that used to sit here (a pointer to Journey, a list-balance
          summary, and four tiles for verification items / upcoming deadlines /
          essay workload / final list health) are all gone: Journey carries its
          own deadline and verification block, Strategy carries the real
          list-balance analysis, and "Next recommended actions" below already
          raises every one of those four as an action when it matters. */}
      <div ref={roadmapRef}>
        <Journey studentId={studentId} profile={profile} saved={saved} onGo={onGo} />
      </div>

      <Strategy studentId={studentId} profile={profile} onGo={onGo} />

      <div className="note" style={{ paddingTop: 4 }}>
        Planning aid only, not a guarantee.{" "}
        <button className="link" onClick={() => onGo("about")}>How it works and the full disclaimer <Arrow /></button>
      </div>
    </div>
  );
}
