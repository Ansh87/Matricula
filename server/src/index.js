// index.js -- Express server. Serves /api/* (key-protected) and the static
// client build. The browser never sees any API key.
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, keyStatus } from "./config.js";
import "./db/database.js"; // ensure schema is created on boot
// Load verified admissions/selection profiles (MIT, Stanford, etc.), careers,
// and deadline data into the DB on every boot. Previously this only ran via a
// manual `npm run import:verified` step, so any fresh/reset database (a new
// deploy, a restart on a new DB) silently had none of this data even though
// it's written right here in the codebase -- the "Admissions details" card
// showed "No verified profile on file" for colleges that DO have one. The
// import is an idempotent upsert, so running it on every boot just keeps the
// DB in sync with these seed files; it can't duplicate or corrupt data.
import "./db/importVerified.js";
import { collegesRouter } from "./routes/colleges.js";
import { careersRouter, studentRouter, advisorRouter } from "./routes/misc.js";
import { debugRouter } from "./routes/debug.js";
import { documentsRouter } from "./routes/documents.js";
import { programsRouter } from "./routes/programs.js";
import { decisionPlanRouter } from "./routes/decisionPlan.js";
import { applicationPathwaysRouter } from "./routes/applicationPathways.js";
import { essaysRouter } from "./routes/essayCenter.js";
import { applicationTimelineRouter } from "./routes/applicationTimeline.js";
import { requireAuth, authStatus } from "./middleware/firebaseAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" })); // headroom: scored college lists can be large

// Health + key status (never reveals the key itself).
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    dataSources: {
      colleges: "U.S. Department of Education College Scorecard",
      careers: "U.S. Bureau of Labor Statistics (OOH)",
      verified: "Manually verified from official college admissions sites / Common Data Set",
    },
    keys: keyStatus(authStatus()),
    cacheTtlHours: config.cacheTtlMs / 3600000,
  });
});

// Public catalog + stateless matching (client sends the profile in the request
// body; nothing user-specific is read from the DB here).
app.use("/api/colleges", collegesRouter);
app.use("/api/careers", careersRouter);
// Protected: these read/write per-user profile, saved list, applications, and
// documents. requireAuth verifies the Firebase ID token and sets req.user.
app.use("/api/students", requireAuth, studentRouter);
app.use("/api/advisor", requireAuth, advisorRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/programs", requireAuth, programsRouter);
app.use("/api/decision-plan", requireAuth, decisionPlanRouter);
app.use("/api/application-pathways", requireAuth, applicationPathwaysRouter);
app.use("/api/essays", requireAuth, essaysRouter);
app.use("/api/application-timeline", requireAuth, applicationTimelineRouter);
app.use("/api/debug", debugRouter);

// NOTE: an earlier /api/backup route that downloaded the raw SQLite database
// file has been REMOVED. It was unauthenticated and would have handed out
// every family's data (profiles, resumes, programs, decision plans) to
// anyone who found the URL. There is no whole-database export route in this
// app. Per-user data can still be reviewed/exported via each user's own CSV
// export routes (Decision Plan, Programs & Opportunities, Tasks), which are
// authenticated and scoped to that user's Firebase UID only.

// Serve built client (client/dist) if present.
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(200).send("Matricula API is running. Build the client (cd client && npm run build) to serve the UI.");
  });
});

app.listen(config.port, () => {
  console.log(`Matricula server on http://localhost:${config.port}`);
  console.log("Data sources: College Scorecard (live), BLS OOH (snapshot/live), verified profiles (DB).");
  console.log("Key status:", keyStatus(authStatus()));
});
