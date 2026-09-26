// PremiumGate.jsx - the one reusable "is this a Matricula (premium) feature?"
// wrapper. No component checks entitlements itself; they wrap premium content
// in <PremiumGate feature="..."> and this decides what to show.
//
//  - Website (Railway): always renders children. Nothing is gated on the web.
//  - iOS app + active `matricula` entitlement: renders children.
//  - iOS app, free user: a short preview of what the feature does plus
//    "Unlock Matricula", which opens the RevenueCat dashboard paywall.
//    Buying (or restoring) unlocks the content immediately, no restart.
import React from "react";
import { useSubscription } from "./SubscriptionProvider.jsx";
import { Spinner } from "../components/ui.jsx";

// Feature names match the FREE vs MATRICULA rows on the RevenueCat paywall.
export const PREMIUM_FEATURES = {
  ai: {
    title: "AI-Powered Planning",
    body: "Ask Matricula's advisor about your list, majors, and next steps. Answers are grounded in your profile, your saved colleges, and official College Scorecard and BLS data.",
    points: ["Personalized answers about your college list", "Career-track suggestions tied to your majors", "One tap to run Matches or open a course plan"],
  },
  apply: {
    title: "Application & Essay Planning",
    body: "Plan every application in one place: pathways and platforms for each college, essay prompts and deadlines, a story bank, and an applications tracker.",
    points: ["Essay prompts and deadlines by college", "Application pathways and platforms", "Applications tracker for every school"],
  },
  timeline: {
    title: "Planning Timeline",
    body: "Turn your final list into a dated plan: deadlines, visits, and tasks across every college, so nothing slips.",
    points: ["All deadlines and tasks in one timeline", "Tasks linked to each college on your list", "Export your plan any time"],
  },
};

export function MatriculaBadge() {
  return <span className="matricula-badge" title="Included with Matricula">Matricula</span>;
}

// Reusable "Unlock Matricula" button. `ifNeeded` = opened from a gated
// feature (RevenueCat skips the paywall if `matricula` is already active).
export function UnlockMatriculaButton({ ifNeeded = false, className = "btn amber", label = "Unlock Matricula" }) {
  const { showPaywall } = useSubscription();
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try { await showPaywall({ ifNeeded }); } finally { setBusy(false); }
  };
  return <button type="button" className={className} onClick={open} disabled={busy}>{busy ? "Opening..." : label}</button>;
}

export function PremiumGate({ feature, children }) {
  const { hasPremiumAccess, isLoading, revenueCatAvailable, restorePurchases } = useSubscription();
  if (hasPremiumAccess) return children;
  if (isLoading) return <div className="card pad"><Spinner label="Checking your Matricula access..." /></div>;

  const f = PREMIUM_FEATURES[feature] || { title: "Matricula feature", body: "This is part of Matricula.", points: [] };
  return (
    <div className="card pad premium-gate">
      <div className="row spread" style={{ alignItems: "flex-start" }}>
        <h2 style={{ fontSize: 22 }}>{f.title}</h2>
        <MatriculaBadge />
      </div>
      <p className="note" style={{ fontSize: 13.5, marginTop: 6 }}>{f.body}</p>
      {f.points.length > 0 && (
        <ul className="premium-points">
          {f.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="note" style={{ marginTop: 4 }}>Included with Matricula. College and major exploration stay free.</p>
      <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
        <UnlockMatriculaButton ifNeeded />
        <button type="button" className="btn ghost sm" onClick={() => restorePurchases()}>Restore purchases</button>
      </div>
      {!revenueCatAvailable && (
        <p className="note" style={{ marginTop: 8, fontSize: 12 }}>
          Subscriptions are still connecting. If the paywall doesn't open, check your connection and try again.
        </p>
      )}
    </div>
  );
}
