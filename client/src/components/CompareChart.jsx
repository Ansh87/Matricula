// CompareChart.jsx - a dependency-free grouped bar chart comparing colleges
// across the same factors the weighted score uses. Missing data is drawn as a
// hollow slot labeled "n/a" rather than a zero bar, so absent data never looks
// like a bad score.
import React from "react";

const PALETTE = ["#1f3a5f", "#c08a3e", "#4a7c59", "#8b4a5f", "#5f6c7b"];

export function CompareChart({ factors, colleges, metricsFor }) {
  if (!colleges.length) return null;

  const W = 760, H = 300;
  const padL = 46, padR = 12, padT = 16, padB = 58;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const groupW = plotW / factors.length;
  const barW = Math.max(6, Math.min(28, (groupW - 14) / colleges.length));

  const yFor = (v) => padT + plotH - (v / 100) * plotH;

  return (
    <div className="card pad">
      <div className="row spread" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Side-by-side scores</h3>
        <span className="note">0–100 per factor · higher is better</span>
      </div>

      <div className="row wrap" style={{ gap: 12, marginBottom: 10 }}>
        {colleges.map((c, i) => (
          <div key={c.id} className="row" style={{ gap: 6, alignItems: "center" }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: "inline-block" }} />
            <span className="note" style={{ fontWeight: 600 }}>{c.name}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img"
        aria-label="Grouped bar chart comparing colleges across fit factors">
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="var(--line, #ddd)" strokeWidth="1" />
            <text x={padL - 8} y={yFor(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted, #888)">{t}</text>
          </g>
        ))}

        {factors.map(([key, label], gi) => {
          const gx = padL + gi * groupW;
          const groupCenter = gx + groupW / 2;
          const totalBarsW = colleges.length * barW;
          const startX = groupCenter - totalBarsW / 2;

          return (
            <g key={key}>
              {colleges.map((c, ci) => {
                const v = metricsFor(c.id)?.[key];
                const x = startX + ci * barW;
                if (v == null) {
                  // Absent data: hollow slot, not a zero bar.
                  return (
                    <g key={c.id}>
                      <rect x={x + 1} y={yFor(100)} width={barW - 2} height={plotH}
                        fill="none" stroke="var(--line, #ddd)" strokeDasharray="3 3" />
                      <text x={x + barW / 2} y={padT + plotH - 6} textAnchor="middle"
                        fontSize="9" fill="var(--muted, #aaa)" transform={`rotate(-90 ${x + barW / 2} ${padT + plotH - 6})`}>n/a</text>
                    </g>
                  );
                }
                const y = yFor(v);
                return (
                  <g key={c.id}>
                    <rect x={x + 1} y={y} width={barW - 2} height={padT + plotH - y}
                      fill={PALETTE[ci % PALETTE.length]} rx="2">
                      <title>{`${c.name} - ${label}: ${v}`}</title>
                    </rect>
                    {barW >= 16 && (
                      <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="var(--ink-900, #333)">{v}</text>
                    )}
                  </g>
                );
              })}
              <text x={groupCenter} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="var(--ink-900, #444)">
                {label}
              </text>
            </g>
          );
        })}

        {/* axis */}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="var(--ink-900, #444)" strokeWidth="1" />
      </svg>

      <div className="note" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
        Scores are estimates from official College Scorecard data and your profile. A dashed slot means the
        college doesn't publish that data - not a low score.
      </div>
    </div>
  );
}
