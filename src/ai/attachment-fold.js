// Pure helpers for chat file attachments. Kept DOM-free so the folding logic
// (what the AI actually receives) is unit-testable without the chat UI.
//
// An attachment is { name: string, text: string, size?: number }.

// Extensions we treat as text/data and can read with FileReader.readAsText.
export const ATTACH_TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|geojson|js|mjs|cjs|ts|jsx|tsx|py|html?|css|scss|xml|ya?ml|svg|log|nodeflow|ini|toml|cfg|conf|sql|sh|bat|ps1|c|cpp|cc|h|hpp|java|rb|go|rs|php|r|m|lua|kt|swift|dart)$/i;

export const ATTACH_MAX_BYTES = 256 * 1024; // 256 KB per file

// Is this file attachable as text? Accepts by extension or by text-ish MIME type.
export function isTextAttachment(name, type) {
  if (type && (type.indexOf('text/') === 0 || type === 'application/json' || type === 'image/svg+xml')) return true;
  return ATTACH_TEXT_EXT.test(String(name || ''));
}

// Comma-joined file names — shown in the user's visible bubble (content is not).
export function attachmentNames(list) {
  if (!list || !list.length) return '';
  return list.map(function(f) { return f.name; }).join(', ');
}

// Folds attachment contents into the message actually sent to the AI: each file
// as a fenced block prefixed by its name, followed by the user's typed text.
export function foldAttachments(list, userText) {
  var text = userText == null ? '' : String(userText);
  if (!list || !list.length) return text;
  var blocks = list.map(function(f) {
    return '### Attached file: ' + f.name + '\n```\n' + (f.text == null ? '' : f.text) + '\n```';
  });
  var header = 'The user attached ' + list.length + ' file' + (list.length > 1 ? 's' : '') + ':\n\n';
  return header + blocks.join('\n\n') + (text ? '\n\n' + text : '');
}
