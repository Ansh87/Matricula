// App.jsx. Top-level shell. Routes between views, loads live recommendations,
// and persists the student's list to the backend DB.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api } from "./lib/api.js";
import matriculaIcon from "./assets/matricula-icon.png";
import { ProfileForm, BLANK_PROFILE } from "./components/ProfileForm.jsx";
import { Results } from "./components/Results.jsx";
import { CollegeDetail } from "./components/CollegeDetail.jsx";
import { Advisor } from "./components/Advisor.jsx";
import { Documents } from "./components/Documents.jsx";
import { Courses } from "./components/Courses.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { Majors } from "./components/Majors.jsx";
import { Matches } from "./components/Matches.jsx";
import { BrowseColleges } from "./components/BrowseColleges.jsx";
import { MyList } from "./components/MyList.jsx";
import { Programs } from "./components/Programs.jsx";
import { ApplicationPathways } from "./components/ApplicationPathways.jsx";
import { EssayCenter } from "./components/EssayCenter.jsx";
import { FinancialAid } from "./components/FinancialAid.jsx";
import { PortalTracker } from "./components/PortalTracker.jsx";
import { About } from "./components/About.jsx";
import { Settings } from "./components/Settings.jsx";
import { CareerCenter } from "./components/CareerCenter.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { mergeParsedIntoProfile } from "./lib/profileMerge.js";

// A stable signature of the profile fields that affect matching. Used to detect
// when recommendations are stale relative to the current profile.
function profileSignature(p) {
  if (!p) return "";
  // A short normalized fingerprint of activity text so extracurricular-strength
  // changes are detected, without bloating the signature with huge parsed docs.
  const actSig = String(p.activitiesText || p.summary || "").replace(/\s+/g, " ").trim().slice(0, 200);
  return JSON.stringify([
    p.state, p.gpa, p.gpaWeighted, p.sat, p.satSuper, p.act, p.actSuper, p.apCount,
    p.budget, p.costPref, p.testStrategy, p.rigorHigh, p.awards,
    p.hasResearch, p.hasInternship, p.hasLeadership, p.hasVolunteer,
    (p.interests || []).slice().sort(), (p.careerGoals || []).slice().sort(),
    p.preferredScenarioId, p.primaryMajor, p.secondaryMajor,
    actSig, p.gradSchoolInterest, p.incomeGoal, p.riskTolerance,
  ]);
}
import { Spinner, ErrorNote } from "./components/ui.jsx";
import { useAuth } from "./auth/AuthProvider.jsx";
import { isNativeIOS } from "./lib/platform.js";
import { Subscription } from "./components/Subscription.jsx";
import { PremiumGate } from "./subscription/PremiumGate.jsx";
import { useSubscription } from "./subscription/SubscriptionProvider.jsx";

const FALLBACK_STUDENT_ID = "local-student"; // used only when auth is unconfigured (dev)

function Logo() {
  return <img src={matriculaIcon} alt="Matricula" height="30" style={{ display: "block", width: "auto" }} />;
}

