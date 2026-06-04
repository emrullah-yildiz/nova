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

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Tokenize one CSV document into a 2D array of string cells, honoring RFC-4180
// quoting: fields may be wrapped in double quotes, a doubled quote ("") inside a
// quoted field is a literal quote, and commas / newlines inside quotes are part
// of the field. Handles both CRLF and LF line endings.
function tokenizeCSV(text, delimiter) {
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
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (isEmptyRow(cells)) continue; // skip interior blank lines too
    const obj = {};
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

// toTable(value) -> { headers, rows }
//   Normalizes a few common shapes into the uniform table contract:
//     • already-a-table  { headers, rows }     -> returned (rows kept as objects)
//     • array of objects [{a:1,b:2}, ...]      -> headers = union of keys in
//                                                 first-seen order, rows kept
//     • array of scalars [1, 2, 3]             -> single "value" column
//     • single object    { a: 1 }              -> one-row table
//     • null / undefined / empty               -> { headers: [], rows: [] }
//   Header order is the order keys are first encountered across the rows, so a
//   later row introducing a new key appends it rather than reordering.
export function toTable(value) {
  if (value == null) {
    return { headers: [], rows: [] };
  }

  // Already a table-ish object with explicit headers.
  if (!Array.isArray(value) && typeof value === 'object' && Array.isArray(value.headers) && Array.isArray(value.rows)) {
    return {
      headers: value.headers.map((h) => String(h)),
      rows: value.rows.slice()
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
      return { headers, rows: value.slice() };
    }

    // Array of scalars (or mixed): expose a single "value" column.
    return {
      headers: ['value'],
      rows: value.map((v) => ({ value: v }))
    };
  }

  // A single plain object -> one-row table.
  if (typeof value === 'object') {
    return { headers: Object.keys(value), rows: [value] };
  }

  // A bare scalar.
  return { headers: ['value'], rows: [{ value }] };
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

  // header:1 gives raw rows-of-cells so we control header extraction ourselves
  // and stay consistent with parseCSV. defval:'' fills sparse cells.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!aoa.length) {
    return { sheetNames: names, headers: [], rows: [] };
  }

  const headers = aoa[0].map((h) => String(h));
  const rows = [];
  for (let r = 1; r < aoa.length; r++) {
    const cells = aoa[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < cells.length ? cells[c] : '';
    }
    rows.push(obj);
  }
  return { sheetNames: names, headers, rows };
}
