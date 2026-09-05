// documents.js - handles uploaded transcripts/resumes/portfolios.
//
// Privacy-first design:
//  - Files are stored LOCALLY on your server disk (uploads/ dir). Nothing is
//    sent anywhere by default.
//  - We extract plain text locally (PDF/TXT) so you can read/confirm it.
//  - AI parsing (turning that text into structured profile fields) is OPTIONAL
//    and only runs if GEMINI_API_KEY is set. Without a key, the feature still
//    works - you just map the fields yourself.
//
// If enabled, the extracted TEXT (not the raw file) is sent to Google's Gemini
// API for parsing. On Google's FREE tier, Google may use inputs to improve their
// models - the UI states this clearly so the choice is informed.
import { db } from "../db/database.js";
import { config } from "../config.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Single source of truth for how much extracted text is kept/sent for AI
// parsing. Previously the extraction cap (50k) and the per-document Gemini
// prompt (hardcoded 12k) had drifted apart, silently truncating anything
// between 12k-50k chars before Gemini ever saw it -- same class of bug as the
// text_excerpt-vs-extracted_text truncation this constant also guards against.
const MAX_PARSE_CHARS = 50000;

const insertDoc = db.prepare(`
  INSERT INTO documents (doc_id,student_id,kind,filename,mimetype,size,text_excerpt,extracted_text,extract_reason,stored_path,parsed_json,uploaded_at)
  VALUES (@doc_id,@student_id,@kind,@filename,@mimetype,@size,@text_excerpt,@extracted_text,@extract_reason,@stored_path,@parsed_json,@uploaded_at)`);

export function listDocuments(studentId) {
  // full_text_length lets the UI show an honest "showing preview of N total
  // characters" note instead of implying the 4k-char excerpt is everything
  // that was read (the full text, up to 50k chars, is what's actually used
  // for AI parsing/build-profile).
  const rows = db.prepare(
    "SELECT doc_id,kind,filename,mimetype,size,text_excerpt,length(extracted_text) AS full_text_length,parsed_json,uploaded_at FROM documents WHERE student_id=? ORDER BY uploaded_at DESC"
  ).all(studentId);
  return rows.map((r) => ({ ...r, parsed: safe(r.parsed_json) }));
}

export function deleteDocument(studentId, docId) {
  const row = db.prepare("SELECT stored_path FROM documents WHERE student_id=? AND doc_id=?").get(studentId, docId);
  if (row?.stored_path) { try { fs.unlinkSync(row.stored_path); } catch { /* ignore */ } }
  db.prepare("DELETE FROM documents WHERE student_id=? AND doc_id=?").run(studentId, docId);
}

// Extract text from a buffer by mimetype. PDF uses a light-weight local parse.
// Returns { text, reason }. `reason` explains WHY text is empty so a crashed
// or scanned PDF is never mistaken for an empty document.
export async function extractText(buffer, mimetype, filename) {
  const name = (filename || "").toLowerCase();

  if (mimetype === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const { default: pdfParse } = await import("pdf-parse");
      const data = await pdfParse(buffer);
      const text = (data.text || "").replace(/\s+\n/g, "\n").trim();
      // A text-based PDF yields plenty of characters. A scanned one yields ~none.
      if (text.length < 40) {
        return { text: "", reason: "This PDF appears to be scanned/image-based. Please upload a text-based PDF or paste the resume text." };
      }
      return { text, reason: null };
    } catch (e) {
      return { text: "", reason: `Couldn't read this PDF (${e.message}). Try re-saving it as a text-based PDF, or upload a .txt version.` };
    }
  }

  if (mimetype?.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
    const text = buffer.toString("utf8").trim();
    return { text, reason: text ? null : "The file is empty." };
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    return { text: "", reason: "Word documents aren't supported. Save as PDF or plain text (.txt) and re-upload." };
  }
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(name) || mimetype?.startsWith("image/")) {
    return { text: "", reason: "Images can't be read (no OCR). Upload a text-based PDF or .txt file." };
  }
  return { text: "", reason: `Unsupported file type (${mimetype || "unknown"}). Upload a PDF or .txt file.` };
}