// Grouped top navigation. Seven families: Dashboard, Profile, Explore,
// My List & Plan, Essays, Apply, Help.
//
// `view` (below) remains the single source of truth for which page renders;
// SECTIONS is only used to (a) decide which top-level button + subtab row to
// highlight, and (b) build the subtab bar. Retired view keys are not broken
// links: VIEW_ALIASES further down forwards each one to wherever its content
// now lives, so every existing onGo("strategy") / onGo("applications") call
// elsewhere in the app keeps working untouched.
//
// A few subtabs point at a page that already has its own internal tab/mode
// switch (Majors.jsx's Single/Double major toggle, DecisionPlan.jsx's Final
// List / Course Plans / Timeline & Tasks switch). Those subtabs carry an
// `entry` hint (see lib/entryOverride.js) that lands the family on the right
// internal tab without rebuilding any of those pages.
const SECTIONS = [
  { key: "dashboard", label: "Dashboard", view: "dashboard" },
  { key: "profile", label: "Profile", view: "profile" },
  {
    key: "explore", label: "Explore",
    // "Courses & Prep" is no longer a nav entry. The page itself still
    // exists and is still reached from Advisor's "See course & prep plan"
    // and from Decision Plan's course plans; it just isn't a browsing
    // destination of its own any more.
    subtabs: [
      { key: "matches", label: "Matches", view: "matches" },
      { key: "browse", label: "Browse Colleges", view: "browse" },
      { key: "majors", label: "Majors", view: "majors" },
      { key: "programs", label: "Programs & Opportunities", view: "programs" },
      { key: "advisor", label: "Advisor", view: "advisor" },
    ],
  },
  {
    // "My List" and "Plan" were two separate families that a family had to
    // bounce between to work on the same set of colleges. They are one
    // family now: the saved list and everything you do to it.
    key: "plan", label: "My List & Plan",
    subtabs: [
      { key: "saved", label: "My List", view: "saved" },
      { key: "scholarships", label: "Financial Aid & Scholarships", view: "scholarships" },
      // "Career Planner" and "Careers (BLS)" answered two halves of one
      // question; CareerCenter.jsx now puts both behind one switch.
      { key: "careers", label: "Careers", view: "careers" },
    ],
  },
  // Essays is its own destination rather than a subtab of Apply: it is the
  // longest-running piece of work in the whole process.
  { key: "essays", label: "Essays", view: "essays" },
  // Apply is one page (ApplicationPathways.jsx). Timeline, route planning,
  // application records and the status tracker used to be four separate
  // views of the same colleges; they are one per-college flow now.
  { key: "apply", label: "Apply", view: "applicationPathways" },
  // Help carries the product guide and, at the bottom of the same page, the
  // full disclaimer. Settings moved out to the gear button in the header.
  { key: "help", label: "Help", view: "about" },
];

// Native iOS app only: a 5-tab bottom bar instead of 7 top-level buttons.
// Same pages, same view keys, same subtab rows.
const NATIVE_SECTIONS = [
  { key: "dashboard", label: "Home", view: "dashboard", icon: "home" },
  { ...SECTIONS.find((s) => s.key === "explore"), icon: "explore" },
  { ...SECTIONS.find((s) => s.key === "plan"), label: "Plan", icon: "plan" },
  { ...SECTIONS.find((s) => s.key === "apply"), icon: "apply" },
  {
    key: "more", label: "More", icon: "more",
    subtabs: [
      { key: "subscription", label: "Matricula", view: "subscription" },
      { key: "profile", label: "Profile", view: "profile" },
      { key: "essays", label: "Essays", view: "essays" },
      { key: "help", label: "Help", view: "about" },
      { key: "settings", label: "Settings", view: "settings" },
    ],
  },
];
const NAV_SECTIONS = isNativeIOS ? NATIVE_SECTIONS : SECTIONS;

// Settings gear for the header. Drawn here rather than in icons.jsx because
// it is chrome, not page content, and is sized for the dark topbar.
function GearIcon() {
  // A real cog: a toothed ring around a hub. The previous version was a
  // circle with straight spokes radiating outwards, which reads as a
  // brightness/sun control rather than settings.
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const cos = Math.cos(a), sin = Math.sin(a);
    // one tooth: a short trapezoid standing on the rim, rotated into place
    const r0 = 6.4, r1 = 9.2, half = 1.9;
    const pts = [[r0, -half], [r1, -half * 0.72], [r1, half * 0.72], [r0, half]]
      .map(([x, y]) => `${(12 + x * cos - y * sin).toFixed(2)},${(12 + x * sin + y * cos).toFixed(2)}`)
      .join(" ");
    return <polygon key={i} points={pts} fill="currentColor" />;
  });
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {teeth}
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function HeaderSubscriptionPill({ onOpen }) {
  const { isSubscriber, isLoading } = useSubscription();
  if (isLoading) return null;
  return (
    <button type="button" className={`sub-pill ${isSubscriber ? "on" : ""}`} onClick={onOpen}>
      {isSubscriber ? "Matricula Active" : "Unlock"}
    </button>
  );
}

