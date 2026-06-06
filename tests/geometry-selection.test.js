// Tests for the geometry selection architecture (T4).
//
// Tests are split into two groups:
//   1. selection-mode.js — pure state machine, no DOM required for most cases.
//   2. Select.Faces / Select.Edges / Select.Points node execute() — pure output
//      from controlValues._selectedLabels.
//
// Full DOM/viewer integration (toolbar rendering, 3D click routing) is verified
// manually in the browser; here we test the pure-logic surface.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  activateSelectionMode,
  deactivateSelectionMode,
  isSelectionModeActive,
  getSelectedItems,
  selectionModeClick,
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
// AC-9: _selectedGeo is now a JSON string produced by node-renderer.js on Approve.
// It contains Array<{ _type:'Mesh', label, nodeId, varName, vertexCount, vertices, faceCount }>.
// Select.Faces returns { faces: geoData }; Select.Edges/Points return { selection: geoData }.

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

    it(type + ' execute() returns empty list when _selectedGeo is empty', () => {
      const def = registry.getNode(type);
      const result = def.execute({}, {}, { _selectedLabels: '', _selectedGeo: '' });
      // Select.Faces uses 'faces' key; others use 'selection'
      const out = result.faces !== undefined ? result.faces : result.selection;
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBe(0);
    });

    it(type + ' execute() returns empty list for invalid JSON in _selectedGeo', () => {
      const def = registry.getNode(type);
      const result = def.execute({}, {}, { _selectedGeo: 'not-json' });
      const out = result.faces !== undefined ? result.faces : result.selection;
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBe(0);
    });
  });

  // AC-9 specific: Select.Faces reads _selectedGeo JSON and returns { faces: [...] }
  // with real mesh geometry data (vertexCount > 0, vertices array, _type:'Mesh').

  it('Select.Faces execute() with _selectedGeo JSON returns { faces: [{ _type:"Mesh", vertexCount > 0 }] }', () => {
    const def = registry.getNode('Select.Faces');
    const geoData = [
      { _type: 'Mesh', label: 'Box (node-1)', nodeId: 'node-1', varName: '', vertexCount: 24, vertices: [0.5, -0.5, 0.5, -0.5, -0.5, 0.5], faceCount: 12 }
    ];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(Array.isArray(result.faces)).toBe(true);
    expect(result.faces.length).toBe(1);
    expect(result.faces[0]._type).toBe('Mesh');
    expect(result.faces[0].vertexCount).toBeGreaterThan(0);
    expect(Array.isArray(result.faces[0].vertices)).toBe(true);
    expect(result.faces[0].vertices.length).toBeGreaterThan(0);
  });

  it('Select.Faces execute() with multi-item _selectedGeo returns all items', () => {
    const def = registry.getNode('Select.Faces');
    const geoData = [
      { _type: 'Mesh', label: 'Box A', nodeId: 'n1', varName: '', vertexCount: 24, vertices: [0.5], faceCount: 12 },
      { _type: 'Mesh', label: 'Box B', nodeId: 'n2', varName: '', vertexCount: 8, vertices: [0.1], faceCount: 4 }
    ];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(result.faces.length).toBe(2);
    expect(result.faces[0].label).toBe('Box A');
    expect(result.faces[1].label).toBe('Box B');
  });

  it('Select.Edges execute() with _selectedGeo JSON returns { selection: [...] }', () => {
    const def = registry.getNode('Select.Edges');
    const geoData = [{ _type: 'Mesh', label: 'Edge A', nodeId: 'n1', varName: '', vertexCount: 2, vertices: [0, 0, 0, 1, 0, 0], faceCount: 0 }];
    const result = def.execute({}, {}, { _selectedGeo: JSON.stringify(geoData) });
    expect(Array.isArray(result.selection)).toBe(true);
    expect(result.selection.length).toBe(1);
    expect(result.selection[0]._type).toBe('Mesh');
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
