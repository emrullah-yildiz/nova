import { installNovaConnectPanel } from '../src/integrations/connect/connect-panel.js';

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

describe('Nova Connect panel (simplified)', () => {
  it('installs a menu button, toggles panel, and connects/disconnects', async () => {
    const document = createDocumentStub();
    const app = {};
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
        }
      }
    };

    installNovaConnectPanel(app, runtime);

    // Menu button installed
    expect(document.getElementById('menu-connect')).toBeTruthy();

    // Panel toggles visible
    expect(document.getElementById('nova-connect-panel').className).not.toContain('visible');
    app.toggleNovaConnectPanel();
    expect(document.getElementById('nova-connect-panel').className).toContain('visible');

    // Panel toggles closed
    app.closeNovaConnectPanel();
    expect(document.getElementById('nova-connect-panel').className).not.toContain('visible');

    // Connect
    app.novaConnectPanelOpen = true;
    app._renderNovaConnectPanel();
    await app.connectNovaConnect();
    expect(app.novaConnectLastResult.message).toContain('Connected successfully');

    // Disconnect
    await app.disconnectNovaConnect();
    expect(app.novaConnectLastResult.message).toBe('Disconnected.');

    // Panel HTML contains the settings fields
    const panel = document.getElementById('nova-connect-panel');
    expect(panel).toBeTruthy();
    expect(panel.innerHTMLValue).toContain('nova-connect-url');
    expect(panel.innerHTMLValue).toContain('ws://127.0.0.1:8765');
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
        NovaConnect: { status: 'disconnected' }
      }
    };

    installNovaConnectPanel(app, runtime);

    expect(app.novaConnectPanelOpen).toBe(true);
    expect(app._readNovaConnectSettings()).toMatchObject({
      url: 'ws://127.0.0.1:8765',
      token: 'token-123',
      projectId: 'Sample'
    });
    expect(app.novaConnectLastResult.message).toBe('Opened from Revit. Click Connect to establish connection.');
  });

  it('idempotent — calling install twice does not re-install', () => {
    const document = createDocumentStub();
    const app = {};
    const runtime = {
      document,
      localStorage: { getItem: () => null, setItem: () => {} },
      NodeFlow: { NovaConnect: { status: 'disconnected' } }
    };

    const first = installNovaConnectPanel(app, runtime);
    const second = installNovaConnectPanel(app, runtime);
    expect(first).toBe(app);
    expect(second).toBe(app);
  });
});