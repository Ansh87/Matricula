// Tracker.jsx - the real process manager. Per-saved-college application status,
// deadlines (blank until you enter real dates), student + parent notes, and a
// CSV export. Persists to the backend DB.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { fmtUSD } from "./ui.jsx";

const STATUS = ["Considering", "Planning to apply", "In progress", "Submitted", "Accepted", "Waitlisted", "Denied", "Committed"];
const YN = ["", "Not started", "In progress", "Done", "N/A"];
const ROUNDS = ["", "ED", "ED II", "EA", "REA", "RD", "Rolling"];

const FIELDS = [
  ["application_round", "Round", "select", ROUNDS],
  ["application_deadline", "App deadline", "date"],
  ["scholarship_deadline", "Scholarship deadline", "date"],
  ["fafsa_deadline", "FAFSA deadline", "date"],
  ["css_deadline", "CSS deadline", "date"],
  ["transcript_status", "Transcript", "select", YN],
  ["recommendation_status", "Recommendations", "select", YN],
  ["essay_status", "Main essay", "select", YN],
  ["supplement_status", "Supplements", "select", YN],
  ["interview_status", "Interview", "select", YN],
  ["submitted_status", "Submitted", "select", YN],
  ["decision_status", "Decision", "select", ["", "Pending", "Accepted", "Waitlisted", "Denied"]],
  ["final_net_cost", "Final net cost", "number"],
];

