import { afterEach } from 'vitest';

describe('main Nova Connect exports', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalAddEventListener = globalThis.addEventListener;

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.addEventListener = originalAddEventListener;
    delete globalThis.__revitNodesInstalled;
    delete globalThis.RevitBridge;
    delete globalThis.RevitElement;
  });

  it('keeps NodeFlow.RevitBridge aligned with the installed global bridge', async () => {
    globalThis.window = globalThis;
    globalThis.addEventListener = () => {};
    globalThis.document = {
      readyState: 'loading',
      addEventListener: () => {},
      createElement: () => ({ set src(value) { this._src = value; } }),
      head: { appendChild: () => {} }
    };

    const module = await import('../src/main.js?revit-export-test=' + Date.now());
    const bridge = module.default.installRevitNodes(globalThis);

    expect(module.default.RevitBridge).toBeDefined();
    expect(module.default.RevitBridge).toBe(bridge);
    expect(typeof module.default.RevitBridge.queryElements).toBe('function');
  });
});
