import { installNovaConnectPanel } from '../src/integrations/connect/connect-panel.js';
import { Geo } from '../src/geometry/index.js';

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
    set innerHTML(value) {
      this.innerHTMLValue = value;
    },
    get innerHTML() {
      return this.innerHTMLValue;
    },
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
    getElementById(id) {
      return document.elements.get(id) || null;
    },
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

describe('Nova Connect panel', () => {
  it('installs a menu button and runs bridge actions through app methods', async () => {
    const document = createDocumentStub();
    const app = {};
    const walls = [{ id: 3001, category: 'Walls', name: 'Basic Wall' }];
    const approvalCheckbox = document.createElement('input');
    approvalCheckbox.id = 'nova-connect-write-approval';
    approvalCheckbox.checked = false;
    document.elements.set(approvalCheckbox.id, approvalCheckbox);
    const sendCalls = [];
    const runtime = {
      document,
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      NodeFlow: {
        NovaConnect: {
          status: 'disconnected',
          connect: async function() {
            this.status = 'connected';
            this.sessionId = 'local-revit-session';
            return true;
          },
          disconnect: function() {
            this.status = 'disconnected';
          }
        },
        RevitBridge: {
          queryElements: async () => walls,
          getLiveGeometries: async () => [new Geo.Mesh3([], [])],
          sendGeometry: async (geometry, identity, options) => {
            sendCalls.push({ geometry, identity, options });
            return { ok: true, message: 'Accepted.', data: { directShapeId: 'mock-1' } };
          }
        },
        Geo
      }
    };

    installNovaConnectPanel(app, runtime);

    expect(document.getElementById('menu-connect')).toBeTruthy();
    app.toggleNovaConnectPanel();
    expect(document.getElementById('nova-connect-panel').className).toContain('visible');

    await app.connectNovaConnect();
    expect(app.novaConnectLastResult.message).toContain('Connected');

    await app.queryNovaConnectWalls();
    expect(app.novaConnectLastResult.message).toBe('Received 1 wall element.');

    await app.getNovaConnectGeometry();
    expect(app.novaConnectLastResult.message).toBe('Received 1 mesh result.');

    await app.sendNovaConnectTestPoint();
    expect(app.novaConnectLastResult.message).toBe('Approve this write operation before sending geometry.');
    expect(sendCalls).toHaveLength(0);

    approvalCheckbox.checked = true;
    await app.sendNovaConnectTestPoint();
    expect(app.novaConnectLastResult.detail).toContain('mock-1');
    expect(sendCalls[0].options.approval).toMatchObject({
      approved: true,
      approvedBy: 'nova-connect-panel',
      scope: 'single-operation'
    });
    expect(approvalCheckbox.checked).toBe(false);
  });

  it('opens prefilled from Revit launcher URL parameters', () => {
    const document = createDocumentStub();
    const app = {};
    const runtime = {
      document,
      location: {
        search: '?novaConnectOpen=1&novaConnectUrl=ws%3A%2F%2F127.0.0.1%3A8765&novaConnectToken=token-123&novaConnectProject=Sample'
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      NodeFlow: {
        NovaConnect: { status: 'disconnected' },
        RevitBridge: {},
        Geo
      }
    };

    installNovaConnectPanel(app, runtime);

    expect(app.novaConnectPanelOpen).toBe(true);
    expect(app._readNovaConnectSettings()).toMatchObject({
      url: 'ws://127.0.0.1:8765',
      token: 'token-123',
      projectId: 'Sample'
    });
    expect(app.novaConnectLastResult.message).toBe('Opened from Revit. Start the hub, then click Connect.');
  });
});
