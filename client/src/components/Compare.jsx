// Compare.jsx - side-by-side comparison of 2–5 saved colleges with adjustable
// weights, plus CSV export. Pulls live official data per college.
import React, { useState, useEffect, useMemo } from "react";
import { CompareChart } from "./CompareChart.jsx";
import { api } from "../lib/api.js";
import { SourceBadge, Spinner, fmtUSD, fmtPct } from "./ui.jsx";

const FACTORS = [
  ["overall", "Overall fit", 25],
  ["admit", "Admission odds", 20],
  ["cost", "Affordability", 20],
  ["career", "Career outcomes", 20],
  ["culture", "Culture fit", 15],
];

export function Compare({ saved, profile }) {
  const [picked, setPicked] = useState([]);
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState(Object.fromEntries(FACTORS.map(([k, , w]) => [k, w])));

  // default-select up to 3 saved colleges
  useEffect(() => {
    if (saved.length && !picked.length) setPicked(saved.slice(0, 3).map((s) => s.college_id));
  }, [saved]);

  // load live detail + fit for each picked college
  useEffect(() => {
    if (!picked.length) return;
    setLoading(true);
    Promise.all(picked.map(async (id) => {
      const out = { id };
      try { out.detail = await api.college(id); } catch { out.detail = null; }
      try { out.fit = await api.cultureFit(id, profile); } catch { out.fit = null; }
      try {
        const s = await api.scoreOne(profile, id);
        out.scored = s.scored;
      } catch { out.scored = null; }
      return out;
    })).then((results) => {
      const map = {};
      results.forEach((r) => { map[r.id] = r; });
      setRows(map);
    }).finally(() => setLoading(false));
  }, [picked, profile]);

  const toggle = (id) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p);

  // weighted score per college from its sub-metrics (0-100 each)
  const weighted = useMemo(() => {
    const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const out = {};
    for (const id of picked) {
      const r = rows[id]; if (!r?.scored) { out[id] = null; continue; }
      const metrics = {
        overall: r.scored.overall,
        admit: admitScore(r.scored.admission?.category),
        cost: costScore(r.scored.netCost, profile.budget),
        career: r.scored.subs?.career,
        culture: r.fit?.cultureFit?.score,
      };
      let sum = 0, w = 0;
      for (const [k] of FACTORS) if (metrics[k] != null) { sum += metrics[k] * weights[k]; w += weights[k]; }
      out[id] = w ? Math.round(sum / w) : null;
      out[`_metrics_${id}`] = metrics;   // keep the raw factor scores for the chart
    }
    return out;
  }, [picked, rows, weights, profile]);

  const best = useMemo(() => {
    let id = null, v = -1;
    for (const k of picked) if (weighted[k] != null && weighted[k] > v) { v = weighted[k]; id = k; }
    return id;
  }, [weighted, picked]);

  const nameOf = (id) => rows[id]?.detail?.college?.name || saved.find((s) => s.college_id === id)?.college_name || id;

  const exportCsv = () => {
    const cols = picked.map(nameOf);
    const lines = [["Metric", ...cols].join(",")];
    const push = (label, fn) => lines.push([label, ...picked.map((id) => `"${String(fn(id) ?? "").replace(/"/g, '""')}"`)].join(","));
    push("Weighted score", (id) => weighted[id]);
    push("Category", (id) => rows[id]?.scored?.admission?.label);
    push("Admit rate", (id) => fmtPct(rows[id]?.detail?.college?.admissionRate));
    push("Net price", (id) => fmtUSD(rows[id]?.scored?.netCost));
    push("Median earnings", (id) => fmtUSD(rows[id]?.detail?.college?.medianEarnings));
    push("Graduation rate", (id) => { const g = rows[id]?.detail?.college?.graduationRate; return g != null ? Math.round(g*100)+"%" : ""; });
    push("Culture fit", (id) => rows[id]?.fit?.cultureFit?.score);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "matricula-comparison.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!saved.length) return <div className="empty">Save some colleges to your list first, then compare them here.</div>;

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Compare</div>
          <h1>Compare colleges side by side</h1>
          <p className="lead">Pick 2–5 saved colleges. Adjust what matters to you and see a weighted comparison on live official data.</p>
        </div>
        <button className="btn ghost" onClick={exportCsv} disabled={!picked.length}>Export CSV</button>
      </div>

      <div className="card pad">
        <label className="lbl">Colleges to compare ({picked.length}/5)</label>
        <div className="chips">
          {saved.map((s) => (
            <span key={s.college_id} className={`chip ${picked.includes(s.college_id) ? "on" : ""}`} onClick={() => toggle(s.college_id)}>
              {s.college_name || s.college_id}
            </span>
          ))}
        </div>
      </div>

      {picked.length >= 2 && (
        <CompareChart
          factors={FACTORS.map(([k, label]) => [k, label])}
          colleges={picked.map((id) => ({ id, name: (saved.find((s) => s.college_id === id)?.college_name) || id }))}
          metricsFor={(id) => weighted[`_metrics_${id}`]}
        />
      )}

      <div className="card pad">
        <label className="lbl">What matters to you (weights auto-normalize)</label>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {FACTORS.map(([k, label]) => (
            <div key={k}>
              <div className="row spread"><span className="note">{label}</span><span className="mono" style={{ fontSize: 12 }}>{weights[k]}</span></div>
              <input type="range" min="0" max="40" value={weights[k]} onChange={(e) => setWeights((w) => ({ ...w, [k]: +e.target.value }))} style={{ width: "100%" }} />
            </div>
          ))}
        </div>
      </div>

      {loading && <div className="card pad"><Spinner label="Loading comparison…" /></div>}

      {!loading && picked.length > 0 && (
        <div className="card pad" style={{ overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr>
                <th>Metric</th>
                {picked.map((id) => (
                  <th key={id} style={{ color: id === best ? "var(--safety)" : undefined }}>
                    {nameOf(id)}{id === best ? " ★" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Weighted score</strong></td>
                {picked.map((id) => <td key={id}><strong className="mono" style={{ fontSize: 16, color: id === best ? "var(--safety)" : "var(--ink-900)" }}>{weighted[id] ?? "-"}</strong></td>)}
              </tr>
              <Row label="Category" picked={picked} val={(id) => rows[id]?.scored?.admission?.label} />
              <Row label="Admit rate" picked={picked} val={(id) => fmtPct(rows[id]?.detail?.college?.admissionRate) || "-"} />
              <Row label="SAT midpoint" picked={picked} val={(id) => rows[id]?.detail?.college?.satMidpoint ?? "-"} />
              <Row label="Net price" picked={picked} val={(id) => fmtUSD(rows[id]?.scored?.netCost) || "-"} />
              <Row label="Median earnings" picked={picked} val={(id) => fmtUSD(rows[id]?.detail?.college?.medianEarnings) || "-"} />
              <Row label="Graduation rate" picked={picked} val={(id) => { const g = rows[id]?.detail?.college?.graduationRate; return g != null ? Math.round(g*100)+"%" : "-"; }} />
              <Row label="Culture fit" picked={picked} val={(id) => rows[id]?.fit?.cultureFit?.score ?? "-"} />
            </tbody>
          </table>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <SourceBadge level="official">Scorecard</SourceBadge>
            <span className="note">★ = best weighted match for your priorities. Weighted score and culture fit are estimates.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, picked, val }) {
  return (
    <tr>
      <td>{label}</td>
      {picked.map((id) => <td key={id} className="mono" style={{ fontSize: 13 }}>{val(id)}</td>)}
    </tr>
  );
}

function admitScore(cat) {
  return cat === "Safety" ? 90 : cat === "Target" ? 65 : cat === "Reach" ? 30 : null;
}
function costScore(net, budget) {
  if (net == null || !budget) return null;
  const ratio = net / budget;
  if (ratio <= 0.7) return 100;
  if (ratio <= 1.0) return Math.round(100 - (ratio - 0.7) * 100);
  if (ratio <= 1.4) return Math.round(70 - (ratio - 1.0) * 100);
  return 20;
}
