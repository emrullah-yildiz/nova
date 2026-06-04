#!/usr/bin/env node
// Stop / SubagentStop hook: deterministic validation of an agent's work before it
// finishes — lint changed JS under src/ or tests/, and verify SEC ticket frontmatter.
// Semantic correctness is the reviewer agent's job; this only catches mechanical gaps.
// FAIL-SAFE: any internal error => exit 0 (do not block). Respects stop_hook_active
// so it can never trap an agent in a loop (it blocks at most once).
import fs from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { data = {}; }

  // Already fired once for this stop -> let it stop, never loop.
  if (data.stop_hook_active) process.exit(0);

  let status = '';
  try {
    status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { process.exit(0); } // not a git repo / git unavailable -> pass

  const files = status.split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((f) => (f.includes(' -> ') ? f.split(' -> ')[1].trim() : f))
    .map((f) => f.replace(/^"|"$/g, ''));

  const errors = [];

  // (a) ESLint on changed JS under src/ or tests/ (batched, once).
  const jsFiles = files.filter((f) => /\.js$/.test(f) && (/^src\//.test(f) || /^tests\//.test(f)) && fs.existsSync(f));
  if (jsFiles.length) {
    const eslintPath = 'node_modules/eslint/bin/eslint.js';
    if (fs.existsSync(eslintPath)) {
      try {
        const res = spawnSync(process.execPath, [eslintPath, ...jsFiles], { encoding: 'utf8', timeout: 90000 });
        if (res.status && res.status !== 0) {
          const out = ((res.stdout || '') + (res.stderr || '')).trim();
          errors.push('ESLint failed on files you changed:\n' + out.slice(0, 4000));
        }
      } catch { /* eslint unavailable -> skip, fail-safe */ }
    }
  }

  // (b) SEC ticket frontmatter completeness.
  const required = ['id', 'title', 'severity', 'category', 'status', 'needs', 'user_right_at_risk', 'affected', 'discovered'];
  const tickets = files.filter((f) => /docs\/security\/tickets\/SEC-[^/]+\.md$/.test(f) && fs.existsSync(f));
  for (const t of tickets) {
    let content = '';
    try { content = fs.readFileSync(t, 'utf8'); } catch { continue; }
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) { errors.push(`${t}: missing YAML frontmatter block`); continue; }
    const fm = m[1];
    const missing = required.filter((k) => !new RegExp('^' + k + '\\s*:', 'm').test(fm));
    if (missing.length) errors.push(`${t}: missing frontmatter field(s): ${missing.join(', ')}`);
  }

  if (errors.length) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: 'Validation hook found mechanical issues to resolve before finishing:\n\n'
        + errors.join('\n\n')
        + '\n\nFix them and finish again. If they are genuinely pre-existing / out of scope, say so and stop again — this check will NOT block a second time.',
    }));
  }
  process.exit(0);
}
try { main(); } catch { process.exit(0); }
