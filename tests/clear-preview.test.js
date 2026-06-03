// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

// Regression: opening/loading a project must drop the previous session's 3D
// preview so it doesn't show stale geometry. newProject/closeProject and the
// load path all funnel through app._clearPreview(); here we assert the load
// path (deserializeGraph) calls it. (newProject/closeProject call the same
// helper one line before switchPage.)
describe('deserializeGraph clears the stale 3D preview', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="node-canvas"></div><svg id="wire-svg"></svg><div id="zoom-indicator"></div>';
  });

  it('invokes _clearPreview when loading a graph', () => {
    const clearPreview = vi.fn();
    const app = {
      nodes: [{ id: 'old' }],
      wires: [],
      selectedNodes: [],
      _clearPreview: clearPreview,
      renderRecentProjects: () => {},
      renderNode: () => {},
      applyTransform: () => {},
      updatePortDots: () => {},
      renderWires: () => {},
      updateMenuState: () => {}
    };
    installSaveLoad(app);

    const ok = app.deserializeGraph({ version: 2, name: 'Loaded', nodes: [], wires: [] });

    expect(ok).toBe(true);
    expect(clearPreview).toHaveBeenCalledTimes(1);
  });

  it('does nothing for invalid data (no clear, no throw)', () => {
    const clearPreview = vi.fn();
    const app = { nodes: [], wires: [], _clearPreview: clearPreview, renderRecentProjects: () => {} };
    installSaveLoad(app);

    expect(app.deserializeGraph(null)).toBe(false);
    expect(clearPreview).not.toHaveBeenCalled();
  });
});
