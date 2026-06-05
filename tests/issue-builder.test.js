// Phase 9: refusal → GitHub-issue feedback loop.
//
// When plan-mode refuses, the chat surfaces a "Request this composite"
// button whose URL is built by buildCompositeRequestIssue. These tests
// pin down:
//  - the URL is GitHub-compatible (correct host, encoded params)
//  - the title is human-readable and within GitHub's bounds
//  - the body has every section the maintainer expects to grep for
//  - special characters in the prompt don't corrupt the URL
//  - dedup is stable across whitespace/case variations
//
// The whole point is that the user's frustration becomes structured
// signal — if these tests regress, the backlog stops capturing it.

import { buildCompositeRequestIssue, dedupeKey } from '../src/ai/issue-builder.js';

describe('issue builder — buildCompositeRequestIssue', () => {
  const fixture = {
    userPrompt: 'Build a voronoi-driven roof tile pattern with attractor influence',
    refusalReason: "Nova lacks a single node for attractor-influenced voronoi tiles.",
    suggestions: [
      'Use Surface.WavyGrid for organic tile patterns',
      'Try Geometry.LinearArray for simpler tile arrangements'
    ],
    context: {
      novaVersion: '0.1.0-dev',
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
      timestamp: '2026-05-30T01:30:00.000Z'
    }
  };

  it('returns a GitHub /issues/new URL pointing at the default Nova repo', () => {
    const r = buildCompositeRequestIssue(fixture);
    expect(r.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/new\?/);
    expect(r.url).toContain('title=');
    expect(r.url).toContain('body=');
    expect(r.url).toContain('labels=');
  });

  it('honors an explicit repoUrl override so forks can self-route requests', () => {
    const r = buildCompositeRequestIssue({ ...fixture, repoUrl: 'https://github.com/acme/forky' });
    expect(r.url.startsWith('https://github.com/acme/forky/issues/new?')).toBe(true);
  });

  it('builds a title that is human-readable and within GitHub limits', () => {
    const r = buildCompositeRequestIssue(fixture);
    expect(r.title.startsWith('[Composite Request]')).toBe(true);
    // GitHub trims very long titles; we keep ours under ~100 chars total.
    expect(r.title.length).toBeLessThan(110);
  });

  it('truncates extremely long prompts in the title with an ellipsis', () => {
    const longPrompt = 'a'.repeat(500);
    const r = buildCompositeRequestIssue({ ...fixture, userPrompt: longPrompt });
    expect(r.title.length).toBeLessThan(110);
    expect(r.title.endsWith('…')).toBe(true);
  });

  it('default labels are composite-request and ai-feedback', () => {
    const r = buildCompositeRequestIssue(fixture);
    expect(r.labels).toEqual(['composite-request', 'ai-feedback']);
  });

  it('supports custom labels for forks with different triage workflows', () => {
    const r = buildCompositeRequestIssue({ ...fixture, labels: ['custom-tag'] });
    expect(r.labels).toEqual(['custom-tag']);
  });

  it('body contains every section the maintainer expects', () => {
    const r = buildCompositeRequestIssue(fixture);
    expect(r.body).toContain('## What the user asked for');
    expect(r.body).toContain('## Why Nova\'s AI refused');
    expect(r.body).toContain('## AI\'s suggested alternatives');
    expect(r.body).toContain('## Proposed composite');
    expect(r.body).toContain(fixture.userPrompt);
    expect(r.body).toContain(fixture.refusalReason);
    for (const s of fixture.suggestions) expect(r.body).toContain(s);
  });

  it('renders the proposed-composite template the maintainer can edit', () => {
    const r = buildCompositeRequestIssue(fixture);
    // The exact template strings are what give the issue a consistent
    // shape across the backlog — regressing them makes mass triage hard.
    expect(r.body).toContain('type:');
    expect(r.body).toContain('inputs:');
    expect(r.body).toContain('outputs:');
    expect(r.body).toContain('codegen.py:');
  });

  it('falls back gracefully when suggestions are missing', () => {
    const r = buildCompositeRequestIssue({ ...fixture, suggestions: undefined });
    expect(r.body).toContain('AI did not suggest alternatives');
  });

  it('includes context lines when context fields are supplied', () => {
    const r = buildCompositeRequestIssue(fixture);
    expect(r.body).toContain('Nova version');
    expect(r.body).toContain('0.1.0-dev');
    expect(r.body).toContain('openai');
    expect(r.body).toContain('gpt-4o');
    expect(r.body).toContain('2026-05-30T01:30:00.000Z');
  });

  it('omits the context block entirely when no context fields are supplied', () => {
    const r = buildCompositeRequestIssue({ ...fixture, context: undefined });
    expect(r.body).not.toContain('## Context');
  });

  it('properly URL-encodes special characters from the user prompt', () => {
    // Real prompts include #, &, ?, =, and quotes — without encoding,
    // these would corrupt the URL's query string and GitHub would land
    // the user on a blank issue page.
    const r = buildCompositeRequestIssue({
      ...fixture,
      userPrompt: 'Build a #voronoi & "diagrid" facade w/ amplitude=3 ? please'
    });
    expect(() => new URL(r.url)).not.toThrow();
    const decoded = decodeURIComponent(r.url);
    expect(decoded).toContain('Build a #voronoi & "diagrid"');
  });

  it('handles a missing userPrompt without crashing', () => {
    const r = buildCompositeRequestIssue({ userPrompt: '', refusalReason: 'no prompt' });
    expect(r.title).toContain('(no prompt)');
    expect(r.body).toContain('no prompt captured');
  });
});

describe('issue builder — dedupeKey', () => {
  it('normalizes whitespace and case so the same request matches', () => {
    expect(dedupeKey('Build a Voronoi tile roof'))
      .toBe(dedupeKey('  build   a voronoi   TILE roof  '));
  });

  it('returns empty string for empty / null / undefined input', () => {
    expect(dedupeKey('')).toBe('');
    expect(dedupeKey(null)).toBe('');
    expect(dedupeKey(undefined)).toBe('');
  });

  it('truncates very long prompts to keep keys storage-friendly', () => {
    const k = dedupeKey('a'.repeat(500));
    expect(k.length).toBeLessThanOrEqual(200);
  });

  it('different prompts yield different keys', () => {
    expect(dedupeKey('tower')).not.toBe(dedupeKey('pavilion'));
  });
});
