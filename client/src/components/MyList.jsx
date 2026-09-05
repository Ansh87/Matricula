// MyList.jsx - the student's saved colleges, with side-by-side Compare folded
// in as a sub-view. Compare only ever operates on saved colleges, so it belongs
// here rather than as its own top-level tab.
import React, { useState } from "react";
import { SavedList } from "./SavedList.jsx";
import { Compare } from "./Compare.jsx";
import { ImportColleges } from "./ImportColleges.jsx";

export function MyList({ studentId, saved, profile, onOpen, onRemove, onClearAll, onImported, onEvaluated }) {
  const [sub, setSub] = useState("list");
  const canCompare = saved.length >= 2;

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
        <button className={`btn sm ${sub === "list" ? "primary" : "ghost"}`} onClick={() => setSub("list")}>
          My Colleges{saved.length ? ` (${saved.length})` : ""}
        </button>
        <button className={`btn sm ${sub === "import" ? "primary" : "ghost"}`} onClick={() => setSub("import")}>
          Import Colleges
        </button>
        <button className={`btn sm ${sub === "compare" ? "primary" : "ghost"}`}
          onClick={() => canCompare && setSub("compare")} disabled={!canCompare}
          title={canCompare ? "" : "Save at least 2 colleges to compare"}>
          Compare
        </button>
        {!canCompare && sub !== "import" && <span className="note" style={{ color: "var(--muted)" }}>Save 2+ colleges to compare them side by side.</span>}
      </div>

      {sub === "list" && (
        <SavedList studentId={studentId} saved={saved} profile={profile} onOpen={onOpen} onRemove={onRemove}
          onClearAll={onClearAll} onEvaluated={onEvaluated} />
      )}
      {sub === "import" && (
        <ImportColleges studentId={studentId} profile={profile} saved={saved}
          onImported={() => { onImported && onImported(); setSub("list"); }} />
      )}
      {sub === "compare" && <Compare saved={saved} profile={profile} />}
    </div>
  );
}
