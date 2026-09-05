// FinancialAid.jsx — two tools: (1) Financial Aid Planner (FAFSA/CSS per saved
// college + general SAI/loan/appeal guidance), (2) a manual Scholarship Tracker
// where the family enters scholarships they find and tracks status/deadlines.
// No scholarship "search" — there's no free, accurate database, so we don't fake
// one; instead we make it easy to track the real ones you find.
import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Spinner } from "./ui.jsx";
import { auth, firebaseConfigured } from "../lib/firebase.js";

async function authHeader() {
  try {
    if (firebaseConfigured && auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* dev bypass / no firebase configured */ }
  return {};
}

const BLANK = { name: "", provider: "", amount: "", deadline: "", renewable: "", eligibility: "",
  essays: "", recommendations: "", gpa_requirement: "", major_requirement: "", residency: "",
  citizenship: "", link: "", status: "Researching", notes: "" };

const STATUSES = ["Researching", "Planning to apply", "In progress", "Submitted", "Awarded", "Not selected", "Skipped"];

export function FinancialAid({ studentId, profile, initialTab }) {
  // initialTab lets a caller (e.g. Plan -> Scholarships & Honors) open this
  // same component landed on its Scholarship tracker instead of the Aid
  // planner, without changing anything about either tool. Defaults to
  // "planner" exactly as before when no initialTab is given (e.g. the
  // existing Applications -> Financial Aid & Scholarships entry point).
  const [tab, setTab] = useState(initialTab === "scholarships" ? "scholarships" : "planner");
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Money</div>
        <h1>Financial aid &amp; scholarships</h1>
        <p className="lead">Plan the required aid forms for your list, and track the scholarships you find.</p>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <span className={`chip ${tab === "planner" ? "on" : ""}`} onClick={() => setTab("planner")}>Aid planner</span>
          <span className={`chip ${tab === "scholarships" ? "on" : ""}`} onClick={() => setTab("scholarships")}>Scholarship tracker</span>
        </div>
      </div>
      {tab === "planner" ? <Planner studentId={studentId} profile={profile} /> : <Tracker studentId={studentId} />}
    </div>
  );
}

