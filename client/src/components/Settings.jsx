// Settings.jsx -- More -> Settings. Five sections: Account, Your Data,
// Data & Export, Local Saved Searches, Privacy. Every export button here
// links to a real, already-working CSV export (see api.js) -- if a specific
// item has no dedicated export, only "Open page" is shown, never a fake
// download button.
import React, { useState } from "react";
import { api } from "../lib/api.js";
import { clearLocalSearch } from "../lib/persistedSearch.js";
import { auth, firebaseConfigured } from "../lib/firebase.js";

const SAVED_DATA_ITEMS = [
  "Student profile", "Saved colleges", "Imported college lists", "Decision Plan",
  "Essay prompts and story bank", "Application timelines", "Verification items",
  "Cost/NPC tracker", "Recommendation tracker", "Scholarship/honors tracker", "Portal tracker",
];

// Same auth-header + fetch-blob-and-click pattern every other CSV export
// button in the app already uses (DecisionPlan.jsx, FinancialAid.jsx,
// etc.) -- a plain <a href> wouldn't carry the signed-in Firebase token, so
// the download would 401 for any real (non-dev-bypass) account.
async function authHeader() {
  try {
    if (firebaseConfigured && auth?.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* dev bypass / no firebase configured */ }
  return {};
}
async function downloadCsv(url, filename, onError) {
  try {
    const r = await fetch(url, { headers: await authHeader() });
    if (!r.ok) throw new Error(`Download failed (${r.status})`);
    const blob = await r.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);
  } catch (e) {
    onError && onError(e.message || "Could not download the CSV file.");
  }
}

