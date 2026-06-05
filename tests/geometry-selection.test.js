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

  it('approveSelection calls onApprove with item labels and deactivates', () => {
    let approved = null;
    activateSelectionMode('node-1', 'faces', (labels) => { approved = labels; }, () => {});
    const mockGroup = { traverse: (fn) => fn({ isMesh: true, material: { opacity: 1 } }) };
    const item = { id: 'item-1', label: 'My Face', group: mockGroup, visible: true };
    selectionModeClick(item);
    approveSelection();
    expect(approved).toEqual(['My Face']);
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

    it(type + ' execute() returns empty selection when _selectedLabels is empty', () => {
      const def = registry.getNode(type);
      const result = def.execute({}, {}, { _selectedLabels: '' });
      expect(Array.isArray(result.selection)).toBe(true);
      expect(result.selection.length).toBe(0);
    });

    it(type + ' execute() returns labels from _selectedLabels', () => {
      const def = registry.getNode(type);
      const result = def.execute({}, {}, { _selectedLabels: 'Geo.Box||Geo.Sphere' });
      expect(result.selection).toEqual(['Geo.Box', 'Geo.Sphere']);
    });

    it(type + ' execute() returns a single label when one item was selected', () => {
      const def = registry.getNode(type);
      const result = def.execute({}, {}, { _selectedLabels: 'Wall Face A' });
      expect(result.selection).toEqual(['Wall Face A']);
    });
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
