// Tests for the geometry selection architecture (T4).
//
// Tests are split into two groups:
//   1. selection-mode.js — pure state machine, no DOM required for most cases.
//   2. Select.Faces / Select.Edges / Select.Points node execute() — pure output
//      from controlValues._selectedLabels.
//
// Full DOM/viewer integration (toolbar rendering, 3D click routing) is verified
// manually in the browser; here we test the pure-logic surface.

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  activateSelectionMode,
  deactivateSelectionMode,
  isSelectionModeActive,
  getSelectedItems,
  getSelectedEdges,
  selectionModeClick,
  selectionEdgeClick,
  approveSelection,
  cancelSelection,
  _internals,
} from '../src/viewer/selection-mode.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';

// ── selection-mode.js state machine ──────────────────────────────────────────

describe('selection-mode state machine', () => {
  beforeEach(() => {
    // Provide minimal DOM stubs FIRST so toolbar functions don't throw
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = {
        getElementById: () => null,
        createElement: () => ({
          id: '',
          className: '',
          innerHTML: '',
          style: {},
          remove() {},
          appendChild() {},
        }),
        body: { appendChild() {} },
      };
    }
    // Ensure clean state before each test
    deactivateSelectionMode();
  });

  afterEach(() => {
    deactivateSelectionMode();
  });

  it('isSelectionModeActive() is false initially', () => {
    expect(isSelectionModeActive()).toBe(false);
  });

  it('activateSelectionMode sets state to active', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    expect(isSelectionModeActive()).toBe(true);
    expect(_internals._state.nodeId).toBe('node-1');
    expect(_internals._state.mode).toBe('faces');
  });

  it('deactivateSelectionMode resets to inactive', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    deactivateSelectionMode();
    expect(isSelectionModeActive()).toBe(false);
    expect(_internals._state.nodeId).toBeNull();
    expect(_internals._state.items).toEqual([]);
  });

  it('getSelectedItems returns empty array initially', () => {
    activateSelectionMode('node-1', 'edges', () => {}, () => {});
    expect(getSelectedItems()).toEqual([]);
  });

  it('selectionModeClick adds a matching item', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    // Simulate a face-type scene item (first child isMesh=true)
    const mockGroup = { traverse: (fn) => fn({ isMesh: true, material: { opacity: 1 } }) };
    const item = { id: 'item-1', label: 'Geo.Box', group: mockGroup, visible: true };
    selectionModeClick(item);
    expect(getSelectedItems().length).toBe(1);
    expect(getSelectedItems()[0].id).toBe('item-1');
  });

  it('selectionModeClick toggles: second click removes the item', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    const mockGroup = { traverse: (fn) => fn({ isMesh: true, material: { opacity: 1 } }) };
    const item = { id: 'item-1', label: 'Geo.Box', group: mockGroup, visible: true };
    selectionModeClick(item);
    selectionModeClick(item);
    expect(getSelectedItems().length).toBe(0);
  });

  it('selectionModeClick treats different mesh face hits on the same item as separate selections', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    const mesh = { isMesh: true, material: { opacity: 1 } };
    const mockGroup = { traverse: (fn) => fn(mesh) };
    const item = { id: 'item-1', label: 'Geo.Box', group: mockGroup, visible: true };

    selectionModeClick(item, { object: mesh, faceIndex: 0 });
    selectionModeClick(item, { object: mesh, faceIndex: 1 });
    expect(getSelectedItems().length).toBe(2);
    expect(getSelectedItems().map((it) => it.selectionKey)).toEqual(['item-1:face:0', 'item-1:face:1']);

    selectionModeClick(item, { object: mesh, faceIndex: 0 });
    expect(getSelectedItems().length).toBe(1);
    expect(getSelectedItems()[0].selectionKey).toBe('item-1:face:1');
  });

  it('selectionModeClick does not add an item whose type does not match mode', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    // Line item (isLine) — should NOT match 'faces' mode
    const mockGroup = { traverse: (fn) => fn({ isMesh: false, isLine: true, material: { opacity: 1 } }) };
    const item = { id: 'item-2', label: 'Line', group: mockGroup, visible: true };
    selectionModeClick(item);
    expect(getSelectedItems().length).toBe(0);
  });

  it('approveSelection calls onApprove with full item objects and deactivates', () => {
    // AC-9: approveSelection passes full scene-item objects, not string labels.
    let approved = null;
    activateSelectionMode('node-1', 'faces', (items) => { approved = items; }, () => {});
    const mockGroup = { traverse: (fn) => fn({ isMesh: true, material: { opacity: 1 } }) };
    const item = { id: 'item-1', label: 'My Face', group: mockGroup, visible: true };
    selectionModeClick(item);
    approveSelection();
    // approved is now an array of scene-item objects, not string labels
    expect(Array.isArray(approved)).toBe(true);
    expect(approved.length).toBe(1);
    expect(approved[0].id).toBe('item-1');
    expect(approved[0].label).toBe('My Face');
    expect(isSelectionModeActive()).toBe(false);
  });

  it('cancelSelection calls onCancel and deactivates without returning items', () => {
    let cancelled = false;
    activateSelectionMode('node-1', 'faces', () => {}, () => { cancelled = true; });
    const mockGroup = { traverse: (fn) => fn({ isMesh: true, material: { opacity: 1 } }) };
    const item = { id: 'item-1', label: 'Face', group: mockGroup, visible: true };
    selectionModeClick(item);
    cancelSelection();
    expect(cancelled).toBe(true);
    expect(isSelectionModeActive()).toBe(false);
  });

  it('multi-select: three items can be accumulated', () => {
    activateSelectionMode('node-1', 'edges', () => {}, () => {});
    // Line items (isLine) match 'edges' mode
    [1, 2, 3].forEach(function (i) {
      const group = { traverse: (fn) => fn({ isMesh: false, isLine: true, material: { opacity: 1 } }) };
      selectionModeClick({ id: 'item-' + i, label: 'Edge ' + i, group, visible: true });
    });
    expect(getSelectedItems().length).toBe(3);
  });

  it('selectionEdgeClick toggles individual mesh edges', () => {
    activateSelectionMode('node-1', 'edges', () => {}, () => {});
    const group = { traverse: (fn) => fn({ isLineSegments: true, material: { opacity: 1 } }) };
    const item = {
      id: 'mesh-item',
      label: 'Rectangle',
      group,
      visible: true,
      _selectionEdgeResult: {
        edges: [
          { start: [0, 0, 0], end: [1, 0, 0] },
          { start: [1, 0, 0], end: [1, 1, 0] }
        ]
      }
    };

    selectionEdgeClick({ index: 2 }, item);
    expect(getSelectedItems().length).toBe(1);
    expect(getSelectedItems()[0].selectionKey).toBe('mesh-item:edge:1');
    expect(getSelectedEdges()[0].edge.end).toEqual([1, 1, 0]);

    selectionEdgeClick({ index: 2 }, item);
    expect(getSelectedItems().length).toBe(0);
  });

  it('activating while already active replaces the previous session', () => {
    activateSelectionMode('node-1', 'faces', () => {}, () => {});
    activateSelectionMode('node-2', 'edges', () => {}, () => {});
    // The second activate replaces without calling the first's cancel
    expect(_internals._state.nodeId).toBe('node-2');
    expect(_internals._state.mode).toBe('edges');
    expect(isSelectionModeActive()).toBe(true);
  });
});

