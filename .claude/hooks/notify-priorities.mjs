#!/usr/bin/env node
// PostToolUse hook: fires when the Write or Edit tool touches docs/pm/PRIORITIES.md.
// Writes a marker file so morpheus knows priorities changed, and prints a status
// message to remind the user to say "run".
// FAIL-SAFE: any internal error → exit 0 (never blocks anything).
import fs from 'node:fs';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { process.exit(0); }

  const toolName = data.tool_name || '';
  const filePath = (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || '';

  const isPrioritiesWrite =
    (toolName === 'Write' || toolName === 'Edit') &&
    /docs[/\\]pm[/\\]PRIORITIES\.md/.test(filePath);

  if (!isPrioritiesWrite) process.exit(0);

  // Write marker so morpheus can detect a fresh update.
  try {
    fs.writeFileSync(
      '.nova-priorities-changed',
      JSON.stringify({ updated_at: new Date().toISOString(), file: filePath }, null, 2) + '\n',
      'utf8'
    );
  } catch { /* non-fatal */ }

  // Print a visible reminder to the user.
  process.stderr.write(
    '\n📋 PRIORITIES.md updated — say "run" to start morpheus and create tickets.\n\n'
  );

  process.exit(0);
}
try { main(); } catch { process.exit(0); }
