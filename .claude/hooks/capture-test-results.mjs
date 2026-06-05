#!/usr/bin/env node
// PostToolUse hook: whenever the agent runs vitest / npm test, capture the result
// into .nova-last-test-run.json so the Stop hook can prove tests ran and passed.
// FAIL-SAFE: any internal error → exit 0 (never blocks anything).
import fs from 'node:fs';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { process.exit(0); }

  const cmd = (data.tool_input && data.tool_input.command) || '';
  // Skip echo/print commands that contain test-related strings but aren't actual test runs.
  // Also skip commands where the "command" itself looks like piped JSON (subagent debug artifacts).
  const trimmed = cmd.trimStart();
  if (/^echo\b/.test(trimmed) || /^printf\b/.test(trimmed) || /^\{/.test(trimmed)) process.exit(0);
  const isTestRun =
    /\bvitest\b.*\brun\b/.test(cmd) ||
    /\bnpm(?:\.cmd)?\s+(?:run\s+)?test\b/.test(cmd) ||
    /\bnpx(?:\.cmd)?\s+vitest\b/.test(cmd);
  if (!isTestRun) process.exit(0);

  const output = (data.tool_response && (data.tool_response.output || data.tool_response.stdout)) || '';
  const exitCode = data.tool_response && data.tool_response.exit_code;

  // Parse vitest summary line: "Tests  1977 passed | 1 skipped (1978)"
  const passedMatch = output.match(/Tests\s+([\d]+)\s+passed/);
  const failedMatch = output.match(/Tests\s+.*?([\d]+)\s+failed/);
  const passed = passedMatch ? parseInt(passedMatch[1], 10) : null;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

  // Prefer parsed output over exit_code — exit_code is often undefined in the Bash tool response.
  // Only record 'passed' when we actually parsed a "Tests N passed" line from real vitest output.
  const result = (passed !== null && failed === 0) ? 'passed' : 'failed';

  const record = {
    ran_at: new Date().toISOString(),
    command: cmd.slice(0, 120),
    result,
    passed,
    failed,
    exit_code: exitCode,
  };

  try {
    fs.writeFileSync('.nova-last-test-run.json', JSON.stringify(record, null, 2) + '\n', 'utf8');
  } catch { /* filesystem write failed — non-fatal */ }

  process.exit(0);
}
try { main(); } catch { process.exit(0); }
