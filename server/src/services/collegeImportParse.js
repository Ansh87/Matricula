// collegeImportParse.js - Import College List: turns raw pasted text, a CSV
// file, or a plain text file into a clean, deduped list of candidate college
// names. Deliberately simple and dependency-free (no CSV library needed for
// the single-column shape this supports) -- matching/confidence happens
// entirely downstream in collegeMatcher.js. This file only ever extracts
// names; it never decides whether a name is a real college.
const NAME_COLUMN_HEADERS = ["college", "university", "school", "name", "college name", "school name", "institution"];

function stripQuotes(s) {
  const t = String(s ?? "").trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
}

// Minimal CSV line splitter that respects double-quoted fields containing
// commas. Good enough for the "one column of college names, maybe with a
// header" shape this feature supports -- not a general CSV parser.
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(stripQuotes);
}

function dedupePreserveOrder(names) {
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const t = String(n || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Parses a CSV-shaped text body. If the first row looks like a header row
// containing a recognizable name column (College, University, School, Name,
// College Name, School Name, Institution), only that column's values are
// used. Otherwise every non-empty cell in the file is treated as a name
// (handles a plain single-column CSV with no header).
export function parseCsvText(text) {
  const lines = String(text || "").split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const rows = lines.map(splitCsvLine);
  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const nameColIdx = headerRow.findIndex((h) => NAME_COLUMN_HEADERS.includes(h));

  let names;
  if (nameColIdx !== -1) {
    names = rows.slice(1).map((r) => r[nameColIdx]);
  } else {
    // No recognizable header -- flatten every cell in every row (handles a
    // bare single-column list, or a family exporting extra columns we don't
    // understand; empty/very-long cells are filtered downstream).
    names = rows.flat();
  }
  return dedupePreserveOrder(names.map((n) => String(n || "").trim()).filter((n) => n && n.length <= 120));
}

// Parses pasted or plain-text input: one college per line, OR a
// comma-separated single line/paragraph. Handles both because families paste
// lists in either shape (a spreadsheet column pasted as newlines, or a
// sentence-style comma list typed by hand).
export function parseFreeText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const hasNewlines = /\r|\n/.test(raw);
  let names;
  if (hasNewlines) {
    // Newline-delimited is the primary shape; if a LINE itself also contains
    // commas (and there's more than one name-like segment), split it too.
    names = raw.split(/\r\n|\r|\n/).flatMap((line) => {
      const t = line.trim();
      if (!t) return [];
      return t.includes(",") ? t.split(",") : [t];
    });
  } else {
    names = raw.includes(",") ? raw.split(",") : [raw];
  }
  return dedupePreserveOrder(names.map((n) => n.trim()).filter((n) => n && n.length <= 120));
}

// Top-level entry point used by the route: picks the right parser by
// filename/mimetype, or treats the input as pasted free text when neither is
// given.
export function parseImportInput({ text, filename, mimetype }) {
  const looksCsv = /\.csv$/i.test(filename || "") || /csv/i.test(mimetype || "");
  if (looksCsv) return parseCsvText(text);
  return parseFreeText(text);
}
