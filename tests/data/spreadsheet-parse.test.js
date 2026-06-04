import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseCSV,
  parseJSON,
  parseXLSX,
  toTable,
  sheetNames,
  MAX_INPUT_CHARS,
  MAX_ROWS,
  MAX_COLS,
  MAX_CELLS
} from '../../src/data/spreadsheet-parse.js';

describe('spreadsheet-parse', () => {
  describe('parseCSV', () => {
    it('parses simple LF CSV into headers + row objects', () => {
      const text = 'name,age\nAlice,30\nBob,25';
      const { headers, rows } = parseCSV(text);
      expect(headers).toEqual(['name', 'age']);
      expect(rows).toEqual([
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' }
      ]);
    });

    it('keeps cells as strings by default (no numeric coercion)', () => {
      const { rows } = parseCSV('zip\n01234');
      // Leading zero must survive — CSV has no types.
      expect(rows[0].zip).toBe('01234');
      expect(typeof rows[0].zip).toBe('string');
    });

    it('coerces numeric-looking cells when opts.coerceNumbers is set', () => {
      const { rows } = parseCSV('n\n42\n3.5\nx', { coerceNumbers: true });
      expect(rows[0].n).toBe(42);
      expect(rows[1].n).toBe(3.5);
      expect(rows[2].n).toBe('x'); // non-numeric stays a string
    });

    it('handles quoted fields with commas and embedded quotes', () => {
      const text = 'name,note\n"Smith, John","said ""hi"""\nDoe,plain';
      const { headers, rows } = parseCSV(text);
      expect(headers).toEqual(['name', 'note']);
      expect(rows[0]).toEqual({ name: 'Smith, John', note: 'said "hi"' });
      expect(rows[1]).toEqual({ name: 'Doe', note: 'plain' });
    });

    it('handles newlines inside quoted fields', () => {
      const text = 'a,b\n"line1\nline2",x';
      const { rows } = parseCSV(text);
      expect(rows[0].a).toBe('line1\nline2');
      expect(rows[0].b).toBe('x');
    });

    it('handles CRLF line endings', () => {
      const text = 'a,b\r\n1,2\r\n3,4\r\n';
      const { headers, rows } = parseCSV(text);
      expect(headers).toEqual(['a', 'b']);
      expect(rows).toEqual([
        { a: '1', b: '2' },
        { a: '3', b: '4' }
      ]);
    });

    it('drops trailing empty lines', () => {
      const text = 'a,b\n1,2\n\n\n';
      const { rows } = parseCSV(text);
      expect(rows).toEqual([{ a: '1', b: '2' }]);
    });

    it('fills short rows with empty strings', () => {
      const { rows } = parseCSV('a,b,c\n1');
      expect(rows[0]).toEqual({ a: '1', b: '', c: '' });
    });

    it('returns an empty table for empty input', () => {
      expect(parseCSV('')).toEqual({ headers: [], rows: [] });
      expect(parseCSV(null)).toEqual({ headers: [], rows: [] });
    });

    it('supports a custom delimiter', () => {
      const { headers, rows } = parseCSV('a;b\n1;2', { delimiter: ';' });
      expect(headers).toEqual(['a', 'b']);
      expect(rows[0]).toEqual({ a: '1', b: '2' });
    });

    it('round-trips a "__proto__" column as own-property data (F-003b)', () => {
      const { headers, rows } = parseCSV('__proto__,x\nfoo,bar');
      expect(headers).toEqual(['__proto__', 'x']);
      const row = rows[0];
      // The cell value is a real OWN property, not a no-op against the setter.
      expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
      expect(row['__proto__']).toBe('foo');
      expect(row.x).toBe('bar');
      // It enumerates via Object.keys, so headers/contract stay intact.
      expect(Object.keys(row)).toEqual(['__proto__', 'x']);
    });
  });

  describe('parseJSON', () => {
    it('parses valid JSON', () => {
      expect(parseJSON('{"a":1}')).toEqual({ a: 1 });
      expect(parseJSON('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('throws a clear error on malformed JSON', () => {
      expect(() => parseJSON('{not valid}')).toThrow(/invalid JSON/);
    });

    it('throws on empty input', () => {
      expect(() => parseJSON('')).toThrow(/empty input/);
      expect(() => parseJSON('   ')).toThrow(/empty input/);
    });

    it('an array-of-objects parses then toTable exposes headers', () => {
      const value = parseJSON('[{"name":"Alice","age":30},{"name":"Bob","age":25}]');
      const { headers, rows } = toTable(value);
      expect(headers).toEqual(['name', 'age']);
      expect(rows).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ]);
    });
  });

  describe('toTable', () => {
    it('passes through an explicit { headers, rows } table', () => {
      const t = { headers: ['x'], rows: [{ x: 1 }] };
      const out = toTable(t);
      expect(out.headers).toEqual(['x']);
      expect(out.rows).toEqual([{ x: 1 }]);
    });

    it('unions keys across rows in first-seen order', () => {
      const out = toTable([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }]);
      expect(out.headers).toEqual(['a', 'b', 'c']);
      expect(out.rows.length).toBe(3);
    });

    it('wraps an array of scalars in a single "value" column', () => {
      const out = toTable([10, 20, 30]);
      expect(out.headers).toEqual(['value']);
      expect(out.rows).toEqual([{ value: 10 }, { value: 20 }, { value: 30 }]);
    });

    it('wraps a single object as a one-row table', () => {
      const out = toTable({ a: 1, b: 2 });
      expect(out.headers).toEqual(['a', 'b']);
      expect(out.rows).toEqual([{ a: 1, b: 2 }]);
    });

    it('returns an empty table for null/undefined/empty', () => {
      expect(toTable(null)).toEqual({ headers: [], rows: [] });
      expect(toTable(undefined)).toEqual({ headers: [], rows: [] });
      expect(toTable([])).toEqual({ headers: [], rows: [] });
    });
  });

  describe('parseXLSX', () => {
    // Build a tiny workbook in-test, write it to base64, then parse it back.
    function buildWorkbookBase64() {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['name', 'age'],
        ['Alice', 30],
        ['Bob', 25]
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'People');
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['city'],
        ['Paris']
      ]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Cities');
      return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    }

    it('round-trips a base64 workbook into headers + rows (first sheet default)', () => {
      const b64 = buildWorkbookBase64();
      const { sheetNames: names, headers, rows } = parseXLSX(b64);
      expect(names).toEqual(['People', 'Cities']);
      expect(headers).toEqual(['name', 'age']);
      expect(rows).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ]);
      // Numeric cells from the workbook stay numbers.
      expect(typeof rows[0].age).toBe('number');
    });

    it('selects a sheet by name via opts.sheet', () => {
      const b64 = buildWorkbookBase64();
      const { headers, rows } = parseXLSX(b64, { sheet: 'Cities' });
      expect(headers).toEqual(['city']);
      expect(rows).toEqual([{ city: 'Paris' }]);
    });

    it('accepts a Uint8Array / ArrayBuffer as well as base64', () => {
      const b64 = buildWorkbookBase64();
      const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
      const fromBytes = parseXLSX(bytes);
      expect(fromBytes.headers).toEqual(['name', 'age']);

      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const fromAb = parseXLSX(ab);
      expect(fromAb.rows.length).toBe(2);
    });

    it('throws when the requested sheet is missing', () => {
      const b64 = buildWorkbookBase64();
      expect(() => parseXLSX(b64, { sheet: 'Nope' })).toThrow(/sheet not found/);
    });

    it('sheetNames lists every worksheet', () => {
      const b64 = buildWorkbookBase64();
      expect(sheetNames(b64)).toEqual(['People', 'Cities']);
    });

    it('returns an empty table for a zero-sheet workbook (F-004)', async () => {
      // SheetJS refuses to *write* a sheet-less workbook ("Workbook is empty"),
      // so the names.length === 0 branch can only be reached from a reader that
      // yields no sheets. Mock the xlsx module for an isolated re-import so the
      // guard branch is exercised without touching the other XLSX tests.
      vi.resetModules();
      vi.doMock('xlsx', () => ({
        read: () => ({ SheetNames: [], Sheets: {} }),
        utils: {}
      }));
      try {
        const mod = await import('../../src/data/spreadsheet-parse.js');
        const out = mod.parseXLSX('whatever');
        expect(out).toEqual({ sheetNames: [], headers: [], rows: [] });
      } finally {
        vi.doUnmock('xlsx');
        vi.resetModules();
      }
    });

    it('returns headers:[]/rows:[] for an empty sheet (F-004)', () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]); // no rows
      XLSX.utils.book_append_sheet(wb, ws, 'Blank');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const out = parseXLSX(b64);
      expect(out.sheetNames).toEqual(['Blank']);
      expect(out.headers).toEqual([]);
      expect(out.rows).toEqual([]);
    });

    it('preserves boolean and date cell types (F-004)', () => {
      const wb = XLSX.utils.book_new();
      const when = new Date(Date.UTC(2020, 0, 2));
      const ws = XLSX.utils.aoa_to_sheet([
        ['flag', 'when'],
        [true, when],
        [false, when]
      ], { cellDates: true });
      XLSX.utils.book_append_sheet(wb, ws, 'Typed');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const { rows } = parseXLSX(b64);
      // Boolean cells keep their type (not stringified / not coerced).
      expect(typeof rows[0].flag).toBe('boolean');
      expect(rows[0].flag).toBe(true);
      expect(rows[1].flag).toBe(false);
      // parseXLSX preserves the workbook's own stored value for a date cell:
      // without cellDates, SheetJS stores the Excel serial number, so the cell
      // stays a number (a typed, non-string value) — see module header.
      expect(typeof rows[0].when).toBe('number');
      expect(rows[0].when).toBeGreaterThan(0);
    });

    it('throws on malformed / non-base64 XLSX input (F-004)', () => {
      // A truncated ZIP local-file header ("PK\\x03\\x04" = base64 "UEsDBA==")
      // makes SheetJS reject the container.
      expect(() => parseXLSX('UEsDBA==')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Reserved-name / prototype-pollution safety + non-tabular JSON (F-003, F-004)
  // -------------------------------------------------------------------------
  describe('reserved-name & pollution safety', () => {
    function buildProtoWorkbookBase64() {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['__proto__', 'x'],
        ['foo', 'bar']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Evil');
      return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    }

    it('CSV with a __proto__ header does not pollute Object.prototype (F-003a)', () => {
      parseCSV('__proto__,x\n{"polluted":true},bar');
      // Also exercise a JSON-string cell that, if mis-handled, could pollute.
      parseCSV('a,b\n__proto__,{"polluted":true}');
      expect(({}).polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('XLSX with a __proto__ header keeps it as own data, no pollution (F-003a/b)', () => {
      const b64 = buildProtoWorkbookBase64();
      const { headers, rows } = parseXLSX(b64);
      expect(headers).toEqual(['__proto__', 'x']);
      const row = rows[0];
      expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
      expect(row['__proto__']).toBe('foo');
      expect(Object.keys(row)).toEqual(['__proto__', 'x']);
      expect(({}).polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('JSON __proto__ key survives toTable as own data, no pollution (F-002/F-003)', () => {
      // JSON.parse stores "__proto__" as an own enumerable property already;
      // toTable must carry it through (not drop it) and must never pollute.
      const value = parseJSON('[{"__proto__":"foo","x":"bar"}]');
      const { headers, rows } = toTable(value);
      expect(headers).toEqual(['__proto__', 'x']);
      const row = rows[0];
      expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
      expect(row['__proto__']).toBe('foo');
      expect(row.x).toBe('bar');
      expect(({}).polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('an explicit { headers, rows } table with a __proto__ row key is preserved (F-002)', () => {
      const evil = JSON.parse('{"__proto__":"foo"}');
      const { headers, rows } = toTable({ headers: ['__proto__'], rows: [evil] });
      expect(headers).toEqual(['__proto__']);
      expect(Object.prototype.hasOwnProperty.call(rows[0], '__proto__')).toBe(true);
      expect(rows[0]['__proto__']).toBe('foo');
      expect(Object.prototype.polluted).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Resource bounds — untrusted-input DoS defense (SEC-011)
  // -------------------------------------------------------------------------
  describe('resource bounds (SEC-011)', () => {
    it('exports sane, ordered limit constants', () => {
      expect(MAX_INPUT_CHARS).toBeGreaterThan(0);
      expect(MAX_ROWS).toBeGreaterThan(0);
      expect(MAX_COLS).toBeGreaterThan(0);
      expect(MAX_CELLS).toBeGreaterThan(0);
      // A single huge dimension must be catchable by the product cap too.
      expect(MAX_CELLS).toBeLessThanOrEqual(MAX_ROWS * MAX_COLS);
    });

    it('parseCSV rejects an input string longer than MAX_INPUT_CHARS', () => {
      // One char over the cap. The length guard fires before any tokenization,
      // so this never walks the string. Allocate the big string once.
      const huge = 'a'.repeat(MAX_INPUT_CHARS + 1);
      let err;
      try { parseCSV(huge); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/too large/i);
      expect(err.message).toMatch(/input length/);
    });

    it('parseCSV rejects a header row with more than MAX_COLS columns', () => {
      // One short line, but MAX_COLS+1 columns — exercises the column cap
      // cheaply (no millions of rows allocated).
      const header = new Array(MAX_COLS + 1).fill('c').join(',');
      const text = header + '\n1';
      expect(() => parseCSV(text)).toThrow(/too large/i);
      expect(() => parseCSV(text)).toThrow(/column count/);
    });

    it('parseCSV accepts a normal small CSV well within all caps', () => {
      const { headers, rows } = parseCSV('name,age\nAlice,30\nBob,25');
      expect(headers).toEqual(['name', 'age']);
      expect(rows.length).toBe(2);
    });

    it('parseXLSX rejects a sheet that DECLARES a pathological range (zip-bomb shape)', async () => {
      // A few-KB workbook can declare an enormous used range. Simulate that with
      // a sheet object carrying a huge `!ref` but (almost) no real cells, so the
      // pre-parse `!ref` guard fires before sheet_to_json materializes anything.
      // Build the column letters via XLSX.utils so the range string is valid.
      const XLSXmod = await import('xlsx');
      const end = XLSXmod.utils.encode_cell({ r: MAX_ROWS + 10, c: 50 });
      const sheet = { '!ref': 'A1:' + end, A1: { t: 's', v: 'x' } };
      const wb = { SheetNames: ['Bomb'], Sheets: { Bomb: sheet } };
      vi.resetModules();
      vi.doMock('xlsx', () => ({
        read: () => wb,
        utils: XLSXmod.utils
      }));
      try {
        const mod = await import('../../src/data/spreadsheet-parse.js');
        expect(() => mod.parseXLSX('whatever')).toThrow(/too large/i);
        expect(() => mod.parseXLSX('whatever')).toThrow(/row count/);
      } finally {
        vi.doUnmock('xlsx');
        vi.resetModules();
      }
    });

    it('parseXLSX rejects a sheet declaring more than MAX_COLS columns', async () => {
      const XLSXmod = await import('xlsx');
      const end = XLSXmod.utils.encode_cell({ r: 1, c: MAX_COLS + 5 });
      const sheet = { '!ref': 'A1:' + end, A1: { t: 's', v: 'x' } };
      const wb = { SheetNames: ['Wide'], Sheets: { Wide: sheet } };
      vi.resetModules();
      vi.doMock('xlsx', () => ({ read: () => wb, utils: XLSXmod.utils }));
      try {
        const mod = await import('../../src/data/spreadsheet-parse.js');
        expect(() => mod.parseXLSX('whatever')).toThrow(/column count/);
      } finally {
        vi.doUnmock('xlsx');
        vi.resetModules();
      }
    });

    it('parseXLSX rejects on the cell-count product even when each dimension is alone OK', async () => {
      // rows and cols each under their own cap, but rows*cols > MAX_CELLS.
      const XLSXmod = await import('xlsx');
      const cols = 5000;            // < MAX_COLS
      const rows = Math.ceil(MAX_CELLS / cols) + 100; // rows*cols > MAX_CELLS, rows < MAX_ROWS
      expect(cols).toBeLessThan(MAX_COLS);
      expect(rows).toBeLessThan(MAX_ROWS);
      const end = XLSXmod.utils.encode_cell({ r: rows, c: cols - 1 });
      const sheet = { '!ref': 'A1:' + end, A1: { t: 's', v: 'x' } };
      const wb = { SheetNames: ['Big'], Sheets: { Big: sheet } };
      vi.resetModules();
      vi.doMock('xlsx', () => ({ read: () => wb, utils: XLSXmod.utils }));
      try {
        const mod = await import('../../src/data/spreadsheet-parse.js');
        expect(() => mod.parseXLSX('whatever')).toThrow(/cell count/);
      } finally {
        vi.doUnmock('xlsx');
        vi.resetModules();
      }
    });

    it('parseXLSX still parses a normal small real workbook', () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]);
      XLSX.utils.book_append_sheet(wb, ws, 'OK');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const { headers, rows } = parseXLSX(b64);
      expect(headers).toEqual(['a', 'b']);
      expect(rows).toEqual([{ a: 1, b: 2 }]);
    });
  });

  describe('toTable non-tabular JSON (F-004)', () => {
    it('wraps a scalar parsed from JSON in a single "value" column', () => {
      const out = toTable(parseJSON('42'));
      expect(out.headers).toEqual(['value']);
      expect(out.rows).toEqual([{ value: 42 }]);
    });

    it('wraps a nested object parsed from JSON as a one-row table', () => {
      const out = toTable(parseJSON('{"a":{"deep":1},"b":2}'));
      expect(out.headers).toEqual(['a', 'b']);
      expect(out.rows.length).toBe(1);
      expect(out.rows[0].a).toEqual({ deep: 1 });
      expect(out.rows[0].b).toBe(2);
    });
  });
});
