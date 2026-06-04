#!/usr/bin/env node
// PreToolUse hook (Bash git commit): block a commit whose STAGED changes contain a
// likely hardcoded secret. Deterministic check only — not a substitute for review.
// FAIL-SAFE: any internal error => exit 0 (allow). Never break the session.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { data = {}; }

  const cmd = (data.tool_input && data.tool_input.command) || '';
  if (!/\bgit\b[^\n]*\bcommit\b/.test(cmd)) process.exit(0); // only guard git commit

  let diff = '';
  try {
    diff = execSync('git diff --cached', {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { process.exit(0); } // can't read staged diff -> allow (fail-safe)
  if (!diff) process.exit(0);

  const patterns = [
    { name: 'OpenAI/Anthropic/OpenRouter key (sk-)', re: /\bsk-(?:ant-|or-)?[A-Za-z0-9]{16,}/ },
    { name: 'Groq key (gsk_)', re: /\bgsk_[A-Za-z0-9]{16,}/ },
    { name: 'Resend key (re_)', re: /\bre_[A-Za-z0-9]{16,}/ },
    { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
    { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{20,}/ },
    { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{8,}/ },
    { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
    { name: 'DB URL with inline credentials', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:'"/]+:[^\s:'"@/]+@/ },
  ];
  // Skip fixtures/examples/lockfiles — they legitimately carry fake/placeholder keys.
  const skipFile = (f) => /(^|\/)tests?\//.test(f) || /\.example(\.|$)/.test(f)
    || /package-lock\.json$/.test(f) || /\.test\./.test(f) || /(^|\/)docs\//.test(f);

  const lines = diff.split('\n');
  let curFile = '';
  const hits = [];
  for (const line of lines) {
    if (line.startsWith('+++ ')) { curFile = line.replace(/^\+\+\+ (?:b\/)?/, '').trim(); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue; // only ADDED lines
    if (skipFile(curFile)) continue;
    for (const p of patterns) if (p.re.test(line)) hits.push(`${p.name} (in ${curFile || 'staged change'})`);
  }

  if (hits.length) {
    const reason = 'Blocked by pre-commit-secrets hook — possible hardcoded secret in staged changes: '
      + [...new Set(hits)].join('; ')
      + '. Remove the secret and use an env var / Cloudflare Worker secret instead, then re-stage and commit.';
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }));
  }
  process.exit(0);
}
try { main(); } catch { process.exit(0); }
