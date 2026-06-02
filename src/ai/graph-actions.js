// Action protocol (P3, "show" ops): the assistant can append a fenced
// ```nova-action block of structured ops that the app executes to *show* the
// user something on their canvas — focus a node, highlight nodes, open a node's
// inspector, or reveal a node type in the library. These ops are read-only
// (no graph mutation), so they auto-run; edit ops (add/remove wire, etc.) are a
// later, Apply-gated phase and are intentionally NOT in this set.
//
// This module is pure: it parses + validates the block out of an AI response and
// returns the recognized ops plus the response text with the block removed (so
// the raw JSON is never shown to the user). Execution lives in the app.

// Read-only ops that are safe to auto-run.
export const SHOW_OPS = new Set(['focusNode', 'highlightNodes', 'openInspector', 'revealLibraryNode']);
export const MAX_HIGHLIGHT_NODES = 5;

const FENCE_RE = /```nova-action\s*([\s\S]*?)```/i;

// parseNovaActions(text) -> { ops, cleanedText }
// ops: the validated show-ops (unknown ops dropped). cleanedText: the text with
// the nova-action fence removed and surplus blank lines collapsed.
export function parseNovaActions(text) {
  const result = { ops: [], cleanedText: typeof text === 'string' ? text : '' };
  if (typeof text !== 'string' || !text) return result;

  const m = text.match(FENCE_RE);
  if (!m) return result;

  let parsed;
  try { parsed = JSON.parse(m[1].trim()); } catch { return result; }

  const rawOps = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.ops) ? parsed.ops : []);
  for (const o of rawOps) {
    if (!o || typeof o.op !== 'string' || !SHOW_OPS.has(o.op)) continue;
    if (o.op === 'highlightNodes' && Array.isArray(o.ids)) {
      result.ops.push({ ...o, ids: o.ids.slice(0, MAX_HIGHLIGHT_NODES), totalIds: o.ids.length });
      continue;
    }
    result.ops.push(o);
  }

  result.cleanedText = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return result;
}
