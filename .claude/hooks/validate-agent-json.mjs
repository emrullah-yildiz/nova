#!/usr/bin/env node
// SubagentStop hook: validates that implementation agents returned the required
// structured JSON output defined in docs/RULES.md §10.
//
// Only fires when the agent's final message contains a JSON object with a "ticket"
// field — implementation agents must emit this. Research/review/morpheus agents
// that don't emit a ticket JSON are passed through silently.
//
// Required fields: ticket, branch, files_changed, validation, ac_checked,
//                  issue, changed, how_to_test, gaps,
//                  playwright_tested, playwright_result
//
// Playwright enforcement:
//   - playwright_tested must be present (always required)
//   - If any files_changed path is under src/ui/ or src/viewer/, playwright_tested
//     must be true. A false value blocks the response and forces the agent to run
//     `npm run test:e2e` before finishing.
//   - If playwright_tested is true, playwright_result must be a non-empty string
//     (e.g. "12 pass, 0 fail"). A null or empty value blocks the response.
//
// FAIL-SAFE: any internal error → exit 0 (never traps).
import fs from 'node:fs';

const REQUIRED = [
  'ticket', 'branch', 'files_changed', 'validation',
  'ac_checked', 'issue', 'changed', 'how_to_test', 'gaps',
  'playwright_tested', 'playwright_result',
];

const UI_PATHS = /^src\/(ui|viewer)\//;

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

  const errors = [];

  // ── Missing required fields ──────────────────────────────────────────────────
  const missing = REQUIRED.filter((k) => !(k in payload));
  if (missing.length) {
    errors.push(
      'Missing required fields:\n' +
      missing.map((f) => '  • ' + f).join('\n')
    );
  }

  // ── Playwright enforcement ───────────────────────────────────────────────────
  if (!missing.includes('playwright_tested') && !missing.includes('files_changed')) {
    const changedFiles = Array.isArray(payload.files_changed) ? payload.files_changed : [];
    const touchedUI = changedFiles.some((f) => UI_PATHS.test(f));

    if (touchedUI && payload.playwright_tested === false) {
      errors.push(
        'Playwright E2E tests are REQUIRED but were not run.\n' +
        'You changed UI/viewer files:\n' +
        changedFiles.filter((f) => UI_PATHS.test(f)).map((f) => '  • ' + f).join('\n') + '\n\n' +
        'Run `npm.cmd run test:e2e` and confirm all specs pass before finishing.\n' +
        'Then set playwright_tested: true and playwright_result: "N pass, 0 fail".'
      );
    }

    if (payload.playwright_tested === true && !payload.playwright_result) {
      errors.push(
        'playwright_tested is true but playwright_result is empty.\n' +
        'Set playwright_result to the test output, e.g. "12 pass, 0 fail".'
      );
    }
  }

  if (!errors.length) process.exit(0);

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      'STRUCTURED OUTPUT VALIDATION FAILED — see docs/RULES.md §10.\n\n' +
      errors.join('\n\n─────\n\n') +
      '\n\nFix the issues above, then re-emit your complete JSON output.',
  }));
  process.exit(0);
}
try { main(); } catch { process.exit(0); }
