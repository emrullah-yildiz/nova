// Grounded knowledge for the AI assistant so it can be "one place to learn Nova":
// answer "how does Nova work?" and "which node does X?" from real product facts
// and the real node registry — never invented. Two sources:
//
//  • NOVA_PRIMER  — an authored, concise primer on how Nova works / how to use it.
//  • buildNodeKnowledge() — a per-node "what it does" guide derived from each
//    node's own description, so node recommendations always name a real node.
//
// Both are injected into GPTClient.buildSystemPrompt with a grounded-only
// instruction. Pure (no DOM/app state); the node guide is cached like the catalog.

import { coreNodes } from '../nodes/coreNodes.js';

// First sentence of a description, clipped — keeps the node guide one line/node.
export function firstSentence(text, maxLen = 160) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let s = m ? m[1] : t;
  if (s.length > maxLen) s = s.slice(0, maxLen).trim() + '…';
  return s;
}

let _cachedNodeKnowledge = null;

// A category-grouped "NodeName — what it does" guide built from the live registry.
export function buildNodeKnowledge() {
  if (_cachedNodeKnowledge) return _cachedNodeKnowledge;

  const byCategory = new Map();
  for (const node of coreNodes) {
    if (!node || !node.type) continue;
    const cat = node.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push({ name: node.name || node.type, desc: firstSentence(node.description) });
  }

  const lines = [
    '=== NOVA NODE GUIDE (what each node does) ===',
    'To answer "which node does X?", recommend a real node from this list by name. If nothing here fits, say so plainly — never invent a node that is not listed.',
    ''
  ];
  for (const cat of Array.from(byCategory.keys()).sort()) {
    lines.push('## ' + cat);
    const seen = new Set();
    for (const item of byCategory.get(cat)) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      lines.push('- ' + item.name + (item.desc ? ' — ' + item.desc : ''));
    }
    lines.push('');
  }
  _cachedNodeKnowledge = lines.join('\n').trim();
  return _cachedNodeKnowledge;
}

// Test seam — clear the cache between knowledge-mutation tests.
export function _clearNodeKnowledgeCacheForTests() {
  _cachedNodeKnowledge = null;
}

// Authored, grounded primer. Keep it factual and concise — it is the source the
// assistant teaches "how Nova works / how to use it" from.
export const NOVA_PRIMER = `=== HOW NOVA WORKS (teach the user from this) ===
Nova is a visual, node-based parametric modeling tool for geometry and design, with a live 3D viewer.

Core concepts:
- Graph: a workflow is a graph of NODES connected by WIRES. Each node has typed INPUT ports (left) and OUTPUT ports (right) plus inline control values.
- Build a graph: drag a node from the Node Library (left panel), set its controls, then connect an output port to an input port by dragging between the port dots. Wires carry data downstream.
- Types: ports are typed (number, point, vector, curve, mesh, list, any, …). A wire between incompatible types is flagged so you can fix it.
- Run / compute: nodes compute their outputs from their inputs; the 3D viewer previews geometry and Output.* nodes (e.g. Output.Watch) show values. Re-running recomputes the graph.
- Code terminal: the graph transpiles to Python or C# (the "Generated Code" panel). You can read it, and Nova can round-trip code back into a node graph.
- Custom.Python: an escape hatch that runs Python in the browser (Pyodide). It declares its ports with header comments — "# in: name:type, …" and "# out: name:type" — and those names become the variables the code reads/writes.
- Node versions: a node type can have multiple behavior versions. A node shows a version picker in its header when more than one version exists; switching is migrated, and a saved graph keeps the version it was built with, so new releases never silently break old graphs.
- AI assistant: this assistant can read the current graph (see the LIVE GRAPH section) and help you build, explain, or fix it. It uses your API key (BYOK) or a shared free model.
- Hosts (Revit / Rhino): with Nova Connect paired, Host/Revit/Rhino nodes read live elements and geometry and can send geometry back.

When the user asks how Nova works, how to use it, or how to accomplish something, answer from THIS primer, the NODE GUIDE, and the LIVE GRAPH. If a question is outside what these cover, say you are not certain rather than guessing.`;
