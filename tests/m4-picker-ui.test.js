import { describe, it, expect } from 'vitest';
import { installNovaConnectPanel } from '../src/integrations/connect/connect-panel.js';

// ---------------------------------------------------------------------------
// DOM + bridge stubs. Mirrors tests/connect-panel.test.js so the picker is
// exercised through the SAME install/render path the real app uses, with the
// M4 RevitBridge transport MOCKED (no real Revit/hub). The mock bridge is
// injected via runtime.__novaRevitBridge, which app._getRevitBridge() prefers.
// ---------------------------------------------------------------------------

function createElementStub(tagName = 'div') {
  return {
    tagName,
    id: '',
    className: '',
    textContent: '',
    value: '',
    style: {},
    children: [],
    innerHTMLValue: '',
    onclick: null,
    set innerHTML(value) { this.innerHTMLValue = value; },
    get innerHTML() { return this.innerHTMLValue; },
    appendChild(child) {
      this.children.push(child);
      if (child.id) this.ownerDocument.elements.set(child.id, child);
      return child;
    },
    insertBefore(child) {
      this.children.unshift(child);
      if (child.id) this.ownerDocument.elements.set(child.id, child);
      return child;
    }
  };
}

function createDocumentStub() {
  const document = {
    elements: new Map(),
    head: null,
    body: null,
    createElement(tagName) {
      const element = createElementStub(tagName);
      element.ownerDocument = document;
      return element;
    },
    getElementById(id) { return document.elements.get(id) || null; },
    querySelector(selector) {
      if (selector === '.menu-right') return document.elements.get('menu-right') || null;
      return null;
    }
  };
  document.head = document.createElement('head');
  document.body = document.createElement('body');
  const menuRight = document.createElement('div');
  menuRight.id = 'menu-right';
  menuRight.className = 'menu-right';
  document.elements.set('menu-right', menuRight);
  return document;
}

// A mock M4 bridge. `selection` is returned from requestSelection; `place` is
// returned (or thrown) from placeInstance. Records the deps it was called with
// so we can assert the panel passes the resolved NovaConnect client through.
function makeMockBridge({ selection, place, selectionError, placeError } = {}) {
  const calls = { requestSelection: [], placeInstance: [] };
  return {
    calls,
    requestSelection(opts, deps) {
      calls.requestSelection.push({ opts, deps });
      if (selectionError) return Promise.reject(selectionError);
      return Promise.resolve(selection || { elements: [] });
    },
    placeInstance(spec, deps) {
      calls.placeInstance.push({ spec, deps });
      if (placeError) return Promise.reject(placeError);
      return Promise.resolve(place || { ok: true, elementId: 'new-99' });
    }
  };
}

function setupPanel(bridge, client) {
  const document = createDocumentStub();
  const app = {};
  const runtime = {
    document,
    localStorage: { getItem: () => null, setItem: () => {} },
    __novaRevitBridge: bridge,
    NodeFlow: { NovaConnect: client || { status: 'connected', sessionId: 'sess-1' } }
  };
  installNovaConnectPanel(app, runtime);
  app.novaConnectPanelOpen = true;
  app._renderNovaConnectPanel();
  return { app, document };
}

function panelHtml(document) {
  return document.getElementById('nova-connect-panel').innerHTMLValue;
}

const SAMPLE_SELECTION = {
  elements: [
    {
      id: '12345', name: 'Basic Wall', category: 'Walls', typeName: 'Generic - 200mm',
      levelName: 'Level 1', params: {},
      faces: [{ faceId: 'f-1', bbox: null }]
    },
    { id: '678', name: 'Floor A', category: 'Floors', typeName: '', levelName: '', params: {} }
  ]
};

describe('M4-T5 picker UI — initial / idle state', () => {
  it('renders the idle picker with a Pick button', () => {
    const { document } = setupPanel(makeMockBridge());
    const html = panelHtml(document);
    expect(html).toContain('Selection &amp; Placement');
    expect(html).toContain('data-picker-phase="idle"');
    expect(html).toContain('app.pickRevitSelection()');
    expect(html).toContain('Pick Elements / Faces');
  });
});

