import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateChecks,
  deepEqualWithTolerance
} from '../src/core/learning/validate-lesson.js';
import { validateLessonShape } from '../src/core/learning/lesson-schema.js';
import {
  registerLesson,
  registerBuiltInLessons,
  listLessons,
  verifyLessonSolution,
  _clearLessons
} from '../src/core/learning/index.js';
import { fixtureLesson } from './fixtures/learning-fixture-lesson.js';

// A correct, solved graph for the fixture (Input.Number → Math.Add → Output.Watch).
function solvedGraph() {
  return {
    nodes: [
      { id: 'a', type: 'Input.Number', controlValues: { val: 3 } },
      { id: 'b', type: 'Input.Number', controlValues: { val: 4 } },
      { id: 'sum', type: 'Math.Add' },
      { id: 'w', type: 'Output.Watch' }
    ],
    wires: [
      { fromNode: 'a', fromPort: 'value', toNode: 'sum', toPort: 'a' },
      { fromNode: 'b', fromPort: 'value', toNode: 'sum', toPort: 'b' },
      { fromNode: 'sum', fromPort: 'result', toNode: 'w', toPort: 'value' }
    ]
  };
}

describe('deepEqualWithTolerance', () => {
  it('compares numbers within tolerance', () => {
    expect(deepEqualWithTolerance(1.0000000001, 1, 1e-9)).toBe(true);
    expect(deepEqualWithTolerance(1.01, 1, 1e-9)).toBe(false);
  });

  it('treats two NaNs as equal and NaN vs number as unequal', () => {
    expect(deepEqualWithTolerance(NaN, NaN)).toBe(true);
    expect(deepEqualWithTolerance(NaN, 1)).toBe(false);
  });

  it('deep-compares nested lists element-wise with tolerance', () => {
    expect(deepEqualWithTolerance([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
    expect(deepEqualWithTolerance([[1, 2.0000000001]], [[1, 2]], 1e-9)).toBe(true);
    expect(deepEqualWithTolerance([[1, 2]], [[1, 2, 3]])).toBe(false);
    expect(deepEqualWithTolerance([1, 2], 2)).toBe(false);
  });

  it('compares plain objects (e.g. points) by own keys', () => {
    expect(deepEqualWithTolerance({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(deepEqualWithTolerance({ x: 1 }, { x: 1, y: 2 })).toBe(false);
  });
});

describe('validateChecks — output check (engine-backed)', () => {
  it('passes when the target node produces the expected value', () => {
    const res = validateChecks(solvedGraph(), fixtureLesson.steps[0].checks);
    expect(res.pass).toBe(true);
    expect(res.firstHint).toBeNull();
    expect(res.results.every((r) => r.pass)).toBe(true);
  });

  it('fails with the authored hint when the value is wrong', () => {
    const graph = solvedGraph();
    graph.nodes.find((n) => n.id === 'b').controlValues.val = 99; // 3 + 99 = 102
    const check = fixtureLesson.steps[0].checks[0];
    const res = validateChecks(graph, [check]);
    expect(res.pass).toBe(false);
    expect(res.firstHint).toBe(check.hint);
    expect(res.results[0].actual).toBe(102);
  });

  it('fails when the target node is missing', () => {
    const res = validateChecks({ nodes: [], wires: [] }, [
      { kind: 'output', node: 'w', expected: 7, hint: 'missing' }
    ]);
    expect(res.pass).toBe(false);
    expect(res.results[0].reason).toBe('target-node-missing');
    expect(res.firstHint).toBe('missing');
  });

  it('is solution-AGNOSTIC: two different correct graphs both pass', () => {
    // Graph 1: 3 + 4 = 7 (canonical).
    const g1 = solvedGraph();
    // Graph 2: a different topology — three numbers summed via chained adds to 7.
    const g2 = {
      nodes: [
        { id: 'a', type: 'Input.Number', controlValues: { val: 2 } },
        { id: 'b', type: 'Input.Number', controlValues: { val: 1 } },
        { id: 'c', type: 'Input.Number', controlValues: { val: 4 } },
        { id: 'sum1', type: 'Math.Add' },
        { id: 'sum2', type: 'Math.Add' },
        { id: 'w', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'a', fromPort: 'value', toNode: 'sum1', toPort: 'a' },
        { fromNode: 'b', fromPort: 'value', toNode: 'sum1', toPort: 'b' },
        { fromNode: 'sum1', fromPort: 'result', toNode: 'sum2', toPort: 'a' },
        { fromNode: 'c', fromPort: 'value', toNode: 'sum2', toPort: 'b' },
        { fromNode: 'sum2', fromPort: 'result', toNode: 'w', toPort: 'value' }
      ]
    };
    const check = { kind: 'output', node: 'w', expected: 7, hint: 'sum to 7' };
    expect(validateChecks(g1, [check]).pass).toBe(true);
    expect(validateChecks(g2, [check]).pass).toBe(true);
  });

  it('reads a list output through the engine and deep-compares it', () => {
    // List.Range(0, 9, 2) → [0,2,4,6,8]; verify list comparison end-to-end.
    const graph = {
      nodes: [
        { id: 'r', type: 'List.Range', controlValues: { start: '0', end: '9', step: '2' } },
        { id: 'w', type: 'Output.Watch' }
      ],
      wires: [{ fromNode: 'r', fromPort: 'list', toNode: 'w', toPort: 'value' }]
    };
    const ok = validateChecks(graph, [
      { kind: 'output', node: 'w', expected: [0, 2, 4, 6, 8], hint: 'range' }
    ]);
    expect(ok.pass).toBe(true);

    const bad = validateChecks(graph, [
      { kind: 'output', node: 'w', expected: [0, 2, 4], hint: 'range' }
    ]);
    expect(bad.pass).toBe(false);
  });

  it('reads a specific named output port via check.port', () => {
    // Read the 'list' port off List.Range directly (no watch).
    const graph = {
      nodes: [{ id: 'r', type: 'List.Range', controlValues: { start: '1', end: '4', step: '1' } }],
      wires: []
    };
    const res = validateChecks(graph, [
      { kind: 'output', node: 'r', port: 'list', expected: [1, 2, 3], hint: 'list port' }
    ]);
    expect(res.pass).toBe(true);
  });
});

describe('validateChecks — wiring check', () => {
  it('passes when the required wire exists', () => {
    const res = validateChecks(solvedGraph(), [
      { kind: 'wiring', from: 'sum', fromPort: 'result', to: 'w', toPort: 'value', hint: 'wire it' }
    ]);
    expect(res.pass).toBe(true);
  });

  it('fails with hint when the wire is absent', () => {
    const graph = solvedGraph();
    graph.wires = graph.wires.filter((w) => !(w.fromNode === 'sum' && w.toNode === 'w'));
    const res = validateChecks(graph, [
      { kind: 'wiring', from: 'sum', fromPort: 'result', to: 'w', toPort: 'value', hint: 'wire it' }
    ]);
    expect(res.pass).toBe(false);
    expect(res.firstHint).toBe('wire it');
  });

  it('matches on port when specified, ignores port when omitted', () => {
    const graph = solvedGraph();
    expect(
      validateChecks(graph, [{ kind: 'wiring', from: 'a', to: 'sum', hint: 'h' }]).pass
    ).toBe(true);
    expect(
      validateChecks(graph, [
        { kind: 'wiring', from: 'a', fromPort: 'value', to: 'sum', toPort: 'b', hint: 'h' }
      ]).pass
    ).toBe(false); // a wires into sum.a, not sum.b
  });
});

describe('validateChecks — presence check', () => {
  it('passes when a node of the given type exists', () => {
    const res = validateChecks(solvedGraph(), [
      { kind: 'presence', nodeType: 'Math.Add', hint: 'add a Math.Add' }
    ]);
    expect(res.pass).toBe(true);
  });

  it('fails with hint when the node type is absent', () => {
    const res = validateChecks(solvedGraph(), [
      { kind: 'presence', nodeType: 'List.Transpose', hint: 'add a List.Transpose' }
    ]);
    expect(res.pass).toBe(false);
    expect(res.firstHint).toBe('add a List.Transpose');
  });

  it('checks a specific node control value', () => {
    const ok = validateChecks(solvedGraph(), [
      { kind: 'presence', node: 'a', control: 'val', value: 3, hint: 'set val to 3' }
    ]);
    expect(ok.pass).toBe(true);
    const bad = validateChecks(solvedGraph(), [
      { kind: 'presence', node: 'a', control: 'val', value: 99, hint: 'set val to 99' }
    ]);
    expect(bad.pass).toBe(false);
    expect(bad.firstHint).toBe('set val to 99');
  });
});

describe('validateChecks — choice check', () => {
  it('passes when the selected option equals the answer', () => {
    const res = validateChecks({}, [
      { kind: 'choice', selected: 'output', answer: 'output', hint: 'pick output' }
    ]);
    expect(res.pass).toBe(true);
  });

  it('fails with hint when the wrong option is selected', () => {
    const res = validateChecks({}, [
      { kind: 'choice', selected: 'input', answer: 'output', hint: 'pick output' }
    ]);
    expect(res.pass).toBe(false);
    expect(res.firstHint).toBe('pick output');
  });
});

describe('validateChecks — firstHint ordering', () => {
  it('returns the first failing check hint when several fail', () => {
    const res = validateChecks(solvedGraph(), [
      { kind: 'wiring', from: 'sum', fromPort: 'result', to: 'w', toPort: 'value', hint: 'pass-1' },
      { kind: 'presence', nodeType: 'List.Transpose', hint: 'fail-first' },
      { kind: 'choice', selected: 'x', answer: 'y', hint: 'fail-second' }
    ]);
    expect(res.pass).toBe(false);
    expect(res.firstHint).toBe('fail-first');
  });
});

describe('validateLessonShape', () => {
  it('accepts the fixture lesson', () => {
    const { valid, errors } = validateLessonShape(fixtureLesson);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('rejects a lesson missing id/track/steps', () => {
    const { valid, errors } = validateLessonShape({ palette: ['Math.Add'] });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an output check missing expected', () => {
    const lesson = {
      ...fixtureLesson,
      steps: [{ prompt: 'p', checks: [{ kind: 'output', node: 'w', hint: 'h' }] }]
    };
    const { valid, errors } = validateLessonShape(lesson);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('expected'))).toBe(true);
  });

  it('rejects a starter node whose type is not in the palette', () => {
    const lesson = {
      ...fixtureLesson,
      palette: ['Math.Add'],
      starter: { nodes: [{ id: 'x', type: 'Input.Number' }], wires: [] }
    };
    const { valid, errors } = validateLessonShape(lesson);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('not in palette'))).toBe(true);
  });

  it('requires a solution when steps use graph checks', () => {
    const lesson = { ...fixtureLesson };
    delete lesson.solution;
    const { valid, errors } = validateLessonShape(lesson);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('solution is required'))).toBe(true);
  });
});

describe('lesson registry + solution guard', () => {
  beforeEach(() => _clearLessons());

  it('registers the fixture lesson and lists it', () => {
    registerLesson(fixtureLesson);
    expect(listLessons().map((l) => l.id)).toContain(fixtureLesson.id);
  });

  it('registers the three built-in beginner lessons in order', () => {
    registerBuiltInLessons();
    expect(listLessons().map((l) => l.id)).toEqual([
      'beginner-wiring-add',
      'beginner-lists-sum',
      'beginner-lacing-add'
    ]);
  });

  it('rejects a duplicate lesson id', () => {
    registerLesson(fixtureLesson);
    expect(() => registerLesson(fixtureLesson)).toThrow(/Duplicate lesson id/);
  });

  it('GUARD: every registered lesson solution passes its own checks', () => {
    registerBuiltInLessons();
    registerLesson(fixtureLesson);
    for (const lesson of listLessons()) {
      const res = verifyLessonSolution(lesson);
      expect(res.pass, `lesson "${lesson.id}" solution failed: ${res.firstHint}`).toBe(true);
    }
  });
});
