import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseCSV,
  parseJSON,
  parseXLSX,
  toTable,
  sheetNames
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
  });
});
