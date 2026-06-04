import { app } from '../src/app/app.js';
import { DataTree } from '../src/core/data-tree.js';

describe('app.formatValue', () => {
  it('renders primitives as before', () => {
    expect(app.formatValue(undefined)).toContain('—');
    expect(app.formatValue(null)).toContain('null');
    expect(app.formatValue(true)).toContain('true');
    expect(app.formatValue(42)).toContain('42');
    expect(app.formatValue(3.5)).toContain('3.5');
    expect(app.formatValue('hi')).toContain('"hi"');
  });

  it('renders arrays as an expandable List view', () => {
    const html = app.formatValue([1, 2, 3]);
    expect(html).toContain('List');
    expect(html).toContain('(3)');
    expect(html).toContain('data-list-view');
    expect(html).not.toContain('[object Object]');
  });

  it('renders a plain object as a keyed Object view with its keys and values', () => {
    const html = app.formatValue({ name: 'Wall-1', height: 3000 });
    expect(html).toContain('Object');
    expect(html).toContain('name');
    expect(html).toContain('Wall-1');
    expect(html).toContain('height');
    expect(html).toContain('3000');
    expect(html).not.toContain('[object Object]');
  });

  it('renders null-prototype row objects (data parser shape)', () => {
    const row = Object.create(null);
    row.id = '7';
    row.label = 'Beam';
    const html = app.formatValue(row);
    expect(html).toContain('id');
    expect(html).toContain('label');
    expect(html).toContain('Beam');
    expect(html).not.toContain('[object Object]');
  });

  it('renders a list of row objects without "[object Object]"', () => {
    const html = app.formatValue([{ a: 1 }, { a: 2 }]);
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('a:');
    expect(html).toContain('1');
    expect(html).toContain('2');
  });

  it('renders a DataTree as a Tree/branch view (no "[object Object]")', () => {
    const tree = new DataTree();
    tree.add([0], ['a', 'b']);
    tree.add([1], ['c']);
    const html = app.formatValue(tree);
    expect(html).toContain('Tree');
    expect(html).toContain('{0}');
    expect(html).toContain('{1}');
    expect(html).toContain('a'); // inline list items render the escaped string content
    expect(html).not.toContain('[object Object]');
  });

  it('keeps a Geo-like object custom toString', () => {
    const geo = { _type: 'Point3', x: 1, y: 2, z: 3, toString() { return 'Point3(1, 2, 3)'; } };
    const html = app.formatValue(geo);
    expect(html).toContain('Point3(1, 2, 3)');
    expect(html).not.toContain('[object Object]');
  });

  it('uses the Geo toString for items inside a list', () => {
    const geo = { _type: 'Point3', toString() { return 'Point3(0, 0, 0)'; } };
    const html = app.formatValue([geo]);
    expect(html).toContain('Point3(0, 0, 0)');
    expect(html).not.toContain('[object Object]');
  });

  it('HTML-escapes object keys and string values containing < or "', () => {
    const html = app.formatValue({ '<k>': 'a"b<c>' });
    expect(html).toContain('&lt;k&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;c&gt;');
    expect(html).not.toContain('<k>');
    expect(html).not.toContain('a"b<c>');
  });

  it('caps deep recursion with a compact preview', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    const html = app.formatValue(deep);
    expect(html).toContain('Object(');
    expect(html).not.toContain('[object Object]');
  });
});
