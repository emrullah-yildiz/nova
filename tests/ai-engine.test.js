import { AIEngine } from '../src/ai/ai-engine.js';

describe('AIEngine', () => {
  it('returns null when there is no existing code to modify', () => {
    expect(AIEngine.generateCode('make a tower', '')).toBeNull();
  });

  it('swaps a requested operator in existing code', () => {
    const result = AIEngine.generateCode('change add to multiply', 'result = a + b');

    expect(result).toEqual({
      code: 'result = a * b',
      explanation: 'Replaced **add** with **multiply**',
      action: 'replace'
    });
  });

  it('does not generate description fallbacks locally', () => {
    expect(AIEngine.generateFromDescription('create a pavilion')).toBeNull();
  });
});
