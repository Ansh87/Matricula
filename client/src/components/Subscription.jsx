// Subscription.jsx - More -> Matricula. The native app's subscription entry
// point: status, "Unlock Matricula" (opens the RevenueCat dashboard paywall),
// and Restore Purchases. All subscription logic lives in useSubscription().
import React from "react";
import { useSubscription } from "../subscription/SubscriptionProvider.jsx";
import { UnlockMatriculaButton, MatriculaBadge, PREMIUM_FEATURES } from "../subscription/PremiumGate.jsx";
import { Spinner } from "./ui.jsx";

const INCLUDED = [
  ["College & Major Exploration", "Free", "Included"],
  ["Personalized Matches", "Limited", "Full results"],
  [PREMIUM_FEATURES.ai.title, "-", "Included"],
  [PREMIUM_FEATURES.apply.title, "-", "Included"],
  [PREMIUM_FEATURES.timeline.title, "-", "Included"],
];

export function Subscription({ onGo }) {
  const { gatingActive, isSubscriber, isLoading, customerInfo, restorePurchases, revenueCatAvailable } = useSubscription();
  const [restoring, setRestoring] = React.useState(false);

  if (!gatingActive) {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <div><div className="eyebrow">Subscription</div><h1>Matricula</h1></div>
        <div className="card pad note">Subscriptions are managed in the Matricula iOS app. Everything is available here on the website.</div>
      </div>
    );
  }

  const active = customerInfo?.entitlements?.active?.matricula;
  const restore = async () => { setRestoring(true); try { await restorePurchases(); } finally { setRestoring(false); } };

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div>
        <div className="eyebrow">Subscription</div>
        <h1>Matricula</h1>
        <p className="lead">From uncertainty to opportunity.</p>
      </div>

      <div className="card pad">
        {isLoading ? <Spinner label="Checking your subscription..." /> : isSubscriber ? (
          <>
            <div className="row spread"><strong style={{ fontSize: 16 }}>Matricula Active</strong><MatriculaBadge /></div>
            <p className="note" style={{ marginTop: 6 }}>
              Every Matricula feature is unlocked.
              {active?.expirationDate ? ` Renews or expires ${new Date(active.expirationDate).toLocaleDateString()}.` : ""}
            </p>
            {customerInfo?.managementURL && (
              <a className="link" href={customerInfo.managementURL} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                Manage subscription
              </a>
            )}
          </>
        ) : (
          <>
            <strong style={{ fontSize: 16 }}>Unlock Matricula</strong>
            <p className="note" style={{ marginTop: 6 }}>Turn college planning into a clear path forward.</p>
            <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
              <UnlockMatriculaButton />
              <button type="button" className="btn ghost sm" onClick={restore} disabled={restoring}>
                {restoring ? "Restoring..." : "Restore purchases"}
              </button>
            </div>
            {!revenueCatAvailable && (
              <p className="note" style={{ marginTop: 8, fontSize: 12 }}>Subscriptions are still connecting. Check your connection and try again.</p>
            )}
          </>
        )}
      </div>

      <div className="card pad">
        <table className="plan-compare">
          <thead><tr><th></th><th>Free</th><th>Matricula</th></tr></thead>
          <tbody>
            {INCLUDED.map(([name, free, paid]) => (
              <tr key={name}><td>{name}</td><td>{free}</td><td>{paid}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSubscriber && (
        <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={restore} disabled={restoring}>
          {restoring ? "Restoring..." : "Restore purchases"}
        </button>
      )}
    </div>
  );
}