// Save an uploaded document + its extracted text.
export async function saveDocument({ studentId, kind, filename, mimetype, buffer }) {
  const docId = randomUUID();
  const safeName = `${docId}__${(filename || "file").replace(/[^\w.\-]/g, "_")}`;
  const stored = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(stored, buffer);

  const extracted = await extractText(buffer, mimetype, filename);
  const text = extracted.text || "";
  const excerpt = text.slice(0, 4000);   // preview only
  const full = text.slice(0, MAX_PARSE_CHARS);     // full text for AI parsing (safely capped)

  insertDoc.run({
    doc_id: docId, student_id: studentId, kind: kind || "other",
    filename: filename || "file", mimetype: mimetype || "application/octet-stream",
    size: buffer.length, text_excerpt: excerpt, extracted_text: full,
    extract_reason: extracted.reason || null, stored_path: stored,
    parsed_json: null, uploaded_at: Date.now(),
  });

  return {
    docId, kind, filename, size: buffer.length, hasText: text.length > 0,
    textExcerpt: excerpt,
    // Full readable length (post-extraction), so the UI can honestly report
    // how much text was actually captured instead of just the 4k-char preview.
    textLength: text.length,
    truncatedForParsing: text.length > full.length, // true only past the 50k safety cap
    reason: extracted.reason || null,
  };
}

// Optional: parse extracted text into structured profile fields via Gemini.
// Returns { available:false } if no key. Never invents - asks Gemini to return
// only fields it can find, and to use null otherwise.
export async function parseWithGemini(text, kind) {
  if (!config.gemini.apiKey) {
    return { available: false, reason: "No GEMINI_API_KEY set. Add a free key to enable auto-fill, or enter fields manually." };
  }
  if (!text || text.length < 20) {
    return { available: false, reason: "No readable text found in this document to parse." };
  }

  const prompt = `You are extracting structured data from a student's ${kind || "document"} for a college-planning app.
Return ONLY a JSON object (no markdown, no prose) with these keys, using null when a value is not clearly present:
{
  "gpa": number|null,               // unweighted 4.0 scale
  "gpaWeighted": number|null,
  "sat": number|null,               // total
  "act": number|null,               // composite
  "apCount": number|null,           // count of AP/IB/honors/college courses
  "classRank": number|null,
  "classSize": number|null,
  "awards": "none"|"school"|"state"|"national"|null,   // highest level seen
  "hasResearch": boolean|null,
  "activities": [ { "name": string, "role": string|null, "category": string|null } ],
  "interests": [ string ]           // likely intended majors/fields, if evident
}
Do not guess or invent. If the document is a resume, focus on activities, awards, research. If a transcript, focus on GPA, rigor, rank. Text:
"""
${text.slice(0, MAX_PARSE_CHARS)}
"""`;

  const model = config.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { available: false, reason: `Gemini API error ${res.status}. Check your key/model. ${detail.slice(0,160)}${res.status===404?" - model name may be retired; try GEMINI_MODEL=gemini-2.5-flash":""}` };
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(raw);
    if (!parsed) return { available: false, reason: "Gemini responded but the result couldn't be read as data. Try again." };
    return { available: true, parsed, source: `Google Gemini (${model})` };
  } catch (e) {
    return { available: false, reason: `Couldn't parse the document with Gemini: ${e.message}` };
  }
}

// Store the parsed result against a document (audit trail).
export function attachParsed(studentId, docId, parsed) {
  db.prepare("UPDATE documents SET parsed_json=? WHERE student_id=? AND doc_id=?")
    .run(JSON.stringify(parsed), studentId, docId);
}

