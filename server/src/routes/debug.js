// debug.js - local diagnostic endpoints. These NEVER expose the API key.
// Purpose: tell you exactly why a program/major search returned nothing -
// wrong CIP code, wrong field name, credential-level parsing, API failure,
// rate limit, no internet, or a too-narrow state filter.
import express from "express";
import { config } from "../config.js";
import { cipsForMajorPublic, rawProgramArray, normalizeCip } from "../services/scorecard.js";

export const debugRouter = express.Router();

// GET /api/debug/scorecard-major?major=Computer Science&state=NJ
debugRouter.get("/scorecard-major", async (req, res) => {
  const major = (req.query.major || "").trim();
  const state = (req.query.state || "").trim().toUpperCase() || null;
  const cipCodesUsed = cipsForMajorPublic(major);

  // Scorecard requires UNDOTTED CIP codes ("1107", not "11.07").

  const u = new URL(config.scorecard.baseUrl);
  u.searchParams.set("fields", "id,school.name,latest.programs.cip_4_digit");
  u.searchParams.set("school.operating", "1");
  if (state) u.searchParams.set("school.state", state);
  if (cipCodesUsed.length) {
    u.searchParams.set("latest.programs.cip_4_digit.code", cipCodesUsed.map(normalizeCip).join(","));
    u.searchParams.set("latest.programs.cip_4_digit.credential.level", "3");
  }
  u.searchParams.set("per_page", "5");
  const queryWithoutApiKey = u.toString(); // key not set yet - safe to echo

  // Now add the key only for the actual request.
  const withKey = new URL(queryWithoutApiKey);
  withKey.searchParams.set("api_key", config.scorecard.apiKey);

  const out = {
    usingDemoKey: config.scorecard.usingDemoKey,
    queryWithoutApiKey,
    cipCodesUsed,
    rawResultCount: 0,
    firstCollegeName: null,
    firstProgramSample: null,
    normalizedProgramSample: null,
    error: null,
  };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    const started = Date.now();
    const r = await fetch(withKey.toString(), { signal: ac.signal });
    clearTimeout(timer);
    out.httpStatus = r.status;
    out.elapsedMs = Date.now() - started;
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      out.error = `HTTP ${r.status} ${r.statusText}${body ? ` - ${body.slice(0, 300)}` : ""}`;
      if (r.status === 429) out.error += " (rate limit)";
      return res.json(out);
    }
    const text = await r.text();
    out.responseBytes = text.length;
    const json = JSON.parse(text);
    const results = json.results || [];
    out.rawResultCount = results.length;
    out.totalReported = json.metadata?.total ?? null;
    if (results.length) {
      const first = results[0];
      out.firstCollegeName = first["school.name"] ?? null;
      const raw = rawProgramArray(first);
      out.firstProgramSample = raw.slice(0, 3);
      out.normalizedProgramSample = raw.slice(0, 5).map((p) => ({
        cipCode: normalizeCip(p?.code ?? p?.cip_4_digit ?? p?.["cip_4_digit.code"]),
        title: p?.title ?? p?.credential?.title ?? null,
        credentialLevelRaw: p?.credential?.level ?? p?.credential_level ?? p?.["credential.level"] ?? null,
        credentialLevelParsed: Number(p?.credential?.level ?? p?.credential_level ?? p?.["credential.level"]),
        isBachelors: Number(p?.credential?.level ?? p?.credential_level ?? p?.["credential.level"]) === 3,
      }));
    }
  } catch (err) {
    // Surface the REAL cause: TLS, DNS, timeout, socket reset, etc.
    out.error = err.name === "AbortError"
      ? "Request timed out after 30s (response may be too large)"
      : `${err.message}${err.cause?.code ? ` (cause: ${err.cause.code})` : ""}`;
    out.causeCode = err.cause?.code || err.name || null;
  }
  res.json(out);
});

