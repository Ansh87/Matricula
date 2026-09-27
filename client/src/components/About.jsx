// About.jsx. The Help page. A short, visual product overview (not a
// walkthrough document): quick actions, feature cards, a step-by-step list,
// how scoring and rankings work, and the full disclaimer at the foot of the
// page. The disclaimer used to be a separate page (Disclaimer.jsx); it was
// folded in here so "how it works" and "what to know before you rely on it"
// are one read, and Help has no subtabs of its own.
import React from "react";
import { Arrow } from "./icons.jsx";

const FEATURES = [
  { t: "Build your profile", d: "Add SAT/GPA, coursework, interests, budget, goals, and resume so the app can personalize planning." },
  { t: "Explore colleges", d: "Search colleges, majors, programs, courses, and opportunities using official and public data where available." },
  { t: "Save and evaluate", d: "Save colleges to My List, import outside lists, compare options, and evaluate colleges against the student profile." },
  { t: "Plan decisions", d: "Build the final list, verify programs, track cost risk, scholarships, visits, and family strategy." },
  { t: "Apply", d: "Track applications, timelines, essays, recommendations, portals, and deadlines." },
  { t: "Export and review", d: "Download planning data and review saved work from Settings, under Data & Export." },
];


export function About({ onGo }) {
  const go = (view) => (onGo ? () => onGo(view) : undefined);
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div>
        <div className="eyebrow">What this app does and what it cannot promise</div>
        <h1>How Matricula works</h1>
      </div>

      {/* Quick action buttons */}
      {onGo && (
        <div className="row wrap about-actions" style={{ gap: 10 }}>
          <button className="btn amber" onClick={go("profile")}>Start with Profile <Arrow /></button>
          <button className="btn ghost" onClick={go("advisor")}>Open Advisor <Arrow /></button>
          <button className="btn ghost" onClick={go("saved")}>Go to My List <Arrow /></button>
        </div>
      )}

      {/* 3. Feature cards */}
      <div className="grid cols-3" style={{ gap: 12 }}>
        {FEATURES.map((f) => (
          <div key={f.t} className="card pad stack" style={{ gap: 4 }}>
            <h3 style={{ fontSize: 15 }}>{f.t}</h3>
            <p className="note" style={{ margin: 0 }}>{f.d}</p>
          </div>
        ))}
      </div>

      {/* 4.5. How Scoring Works. Every number below matches the actual
          rule-based engine (server/src/services/scoring.js), not marketing
          copy: real weights, real category thresholds, real fallback rules
          for missing data. Keep this in sync if scoring.js changes. */}
      <div className="card pad stack">
        <h3>How Scoring Works</h3>
        <p className="note" style={{ margin: 0 }}>
          Every score here is rule-based and transparent - built only from official College Scorecard data (admission
          rate, test ranges, net price, graduation rate, earnings) and what you enter in your Profile. Nothing is
          guessed to fill a gap: when real data for a factor isn't available, that factor is left out of the score
          rather than invented.
        </p>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>What each score means</div>
          <p className="note" style={{ margin: 0 }}>
            <strong>Overall Fit (0-100)</strong> is a single weighted number combining six sub-scores. <strong>Academic
            Fit</strong> compares your SAT/ACT to the college's midpoint (capped, so one test can't dominate), then
            layers in bounded nudges for GPA, weighted-GPA rigor, AP/IB/Honors count, course rigor, class rank, and
            research. <strong>Major/Program Fit</strong> checks official Scorecard field-of-study data for a
            bachelor's program matching your intended major(s). <strong>Financial Fit</strong> compares an estimated
            net cost to your stated budget, adjusted for your cost preference and in-state status. <strong>Career/ROI
            Fit</strong> weighs median post-enrollment earnings against typical debt burden. <strong>Outcome
            Fit</strong> averages graduation and retention rates. <strong>Extracurricular Strength</strong> reflects
            the activities, awards, leadership, and research you've entered. On the 28 colleges with verified Common
            Data Set selection factors, you may also see a separate <strong>Culture Fit</strong> score comparing your
            profile to what that specific college says it actually weights in admissions.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Which criteria are used</div>
          <p className="note" style={{ margin: 0 }}>
            Every input is either an official Scorecard field (admission rate, SAT/ACT middle-50% range, average net
            price or published tuition, graduation rate, retention rate, median earnings, median debt, field-of-study
            program data) or something you provided yourself (GPA, weighted GPA, test scores, AP/IB/Honors count,
            class rank, course rigor, research, leadership, awards, activities, budget, cost preference, intended
            majors). No third-party rankings, reviews, or estimates from outside sources are mixed in.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How criteria are weighted</div>
          <p className="note" style={{ margin: 0 }}>
            Overall Fit weights the six sub-scores as: Academic 25%, Major/Program 25%, Financial 15%, Career/ROI 15%,
            Outcome 10%, Extracurricular 10%. If a sub-score can't be computed for a college (say, it doesn't publish
            earnings data), that weight is dropped and the rest are re-normalized proportionally - a college isn't
            penalized in its Overall Fit just for publishing less data. Within Academic Fit specifically, the test-score
            component is capped at ±22 points and every other nudge (GPA, rigor, class rank, research, etc.) is
            individually capped, so no single input can swing the score on its own.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Difference between fit and admission likelihood</div>
          <p className="note" style={{ margin: 0 }}>
            <strong>Fit</strong> (Overall Fit and its sub-scores) measures how well a college matches your own
            academics, budget, major, and career goals - it says nothing about whether you'd get in. <strong>Admission
            likelihood</strong> is a separate calculation: it starts from the college's own published admission rate,
            then adjusts it based on how your academic strength and extracurricular strength compare to typical
            admits, and reports the result as a labeled range (Far Reach, Reach, Target, Likely, Safety, or Financial
            Safety) - never a precise percentage. Hard limits apply regardless of how strong a profile is: any college
            admitting under 10% of applicants is always at least a Reach. A college can be a strong Fit and still be a
            Reach for admission, or a modest Fit and a Safety - they're intentionally independent numbers.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How missing or unverified data affects results</div>
          <p className="note" style={{ margin: 0 }}>
            When a college doesn't publish a field a score depends on, that specific sub-score is shown as unavailable
            rather than guessed, and Overall Fit re-normalizes around whatever real data does exist. Major/Program Fit
            is treated the same way: if program data can't be verified for a college, it gets a neutral-low score -
            it is never scored as if a match were confirmed. For admission likelihood, a college with no published
            admission rate is labeled "Insufficient Data" instead of receiving a guessed category, and a would-be
            "Safety" or "Likely" call is automatically downgraded to "Target" whenever the college's overall data
            completeness is low or your academic standing relative to it can't be judged. Culture Fit only appears
            for the small set of colleges with verified Common Data Set selection factors on file - for every other
            college it's simply not shown, not estimated.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Why a college's program list may look different from its own website</div>
          <p className="note" style={{ margin: 0 }}>
            The "undergraduate programs" list on the Courses &amp; Programs page comes from a live call to the U.S.
            Department of Education College Scorecard API, which reports each college's official CIP (Classification
            of Instructional Programs) codes - the standardized federal taxonomy every college reports annually to
            IPEDS, used here so majors can be compared consistently across colleges. It is not scraped from the
            college's own website. A college's own site typically organizes the same real majors by its own
            department names or internal numbering (e.g. MIT's "Course" system) - a different, school-specific
            scheme built for browsing its site, not for cross-college comparison. This app then groups the official
            CIP titles into broad categories (Engineering, Computing &amp; Data, etc.) using simple keyword matching
            on the title, purely to make the list easier to scan. The underlying majors are the same real, official
            data either way; the labels and groupings you see can differ because the two systems serve different
            purposes. If something looks off, the college's own admissions or department site is always the final
            word - this list is a starting point for research, not a replacement for it.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Limitations and disclaimer</div>
          <p className="note" style={{ margin: 0 }}>
            This is a planning aid, not an admissions guarantee. Every score is an estimate built from official and
            public data plus your own entries - actual admissions decisions are holistic, unpredictable, and consider
            far more than any calculator can capture; even applicants who score well here are sometimes denied at
            highly selective schools, and applicants who score modestly are sometimes admitted. Official data can lag
            or be incomplete, so always confirm current program availability, costs, and deadlines directly on each
            college's own official website or application portal before making decisions.
            {" "}The full disclaimer is at the foot of this page.
          </p>
        </div>
      </div>

      {/* 4.6. How Rankings Are Built, a short companion note to "How Scoring
          Works" above: that section covers your personal Overall Fit and
          admission-likelihood numbers, this one covers the three curated/
          ranked lists (Top STEM/Finance/Business, Best Fit, Balanced List)
          and how each one decides what order colleges appear in. */}
      <div className="card pad stack">
        <h3>How Rankings Are Built</h3>
        <p className="note" style={{ margin: 0 }}>
          <strong>Top STEM / Finance / Business lists</strong> (Explore) are editorial rankings - a hand-curated
          ordering of undergraduate program reputation and outcomes in that field, clearly labeled as editorial and
          not an official government ranking. Each entry is enriched with live official College Scorecard data
          (admission rate, SAT range, net price, earnings) and, when you have a Profile, your own Overall Fit score.
        </p>
        <p className="note" style={{ margin: 0 }}>
          <strong>Best Fit</strong> (Matches) ranks the full matching college pool purely by score - your Overall Fit,
          or a blended scenario score if a major/career scenario is active - and shows the top results. Because it
          follows the score directly, it tends to be reach-heavy.
        </p>
        <p className="note" style={{ margin: 0 }}>
          <strong>Balanced List</strong> (Matches) doesn't just take the top scores - it fills a realistic
          Reach/Target/Safety mix (plus financial-safety and in-state-public slots where possible) for your chosen
          list size. If your matches can't fill a category, it says so honestly rather than relabeling a school's
          real category to make the numbers look complete.
        </p>
      </div>

      {/* Disclaimer. Formerly its own page under More; the whole of it now
          closes out the Help page so nothing about it is a click away. */}
      <div className="card pad stack" id="disclaimer">
        <h3>Disclaimer</h3>

        <div className="disclaimer">
          Matricula uses official and public data where available, including College Scorecard and
          college websites. College requirements, deadlines, essay prompts, costs, and program rules can change.
          Always verify final information using official college sources and application portals.
        </div>

        <div className="disclaimer">
          <strong>AI and essay policy.</strong> Matricula helps with brainstorming, outlining, prompt
          tracking, story mapping, and revision planning. It never generates a finished essay for submission and
          never presents any AI-written text as ready to submit. The student must write the final essay in their
          own voice and follow each college's own AI-use policy. These vary by school and change over time, so
          check the official application portal before submitting.
        </div>

        <div className="disclaimer">
          <strong>Planning aid, not advice.</strong> Matricula is an educational planning tool, not a counseling
          service or admissions office. Admissions are holistic and unpredictable, and Matricula's estimates are
          not guarantees. College costs, financial aid, deadlines, scholarships, programs, policies, and career
          outcomes can change over time. Always verify important information with official college sources,
          admissions and financial-aid offices, net price calculators, FAFSA/CSS Profile resources, and your
          school counselor before making decisions.
        </div>

        <div className="disclaimer">
          Matricula was developed by high school student Ansh Saini as an independent educational technology
          project to help students explore college, major, career, and application-planning options using
          data-driven tools.
        </div>
      </div>
    </div>
  );
}