// Simple line icons for the native tab bar (original, generic shapes).
function TabIcon({ name }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "home") return <svg {...common}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
  if (name === "explore") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
  if (name === "plan") return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (name === "apply") return <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>;
}

// view -> group key (top-level highlight), and view -> the subtab that
// should highlight by default when that view is reached WITHOUT going
// through a subtab click (e.g. an internal "Open Essay Center ->" button
// calling onGo("essays") directly). First subtab wins for the handful of
// views shared by more than one subtab.
const VIEW_TO_GROUP = {};
const VIEW_TO_DEFAULT_SUBKEY = {};
NAV_SECTIONS.forEach((sec) => {
  if (sec.view) VIEW_TO_GROUP[sec.view] = sec.key;
  (sec.subtabs || []).forEach((st) => {
    if (!(st.view in VIEW_TO_GROUP)) VIEW_TO_GROUP[st.view] = sec.key;
    if (!(st.view in VIEW_TO_DEFAULT_SUBKEY)) VIEW_TO_DEFAULT_SUBKEY[st.view] = st.key;
  });
});
// Pages that are still reachable from in-app links but are no longer a nav
// destination of their own. They keep their family's subtab bar showing so
// the family doesn't lose its place.
VIEW_TO_GROUP.courses = "explore";
VIEW_TO_DEFAULT_SUBKEY.courses = "matches";

// Retired view keys -> where that content lives now. Applied in goTo(), so
// every existing onGo("strategy") / onGo("applications") / onGo("disclaimer")
// call throughout the app lands in the right place without being rewritten.
const VIEW_ALIASES = {
  decisionPlan: "saved",                 // Decision Plan is gone; My List is the final list now
  applications: "applicationPathways",   // the tracker is part of the Apply page now
  financialAid: "scholarships",          // same page, one entry point
  careerPlanner: "careers",              // both career pages are one page now
  careersBLS: "careers",
  journey: "dashboard",                  // Journey and Strategy live on the home page
  strategy: "dashboard",
  disclaimer: "about",                   // the disclaimer is the foot of the Help page
  info: "about",
};
const resolveView = (v) => VIEW_ALIASES[v] || v;

