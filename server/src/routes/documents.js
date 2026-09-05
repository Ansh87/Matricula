// documents routes - upload, list, delete, and optional AI-parse.
import express from "express";
import multer from "multer";
import { config } from "../config.js";
import { saveDocument, listDocuments, deleteDocument, parseWithGemini, attachParsed, savePortfolioLink, buildProfileFromDocuments } from "../services/documents.js";
import { db } from "../db/database.js";

export const documentsRouter = express.Router();

// User isolation: authenticated requests are forced to the Firebase UID, so a
// user can only access their own documents regardless of the URL :studentId.
documentsRouter.param("studentId", (req, _res, next, _value) => {
  if (req.user && req.user.uid) req.params.studentId = req.user.uid;
  next();
});

// In-memory multer (we write the file ourselves in the service). 15MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// GET /api/documents/:studentId  -> list uploaded docs
documentsRouter.get("/:studentId", (req, res) => {
  res.json({ documents: listDocuments(req.params.studentId), parsingEnabled: !!config.gemini.apiKey });
});

// POST /api/documents/:studentId  (multipart: file, kind) -> store + extract text
documentsRouter.post("/:studentId", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "bad_request", message: "No file uploaded." });
    const out = await saveDocument({
      studentId: req.params.studentId,
      kind: req.body.kind || "other",
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      buffer: req.file.buffer,
    });
    res.json({ ok: true, document: out, parsingEnabled: !!config.gemini.apiKey });
  } catch (err) {
    res.status(500).json({ error: "server", message: "Couldn't save the document.", detail: err.message });
  }
});

// POST /api/documents/:studentId/:docId/parse -> optional Gemini parse of text
documentsRouter.post("/:studentId/:docId/parse", async (req, res) => {
  const row = db.prepare("SELECT text_excerpt, extracted_text, kind FROM documents WHERE student_id=? AND doc_id=?")
    .get(req.params.studentId, req.params.docId);
  if (!row) return res.status(404).json({ error: "not_found" });
  // Use the FULL extracted text (up to 50k chars) for parsing, not the 4k-char
  // preview excerpt -- text_excerpt is a UI preview only and was truncating
  // longer resumes/portfolios before Gemini ever saw the rest of the document.
  const fullText = row.extracted_text || row.text_excerpt;
  const result = await parseWithGemini(fullText, row.kind);
  if (result.available) attachParsed(req.params.studentId, req.params.docId, result.parsed);
  res.json(result);
});

// POST /api/documents/:studentId/link  { url } -> save + read a portfolio link
documentsRouter.post("/:studentId/link", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "bad_request", message: "url required" });
  const out = await savePortfolioLink({ studentId: req.params.studentId, url });
  res.json({ ok: true, document: out, parsingEnabled: !!config.gemini.apiKey });
});

// POST /api/documents/:studentId/build-profile -> read ALL docs into one profile
documentsRouter.post("/:studentId/build-profile", async (req, res) => {
  const result = await buildProfileFromDocuments(req.params.studentId);
  res.json(result);
});

// DELETE /api/documents/:studentId/:docId
documentsRouter.delete("/:studentId/:docId", (req, res) => {
  deleteDocument(req.params.studentId, req.params.docId);
  res.json({ ok: true });
});

