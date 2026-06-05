// Turns a plan-mode refusal into a prefilled GitHub issue URL.
//
// When the AI emits `{ refused: { reason, suggestions } }` because no
// existing composite satisfies the user's request, we surface a one-click
// "Request this composite" button. Clicking it opens GitHub's new-issue
// page with the title and body pre-populated — the maintainer sees:
//
//   • The exact user prompt that couldn't be satisfied
//   • The AI's stated reason
//   • The AI's suggested alternatives (so the maintainer can decide
//     whether to add the missing composite or guide users to use
//     what already exists)
//   • A "proposed composite signature" template the maintainer can
//     edit in place — sketches the kind of node this might become
//
// Pre-fill (vs. server-side auto-submit) keeps the GitHub token out of
// the browser and gives the user a chance to edit before submitting.

import { getRuntimeConfig } from '../config/runtime-config.js';

// Falls back to the canonical Nova repo when no config override exists.
function defaultRepoUrl() {
  const cfg = (typeof getRuntimeConfig === 'function' ? getRuntimeConfig() : null) || {};
  return cfg.feedbackRepoUrl || 'https://github.com/emrullah-yildiz/nova';
}

const DEFAULT_LABELS = ['composite-request', 'ai-feedback'];

// Truncates a prompt for use in the issue title — too-long titles get
// rejected by GitHub's UI and look bad in issue lists anyway.
function shortenForTitle(text, max = 80) {
  const trimmed = String(text || '').trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

// Returns a deterministic key the integration layer can use to dedupe
// repeated requests from the same user before the issue is filed.
// Lowercased, whitespace-normalized first 200 chars of the prompt.
export function dedupeKey(userPrompt) {
  return String(userPrompt || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// Renders the structured Markdown body. Keep section headings stable —
// downstream tooling (issue templates, labels) may grep for them.
function renderBody({ userPrompt, refusalReason, suggestions, context }) {
  const sugList = (Array.isArray(suggestions) && suggestions.length)
    ? suggestions.map(s => `- ${s}`).join('\n')
    : '_(AI did not suggest alternatives — likely a brand-new pattern.)_';

  const ctxLines = [];
  if (context && context.novaVersion) ctxLines.push(`- **Nova version:** ${context.novaVersion}`);
  if (context && context.aiProvider) ctxLines.push(`- **AI provider:** ${context.aiProvider}`);
  if (context && context.aiModel) ctxLines.push(`- **AI model:** ${context.aiModel}`);
  if (context && context.timestamp) ctxLines.push(`- **Captured:** ${context.timestamp}`);
  const ctxBlock = ctxLines.length ? '## Context\n\n' + ctxLines.join('\n') + '\n\n' : '';

  return `## What the user asked for

> ${String(userPrompt || '').trim().replace(/\n/g, '\n> ') || '_(no prompt captured)_'}

## Why Nova's AI refused

${String(refusalReason || '_(no reason given)_').trim()}

## AI's suggested alternatives

${sugList}

## Proposed composite

The maintainer should consider whether to add a new composite node that satisfies this pattern. Suggested shape:

\`\`\`
type:        Surface.<NewName> or Solid.<NewName> or Geometry.<NewName>
inputs:      <numbers/points/curves the user wants to parameterise>
outputs:     <list of points / mesh / curves — whatever the next node expects>
codegen.py:  {{output}} = Geo.<newGeoHelper>(<params>)
\`\`\`

If a similar pattern already exists, link it here and close as duplicate. If it doesn't, the existence of this request means at least one user wanted it.

${ctxBlock}---
🤖 _This issue was prefilled from Nova's chat after a plan-mode refusal. The user reviewed and submitted it._
`;
}

// Builds the full prefilled URL and supporting metadata. The URL points
// at GitHub's `/issues/new` endpoint with title, body, and labels.
export function buildCompositeRequestIssue({ userPrompt, refusalReason, suggestions, context, repoUrl, labels } = {}) {
  const repo = (repoUrl || defaultRepoUrl()).replace(/\/+$/, '');
  const title = `[Composite Request] ${shortenForTitle(userPrompt, 80) || '(no prompt)'}`;
  const body = renderBody({ userPrompt, refusalReason, suggestions, context });
  const lbls = (Array.isArray(labels) && labels.length ? labels : DEFAULT_LABELS).join(',');
  const url = repo + '/issues/new?title=' + encodeURIComponent(title)
    + '&body=' + encodeURIComponent(body)
    + '&labels=' + encodeURIComponent(lbls);
  return { title, body, labels: lbls.split(','), url };
}