export default function App() {
  const { user, signOut } = useAuth();
  // Per-user data key: the Firebase UID when signed in, else the dev fallback.
  const STUDENT_ID = user?.uid || FALLBACK_STUDENT_ID;
  // Every view change goes through resolveView, so a retired key like
  // "strategy" or "applications" lands on whatever page absorbed it.
  const [view, setViewRaw] = useState("dashboard");
  const setView = useCallback((v) => setViewRaw(resolveView(v)), []);
  // Optional college context carried along with a view switch. E.g. Decision
  // Plan's "View timeline" / "Go to Essay Center" jump straight to that
  // college's section instead of leaving the family to find it again. goTo is
  // passed down as `onGo`; existing onGo(view) calls (no second arg) keep
  // working exactly as before.
  const [focusCollegeId, setFocusCollegeId] = useState(null);
  const goTo = useCallback((nextView, collegeId) => {
    setFocusCollegeId(collegeId || null);
    setViewRaw(resolveView(nextView));
  }, []);

  // ---- Grouped navigation state (see SECTIONS above) ----
  // One-shot "entry" signals for the few subtabs that land on a page's own
  // internal tab/mode rather than a separate page (see lib/entryOverride.js).
  const [majorsEntry, setMajorsEntry] = useState({ mode: null, nonce: 0 });
  const [pathwaysEntry, setPathwaysEntry] = useState({ section: null, nonce: 0 });
  // Which subtab is highlighted within each group's subtab bar, keyed by
  // group. Defaults follow VIEW_TO_DEFAULT_SUBKEY whenever `view` changes;
  // an explicit subtab click always wins over that default for the handful
  // of subtabs that share a view with another subtab (see explicitClickRef).
  const [activeSub, setActiveSub] = useState({});
  const explicitClickRef = useRef(false);

  const currentGroupKey = VIEW_TO_GROUP[view] || null;

  useEffect(() => {
    if (explicitClickRef.current) return;
    const group = VIEW_TO_GROUP[view];
    const subKey = VIEW_TO_DEFAULT_SUBKEY[view];
    if (group && subKey) setActiveSub((s) => (s[group] === subKey ? s : { ...s, [group]: subKey }));
  }, [view]);
  // Clears the "just clicked a subtab" flag after every render (not just
  // ones where `view` changed). E.g. clicking between Decision Plan and
  // Verification Center never changes `view` (both point at "decisionPlan"),
  // so the effect above never runs to consume the flag itself. Without this,
  // the flag could stay stuck "true" and incorrectly suppress the next
  // legitimate default-subtab sync for an unrelated navigation.
  useEffect(() => { explicitClickRef.current = false; });

  // Subtab-bar click: navigate to the subtab's page and, if it carries an
  // `entry` hint, bump the matching one-shot entry signal so that page lands
  // on the right internal tab/mode.
  const openSection = useCallback((groupKey, sub) => {
    explicitClickRef.current = true;
    setActiveSub((s) => ({ ...s, [groupKey]: sub.key }));
    if (sub.entry?.mode !== undefined) setMajorsEntry((e) => ({ mode: sub.entry.mode, nonce: e.nonce + 1 }));
    if (sub.entry?.section !== undefined) setPathwaysEntry((e) => ({ section: sub.entry.section, nonce: e.nonce + 1 }));
    goTo(sub.view);
  }, [goTo]);

  // Top-level button click: groups with subtabs jump to their first/default
  // subtab (unless that group is already active. Then it's a no-op, the
  // subtab bar is already showing); standalone tabs (Dashboard/Profile/My
  // List) navigate directly.
  const openTopLevel = useCallback((sec) => {
    if (sec.subtabs) {
      if (currentGroupKey !== sec.key) openSection(sec.key, sec.subtabs[0]);
    } else {
      explicitClickRef.current = true;
      goTo(sec.view);
    }
  }, [currentGroupKey, openSection, goTo]);
  const [profile, setProfile] = useState(BLANK_PROFILE);
  // Track id requested from Advisor's "Run Matches for this track". Preselects
  // the scenario when Matches opens.
  const [advisorTrackId, setAdvisorTrackId] = useState(null);
  // Track id requested from Advisor's "See course & prep plan". Preselects
  // the track when Courses opens on the "By Career Track" sub-tab.
  const [courseTrackId, setCourseTrackId] = useState(null);
  // Explicit version counter. Bumped whenever the profile is replaced from
  // outside the form (saved load, parsed docs, reset, sample). ProfileForm
  // re-syncs on this, which is far more reliable than a JSON signature.
  const [profileVersion, setProfileVersion] = useState(0);
  const bumpProfile = (next) => { setProfile(next); setProfileVersion((v) => v + 1); };
  // Snapshot of the profile that produced the current recommendations, so we
  // can warn the user when their profile has changed since matching.
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [programVerification, setProgramVerification] = useState(null);
  const [recs, setRecs] = useState([]);
  const [scanned, setScanned] = useState(0);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [saved, setSaved] = useState([]); // list rows from DB

  const savedIds = useMemo(() => new Set(saved.map((s) => s.college_id)), [saved]);
  const collegeNames = useMemo(() => {
    const m = {};
    recs.forEach((r) => { m[r.college.id] = r.college.name; });
    saved.forEach((s) => { if (!m[s.college_id]) m[s.college_id] = s.college_name || s.name || s.college_id; });
    return m;
  }, [recs, saved]);

  // hydrate saved list + profile. Re-runs when the signed-in user changes so
  // each user loads only their own data.
  useEffect(() => { api.getList(STUDENT_ID).then((r) => setSaved(r.list || [])).catch(() => {}); }, [STUDENT_ID]);
  useEffect(() => {
    api.getStudent(STUDENT_ID).then((r) => {
      if (r && r.profile && Object.keys(r.profile).length) { setProfile((p) => ({ ...p, ...r.profile })); setProfileVersion((v) => v + 1); }
    }).catch(() => {});
  }, [STUDENT_ID]);

  const runRecommend = useCallback(async (p, filters) => {
    setLoading(true); setErr(null);
    setView("matches");
    try {
      await api.saveStudent(STUDENT_ID, p).catch(() => {});
      const r = await api.recommend(p, filters);
      setRecs(Array.isArray(r.recommendations) ? r.recommendations : []);
      setMeta(r.meta || null);
      setScanned(r.scanned || 0);
      setProgramVerification(r.programVerification || null);
      setMatchedProfile(profileSignature(p));
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  }, []);

  // Fields that actually change matching. If any differ, results are stale.
  const profileStale = matchedProfile && matchedProfile !== profileSignature(profile);

  const onSubmitProfile = (p) => { setProfile(p); runRecommend(p); };

  // Merge AI-extracted document fields into the profile (user reviews after).
  const [applyMsg, setApplyMsg] = useState(null);

  const applyParsed = (parsed) => {
    const { profile: next, applied } = mergeParsedIntoProfile(profile, parsed);

    // Infer experience flags from the raw parsed blob when the parser didn't
    // set them explicitly (keeps extracurricular strength accurate).
    const blob = JSON.stringify(parsed || {}).toLowerCase();
    if (next.hasInternship !== true && /intern/.test(blob)) { next.hasInternship = true; applied.push("hasInternship"); }
    if (next.hasLeadership !== true && /president|founder|captain|lead|chair|director/.test(blob)) { next.hasLeadership = true; applied.push("hasLeadership"); }
    if (next.hasVolunteer !== true && /volunteer|service/.test(blob)) { next.hasVolunteer = true; applied.push("hasVolunteer"); }
    if (next.hasResearch !== true && /research|patent|ieee|publication/.test(blob)) { next.hasResearch = true; applied.push("hasResearch"); }

    if (!applied.length) {
      setApplyMsg({ ok: false, text: "The document was read, but no profile fields could be confidently extracted. Please enter the missing fields manually." });
      setView("profile");
      return;
    }

    // Populate the form immediately, then persist. Save failures are surfaced,
    // never swallowed.
    bumpProfile(next);
    setView("profile");
    const pretty = [...new Set(applied)].map(prettyField).join(", ");
    api.saveStudent(STUDENT_ID, next).then(() => {
      setApplyMsg({ ok: true, text: `Profile updated from documents. Applied: ${pretty}. Review the profile and save/rerun matches.` });
      setMatchedProfile(null); // existing matches are now stale
    }).catch((e) => {
      setApplyMsg({ ok: false, text: `Profile fields were extracted, but saving failed: ${e.message}` });
    });
  };

const FIELD_LABELS = {
  gpa: "GPA", gpaWeighted: "weighted GPA", sat: "SAT", satSuper: "SAT superscore",
  act: "ACT", apCount: "AP count", classRank: "class rank", classSize: "class size",
  awards: "awards", interests: "intended majors", activitiesText: "activities",
  hasResearch: "research", hasInternship: "internship", hasLeadership: "leadership",
  hasVolunteer: "service", name: "name", highSchool: "high school", city: "city", state: "state",
};
function prettyField(k) { return FIELD_LABELS[k] || k; }

  // toggleSave(scored, opts, forceAdd)
  //   opts: optional selection-context fields merged into the saved row --
  //     { context, primaryMajor, secondaryMajor, doubleMajorLabel,
  //       doubleMajorStatus, doubleMajorVerificationStatus, doubleMajorNotes }.
  //     `context` should be one of the SELECTION_CONTEXTS labels (see
  //     server/src/services/selectionContext.js); the server merges it into
  //     the college's accumulated selection_contexts rather than overwriting.
  //   forceAdd: when true, never removes an already-saved college. Used by
  //     "Add as double-major option" so re-adding a college that's already on
  //     the list (from a different search) merges in the new pathway instead
  //     of toggling it off.
  const toggleSave = async (scored, opts = {}, forceAdd = false) => {
    const col = scored.college || {};
    const cid = col.id;
    if (!cid) return;
    if (savedIds.has(cid) && !forceAdd) {
      setSaved((s) => s.filter((x) => x.college_id !== cid));
      api.removeListItem(STUDENT_ID, cid).catch(() => {});
      return;
    }
    const adm = scored.admission || {};
    const subs = scored.subs || {};
    const row = {
      college_id: cid, name: col.name || cid, college_name: col.name || cid,
      city: col.city || null, state: col.state || null,
      category: adm.category || null, range: adm.range || null,
      overall: scored.overall ?? null, overall_fit_score: scored.overall ?? null,
      academic: subs.academic ?? null,
      career: subs.career ?? null, financial: subs.financial ?? null, status: "Considering",
      // Same Fit/Admit/Est.cost/Major fit values MatchCard already shows --
      // persisted here too so a freshly-saved My List card can show them
      // right away, not just after a later "Evaluate Against My Profile" run.
      major: subs.major ?? null, major_fit_score: subs.major ?? null,
      admissionRate: col.admissionRate ?? null, admission_rate: col.admissionRate ?? null,
      netCost: scored.netCost ?? null, estimated_net_cost: scored.netCost ?? null,
      ...opts,
    };
    setSaved((s) => (s.some((x) => x.college_id === cid) ? s : [...s, row]));
    try {
      await api.saveListItem(STUDENT_ID, cid, row);
      // Re-fetch so merged server-side fields (accumulated selection contexts,
      // double-major pathways) are reflected exactly, not guessed client-side.
      const r = await api.getList(STUDENT_ID);
      setSaved(r.list || []);
    } catch { /* saved list keeps the optimistic row; next load will reconcile */ }
  };

  // Direct remove (used by My list). Avoids relying on a full scored object.
  const removeFromList = (cid) => {
    setSaved((s) => s.filter((x) => x.college_id !== cid));
    api.removeListItem(STUDENT_ID, cid).catch(() => {});
  };

  // Clear the entire saved list (profile + tracker untouched).
  const clearList = () => {
    const ids = saved.map((s) => s.college_id);
    setSaved([]);
    ids.forEach((cid) => api.removeListItem(STUDENT_ID, cid).catch(() => {}));
  };

  // Re-fetch the saved list from the server. Used after Import College List
  // confirms a batch (the server already wrote merged rows; this just
  // reconciles local state with what actually landed in the database, same
  // as toggleSave's own re-fetch above).
  const refreshSaved = () => api.getList(STUDENT_ID).then((r) => setSaved(r.list || [])).catch(() => {});

  // "Evaluate Against My Profile" (My List): the evaluate route already
  // returns the freshly re-scored list, so just push it straight into state
  // instead of a second round trip through refreshSaved/getList.
  const applyEvaluatedList = (list) => setSaved(Array.isArray(list) ? list : []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner topbar-stack">
          <div className="row spread" style={{ width: "100%", alignItems: "center" }}>
            <div className="brand" role="button" onClick={() => goTo("dashboard")} style={{ cursor: "pointer" }}>
              <Logo />
              <span>Matricula
                <small className="brand-desc-desktop">A College, Program, Course, and Application Strategy Platform</small>
                <small className="brand-desc-mobile">College Planning Hub</small>
              </span>
            </div>
            {/* Mobile-only sign-out control, kept on the same first row as the
                brand so it's never hidden or scrolled off-screen on phones.
                Hidden on desktop (that layout keeps sign-out on the nav row,
                see .user-menu below); .topbar .user-menu-mobile in styles.css
                is the sole place that toggles which one is visible. */}
            <div className="header-actions">
              {/* iOS app only: compact subscription status (Matricula Active /
                  Unlock). Opens More -> Matricula. Never shown on the website. */}
              {isNativeIOS && user && <HeaderSubscriptionPill onOpen={() => goTo("subscription")} />}
              {/* Settings is no longer a nav entry. It lives here, as a gear,
                  because it is a place you visit occasionally rather than a
                  stage of the planning process. */}
              <button type="button" className={`gear-btn ${view === "settings" ? "on" : ""}`}
                title="Settings" aria-label="Settings" aria-current={view === "settings" ? "page" : undefined}
                onClick={() => goTo("settings")}>
                <GearIcon />
              </button>
              {user && (
                <div className="user-menu-mobile">
                  <button className="btn sm ghost" onClick={() => signOut().catch(() => {})}>Sign out</button>
                </div>
              )}
            </div>
          </div>

          {/* Nav + sign-in/out share one row on desktop (space-between keeps nav
              left-aligned and the user-menu pinned to the far right) instead of
              stacking as two separate rows. Mobile is unaffected: its own
              media-query override on .nav.nav-row below still fully controls
              width/scrolling there, and .topbar .user-menu is already
              display:none on mobile regardless of this wrapper. */}
          <div className="row spread" style={{ width: "100%" }}>
            <nav className="nav nav-row">
              {NAV_SECTIONS.map((sec) => (
                <button key={sec.key} className={currentGroupKey === sec.key ? "active" : ""} onClick={() => openTopLevel(sec)}>
                  {sec.label}
                </button>
              ))}
            </nav>

            {user && (
              <div className="user-menu">
                <span className="user-email">
                  Signed in as {user.email || user.displayName || (user.isAnonymous ? "Guest" : "user")}
                </span>
                <button className="btn sm ghost" onClick={() => signOut().catch(() => {})}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {currentGroupKey && NAV_SECTIONS.find((s) => s.key === currentGroupKey)?.subtabs && (
          <nav className="nav subnav">
            {NAV_SECTIONS.find((s) => s.key === currentGroupKey).subtabs.map((st) => (
              <button key={st.key}
                className={(activeSub[currentGroupKey] || NAV_SECTIONS.find((s) => s.key === currentGroupKey).subtabs[0].key) === st.key ? "active" : ""}
                onClick={() => openSection(currentGroupKey, st)}>
                {st.label}
              </button>
            ))}
          </nav>
        )}
        <ErrorBoundary resetKey={view}>
          {view === "about" && <About onGo={setView} />}
          {view === "profile" && <ProfileForm initial={profile} onSubmit={onSubmitProfile} studentId={STUDENT_ID} onApplyParsed={applyParsed} applyMsg={applyMsg} profileVersion={profileVersion} onLoadSample={(sp) => { bumpProfile(sp); api.saveStudent(STUDENT_ID, sp).catch(() => {}); }}
            onSave={(p) => { setProfile(p); api.saveStudent(STUDENT_ID, p).catch(() => {}); }}
            onResetProfile={(blank) => { bumpProfile(blank); api.saveStudent(STUDENT_ID, blank).catch(() => {}); }} />}
          {view === "courses" && <Courses onOpen={setDetailId} studentId={STUDENT_ID} profile={profile} initialTrackId={courseTrackId} />}
          {view === "dashboard" && <Dashboard profile={profile} saved={saved} recs={recs} studentId={STUDENT_ID} onGo={goTo} />}
          {view === "majors" && <Majors profile={profile} studentId={STUDENT_ID} onOpen={setDetailId} onToggleSave={toggleSave} savedIds={savedIds}
            entryMode={majorsEntry.mode} entryNonce={majorsEntry.nonce} />}

          {view === "matches" && (
            <Matches
              profile={profile} recs={recs} loading={loading} err={err}
              savedIds={savedIds} onOpen={setDetailId} onToggleSave={toggleSave}
              onGoProfile={() => setView("profile")} onRerun={() => runRecommend(profile)}
              profileStale={profileStale} scanned={scanned} initialScenarioId={advisorTrackId}
              studentId={STUDENT_ID}
            />
          )}

          {view === "browse" && (
            <BrowseColleges profile={profile} onOpen={setDetailId}
              savedIds={savedIds} onToggleSave={toggleSave} studentId={STUDENT_ID} />
          )}

          {view === "saved" && (
            <MyList studentId={STUDENT_ID} saved={saved} profile={profile} onOpen={setDetailId}
              onRemove={removeFromList} onClearAll={clearList} onGo={goTo} onImported={refreshSaved}
              onEvaluated={applyEvaluatedList} />
          )}

          {view === "programs" && <Programs studentId={STUDENT_ID} profile={profile} saved={saved} />}
          {/* Premium (Matricula) features in the iOS app: Application & Essay
              Planning, Planning Timeline, AI-Powered Planning. PremiumGate is a
              pass-through on the website, so Railway behaves exactly as before. */}
          {view === "applicationPathways" && (
            <PremiumGate feature="apply">
              <ApplicationPathways studentId={STUDENT_ID} saved={saved} collegeNames={collegeNames} onGo={goTo} focusCollegeId={view === "applicationPathways" ? focusCollegeId : null}
                focusSection={pathwaysEntry.section} focusSectionNonce={pathwaysEntry.nonce} />
            </PremiumGate>
          )}
          {view === "essays" && (
            <PremiumGate feature="apply">
              <EssayCenter studentId={STUDENT_ID} saved={saved} collegeNames={collegeNames} onGo={goTo} focusCollegeId={view === "essays" ? focusCollegeId : null} />
            </PremiumGate>
          )}

          {view === "scholarships" && <FinancialAid studentId={STUDENT_ID} profile={profile} initialTab="scholarships" />}
          {view === "portalTracker" && <PortalTracker onGo={goTo} />}
          {view === "careers" && <CareerCenter profileInterests={profile.interests} />}
          {view === "settings" && <Settings user={user} studentId={STUDENT_ID} onSignOut={() => signOut().catch(() => {})} onGo={goTo} />}
          {view === "subscription" && <Subscription onGo={goTo} />}
          {view === "advisor" && <PremiumGate feature="ai"><Advisor profile={profile} recs={recs} onRunMatches={(trackId) => {
            setAdvisorTrackId(trackId);
            // Run/re-run recommendations if none are loaded yet or the profile is
            // stale; runRecommend already switches to the Matches view. Otherwise
            // just open Matches (data is current). No scoring change.
            if (!recs.length || profileStale) runRecommend(profile);
            else setView("matches");
          }} onViewCoursePlan={(trackId) => { setCourseTrackId(trackId); setView("courses"); }} /></PremiumGate>}
        </ErrorBoundary>
      </main>

      {/* Native iOS app only: bottom tab bar (Home / Explore / Plan / Apply /
          More). The website keeps its existing top navigation. */}
      {isNativeIOS && (
        <nav className="native-tabbar" aria-label="Main">
          {NAV_SECTIONS.map((sec) => (
            <button key={sec.key} type="button"
              className={currentGroupKey === sec.key ? "active" : ""}
              aria-current={currentGroupKey === sec.key ? "page" : undefined}
              onClick={() => { openTopLevel(sec); window.scrollTo(0, 0); }}>
              <TabIcon name={sec.icon} />
              <span>{sec.label}</span>
            </button>
          ))}
        </nav>
      )}

      {detailId && (
        <ErrorBoundary resetKey={detailId}>
          <CollegeDetail collegeId={detailId} profile={profile} fallbackName={collegeNames[detailId]} onClose={() => setDetailId(null)} onOpenOther={(id) => setDetailId(id)} />
        </ErrorBoundary>
      )}
    </div>
  );
}