// Fetch and extract readable text from a portfolio/website URL (Netlify,
// GitHub, personal site). Only the visible text is used. Never executes the
// page; just reads HTML and strips tags.
// Read a portfolio/resume URL. Netlify/React sites often ship an empty HTML
// shell with content rendered by JavaScript, so we pull every readable signal
// the raw HTML does expose (title, meta description, Open Graph, headings, link
// text, body text) and then honestly report when there simply isn't enough.
export async function fetchUrlText(url) {
  let target;
  try { target = new URL(url); } catch { return { ok: false, reason: "That doesn't look like a valid URL." }; }
  if (!/^https?:$/.test(target.protocol)) return { ok: false, reason: "Only http/https links are supported." };

  try {
    const res = await fetch(target.href, { redirect: "follow", headers: { "User-Agent": "Matricula/1.0" } });
    if (!res.ok) return { ok: false, reason: `Couldn't load the page (HTTP ${res.status}).` };
    const html = await res.text();

    const first = (re) => (html.match(re) || [])[1]?.trim() || "";
    const title = first(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = first(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const ogTitle = first(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = first(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

    const collectAll = (re) => {
      const out = [];
      let m;
      const rx = new RegExp(re.source, "gi");
      while ((m = rx.exec(html)) !== null) {
        const t = stripTags(m[1]);
        if (t) out.push(t);
      }
      return out;
    };
    const headings = collectAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/);
    const listItems = collectAll(/<li[^>]*>([\s\S]*?)<\/li>/);
    const linkText = collectAll(/<a[^>]*>([\s\S]*?)<\/a>/);

    // Body text with scripts/styles removed.
    const bodyText = stripTags(
      html.replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    );

    // Assemble, labeling each signal so Gemini knows what it's reading.
    const parts = [];
    if (title) parts.push(`TITLE: ${title}`);
    if (ogTitle && ogTitle !== title) parts.push(`OG TITLE: ${ogTitle}`);
    if (metaDesc) parts.push(`DESCRIPTION: ${metaDesc}`);
    if (ogDesc && ogDesc !== metaDesc) parts.push(`OG DESCRIPTION: ${ogDesc}`);
    if (headings.length) parts.push(`HEADINGS: ${dedupe(headings).join(" | ")}`);
    if (listItems.length) parts.push(`LIST ITEMS: ${dedupe(listItems).slice(0, 60).join(" | ")}`);
    if (linkText.length) parts.push(`LINKS: ${dedupe(linkText).slice(0, 40).join(" | ")}`);
    if (bodyText) parts.push(`PAGE TEXT: ${bodyText}`);

    const text = parts.join("\n").slice(0, 40000);

    // Is there enough SUBSTANCE, or is this a JS-rendered shell? Title + nav
    // links alone are not a resume. Require real prose from body/headings/desc.
    const substance = [bodyText, headings.join(" "), metaDesc, ogDesc].join(" ").trim();
    if (substance.length < 200) {
      return {
        ok: true, text, title: title || target.href, thin: true,
        reason: "The portfolio link was reached, but it did not expose enough readable text for auto-fill (the site likely renders its content with JavaScript). Paste the portfolio summary manually or upload a text file.",
      };
    }
    return { ok: true, text, title: title || target.href, thin: false, reason: null };
  } catch (e) {
    return { ok: false, reason: `Couldn't reach that URL: ${e.message}` };
  }
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function dedupe(arr) { return [...new Set(arr.filter((x) => x && x.length > 1))]; }

// Save a portfolio LINK as a document (kind=portfolio-link), reading its text.
export async function savePortfolioLink({ studentId, url }) {
  const fetched = await fetchUrlText(url);
  const docId = randomUUID();
  insertDoc.run({
    doc_id: docId, student_id: studentId, kind: "portfolio-link",
    filename: url, mimetype: "text/uri-list", size: (fetched.text || "").length,
    text_excerpt: (fetched.text || "").slice(0, 4000),
    extracted_text: (fetched.text || "").slice(0, 50000),
    extract_reason: fetched.reason || null, stored_path: null,
    parsed_json: null, uploaded_at: Date.now(),
  });
  return { docId, url, ok: fetched.ok, hasText: !fetched.thin && !!(fetched.text && fetched.text.length), thin: !!fetched.thin, reason: fetched.reason };
}

// Combined parse: read ALL of a student's documents together into one merged
// profile via Gemini. This is the "build my profile from documents" action.
export async function buildProfileFromDocuments(studentId) {
  if (!config.gemini.apiKey) {
    return { available: false, reason: "No GEMINI_API_KEY set. Add a free key (aistudio.google.com/apikey) to auto-build your profile from documents, or enter fields manually." };
  }
  const docs = db.prepare("SELECT kind, filename, extracted_text, text_excerpt, extract_reason FROM documents WHERE student_id=?").all(studentId);
  // Prefer the FULL extracted text; text_excerpt is only a preview.
  const bodyOf = (d) => d.extracted_text || d.text_excerpt || "";
  const withText = docs.filter((d) => bodyOf(d).length > 40);

  if (!withText.length) {
    const reasons = [...new Set(docs.map((d) => d.extract_reason).filter(Boolean))];
    return { available: false, reason: reasons.length
      ? reasons.join(" ")
      : "No readable document text found. Upload a text-based PDF or .txt file, or a portfolio link that exposes real text." };
  }

  const combined = withText
    .map((d) => `--- ${d.kind.toUpperCase()} (${d.filename}) ---\n${bodyOf(d)}`)
    .join("\n\n")
    .slice(0, 40000);

  const prompt = `You are building a structured college-applicant profile from a student's documents (transcript, resume, and/or portfolio). Read ALL of them together.
Return ONLY a JSON object (no markdown) with these keys, using null/empty when not clearly present. Do NOT invent anything.
{
  "name": string|null,              // student's full name, if stated
  "highSchool": string|null,        // high school name
  "city": string|null,              // student's city
  "state": string|null,             // 2-letter US state code, e.g. "NJ"
  "gradYear": number|null,          // expected high-school graduation year
  "gpa": number|null, "gpaWeighted": number|null,
  "sat": number|null, "act": number|null,
  "apCount": number|null, "classRank": number|null, "classSize": number|null,
  "awards": "none"|"school"|"state"|"national"|"international"|null,
  "hasResearch": boolean|null, "hasInternship": boolean|null,
  "hasLeadership": boolean|null, "hasVolunteer": boolean|null,
  "hasPatent": boolean|null, "hasPublication": boolean|null,
  "hasFounderExperience": boolean|null,
  "interests": [string],            // likely intended majors/fields
  "activities": [ { "name": string, "role": string|null, "category": string|null, "level": "school"|"state"|"national"|"international"|null, "description": string|null } ],
  "awards_detail": [ { "name": string, "level": string|null, "description": string|null } ],
  "projects": [ { "name": string, "role": string|null, "category": string|null, "description": string|null } ],
  "summary": string                 // 2-3 sentence honest summary of the applicant's strengths
}

IMPORTANT for activities/projects/awards: keep the ROLE, CATEGORY, LEVEL, and a
short DESCRIPTION. Do NOT reduce an activity to just its name - "Founder" and
"tutoring nonprofit" carry real signal. If a document is a portfolio page, the
TITLE/DESCRIPTION/HEADINGS lines are extracted metadata; treat them as content.
Documents:
${combined}`;

  const model = config.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { available: false, reason: `Gemini API error ${res.status}. ${detail.slice(0,180)}${res.status===404?" - the model name may be retired; set GEMINI_MODEL to a current one (e.g. gemini-2.5-flash) in .env and restart.":""}` };
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(raw);
    if (!parsed) return { available: false, reason: "Gemini responded but the result couldn't be read as data. Try again, or a different GEMINI_MODEL." };
    return { available: true, parsed, source: `Google Gemini (${model})`, docsUsed: withText.map((d) => d.filename) };
  } catch (e) {
    return { available: false, reason: `Couldn't build profile: ${e.message}` };
  }
}

// Robustly pull a JSON object out of a model response (handles code fences and
// surrounding prose).
function extractJson(raw) {
  if (!raw) return null;
  let t = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch { /* try to locate the object */ }
  const start = t.indexOf("{"); const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

function safe(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
