// SavedList.jsx - the student's SAVED colleges (persisted). Distinct from
// "Matches" (live recommendations). Always shows what you've saved, so the tab
// is never mysteriously blank.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { CategoryTag, SetupPlanningButton, InlineSpinner, fmtPct, fmtUSD } from "./ui.jsx";

function safeParseArray(json) {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}

const norm = (s) => String(s || "").toLowerCase().trim();
function verificationKey(collegeId, primary, secondary) { return `${collegeId}::${norm(primary)}::${norm(secondary)}`; }

export function SavedList({ studentId, saved, profile, onOpen, onRemove, onClearAll, onEvaluated }) {
  // Issue 2: "Evaluate Against My Profile" -- re-scores every college
  // already on My List against the CURRENT student profile, using the exact
  // same scoring/classification logic every other page uses (server route
  // POST /students/:id/list/evaluate). Never invents missing data: colleges
  // whose official data couldn't be checked keep their existing score and
  // are called out as "needs review" instead of being guessed at.
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const runEvaluate = async () => {
    if (evaluating) return;
    setEvaluating(true); setEvalError(null);
    try {
      const r = await api.evaluateMyList(studentId, profile || {});
      onEvaluated && onEvaluated(r.list || []);
      setEvalResult({
        updated: r.updated || 0, needsReview: r.needsReview || 0,
        missingAdmissions: r.missingAdmissions || 0, missingCost: r.missingCost || 0,
        programVerificationNeeded: r.programVerificationNeeded || 0,
      });
    } catch (e) {
      // Keep whatever My List already had on screen -- a failed evaluation
      // never clears or corrupts existing data.
      setEvalError(e.message || "Couldn't evaluate your list against your profile right now. Your saved colleges are unchanged.");
    } finally {
      setEvaluating(false);
    }
  };
  // Official double-major confirmation records (see services/doubleMajorVerification.js).
  // Joined against each saved college's pathway(s) purely for badge/field display --
  // never mutates what's stored on student_college_list itself.
  const [dmVerifications, setDmVerifications] = useState([]);
  useEffect(() => {
    if (!studentId) return;
    api.listDoubleMajorVerifications(studentId).then((r) => setDmVerifications(r.verifications || [])).catch(() => {});
  }, [studentId]);
  const dmVerByKey = new Map(dmVerifications.map((v) => [verificationKey(v.college_id, v.primary_program_requested, v.secondary_program_requested), v]));

  if (!saved.length) {
    return (
      <div className="empty">
        Your saved list is empty. Go to <strong>Matches</strong> or <strong>Top STEM</strong> and tap
        <span className="pill" style={{ margin: "0 4px" }}>+ List</span> on colleges you like - they'll appear here and in your Tracker.
      </div>
    );
  }
  const byCat = { Reach: [], Target: [], Safety: [], Unknown: [] };
  saved.forEach((s) => { (byCat[s.category] || byCat.Unknown).push(s); });

  // Client-side export -- the full list is already in memory (no extra round
  // trip needed), same csvEscape approach Compare.jsx uses.
  const csvEscape = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const exportCsv = () => {
    const headers = [
      "College", "City", "State", "Category", "Admission probability", "Overall fit score", "Status",
      "Source context", "Selection contexts", "Primary major", "Secondary major",
      "Double-major status", "Double-major verification status",
      "Primary program requested", "Secondary program requested",
      "Primary official program name", "Secondary official program name",
      "Primary program type", "Secondary program type",
      "Double-major policy type", "Double-major allowed status",
      "Source URL", "Last checked",
      "Import batch ID", "Original uploaded name", "Matched official name", "Match confidence",
      "Admission category at import", "Profile score at import", "Verification status", "Action needed",
    ];
    const lines = [headers.join(",")];
    for (const s of saved) {
      const contexts = safeParseArray(s.selection_contexts_json);
      const ver = s.primary_major ? dmVerByKey.get(verificationKey(s.college_id, s.primary_major, s.secondary_major)) : null;
      const confirmed = !!ver?.confirmed;
      const dmActionNeeded = s.primary_major && !confirmed ? "Verify double-major rules" : "";
      const importActionNeeded = s.import_batch_id && (s.match_confidence === "Medium confidence" || s.match_confidence === "Low confidence") ? "Verify official college match" : "";
      lines.push([
        s.college_name || s.name || s.college_id, s.city, s.state, s.category,
        s.admission_probability_range, s.overall_fit_score, s.status,
        s.source_context || "Selected manually", contexts.join("; "),
        s.primary_major, s.secondary_major, s.double_major_status, s.double_major_verification_status,
        s.primary_major || "", s.secondary_major || "",
        ver?.primary_official_program_name || "", ver?.secondary_official_program_name || "",
        ver?.primary_program_type || "", ver?.secondary_program_type || "",
        ver?.double_major_policy_type || "", ver?.double_major_allowed_status || "",
        ver?.source_url || "", ver?.last_checked || "",
        s.import_batch_id || "", s.original_uploaded_name || "", s.matched_official_name || "", s.match_confidence || "",
        s.admission_category_at_import || "", s.profile_score_at_import ?? "", s.status || "",
        [dmActionNeeded, importActionNeeded].filter(Boolean).join("; "),
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `my-college-list-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <div className="row spread wrap">
        <div>
          <div className="eyebrow">Saved</div>
          <h1>My college list</h1>
          <p className="lead">The colleges you've saved. These feed your Compare, Tracker, and reports.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={runEvaluate} disabled={evaluating}>
            {evaluating ? "Evaluating…" : "Evaluate Against My Profile"}
          </button>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          {onClearAll && (
            <button className="btn ghost" style={{ color: "var(--reach)" }}
              onClick={() => { if (confirm(`Remove all ${saved.length} colleges from your list? Your profile and application tracker are NOT affected.`)) onClearAll(); }}>
              Clear my list
            </button>
          )}
        </div>
      </div>

      {evaluating && (
        <div className="card pad"><InlineSpinner /> Evaluating your college list against your profile...</div>
      )}
      {evalError && !evaluating && (
        <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>{evalError}</div>
      )}
      {evalResult && !evaluating && (
        <div className="card pad">
          <div className="note" style={{ fontWeight: 600, marginBottom: 4 }}>Evaluation complete</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill">Updated: {evalResult.updated}</span>
            <span className="pill">Needs review: {evalResult.needsReview}</span>
            <span className="pill">Missing admissions data: {evalResult.missingAdmissions}</span>
            <span className="pill">Missing cost data: {evalResult.missingCost}</span>
            <span className="pill">Program verification needed: {evalResult.programVerificationNeeded}</span>
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="n">{saved.length}</div><div className="l">Saved</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--reach)" }}>{byCat.Reach.length}</div><div className="l">▲ Reach</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--target)" }}>{byCat.Target.length}</div><div className="l">◆ Target</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--safety)" }}>{byCat.Safety.length}</div><div className="l">● Safety</div></div>
      </div>

      <div className="stack">
        {saved.map((s) => {
          const contexts = safeParseArray(s.selection_contexts_json);
          const pathways = safeParseArray(s.double_major_pathways_json);
          const isDoubleMajor = contexts.includes("Selected from Double Major Search") || !!s.primary_major;
          const isImported = contexts.includes("Added from Imported List") || !!s.import_batch_id;
          const importCorrected = isImported && s.original_uploaded_name
            && s.matched_official_name && s.original_uploaded_name.toLowerCase().trim() !== s.matched_official_name.toLowerCase().trim();
          return (
          <div key={s.college_id} className="card pad stack" style={{ gap: 8 }}>
            <div className="row spread">
              <div>
                <h3 style={{ marginBottom: 3 }}>{s.college_name || s.name || s.college_id}</h3>
                <div className="note">{[s.city, s.state].filter(Boolean).join(", ")}
                  {s.status ? ` · ${s.status}` : ""}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {s.category && <CategoryTag category={s.category} range={s.admission_probability_range} />}
                <button className="btn ghost sm" onClick={() => onOpen(s.college_id)}>Details</button>
                <button className="btn ghost sm" onClick={() => onRemove(s.college_id)}>Remove</button>
              </div>
            </div>

            {/* Same Fit/Admit/Est. cost/Major fit stat pills MatchCard shows --
                populated on save and kept current by "Evaluate Against My
                Profile" (below), so an imported or otherwise-added college
                shows exactly where it stands (fit, admit odds, cost) just
                like a college found through search. */}
            {(s.overall_fit_score != null || s.admission_rate != null || s.estimated_net_cost != null || s.major_fit_score != null) && (
              <div className="row wrap" style={{ gap: 6 }}>
                {s.overall_fit_score != null && <span className="pill">Fit {s.overall_fit_score}</span>}
                {fmtPct(s.admission_rate) && <span className="pill">Admit {fmtPct(s.admission_rate)}</span>}
                {fmtUSD(s.estimated_net_cost) && <span className="pill">Est. cost {fmtUSD(s.estimated_net_cost)}</span>}
                {s.major_fit_score != null && <span className="pill">Major fit {s.major_fit_score}</span>}
              </div>
            )}

            {isImported && (
              <div className="card pad" style={{ background: "var(--paper-2)", padding: 10 }}>
                <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                  <span className="pill" style={{ background: "var(--target-b)" }}>Imported List</span>
                  {s.match_confidence && <span className="note" style={{ fontSize: 11 }}>{s.match_confidence}</span>}
                </div>
                {s.original_uploaded_name && (
                  <div className="note" style={{ marginTop: 4 }}>
                    Original uploaded name: <strong>{s.original_uploaded_name}</strong>
                    {importCorrected && <span> · Matched official name: <strong>{s.matched_official_name}</strong></span>}
                  </div>
                )}
                <div className="note" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Added from imported list</div>
              </div>
            )}

            {(isDoubleMajor || contexts.length > 0) && (
              <div className="row wrap" style={{ gap: 6 }}>
                {isDoubleMajor && (() => {
                  // Feature 4: never show a plain "Double Major" badge. The badge
                  // reflects whichever pathway is furthest along -- confirmed beats
                  // in-progress beats bare interest -- across ALL of this college's
                  // saved pathways, not just the most-recently-added one.
                  const pList = pathways.length ? pathways : (s.primary_major ? [{ primaryMajor: s.primary_major, secondaryMajor: s.secondary_major }] : []);
                  const vers = pList.map((p) => dmVerByKey.get(verificationKey(s.college_id, p.primaryMajor, p.secondaryMajor)));
                  const anyConfirmed = vers.some((v) => v?.confirmed);
                  const anyInProgress = vers.some((v) => v && !v.confirmed);
                  const badge = anyConfirmed ? "Confirmed Double Major" : anyInProgress ? "Needs Double-Major Verification" : "Double-Major Interest";
                  const badgeBg = anyConfirmed ? "var(--safety-b)" : "var(--target-b)";
                  return <span className="pill" style={{ background: badgeBg }}>{badge}</span>;
                })()}
                {contexts.length > 1 && (
                  <span className="note" style={{ fontSize: 11 }}>Selected from: {contexts.join(", ")}</span>
                )}
              </div>
            )}

            {pathways.length > 0 && (
              <div className="card pad" style={{ background: "var(--paper-2)", padding: 10 }}>
                <div className="note" style={{ fontWeight: 600, marginBottom: 4 }}>Double-major fit</div>
                {pathways.map((p, i) => {
                  const ver = dmVerByKey.get(verificationKey(s.college_id, p.primaryMajor, p.secondaryMajor));
                  const confirmed = !!ver?.confirmed;
                  return (
                    <div key={`${p.primaryMajor}-${p.secondaryMajor}`} className="note" style={{ marginTop: i ? 10 : 0 }}>
                      {pathways.length > 1 && <strong>Pathway {i + 1}: </strong>}
                      <div>Primary requested: {p.primaryMajor} · Second requested: {p.secondaryMajor}</div>
                      <div>Official primary program: {ver?.primary_official_program_name || "Not verified"}</div>
                      <div>Official second program: {ver?.secondary_official_program_name || "Not verified"}</div>
                      <div>Double-major policy: {ver?.official_policy_name || "Not verified"}</div>
                      <div>Verification: {confirmed ? ver.verification_status : "Needs official source"}</div>
                      <div>Action: {confirmed ? "None -- confirmed" : "Verify double-major rules"}</div>
                    </div>
                  );
                })}
                <div className="note" style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                  College Scorecard confirms both fields exist, not that a formal double major is allowed -- confirm
                  with the college's advising office or catalog. Use the Double Major Search page's "Confirm with an
                  official source" action to record the official policy once you have it.
                </div>
              </div>
            )}

            {studentId && (
              <div>
                <SetupPlanningButton studentId={studentId} collegeId={s.college_id} collegeName={s.college_name || s.name || s.college_id} state={s.state} />
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
