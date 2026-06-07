#!/usr/bin/env node
// SubagentStop hook: validates that implementation agents returned the required
// structured JSON output defined in docs/RULES.md §10.
//
// Only fires when the agent's final message contains a JSON object with a "ticket"
// field — implementation agents must emit this. Research/review/morpheus agents
// that don't emit a ticket JSON are passed through silently.
//
// Required fields: ticket, branch, files_changed, validation, ac_checked,
//                  issue, changed, how_to_test, gaps
//
// FAIL-SAFE: any internal error → exit 0 (never traps).
import fs from 'node:fs';

const REQUIRED = [
  'ticket', 'branch', 'files_changed', 'validation',
  'ac_checked', 'issue', 'changed', 'how_to_test', 'gaps',
];

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { process.exit(0); }

  // Already fired once → let it through.
  if (data.stop_hook_active) process.exit(0);

  // Extract the agent's final message text.
  const message = (
    data.message ||
    (data.tool_result && data.tool_result.content) ||
    (data.result && data.result.content) ||
    ''
  );
  const text = typeof message === 'string' ? message : JSON.stringify(message);

  // Look for a JSON block (fenced or bare) containing a "ticket" key.
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    text.match(/(\{[\s\S]*"ticket"[\s\S]*\})/);
  if (!jsonMatch) process.exit(0); // No JSON block — not an implementation agent output.

  let payload;
  try { payload = JSON.parse(jsonMatch[1].trim()); } catch { process.exit(0); }

  // Only validate if it has a "ticket" field — implementation agent signature.
  if (!payload.ticket) process.exit(0);

  const missing = REQUIRED.filter((k) => !(k in payload));
  if (!missing.length) process.exit(0);

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      'STRUCTURED OUTPUT REQUIRED — see docs/RULES.md §10.\n\n' +
      'Your response contained a JSON block with "ticket" but is missing required fields:\n' +
      missing.map((f) => '  • ' + f).join('\n') + '\n\n' +
      'Return a complete JSON object with all required fields before finishing.',
  }));
  process.exit(0);
}
try { main(); } catch { process.exit(0); }
