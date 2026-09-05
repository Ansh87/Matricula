// Documents.jsx - upload transcripts, resume, portfolio. Extracts text locally;
// optional AI auto-fill only if a Gemini key is configured on the server.
import React, { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import { SourceBadge } from "./ui.jsx";

const KINDS = [
  ["transcript", "Transcript"],
  ["resume", "Resume / activities"],
  ["portfolio", "Portfolio / project"],
  ["other", "Other"],
];

export function Documents({ studentId, onApplyParsed, embedded }) {
  const [docs, setDocs] = useState([]);
  const [parsingEnabled, setParsingEnabled] = useState(false);
  const [kind, setKind] = useState("transcript");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [link, setLink] = useState("");
  const [built, setBuilt] = useState(null);
  const fileRef = useRef();

  const load = () => {
    if (!studentId) return;
    api.listDocuments(studentId).then((r) => {
      setDocs(r.documents || []); setParsingEnabled(!!r.parsingEnabled);
    }).catch(() => {});
  };
  // Note: the effect callback must NOT return the promise - React would treat a
  // returned value as a cleanup function and try to call it. We call load()
  // inside a block that returns undefined.
  useEffect(() => { load(); }, [studentId]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.uploadDocument(studentId, kind, file);
      if (!r.document.hasText && r.document.reason) { setMsg({ ok: false, text: r.document.reason }); return; }
      const totalChars = r.document.textLength ?? r.document.textExcerpt?.length ?? 0;
      setMsg({ ok: true, text: `Uploaded "${r.document.filename}" and read its full text (${totalChars.toLocaleString()} characters). All of it is used for auto-fill - the preview below only shows the first 4,000.` });
      await load();
    } catch (err) {
      setMsg("Upload failed: " + err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addLink = async () => {
    if (!link.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.addPortfolioLink(studentId, link.trim());
      const d = r.document;
      if (!d.ok) {
        setMsg({ ok: false, text: d.reason || "Couldn't reach that URL." });
      } else if (d.thin) {
        // Reached the site, but it's a JS-rendered shell - say so honestly.
        setMsg({ ok: false, text: d.reason });
      } else if (d.hasText) {
        setMsg({ ok: true, text: "Added portfolio link and read its content." });
      } else {
        setMsg({ ok: false, text: d.reason || "Added the link, but couldn't read text from it." });
      }
      setLink(""); await load();
    } catch (err) { setMsg("Couldn't add link: " + err.message); }
    finally { setBusy(false); }
  };

  const buildProfile = async () => {
    setBusy(true); setMsg({ ok: null, text: "Reading your documents…" });
    setBuilt(null);
    try {
      const r = await api.buildProfileFromDocs(studentId);
      if (r.available && r.parsed && Object.keys(r.parsed).length) {
        const n = r.docsUsed?.length || "your";
        setMsg({ ok: true, text: `Profile built from ${n} document(s). Review the extracted fields below and click "Apply to my profile".` });
        setBuilt(r.parsed);
      } else if (r.available) {
        setMsg({ ok: false, text: "The document was read, but no profile fields could be confidently extracted. Please enter the missing fields manually." });
      } else {
        setMsg({ ok: false, text: r.reason || "Could not build a profile from your documents." });
      }
    } catch (err) {
      setMsg({ ok: false, text: "Couldn't build profile: " + (err.message || "unknown error") });
    } finally { setBusy(false); }
  };

  const parse = async (docId) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.parseDocument(studentId, docId);
      if (r.available) {
        setMsg("Parsed! Review the extracted fields below and apply them to your profile.");
        await load();
      } else {
        setMsg(r.reason || "Parsing isn't available.");
      }
    } catch (err) { setMsg("Parse failed: " + err.message); }
    finally { setBusy(false); }
  };

  const remove = async (docId) => {
    await api.deleteDocument(studentId, docId).catch(() => {});
    load();
  };

  return (
    <div className="stack">
      {!embedded && (
        <div>
          <div className="eyebrow">Documents</div>
          <h1>Upload transcript, resume &amp; portfolio</h1>
          <p className="lead">Upload your documents so the app can help build your profile. Files stay on your
            own computer; text is read locally so you can confirm it.</p>
        </div>
      )}

      <div className="card pad stack">
        <div className="row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
          <div>
            <label className="lbl">Document type</label>
            <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 200 }}>
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Choose a file (PDF or text)</label>
            <input ref={fileRef} className="inp" type="file" accept=".pdf,.txt,.md,.csv" onChange={onUpload} disabled={busy} />
          </div>
          {busy && <span className="spinner" />}
        </div>

        <div className="divider" />
        <div>
          <label className="lbl">Or add a portfolio / project link (Netlify, GitHub, website)</label>
          <div className="row" style={{ gap: 8 }}>
            <input className="inp" value={link} onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://your-project.netlify.app" />
            <button className="btn ghost" onClick={addLink} disabled={busy}>Add link</button>
          </div>
        </div>

        {!parsingEnabled && (
          <div className="disclaimer" style={{ borderLeftColor: "var(--amber)", marginBottom: 8 }}>
            <strong>AI profile build is not enabled because GEMINI_API_KEY is missing.</strong>{" "}
            Uploads and links still work, but you must enter profile fields manually.
            Add a free key from aistudio.google.com to <code>server/.env</code> as <code>GEMINI_API_KEY=…</code> and restart.
          </div>
        )}
        {msg && (
          typeof msg === "string"
            ? <div className="note">{msg}</div>
            : <div className={msg.ok === false ? "disclaimer" : "note"}
                style={msg.ok === false ? { borderLeftColor: "var(--reach)" } : msg.ok ? { color: "var(--safety)" } : undefined}>
                {msg.text}
              </div>
        )}
      </div>

      {/* build-from-documents action */}
      {docs.length > 0 && (
        <div className="card pad row spread wrap" style={{ gap: 10 }}>
          <div>
            <strong>Build my profile from these documents</strong>
            <div className="note">{parsingEnabled
              ? "Reads all your documents together and fills your profile - you review before applying."
              : "Needs a free Gemini key on the server. Click to see setup details, or enter fields manually."}</div>
          </div>
          <button className="btn amber" onClick={buildProfile} disabled={busy}>Build profile →</button>
        </div>
      )}

      {built && (
        <div className="card pad" style={{ background: "var(--paper-2)" }}>
          <div className="row spread"><strong>Profile built from your documents</strong><SourceBadge level="estimated">AI-read</SourceBadge></div>
          {built.summary && <p className="note" style={{ margin: "8px 0" }}>{built.summary}</p>}
          <div className="row wrap" style={{ gap: 8, margin: "8px 0" }}>
            {Object.entries(built).filter(([k, v]) => v != null && !Array.isArray(v) && k !== "summary").map(([k, v]) => (
              <span key={k} className="pill">{k}: {String(v)}</span>
            ))}
          </div>
          {Array.isArray(built.activities) && built.activities.length > 0 && (
            <div className="note">Activities: {built.activities.map((a) => a.name).filter(Boolean).join(", ")}</div>
          )}
          {Array.isArray(built.projects) && built.projects.length > 0 && (
            <div className="note">Projects: {built.projects.map((a) => a.name).filter(Boolean).join(", ")}</div>
          )}
          <button className="btn primary sm" style={{ marginTop: 10 }} onClick={() => onApplyParsed(built)}>Apply to my profile →</button>
          <div className="note" style={{ marginTop: 6 }}>Review before applying. You can edit everything in the form.</div>
        </div>
      )}

      {/* privacy notice about optional AI parsing */}
      <div className="disclaimer">
        <strong>How document reading works.</strong> Your files are stored on your own computer and the text is
        read locally - nothing is sent anywhere by default.{" "}
        {parsingEnabled
          ? "AI auto-fill is ENABLED: when you build your profile or auto-fill, the extracted text is sent to Google Gemini to pull out fields. On Google's free tier, Google may use inputs to improve their models."
          : "AI auto-fill is OFF (no Gemini key set), so you'll confirm fields yourself. To enable optional auto-fill later, add a free GEMINI_API_KEY on the server."}
        {" "}Always review anything extracted before trusting it.
      </div>

      {docs.length > 0 && (
        <div className="stack">
          <h3>Your documents</h3>
          {docs.map((d) => (
            <div key={d.doc_id} className="card pad">
              <div className="row spread wrap">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{d.filename}</strong>
                    <span className="pill">{d.kind}</span>
                    <span className="note">{Math.round(d.size / 1024)} KB</span>
                  </div>
                  <div className="note" style={{ marginTop: 4 }}>
                    {d.text_excerpt
                      ? `Text read locally ✓ - ${(d.full_text_length ?? d.text_excerpt.length).toLocaleString()} characters captured and used for auto-fill`
                      : "No text extracted (scanned image or unsupported)"}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {d.text_excerpt && parsingEnabled && !d.parsed && (
                    <button className="btn amber sm" disabled={busy} onClick={() => parse(d.doc_id)}>Auto-fill from this</button>
                  )}
                  <button className="btn ghost sm" onClick={() => remove(d.doc_id)}>Remove</button>
                </div>
              </div>

              {d.parsed && (
                <div className="card pad" style={{ marginTop: 12, background: "var(--paper-2)" }}>
                  <div className="row spread"><strong>Extracted fields</strong><SourceBadge level="estimated">AI-read</SourceBadge></div>
                  <div className="row wrap" style={{ gap: 8, margin: "8px 0" }}>
                    {Object.entries(d.parsed).filter(([, v]) => v != null && !Array.isArray(v)).map(([k, v]) => (
                      <span key={k} className="pill">{k}: {String(v)}</span>
                    ))}
                  </div>
                  {Array.isArray(d.parsed.activities) && d.parsed.activities.length > 0 && (
                    <div className="note">Activities found: {d.parsed.activities.map((a) => a.name).filter(Boolean).join(", ")}</div>
                  )}
                  <button className="btn primary sm" style={{ marginTop: 10 }} onClick={() => onApplyParsed(d.parsed)}>
                    Apply these to my profile →
                  </button>
                  <div className="note" style={{ marginTop: 6 }}>Review before applying. You can edit everything in the Profile tab.</div>
                </div>
              )}

              {d.text_excerpt && (
                <details style={{ marginTop: 10 }}>
                  <summary className="note" style={{ cursor: "pointer" }}>
                    View extracted text
                    {d.full_text_length > d.text_excerpt.length
                      ? ` (preview of first ${d.text_excerpt.length.toLocaleString()} of ${d.full_text_length.toLocaleString()} characters - all of it is used for auto-fill)`
                      : ""}
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)", marginTop: 8, maxHeight: 200, overflow: "auto" }}>{d.text_excerpt}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
