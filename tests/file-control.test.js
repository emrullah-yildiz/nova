import {
  fileToControlValue,
  isKnownControlType,
  KNOWN_CONTROL_TYPES
} from '../src/ui/file-control.js';

// Build a File-like object backed by a real Blob so arrayBuffer()/text() use
// the runtime's actual UTF-8 encoding. The unit test path uses the Blob
// fallback (Node has no FileReader); the browser path uses FileReader, which is
// covered by manual/e2e (see note at the bottom of this file).
function makeFile(name, content, type) {
  var blob = new Blob([content], { type: type || '' });
  return {
    name: name,
    type: type || '',
    arrayBuffer: function() { return blob.arrayBuffer(); },
    text: function() { return blob.text(); }
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
