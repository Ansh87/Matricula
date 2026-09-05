# Matricula - live-data edition

A college, major, career, and admissions planning app for high school students and
their families. Unlike a demo, it runs on **official data**:

- **Colleges** - U.S. Department of Education **College Scorecard** API (admission
  rate, SAT/ACT, tuition, average net price, graduation & retention rates, median
  earnings, median debt, size).
- **Careers** - U.S. **Bureau of Labor Statistics** Occupational Outlook Handbook
  (median pay, projected growth, entry education), mapped from majors.
- **Admissions details** - manually verified from each college's official
  admissions site / Common Data Set (rounds offered, testing policy, essays,
  CSS Profile, deadlines), each stored with a source URL, year, review date, and
  confidence level.

Every value in the UI wears a **provenance badge**: `Official`, `Verified`,
`Estimated`, or `Unavailable`. Nothing is invented - if a field isn't published,
the app shows **"Data unavailable"** or **"Not publicly available - verify with the
college's admissions office."**

API keys live only on the server. The browser talks solely to the app's own
`/api/*` routes.

---

## Second-generation features: Programs + Decision Plan

This app adds two new tabs on top of the original single-page planner:

**Programs** (Program Discovery) finds and organizes real college opportunities beyond
just majors -- minors, concentrations, certificates, honors/scholars/bridge programs,
research programs, and other special opportunities. Three layers, all source-labeled:

1. Seed from College Scorecard / CIP field-of-study data (broad, institution-level evidence).
2. Add an official URL (program page, admissions page, Common Data Set, net price
   calculator, etc.) -- the server fetches that one page and extracts structured fields.
3. Bounded, same-domain discovery from a college's official site (max 25 pages, max
   depth 2, robots.txt-aware, PDFs skipped by default, every page cached and source-linked).

Every record shows its source, last-checked date, a confidence level, and a
verification status (Official source verified / College Scorecard-CIP inferred / User
verified / Needs manual verification / Outdated-needs recheck / Not relevant). Nothing
is invented -- automatic extraction that finds no clear fields is labeled accordingly,
never guessed.

**Decision Plan** is the family's working area: a Final Application List Builder
(Dream/Reach/Target/Safety/Financial Safety/In-state Anchor), a Program Verification
Checklist per college/program, major-specific admission-risk tracking (with an
automatic caution warning for historically impacted/direct-admit fields like CS,
engineering, business, data science, and nursing when school-specific risk is
unknown), cost-risk and net-price tracking, auto-generated Strategy Notes (why this
college/program, best application round, essay angle, risks, actions before applying,
questions for admissions -- template-driven from your profile and recorded evidence,
never fabricated), a Course & Preparation Plan per Career Track, a timeline/task
tracker, and CSV export.

All of this data -- programs, sources, decision items, checklists, strategy notes, and
tasks -- is stored in its own SQLite tables and isolated by Firebase UID, exactly like
the existing profile/list/tracker data. See `server/src/db/database.js` for the schema
and `server/src/routes/programs.js` / `server/src/routes/decisionPlan.js` for the API.

A note on live network calls: fetching an official URL (Layer 2) and the bounded
domain crawl (Layer 3) both require outbound internet access from the server. They
were built and tested for correct request handling, error handling, and safe bounds,
but could not be exercised against real college websites in the sandbox used to build
this app (no general outbound internet there). Test them against a real official URL
once the server is running with normal internet access.

---

## Architecture

```
client/   React + Vite single-page app  (talks only to /api/*)
server/   Node + Express API             (holds keys, calls Scorecard/BLS, caches)
          └─ SQLite via built-in node:sqlite  (no native build step)
```

- **Recommendation engine** (`server/src/services/scoring.js`) computes academic,
  financial, career, and outcome fit from real Scorecard fields, then a
  Reach/Target/Safety category with an admission-probability **range** (never a
  false-precision percentage). Missing inputs yield `null` sub-scores, never guesses.
- **Caching** - live responses are cached in SQLite (`api_cache`) for 24h by
  default. If a live call fails and a cache exists, the cached copy is served and
  flagged; if it's older than the stale threshold it's marked stale. If there's no
  cache, the app returns an honest error rather than fake data.

---

## Requirements

- **Node.js 22.5+** (uses the built-in `node:sqlite` module - no compiler needed).
  Check with `node --version`.

---

## Environment variables

