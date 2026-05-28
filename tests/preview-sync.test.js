import {
  setNodePreviewState,
  setPreviewItemVisibility,
  showAllPreviews
} from '../src/viewer/preview-sync.js';

function createClassList() {
  const classes = new Set();
  return {
    classes,
    toggle(name, force) {
      if (force) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

function createDocumentStub(nodeId) {
  const eye = { className: 'node-preview-eye', textContent: '', title: '' };
  const nodeEl = { classList: createClassList() };

  return {
    eye,
    nodeEl,
    querySelector(selector) {
      return selector === '#' + nodeId + ' .node-preview-eye' ? eye : null;
    },
    getElementById(id) {
      return id === nodeId ? nodeEl : null;
    }
  };
}

function createPreviewFixture() {
  const app = {
    nodes: [{ id: 'node-1', _preview3d: true }]
  };
  const viewer = {
    _selectedItem: null,
    _renderCount: 0,
    _renderGeoList() {
      this._renderCount += 1;
    },
    _sceneItems: [
      {
        id: 'node-1:solid',
        nodeId: 'node-1',
        visible: true,
        selected: false,
        group: { visible: true }
      }
    ]
  };
  const documentRef = createDocumentStub('node-1');
  return { app, viewer, documentRef };
}

describe('3D preview sync', () => {
  it('syncs node preview off to the preview list item and 3D geometry group', () => {
    const { app, viewer, documentRef } = createPreviewFixture();

    setNodePreviewState(app, viewer, 'node-1', false, { documentRef });

    expect(app.nodes[0]._preview3d).toBe(false);
    expect(viewer._sceneItems[0].visible).toBe(false);
    expect(viewer._sceneItems[0].group.visible).toBe(false);
    expect(documentRef.eye.className).toBe('node-preview-eye off');
    expect(documentRef.nodeEl.classList.contains('node-3d-hidden')).toBe(true);
    expect(viewer._renderCount).toBe(1);
  });

  it('syncs preview list visibility back to the node preview control', () => {
    const { app, viewer, documentRef } = createPreviewFixture();

    setPreviewItemVisibility(app, viewer, viewer._sceneItems[0], false, { documentRef });

    expect(app.nodes[0]._preview3d).toBe(false);
    expect(viewer._sceneItems[0].visible).toBe(false);
    expect(viewer._sceneItems[0].group.visible).toBe(false);
    expect(documentRef.eye.className).toBe('node-preview-eye off');
    expect(documentRef.nodeEl.classList.contains('node-3d-hidden')).toBe(true);
  });

  it('keeps node preview on until all preview-list items for that node are hidden', () => {
    const { app, viewer, documentRef } = createPreviewFixture();
    viewer._sceneItems.push({
      id: 'node-1:curve',
      nodeId: 'node-1',
      visible: true,
      selected: false,
      group: { visible: true }
    });

    setPreviewItemVisibility(app, viewer, viewer._sceneItems[0], false, { documentRef });

    expect(app.nodes[0]._preview3d).toBe(true);
    expect(documentRef.eye.className).toBe('node-preview-eye');

    setPreviewItemVisibility(app, viewer, viewer._sceneItems[1], false, { documentRef });

    expect(app.nodes[0]._preview3d).toBe(false);
    expect(documentRef.eye.className).toBe('node-preview-eye off');
  });

  it('restores node preview, preview list items, and geometry groups together', () => {
    const { app, viewer, documentRef } = createPreviewFixture();
    setNodePreviewState(app, viewer, 'node-1', false, { documentRef });

    showAllPreviews(app, viewer, { documentRef });

    expect(app.nodes[0]._preview3d).toBe(true);
    expect(viewer._sceneItems[0].visible).toBe(true);
    expect(viewer._sceneItems[0].group.visible).toBe(true);
    expect(documentRef.eye.className).toBe('node-preview-eye');
    expect(documentRef.nodeEl.classList.contains('node-3d-hidden')).toBe(false);
  });
});
