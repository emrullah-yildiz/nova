import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installLoggerPatch } from '../src/app/logger-patch.js';

describe('logger patch', () => {
  const saved = {};

  beforeEach(() => {
    saved.document = globalThis.document;
    saved.window = globalThis.window;
    saved.app = globalThis.app;

    globalThis.window = {};
    globalThis.document = {
      body: { appendChild() {} },
      createElement() { return { style: {}, appendChild() {}, remove() {} }; },
      getElementById() { return null; },
      addEventListener() {},
      elementFromPoint() { return null; }
    };
  });

  afterEach(() => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.app = saved.app;
  });

  function makePatchableApp(onRespond) {
    return {
      nodes: [],
      wires: [],
      selectedNodes: [],
      chatHistories: { workspace: [], landing: [] },
      codeLang: 'python',
      nodeZCounter: 10,
      addNodeToCanvas() { return null; },
      removeNode() {},
      addWire() {},
      sendChat() {},
      respond: onRespond,
      approveCode() {},
      cancelCode() {},
      runEditedCode() {},
      runGraph() {},
      switchPage() {},
      initWorkspaceChat() {},
      updateMenuState() {},
      applyTransform() {},
      renderNode() {},
      updatePortDots() {},
      renderWires() {},
      setChatSuggestions() {},
      addAIMessage() {}
    };
  }

  it('preserves image attachments when logging app.respond', () => {
    let received = null;
    const fakeApp = makePatchableApp(function(ch, txt, images) {
      received = { ch, txt, images };
    });

    installLoggerPatch(fakeApp);
    const images = [{ mediaType: 'image/png', data: 'AAAA' }];
    fakeApp.respond('workspace', '', images);

    expect(received).toEqual({ ch: 'workspace', txt: '', images });
  });
});
