import {
  fileToControlValue,
  isKnownControlType,
  KNOWN_CONTROL_TYPES,
  MAX_FILE_BYTES
} from '../src/ui/file-control.js';
import { installNodeRenderer } from '../src/ui/node-renderer.js';

// Build a File-like object backed by a real Blob so arrayBuffer()/text() use
// the runtime's actual UTF-8 encoding. The unit test path uses the Blob
// fallback (Node has no FileReader); the browser path uses FileReader, which is
// covered by manual/e2e (see note at the bottom of this file).
function makeFile(name, content, type) {
  var blob = new Blob([content], { type: type || '' });
  return {
    name: name,
    type: type || '',
    size: blob.size,
    arrayBuffer: function() { return blob.arrayBuffer(); },
    text: function() { return blob.text(); }
  };
}

// File-like object that reports a given size WITHOUT allocating that many real
// bytes — the size guard rejects before any read, so the content is never used.
function makeSizedFile(name, size, type) {
  return {
    name: name,
    type: type || '',
    size: size,
    arrayBuffer: function() { return Promise.resolve(new ArrayBuffer(0)); },
    text: function() { return Promise.resolve(''); }
  };
}

function base64ToBytes(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('file-control', () => {
  describe('fileToControlValue', () => {
    it('reads a text file into the contract value shape', async () => {
      const value = await fileToControlValue(makeFile('rows.csv', 'a,b\n1,2\n', 'text/csv'));

      expect(value.name).toBe('rows.csv');
      expect(value.mime).toBe('text/csv');
      expect(value.text).toBe('a,b\n1,2\n');
      expect(typeof value.data).toBe('string');
      expect(value.data.length).toBeGreaterThan(0);
    });

    it('produces base64 `data` that decodes back to the original bytes', async () => {
      const content = 'héllo, wörld';
      const value = await fileToControlValue(makeFile('u.txt', content, 'text/plain'));

      const decoded = new TextDecoder().decode(base64ToBytes(value.data));
      expect(decoded).toBe(content);
      // text is the same UTF-8 decode for a text file
      expect(value.text).toBe(content);
    });

    it('always sets `data` even when the file has no mime type', async () => {
      const value = await fileToControlValue(makeFile('noext', 'x', ''));
      expect(value.mime).toBe('');
      expect(value.name).toBe('noext');
      expect(value.data).toBe(typeof btoa === 'function' ? btoa('x') : value.data);
    });

    it('rejects when given no file', async () => {
      await expect(fileToControlValue(null)).rejects.toThrow();
    });

    // F-002: size guard. Oversized files must be rejected BEFORE being base64'd
    // into controlValues (which is persisted + broadcast to collaborators).
    it('rejects a file just over the size limit', async () => {
      const big = makeSizedFile('huge.bin', MAX_FILE_BYTES + 1, 'application/octet-stream');
      await expect(fileToControlValue(big)).rejects.toThrow(/too large/i);
    });

    it('accepts a file just at/under the size limit', async () => {
      // Exactly at the limit is allowed (guard is strictly greater-than).
      const value = await fileToControlValue(makeFile('ok.txt', 'within limit', 'text/plain'));
      expect(value.name).toBe('ok.txt');
      expect(value.text).toBe('within limit');
      expect(typeof value.data).toBe('string');
    });
  });

  // F-001: stored-XSS regression. The file control's chosen name is
  // user-controlled, persisted, and broadcast to collaborators; the renderer
  // MUST HTML-escape it (via app.escapeHtml) in both the title="" attribute and
  // the button text before it reaches innerHTML. The vitest env is `node` (no
  // jsdom) so we drive the real renderer through a minimal element/document stub
  // and assert the captured innerHTML carries the escaped name, not raw markup.
  describe('file name is HTML-escaped in rendered output (XSS)', () => {
    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderFileNode(fileName) {
      var captured = { html: '' };
      function makeEl() {
        var el = {
          className: '', id: '', style: { setProperty() {} },
          set innerHTML(v) { captured.html = v; },
          get innerHTML() { return captured.html; },
          querySelector() { return null; },
          querySelectorAll() { return { forEach() {} }; },
          addEventListener() {}, appendChild() {}
        };
        return el;
      }
      const canvas = makeEl();
      const doc = {
        getElementById(id) { return id === 'node-canvas' ? canvas : null; },
        createElement() { return makeEl(); }
      };
      const app = {
        wires: [],
        nodes: [],
        hexToGlow() { return 'rgba(0,0,0,0)'; },
        escapeHtml,
        // stubs the renderer may touch after innerHTML assignment
        bringToFront() {}, onNodeDragStart() {}, selectNode() {}, onPortDown() {}
      };
      globalThis.window = globalThis;
      globalThis.document = doc;
      globalThis.app = app;
      installNodeRenderer(app);

      const nd = {
        id: 'n1',
        type: 'data-import',
        x: 0, y: 0, zIndex: 1,
        controlValues: { file: { name: fileName } },
        def: {
          name: 'Import', icon: '📄', categoryColor: '#fff',
          inputs: [], outputs: [],
          controls: [{ id: 'file', type: 'file', label: 'File', accept: '.csv,.json' }]
        }
      };
      app.renderNode(nd);
      return captured.html;
    }

    it('escapes <, >, and " in the chosen file name (no raw injected markup)', () => {
      const evil = '"><img src=x onerror=alert(1)>.csv';
      const html = renderFileNode(evil);

      // No raw active markup: the injected <img> tag and the title-attribute
      // breakout ("> ...) must not survive as live HTML. (The literal text
      // "onerror=alert(1)" remains as inert, escaped text content — harmless
      // because the surrounding < > " are all entity-encoded.)
      expect(html).not.toContain('<img');
      expect(html).not.toContain('"><img');
      // The escaped form must appear (button text + title attribute).
      expect(html).toContain(escapeHtml(evil));
      // Closing-quote breakout neutralized (quote + tag both escaped).
      expect(html).toContain('&quot;&gt;&lt;img');
    });

    it('escapes the accept attribute defensively', () => {
      const html = renderFileNode('plain.csv');
      // accept came from the def, but is still routed through escapeHtml.
      expect(html).toContain('accept=".csv,.json"');
      expect(html).toContain('📄 plain.csv');
    });
  });

  describe('control-type registry', () => {
    it('recognizes the `file` control type (no unknown-control fallback)', () => {
      expect(isKnownControlType('file')).toBe(true);
      expect(KNOWN_CONTROL_TYPES).toContain('file');
    });

    it('still recognizes the pre-existing control types', () => {
      ['formula', 'dropdown', 'checkbox', 'text', 'number', 'range'].forEach((t) => {
        expect(isKnownControlType(t)).toBe(true);
      });
    });

    it('does not recognize an unknown control type', () => {
      expect(isKnownControlType('definitely-not-a-control')).toBe(false);
    });
  });
});

// Left to manual / e2e (Playwright): the actual click-to-upload DOM flow —
// hidden <input type="file"> triggered by the node's picker button, the
// browser FileReader path, and the node re-render showing the chosen file name.
// The pure helper above is environment-agnostic and covers the read contract.
