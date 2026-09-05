// PortalTracker.jsx - Apply -> Portal Tracker. There is no dedicated
// post-submission portal checklist system in the app yet (nothing to invent
// here), so this is an honest placeholder rather than a fake feature: it
// says plainly that this isn't tracked as its own system, and points to the
// closest real, already-working equivalent (the "Submitted" status field on
// each college's Applications Tracker card) instead of guessing at data that
// doesn't exist.
import React from "react";

export function PortalTracker({ onGo }) {
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Apply</div>
        <h1>Portal Tracker</h1>
        <p className="lead">A dedicated post-submission portal checklist (decision letters, enrollment deposit,
          housing, orientation, etc.) isn't built yet.</p>
      </div>
      <div className="card pad stack">
        <h3>What's available today</h3>
        <p className="note">Each saved college's <strong>Applications Tracker</strong> card already tracks its
          Submitted status and decision status. Open it there for now:</p>
        <button className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => onGo && onGo("applications")}>
          Open Applications Tracker →
        </button>
      </div>
      <div className="disclaimer">Needs review: there is no post-submission portal tracker yet.</div>
    </div>
  );
}
