import { describe, it, expect } from 'vitest';
import { dataNodes } from '../src/nodes/categories/data.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

// ──────────────────────────────────────────────────────────────────────────
// T8 — Data import & matching node category (the data spine, Milestone M3).
//
// Guards:
//   1. registration — every Data node registers in a fresh full core registry
//      with no duplicate-type / duplicate-alias collision; Data.* names are new.
//   2. def-shape — icon glyph (not text), description, codegen, help.example.
//   3. execute() smoke — per node, against the real T7 parse layer.
//   4. codegen safety — NO Data node emits any `Geo.<name>` token (the parse
//      fns live in src/data, NOT on the global Geo the generated-code runtime
//      assembles; mirrors tests/transform-codegen.test.js's runtime-symbol
//      concern, inverted to "zero Geo at all", like tests/tree-nodes.test.js).
// ──────────────────────────────────────────────────────────────────────────

const byType = (type) => dataNodes.find((n) => n.type === type);
const GEO_CALL = /\bGeo\.[A-Za-z_$][\w$]*/g;

describe('data-category registration', () => {
  it('ships the five expected data nodes', () => {
    expect(dataNodes.map((n) => n.type)).toEqual([
      'Data.ImportCSV',
      'Data.ImportExcel',
      'Data.ParseJSON',
      'Data.GetColumn',
      'Data.MatchByKey'
    ]);
  });

  it('registers cleanly in a fresh full core registry (no type/alias collision)', () => {
    // createCoreNodeRegistry throws on any duplicate type or alias, so a clean
    // build is itself the assertion the new category collides with nothing.
    const registry = createCoreNodeRegistry();
    for (const node of dataNodes) {
      expect(registry.getNode(node.type), `${node.type} resolves in the registry`).toBeTruthy();
    }
  });

  it('every Data.* node belongs to the data category (names are genuinely new)', () => {
    const registry = createCoreNodeRegistry();
    for (const node of dataNodes) {
      const def = registry.getNode(node.type);
      expect(def.category, `${node.type} belongs to the data category`).toBe('data');
    }
  });

  it('every node carries the standard def shape (icon glyph, description, codegen, help.example)', () => {
    for (const node of dataNodes) {
      expect(node.icon, `${node.type} icon`).toBeTruthy();
      // Icons must be symbols, never text abbreviations (not plain alphanumerics).
      expect(/^[a-z0-9]+$/i.test(node.icon), `${node.type} icon must be a glyph, not text`).toBe(false);
      expect(typeof node.description).toBe('string');
      expect(node.description.length).toBeGreaterThan(20);
      expect(node.codegen && typeof node.codegen.python).toBe('string');
      expect(node.codegen && typeof node.codegen.csharp).toBe('string');
      expect(node.help && node.help.example, `${node.type} help.example`).toBeTruthy();
      expect(Array.isArray(node.help.example.nodes)).toBe(true);
      expect(Array.isArray(node.help.example.wires)).toBe(true);
      const types = node.help.example.nodes.map((n) => n.type);
      // Every example terminates in a consumer (Output.Watch) and contains the node.
      expect(types).toContain('Output.Watch');
      expect(types).toContain(node.type);
    }
  });
});

describe('data-category codegen emits NO Geo.<name> (parse fns live in src/data)', () => {
  for (const node of dataNodes) {
    it(`${node.type}: codegen.python/csharp contain zero Geo.* tokens`, () => {
      const py = (node.codegen && node.codegen.python) || '';
      const cs = (node.codegen && node.codegen.csharp) || '';
      expect(py.match(GEO_CALL), `${node.type} codegen.python must not call Geo.*`).toBeNull();
      expect(cs.match(GEO_CALL), `${node.type} codegen.csharp must not call Geo.*`).toBeNull();
    });
  }
});

