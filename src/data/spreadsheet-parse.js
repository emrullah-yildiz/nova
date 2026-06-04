// Spreadsheet / data parse module — the client-side parsing layer for
// Excel / CSV / JSON import.
//
// This is a PURE module (no DOM, no app state) so the parsing rules are
// unit-testable in isolation, in the house "pure helper + thin wiring" style
// (NOVA.md §4). It owns no nodes and no UI — the Data.* nodes (T8) and the file
// import control (T9) wire into it.
//
// UNIFORM CONTRACT — every importer yields the same tabular shape:
//
//   { headers: string[], rows: object[] }
//
// where `headers` is the ordered list of column names and each `rows[i]` is a
// plain object keyed by those header names (`rows[i][header]` is the cell
// value). CSV, JSON (array-of-objects) and XLSX all normalize to this exact
// shape so everything downstream (Data.MatchByKey, etc.) has one contract.
//
// NUMERIC HANDLING — predictable over clever:
//   • parseCSV keeps every cell as a STRING. CSV has no types; a ZIP code
//     "01234", a phone number, or a leading-zero part code must survive intact,
//     so we never coerce. Downstream nodes coerce explicitly when they need a
//     number. (opts.coerceNumbers can opt in to numeric coercion.)
//   • parseXLSX preserves the workbook's own cell types (xlsx already gives us
//     real numbers / booleans / dates for typed cells), so a numeric cell stays
//     a number. This mirrors what the user sees in Excel.
//   • parseJSON / toTable keep values exactly as JSON.parse produced them.
//
// RESERVED HEADER NAMES — null-prototype rows:
//   These parsers run on UNTRUSTED uploaded files, so a column may be named
//   `__proto__` (or `constructor`, `prototype`, …). On a normal `{}` object
//   `obj["__proto__"] = value` is a spec no-op: it walks the prototype setter
//   and silently drops the cell instead of storing it, breaking the uniform
//   {headers, rows} contract (and being the same class of risk as prototype
//   pollution). To make EVERY header an honest own-property, the row objects
//   built here use `Object.create(null)` (a null-prototype bag with no
//   `__proto__` accessor), via makeRow(). So `row["__proto__"]` is a real own
//   property carrying the cell value, and `Object.keys(row)` / headers still
//   enumerate it.
//
//   DOWNSTREAM CONTRACT: rows produced by parseCSV/parseXLSX (and toTable, which
//   re-keys array-of-object rows through makeRow) are null-prototype objects.
//   They lack Object.prototype methods (no `row.hasOwnProperty(...)`,
//   `row.toString()`, etc.). This is intentional and acceptable: T8's
//   toTable / MatchByKey and the rest of the pipeline access cells via bracket
//   indexing (`row[header]`), `Object.keys(row)`, and the `in` operator, all of
//   which work on null-prototype objects. Code touching these rows must NOT call
//   `row.hasOwnProperty(k)` directly — use `Object.prototype.hasOwnProperty.call`
//   or `key in row` / `Object.keys`.
//
// RESOURCE BOUNDS — untrusted-input DoS defense (SEC-011):
//   These parsers run client-side on UNTRUSTED uploaded files. A small file can
//   expand to a pathological number of cells (a "zip-bomb"-style XLSX declaring
//   an enormous used range, or a CSV that tokenizes into millions of cells) and
//   hang or OOM the browser tab. To bound work BEFORE materializing rows, every
//   parser enforces explicit dimension caps and rejects an oversize input with a
//   clear Error naming the limit:
//     • MAX_INPUT_CHARS — parseCSV/tokenizeCSV refuse an input string longer than
//       this (the tokenizer's inner loop is O(string length)).
//     • MAX_ROWS / MAX_COLS — the row count and column (header) count caps shared
//       by parseCSV and parseXLSX.
//     • MAX_CELLS — the rows*cols product cap; catches the "few rows × millions of
//       columns" and "millions of rows × few columns" shapes a single dimension
//       cap would miss. For XLSX this is checked against the worksheet's DECLARED
//       range (`!ref`) BEFORE sheet_to_json runs, so a sheet merely *declaring* a
//       huge range is rejected without SheetJS first allocating it.
//   These caps complement the byte-size guard in src/ui/file-control.js
//   (MAX_FILE_BYTES), which rejects oversize uploads before any read. The
//   constants are exported so callers/tests can reference them.

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Resource bounds (SEC-011) — see the "RESOURCE BOUNDS" note in the module
// header. Tuned generously for legitimate spreadsheets (a 1M-cell sheet, e.g.
// ~50k rows × 20 cols, still parses) while refusing pathological dimensions
// long before they can hang the tab.
// ---------------------------------------------------------------------------