export function Tracker({ studentId, list, collegeNames, onGo }) {
  const [rows, setRows] = useState({});
  const [open, setOpen] = useState(null);
  // Read-only cross-reference to the Decision Plan's Final List, so a family
  // doesn't have to keep two separate application-round/decision statuses in
  // sync by hand -- both views are visible from either tab.
  const [decisionItems, setDecisionItems] = useState({});
  // Read-only cross-references to Application Pathways (platform) and Essay
  // Center (prompt counts), keyed by college_id -- same pattern as
  // decisionItems above: fetched here, never merged into the tracker's own rows.
  const [pathwaysByCollege, setPathwaysByCollege] = useState({});
  const [essayByCollege, setEssayByCollege] = useState({});

  useEffect(() => {
    api.getTracker(studentId).then((r) => {
      const map = {};
      (r.tracker || []).forEach((t) => { map[t.college_id] = t; });
      setRows(map);
    }).catch(() => {});
    api.listDecisionItems(studentId).then((r) => {
      const map = {};
      (r.items || []).forEach((it) => { if (it.college_id) map[it.college_id] = it; });
      setDecisionItems(map);
    }).catch(() => {});
    api.listRequirements(studentId).then((r) => {
      const map = {};
      for (const req of r.requirements || []) {
        if (!req.college_id) continue;
        const existing = map[req.college_id];
        if (!existing || (!req.program_label && existing.program_label)) map[req.college_id] = req;
      }
      setPathwaysByCollege(map);
    }).catch(() => {});
    api.listEssayPrompts(studentId).then((r) => {
      const map = {};
      for (const p of r.prompts || []) {
        if (!p.college_id) continue;
        if (!map[p.college_id]) map[p.college_id] = { total: 0, notStarted: 0 };
        map[p.college_id].total += 1;
        if ((p.status || "Not started") === "Not started") map[p.college_id].notStarted += 1;
      }
      setEssayByCollege(map);
    }).catch(() => {});
  }, [studentId]);

  const update = (cid, field, value) => {
    setRows((s) => {
      const next = { ...(s[cid] || {}), [field]: value, college_name: collegeNames[cid] || (s[cid] && s[cid].college_name) || cid };
      const merged = { ...s, [cid]: next };
      api.saveTracker(studentId, cid, next).catch(() => {});
      return merged;
    });
  };

  const exportCsv = () => {
    const headers = ["College", ...FIELDS.map((f) => f[1]), "Student notes", "Parent notes"];
    const lines = [headers.join(",")];
    for (const item of list) {
      const cid = item.college_id;
      const r = rows[cid] || {};
      const cells = [collegeNames[cid] || (rows[cid] && rows[cid].college_name) || cid, ...FIELDS.map((f) => r[f[0]] ?? ""), r.student_notes ?? "", r.parent_notes ?? ""];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "matricula-application-tracker.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!list.length) {
    return <div className="empty">Save colleges to your list first - then track applications here.</div>;
  }

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Process tracker</div>
          <h1>Applications</h1>
          <p className="lead">Enter your real deadlines from each college’s official site. Everything saves automatically.</p>
        </div>
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="disclaimer">Deadlines are blank until you enter them. Always confirm exact dates and required forms on each college’s official admissions and financial-aid pages.</div>

      <div className="note" style={{ padding: "0 2px" }}>
        This tab is your day-to-day application checklist (essays, recommendations, deadlines, submitted status). For
        each college's Reach/Target/Safety category, program verification, and major-specific risk, see{" "}
        <button className="link" onClick={() => onGo && onGo("decisionPlan")}>Decision Plan</button>.
      </div>

      <div className="stack">
        {list.map((item) => {
          const cid = item.college_id;
          const r = rows[cid] || {};
          const isOpen = open === cid;
          const dp = decisionItems[cid];
          return (
            <div key={cid} className="card">
              <div className="pad row spread" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : cid)}>
                <div>
                  <h3>{collegeNames[cid] || (rows[cid] && rows[cid].college_name) || cid}</h3>
                  <div className="note">{r.application_round || "No round set"} · {r.decision_status || "Decision pending"}</div>
                  {dp && (
                    <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                      Decision Plan: {dp.admission_category || "category not set"} · {dp.decision_status}
                      {dp.application_round && dp.application_round !== r.application_round ? ` · round set there: ${dp.application_round}` : ""}
                    </div>
                  )}
                  <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>
                    Application Pathways: {pathwaysByCollege[cid]?.platform_name || "Unknown -- needs verification"}
                    {" · Essay Center: "}
                    {essayByCollege[cid] ? `${essayByCollege[cid].total} tracked, ${essayByCollege[cid].notStarted} not started` : "none tracked yet"}
                  </div>
                </div>
                <select className="inp" style={{ width: 180 }} value={r.status || item.status || "Considering"}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => update(cid, "status", e.target.value)}>
                  {STATUS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>

              {isOpen && (
                <div className="pad" style={{ borderTop: "1px solid var(--line-2)" }}>
                  {dp && dp.application_round && r.application_round && dp.application_round !== r.application_round && (
                    <div className="disclaimer" style={{ borderLeftColor: "var(--amber)", marginBottom: 10 }}>
                      The application round set here ({r.application_round || "none"}) doesn't match the one in Decision
                      Plan ({dp.application_round}). Pick whichever is actually correct and update the other.
                    </div>
                  )}
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
                    {FIELDS.map(([key, label, type, opts]) => (
                      <div key={key}>
                        <label className="lbl">{label}</label>
                        {type === "select" ? (
                          <select className="inp" value={r[key] || ""} onChange={(e) => update(cid, key, e.target.value)}>
                            {opts.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
                          </select>
                        ) : (
                          <input className="inp" type={type} value={r[key] || ""} onChange={(e) => update(cid, key, e.target.value)} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid cols-2" style={{ marginTop: 14 }}>
                    <div>
                      <label className="lbl">Student notes</label>
                      <textarea className="inp" rows={3} value={r.student_notes || ""} onChange={(e) => update(cid, "student_notes", e.target.value)} placeholder="Why I like it, questions to ask, visit impressions…" />
                    </div>
                    <div>
                      <label className="lbl">Parent notes</label>
                      <textarea className="inp" rows={3} value={r.parent_notes || ""} onChange={(e) => update(cid, "parent_notes", e.target.value)} placeholder="Cost considerations, distance, family thoughts…" />
                    </div>
                  </div>
                  <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                    {dp && <button className="btn sm ghost" onClick={() => onGo && onGo("decisionPlan")}>Open in Decision Plan →</button>}
                    <button className="btn sm ghost" onClick={() => onGo && onGo("applicationPathways")}>Open in Application Pathways →</button>
                    <button className="btn sm ghost" onClick={() => onGo && onGo("essays")}>Open in Essay Center →</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
