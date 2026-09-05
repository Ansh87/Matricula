// ImportColleges.jsx - "Import College List": paste or upload a list of
// college names, review the matches (never auto-adding anything the app
// isn't confident about), then add the confirmed colleges to My List. Three
// steps: input -> review -> summary. Every college added here is scored with
// the exact same profile-scoring the rest of the app uses -- nothing here is
// a new formula.
import React, { useState, useRef } from "react";
import { api } from "../lib/api.js";
import { Spinner, InlineSpinner, SuccessNote, RestoredNote } from "./ui.jsx";
import { usePersistedSearch } from "../lib/persistedSearch.js";

const CONFIDENCE_COLOR = {
  "High confidence": "var(--safety-b)",
  "Medium confidence": "var(--target-b)",
  "Low confidence": "var(--amber-b)",
  "Ambiguous": "var(--amber-b)",
  "No match": "var(--reach-b)",
};

function ManualSearch({ onPick, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try { const r = await api.searchColleges({ name: q.trim() }); setResults(r.results || []); }
    catch { setResults([]); }
    finally { setBusy(false); }
  };
  return (
    <div className="card pad" style={{ marginTop: 6, background: "var(--paper)" }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <input className="inp" style={{ flex: 1, minWidth: 160 }} value={q} placeholder="Search official college name…"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn ghost sm" onClick={run} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
      {results && (
        results.length ? (
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {results.slice(0, 8).map((c) => (
              <button key={c.id} className="link" style={{ textAlign: "left" }} onClick={() => onPick(c)}>
                {c.name} - {[c.city, c.state].filter(Boolean).join(", ")}
              </button>
            ))}
          </div>
        ) : <div className="note" style={{ marginTop: 6 }}>No official colleges found for that search.</div>
      )}
    </div>
  );
}

export function ImportColleges({ studentId, profile, saved, onImported }) {
  const [step, setStep] = useState("input"); // input | review | summary
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const fileInputRef = useRef(null);

  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [batchId, setBatchId] = useState(null);
  // rows: one entry per original name, merging the match result with the
  // family's in-progress review decision.
  const [rows, setRows] = useState([]);
  const [manualSearchFor, setManualSearchFor] = useState(null); // originalName currently showing "Search manually"

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [summaryResult, setSummaryResult] = useState(null);

  // Issue 1: keep an in-progress review (pasted text, matched rows, batch id,
  // which step the family is on) if they navigate away and come back, rather
  // than losing the whole review and having to re-paste/re-match. Never
  // writes anything to My List by itself -- that still only happens when the
  // family explicitly confirms, exactly as before.
  const importSnapshot = { step, pasteText, batchId, rows, summaryResult };
  const { restoredFrom, clear } = usePersistedSearch(studentId, "importColleges", importSnapshot, (r) => {
    if (!r) return;
    if (r.step) setStep(r.step);
    if (r.pasteText !== undefined) setPasteText(r.pasteText);
    if (r.batchId !== undefined) setBatchId(r.batchId);
    if (r.rows !== undefined) setRows(r.rows);
    if (r.summaryResult !== undefined) setSummaryResult(r.summaryResult);
  });

  const savedIds = new Set((saved || []).map((s) => s.college_id));

  const rowFromMatch = (m) => {
    if (!m) return null;
    const base = { originalName: m.originalName, confidence: m.confidence, note: m.note || null, options: m.options || null };
    if (m.confidence === "High confidence") {
      const alreadySaved = savedIds.has(m.collegeId);
      return { ...base, action: "add", selected: true, collegeId: m.collegeId, officialName: m.matchedName,
        city: m.city, state: m.state, controlType: m.controlType, corrected: !!m.corrected, suggested: m.suggested, alreadySaved };
    }
    if (m.confidence === "Medium confidence") {
      const alreadySaved = savedIds.has(m.collegeId);
      return { ...base, action: "add", selected: true, collegeId: m.collegeId, officialName: m.matchedName,
        city: m.city, state: m.state, controlType: m.controlType, corrected: !!m.corrected, suggested: m.suggested, alreadySaved,
        needsConfirm: true };
    }
    if (m.confidence === "Ambiguous" || m.confidence === "Low confidence") {
      return { ...base, action: "needs_review", selected: false, collegeId: null, officialName: null };
    }
    return { ...base, action: "not_found", selected: false, collegeId: null, officialName: null };
  };

  const runParse = async (fromFile) => {
    if (parsing) return;
    setParsing(true); setParseError(null);
    try {
      const r = fromFile ? await api.importParseFile(studentId, fromFile) : await api.importParseText(studentId, pasteText);
      if (!r.names || !r.names.length) { setParseError("Couldn't find any college names in that list."); return; }
      await runMatch(r.names);
    } catch (e) {
      setParseError(e.message || "Couldn't read that list.");
    } finally {
      setParsing(false);
    }
  };

  const runMatch = async (names) => {
    setMatching(true); setMatchError(null);
    try {
      const r = await api.importMatch(studentId, names, profile?.state || null, profile);
      setBatchId(r.batchId);
      setRows((r.results || []).map(rowFromMatch).filter(Boolean));
      setStep("review");
    } catch (e) {
      setMatchError(e.message || "Couldn't check official college data right now.");
    } finally {
      setMatching(false);
    }
  };

  const updateRow = (originalName, patch) => {
    setRows((rs) => rs.map((r) => (r.originalName === originalName ? { ...r, ...patch } : r)));
  };

  const chooseOption = (originalName, opt) => {
    updateRow(originalName, {
      action: "add", selected: true, collegeId: opt.collegeId, officialName: opt.officialName,
      city: opt.city, state: opt.state, controlType: opt.controlType, corrected: true,
      suggested: opt.suggested, alreadySaved: savedIds.has(opt.collegeId),
    });
  };

  const pickManual = (originalName, college) => {
    updateRow(originalName, {
      action: "add", selected: true, collegeId: college.id, officialName: college.name,
      city: college.city, state: college.state, controlType: college.controlType, corrected: true, alreadySaved: savedIds.has(college.id),
    });
    setManualSearchFor(null);
  };

  const selectedCount = rows.filter((r) => r.action === "add" && r.selected).length;

  const confirmImport = async () => {
    if (confirming || !selectedCount) return;
    setConfirming(true); setConfirmError(null);
    try {
      const payload = rows.map((r) => ({
        originalName: r.originalName,
        action: r.action === "add" && r.selected ? "add" : (r.action === "not_found" ? "not_found" : (r.action === "add" ? "skip" : r.action)),
        collegeId: r.collegeId, officialName: r.officialName,
        matchConfidence: r.confidence, corrected: r.corrected,
        reason: r.note,
      }));
      const r = await api.importConfirm(studentId, { profile, batchId, rows: payload });
      setSummaryResult(r);
      setStep("summary");
      onImported && onImported();
    } catch (e) {
      setConfirmError(e.message || "Could not add these colleges right now.");
    } finally {
      setConfirming(false);
    }
  };

  const startOver = () => {
    setStep("input"); setPasteText(""); setRows([]); setBatchId(null);
    setSummaryResult(null); setParseError(null); setMatchError(null); setConfirmError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    clear();
  };

  return (
    <div className="stack">
      <div className="card pad">
        <h3 style={{ marginBottom: 4 }}>Import College List</h3>
        <p className="note">
          Paste a list of colleges, or upload a CSV or text file. We'll match each name to an official college,
          show you a review screen, and only add the ones you confirm - colleges we're not confident about are
          never added automatically.
        </p>
        <RestoredNote restoredFrom={restoredFrom} />
      </div>

      {step === "input" && (
        <div className="card pad stack" style={{ gap: 12 }}>
          <div>
            <label className="lbl">Paste college list</label>
            <textarea className="inp" rows={8} style={{ width: "100%", marginTop: 6, fontFamily: "inherit" }}
              placeholder={"CMU\nRutgers\nGeorgia Tech\nUIUC\nUCLA\nUC Berkley\nCornel\nMIT\nPrinceton\nCaltech"}
              value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
            <div className="note" style={{ marginTop: 4 }}>One college per line, or a comma-separated list. Short names, nicknames, and misspellings are OK.</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={!pasteText.trim() || parsing || matching} onClick={() => runParse(null)}>
              {(parsing || matching) ? <><InlineSpinner />Checking colleges…</> : "Match this list"}
            </button>
          </div>

          <div>
            <label className="lbl">Or upload a CSV or text file</label>
            <div className="note" style={{ marginBottom: 6 }}>
              A spreadsheet column named College, University, School, Name, or College Name works automatically.
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.txt,text/csv,text/plain"
              disabled={parsing || matching}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) runParse(f); }} />
          </div>

          {(parseError || matchError) && (
            <div className="disclaimer" style={{ borderLeftColor: "var(--reach)" }}>
              <strong>Couldn't check that list right now:</strong> {parseError || matchError}
            </div>
          )}
        </div>
      )}

      {(parsing || matching) && step === "input" && (
        <div className="card pad"><Spinner label="Matching each college name to an official record…" /></div>
      )}

      {step === "review" && (
        <div className="stack">
          <div className="card pad">
            <div className="row spread wrap" style={{ alignItems: "center" }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>Review before adding</h3>
                <p className="note">Check each match. High-confidence matches are pre-selected; everything else needs your choice.</p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost sm" onClick={startOver}>Start over</button>
                <button className="btn primary" disabled={!selectedCount || confirming} onClick={confirmImport}>
                  {confirming ? <><InlineSpinner />Adding…</> : `Add ${selectedCount} selected college${selectedCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
            {confirmError && <div className="note" style={{ color: "var(--reach)", marginTop: 6 }}>{confirmError}</div>}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {rows.map((r) => (
              <div key={r.originalName} className="card pad" style={{ background: "var(--paper-2)" }}>
                <div className="row spread wrap" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="note" style={{ fontSize: 11 }}>You entered</div>
                    <strong>{r.originalName}</strong>
                  </div>
                  <span className="pill" style={{ background: CONFIDENCE_COLOR[r.confidence] || "var(--paper-2)" }}>{r.confidence}</span>
                </div>

                {r.officialName && (
                  <div style={{ marginTop: 8 }}>
                    <div className="note" style={{ fontSize: 11 }}>Matched official college</div>
                    <div><strong>{r.officialName}</strong> {r.corrected && <span className="note">(corrected spelling)</span>}</div>
                    <div className="note">{[r.city, r.state].filter(Boolean).join(", ")}{r.controlType ? ` · ${r.controlType}` : ""}</div>
                    {r.suggested && (
                      <div className="note" style={{ marginTop: 2 }}>
                        Suggested category: <strong>{r.suggested.category === "Insufficient Data" ? "Admissions category needs review" : r.suggested.category}</strong>
                      </div>
                    )}
                    {r.alreadySaved && <div className="note" style={{ color: "var(--safety)", marginTop: 2 }}>Already in My List - we'll add "Also found in imported list" instead of a duplicate.</div>}
                  </div>
                )}

                {r.note && !r.officialName && <div className="note" style={{ marginTop: 6 }}>{r.note}</div>}

                {r.options && r.options.length > 0 && (
                  <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                    <div className="note" style={{ fontWeight: 600 }}>{r.confidence === "Ambiguous" ? "Choose the correct college:" : "Possible matches - choose one:"}</div>
                    {r.options.map((opt) => (
                      <button key={opt.collegeId || opt.officialName} className="link" style={{ textAlign: "left" }}
                        onClick={() => chooseOption(r.originalName, opt)}>
                        {opt.officialName}{opt.campusLabel ? ` (${opt.campusLabel})` : ""} - {[opt.city, opt.state].filter(Boolean).join(", ") || "state unknown"}
                        {opt.suggested ? ` · ${opt.suggested.category === "Insufficient Data" ? "needs review" : opt.suggested.category}` : ""}
                      </button>
                    ))}
                  </div>
                )}

                <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
                  {r.action === "add" && (
                    <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r.originalName, { selected: e.target.checked })} />
                      <span className="note">{r.needsConfirm ? "Confirm and add" : "Add"}</span>
                    </label>
                  )}
                  {r.officialName && (
                    <button className="btn ghost sm" onClick={() => setManualSearchFor(manualSearchFor === r.originalName ? null : r.originalName)}>
                      Choose another match
                    </button>
                  )}
                  {!r.officialName && (
                    <button className="btn ghost sm" onClick={() => setManualSearchFor(manualSearchFor === r.originalName ? null : r.originalName)}>
                      Search manually
                    </button>
                  )}
                  <button className="btn ghost sm" onClick={() => updateRow(r.originalName, { action: "skip", selected: false })}>Skip</button>
                </div>

                {manualSearchFor === r.originalName && (
                  <ManualSearch onPick={(c) => { pickManual(r.originalName, c); setManualSearchFor(null); }} onCancel={() => setManualSearchFor(null)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "summary" && summaryResult && (
        <div className="stack">
          <div className="card pad">
            <h3 style={{ marginBottom: 6 }}>Import complete</h3>
            <div className="row wrap" style={{ gap: 16 }}>
              <div><div className="note">Added</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.added}</div></div>
              <div><div className="note">Already in My List</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.alreadyInList}</div></div>
              <div><div className="note">Corrected and added</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.correctedAndAdded}</div></div>
              <div><div className="note">Needs review</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.needsReview}</div></div>
              <div><div className="note">Skipped</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.skipped}</div></div>
              <div><div className="note">Not found</div><div style={{ fontSize: 20, fontWeight: 700 }}>{summaryResult.summary.notFound}</div></div>
            </div>
            <SuccessNote>Confirmed colleges are now in My List with an "Imported List" badge.</SuccessNote>
          </div>

          <div className="card pad">
            <h3 style={{ marginBottom: 8 }}>Details</h3>
            <div className="stack" style={{ gap: 6 }}>
              {summaryResult.results.map((r, i) => (
                <div key={`${r.originalName}-${i}`} className="row spread wrap" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                  <div>
                    <strong>{r.originalName}</strong>{r.matchedName && r.matchedName !== r.originalName ? ` → ${r.matchedName}` : ""}
                    {r.reason && <div className="note">{r.reason}</div>}
                  </div>
                  <span className="pill">{r.result}</span>
                </div>
              ))}
            </div>
          </div>

          <button className="btn primary" onClick={startOver}>Import another list</button>
        </div>
      )}
    </div>
  );
}
