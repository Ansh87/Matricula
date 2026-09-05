// Simulator.jsx - "what if" panel inside the college dossier. Toggle changes to
// the profile and see how the estimated category/probability/culture-fit shift.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { CategoryTag } from "./ui.jsx";

export function Simulator({ collegeId, profile }) {
  const [levers, setLevers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.simLevers().then((r) => setLevers(r.levers)).catch(() => {}); }, []);
  // initial baseline
  useEffect(() => { run([]); /* eslint-disable-next-line */ }, [collegeId]);

  const run = async (keys) => {
    if (!profile) return;
    setBusy(true);
    try { setResult(await api.simulate(collegeId, profile, keys)); }
    catch { /* keep prior */ }
    finally { setBusy(false); }
  };

  const toggle = (k) => {
    const next = selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k];
    setSelected(next); run(next);
  };

  if (!profile) return null;

  return (
    <div className="card pad">
      <div className="row spread"><h3>What-if admission simulator</h3>
        <span className="pill">estimate</span>
      </div>
      <p className="note" style={{ margin: "6px 0 12px" }}>
        Toggle changes to see how they shift your estimated fit at this college. Directional only - not a real admission decision.
      </p>

      <div className="chips" style={{ marginBottom: 14 }}>
        {levers.map((l) => (
          <span key={l.key} className={`chip ${selected.includes(l.key) ? "on" : ""}`} onClick={() => toggle(l.key)}>{l.label}</span>
        ))}
      </div>

      {result && (
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="card pad" style={{ background: "var(--paper-2)" }}>
            <div className="note" style={{ fontWeight: 600, marginBottom: 8 }}>Now</div>
            <CategoryTag category={result.before.category} label={result.before.label} range={result.before.range} />
            <div className="row" style={{ gap: 14, marginTop: 10 }}>
              <Stat k="Academic" v={result.before.academic} />
              <Stat k="Culture fit" v={result.before.cultureFit} />
            </div>
          </div>
          <div className="card pad" style={{ background: result.shifted ? "var(--safety-b)" : "#fff", borderColor: result.shifted ? "var(--safety)" : "var(--line-2)" }}>
            <div className="note" style={{ fontWeight: 600, marginBottom: 8 }}>
              With changes {busy && <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} />}
            </div>
            <CategoryTag category={result.after.category} label={result.after.label} range={result.after.range} />
            <div className="row" style={{ gap: 14, marginTop: 10 }}>
              <Stat k="Academic" v={result.after.academic} up={result.after.academic > result.before.academic} />
              <Stat k="Culture fit" v={result.after.cultureFit} up={(result.after.cultureFit ?? 0) > (result.before.cultureFit ?? 0)} />
            </div>
            {result.shifted && <div className="note" style={{ marginTop: 8, color: "var(--safety)", fontWeight: 600 }}>Category improved →</div>}
          </div>
        </div>
      )}

      {result?.earlyNote && <div className="note" style={{ marginTop: 10 }}>ℹ {result.earlyNote}</div>}
    </div>
  );
}

function Stat({ k, v, up }) {
  return (
    <div>
      <div className="note" style={{ fontSize: 11 }}>{k}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: up ? "var(--safety)" : "var(--ink-900)" }}>
        {v == null ? "-" : v}{up ? " ↑" : ""}
      </div>
    </div>
  );
}
