// Strategy.jsx - application strategy: list balance vs. ideal, issues to fix,
// best ED pick, test plan. Reads the saved list from the server.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Spinner } from "./ui.jsx";

function downloadReport(s, profile) {
  const lines = [];
  lines.push("Matricula - Application Strategy Report");
  lines.push(new Date().toLocaleDateString());
  if (profile.name) lines.push(`Student: ${profile.name}`);
  lines.push("");
  lines.push("LIST BALANCE");
  lines.push(s.summary);
  lines.push(`  Reach: ${s.counts.Reach} (ideal ${s.ideal.reach[0]}-${s.ideal.reach[1]})`);
  lines.push(`  Target: ${s.counts.Target} (ideal ${s.ideal.target[0]}-${s.ideal.target[1]})`);
  lines.push(`  Safety: ${s.counts.Safety} (ideal ${s.ideal.safety[0]}-${s.ideal.safety[1]})`);
  lines.push("");
  if (s.issues.length) {
    lines.push("RECOMMENDED ADJUSTMENTS");
    s.issues.forEach((i) => lines.push("  - " + i));
    lines.push("");
  }
  if (s.edPick) { lines.push("BEST EARLY DECISION PICK"); lines.push(`  ${s.edPick.name} - ${s.edPick.why}`); lines.push(""); }
  lines.push("TEST SUBMISSION PLAN"); lines.push("  " + s.testPlan); lines.push("");
  lines.push(`RECOMMENDED NUMBER OF APPLICATIONS: ~${s.recommendedApplications}`); lines.push("");
  lines.push(s.disclaimer);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "matricula-strategy-report.txt"; a.click();
  URL.revokeObjectURL(url);
}

export function Strategy({ studentId, profile, onGo }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edMsg, setEdMsg] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.strategy(studentId, profile).then(setS).catch(() => setS(null)).finally(() => setLoading(false));
  }, [studentId, profile]);

  const setAsEdPick = async () => {
    if (!s?.edPick?.collegeId) return;
    setEdMsg(null);
    try {
      const existing = await api.listDecisionItems(studentId).catch(() => ({ items: [] }));
      const match = (existing.items || []).find((it) => it.college_id === s.edPick.collegeId);
      if (match) {
        await api.updateDecisionItem(studentId, match.item_id, { applicationRound: "ED" });
      } else {
        await api.addDecisionItem(studentId, {
          collegeId: s.edPick.collegeId, collegeName: s.edPick.name,
          admissionCategory: s.edPick.category || undefined, applicationRound: "ED",
        });
      }
      setEdMsg({ ok: true, text: `Set ${s.edPick.name} to Early Decision in your Decision Plan.` });
    } catch (e) {
      setEdMsg({ ok: false, text: `Couldn't update Decision Plan: ${e.message}` });
    }
  };

  if (loading) return <div className="card pad"><Spinner label="Analyzing your list…" /></div>;
  if (!s) return <div className="empty">Save some colleges first, then come back for a strategy read-out.</div>;

  const Bar = ({ label, count, range, color }) => {
    const ok = count >= range[0] && count <= range[1];
    return (
      <div style={{ marginBottom: 10 }}>
        <div className="row spread"><span className="note">{label} <span style={{ color }}>({range[0]}–{range[1]} ideal)</span></span>
          <span className="mono" style={{ color: ok ? "var(--safety)" : "var(--reach)" }}>{count}{ok ? " ✓" : ""}</span></div>
        <div style={{ height: 8, background: "var(--line-2)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(count / (range[1] + 2) * 100, 100)}%`, height: "100%", background: color }} />
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Strategy</div>
        <h1>Your application strategy</h1>
        <p className="lead">How balanced your list is, what to adjust, and your best early-application play.</p>
        <div className="row wrap" style={{ gap: 10, marginTop: 8, alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => downloadReport(s, profile)}>Download strategy report</button>
          <span className="note">
            Looking for a "why this college / essay angle" writeup for one specific college? That's per-college
            in <button className="link" onClick={() => onGo && onGo("decisionPlan")}>Decision Plan</button> - this page is your whole-list balance.
          </span>
        </div>
      </div>

      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>List balance</h3>
        <p className="note" style={{ marginBottom: 14 }}>{s.summary}</p>
        <Bar label="Reach" count={s.counts.Reach} range={s.ideal.reach} color="var(--reach)" />
        <Bar label="Target" count={s.counts.Target} range={s.ideal.target} color="var(--target)" />
        <Bar label="Safety" count={s.counts.Safety} range={s.ideal.safety} color="var(--safety)" />
      </div>

      {s.issues.length > 0 && (
        <div className="card pad">
          <h3 style={{ marginBottom: 8, color: "var(--reach)" }}>Recommended adjustments</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {s.issues.map((i, n) => <li key={n} className="note" style={{ marginBottom: 6 }}>{i}</li>)}
          </ul>
        </div>
      )}

      {s.balanced && (
        <div className="card pad" style={{ borderLeft: "4px solid var(--safety)" }}>
          <strong style={{ color: "var(--safety)" }}>Your list looks well balanced.</strong>
          <p className="note" style={{ marginTop: 4 }}>Focus now on essays, deadlines (Tracker), and finalizing your application rounds.</p>
        </div>
      )}

      <div className="grid cols-2">
        {s.edPick && (
          <div className="card pad">
            <h3>Best Early Decision pick</h3>
            <div className="pill" style={{ background: "var(--amber-b)", margin: "8px 0" }}>{s.edPick.name}</div>
            <p className="note">{s.edPick.why}</p>
            {s.edPick.collegeId && (
              <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={setAsEdPick}>Set as ED in Decision Plan →</button>
            )}
            {edMsg && <div className="note" style={{ marginTop: 6, color: edMsg.ok ? "var(--safety)" : "var(--reach)" }}>{edMsg.text}</div>}
          </div>
        )}
        <div className="card pad">
          <h3>Test submission plan</h3>
          <p className="note">{s.testPlan}</p>
        </div>
        <div className="card pad">
          <h3>How many to apply to</h3>
          <p className="note">A focused list of about <strong>{s.recommendedApplications}</strong> well-chosen colleges is usually stronger than a scattershot 20+. Quality over quantity.</p>
        </div>
      </div>

      <div className="disclaimer">{s.disclaimer}</div>
    </div>
  );
}
