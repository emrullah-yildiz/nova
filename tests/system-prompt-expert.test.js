import { describe, it, expect } from 'vitest';
import { GPTClient } from '../src/ai/gpt-client.js';
import { PythonRunner } from '../src/runtime/pyrunner.js';
import { Geo } from '../src/geometry/index.js';

describe('expert system prompt (Phase 1)', () => {
  const prompt = GPTClient.buildSystemPrompt('');

  it('frames the AI as a computational-design expert, not a generic tool bot', () => {
    expect(prompt).toContain('computational-design expert');
    expect(prompt).not.toMatch(/^You are the AI for Nova, a visual node-based scripting tool/);
  });

  it('injects the intent-grouped capability ledger with honesty flags', () => {
    expect(prompt).toContain('NOVA DESIGN CAPABILITIES (grouped by intent)');
    expect(prompt).toContain('Mathematical surfaces');
    expect(prompt).toContain('[stub]');
    expect(prompt).toContain('createCatenaryShell');
  });

  it('teaches form vocabulary, parametric method, facade playbook, and a self-check', () => {
    expect(prompt).toContain('FORM VOCABULARY');
    expect(prompt).toContain('PARAMETRIC METHOD');
    expect(prompt).toContain('FACADE / PANELIZATION PLAYBOOK');
    expect(prompt).toContain('BEFORE YOU EMIT CODE');
  });

  it('injects the golden gallery palette (Phase 2) with no leftover tokens', () => {
    expect(prompt).toContain('EXPERT GALLERY');
    expect(prompt).toContain('Twisted tapered tower');
    expect(prompt).not.toContain('__NOVA_');
  });
});

describe('the new worked examples actually run', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
    globalThis.Geo = Geo;
  });

  it('Example 4 — catenary shell + thicken produces geometry', () => {
    const res = PythonRunner.execute([
      'span = 24', 'height = 10', 'segments = 60',
      'shell = Geo.createCatenaryShell(span, height, segments)',
      'roof = Geo.thicken(shell, 0.4)',
      'print(roof)'
    ].join('\n'), {});
    expect(res.error).toBeNull();
  });

  it('Example 5 — phyllotactic attractor-driven facade produces geometry', () => {
    const res = PythonRunner.execute([
      'count = 60',
      'field = Geo.phyllotaxis(count, 14, 0.6)',
      'hot = Geo.Point3(6, 6, 0)',
      'studs = []',
      'for i in range(count):',
      '    p = field[i]',
      '    influence = Geo.pointAttractor(p, hot, 20, 2)',
      '    r = 0.15 + 0.5 * influence',
      '    studs.append(Geo.createSphere(p, r))',
      'facade = Geo.combineAll(studs)',
      'print(facade)'
    ].join('\n'), {});
    expect(res.error).toBeNull();
  });
});
