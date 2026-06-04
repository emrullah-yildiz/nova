// ═══════════════════════════════════════════════════
// FILE CONTROL (file-control)
//
// Support for the `file` node control type. A node declares a control like:
//   { id: 'file', type: 'file', label: 'File', accept: '.csv,.json,.xlsx' }
// which renders a file-picker button in the node. On selection the chosen
// file is read into a uniform value object stored in node.controlValues[id]
// (see THE FILE-CONTROL VALUE CONTRACT below), which downstream node
// execute() reads — e.g. the Data.Import* nodes parse `text`/`data`.
//
// THE FILE-CONTROL VALUE CONTRACT (shared with the Data nodes that consume it):
//   node.controlValues[id] = {
//     name: string,      // file name
//     mime: string,      // file.type (may be '')
//     text: string|null, // UTF-8 decoded text (set for text files; for
//                        //   binary like .xlsx may be null or best-effort)
//     data: string       // base64 of the raw bytes (ALWAYS set) — binary
//                        //   parsers (xlsx) decode this
//   }
//
// The pure `fileToControlValue(file)` helper is exported so it is unit-testable
// with a mock File/Blob and no real DOM file dialog. The renderer wiring lives
// in node-renderer.js; it calls this helper then routes the value through the
// app's existing onCtrl()/invalidateCompute() value-change path — no parallel
// notification system.
//
// FILE-SIZE LIMIT (MAX_FILE_BYTES, 10 MB):
//   The whole file is base64-encoded into controlValues, which is persisted in
//   saved projects and broadcast to collaborators over the realtime channel.
//   Base64 also inflates payload ~33%. To avoid corrupting saved-project state
//   and flooding the collab broadcast, fileToControlValue REJECTS files larger
//   than MAX_FILE_BYTES with a clear Error BEFORE reading any bytes. The
//   renderer's _onFileControlInput .catch() leaves the prior control value
//   intact and surfaces the message (toast if available, else console.warn).
// ═══════════════════════════════════════════════════

// Maximum accepted file size (raw bytes, before base64). 10 MB — large enough
// for typical CSV/JSON/XLSX inputs, small enough to keep saved-project JSON and
// collab broadcasts sane. Exported so callers/tests can reference the limit.
export var MAX_FILE_BYTES = 10 * 1024 * 1024;

// Control types the node renderer knows how to draw. `file` is added here so a
// declared file control is recognized (and the renderer's unknown-control
// fallback is not hit). The renderer imports this to gate its `file` branch and
// a test asserts membership. Kept as a plain frozen set — Nova has no central
// control registry, this is the minimal honest record of "known control type".
export var KNOWN_CONTROL_TYPES = Object.freeze([
  'formula',
  'dropdown',
  'checkbox',
  'text',
  'number',
  'range',
  'file'
]);

export function isKnownControlType(type) {
  return KNOWN_CONTROL_TYPES.indexOf(type) >= 0;
}

// Base64-encode an ArrayBuffer/Uint8Array without blowing the call stack on
// large files. btoa is available in browsers and modern Node.
function bytesToBase64(buffer) {
  var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  var CHUNK = 0x8000; // 32k chars per fromCharCode call
  var binary = '';
  for (var i = 0; i < bytes.length; i += CHUNK) {
    var slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice);
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node fallback (no btoa, very old runtimes)
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('No base64 encoder available');
}

// Read a Blob's raw bytes as an ArrayBuffer. Uses FileReader.readAsArrayBuffer
// in the browser (per the control contract); falls back to Blob.arrayBuffer()
// when FileReader is unavailable (e.g. unit tests in Node).
function readArrayBuffer(file) {
  if (typeof FileReader !== 'undefined') {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error || new Error('FileReader failed')); };
      reader.readAsArrayBuffer(file);
    });
  }
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return Promise.reject(new Error('Cannot read file bytes: no FileReader or Blob.arrayBuffer'));
}

// Read a Blob as UTF-8 text. Uses FileReader.readAsText in the browser; falls
// back to Blob.text() when FileReader is unavailable. Resolves to null on
// failure so the caller can still keep the always-present base64 `data`.
function readText(file) {
  if (typeof FileReader !== 'undefined') {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(typeof reader.result === 'string' ? reader.result : null); };
      reader.onerror = function() { resolve(null); };
      try { reader.readAsText(file); } catch (e) { resolve(null); }
    });
  }
  if (file && typeof file.text === 'function') {
    return file.text().then(function(t) { return typeof t === 'string' ? t : null; }, function() { return null; });
  }
  return Promise.resolve(null);
}

// PURE, testable read: File/Blob -> Promise<{ name, mime, text, data }> per the
// file-control value contract. `data` (base64 of raw bytes) is always set; if
// the byte read fails the promise rejects (callers should ignore the result and
// leave the control value unchanged). `text` is best-effort and may be null.
export function fileToControlValue(file) {
  if (!file) return Promise.reject(new Error('fileToControlValue: no file'));
  // Reject oversized files up front (before reading bytes) so we never base64
  // them into controlValues / saved projects / collab broadcasts. file.size is
  // present on real File/Blob objects.
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
    var limitMb = Math.round((MAX_FILE_BYTES / (1024 * 1024)) * 10) / 10;
    var gotMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
    return Promise.reject(new Error(
      'File too large: ' + gotMb + ' MB exceeds the ' + limitMb + ' MB limit. '
      + 'Choose a smaller file.'));
  }
  var name = file.name || '';
  var mime = file.type || '';
  return readArrayBuffer(file).then(function(buffer) {
    var data = bytesToBase64(buffer);
    return readText(file).then(function(text) {
      return { name: name, mime: mime, text: text, data: data };
    });
  });
}

export default fileToControlValue;