describe('Data.ImportCSV execute', () => {
  it('parses a stubbed file-control value (controls.file.text) into rows + headers', () => {
    const node = byType('Data.ImportCSV');
    const file = { name: 't.csv', mime: 'text/csv', text: 'id,name\n1,Alice\n2,Bob\n', data: '' };
    const out = node.execute({}, {}, { file });
    expect(out.headers).toEqual(['id', 'name']);
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].id).toBe('1');
    expect(out.rows[0].name).toBe('Alice');
    expect(out.rows[1].name).toBe('Bob');
  });

  it('returns an empty table when no file is set', () => {
    const node = byType('Data.ImportCSV');
    expect(node.execute({}, {}, {})).toEqual({ rows: [], headers: [] });
  });
});

describe('Data.ParseJSON execute', () => {
  it('parses an array-of-objects (from the Text input) into data + rows', () => {
    const node = byType('Data.ParseJSON');
    const out = node.execute({}, { text: '[{"id":1,"name":"A"},{"id":2,"name":"B"}]' }, {});
    expect(Array.isArray(out.data)).toBe(true);
    expect(out.data.length).toBe(2);
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].id).toBe(1);
    expect(out.rows[1].name).toBe('B');
  });

  it('falls back to the file control text when no input is wired', () => {
    const node = byType('Data.ParseJSON');
    const file = { name: 'd.json', mime: 'application/json', text: '{"a":1}', data: '' };
    const out = node.execute({}, {}, { file });
    expect(out.data).toEqual({ a: 1 });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].a).toBe(1);
  });

  it('returns null/empty on blank input', () => {
    const node = byType('Data.ParseJSON');
    expect(node.execute({}, { text: '' }, {})).toEqual({ data: null, rows: [] });
  });
});

describe('Data.GetColumn execute', () => {
  it('plucks a column by name (control), aligned 1:1 with null for missing cells', () => {
    const node = byType('Data.GetColumn');
    const rows = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3 }];
    const out = node.execute({}, { rows }, { column: 'name' });
    expect(out.values).toEqual(['A', 'B', null]);
  });

  it('the column input overrides the control', () => {
    const node = byType('Data.GetColumn');
    const rows = [{ id: 1, name: 'A' }];
    const out = node.execute({}, { rows, column: 'id' }, { column: 'name' });
    expect(out.values).toEqual([1]);
  });
});

describe('Data.MatchByKey execute', () => {
  it('aligns matches 1:1 with items (string-normalized), collects the unmatched', () => {
    const node = byType('Data.MatchByKey');
    // Rows keyed by string ids (as a CSV would yield); items carry numeric ids.
    const rows = [
      { id: '1', value: 'Steel' },
      { id: '2', value: 'Glass' }
    ];
    const items = [{ id: 1 }, { id: 2 }, { id: 9 }];
    const out = node.execute({}, { rows, items, rowKey: 'id', itemKey: 'id' }, {});

    expect(out.matched.length).toBe(3); // aligned 1:1 with items
    expect(out.matched[0]).toBe(rows[0]); // 1 matches "1" by string form
    expect(out.matched[1]).toBe(rows[1]); // 2 matches "2"
    expect(out.matched[2]).toBeNull();    // 9 has no row
    expect(out.unmatched).toEqual([{ id: 9 }]);
  });

  it('first row wins on duplicate keys', () => {
    const node = byType('Data.MatchByKey');
    const rows = [{ k: 'x', v: 1 }, { k: 'x', v: 2 }];
    const items = [{ k: 'x' }];
    const out = node.execute({}, { rows, items, rowKey: 'k', itemKey: 'k' }, {});
    expect(out.matched[0].v).toBe(1);
    expect(out.unmatched).toEqual([]);
  });

  it('reads key names from controls when no key input is wired', () => {
    const node = byType('Data.MatchByKey');
    const rows = [{ id: 'a', v: 10 }];
    const items = [{ id: 'a' }];
    const out = node.execute({}, { rows, items }, { rowKey: 'id', itemKey: 'id' });
    expect(out.matched[0].v).toBe(10);
  });
});

describe('Data.ImportExcel execute', () => {
  it('returns empty table when no workbook file is set', () => {
    const node = byType('Data.ImportExcel');
    expect(node.execute({}, {}, {})).toEqual({ rows: [], headers: [], sheets: [] });
  });
});
