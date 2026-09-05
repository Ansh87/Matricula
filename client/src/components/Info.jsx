// Info.jsx - reference material: Careers (BLS data), Career Planner (future-safe
// tracks), and About (how it works).
import React, { useState } from "react";
import { Careers } from "./Careers.jsx";
import { CareerPlanner } from "./CareerPlanner.jsx";
import { About } from "./About.jsx";

export function Info({ profileInterests }) {
  const [sub, setSub] = useState("planner");
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${sub === "planner" ? "primary" : "ghost"}`} onClick={() => setSub("planner")}>Career Planner</button>
        <button className={`btn sm ${sub === "careers" ? "primary" : "ghost"}`} onClick={() => setSub("careers")}>Careers (BLS)</button>
        <button className={`btn sm ${sub === "about" ? "primary" : "ghost"}`} onClick={() => setSub("about")}>About</button>
      </div>
      {sub === "planner" && <CareerPlanner profileInterests={profileInterests} />}
      {sub === "careers" && <Careers profileInterests={profileInterests} />}
      {sub === "about" && <About />}
    </div>
  );
}
