// Learning exercises — one per chapter (ch01..ch10).
//
// Each exercise pre-places 4-5 nodes on a mini-canvas. The user must draw at
// least one wire to complete the exercise. The accept() function evaluates the
// submitted graph through the REAL Nova compute engine (no duplicate logic).
//
// Compute engine used:
//   createLessonComputeContext + computeNodeValue
//   from src/core/learning/validate-lesson.js
//
// Interface contract consumed by T07b (mini-canvas component):
//   export const exercises = [ { id, title, nodes, preDrawnWires,
//                                expectedOutput, accept } ]

import {
  createLessonComputeContext,
  readNodeOutput,
  deepEqualWithTolerance
} from '../core/learning/validate-lesson.js';

// ---------------------------------------------------------------------------
// Internal helper — evaluate a graph and compare the target node's output.
// ---------------------------------------------------------------------------
function checkOutput(graphState, nodeId, portName, expected) {
  const nodes = (graphState && graphState.nodes) || [];
  const wires = (graphState && graphState.wires) || [];
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return false;
  try {
    const ctx = createLessonComputeContext({ nodes, wires });
    const actual = readNodeOutput(ctx, target, portName);
    return deepEqualWithTolerance(actual, expected);
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ch01 — Introduction: connect a number to an adder to watch the sum.
//   Pre-placed: two Input.Number nodes (3 and 4), Math.Add, Output.Watch.
//   Missing wire: n2 (Input.Number b=4) → n3 (Math.Add port b).
//   Expected output at n3 result: 7.
// ---------------------------------------------------------------------------
const ch01 = {
  id: 'ch01',
  title: 'Introduction: Add two numbers',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 80,  y: 60,  controlValues: { val: 3 } },
    { id: 'n2', type: 'Input.Number', x: 80,  y: 160, controlValues: { val: 4 } },
    { id: 'n3', type: 'Math.Add',     x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch', x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'a' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 7 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 7);
  }
};

// ---------------------------------------------------------------------------
// ch02 — Interface: wire a multiplier and observe its output.
//   Pre-placed: two Input.Number nodes (6 and 7), Math.Multiply, Output.Watch.
//   Missing wire: n2 (b=7) → n3 (Math.Multiply port b).
//   Expected output: 42.
// ---------------------------------------------------------------------------
const ch02 = {
  id: 'ch02',
  title: 'Interface: Multiply and watch',
  nodes: [
    { id: 'n1', type: 'Input.Number',  x: 80,  y: 60,  controlValues: { val: 6 } },
    { id: 'n2', type: 'Input.Number',  x: 80,  y: 160, controlValues: { val: 7 } },
    { id: 'n3', type: 'Math.Multiply', x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch',  x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'a' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 42 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 42);
  }
};

// ---------------------------------------------------------------------------
// ch03 — Node Anatomy: subtract B from A using node controls and ports.
//   Pre-placed: Input.Number(10), Input.Number(3), Math.Subtract, Output.Watch.
//   Missing wire: n2 (b=3) → n3 (Math.Subtract port b).
//   Expected output: 7.
// ---------------------------------------------------------------------------
const ch03 = {
  id: 'ch03',
  title: 'Node Anatomy: Subtract via ports',
  nodes: [
    { id: 'n1', type: 'Input.Number',  x: 80,  y: 60,  controlValues: { val: 10 } },
    { id: 'n2', type: 'Input.Number',  x: 80,  y: 160, controlValues: { val: 3 } },
    { id: 'n3', type: 'Math.Subtract', x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch',  x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'a' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 7 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 7);
  }
};

// ---------------------------------------------------------------------------
// ch04 — Data Types: divide two numbers to produce a decimal result.
//   Pre-placed: Input.Number(20), Input.Number(4), Math.Divide, Output.Watch.
//   Missing wire: n2 (b=4) → n3 (Math.Divide port b).
//   Expected output: 5.
// ---------------------------------------------------------------------------
const ch04 = {
  id: 'ch04',
  title: 'Data Types: Divide two numbers',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 80,  y: 60,  controlValues: { val: 20 } },
    { id: 'n2', type: 'Input.Number', x: 80,  y: 160, controlValues: { val: 4 } },
    { id: 'n3', type: 'Math.Divide',  x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch', x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'a' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 5 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 5);
  }
};

// ---------------------------------------------------------------------------
// ch05 — Math Operations: raise a base to an exponent.
//   Pre-placed: Input.Number(2 base), Input.Number(8 exponent), Math.Power,
//               Output.Watch.
//   Missing wire: n2 (exp=8) → n3 (Math.Power port exp).
//   Expected output: 256.
// ---------------------------------------------------------------------------
const ch05 = {
  id: 'ch05',
  title: 'Math Operations: Power (2^8)',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 80,  y: 60,  controlValues: { val: 2 } },
    { id: 'n2', type: 'Input.Number', x: 80,  y: 160, controlValues: { val: 8 } },
    { id: 'n3', type: 'Math.Power',   x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch', x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'base' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 256 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 256);
  }
};

// ---------------------------------------------------------------------------
// ch06 — Geometry Operations: build a point and extract its X coordinate.
//   Pre-placed: Input.Number(x=5), Input.Number(y=3), Point.ByCoordinates,
//               Point.X, Output.Watch.
//   Missing wire: n3 (Point.ByCoordinates) → n4 (Point.X port point).
//   Expected output: 5.
// ---------------------------------------------------------------------------
const ch06 = {
  id: 'ch06',
  title: 'Geometry Operations: Extract Point.X',
  nodes: [
    { id: 'n1', type: 'Input.Number',        x: 80,  y: 60,  controlValues: { val: 5 } },
    { id: 'n2', type: 'Input.Number',        x: 80,  y: 160, controlValues: { val: 3 } },
    { id: 'n3', type: 'Point.ByCoordinates', x: 280, y: 100 },
    { id: 'n4', type: 'Point.X',             x: 480, y: 100 },
    { id: 'n5', type: 'Output.Watch',        x: 680, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'x' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'y' },
    { fromNode: 'n4', fromPort: 'x',    toNode: 'n5', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n4', portName: 'x', value: 5 },
  accept(graphState) {
    return checkOutput(graphState, 'n4', 'x', 5);
  }
};

// ---------------------------------------------------------------------------
// ch07 — List Operations: count items in a range list.
//   Pre-placed: Input.Number(start=1), Input.Number(end=6), List.Range,
//               List.Count, Output.Watch.
//   Missing wire: n3 (List.Range list) → n4 (List.Count port list).
//   Expected output: 5  (range 1..6 exclusive = [1,2,3,4,5]).
// ---------------------------------------------------------------------------
const ch07 = {
  id: 'ch07',
  title: 'List Operations: Count a range',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 80,  y: 60,  controlValues: { val: 1 } },
    { id: 'n2', type: 'Input.Number', x: 80,  y: 160, controlValues: { val: 6 } },
    { id: 'n3', type: 'List.Range',   x: 280, y: 100 },
    { id: 'n4', type: 'List.Count',   x: 480, y: 100 },
    { id: 'n5', type: 'Output.Watch', x: 680, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'start' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'end' },
    { fromNode: 'n4', fromPort: 'count', toNode: 'n5', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n4', portName: 'count', value: 5 },
  accept(graphState) {
    return checkOutput(graphState, 'n4', 'count', 5);
  }
};

// ---------------------------------------------------------------------------
// ch08 — Python Node: round a floating-point value to a whole number.
//   (The Python chapter teaches inputs/outputs on custom nodes; rounding is
//    the simplest deterministic analogue using only built-in nodes.)
//   Pre-placed: Input.Number(3.7), Math.Round, Output.Watch.
//   Extra Input.Number for digits (0) present; missing wire from n1 to n3.
//   Expected output: 4.
// ---------------------------------------------------------------------------
const ch08 = {
  id: 'ch08',
  title: 'Python Node: Round a number',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 80,  y: 60,  controlValues: { val: 3.7 } },
    { id: 'n2', type: 'Input.Number', x: 80,  y: 160, controlValues: { val: 0 } },
    { id: 'n3', type: 'Math.Round',   x: 280, y: 100 },
    { id: 'n4', type: 'Output.Watch', x: 480, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'digits' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 4 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 4);
  }
};

// ---------------------------------------------------------------------------
// ch09 — Code Terminal: sum a sequence of numbers.
//   Pre-placed: Input.Number(start=0), Input.Number(count=5), List.Sequence,
//               List.Sum, Output.Watch.
//   Missing wire: n3 (List.Sequence list) → n4 (List.Sum port list).
//   Expected output: 10  ([0,1,2,3,4] summed = 10).
// ---------------------------------------------------------------------------
const ch09 = {
  id: 'ch09',
  title: 'Code Terminal: Sum a sequence',
  nodes: [
    { id: 'n1', type: 'Input.Number',  x: 80,  y: 60,  controlValues: { val: 0 } },
    { id: 'n2', type: 'Input.Number',  x: 80,  y: 160, controlValues: { val: 5 } },
    { id: 'n3', type: 'List.Sequence', x: 280, y: 100 },
    { id: 'n4', type: 'List.Sum',      x: 480, y: 100 },
    { id: 'n5', type: 'Output.Watch',  x: 680, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'start' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'count' },
    { fromNode: 'n4', fromPort: 'result', toNode: 'n5', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n4', portName: 'result', value: 10 },
  accept(graphState) {
    return checkOutput(graphState, 'n4', 'result', 10);
  }
};

// ---------------------------------------------------------------------------
// ch10 — Code Block: chain two arithmetic operations.
//   Add then multiply: (3 + 2) * 4 = 20.
//   Pre-placed: Input.Number(3), Input.Number(2), Math.Add,
//               Input.Number(4), Math.Multiply, Output.Watch.
//   Missing wire: n3 (Math.Add result) → n5 (Math.Multiply port a).
//   Expected output: 20.
// ---------------------------------------------------------------------------
const ch10 = {
  id: 'ch10',
  title: 'Code Block: Chain two operations',
  nodes: [
    { id: 'n1', type: 'Input.Number',  x: 80,  y: 60,  controlValues: { val: 3 } },
    { id: 'n2', type: 'Input.Number',  x: 80,  y: 160, controlValues: { val: 2 } },
    { id: 'n3', type: 'Math.Add',      x: 280, y: 100 },
    { id: 'n4', type: 'Input.Number',  x: 280, y: 240, controlValues: { val: 4 } },
    { id: 'n5', type: 'Math.Multiply', x: 480, y: 160 },
    { id: 'n6', type: 'Output.Watch',  x: 680, y: 160 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value',  toNode: 'n3', toPort: 'a' },
    { fromNode: 'n2', fromPort: 'value',  toNode: 'n3', toPort: 'b' },
    { fromNode: 'n4', fromPort: 'value',  toNode: 'n5', toPort: 'b' },
    { fromNode: 'n5', fromPort: 'result', toNode: 'n6', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n5', portName: 'result', value: 20 },
  accept(graphState) {
    return checkOutput(graphState, 'n5', 'result', 20);
  }
};

// ---------------------------------------------------------------------------
// Named export — interface contract for T07b.
// ---------------------------------------------------------------------------
export const exercises = [ch01, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch09, ch10];
