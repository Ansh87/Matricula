// CareerCenter.jsx - the single Careers page.
//
// This replaces what used to be two separate nav entries, "Career Planner"
// and "Careers (BLS)", which families had to know apart before they could
// pick one. They answer two halves of the same question, so they now sit
// behind one switch:
//
//   Career tracks -> forward-looking: where computing/engineering careers are
//                    heading, and which major + skill combinations get you
//                    there (driven by the same scenario catalog Matches uses).
//   Major to career -> backward-looking: pick a major, see the actual BLS
//                    occupations it feeds, with median pay and projected
//                    growth from the Occupational Outlook Handbook.
//
// Neither page's content changed. CareerPlanner.jsx and Careers.jsx are still
// the implementations; this only puts one door in front of both.
import React, { useState } from "react";
import { CareerPlanner } from "./CareerPlanner.jsx";
import { Careers } from "./Careers.jsx";

export function CareerCenter({ profileInterests }) {
  const [sub, setSub] = useState("tracks");

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Bureau of Labor Statistics pay and growth</div>
        <h1>Careers and outcomes</h1>
        <p className="lead">Two ways in: start from a career track and work back to the majors that feed it, or
          start from a major and see where it actually leads. Pay and growth figures throughout come from the
          U.S. Bureau of Labor Statistics.</p>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${sub === "tracks" ? "primary" : "ghost"}`} onClick={() => setSub("tracks")}>
          Career tracks
        </button>
        <button className={`btn sm ${sub === "majors" ? "primary" : "ghost"}`} onClick={() => setSub("majors")}>
          Major to career
        </button>
      </div>

      {sub === "tracks"
        ? <CareerPlanner />
        : <Careers profileInterests={profileInterests} />}
    </div>
  );
}
