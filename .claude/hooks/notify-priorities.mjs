#!/usr/bin/env node
// PostToolUse hook: fires when the Write or Edit tool touches docs/PM.md.
// Prints a status message to remind the user to say "run".
// FAIL-SAFE: any internal error → exit 0 (never blocks anything).
import fs from 'node:fs';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { process.exit(0); }

  const toolName = data.tool_name || '';
  const filePath = (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || '';

  const isPMWrite =
    (toolName === 'Write' || toolName === 'Edit') &&
    /docs[/\\]PM\.md/.test(filePath);

  if (!isPMWrite) process.exit(0);

  process.stderr.write(
    '\nPM.md updated — write your Planning request, then say "run" to start morpheus.\n\n'
  );

  process.exit(0);
}
try { main(); } catch { process.exit(0); }