function ExportRow({ item, studentId, onGo }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const runExport = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const filename = `${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    await downloadCsv(item.csv(studentId), filename, setErr);
    setBusy(false);
  };
  return (
    <div className="row spread wrap" style={{ gap: 8, padding: "10px 0", borderBottom: "1px solid var(--line-2, #eee)" }}>
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{item.label}</div>
        <div className="note">{item.desc}</div>
        {err && <div className="note" style={{ color: "var(--reach)" }}>{err}</div>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => onGo(item.open)}>Open page →</button>
        {item.csv && (
          <button className="btn ghost sm" onClick={runExport} disabled={busy}>{busy ? "Saving…" : "Export CSV"}</button>
        )}
      </div>
    </div>
  );
}

function exportCategories(studentId) {
  return {
    planning: {
      label: "Planning exports",
      items: [
        { label: "Decision Plan", desc: "Your final list, categories, program verification, cost, and strategy notes.", open: "decisionPlan", csv: () => api.decisionPlanExportUrl(studentId) },
        { label: "Timeline & Tasks", desc: "Every task on your Decision Plan timeline (all task types, not essay-only).", open: "decisionPlan", csv: () => api.decisionPlanTasksExportUrl(studentId) },
        { label: "Final List Health Check", desc: "Balance, risk, cost, and workload summary shown at the top of Decision Plan.", open: "decisionPlan", csv: null },
        { label: "Cost / NPC Tracker", desc: "Net price calculator status and cost fields, tracked per college inside Decision Plan.", open: "decisionPlan", csv: null },
        { label: "Scholarship Tracker", desc: "Every scholarship you're tracking.", open: "scholarships", csv: () => api.scholarshipsExportCsvUrl(studentId) },
        { label: "Visit / Interest Tracker", desc: "Visit / info-session tasks, tracked inside Decision Plan's Timeline & Tasks.", open: "decisionPlan", csv: null },
      ],
    },
    application: {
      label: "Application exports",
      items: [
        { label: "Application Tracker", desc: "Per-college application status and dates. Export CSV is available on that page.", open: "applications", csv: null },
        { label: "Application Timeline", desc: "Deadline, notification, and enrollment dates.", open: "applicationPathways", csv: () => api.timelineExportCsvUrl(studentId) },
        { label: "Recommendation Tracker", desc: "Recommendation status per college -- included in the Application Tracker export.", open: "applications", csv: null },
        { label: "Portal Tracker", desc: "Not built yet -- there is no dedicated system for this.", open: "portalTracker", csv: null },
      ],
    },
    essay: {
      label: "Essay exports",
      items: [
        { label: "Essay Center", desc: "The full workspace: prompts, strategy, samples, published examples, story bank.", open: "essays", csv: null },
        { label: "Essay Prompts", desc: "Every essay prompt, deadline, and verification status.", open: "essays", csv: () => api.essayExportCsvUrl(studentId) },
        { label: "Story Bank", desc: "Browse under Apply -> Essays -> Story Bank. No separate export yet.", open: "essays", csv: null },
        { label: "Essay Tasks", desc: "Essay-research tasks live inside Decision Plan's Timeline & Tasks export.", open: "decisionPlan", csv: null },
      ],
    },
    verification: {
      label: "Verification exports",
      items: [
        { label: "Verification Center", desc: "Every open verification item across your list.", open: "decisionPlan", csv: () => api.verificationCenterExportCsvUrl(studentId) },
        { label: "Programs & Opportunities", desc: "Discovered and manually-added programs, with source and verification status.", open: "programs", csv: () => api.programsExportCsvUrl(studentId) },
        { label: "Double-Major Verification", desc: "Included in the Decision Plan and Verification Center exports above.", open: "majors", csv: null },
      ],
    },
  };
}

// The 6 search areas Local Saved Searches can clear (device-only -- see
// lib/persistedSearch.js clearLocalSearch). Deliberately excludes Decision
// Plan, Verification Center, and Import Colleges review state -- those
// aren't "search results" and the family asked that this section never
// touch My List or Decision Plan.
function searchAreas(studentId) {
  return [
    { label: "Browse Colleges search", keys: ["browseColleges:all", "browseColleges:tab"] },
    { label: "Major Search results (single & double)", keys: ["majors"] },
    { label: "Essay prompt search", keys: ["essayCenter"] },
    { label: "Program research results", keys: ["programs"] },
    { label: "Application timeline search", keys: ["applicationPathways"] },
  ].map((a) => ({ ...a, clear: () => a.keys.forEach((k) => clearLocalSearch(studentId, k)) }));
}

export function Settings({ user, studentId, onSignOut, onGo }) {
  const [exportTab, setExportTab] = useState("planning");
  const [clearedMsg, setClearedMsg] = useState(null);
  const categories = exportCategories(studentId);
  const areas = searchAreas(studentId);

  const clearOne = (area) => {
    area.clear();
    setClearedMsg(`${area.label} cleared on this device.`);
    setTimeout(() => setClearedMsg(null), 3000);
  };
  const clearAll = () => {
    areas.forEach((a) => a.clear());
    setClearedMsg("All saved searches cleared on this device.");
    setTimeout(() => setClearedMsg(null), 3000);
  };

  return (
    <div className="stack">
      <div><div className="eyebrow">More</div><h1>Settings</h1></div>

      {/* 1. Account */}
      <div className="card pad stack">
        <h3>Account</h3>
        {user ? (
          <>
            <p className="note">Signed in as <strong>{user.email || user.displayName || (user.isAnonymous ? "Guest" : "user")}</strong>{user.isAnonymous && " (guest account -- sign in with email or Google to keep access to this data later)"}.</p>
            <button className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <p className="note">Not signed in -- using a local, unauthenticated profile ({studentId}). Sign in to sync your data across devices.</p>
        )}
      </div>

      {/* 2. Your Data */}
      <div className="card pad stack">
        <h3>Your Data</h3>
        <p className="note">Your profile, saved colleges, and every plan/tracker page are stored under your own
          account and are never shared with or visible to someone else.</p>
        <div className="note" style={{ fontWeight: 600 }}>Saved under your account:</div>
        <ul className="note" style={{ margin: 0, paddingLeft: 18 }}>
          {SAVED_DATA_ITEMS.map((it) => <li key={it}>{it}</li>)}
        </ul>
      </div>

      {/* 3. Data & Export */}
      <div className="card pad stack">
        <h3>Data &amp; Export</h3>
        <p className="note">Download your planning data, decision list, verification items, timelines, essays, and trackers.</p>
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.entries(categories).map(([k, cat]) => (
            <button key={k} className={`btn sm ${exportTab === k ? "primary" : "ghost"}`} onClick={() => setExportTab(k)}>{cat.label}</button>
          ))}
        </div>
        <div>
          {categories[exportTab].items.map((item) => (
            <ExportRow key={item.label} item={item} studentId={studentId} onGo={onGo} />
          ))}
        </div>
      </div>

      {/* 4. Local Saved Searches */}
      <div className="card pad stack">
        <h3>Local Saved Searches</h3>
        <p className="note">Saved searches help restore your last results when you leave a page and come back. This
          controls search results saved on this browser/device: Browse Colleges, Single Major Search, Double Major
          Search, Essay prompt search, Program research results, and Application timeline search.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={clearAll}>Clear saved searches on this device</button>
          {areas.map((a) => (
            <button key={a.label} className="btn ghost sm" onClick={() => clearOne(a)}>Clear {a.label}</button>
          ))}
        </div>
        {clearedMsg && <div className="note" style={{ color: "var(--safety)" }}>{clearedMsg}</div>}
        <div className="disclaimer">This only clears saved search results on this device. It does not delete your
          saved colleges, profile, or planning data.</div>
      </div>

      {/* 5. Privacy */}
      <div className="card pad stack">
        <h3>Privacy</h3>
        <p className="note">Matricula uses your signed-in account to keep your profile, saved colleges,
          and planning records separate from other users.</p>
        <p className="note">Matricula can help with brainstorming, outlining, prompt tracking, and
          revision planning. The student must write final essays in their own voice and follow each college's
          AI-use policy.</p>
      </div>
    </div>
  );
}
