// Careers.jsx - major → BLS occupations. Median pay + projected growth are
// official BLS; AI-impact / grad-school notes are labeled Estimated.
import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { SourceBadge, Spinner, ErrorNote, fmtUSD } from "./ui.jsx";

export function Careers({ profileInterests }) {
  const [majors, setMajors] = useState([]);
  const [sel, setSel] = useState(profileInterests?.[0] || "Computer Science");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { api.majors().then((r) => setMajors(r.majors)).catch(() => {}); }, []);
  const load = (m) => { setErr(null); setData(null); api.major(m).then(setData).catch(setErr); };
  useEffect(() => { load(sel); }, [sel]);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Careers & outcomes</div>
        <h1>Where a major can lead</h1>
        <p className="lead">Pay and growth figures come straight from the U.S. Bureau of Labor Statistics
          Occupational Outlook Handbook. Salaries are national medians and estimates, not guarantees.</p>
      </div>

      <div className="chips">
        {majors.map((m) => (
          <span key={m} className={`chip ${sel === m ? "on" : ""}`} onClick={() => setSel(m)}>{m}</span>
        ))}
      </div>

      {err && <ErrorNote onRetry={() => load(sel)}>{err.message}</ErrorNote>}
      {!data && !err && <Spinner label="Loading BLS data…" />}

      {data && (
        <>
          <div className="card pad">
            <div className="row spread wrap">
              <div>
                <h2>{data.major}</h2>
                <div className="note">Typical salary range: <span className="mono">{data.salaryRange}</span></div>
              </div>
              <SourceBadge level="official">BLS {data.sourceYear}</SourceBadge>
            </div>
          </div>

          <div className="grid cols-2">
            {data.careers.map((c) => (
              <div key={c.blsCode} className="card pad">
                <div className="row spread">
                  <h3>{c.occupation}</h3>
                  <SourceBadge level="official" />
                </div>
                <div className="field"><span className="k">Median pay (national)</span><span className="v">{fmtUSD(c.medianPay)}</span></div>
                <div className="field"><span className="k">Projected growth</span><span className="v" style={{ fontSize: 13.5 }}>{c.growth}</span></div>
                <div className="field"><span className="k">Typical entry education</span><span className="v" style={{ fontSize: 13.5 }}>{c.entryEducation}</span></div>
                <div className="note" style={{ marginTop: 6 }}>BLS code {c.blsCode} · {c.scope} · Source: BLS OOH {c.sourceYear}</div>
              </div>
            ))}
          </div>

          <div className="card pad grid cols-2">
            <div>
              <div className="row spread"><h3>AI outlook</h3><SourceBadge level="estimated" /></div>
              <p className="note" style={{ marginTop: 6 }}>{data.aiImpact}</p>
            </div>
            <div>
              <div className="row spread"><h3>Graduate school</h3><SourceBadge level="estimated" /></div>
              <p className="note" style={{ marginTop: 6 }}>{data.gradSchoolNeed}</p>
            </div>
          </div>

          <div className="disclaimer">{data.disclaimer}</div>
        </>
      )}
    </div>
  );
}
