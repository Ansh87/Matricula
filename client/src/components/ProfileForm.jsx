// ProfileForm.jsx - collects the inputs the live recommendation engine uses.
import React, { useState, useEffect, useRef } from "react";
import { Documents } from "./Documents.jsx";
import { api } from "../lib/api.js";

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
// Atomic academic interests only. Composite career TRACKS (e.g. "CS + Finance /
// Quant") live in the scenario catalog and are selected via the Preferred career
// track field below and in Matches - never mixed into these atomic chips.
// The original 24 STEM/business-leaning options are kept exactly as-is (in
// case anything downstream keys off these exact strings); the rest are
// additions so every major with real College Scorecard CIP-code backing in
// services/scorecard.js's MAJOR_CIP_MAP is actually selectable here - before
// this, the matching engine already understood majors like Biology,
// Psychology, or Nursing, but the profile form had no way to pick them.
const INTERESTS = [
  "Computer Science","Artificial Intelligence","Data Science","Cybersecurity","Electrical Engineering",
  "Computer Engineering","Aerospace Engineering","Mechanical Engineering","Chemical Engineering",
  "Industrial Engineering","Operations Research","Biomedical Engineering","Materials Science / Materials Engineering",
  "Environmental Engineering","Energy Systems","Finance","Economics","Business Analytics","Mathematics",
  "Statistics","Physics","Applied Physics","Engineering Physics","Business / Product Strategy",
  // Additional majors (CIP-backed in MAJOR_CIP_MAP) not previously selectable:
  "Data Analytics","Information Technology","Software Engineering","Civil Engineering","Accounting",
  "Business (General)","Management","Marketing","Chemistry","Biology","Biochemistry","Neuroscience",
  "Public Policy","Political Science","Psychology","Nursing","Public Health","English","History","Philosophy",
];
const GOALS = ["High salary potential","Research opportunities","Startup/entrepreneurship","Graduate school","Stable career","Work-life balance","Impact/public service"];

// Required to generate a college match. Documents are optional but used if given.
function missingRequired(p) {
  const missing = [];
  if (!p.state) missing.push("state of residence");
  if (!p.gpa) missing.push("GPA");
  // SAT/ACT required unless the student has chosen a test-optional strategy.
  if (p.testStrategy !== "withhold" && !p.sat && !p.act && !p.satSuper && !p.actSuper) {
    missing.push("SAT or ACT (or choose the test-optional strategy)");
  }
  if (!p.primaryMajor && !(p.interests && p.interests.length)) {
    missing.push("primary intended major or at least one academic interest");
  }
  if (!p.budget && !p.costPref) missing.push("budget or cost preference");
  // Basic extracurricular signal: any experience flag, an activities note, or awards.
  const hasEC = p.hasResearch || p.hasInternship || p.hasLeadership || p.hasVolunteer
    || (p.activitiesText && p.activitiesText.trim().length > 0) || (p.awards && p.awards !== "none");
  if (!hasEC) missing.push("a basic extracurricular profile (activities, awards, or experience)");
  return missing;
}