function Planner({ studentId, profile }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    api.aidPlan(studentId, profile).then(setPlan).catch(() => setPlan(null)).finally(() => setLoading(false));
  };
  useEffect(load, [studentId, profile]);

  if (loading) return <div className="card pad"><Spinner label="Building your aid plan…" /></div>;
  if (!plan) return (
    <div className="empty">
      Couldn't load the aid planner. <button className="link" onClick={load}>Try again</button>
    </div>
  );

  return (
    <div className="stack">
      <div className="card pad stack">
        <h3>The essentials</h3>
        {Object.entries({
          "FAFSA": plan.general.fafsa, "CSS Profile": plan.general.css,
          "Student Aid Index (SAI)": plan.general.sai, "Loans": plan.general.loans,
          "Aid appeals": plan.general.appeal,
        }).map(([k, v]) => (
          <div key={k}><div className="note" style={{ fontWeight: 600 }}>{k}</div><p className="note">{v}</p></div>
        ))}
      </div>

      <div className="card pad">
        <h3 style={{ marginBottom: 8 }}>Aid forms for your saved colleges</h3>
        {!plan.items.length ? <p className="note">Save some colleges first — then you'll see FAFSA/CSS requirements per school here.</p> : (
          <div className="stack" style={{ gap: 8 }}>
            {plan.items.map((it) => (
              <div key={it.collegeId} className="card pad" style={{ background: "var(--paper-2)", padding: 12 }}>
                <div className="row spread"><strong>{it.name}</strong>
                  {it.source === "verified" && <span className="pill" style={{ background: "var(--safety-b)" }}>verified</span>}</div>
                <div className="note" style={{ marginTop: 4 }}>FAFSA: {it.fafsa}</div>
                <div className="note">CSS Profile: {it.cssProfile}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="disclaimer">{plan.disclaimer}</div>
    </div>
  );
}

function Tracker({ studentId }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // scholarship object or null
  const [loading, setLoading] = useState(true);

  const load = () => { api.listScholarships(studentId).then((r) => setRows(r.scholarships || [])).catch(() => setRows([])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [studentId]);

  const save = async (schol) => {
    const sid = schol.scholarship_id || `sch_${Date.now()}`;
    await api.saveScholarship(studentId, sid, schol);
    setEditing(null); load();
  };
  const remove = async (sid) => { if (confirm("Delete this scholarship?")) { await api.deleteScholarship(studentId, sid); load(); } };

  const exportCsv = async () => {
    try {
      const r = await fetch(api.scholarshipsExportCsvUrl(studentId), { headers: await authHeader() });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `scholarship-tracker-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* if this fails, the family can still view everything on-screen */ }
  };

  if (loading) return <div className="card pad"><Spinner label="Loading your scholarships…" /></div>;

  return (
    <div className="stack">
      <div className="row spread wrap">
        <p className="note">Track scholarships you find (merit, state, private, STEM, local, first-gen, employer, etc.). Matricula doesn't search a scholarship database — those aren't freely available and would go stale — so this keeps <em>your</em> real finds organized.</p>
        <div className="row" style={{ gap: 8 }}>
          {rows.length > 0 && <button className="btn ghost sm" onClick={exportCsv}>Export CSV</button>}
          <button className="btn amber sm" onClick={() => setEditing({ ...BLANK })}>+ Add scholarship</button>
        </div>
      </div>

      {editing && <ScholarshipForm value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />}

      {!rows.length && !editing ? <div className="empty">No scholarships yet. Add the first one you find.</div> : (
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((s) => (
            <div key={s.scholarship_id} className="card pad">
              <div className="row spread">
                <div>
                  <strong>{s.name || "Untitled scholarship"}</strong>
                  {s.provider && <span className="note"> · {s.provider}</span>}
                </div>
                <span className="pill" style={{ background: statusColor(s.status) }}>{s.status || "—"}</span>
              </div>
              <div className="row wrap" style={{ gap: 6, margin: "8px 0" }}>
                {s.amount && <span className="pill">{s.amount}</span>}
                {s.deadline && <span className="pill">Due {s.deadline}</span>}
                {s.renewable && <span className="pill">{s.renewable}</span>}
                {s.gpa_requirement && <span className="pill">GPA {s.gpa_requirement}</span>}
                {s.major_requirement && <span className="pill">{s.major_requirement}</span>}
              </div>
              {s.eligibility && <p className="note">{s.eligibility}</p>}
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                {s.link && <a className="link" href={s.link} target="_blank" rel="noreferrer">Open ↗</a>}
                <button className="link" onClick={() => setEditing(s)}>Edit</button>
                <button className="link" style={{ color: "var(--reach)" }} onClick={() => remove(s.scholarship_id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScholarshipForm({ value, onChange, onSave, onCancel }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const F = ({ k, label, ph }) => (
    <div><label className="lbl">{label}</label>
      <input className="inp" value={value[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder={ph || ""} /></div>
  );
  return (
    <div className="card pad stack">
      <h3>{value.scholarship_id ? "Edit scholarship" : "Add scholarship"}</h3>
      <div className="grid cols-2">
        <F k="name" label="Name" ph="e.g. Coca-Cola Scholars" />
        <F k="provider" label="Provider" ph="organization" />
        <F k="amount" label="Amount" ph="$5,000" />
        <F k="deadline" label="Deadline" ph="2026-11-01" />
        <div><label className="lbl">Renewable?</label>
          <select className="inp" value={value.renewable || ""} onChange={(e) => set("renewable", e.target.value)}>
            <option value="">—</option><option>One-time</option><option>Renewable</option>
          </select></div>
        <div><label className="lbl">Status</label>
          <select className="inp" value={value.status || "Researching"} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <F k="gpa_requirement" label="GPA requirement" ph="3.5+" />
        <F k="major_requirement" label="Major requirement" ph="STEM / any" />
        <F k="residency" label="Residency requirement" ph="NJ resident" />
        <F k="citizenship" label="Citizenship requirement" ph="U.S. citizen" />
        <F k="essays" label="Required essays" ph="1 x 500 words" />
        <F k="recommendations" label="Required recommendations" ph="1 teacher" />
        <F k="link" label="Link" ph="https://…" />
      </div>
      <div><label className="lbl">Eligibility / notes</label>
        <textarea className="inp" rows={2} value={value.eligibility || ""} onChange={(e) => set("eligibility", e.target.value)} /></div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={() => onSave(value)}>Save</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function statusColor(s) {
  if (s === "Awarded") return "var(--safety-b)";
  if (s === "Submitted" || s === "In progress") return "var(--target-b)";
  if (s === "Not selected" || s === "Skipped") return "var(--line-2)";
  return "var(--amber-b)";
}
