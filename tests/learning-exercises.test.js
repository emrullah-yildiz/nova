// Unit tests for learning exercise definitions (T07a).
//
// For each of the 10 exercises:
//   1. accept() returns true for a correctly completed graph.
//   2. accept() returns false when the required wire is absent.
//
// Tests use only the Nova compute engine (via learning-exercises.js accept
// functions) — no DOM, no window references.

import { describe, it, expect } from 'vitest';
import { exercises } from '../src/ui/learning-exercises.js';

// ---------------------------------------------------------------------------
// Helper — build a complete graphState for an exercise by merging the
// preDrawnWires with one extra "solution" wire.
// ---------------------------------------------------------------------------
function solvedGraph(ex, solutionWire) {
  return {
    nodes: ex.nodes,
    wires: [...ex.preDrawnWires, solutionWire]
  };
}

// ---------------------------------------------------------------------------
// Helper — build a graph WITHOUT the solution wire (incomplete).
// ---------------------------------------------------------------------------
function missingWireGraph(ex) {
  return {
    nodes: ex.nodes,
    wires: [...ex.preDrawnWires]
  };
}

// ---------------------------------------------------------------------------
// ch01 — Introduction: Add 3 + 4 = 7
//   Missing wire: n2.value → n3.b
// ---------------------------------------------------------------------------
describe('ch01 — Introduction: Add two numbers', () => {
  const ex = exercises[0];

  it('accept returns true when the missing wire (n2→n3.b) is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'b'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the missing wire is absent', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch02 — Interface: Multiply 6 × 7 = 42
//   Missing wire: n2.value → n3.b
// ---------------------------------------------------------------------------
describe('ch02 — Interface: Multiply and watch', () => {
  const ex = exercises[1];

  it('accept returns true when n2→n3.b wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'b'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch03 — Node Anatomy: Subtract 10 − 3 = 7
//   Missing wire: n2.value → n3.b
// ---------------------------------------------------------------------------
describe('ch03 — Node Anatomy: Subtract via ports', () => {
  const ex = exercises[2];

  it('accept returns true when n2→n3.b wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'b'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch04 — Data Types: Divide 20 ÷ 4 = 5
//   Missing wire: n2.value → n3.b
// ---------------------------------------------------------------------------
describe('ch04 — Data Types: Divide two numbers', () => {
  const ex = exercises[3];

  it('accept returns true when n2→n3.b wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'b'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch05 — Math Operations: Power 2^8 = 256
//   Missing wire: n2.value → n3.exp
// ---------------------------------------------------------------------------
describe('ch05 — Math Operations: Power (2^8)', () => {
  const ex = exercises[4];

  it('accept returns true when n2→n3.exp wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'exp'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch06 — Geometry Operations: Point.X of (5, 3, 0) = 5
//   Missing wire: n3.point → n4.point
// ---------------------------------------------------------------------------
describe('ch06 — Geometry Operations: Extract Point.X', () => {
  const ex = exercises[5];

  it('accept returns true when n3.point→n4.point wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n3', fromPort: 'point', toNode: 'n4', toPort: 'point'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch07 — List Operations: Count of range(1, 6) = 5
//   Missing wire: n3.list → n4.list
// ---------------------------------------------------------------------------
describe('ch07 — List Operations: Count a range', () => {
  const ex = exercises[6];

  it('accept returns true when n3.list→n4.list wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n3', fromPort: 'list', toNode: 'n4', toPort: 'list'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch08 — Python Node: Round 3.7 to 4
//   Missing wire: n1.value → n3.a
// ---------------------------------------------------------------------------
describe('ch08 — Python Node: Round a number', () => {
  const ex = exercises[7];

  it('accept returns true when n1→n3.a wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'a'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch09 — Code Terminal: Sum sequence [0,1,2,3,4] = 10
//   Missing wire: n3.list → n4.list
// ---------------------------------------------------------------------------
describe('ch09 — Code Terminal: Sum a sequence', () => {
  const ex = exercises[8];

  it('accept returns true when n3.list→n4.list wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n3', fromPort: 'list', toNode: 'n4', toPort: 'list'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch10 — Code Block: (3 + 2) * 4 = 20
//   Missing wire: n3.result → n5.a
// ---------------------------------------------------------------------------
describe('ch10 — Code Block: Chain two operations', () => {
  const ex = exercises[9];

  it('accept returns true when n3.result→n5.a wire is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n3', fromPort: 'result', toNode: 'n5', toPort: 'a'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});
