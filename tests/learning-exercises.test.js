// Unit tests for learning exercise definitions (T07a / T07g).
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
// ch02 — Interface: Slider (5) × 4 = 20
//   Missing wire: n1.value → n3.a
// ---------------------------------------------------------------------------
describe('ch02 — Interface: Scale a slider value', () => {
  const ex = exercises[1];

  it('accept returns true when the missing wire (n1→n3.a) is connected', () => {
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
// ch03 — Node Anatomy: clamp(150, 0, 100) = 100
//   Missing wire: n1.value → n3.value
// ---------------------------------------------------------------------------
describe('ch03 — Node Anatomy: Clamp a value to a range', () => {
  const ex = exercises[2];

  it('accept returns true when the missing wire (n1→n3.value) is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'value'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch04 — Data Types: List.Range(10, 40, 10) → List.First → 10
//   Missing wire: n4.list → n5.list
// ---------------------------------------------------------------------------
describe('ch04 — Data Types: Get the first item of a list', () => {
  const ex = exercises[3];

  it('accept returns true when the missing wire (n4.list→n5.list) is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n4', fromPort: 'list', toNode: 'n5', toPort: 'list'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch05 — Math Operations: 17 mod 5 = 2
//   Missing wire: n2.value → n3.b
// ---------------------------------------------------------------------------
describe('ch05 — Math Operations: Remainder (17 mod 5)', () => {
  const ex = exercises[4];

  it('accept returns true when the missing wire (n2→n3.b) is connected', () => {
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
// ch06 — Geometry Operations: Point(3, 7, 0).Y = 7
//   Missing wire: n3.point → n4.point
// ---------------------------------------------------------------------------
describe('ch06 — Geometry Operations: Extract Point.Y', () => {
  const ex = exercises[5];

  it('accept returns true when the missing wire (n3.point→n4.point) is connected', () => {
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
// ch07 — List Operations: sum(range(1, 5, 1)) = sum([1,2,3,4]) = 10
//   Missing wire: n4.list → n5.list
// ---------------------------------------------------------------------------
describe('ch07 — List Operations: Sum a range of numbers', () => {
  const ex = exercises[6];

  it('accept returns true when the missing wire (n4.list→n5.list) is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n4', fromPort: 'list', toNode: 'n5', toPort: 'list'
    });
    expect(ex.accept(graph)).toBe(true);
  });

  it('accept returns false when the wire is missing', () => {
    expect(ex.accept(missingWireGraph(ex))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ch08 — Python Node: 16^0.5 = 4 (square root via Math.Power)
//   Missing wire: n1.value → n3.base
// ---------------------------------------------------------------------------
describe('ch08 — Python Node: Square root via Math.Power', () => {
  const ex = exercises[7];

  it('accept returns true when the missing wire (n1→n3.base) is connected', () => {
    const graph = solvedGraph(ex, {
      fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'base'
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