// GET /api/debug/probe-cip?state=NJ
// Runs a ladder of queries, each isolating ONE variable, to find exactly which
// filter parameter causes zero results. Never exposes the API key.
debugRouter.get("/probe-cip", async (req, res) => {
  const state = (req.query.state || "NJ").toUpperCase();
  const base = config.scorecard.baseUrl;

  const variants = [
    ["A. state only (control)", { "school.state": state }],
    ["B. CIP dotted, no level", { "school.state": state, "latest.programs.cip_4_digit.code": "11.07" }],
    ["C. CIP undotted, no level", { "school.state": state, "latest.programs.cip_4_digit.code": "1107" }],
    ["D. level only, no CIP", { "school.state": state, "latest.programs.cip_4_digit.credential.level": "3" }],
    ["E. dotted CIP + level (our query)", { "school.state": state, "latest.programs.cip_4_digit.code": "11.07", "latest.programs.cip_4_digit.credential.level": "3" }],
    ["F. undotted CIP + level", { "school.state": state, "latest.programs.cip_4_digit.code": "1107", "latest.programs.cip_4_digit.credential.level": "3" }],
    ["G. dotted CIP + credential_level", { "school.state": state, "latest.programs.cip_4_digit.code": "11.07", "latest.programs.cip_4_digit.credential_level": "3" }],
    ["H. title = Computer Science", { "school.state": state, "latest.programs.cip_4_digit.title": "Computer Science" }],
    ["I. multi-code OR (our real CS list) + level", { "school.state": state, "latest.programs.cip_4_digit.code": "1107,1101,1102,3008", "latest.programs.cip_4_digit.credential.level": "3" }],
    ["J. nationwide CS + level (no state)", { "latest.programs.cip_4_digit.code": "1107", "latest.programs.cip_4_digit.credential.level": "3" }],
  ];

  const results = [];
  for (const [label, params] of variants) {
    const u = new URL(base);
    u.searchParams.set("api_key", config.scorecard.apiKey);
    u.searchParams.set("fields", "id,school.name");
    u.searchParams.set("school.operating", "1");
    u.searchParams.set("per_page", "3");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

    const safe = new URL(u.toString());
    safe.searchParams.delete("api_key");

    try {
      const r = await fetch(u.toString());
      const text = await r.text();
      let total = null, names = [];
      if (r.ok) {
        const jj = JSON.parse(text);
        total = jj.metadata?.total ?? null;
        names = (jj.results || []).map((x) => x["school.name"]).filter(Boolean);
      }
      results.push({
        variant: label, httpStatus: r.status, total, sample: names,
        body: r.ok ? undefined : text.slice(0, 200),
        query: safe.search,
      });
    } catch (err) {
      results.push({ variant: label, error: err.message, cause: err.cause?.code || null, query: safe.search });
    }
    await new Promise((s) => setTimeout(s, 150));
  }

  res.json({
    usingDemoKey: config.scorecard.usingDemoKey,
    interpretation: "Find the first variant where total drops to 0. That parameter is the culprit. Variant A should return many colleges.",
    results,
  });
});

// POST /api/debug/clear-program-cache - removes cached program/major searches
// so a stale zero-result response can't persist after a fix. Local use only.
debugRouter.post("/clear-program-cache", async (req, res) => {
  const { db } = await import("../db/database.js");
  const r = db.prepare(
    "DELETE FROM api_cache WHERE cache_key LIKE 'bymajor:%' OR cache_key LIKE 'combos:%' OR cache_key LIKE 'progverify:%'"
  ).run();
  res.json({ ok: true, cleared: r.changes ?? 0,
    note: "Cleared cached major/combo/program-verification responses. Re-run your search." });
});

// POST /api/debug/clear-all-cache - nuke the whole Scorecard cache.
debugRouter.post("/clear-all-cache", async (req, res) => {
  const { db } = await import("../db/database.js");
  const r = db.prepare("DELETE FROM api_cache").run();
  res.json({ ok: true, cleared: r.changes ?? 0 });
});