// ── _itemMatchesMode helper ───────────────────────────────────────────────────

describe('_itemMatchesMode', () => {
  const { _itemMatchesMode } = _internals;

  it('faces mode matches a mesh item', () => {
    const group = { traverse: (fn) => fn({ isMesh: true, isLine: false }) };
    expect(_itemMatchesMode({ group }, 'faces')).toBe(true);
  });

  it('faces mode does not match a line item', () => {
    const group = { traverse: (fn) => fn({ isMesh: false, isLine: true }) };
    expect(_itemMatchesMode({ group }, 'faces')).toBe(false);
  });

  it('edges mode matches a line item', () => {
    const group = { traverse: (fn) => fn({ isMesh: false, isLine: true }) };
    expect(_itemMatchesMode({ group }, 'edges')).toBe(true);
  });

  it('edges mode matches a lineSegments item', () => {
    const group = { traverse: (fn) => fn({ isMesh: false, isLine: false, isLineSegments: true }) };
    expect(_itemMatchesMode({ group }, 'edges')).toBe(true);
  });

  it('edges mode does not match a mesh item', () => {
    const group = { traverse: (fn) => fn({ isMesh: true, isLine: false }) };
    expect(_itemMatchesMode({ group }, 'edges')).toBe(false);
  });

  it('points mode matches a mesh item (points render as sphere meshes)', () => {
    const group = { traverse: (fn) => fn({ isMesh: true, isLine: false }) };
    expect(_itemMatchesMode({ group }, 'points')).toBe(true);
  });

  it('returns false for null item', () => {
    expect(_itemMatchesMode(null, 'faces')).toBe(false);
  });

  it('returns false for item with empty group', () => {
    const group = { traverse: () => {} };
    expect(_itemMatchesMode({ group }, 'faces')).toBe(false);
  });
});

