import { describe, it, expect, beforeAll } from 'vitest';
import { GOLDEN_EXAMPLES, buildGoldenGallery } from '../src/ai/golden-examples.js';
import { PythonRunner } from '../src/runtime/pyrunner.js';
import { Geo } from '../src/geometry/index.js';

// Every golden example must actually run and yield geometry. This pins quality:
// if a Geo.* method regresses or a signature changes, the offending example
// fails here instead of silently teaching the AI broken code via the prompt.
describe('golden examples all execute and produce geometry', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
    globalThis.Geo = Geo;
  });

  it.each(GOLDEN_EXAMPLES.map((ex) => [ex.id, ex]))('%s runs cleanly', (_id, ex) => {
    const res = PythonRunner.execute(ex.code, {});
    expect(res.error).toBeNull();
    // The final `print(x)` value is the produced geometry — must be non-empty.
    const out = res.outputs && (res.outputs.result !== undefined ? res.outputs.result : Object.values(res.outputs).pop());
    expect(out == null).toBe(false);
    if (Array.isArray(out)) expect(out.length).toBeGreaterThan(0);
  });
});

describe('golden gallery for the prompt', () => {
  it('lists every example as a one-line palette entry with its methods', () => {
    const gallery = buildGoldenGallery();
    expect(gallery).toContain('EXPERT GALLERY');
    for (const ex of GOLDEN_EXAMPLES) {
      expect(gallery).toContain(ex.title);
    }
    expect(gallery).toContain('createCatenaryShell');
  });
});
