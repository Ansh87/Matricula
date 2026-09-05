// Advisor.jsx - explains the student's own results using only available data.
import React, { useState } from "react";
import { api } from "../lib/api.js";
import { SourceBadge } from "./ui.jsx";
import { TrackRecommendations } from "./TrackRecommendations.jsx";

const SUGGESTED = [
  "Which of these are my safety schools?",
  "Which are reaches?",
  "How do the costs compare?",
  "What careers fit my major?",
  "How can I improve my chances?",
  "What essays do I need to write?",
];

// Turns bare URLs in an advisor answer into clickable links, so essay-prompt
// source links and sample-essay links (which the advisor now includes as
// plain text) are actually usable instead of just visible.
const URL_SPLIT_RE = /(https?:\/\/[^\s)]+)/g;
const URL_TEST_RE = /^https?:\/\//;
function linkify(text) {
  const parts = String(text || "").split(URL_SPLIT_RE);
  return parts.map((part, i) =>
    URL_TEST_RE.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{part}</a>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

export function Advisor({ profile, recs, onRunMatches, onViewCoursePlan }) {
  const [msgs, setMsgs] = useState([
    { role: "advisor", text: "Ask me about your list - Reach/Target/Safety split, estimated net costs from College Scorecard, or BLS career outcomes for your major. I only use data that’s actually available for your colleges." },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (question) => {
    // Guard against double-submission -- suggested-question chips and the
    // Enter-key handler don't have their own disabled state, so without this
    // a fast double-click/double-Enter could fire two concurrent requests.
    if (busy || !question.trim()) return;
    setMsgs((m) => [...m, { role: "you", text: question }]);
    setQ(""); setBusy(true);
    try {
      const r = await api.advisor(question, profile, recs);
      setMsgs((m) => [...m, { role: "advisor", text: r.answer, disclaimer: r.disclaimer }]);
    } catch (err) {
      // Surface the real reason instead of a generic failure.
      const why = err?.status === 413
        ? "The request was too large for the server. This is a bug - please report it."
        : err?.message || "unknown error";
      setMsgs((m) => [...m, { role: "advisor", text: `I couldn’t reach the advisor service: ${why}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="eyebrow">Advisor</div>
        <h1>Talk through your list</h1>
        <p className="lead">A planning aid - not your school counselor or a college’s admissions office.</p>
      </div>

      <TrackRecommendations profile={profile} onRunMatches={onRunMatches} onViewCoursePlan={onViewCoursePlan} />

      <div className="card pad stack">
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "you" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{
              background: m.role === "you" ? "var(--ink-800)" : "var(--paper-2)",
              color: m.role === "you" ? "#fff" : "var(--text)",
              padding: "10px 14px", borderRadius: 12, fontSize: 14, lineHeight: 1.5,
            }}>{m.role === "advisor" ? linkify(m.text) : m.text}</div>
            {m.disclaimer && <div className="note" style={{ marginTop: 4, fontSize: 11 }}>{m.disclaimer}</div>}
          </div>
        ))}
        {busy && <div className="note">Thinking…</div>}
      </div>

      <div className="chips" style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
        {SUGGESTED.map((s) => <span key={s} className="chip" onClick={() => ask(s)}>{s}</span>)}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder="Ask about your list…" />
        <button className="btn primary" disabled={busy} onClick={() => ask(q)}>Send</button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <SourceBadge level="estimated" />
        <span className="note">Answers are generated from your profile and the official data on your list.</span>
      </div>
    </div>
  );
}