// ── Select.Faces / Select.Edges / Select.Points node execute() ────────────────
//
// Select.Faces outputs a list of per-surface Mesh3 objects via _selectedMeshes.
// Select.Edges/Points still return { selection: geoData[] } via _selectedGeo.

describe('Select.* node execute()', () => {
  let registry;

  beforeEach(() => {
    registry = getLiveCoreRegistry();
  });

  ['Select.Faces', 'Select.Edges', 'Select.Points'].forEach((type) => {
    it(type + ' is registered in the node catalog', () => {
      const def = registry.getNode(type);
      expect(def).toBeTruthy();
      expect(def.type).toBe(type);
    });

    it(type + ' has metadata.selectionMode', () => {
      const def = registry.getNode(type);
      expect(def.metadata).toBeTruthy();
      expect(typeof def.metadata.selectionMode).toBe('string');
      expect(def.metadata.selectionMode.length).toBeGreaterThan(0);
    });
  });

  function meshPatchData() {
    return {
      _type: 'Mesh3',
      vertices: [
        { x: 0, y: 0, z: 0, _type: 'Point3' },
        { x: 1, y: 0, z: 0, _type: 'Point3' },
        { x: 1, y: 1, z: 0, _type: 'Point3' },
        { x: 0, y: 1, z: 0, _type: 'Point3' }
      ],
      faces: [[0, 1, 2], [0, 2, 3]],
      color: 0x89b4fa
    };
  }

  // Select.Faces - separate surface mesh output via _selectedMeshes

  it('Select.Faces execute() returns an empty list when nothing selected', () => {
    const def = registry.getNode('Select.Faces');
    const result = def.execute({}, {}, { _selectedLabels: '', _selectedGeo: '', _selectedFaces: '', _selectedMeshes: '', _selectedMesh: '' });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(0);
  });

  it('Select.Faces execute() with valid _selectedMeshes returns separate Mesh3 objects', () => {
    const def = registry.getNode('Select.Faces');
    const result = def.execute({}, {}, { _selectedMeshes: JSON.stringify([meshPatchData(), meshPatchData()]), _selectedMesh: '' });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(2);
    expect(result.faces[0]._type).toBe('Mesh3');
    expect(Array.isArray(result.faces[0].vertices)).toBe(true);
    expect(result.faces[0].vertices.length).toBe(4);
    expect(Array.isArray(result.faces[0].faces)).toBe(true);
    expect(result.faces[0].faces.length).toBe(2);
  });

  it('Select.Faces Mesh3 output can feed Surface.Isolines', () => {
    const selectDef = registry.getNode('Select.Faces');
    const isolinesDef = registry.getNode('Surface.Isolines');
    const selected = selectDef.execute({}, {}, { _selectedMeshes: JSON.stringify([meshPatchData()]), _selectedMesh: '' });
    const result = isolinesDef.execute({}, { mesh: selected.faces[0], count: 2 }, { dir: 'U' });
    expect(Array.isArray(result.curves)).toBe(true);
    expect(result.curves.length).toBeGreaterThan(0);
    expect(result.curves[0]._type).toBe('Polyline3');
  });

  it('Select.Faces converts legacy _selectedFaces descriptors to Mesh3 patches', () => {
    const def = registry.getNode('Select.Faces');
    const legacyFaces = [
      {
        _type: 'Face',
        vertices: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
        normal: [0, 0, 1],
        area: 1
      }
    ];
    const result = def.execute({}, {}, { _selectedFaces: JSON.stringify(legacyFaces), _selectedMeshes: '', _selectedMesh: '' });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(1);
    expect(result.faces[0]._type).toBe('Mesh3');
    expect(result.faces[0].vertices.length).toBe(4);
    expect(result.faces[0].faces).toEqual([[0, 1, 2], [0, 2, 3]]);
  });

  it('Select.Faces execute() keeps _selectedMesh as a legacy one-item fallback', () => {
    const def = registry.getNode('Select.Faces');
    const meshData = {
      _type: 'Mesh3',
      vertices: [
        { x: 0, y: 0, z: 0, _type: 'Point3' },
        { x: 1, y: 0, z: 0, _type: 'Point3' },
        { x: 1, y: 1, z: 0, _type: 'Point3' }
      ],
      faces: [[0, 1, 2]],
      color: 0x89b4fa
    };
    const result = def.execute({}, {}, { _selectedMesh: JSON.stringify(meshData) });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(1);
    expect(result.faces[0]._type).toBe('Mesh3');
    expect(Array.isArray(result.faces[0].vertices)).toBe(true);
    expect(result.faces[0].vertices.length).toBe(3);
    expect(Array.isArray(result.faces[0].faces)).toBe(true);
    expect(result.faces[0].faces.length).toBe(1);
  });

  it('Select.Faces execute() with invalid _selectedMesh JSON returns an empty list', () => {
    const def = registry.getNode('Select.Faces');
    const result = def.execute({}, {}, { _selectedMesh: 'not-json' });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(0);
  });

  it('Select.Faces execute() with empty vertices in _selectedMesh returns an empty list', () => {
    const def = registry.getNode('Select.Faces');
    const meshData = { _type: 'Mesh3', vertices: [], faces: [], color: 0x89b4fa };
    const result = def.execute({}, {}, { _selectedMesh: JSON.stringify(meshData) });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(0);
  });

  it('Select.Faces execute() legacy Mesh3 fallback vertices are Point3 instances with x/y/z', () => {
    const def = registry.getNode('Select.Faces');
    const meshData = {
      _type: 'Mesh3',
      vertices: [
        { x: 0.5, y: -0.5, z: -0.5, _type: 'Point3' },
        { x: 0.5, y: 0.5, z: -0.5, _type: 'Point3' },
        { x: 0.5, y: 0.5, z: 0.5, _type: 'Point3' }
      ],
      faces: [[0, 1, 2]],
      color: 0x89b4fa
    };
    const result = def.execute({}, {}, { _selectedMesh: JSON.stringify(meshData) });
    const v0 = result.faces[0].vertices[0];
    expect(typeof v0.x).toBe('number');
    expect(typeof v0.y).toBe('number');
    expect(typeof v0.z).toBe('number');
    expect(v0.x).toBeCloseTo(0.5);
  });

  // Select.Edges / Select.Points — still use _selectedGeo list format

  it('Select.Edges execute() returns empty list when _selectedGeo is empty', () => {
    const def = registry.getNode('Select.Edges');
    const result = def.execute({}, {}, { _selectedLabels: '', _selectedGeo: '' });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection.length).toBe(0);
  });

  it('Select.Points execute() returns empty list when _selectedGeo is empty', () => {
    const def = registry.getNode('Select.Points');
    const result = def.execute({}, {}, { _selectedLabels: '', _selectedGeo: '' });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection.length).toBe(0);
  });

  it('Select.Edges execute() with _selectedGeo JSON returns { selection: [...] }', () => {
    const def = registry.getNode('Select.Edges');
    const geoData = [{ _type: 'Mesh', label: 'Edge A', nodeId: 'n1', varName: '', vertexCount: 2, vertices: [0, 0, 0, 1, 0, 0], faceCount: 0 }];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection.length).toBe(1);
    expect(result.selection[0]._type).toBe('Mesh');
  });

  it('Select.Edges execute() hydrates mesh-edge Line3 descriptors into curves', () => {
    const def = registry.getNode('Select.Edges');
    const geoData = [{
      _type: 'Line3',
      label: 'Rectangle edge 1',
      start: { x: 0, y: 0, z: 0, _type: 'Point3' },
      end: { x: 2, y: 0, z: 0, _type: 'Point3' }
    }];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection[0]._type).toBe('Line3');
    expect(result.selection[0].length()).toBeCloseTo(2);
  });

  it('Select.Points execute() with _selectedGeo JSON returns { selection: [...] }', () => {
    const def = registry.getNode('Select.Points');
    const geoData = [{ _type: 'Mesh', label: 'Point A', nodeId: 'n1', varName: '', vertexCount: 1, vertices: [1, 2, 3], faceCount: 0 }];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection.length).toBe(1);
  });

  it('Select.Faces selectionMode is "faces"', () => {
    expect(registry.getNode('Select.Faces').metadata.selectionMode).toBe('faces');
  });

  it('Select.Edges selectionMode is "edges"', () => {
    expect(registry.getNode('Select.Edges').metadata.selectionMode).toBe('edges');
  });

  it('Select.Points selectionMode is "points"', () => {
    expect(registry.getNode('Select.Points').metadata.selectionMode).toBe('points');
  });
});