Set these in `server/.env` (copy from `server/.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `COLLEGE_SCORECARD_API_KEY` | Recommended | College Scorecard key. Falls back to public `DEMO_KEY` if unset. |
| `BLS_API_KEY` | Optional | Raises BLS API limits. Career pages use a bundled dated snapshot if unset. |
| `GEMINI_API_KEY` | Optional | Enables AI auto-fill of your profile from uploaded transcripts/resumes. Free key at aistudio.google.com/apikey. Without it, uploads work and you confirm fields manually. |
| `UPLOAD_DIR` | Optional | Where uploaded documents are stored (default `./uploads`). On Railway, set to a mounted volume path, e.g. `/data/uploads` (see DEPLOYMENT.md). |
| `PORT` | Optional | Server port (default 4000). |
| `CACHE_TTL_MS` | Optional | Live-response cache lifetime (default 24h). |
| `STALE_AFTER_MS` | Optional | Age after which cached data is flagged stale (default 7d). |
| `DB_PATH` | Optional | SQLite file path (default `./matricula.db`). On Railway, set to a mounted volume path, e.g. `/data/matricula.db` for a brand-new deploy -- but if you're redeploying an EXISTING Railway project, leave `DB_PATH` at whatever it's already set to (e.g. `/data/collegegene-navigator.db`) so you don't orphan your real saved data (see DEPLOYMENT.md). |

### Getting API keys

- **College Scorecard** - free, ~1 minute: https://api.data.gov/signup/
  (The same `api.data.gov` key works across federal APIs.)
- **BLS** (optional) - free: https://data.bls.gov/registrationEngine/

You can run the app with **no keys at all** thanks to the Scorecard `DEMO_KEY`
(rate-limited to 1,000 requests/hour) and the bundled BLS snapshot.

---

## Run locally

```bash
# 1. install everything
npm run install:all

# 2. configure keys (optional but recommended)
cp server/.env.example server/.env
#   then edit server/.env and paste your COLLEGE_SCORECARD_API_KEY

# 3. import verified admissions profiles + BLS career tables into SQLite
npm run import

# --- Development (two terminals, hot reload) ---
npm run dev:server     # Express on http://localhost:4000
npm run dev:client     # Vite on   http://localhost:5173  (proxies /api -> :4000)
# open http://localhost:5173

# --- Or single-process production mode ---
npm run build:client   # builds client/dist
npm run start          # Express serves API + the built client on :4000
# open http://localhost:4000
```

---

## Refreshing data

- **Live College Scorecard / BLS** - refreshed automatically on request; cached
  for `CACHE_TTL_MS`. To force-refresh, delete the `api_cache` rows (or the
  `.db` file) and reload.
- **Verified admissions profiles, selection profiles + career tables** - re-run
  `npm run import` after editing `server/src/db/importVerified.js` (verified
  admissions details), `server/src/db/selectionSeed.js` (selection / "what they
  want" / culture / major-strategy profiles), or `server/src/db/careerSeed.js`
  (BLS-sourced career figures). This is the admin/import process; each record
  carries a source URL, year, and confidence level. To refresh BLS OOH numbers, update the values there with the current
  Handbook figures and re-import.

---

## Deploy

The app is a standard Node server + static build.

**Single service (simplest):** build the client, then run the server (it serves
`client/dist`). Works on Render, Railway, Fly.io, a VPS, etc.

```bash
npm run build:client
# set env vars (COLLEGE_SCORECARD_API_KEY, etc.) in your host's dashboard
cd server && npm start
```

- Set `PORT` per your host's requirement.
- Persist the SQLite file on a mounted volume (or point `DB_PATH` at one) so saved
  lists, trackers, and cache survive restarts.
- Run `npm run import` once after first deploy (or as a release step).
- **Railway specifically:** the filesystem is ephemeral and is wiped on every
  redeploy/restart. Add a persistent Volume mounted at `/data`, then set
  `DB_PATH=/data/matricula.db` and `UPLOAD_DIR=/data/uploads` (new deploy) so
  profiles, saved lists, Programs & Opportunities records, and Decision Plans
  survive deploys. **Redeploying an existing project?** Do not change `DB_PATH`
  from whatever it's already set to -- changing it points the app at a new,
  empty database and makes your existing saved data appear to vanish. Full
  walkthrough (including Firebase setup) in `DEPLOYMENT.md`.

**Split hosting:** deploy `server/` as the API and host `client/dist` on any static
host; set the client's `/api` calls to your API origin (add a rewrite/proxy, or
change `fetch` base URL in `client/src/lib/api.js`).

---

## API routes (server)

```
GET  /api/health
GET  /api/colleges/search?name=&state=&page=
GET  /api/colleges/by-state?state=NJ&page=
GET  /api/colleges/by-major?major=&state=&page=
GET  /api/colleges/:id                 # official + verified + selection merged
POST /api/colleges/:id/fit             # { profile } -> culture/selection fit
GET  /api/colleges/:id/major-strategy?interests=CS,Finance
GET  /api/colleges/simulator/levers      # what-if levers
POST /api/colleges/:id/simulate          # { profile, levers[] } -> before/after category
GET  /api/colleges/top-stem?limit=30     # curated Top-30 STEM colleges + live data
POST /api/colleges/top-stem/fit          # { profile } -> Top STEM ranked with your fit
POST /api/colleges/score               # { profile, collegeId }
POST /api/colleges/recommend           # { profile } -> ranked scored list (Top-N + culture fit)
GET  /api/careers/majors
GET  /api/careers/major/:name
GET  /api/careers/occupation/:key
PUT  /api/students/:id                  # save profile
GET  /api/students/:id/list  · PUT/DELETE /api/students/:id/list/:collegeId
GET  /api/students/:id/tracker · PUT /api/students/:id/tracker/:collegeId
POST /api/advisor/ask                   # grounded explanation of your list
```

---

## What's built (MVP scope)

Profile form · live College Scorecard search · college detail with official +
verified data · **"what each college wants" selection profiles** (how they select,
what they weight from the Common Data Set, and their culture) · **your culture &
selection-fit score** against what a specific college actually rewards · **which-
major-to-apply-to strategy** (impacted majors, direct-admit vs. transfer-in,
switch-later feasibility) · **Top 30 STEM colleges ranking** (with your fit + live outcomes) · **what-if admission simulator** (SAT +100, add research, apply early → see category shift) · saved list · **Top 10 / 20 / 30 ranked views** plus
Reach/Target/Safety estimator · fit + ROI scoring · major→career (BLS) explorer ·
application & deadline tracker · manual verified-data overrides · grounded advisor ·
source labels + disclaimers throughout · student & parent notes · CSV export.

### "What each college wants" - verified selection profiles

28 colleges across all tiers are seeded with verified selection data - MIT, Stanford,
Princeton, Harvard, Yale, Columbia, Cornell, UPenn, Brown, Dartmouth, CMU,
Northwestern, Duke, Johns Hopkins, Caltech, UC Berkeley, UCLA, USC, Georgia Tech,
UIUC, Purdue, Michigan, UT Austin, Rutgers, NJIT, Penn State, Maryland, and Stevens. Each profile carries:

- **Admission factors** rated Very Important / Important / Considered / Not
  Considered, mirroring the college's Common Data Set section C7.
- **How they select** and **what they look for** in prose.
- **Culture** tags + vibe.
- **Major competitiveness** (which majors are hardest, e.g. CS at Georgia Tech or
  Berkeley EECS) and whether admission is by-major or whole-institution.
- **Switch-major feasibility** after enrolling (easy vs. GPA-gated internal transfer).
- Source URL, year, review date, confidence level.

The **culture-fit engine** compares the student's own profile against the factors
*that college* weights most and returns an explainable score with aligned strengths
and gaps - honestly framed as an estimate from stated priorities, not a prediction.

The **major-strategy engine** gives honest guidance: it flags impacted majors, warns
when switching in later is hard by design, and explicitly refuses to pitch an
insincere "easier major backdoor." Colleges without a verified profile show an honest
"verify on the official site" message rather than invented claims.

Deliberately **not** in v1 (per spec): scholarship search, counselor dashboard,
full essay review.

---

## Uploading documents (transcript / resume / portfolio)

The **Documents** tab lets you upload PDFs or text files. Files are stored on your
own server's disk (the `uploads/` folder) and their text is extracted **locally** -
nothing is sent anywhere by default.

Optional AI auto-fill: if you set a free `GEMINI_API_KEY`, an "Auto-fill" button
appears on each uploaded document. It sends the extracted *text* (not the raw file)
to Google Gemini, which returns structured fields (GPA, SAT/ACT, AP count, rank,
activities) that you review and then apply to your profile. Without a key, uploads
still work and you enter fields yourself. Note: on Google's free tier, inputs may be
used to improve their models - the app states this on the upload screen so the choice
is informed. To use a stronger no-training privacy guarantee, use a paid Gemini tier
or swap the provider.

## Reading documents into your college list (the full loop)

With a free `GEMINI_API_KEY` set, the **Profile** screen's document section can read
your transcript, resume, and portfolio **together** and build a structured profile -
GPA, rigor, scores, plus your activities, awards, research, and projects. Those
extracurriculars now feed an **extracurricular-strength score** that nudges your
admission chances at holistic colleges (so real accomplishments - a patent, an IEEE
paper, founder roles - move the needle, not just GPA/SAT). Portfolios can be added as
a **link** (Netlify, GitHub, personal site); the app fetches and reads the page text.
Without a Gemini key, uploads still store and show text; you map fields yourself.

The college match is generated only once the required fields (state, GPA, SAT or ACT,
at least one intended major, budget) are complete. Documents are optional but used if
provided.

## College programs / courses explorer

The **Courses** tab lets you search any college by name and see its undergraduate and
engineering programs (live from College Scorecard's field-of-study data), plus verified
**major combinations and dual-degrees** for seeded colleges (e.g. MIT's 6-14 CS+Econ+Data
Science, Penn's M&T, Georgia Tech's CS Threads). Program availability is official;
combinations are verified for seeded schools and otherwise point you to the college site.

## Backing up your data

Your profile, saved list, tracker, and documents live in the SQLite database on disk.

There is no full database backup route for security reasons. Use authenticated
per-user CSV exports for Decision Plan, Programs & Opportunities, Tasks,
Application Timeline, and Essay Center instead - each export only ever contains
the signed-in family's own data, never the whole database.

## Comparing colleges

The **Compare** tab puts 2–5 saved colleges side by side on live official data
(admit rate, cost, earnings, graduation) plus your estimated culture fit, with
adjustable weight sliders for what matters most to you and a "best match" star.
Export the comparison to CSV.

## Limitations (honest notes)

- **`DEMO_KEY` is rate-limited** (1,000/hr, shared). Heavy use returns HTTP 429; the
  app surfaces this clearly. Register your own free key to avoid it.
- **Verified profiles cover a curated set of colleges.** Admissions details
  (rounds, testing policy, essays, CSS, honors) and the richer *selection*
  profiles ("what they want," culture, major strategy, culture-fit) cover 15 across
  all tiers. Every other college shows an honest "verify on the official site"
  message rather than invented values. Expand coverage by adding rows in
  `importVerified.js` (admissions details) and `selectionSeed.js` (selection
  profiles).
- **Culture-fit and major-strategy are estimates from stated priorities**, not
  predictions. The app never claims an "easier major backdoor" - it lays out real
  trade-offs and warns when switching majors later is hard by design.
- **ED/EA/RD acceptance rates are intentionally left blank** unless a college
  officially publishes them - the app never estimates round-level rates.
- **BLS career figures are a dated OOH snapshot** unless you wire a live BLS key;
  the source year is shown on every figure.
- **Admission probability is an estimate, expressed as a range.** Admissions are
  holistic and unpredictable; these are planning aids, not guarantees.
- **Single-user prototype:** the client uses one local student id. Add real auth
  before multi-user deployment.
- The College Scorecard `latest.*` fields resolve to the most recent year with data
  per field, so a college's numbers may mix cohort years; the app labels the source
  as "latest available" rather than asserting a single year it can't verify.

---

Built as an independent, family-use college planning project.
Planning aid only - not a counseling service or a college admissions office.

### Top 30 STEM colleges

The **Top STEM** tab ranks the strongest undergraduate CS / engineering / science
programs (Top 10 / 20 / 30). The STEM-strength ordering is an **editorial ranking**
of program reputation and outcomes - clearly labeled as such, not an official
government ranking - while each college's admit rate, cost, earnings, and graduation
data are pulled live from College Scorecard, and (with a profile) each shows your
estimated Reach/Target/Safety category and culture-fit score. All 28 seeded colleges
carry full verified admissions details (rounds, testing policy, essays, CSS, honors)
plus the deep selection profiles, so any STEM college you open has the complete
"what they want / am I a fit / which major / what-if" analysis.