export function ProfileForm({ initial, onSubmit, studentId, onApplyParsed, onSave, onResetProfile, applyMsg, profileVersion, onLoadSample }) {
  const [p, setP] = useState(initial || BLANK_PROFILE);
  const [savedMsg, setSavedMsg] = useState(null);
  // Scenario catalog for the optional "Preferred career track" dropdown. Comes
  // from the SAME source Matches uses (/api/colleges/scenarios), so names never
  // drift from the scenario engine.
  const [scenarios, setScenarios] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api.scenarios()
      .then((r) => { if (!cancelled) setScenarios(r.scenarios || []); })
      .catch(() => { if (!cancelled) setScenarios([]); });
    return () => { cancelled = true; };
  }, []);

  // Re-sync from the parent whenever it explicitly bumps profileVersion (saved
  // load, parsed documents, reset, sample). Version-based rather than a JSON
  // signature, so it fires reliably and never fights the user's typing.
  useEffect(() => {
    setP(initial || BLANK_PROFILE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileVersion]);

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const toggle = (k, v) => setP((s) => {
    const arr = new Set(s[k] || []);
    arr.has(v) ? arr.delete(v) : arr.add(v);
    return { ...s, [k]: [...arr] };
  });
  const missing = missingRequired(p);
  const ready = missing.length === 0;

  // "Detected signals" (Part of transparency pass): what the matching engine
  // actually picked up from activities/experience checkboxes/awards -- the
  // same deriveProfileSignals() output that feeds the extracurricular 10% of
  // the Match score, previously computed server-side but never shown
  // anywhere in the app. Debounced so it doesn't fire on every keystroke.
  const [signals, setSignals] = useState(null);
  useEffect(() => {
    if (!studentId) return;
    const t = setTimeout(() => {
      api.getProfileSignals(studentId, p).then((r) => setSignals(r.signals)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, p.activitiesText, p.hasResearch, p.hasInternship, p.hasLeadership, p.hasVolunteer, p.awards]);

  return (
    <div className="stack" style={{ maxWidth: 780 }}>
      <div>
        <div className="eyebrow">Step 1 · Your profile</div>
        <h1>Tell us about you</h1>
        <p className="lead">We use these to match you against real colleges from official federal data.
          Nothing here is shared; it stays in this app.</p>
      </div>

      <details className="card pad">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          📄 Upload transcript, resume &amp; portfolio (optional - speeds this up)
        </summary>
        <div style={{ marginTop: 14 }}>
          <p className="note" style={{ marginBottom: 12 }}>Upload documents or add a portfolio link. If you have a Gemini key set,
            the app can read them and fill this form for you. Optional - you can also just type everything below.</p>
          {applyMsg && (
            <div className="disclaimer" style={{ borderLeftColor: applyMsg.ok ? "var(--safety)" : "var(--reach)", marginBottom: 10 }}>
              {applyMsg.text}
            </div>
          )}
          {studentId && <Documents studentId={studentId} onApplyParsed={onApplyParsed} embedded />}
        </div>
      </details>

      <div className="card pad grid cols-2">
        <div>
          <label className="lbl">Name (optional)</label>
          <input className="inp" value={p.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="First name" />
        </div>
        <div>
          <label className="lbl">Grade</label>
          <select className="inp" value={p.grade || 11} onChange={(e) => set("grade", +e.target.value)}>
            <option value={9}>9th</option><option value={10}>10th</option>
            <option value={11}>11th</option><option value={12}>12th</option>
          </select>
        </div>
        <div>
          <label className="lbl">Graduation year</label>
          <input className="inp" type="number" value={p.gradYear || ""} onChange={(e) => set("gradYear", +e.target.value || null)} placeholder="e.g. 2027" />
        </div>
        <div>
          <label className="lbl">Citizenship / status</label>
          <select className="inp" value={p.citizenship || "domestic"} onChange={(e) => set("citizenship", e.target.value)}>
            <option value="domestic">U.S. citizen / permanent resident</option>
            <option value="international">International student</option>
          </select>
        </div>
        <div>
          <label className="lbl">High school (optional)</label>
          <input className="inp" value={p.highSchool || ""} onChange={(e) => set("highSchool", e.target.value)} placeholder="e.g. South Brunswick HS" />
        </div>
        <div>
          <label className="lbl">Home city / town (optional)</label>
          <input className="inp" value={p.city || ""} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Monmouth Junction" />
        </div>
        <div>
          <label className="lbl">State of residence</label>
          <select className="inp" value={p.state || ""} onChange={(e) => set("state", e.target.value)}>
            <option value="">Select state</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="note" style={{ marginTop: 5 }}>Drives in-state vs. out-of-state tuition and net-price estimates.</div>
        </div>
        <div>
          <label className="lbl">Annual budget (net cost your family can plan for)</label>
          <input className="inp" type="number" value={p.budget || ""} onChange={(e) => set("budget", +e.target.value || null)} placeholder="e.g. 35000" />
        </div>
      </div>

      <div className="card pad">
        <label className="lbl">Cost preference</label>
        <div className="chips">
          {[["any","Open to any cost"],["in_state","Prefer in-state / lower cost"],["value","Best value / ROI"],["aid","Need strong financial aid"]].map(([k, l]) => (
            <span key={k} className={`chip ${(p.costPref || "any") === k ? "on" : ""}`} onClick={() => set("costPref", k)}>{l}</span>
          ))}
        </div>
        <div className="note" style={{ marginTop: 6 }}>Used to weight affordability and prioritize in-state public options when relevant.</div>
      </div>

      <div className="card pad grid cols-2">
        <div>
          <label className="lbl">Unweighted GPA (0–4.0)</label>
          <input className="inp" type="number" step="0.01" max="4" value={p.gpa || ""} onChange={(e) => set("gpa", +e.target.value || null)} placeholder="e.g. 3.9" />
        </div>
        <div>
          <label className="lbl">Weighted GPA (optional)</label>
          <input className="inp" type="number" step="0.01" value={p.gpaWeighted || ""} onChange={(e) => set("gpaWeighted", +e.target.value || null)} placeholder="e.g. 4.35" />
        </div>
        <div>
          <label className="lbl">SAT total (blank if test-optional)</label>
          <input className="inp" type="number" value={p.sat || ""} onChange={(e) => set("sat", +e.target.value || null)} placeholder="e.g. 1450" />
        </div>
        <div>
          <label className="lbl">SAT superscore (optional)</label>
          <input className="inp" type="number" value={p.satSuper || ""} onChange={(e) => set("satSuper", +e.target.value || null)} placeholder="best-section total" />
        </div>
        <div>
          <label className="lbl">ACT composite (optional)</label>
          <input className="inp" type="number" max="36" value={p.act || ""} onChange={(e) => set("act", +e.target.value || null)} placeholder="e.g. 33" />
        </div>
        <div>
          <label className="lbl">ACT superscore (optional)</label>
          <input className="inp" type="number" max="36" value={p.actSuper || ""} onChange={(e) => set("actSuper", +e.target.value || null)} placeholder="best-section avg" />
        </div>
        <div>
          <label className="lbl">AP / IB / honors courses taken</label>
          <input className="inp" type="number" value={p.apCount ?? ""} onChange={(e) => set("apCount", +e.target.value || 0)} placeholder="e.g. 7" />
        </div>
        <div>
          <label className="lbl">Class rank (optional, e.g. 5 of 400)</label>
          <div className="row" style={{ gap: 6 }}>
            <input className="inp" type="number" value={p.classRank || ""} onChange={(e) => set("classRank", +e.target.value || null)} placeholder="rank" />
            <input className="inp" type="number" value={p.classSize || ""} onChange={(e) => set("classSize", +e.target.value || null)} placeholder="of size" />
          </div>
        </div>
        <div>
          <label className="lbl">Highest award level</label>
          <select className="inp" value={p.awards || "none"} onChange={(e) => set("awards", e.target.value)}>
            <option value="none">None yet</option>
            <option value="school">School / local</option>
            <option value="state">State / regional</option>
            <option value="national">National / international</option>
          </select>
        </div>
        <div>
          <label className="lbl">Test-optional strategy</label>
          <select className="inp" value={p.testStrategy || "auto"} onChange={(e) => set("testStrategy", e.target.value)}>
            <option value="auto">Decide per college</option>
            <option value="submit">Plan to submit scores</option>
            <option value="withhold">Apply test-optional</option>
          </select>
        </div>
      </div>
      <div className="card pad row wrap" style={{ gap: 18 }}>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.rigorHigh} onChange={(e) => set("rigorHigh", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Most rigorous course load</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.firstGen} onChange={(e) => set("firstGen", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>First-generation</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.hasResearch} onChange={(e) => set("hasResearch", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Research experience</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.hasInternship} onChange={(e) => set("hasInternship", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Internship / work experience</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.hasLeadership} onChange={(e) => set("hasLeadership", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Leadership role</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.hasVolunteer} onChange={(e) => set("hasVolunteer", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Significant volunteer work</span>
        </label>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={!!p.willingED} onChange={(e) => set("willingED", e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Open to Early Decision</span>
        </label>
      </div>

      <div className="card pad">
        <label className="lbl">Activities &amp; achievements (one per line - auto-filled if you upload a resume)</label>
        <textarea className="inp" rows={4} value={p.activitiesText || ""} onChange={(e) => set("activitiesText", e.target.value)}
          placeholder="e.g. Founder, Robotics Club (national award)&#10;Research intern, university lab&#10;Provisional patent - UDIARS&#10;IEEE paper published" />
        <div className="note" style={{ marginTop: 5 }}>These feed your extracurricular strength, which affects admission chances at holistic colleges.</div>
        {signals && (
          <div className="card pad" style={{ marginTop: 10, background: "var(--paper-2)" }}>
            <div className="row spread" style={{ alignItems: "center" }}>
              <strong style={{ fontSize: 13.5 }}>What we detected</strong>
              <span className="pill">Extracurricular strength: {signals.extracurricularStrength}/100</span>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {signals.hasResearch && <span className="pill">Research</span>}
              {signals.hasPublication && <span className="pill">Publication</span>}
              {signals.hasPatent && <span className="pill">Patent</span>}
              {signals.hasLeadership && <span className="pill">Leadership</span>}
              {signals.hasFounderExperience && <span className="pill">Founder experience</span>}
              {signals.hasInternship && <span className="pill">Internship</span>}
              {signals.hasVolunteer && <span className="pill">Volunteer / service</span>}
              {signals.hasSTEMCompetition && <span className="pill">STEM competition</span>}
              {signals.hasNationalAward && <span className="pill">National/international award</span>}
              {signals.hasStateAward && <span className="pill">State/regional award</span>}
              {!signals.activityCount && !signals.hasResearch && !signals.hasLeadership && !signals.hasInternship && !signals.hasVolunteer && (
                <span className="note">Nothing detected yet - add activities above or check the boxes below that apply.</span>
              )}
            </div>
            <div className="note" style={{ marginTop: 8, fontSize: 12 }}>
              Based on {signals.activityCount} listed activit{signals.activityCount === 1 ? "y" : "ies"} plus the checkboxes below. This is exactly what Match uses - nothing here is invented from your wording alone.
            </div>
          </div>
        )}
      </div>

      <div className="card pad">
        <label className="lbl">Intended major</label>
        <p className="note" style={{ marginTop: 2, marginBottom: 8 }}>
          Your primary (and optional second) major. These are separate from the strategic career track below -
          in Matches you can base results on these majors/interests <em>or</em> on a selected career track.
        </p>
        <div className="grid cols-2" style={{ gap: 10 }}>
          <div>
            <div className="k" style={{ fontSize: 12 }}>Primary intended major</div>
            <select className="inp" value={p.primaryMajor || ""} onChange={(e) => set("primaryMajor", e.target.value || null)}>
              <option value="">Select primary major</option>
              {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <div className="k" style={{ fontSize: 12 }}>Optional second major / minor</div>
            <select className="inp" value={p.secondaryMajor || ""} onChange={(e) => set("secondaryMajor", e.target.value || null)}>
              <option value="">None</option>
              {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card pad">
        <label className="lbl">Academic interests</label>
        <p className="note" style={{ marginTop: 2, marginBottom: 8 }}>
          Atomic fields you're interested in (used for context and for Profile-based Matches). Search to find one, click to add - you can select as many as apply.
        </p>
        <InterestPicker options={INTERESTS} selected={p.interests || []} onToggle={(i) => toggle("interests", i)} />
      </div>

      <div className="card pad">
        <label className="lbl">Preferred career track / scenario <span className="note" style={{ fontWeight: 400 }}>(optional)</span></label>
        <p className="note" style={{ marginTop: 2, marginBottom: 8 }}>
          Career tracks are strategic <em>combinations</em> of the atomic interests above (e.g. CS + Finance/Quant).
          This only sets the <strong>default</strong> track in Matches - you can still switch tracks there anytime.
        </p>
        <select className="inp" style={{ maxWidth: 420 }}
          value={p.preferredScenarioId || ""} onChange={(e) => set("preferredScenarioId", e.target.value || null)}>
          <option value="">Undecided / show all tracks</option>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.scenarioName}</option>)}
        </select>
      </div>

      <div className="card pad">
        <label className="lbl">What matters most to you</label>
        <div className="chips">
          {GOALS.map((g) => (
            <span key={g} className={`chip ${(p.careerGoals || []).includes(g) ? "on" : ""}`} onClick={() => toggle("careerGoals", g)}>{g}</span>
          ))}
        </div>
      </div>

      <div className="card pad grid cols-2">
        <div>
          <label className="lbl">Interest in graduate school</label>
          <select className="inp" value={p.gradSchoolInterest || "maybe"} onChange={(e) => set("gradSchoolInterest", e.target.value)}>
            <option value="no">Not planning on it</option>
            <option value="maybe">Open to it / unsure</option>
            <option value="yes">Likely (master's / PhD / professional)</option>
          </select>
        </div>
        <div>
          <label className="lbl">Desired income direction</label>
          <select className="inp" value={p.incomeGoal || ""} onChange={(e) => set("incomeGoal", e.target.value)}>
            <option value="">No strong preference</option>
            <option value="high">Maximize earning potential</option>
            <option value="stable">Comfortable &amp; stable</option>
            <option value="impact">Impact over income</option>
          </select>
        </div>
        <div>
          <label className="lbl">Career risk preference</label>
          <select className="inp" value={p.riskTolerance || "balanced"} onChange={(e) => set("riskTolerance", e.target.value)}>
            <option value="stable">Prefer stable, established paths</option>
            <option value="balanced">Balanced</option>
            <option value="high-upside">Prefer high-upside (startups, etc.)</option>
          </select>
        </div>
        <div>
          <label className="lbl">Financial aid interest</label>
          <select className="inp" value={p.aidInterest ? "yes" : "no"} onChange={(e) => set("aidInterest", e.target.value === "yes")}>
            <option value="yes">Yes - aid/scholarships matter</option>
            <option value="no">No - not a primary concern</option>
          </select>
        </div>
      </div>

      {/* profile-action-* classes only matter on mobile (see styles.css) --
          they reorder this row into "Sample / Save / Reset" on one line
          then "See my college matches" full-width below, via CSS `order`
          and flex-basis. Desktop keeps this exact DOM order + marginLeft:auto
          push-right layout, untouched. */}
      <div className="row wrap profile-actions" style={{ gap: 10 }}>
        <button className="btn primary profile-action-submit" onClick={() => onSubmit(p)} disabled={!ready}>See my college matches →</button>
        <button className="btn ghost profile-action-sample" style={{ marginLeft: "auto" }} onClick={() => { const sp = { ...SAMPLE_PROFILE }; setP(sp); onLoadSample ? onLoadSample(sp) : onSave?.(sp); }}>Load sample profile</button>
        <button className="btn ghost profile-action-save" onClick={() => { onSave?.(p); setSavedMsg("Profile saved."); setTimeout(() => setSavedMsg(null), 2500); }}>Save profile</button>
        {onResetProfile && (
          <button className="btn ghost profile-action-reset" style={{ color: "var(--reach)" }}
            onClick={() => { if (confirm("Reset your profile to blank? This clears the fields you've entered here. Your saved college list and tracker are NOT affected.")) { const blank = { ...BLANK_PROFILE }; setP(blank); onResetProfile(blank); } }}>
            Reset profile
          </button>
        )}
      </div>
      {savedMsg && <div className="note" style={{ color: "var(--safety)" }}>{savedMsg}</div>}
      <span className="note">Pulls live data from College Scorecard. First run scans U.S. colleges and can take 20–60s, then it's cached.</span>
      {!ready && (
        <div className="disclaimer">
          To generate your college list, please complete: <strong>{missing.join(", ")}</strong>. Uploading documents is optional,
          but if you provide them the app will use that information too.
        </div>
      )}
    </div>
  );
}

// Searchable multi-select for a long option list (Academic interests). A flat
// chip grid stops being usable once the list grows past ~25 items, so this
// swaps in a type-to-filter dropdown while keeping the same underlying
// toggle-a-value-in-an-array behavior as the old chip grid. Selected values
// are shown as removable chips above the search box.
function InterestPicker({ options, selected, onToggle }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div ref={boxRef}>
      {selected.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {selected.map((i) => (
            <span key={i} className="chip on" onClick={() => onToggle(i)} style={{ cursor: "pointer" }} title="Click to remove">
              {i} ×
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          className="inp"
          placeholder={`Search ${options.length} subjects (e.g. "bio", "computer", "econ")...`}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
        {open && (
          <div className="card" style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            maxHeight: 260, overflowY: "auto", padding: 6,
          }}>
            {filtered.length === 0 && <div className="note" style={{ padding: 8 }}>No subjects match "{query}".</div>}
            {filtered.map((o) => (
              <div
                key={o}
                onClick={() => onToggle(o)}
                className="note"
                style={{
                  padding: "7px 8px", cursor: "pointer", borderRadius: 6, fontSize: 13.5,
                  background: selected.includes(o) ? "var(--target-b, #eef4fb)" : "transparent",
                  color: "var(--ink-900)", display: "flex", justifyContent: "space-between",
                }}
              >
                <span>{o}</span>
                {selected.includes(o) && <span>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const BLANK_PROFILE = {
  name: "", grade: 11, gradYear: null, highSchool: "", city: "", state: "", citizenship: "domestic",
  budget: null, costPref: "", aidInterest: true,
  gpa: null, gpaWeighted: null, gradingScale: "4.0", sat: null, satSuper: null, act: null, actSuper: null, psat: null,
  apCount: null, classRank: null, classSize: null, awards: "none", rigorHigh: false, firstGen: false,
  hasResearch: false, hasInternship: false, hasLeadership: false, hasVolunteer: false,
  willingED: false, testStrategy: "auto", activitiesText: "", activities: [],
  gradSchoolInterest: "maybe", incomeGoal: "", riskTolerance: "balanced",
  interests: [], careerGoals: [], preferredScenarioId: null, primaryMajor: null, secondaryMajor: null,
};

// Sample data for demo/testing only - loaded explicitly via a button, never
// silently pre-filled (a user must never generate matches from fake data).
export const SAMPLE_PROFILE = {
  ...BLANK_PROFILE,
  name: "Sample Student", grade: 11, gradYear: 2027, highSchool: "Example High School",
  city: "Princeton", state: "NJ", budget: 45000, costPref: "any",
  gpa: 4.0, gpaWeighted: 4.4, sat: 1520, apCount: 10, rigorHigh: true, awards: "national",
  hasResearch: true, hasInternship: false, hasLeadership: true, hasVolunteer: true,
  willingED: true, activitiesText: "Robotics team captain; independent AI research project; math olympiad.",
  interests: ["Computer Science", "Data Science"], careerGoals: ["High salary potential", "Research opportunities"],
  preferredScenarioId: "cs_ai_ds", primaryMajor: "Computer Science", secondaryMajor: "Data Science",
};