// ── Geo.Mesh3 face grouping (T09a) ──────────────────────────────────────────
//
// These tests exercise the three new _Mesh3 methods added in T09a:
//   groupFaces()        — groups triangles by coplanar normal
//   getFaceVertices()   — returns unique vertex positions for one group
//   toSelectionMesh()   — builds THREE.Mesh with per-group BufferGeometry groups
//
// THREE is not available in the Node test environment; a minimal mock is
// installed on globalThis before the import so geometry-lib.js resolves it.

describe('Geo.Mesh3 face grouping', () => {
  let Geo;

  beforeAll(async () => {
    // Minimal THREE mock — only the surface that toSelectionMesh() calls.
    const makeAttr = (arr, itemSize) => ({ array: arr, itemSize, isBufferAttribute: true });
    const mockGeometry = () => {
      const geo = {
        _attrs: {},
        _index: null,
        _groups: [],
        setAttribute(name, attr) { this._attrs[name] = attr; },
        setIndex(arr) { this._index = arr; },
        addGroup(start, count, gi) { this._groups.push({ start, count, gi }); },
        computeVertexNormals() {},
        get groups() { return this._groups; }
      };
      return geo;
    };
    const mockMat = () => {
      const m = { color: 0x94e2d5, side: 2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, _cloned: false };
      m.clone = () => { const c = mockMat(); c._cloned = true; return c; };
      return m;
    };
    globalThis.THREE = {
      BufferGeometry: function() { return mockGeometry(); },
      BufferAttribute: function(arr, n) { return makeAttr(arr, n); },
      MeshPhongMaterial: function(opts) { const m = mockMat(); Object.assign(m, opts || {}); m.clone = () => { const c = mockMat(); Object.assign(c, opts || {}); c.clone = m.clone; return c; }; return m; },
      // MeshBasicMaterial: same mock shape as MeshPhongMaterial (flat/unlit in real Three.js;
      // in unit tests both are just objects with color/opacity/needsUpdate).
      MeshBasicMaterial: function(opts) { const m = mockMat(); Object.assign(m, opts || {}); m.clone = () => { const c = mockMat(); Object.assign(c, opts || {}); c.clone = m.clone; return c; }; return m; },
      Mesh: function(geo, mats) { return { geometry: geo, material: mats, userData: {} }; },
      DoubleSide: 2
    };

    // Import Geo after the mock is in place so geometry-lib.js sees globalThis.THREE.
    const mod = await import('../src/geometry/index.js');
    Geo = mod.Geo;
  });

  it('groups 12 box triangles into 6 coplanar face groups', () => {
    const box = Geo.createBox(new Geo.Point3(0, 0, 0), 2, 2, 2);
    const groups = box.groupFaces();
    expect(groups.length).toBe(6);
    groups.forEach(g => {
      expect(g.triangleIndices.length).toBe(2);
      const [nx, ny, nz] = g.normal;
      expect(Math.abs(nx * nx + ny * ny + nz * nz - 1)).toBeLessThan(1e-5);
    });
  });

  it('extracts rectangle mesh boundary edges without the internal triangulation diagonal', () => {
    const rect = new Geo.Mesh3([
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(2, 0, 0),
      new Geo.Point3(2, 1, 0),
      new Geo.Point3(0, 1, 0)
    ], [[0, 1, 2], [0, 2, 3]]);
    const edges = rect.getSelectableEdges();
    expect(edges.length).toBe(4);
    const keys = edges.map(e => e.startIndex + ':' + e.endIndex).sort();
    expect(keys).toEqual(['0:1', '0:3', '1:2', '2:3']);
  });

  it('getFaceVertices returns 4 unique vertices for group 0', () => {
    const box = Geo.createBox(new Geo.Point3(0, 0, 0), 2, 2, 2);
    const groups = box.groupFaces();
    const verts = box.getFaceVertices(0, groups);
    expect(verts.length).toBe(4);
    verts.forEach(v => expect(v.length).toBe(3));
  });

  it('toSelectionMesh returns mesh with N groups matching faceGroups', () => {
    const box = Geo.createBox(new Geo.Point3(0, 0, 0), 2, 2, 2);
    const groups = box.groupFaces();
    const { mesh, materials, triangleToGroup } = box.toSelectionMesh(groups);
    expect(mesh).toBeTruthy();
    expect(materials.length).toBe(groups.length);
    expect(triangleToGroup.length).toBe(12);
    expect(mesh.geometry.groups.length).toBe(groups.length);
  });
});
