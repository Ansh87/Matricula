// Applications.jsx - everything you have to *do* and *pay for*, in one tab:
//   College Applications  -> deadlines, status, tasks
//   Financial Aid & Scholarships -> FAFSA/CSS planner + scholarship tracker
import React, { useState } from "react";
import { Tracker } from "./Tracker.jsx";
import { FinancialAid } from "./FinancialAid.jsx";

export function Applications({ studentId, list, collegeNames, profile, onGo }) {
  const [sub, setSub] = useState("applications");

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        <button className={`btn sm ${sub === "applications" ? "primary" : "ghost"}`} onClick={() => setSub("applications")}>
          College Applications
        </button>
        <button className={`btn sm ${sub === "aid" ? "primary" : "ghost"}`} onClick={() => setSub("aid")}>
          Financial Aid &amp; Scholarships
        </button>
      </div>

      {sub === "applications"
        ? <Tracker studentId={studentId} list={list} collegeNames={collegeNames} onGo={onGo} />
        : <FinancialAid studentId={studentId} profile={profile} />}
    </div>
  );
}
