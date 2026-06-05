#!/usr/bin/env node
// Stop / SubagentStop hook: deterministic validation before an agent finishes.
// Blocks on mechanical issues only — semantic correctness is the reviewer's job.
//
// Checks (in order):
//   (a) ESLint on changed JS under src/ or tests/
//   (b) SEC ticket frontmatter completeness
//   (c) Tests ran and passed after the last file edit
//   (d) Ticket AC completeness (all - [ ] items resolved in changed TICK-*.md)
//   (e) UI changes require an E2E spec
//
// FAIL-SAFE: any internal error → exit 0 (never traps). Respects stop_hook_active
// so it blocks at most once per stop attempt.
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { data = {}; }

  // Already fired once for this stop → let it through. Never loop.
  if (data.stop_hook_active) process.exit(0);

  let status = '';
  try {
    status = execSync('git status --porcelain', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { process.exit(0); }

  const changedFiles = status.split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((f) => (f.includes(' -> ') ? f.split(' -> ')[1].trim() : f))
    .map((f) => f.replace(/^"|"$/g, ''));

  // Also include files changed in the most recent commit (for post-merge checks).
  let committedFiles = [];
  try {
    const log = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || true', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    committedFiles = log.split('\n').map((f) => f.trim()).filter(Boolean);
  } catch { /* no prior commit / shallow clone */ }

  const allFiles = [...new Set([...changedFiles, ...committedFiles])];
  const errors = [];

  // ── (a) ESLint on changed JS under src/ or tests/ ───────────────────────────
  const jsFiles = changedFiles.filter(
    (f) => /\.js$/.test(f) && (/^src\//.test(f) || /^tests\//.test(f)) && fs.existsSync(f)
  );
  if (jsFiles.length) {
    const eslintPath = 'node_modules/eslint/bin/eslint.js';
    if (fs.existsSync(eslintPath)) {
      try {
        const res = spawnSync(process.execPath, [eslintPath, ...jsFiles], {
          encoding: 'utf8', timeout: 90000,
        });
        if (res.status && res.status !== 0) {
          const out = ((res.stdout || '') + (res.stderr || '')).trim();
          errors.push('ESLint failed on files you changed:\n' + out.slice(0, 4000));
        }
      } catch { /* eslint unavailable → skip */ }
    }
  }

  // ── (b) SEC ticket frontmatter completeness ──────────────────────────────────
  const SEC_REQUIRED = [
    'id', 'title', 'severity', 'category', 'status',
    'needs', 'user_right_at_risk', 'affected', 'discovered',
  ];
  const secTickets = allFiles.filter(
    (f) => /docs\/security\/tickets\/SEC-[^/]+\.md$/.test(f) && fs.existsSync(f)
  );
  for (const t of secTickets) {
    let content = '';
    try { content = fs.readFileSync(t, 'utf8'); } catch { continue; }
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) { errors.push(`${t}: missing YAML frontmatter block`); continue; }
    const missing = SEC_REQUIRED.filter((k) => !new RegExp('^' + k + '\\s*:', 'm').test(m[1]));
    if (missing.length) errors.push(`${t}: missing frontmatter field(s): ${missing.join(', ')}`);
  }

  // ── (c) Tests must have run and passed after the last file edit ───────────────
  const hasJsChanges = allFiles.some(
    (f) => /\.js$/.test(f) && (/^src\//.test(f) || /^tests\//.test(f))
  );
  if (hasJsChanges) {
    const proofPath = '.nova-last-test-run.json';
    let proof = null;
    try { proof = JSON.parse(fs.readFileSync(proofPath, 'utf8')); } catch { /* no proof */ }

    if (!proof) {
      errors.push(
        'No test run recorded.\n' +
        'Run `npm run test` (or `npx vitest run`) before finishing.\n' +
        'The PostToolUse hook captures the result automatically.'
      );
    } else if (proof.result !== 'passed') {
      errors.push(
        `Last test run FAILED (${proof.failed ?? '?'} failures, recorded at ${proof.ran_at}).\n` +
        'Fix the failing tests before finishing.'
      );
    } else {
      // Check the proof is fresher than the most recently modified tracked JS file.
      const proofTime = new Date(proof.ran_at).getTime();
      let stalest = 0;
      for (const f of jsFiles) {
        try {
          const mt = fs.statSync(f).mtimeMs;
          if (mt > stalest) stalest = mt;
        } catch { /* file gone */ }
      }
      if (stalest > proofTime + 5000) {
        errors.push(
          'Files were modified AFTER the last recorded test run.\n' +
          'Run `npm run test` again to confirm everything still passes.'
        );
      }
    }
  }

  // ── (d) Ticket AC completeness ───────────────────────────────────────────────
  // If a TICK-*.md file was changed, every acceptance-criteria checkbox must be checked.
  const tickets = allFiles.filter(
    (f) => /docs\/tickets\/TICK-[^/]+\.md$/.test(f) && fs.existsSync(f)
  );
  for (const t of tickets) {
    let content = '';
    try { content = fs.readFileSync(t, 'utf8'); } catch { continue; }

    // Find the AC section and look for unchecked items.
    const acSection = content.match(/##\s+Acceptance Criteria([\s\S]*?)(?=\n##|\s*$)/i);
    if (!acSection) continue;
    const unchecked = [...acSection[1].matchAll(/- \[ \] (AC-\d+[^\n]*)/gi)].map((m) => m[1].trim());
    if (unchecked.length) {
      errors.push(
        `Ticket ${path.basename(t)} has ${unchecked.length} unverified acceptance criterion:\n` +
        unchecked.map((ac) => '  • ' + ac).join('\n') + '\n\n' +
        'For each criterion: verify it in the browser or in a test, then change `- [ ]` to `- [x]` in the ticket file.'
      );
    }
  }

  // ── (e) UI changes require an E2E spec ───────────────────────────────────────
  const uiFiles = allFiles.filter(
    (f) => /^src\/(?:ui|viewer)\//.test(f) && /\.js$/.test(f)
  );
  if (uiFiles.length) {
    const e2eFiles = allFiles.filter((f) => /^tests\/e2e\/.*\.spec\.js$/.test(f));
    if (!e2eFiles.length) {
      // Check if an e2e spec already covers these files by name heuristic.
      // (A spec that already existed before is fine — only new-feature UI work needs a NEW spec.)
      // We block only when ALL of: (1) UI files changed, (2) no e2e spec touched, (3) the
      // changed UI files are not purely CSS/style changes.
      const nonStyleUI = uiFiles.filter((f) => !/style\.css$/.test(f));
      if (nonStyleUI.length) {
        errors.push(
          'UI/viewer files changed but no Playwright E2E spec was added or modified:\n' +
          nonStyleUI.map((f) => '  ' + f).join('\n') + '\n\n' +
          'Add or update a spec under tests/e2e/ that covers the acceptance criteria for this feature.\n' +
          'If the change is purely internal (no observable user behaviour change), add a comment\n' +
          'to the commit message starting with "no-e2e:" explaining why.'
        );
      }
    }
  }

  if (errors.length) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason:
        'Validation hook found issues to resolve before finishing:\n\n' +
        errors.join('\n\n─────\n\n') +
        '\n\nFix them and stop again. This check will NOT block a second time.',
    }));
  }
  process.exit(0);
}
try { main(); } catch { process.exit(0); }
