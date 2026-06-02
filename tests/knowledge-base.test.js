import { describe, it, expect } from 'vitest';
import {
  firstSentence,
  buildNodeKnowledge,
  NOVA_PRIMER,
  _clearNodeKnowledgeCacheForTests
} from '../src/ai/knowledge-base.js';
import { GPTClient } from '../src/ai/gpt-client.js';

describe('firstSentence', () => {
  it('returns the first sentence', () => {
    expect(firstSentence('Adds two numbers. Supports lacing.')).toBe('Adds two numbers.');
  });
  it('collapses whitespace and clips overly long text', () => {
    expect(firstSentence('a   b\n c')).toBe('a b c');
    expect(firstSentence('x'.repeat(300), 10)).toBe('xxxxxxxxxx…');
  });
  it('is empty for empty input', () => {
    expect(firstSentence('')).toBe('');
    expect(firstSentence(null)).toBe('');
  });
});

describe('buildNodeKnowledge', () => {
  it('lists real nodes grouped by category with one-line descriptions', () => {
    _clearNodeKnowledgeCacheForTests();
    const guide = buildNodeKnowledge();
    expect(guide).toContain('NOVA NODE GUIDE');
    expect(guide).toContain('## math');
    expect(guide).toContain('Math.Round');
    // descriptions are attached with an em dash
    expect(guide).toMatch(/- Math\.Round —/);
  });

  it('does not invent nodes — only registry node names appear', () => {
    _clearNodeKnowledgeCacheForTests();
    const guide = buildNodeKnowledge();
    expect(guide).not.toContain('Math.Teleport');
  });

  it('caches the result across calls', () => {
    _clearNodeKnowledgeCacheForTests();
    expect(buildNodeKnowledge()).toBe(buildNodeKnowledge());
  });
});

describe('isLearnIntent', () => {
  it('flags learn/how-to/which-node questions', () => {
    ['How does Nova work?', 'which node adds two numbers', 'what node rounds a value',
      'explain wires', 'can nova do voronoi?', 'teach me lacing'].forEach((m) => {
      expect(GPTClient.isLearnIntent(m)).toBe(true);
    });
  });
  it('does not flag build/edit commands', () => {
    ['create a twisted tower', 'add a box and a sphere', 'make the panels bigger'].forEach((m) => {
      expect(GPTClient.isLearnIntent(m)).toBe(false);
    });
    expect(GPTClient.isLearnIntent('')).toBe(false);
    expect(GPTClient.isLearnIntent(null)).toBe(false);
  });
});

describe('knowledge base is attached only on learn-intent turns (keeps build prompts lean)', () => {
  it('omits the primer/guide for a build command, includes them for a question', () => {
    const build = GPTClient.buildSystemPrompt('', { userMessage: 'create a twisted tower' });
    const learn = GPTClient.buildSystemPrompt('', { userMessage: 'how does Nova work?' });
    expect(build).not.toContain('HOW NOVA WORKS (teach the user from this)');
    expect(build).not.toContain('NOVA NODE GUIDE');
    expect(learn).toContain('HOW NOVA WORKS (teach the user from this)');
    expect(learn).toContain('NOVA NODE GUIDE');
    expect(learn.length).toBeGreaterThan(build.length);
  });
});

describe('NOVA_PRIMER', () => {
  it('covers the core concepts it claims to teach', () => {
    for (const term of ['HOW NOVA WORKS', 'Graph', 'ports', 'Run', 'Custom.Python', 'Node versions', 'Hosts']) {
      expect(NOVA_PRIMER).toContain(term);
    }
  });
  it('instructs the model to stay grounded', () => {
    expect(NOVA_PRIMER.toLowerCase()).toContain('not certain');
  });
});
