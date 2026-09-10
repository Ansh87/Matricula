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
        <strong>Disclaimer:</strong> Matricula is an educational planning tool, not a counseling service or
        admissions office. Admissions are holistic and unpredictable, and Matricula's estimates are not guarantees.
        College costs, financial aid, deadlines, scholarships, programs, policies, and career outcomes can change
        over time. Always verify important information with official college sources, admissions and
        financial-aid offices, net price calculators, FAFSA/CSS Profile resources, and your school counselor
        before making decisions.
      </div>

      <div className="disclaimer">
        Matricula was developed by high school student Ansh Saini as an independent educational technology
        project to help students explore college, major, career, and application-planning options using
        data-driven tools.
      </div>
    </div>
  );
}
