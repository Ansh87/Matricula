// CollegeDetail.jsx - full dossier for one college. Official (Scorecard) fields
// on the left, manually-verified admissions fields on the right. ED/EA/RD rates
// show "Not publicly available" when the college doesn't officially publish them.
import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { DataField, SourceBadge, Spinner, ErrorNote, CategoryTag, fmtUSD, fmtPct, fmtNum } from "./ui.jsx";
import { Simulator } from "./Simulator.jsx";

function pctRound(v) { return v == null ? null : Math.round(v * 100) + "%"; }
function fixUrl(u) { return u ? (/^https?:/.test(u) ? u : `https://${u}`) : u; }

export function CollegeDetail({ collegeId, profile, onClose, onOpenOther, fallbackName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [fit, setFit] = useState(null);
  const [strategy, setStrategy] = useState(null);

  const [scored, setScored] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [deadlines, setDeadlines] = useState(null);

  const load = () => {
    setErr(null); setData(null); setFit(null); setStrategy(null); setScored(null); setSimilar([]); setDeadlines(null);
    api.college(collegeId).then(setData).catch(setErr);
    api.similarColleges(collegeId).then((r) => setSimilar(r.similar || [])).catch(() => {});
    api.collegeDeadlines(collegeId).then((r) => setDeadlines(r.available ? r : null)).catch(() => {});
    if (profile) {
      api.cultureFit(collegeId, profile).then(setFit).catch(() => {});
      api.majorStrategy(collegeId, profile.interests || []).then(setStrategy).catch(() => {});
      api.scoreOne(profile, collegeId).then((r) => setScored(r.scored)).catch(() => {});
    }
  };
  useEffect(() => { load(); }, [collegeId]);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const c = data?.college;
  const v = data?.verified;
  const displayName = (c && c.name) || fallbackName || "Loading…";

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ color: "#e9c987" }}>College dossier</div>
            <h2 style={{ color: "#fff" }}>{displayName}</h2>
            {c && <div className="note" style={{ color: "#b7c6d4", marginTop: 4 }}>
              {[c.city, c.state].filter(Boolean).join(", ")} · {c.controlType || "-"} · {c.region || ""}
            </div>}
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body stack">
          {err && <ErrorNote onRetry={load}>{err.message}</ErrorNote>}
          {!data && !err && <Spinner label="Fetching official data…" />}
          {data?.meta?.degraded && data?.note && (
            <div className="disclaimer" style={{ borderLeftColor: "var(--amber)" }}>{data.note}</div>
          )}

          {c && (
            <>
              <div className="grid cols-2">
                <div className="card pad">
                  <div className="row spread" style={{ marginBottom: 6 }}>
                    <h3>Official data</h3><SourceBadge level="official" />
                  </div>
                  <div className="note" style={{ marginBottom: 8 }}>Source: {c.source}, {c.sourceYear}</div>
                  <DataField label="Admission rate" value={fmtPct(c.admissionRate)} level="official" />
                  <DataField label="SAT midpoint" value={fmtNum(c.satMidpoint)} level="official" />
                  <DataField label="SAT range (25–75%)" value={c.sat25 && c.sat75 ? `${c.sat25}–${c.sat75}` : null} level="official" />
                  <DataField label="ACT midpoint" value={fmtNum(c.actMidpoint)} level="official" />
                  <DataField label="ACT range (25–75%)" value={c.act25 && c.act75 ? `${c.act25}–${c.act75}` : null} level="official" />
                  <DataField label="Test policy" value={c.testPolicy} level="official" />
                  <DataField label="Campus setting" value={c.setting} level="official" />
                  <DataField label="Student–faculty ratio" value={c.studentFacultyRatio ? `${c.studentFacultyRatio}:1` : null} level="official" />
                  <DataField label="Religious affiliation" value={c.religiousAffiliation} level="official" />
                  <DataField label="Average net price" value={fmtUSD(c.averageNetPrice)} level="official" />
                  <DataField label="Total cost of attendance" value={fmtUSD(c.costOfAttendance)} level="official" />
                  <DataField label="In-state tuition" value={fmtUSD(c.tuitionInState)} level="official" />
                  <DataField label="Out-of-state tuition" value={fmtUSD(c.tuitionOutOfState)} level="official" />
                  <DataField label="% with student loans" value={c.pctWithLoans != null ? `${c.pctWithLoans}%` : null} level="official" />
                  <DataField label="Graduation rate (150%)" value={pctRound(c.graduationRate)} level="official" />
                  <DataField label="Retention rate" value={pctRound(c.retentionRate)} level="official" />
                  <DataField label="Median earnings (10 yr)" value={fmtUSD(c.medianEarnings)} level="official" />
                  <DataField label="Median debt at graduation" value={fmtUSD(c.medianDebt)} level="official" />
                  <DataField label="Undergraduate size" value={fmtNum(c.size)} level="official" />
                  {c.netPriceCalculatorUrl && (
                    <div className="field">
                      <span className="k">Official net price calculator</span>
                      <a className="link" href={/^https?:/.test(c.netPriceCalculatorUrl) ? c.netPriceCalculatorUrl : `https://${c.netPriceCalculatorUrl}`} target="_blank" rel="noreferrer">Open on college site ↗</a>
                    </div>
                  )}
                </div>

                <div className="card pad">
                  <div className="row spread" style={{ marginBottom: 6 }}>
                    <h3>Admissions details</h3>
                    <SourceBadge level={v?.available ? (v.source?.confidence || "verified") : "unavailable"} />
                  </div>
                  {v?.available ? (
                    <>
                      {v.source?.url ? (
                        <div className="note" style={{ marginBottom: 8 }}>
                          Source: <a className="link" href={v.source.url} target="_blank" rel="noreferrer">official admissions site ↗</a>{v.source.year ? `, ${v.source.year}` : ""}{v.source.lastReviewed ? ` · reviewed ${v.source.lastReviewed}` : ""}
                        </div>
                      ) : null}
                      <DataField label="Testing policy" value={v.testingPolicy} level="verified" />
                      <DataField label="Rounds offered" level="verified"
                        value={v.rounds ? ([v.rounds.ed && "ED", v.rounds.ea && "EA", v.rounds.rea && "REA", v.rounds.rd && "RD"].filter(Boolean).join(" · ") || null) : null} />
                      <DataField label="ED acceptance rate" level="verified"
                        value={v.edAcceptanceRate != null ? fmtPct(v.edAcceptanceRate) : null}
                        na="Not publicly available - verify with the college’s admissions office" />
                      <DataField label="EA acceptance rate" level="verified"
                        value={v.eaAcceptanceRate != null ? fmtPct(v.eaAcceptanceRate) : null}
                        na="Not publicly available - verify with the college’s admissions office" />
                      <DataField label="RD acceptance rate" level="verified"
                        value={v.rdAcceptanceRate != null ? fmtPct(v.rdAcceptanceRate) : null}
                        na="Not publicly available - verify with the college’s admissions office" />
                      <DataField label="Recommendations" value={v.recommendationRequirements} level="verified" />
                      <DataField label="Essays" value={v.essayRequirements} level="verified" />
                      <DataField label="CSS Profile" value={v.cssProfileRequired} level="verified" />
                      <DataField label="Honors program" value={v.honorsProgram} level="verified" />
                      {v.applicationDeadlines && (
                        <div className="field">
                          <span className="k">Application deadlines</span>
                          <span className="v mono" style={{ fontSize: 13 }}>
                            {Object.entries(v.applicationDeadlines).map(([k, val]) => `${k}: ${val}`).join("  ·  ")}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="note">{v?.note || "No verified admissions profile on file. Verify details with the college’s official admissions office."}</div>
                  )}
                </div>
              </div>

              {deadlines && (
                <div className="card pad stack">
                  <div className="row spread">
                    <h3>Verified deadlines &amp; aid dates</h3>
                    <SourceBadge level={deadlines.confidence === "official" ? "official" : deadlines.confidence === "estimated" ? "estimated" : "verified"} />
                  </div>
                  {deadlines.applicationDeadlines && (
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                      {Object.entries(deadlines.applicationDeadlines).map(([round, date]) => (
                        <div key={round} className="card pad" style={{ background: "var(--paper-2)", padding: 10 }}>
                          <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{round}</div>
                          <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{date}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid cols-2" style={{ gap: 6 }}>
                    <DataField label="FAFSA priority" value={deadlines.fafsaPriorityDeadline} level="verified" />
                    <DataField label="CSS Profile" value={deadlines.cssProfileRequired === "yes" ? (deadlines.cssProfileDeadline || "Required") : deadlines.cssProfileRequired === "no" ? "Not required" : "Confirm"} level="verified" />
                    <DataField label="Scholarship deadline" value={deadlines.scholarshipDeadline} level="verified" />
                    <DataField label="Honors deadline" value={deadlines.honorsDeadline} level="verified" />
                    <DataField label="Portfolio deadline" value={deadlines.portfolioDeadline} level="verified" />
                    <DataField label="Interview deadline" value={deadlines.interviewDeadline} level="verified" />
                  </div>
                  {deadlines.notes && <p className="note">{deadlines.notes}</p>}
                  <div className="row wrap" style={{ gap: 10 }}>
                    {deadlines.deadlineSourceUrl && <a className="link" href={deadlines.deadlineSourceUrl} target="_blank" rel="noreferrer">Official deadlines ↗</a>}
                    {deadlines.fafsaSourceUrl && <a className="link" href={deadlines.fafsaSourceUrl} target="_blank" rel="noreferrer">Financial aid ↗</a>}
                    {deadlines.lastReviewed && <span className="note">Last reviewed: {deadlines.lastReviewed}</span>}
                  </div>
                  <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>{deadlines.disclaimer}</div>
                </div>
              )}

              {/* personalized recommendation: verdict, test advice, risks, improvements */}
              {scored && (
                <div className="card pad stack">
                  <div className="row spread">
                    <h3>Your personalized recommendation</h3>
                    {scored.verdict && <span className="pill" style={{ background: "var(--amber-b)", fontWeight: 600 }}>{scored.verdict.label}</span>}
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {scored.admission && <CategoryTag category={scored.admission.category} label={scored.admission.label} range={scored.admission.range} />}
                    {scored.round?.round && <span className="pill">Best round: {scored.round.round}</span>}
                    {scored.roi?.paybackYears != null && <span className="pill">ROI: {scored.roi.paybackYears}y payback</span>}
                  </div>
                  {scored.testAdvice && (
                    <div>
                      <div className="note" style={{ fontWeight: 600 }}>Should you submit test scores?</div>
                      <p className="note">{scored.testAdvice.text}</p>
                    </div>
                  )}
                  {scored.round?.why && <p className="note">{scored.round.why}</p>}
                  {scored.risks?.length > 0 && (
                    <div>
                      <div className="note" style={{ fontWeight: 600, color: "var(--reach)" }}>What makes it risky</div>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {scored.risks.map((r, i) => <li key={i} className="note">{r}</li>)}
                      </ul>
                    </div>
                  )}
                  {scored.improvements?.length > 0 && (
                    <div>
                      <div className="note" style={{ fontWeight: 600, color: "var(--safety)" }}>How to strengthen your application</div>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {scored.improvements.map((r, i) => <li key={i} className="note">{r}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="note" style={{ fontSize: 11, color: "var(--muted)" }}>Estimates from official data + your profile. Admissions are holistic and not guaranteed.</div>
                </div>
              )}

              <SelectionSection selection={data.selection} fit={fit?.cultureFit} strategy={strategy} scored={scored} />

              {/* Application timeline + apply link */}
              <div className="card pad">
                <div className="row spread" style={{ marginBottom: 8 }}>
                  <h3>When &amp; where to apply</h3>
                  <SourceBadge level={v?.available ? "verified" : "unavailable"} />
                </div>
                {v?.available && v.applicationDeadlines ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="note">Application rounds &amp; deadlines (confirm exact dates on the official site each year):</div>
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                      {Object.entries(v.applicationDeadlines).map(([round, date]) => (
                        <div key={round} className="card pad" style={{ background: "var(--paper-2)", padding: 12 }}>
                          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{round}</div>
                          <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{date}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="note">Application dates aren't on file for this college. Check the official admissions site for opening and closing dates.</div>
                )}
                <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                  {c.websiteUrl && (
                    <a className="btn amber sm" href={fixUrl(c.websiteUrl)} target="_blank" rel="noreferrer">College website ↗</a>
                  )}
                  {v?.available && v.source?.url && (
                    <a className="btn ghost sm" href={v.source.url} target="_blank" rel="noreferrer">Official admissions &amp; apply ↗</a>
                  )}
                  {c.netPriceCalculatorUrl && (
                    <a className="btn ghost sm" href={fixUrl(c.netPriceCalculatorUrl)} target="_blank" rel="noreferrer">Net price calculator ↗</a>
                  )}
                </div>
                <div className="note" style={{ marginTop: 8 }}>Applications are typically submitted through the Common App, Coalition App, or the college's own portal - follow the college website link to apply.</div>
              </div>

              {profile && <Simulator collegeId={collegeId} profile={profile} />}

              {similar.length > 0 && (
                <div className="card pad">
                  <h3 style={{ marginBottom: 8 }}>Similar colleges</h3>
                  <p className="note" style={{ marginBottom: 10 }}>Comparable selectivity - worth a look for a balanced list.</p>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
                    {similar.map((c) => (
                      <button key={c.id} className="card pad" style={{ textAlign: "left", cursor: "pointer", background: "var(--paper-2)", padding: 10 }} onClick={() => onOpenOther && onOpenOther(c.id)}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                        <div className="note">{c.state}{c.admissionRate != null ? ` · ${Math.round(c.admissionRate * 100)}% admit` : ""}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="disclaimer">
                Admissions are holistic and unpredictable; published data describes past classes, not your guaranteed
                outcome. Costs and aid vary by family - always confirm with each college’s official net price
                calculator. Fields marked “Data unavailable” are not published in our sources; we don’t estimate them.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// SelectionSection - "what this college wants, how it selects, culture fit, and
// which major to apply to." All from verified selection profiles; shows an
// honest empty state when a college has no profile yet.
const RATING_COLOR = { 4: "var(--reach)", 3: "var(--target)", 2: "var(--muted)", 1: "var(--faint)" };

function FactorBar({ f }) {
  return (
    <div className="row spread" style={{ padding: "5px 0", borderBottom: "1px dashed var(--line-2)" }}>
      <span style={{ fontSize: 13 }}>{f.label}</span>
      <span className="mono" style={{ fontSize: 11.5, color: RATING_COLOR[f.rating], fontWeight: 600 }}>{f.word}</span>
    </div>
  );
}

function SelectionSection({ selection, fit, strategy, scored }) {
  if (!selection?.available) {
    return (
      <div className="card pad">
        <div className="row spread"><h3>What this college wants</h3><SourceBadge level="unavailable" /></div>
        <p className="note" style={{ marginTop: 8 }}>{selection?.note || "No verified selection profile on file yet. Confirm on the college’s official admissions site and Common Data Set."}</p>
      </div>
    );
  }
  const s = selection;
  return (
    <div className="stack">
      <div className="row spread">
        <h2>What this college wants</h2>
        <SourceBadge level={s.source?.confidence || "verified"} />
      </div>

      {/* culture fit banner */}
      {fit && fit.score != null && (
        <div className="card pad" style={{ borderLeft: `4px solid ${fit.score >= 70 ? "var(--safety)" : fit.score >= 45 ? "var(--target)" : "var(--reach)"}` }}>
          <div className="row spread">
            <h3>Your culture &amp; selection fit</h3>
            <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: fit.score >= 70 ? "var(--safety)" : fit.score >= 45 ? "var(--target)" : "var(--reach)" }}>{fit.score}</span>
          </div>
          <p className="note" style={{ marginTop: 6 }}>{fit.summary}</p>
        </div>
      )}

      <div className="grid cols-2">
        <div className="card pad">
          <h3 style={{ marginBottom: 8 }}>How they select</h3>
          <p className="note">{s.howTheySelect}</p>
          <div className="divider" style={{ margin: "12px 0" }} />
          <div className="note" style={{ marginBottom: 6, fontWeight: 600 }}>What they weight (Common Data Set)</div>
          {(s.factors || []).filter((f) => f && f.rating >= 2).map((f) => <FactorBar key={f.key} f={f} />)}
        </div>

        <div className="card pad">
          <h3 style={{ marginBottom: 8 }}>What they look for</h3>
          <p className="note">{s.whatTheyWant}</p>
          {s.culture && (
            <>
              <div className="divider" style={{ margin: "12px 0" }} />
              <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>Culture</div>
              <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                {(s.culture.tags || []).map((t) => <span key={t} className="pill">{t}</span>)}
              </div>
              <p className="note">{s.culture.vibe}</p>
            </>
          )}
        </div>
      </div>

      {/* major strategy */}
      {strategy?.available && (
        <div className="card pad">
          <div className="row spread"><h3>Which major should you apply to?</h3>
            <span className={`pill`} style={{ background: strategy.appliesByMajor ? "var(--reach-b)" : "var(--safety-b)" }}>
              {strategy.appliesByMajor ? "Admits by major" : "Admits whole-school"}
            </span>
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            {strategy.strategy.map((p, i) => <li key={i} className="note" style={{ marginBottom: 6 }}>{p}</li>)}
          </ul>
          {strategy.switchMajor?.ease && (
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <span className="pill">Switch major later: {strategy.switchMajor.ease}</span>
            </div>
          )}
          <div className="disclaimer" style={{ marginTop: 12 }}>{strategy.honestNote}</div>
        </div>
      )}

      <div className="note">Selection data source: <a className="link" href={s.source?.url} target="_blank" rel="noreferrer">official admissions ↗</a>, {s.source?.year} · reviewed {s.source?.lastReviewed} · confidence: {s.source?.confidence}</div>
    </div>
  );
}