describe('M4-T5 picker UI — pick shows a selection summary', () => {
  it('walks idle -> selected and renders the element summary', async () => {
    const bridge = makeMockBridge({ selection: SAMPLE_SELECTION });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();

    expect(app.novaConnectPicker.phase).toBe('selected');
    expect(app.novaConnectPicker.elements).toHaveLength(2);

    const html = panelHtml(document);
    expect(html).toContain('data-picker-phase="selected"');
    expect(html).toContain('2</strong> elements selected');
    expect(html).toContain('1</strong> face');
    expect(html).toContain('Basic Wall');
    expect(html).toContain('Floor A');
    expect(html).toContain('app.placeRevitInstance()');

    // bridge.requestSelection called with includeFaces + the resolved client.
    expect(bridge.calls.requestSelection).toHaveLength(1);
    expect(bridge.calls.requestSelection[0].opts).toEqual({ includeFaces: true });
    expect(bridge.calls.requestSelection[0].deps.client).toBe(app._getNovaConnect());
  });

  it('returns to idle with a note when nothing is selected', async () => {
    const bridge = makeMockBridge({ selection: { elements: [] } });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();

    expect(app.novaConnectPicker.phase).toBe('idle');
    expect(panelHtml(document)).toContain('No elements were selected in Revit.');
  });
});

describe('M4-T5 picker UI — place shows success', () => {
  it('walks selected -> placing -> success banner', async () => {
    const bridge = makeMockBridge({ selection: SAMPLE_SELECTION, place: { ok: true, elementId: 'new-99' } });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();
    await app.placeRevitInstance();

    expect(app.novaConnectPicker.phase).toBe('selected');
    expect(app.novaConnectPicker.placeResult.ok).toBe(true);

    const html = panelHtml(document);
    expect(html).toContain('ncp-picker-place-ok');
    expect(html).toContain('Placed Furniture: Chair (id new-99).');

    // placeInstance got a contract spec hosted on the first selected face.
    expect(bridge.calls.placeInstance).toHaveLength(1);
    const spec = bridge.calls.placeInstance[0].spec;
    expect(spec.kind).toBe('FamilyInstance');
    expect(spec.hostFaceId).toBe('f-1');
    expect(bridge.calls.placeInstance[0].deps.client).toBe(app._getNovaConnect());
  });

  it('surfaces a host rejection (ok:false) as a place error banner', async () => {
    const bridge = makeMockBridge({
      selection: SAMPLE_SELECTION,
      place: { ok: false, message: 'User denied the write.' }
    });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();
    await app.placeRevitInstance();

    expect(app.novaConnectPicker.phase).toBe('selected');
    expect(app.novaConnectPicker.placeResult.ok).toBe(false);
    const html = panelHtml(document);
    expect(html).toContain('ncp-picker-place-error');
    expect(html).toContain('User denied the write.');
  });
});

describe('M4-T5 picker UI — error path', () => {
  it('renders the error state with detail + retry when requestSelection throws', async () => {
    const bridge = makeMockBridge({ selectionError: new Error('Nova Connect client is not available.') });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();

    expect(app.novaConnectPicker.phase).toBe('error');
    const html = panelHtml(document);
    expect(html).toContain('data-picker-phase="error"');
    expect(html).toContain('Selection failed.');
    expect(html).toContain('Nova Connect client is not available.');
    expect(html).toContain('Retry Pick');
  });

  it('renders the error state when placeInstance throws', async () => {
    const bridge = makeMockBridge({
      selection: SAMPLE_SELECTION,
      placeError: new Error('Invalid geometry.place request: bad points')
    });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();
    await app.placeRevitInstance();

    expect(app.novaConnectPicker.phase).toBe('error');
    const html = panelHtml(document);
    expect(html).toContain('Placement failed.');
    expect(html).toContain('Invalid geometry.place request');
  });

  it('refuses to place with nothing selected', async () => {
    const bridge = makeMockBridge();
    const { app } = setupPanel(bridge);

    await app.placeRevitInstance();

    expect(app.novaConnectPicker.phase).toBe('error');
    expect(app.novaConnectPicker.message).toContain('Select elements before placing.');
    expect(bridge.calls.placeInstance).toHaveLength(0);
  });
});

describe('M4-T5 picker UI — clear', () => {
  it('clears a selection back to idle', async () => {
    const bridge = makeMockBridge({ selection: SAMPLE_SELECTION });
    const { app, document } = setupPanel(bridge);

    await app.pickRevitSelection();
    expect(app.novaConnectPicker.phase).toBe('selected');

    app.clearRevitSelection();
    expect(app.novaConnectPicker.phase).toBe('idle');
    expect(app.novaConnectPicker.elements).toHaveLength(0);
    expect(panelHtml(document)).toContain('data-picker-phase="idle"');
  });
});
