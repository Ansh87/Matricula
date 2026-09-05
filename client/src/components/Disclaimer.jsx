// Disclaimer.jsx -- the app's AI/essay policy and general disclaimer, split
// out from About.jsx so "how it works" and "what to know before you rely on
// this" are two separate pages (More -> About vs. More -> Disclaimer).
import React from "react";

export function Disclaimer() {
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div>
        <div className="eyebrow">More</div>
        <h1>Disclaimer</h1>
      </div>

      <div className="disclaimer">
        <strong>AI &amp; essay policy.</strong> Matricula helps with brainstorming, outlining, prompt
        tracking, story mapping, and revision planning. It never generates a finished essay for submission and never
        presents any AI-written text as ready to submit. The student must write the final essay in their own voice
        and follow each college's own AI-use policy -- these vary by school and change over time, so check the
        official application portal before submitting.
      </div>

      <div className="disclaimer">
        <strong>Disclaimer.</strong> Matricula is a planning aid, not a counseling service or an
        admissions office. Admissions are holistic, competitive, and unpredictable, and these estimates are not
        guarantees. College costs, aid, deadlines, scholarship availability, program offerings, and career outcomes
        vary and change over time. Always confirm information with each college's official website, net price
        calculator, admissions and financial-aid offices, FAFSA/CSS Profile, and a qualified school counselor before
        making decisions.
      </div>
    </div>
  );
}