// Max length (in UTF-16 code units) of a CSV/text input string. ~64M chars is
// well above any legitimate <=10MB upload's character count, but bounds the
// tokenizer's O(n) scan so a hostile multi-hundred-MB string can't be walked.
export var MAX_INPUT_CHARS = 64 * 1024 * 1024;

// Max number of data rows (header row excluded) a single sheet/CSV may yield.
export var MAX_ROWS = 1000000;

// Max number of columns (headers) a single sheet/CSV may have.
export var MAX_COLS = 16384;

// Max total cells (data rows × columns). The dominant guard: it catches shapes
// that slip past a single-dimension cap (few rows × huge width, or vice versa).
export var MAX_CELLS = 5000000;

// Build a clear, throwable limit error. Centralized so every message reads the
// same way ("... exceeds the limit of N ...") and is easy to assert in tests.
function limitError(what, got, limit) {
  return new Error(
    'Spreadsheet too large: ' + what + ' (' + got + ') exceeds the limit of '
    + limit + '. Reduce the file and try again.');
}

// Build a fresh null-prototype row object. Using Object.create(null) means
// reserved header names (notably `__proto__`) become real own-properties
// instead of hitting the Object.prototype setter and being silently dropped.
// See the "RESERVED HEADER NAMES" note in the module header.
function makeRow() {
  return Object.create(null);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Tokenize one CSV document into a 2D array of string cells, honoring RFC-4180
// quoting: fields may be wrapped in double quotes, a doubled quote ("") inside a
// quoted field is a literal quote, and commas / newlines inside quotes are part
// of the field. Handles both CRLF and LF line endings.
function tokenizeCSV(text, delimiter) {
  // Bound the O(n) scan up front: refuse a pathologically long input string
  // before walking it character by character (SEC-011).
  if (text.length > MAX_INPUT_CHARS) {
    throw limitError('input length', text.length, MAX_INPUT_CHARS);
  }
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Swallow CR; the LF (if any) ends the record.
      if (text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush the final field / row (file may not end with a newline).
  row.push(field);
  rows.push(row);
  return rows;
}

// True when a tokenized row is effectively empty (e.g. a trailing blank line
// produced [""]). Used to drop trailing empty lines.
function isEmptyRow(cells) {
  return cells.length === 0 || (cells.length === 1 && cells[0] === '');
}

// A cell that looks like a finite JS number ("42", "-3.14", "1e3"). Used only
// when opts.coerceNumbers is set; the default keeps cells as strings.
function looksNumeric(s) {
  if (typeof s !== 'string' || s.trim() === '') return false;
  return Number.isFinite(Number(s));
}

// parseCSV(text, opts?) -> { headers, rows }
//   The first non-discarded line is the header row; every subsequent row becomes
//   an object keyed by header. Short rows fill missing columns with '' (or
//   undefined under coercion); extra cells beyond the headers are dropped.
//
//   opts:
//     delimiter      column separator (default ',')
//     coerceNumbers  when true, numeric-looking cells become numbers
//                    (default false — cells stay strings; see module header)
export function parseCSV(text, opts) {
  const options = opts || {};
  const delimiter = options.delimiter || ',';
  const coerce = options.coerceNumbers === true;

  if (typeof text !== 'string' || text === '') {
    return { headers: [], rows: [] };
  }

  let table = tokenizeCSV(text, delimiter);
  // Drop trailing empty lines (common with a final newline / Windows editors).
  while (table.length > 0 && isEmptyRow(table[table.length - 1])) {
    table.pop();
  }
  if (table.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = table[0].map((h) => String(h));

  // Dimension caps (SEC-011): bound rows, columns and the rows*cols product
  // before building the row objects so a pathological CSV can't hang the tab.
  const dataRowCount = table.length - 1; // header row excluded
  if (headers.length > MAX_COLS) {
    throw limitError('column count', headers.length, MAX_COLS);
  }
  if (dataRowCount > MAX_ROWS) {
    throw limitError('row count', dataRowCount, MAX_ROWS);
  }
  if (dataRowCount * headers.length > MAX_CELLS) {
    throw limitError('cell count', dataRowCount * headers.length, MAX_CELLS);
  }

  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (isEmptyRow(cells)) continue; // skip interior blank lines too
    const obj = makeRow();
    for (let c = 0; c < headers.length; c++) {
      const raw = c < cells.length ? cells[c] : '';
      obj[headers[c]] = coerce && looksNumeric(raw) ? Number(raw) : raw;
    }
    rows.push(obj);
  }
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

// parseJSON(text) -> any
//   Thin wrapper over JSON.parse that throws a clear, prefixed error on
//   malformed input. Returns the parsed value as-is; use toTable() to normalize
//   an array-of-objects into the uniform { headers, rows } shape.
export function parseJSON(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('parseJSON: empty input');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('parseJSON: invalid JSON — ' + (err && err.message ? err.message : String(err)));
  }
}

// ---------------------------------------------------------------------------
// toTable — the normalizer that gives every source one shape
// ---------------------------------------------------------------------------

// Copy an object's own enumerable keys into a fresh null-prototype row so that a
// reserved key (e.g. a JSON `"__proto__"` member, which JSON.parse stores as an
// own property) is carried as honest own-property data and can never reach the
// real Object.prototype. Keeps every importer consistent (see F-002).
function reRow(item) {
  const out = makeRow();
  for (const key of Object.keys(item)) {
    out[key] = item[key];
  }
  return out;
}

// toTable(value) -> { headers, rows }
//   Normalizes a few common shapes into the uniform table contract:
//     • already-a-table  { headers, rows }     -> headers kept, rows re-keyed
//                                                 into null-prototype rows
//     • array of objects [{a:1,b:2}, ...]      -> headers = union of keys in
//                                                 first-seen order, rows re-keyed
//     • array of scalars [1, 2, 3]             -> single "value" column
//     • single object    { a: 1 }              -> one-row table
//     • null / undefined / empty               -> { headers: [], rows: [] }
//   Header order is the order keys are first encountered across the rows, so a
//   later row introducing a new key appends it rather than reordering.
//   Rows are null-prototype objects (see the module-header reserved-name note)
//   so a `__proto__` column survives everywhere as own-property data.
export function toTable(value) {
  if (value == null) {
    return { headers: [], rows: [] };
  }

  // Already a table-ish object with explicit headers.
  if (!Array.isArray(value) && typeof value === 'object' && Array.isArray(value.headers) && Array.isArray(value.rows)) {
    return {
      headers: value.headers.map((h) => String(h)),
      rows: value.rows.map((r) => (r != null && typeof r === 'object' ? reRow(r) : r))
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { headers: [], rows: [] };

    const allObjects = value.every((v) => v != null && typeof v === 'object' && !Array.isArray(v));
    if (allObjects) {
      const headers = [];
      const seen = Object.create(null);
      for (const item of value) {
        for (const key of Object.keys(item)) {
          if (!seen[key]) {
            seen[key] = true;
            headers.push(key);
          }
        }
      }
      return { headers, rows: value.map((item) => reRow(item)) };
    }

    // Array of scalars (or mixed): expose a single "value" column.
    return {
      headers: ['value'],
      rows: value.map((v) => {
        const row = makeRow();
        row.value = v;
        return row;
      })
    };
  }

  // A single plain object -> one-row table.
  if (typeof value === 'object') {
    return { headers: Object.keys(value), rows: [reRow(value)] };
  }

  // A bare scalar.
  const row = makeRow();
  row.value = value;
  return { headers: ['value'], rows: [row] };
}

// ---------------------------------------------------------------------------
// XLSX (real Excel via SheetJS)
// ---------------------------------------------------------------------------

// Normalize the various accepted inputs into the { read-arg, type } pair the
// xlsx.read API expects. The file control (T9) stores files as base64; tests and
// other callers may pass an ArrayBuffer or a Uint8Array.
function readWorkbook(input) {
  if (typeof input === 'string') {
    return XLSX.read(input, { type: 'base64' });
  }
  if (input instanceof Uint8Array) {
    return XLSX.read(input, { type: 'array' });
  }
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) {
    return XLSX.read(new Uint8Array(input), { type: 'array' });
  }
  // Node Buffer (a Uint8Array subclass already handled above) or anything else.
  if (input && typeof input === 'object' && typeof input.byteLength === 'number') {
    return XLSX.read(new Uint8Array(input), { type: 'array' });
  }
  throw new Error('parseXLSX: input must be a base64 string, ArrayBuffer, or Uint8Array');
}

// sheetNames(input) -> string[]
//   List the worksheet names of a workbook without parsing its rows.
export function sheetNames(input) {
  const wb = readWorkbook(input);
  return wb.SheetNames.slice();
}

// parseXLSX(input, opts?) -> { sheetNames, headers, rows }
//   input  base64 string | ArrayBuffer | Uint8Array
//   opts:
//     sheet  worksheet name to read (default: the first sheet)
//   The first row of the chosen sheet is the header row; subsequent rows become
//   objects keyed by header. Cell types from the workbook are preserved (numbers
//   stay numbers — see module header). The returned `sheetNames` lists every
//   sheet so the caller (T9 UI / T8 node) can offer a sheet picker.
export function parseXLSX(input, opts) {
  const options = opts || {};
  const wb = readWorkbook(input);
  const names = wb.SheetNames.slice();

  if (names.length === 0) {
    return { sheetNames: [], headers: [], rows: [] };
  }

  const target = options.sheet != null ? String(options.sheet) : names[0];
  const sheet = wb.Sheets[target];
  if (!sheet) {
    throw new Error('parseXLSX: sheet not found — ' + target);
  }

  // Dimension caps (SEC-011): a hostile workbook can DECLARE an enormous used
  // range in a few KB. Reject based on the sheet's declared range (`!ref`)
  // BEFORE sheet_to_json materializes it, so SheetJS never allocates millions
  // of cells. (No !ref => empty/sparse sheet; the post-parse caps below still
  // cover whatever rows actually come back.)
  if (sheet['!ref'] && typeof XLSX.utils.decode_range === 'function') {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const declaredCols = (range.e.c - range.s.c) + 1;
    const declaredRows = (range.e.r - range.s.r) + 1; // includes header row
    const declaredDataRows = Math.max(0, declaredRows - 1);
    if (declaredCols > MAX_COLS) {
      throw limitError('column count', declaredCols, MAX_COLS);
    }
    if (declaredDataRows > MAX_ROWS) {
      throw limitError('row count', declaredDataRows, MAX_ROWS);
    }
    if (declaredDataRows * declaredCols > MAX_CELLS) {
      throw limitError('cell count', declaredDataRows * declaredCols, MAX_CELLS);
    }
  }

  // header:1 gives raw rows-of-cells so we control header extraction ourselves
  // and stay consistent with parseCSV. defval:'' fills sparse cells.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!aoa.length) {
    return { sheetNames: names, headers: [], rows: [] };
  }

  const headers = aoa[0].map((h) => String(h));

  // Post-parse backstop for the dimension caps (SEC-011): covers a sheet whose
  // actual returned shape is large even when `!ref` was absent or understated.
  const dataRowCount = aoa.length - 1; // header row excluded
  if (headers.length > MAX_COLS) {
    throw limitError('column count', headers.length, MAX_COLS);
  }
  if (dataRowCount > MAX_ROWS) {
    throw limitError('row count', dataRowCount, MAX_ROWS);
  }
  if (dataRowCount * headers.length > MAX_CELLS) {
    throw limitError('cell count', dataRowCount * headers.length, MAX_CELLS);
  }

  const rows = [];
  for (let r = 1; r < aoa.length; r++) {
    const cells = aoa[r];
    const obj = makeRow();
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < cells.length ? cells[c] : '';
    }
    rows.push(obj);
  }
  return { sheetNames: names, headers, rows };
}
