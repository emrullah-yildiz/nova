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
//
// ---------------------------------------------------------------------------
// Consistency matrix — chapter → domain → focal node(s)
// ---------------------------------------------------------------------------
//
// ch01  Introduction         → connect two numbers into Math.Add
// ch02  Interface            → live scaling via Input.Slider + Math.Multiply
// ch03  Node Anatomy         → clamp an out-of-range value with Math.Clamp
// ch04  Data Types           → generate a range and pick the first item (List.Range → List.First)
// ch05  Math Operations      → compute remainder with Math.Modulo
// ch06  Geometry Operations  → build a Point, extract its Y coordinate
// ch07  List Operations      → generate a range, sum its items
// ch08  Python Node          → square root (16^0.5 = 4) via Math.Power
// ch09  Code Terminal        → sequence of N numbers → sum
// ch10  Code Block           → chain Add then Multiply into a single result
//
// ---------------------------------------------------------------------------

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
    { id: 'n1', type: 'Input.Number', x: 20,  y: 40,  controlValues: { val: 3 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 155, controlValues: { val: 4 } },
    { id: 'n3', type: 'Math.Add',     x: 270, y: 80 },
    { id: 'n4', type: 'Output.Watch', x: 520, y: 80 }
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
// ch02 — Interface: live scaling — wire a slider into a multiplier.
//   The Interface chapter introduces the canvas controls; using Input.Slider
//   shows how dragging a control updates the watch live.
//   Pre-placed: Input.Slider(val=5, min=0, max=20), Input.Number(b=4),
//               Math.Multiply, Output.Watch.
//   Pre-drawn: n2 (b=4) → n3 (Math.Multiply port b); n3 result → n4 value.
//   Missing wire: n1 (slider value) → n3 (Math.Multiply port a).
//   Expected output: 5 × 4 = 20.
// ---------------------------------------------------------------------------
const ch02 = {
  id: 'ch02',
  title: 'Interface: Scale a slider value',
  nodes: [
    { id: 'n1', type: 'Input.Slider',  x: 20,  y: 40,  controlValues: { val: 5, min: 0, max: 20 } },
    { id: 'n2', type: 'Input.Number',  x: 20,  y: 175, controlValues: { val: 4 } },
    { id: 'n3', type: 'Math.Multiply', x: 270, y: 95 },
    { id: 'n4', type: 'Output.Watch',  x: 520, y: 95 }
  ],
  preDrawnWires: [
    { fromNode: 'n2', fromPort: 'value',  toNode: 'n3', toPort: 'b' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 20 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 20);
  }
};

// ---------------------------------------------------------------------------
// ch03 — Node Anatomy: use Math.Clamp to constrain an out-of-range value.
//   Node Anatomy teaches inputs, outputs, and controls; Math.Clamp has three
//   distinct input ports (value, min, max) which perfectly demonstrates port
//   anatomy — one port is left disconnected for the learner to wire.
//   Pre-placed: Input.Number(value=150), Input.Number(min=0), Math.Clamp,
//               Output.Watch. (max=100 is set via control on n3.)
//   Pre-drawn: n2 (min) → n3 (Clamp port min); n3 result → n4.
//   Missing wire: n1 (value=150) → n3 (Clamp port value).
//   Expected output: clamp(150, 0, 100) = 100.
// ---------------------------------------------------------------------------
const ch03 = {
  id: 'ch03',
  title: 'Node Anatomy: Clamp a value to a range',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 20,  y: 40,  controlValues: { val: 150 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 175, controlValues: { val: 0 } },
    { id: 'n3', type: 'Math.Clamp',   x: 270, y: 95,  controlValues: { min: 0, max: 100 } },
    { id: 'n4', type: 'Output.Watch', x: 520, y: 95 }
  ],
  preDrawnWires: [
    { fromNode: 'n2', fromPort: 'value',  toNode: 'n3', toPort: 'min' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 100 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 100);
  }
};

// ---------------------------------------------------------------------------
// ch04 — Data Types: generate a range and pick the first item.
//   The Data Types chapter introduces the List data type. List.Range builds a
//   numeric collection; List.First picks item[0], showing that a list is an
//   ordered sequence whose elements are individually accessible.
//   Pre-placed: Input.Number(start=10), Input.Number(end=40),
//               Input.Number(step=10), List.Range, List.First, Output.Watch.
//   Pre-drawn: n1 (start=10) → n4 (Range start);
//              n2 (end=40)   → n4 (Range end);
//              n3 (step=10)  → n4 (Range step);
//              n5 (item)     → n6 (Watch value).
//   Missing wire: n4 (List.Range list) → n5 (List.First port list).
//   Expected output: first item of [10, 20, 30] = 10.
// ---------------------------------------------------------------------------
const ch04 = {
  id: 'ch04',
  title: 'Data Types: Get the first item of a list',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 20,  y: 20,  controlValues: { val: 10 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 115, controlValues: { val: 40 } },
    { id: 'n3', type: 'Input.Number', x: 20,  y: 210, controlValues: { val: 10 } },
    { id: 'n4', type: 'List.Range',   x: 270, y: 100 },
    { id: 'n5', type: 'List.First',   x: 520, y: 100 },
    { id: 'n6', type: 'Output.Watch', x: 770, y: 100 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n4', toPort: 'start' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n4', toPort: 'end' },
    { fromNode: 'n3', fromPort: 'value', toNode: 'n4', toPort: 'step' },
    { fromNode: 'n5', fromPort: 'item',  toNode: 'n6', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n5', portName: 'item', value: 10 },
  accept(graphState) {
    return checkOutput(graphState, 'n5', 'item', 10);
  }
};

// ---------------------------------------------------------------------------
// ch05 — Math Operations: compute the remainder of 17 ÷ 5 with Math.Modulo.
//   Math Operations teaches the full range of math nodes beyond the four basic
//   operations. Modulo is distinctive: it is the only operation that yields the
//   remainder, and the result is non-obvious to beginners (17 % 5 = 2).
//   Pre-placed: Input.Number(a=17), Input.Number(b=5), Math.Modulo,
//               Output.Watch.
//   Pre-drawn: n1 (a=17) → n3 (Modulo port a); n3 result → n4.
//   Missing wire: n2 (b=5) → n3 (Modulo port b).
//   Expected output: 17 % 5 = 2.
// ---------------------------------------------------------------------------
const ch05 = {
  id: 'ch05',
  title: 'Math Operations: Remainder (17 mod 5)',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 20,  y: 40,  controlValues: { val: 17 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 155, controlValues: { val: 5 } },
    { id: 'n3', type: 'Math.Modulo',  x: 270, y: 80 },
    { id: 'n4', type: 'Output.Watch', x: 520, y: 80 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value',  toNode: 'n3', toPort: 'a' },
    { fromNode: 'n3', fromPort: 'result', toNode: 'n4', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n3', portName: 'result', value: 2 },
  accept(graphState) {
    return checkOutput(graphState, 'n3', 'result', 2);
  }
};

// ---------------------------------------------------------------------------
// ch06 — Geometry Operations: build a 3-D point and read back its Y coordinate.
//   Geometry Operations introduces Point creation; extracting Point.Y shows
//   how geometry nodes expose inspectable coordinates downstream.
//   Pre-placed: Input.Number(x=3), Input.Number(y=7), Point.ByCoordinates,
//               Point.Y, Output.Watch.
//   Pre-drawn: n1 (x=3) → n3 (ByCoordinates port x);
//              n2 (y=7) → n3 (ByCoordinates port y);
//              n4 (Point.Y port y) → n5 (Watch).
//   Missing wire: n3 (point) → n4 (Point.Y port point).
//   Expected output: y = 7.
// ---------------------------------------------------------------------------
const ch06 = {
  id: 'ch06',
  title: 'Geometry Operations: Extract the Y coordinate of a point',
  nodes: [
    { id: 'n1', type: 'Input.Number',        x: 20,  y: 40,  controlValues: { val: 3 } },
    { id: 'n2', type: 'Input.Number',        x: 20,  y: 155, controlValues: { val: 7 } },
    { id: 'n3', type: 'Point.ByCoordinates', x: 270, y: 80 },
    { id: 'n4', type: 'Point.Y',             x: 520, y: 80 },
    { id: 'n5', type: 'Output.Watch',        x: 770, y: 80 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n3', toPort: 'x' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n3', toPort: 'y' },
    { fromNode: 'n4', fromPort: 'y',     toNode: 'n5', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n4', portName: 'y', value: 7 },
  accept(graphState) {
    return checkOutput(graphState, 'n4', 'y', 7);
  }
};

// ---------------------------------------------------------------------------
// ch07 — List Operations: generate a number range and sum its items.
//   List Operations shows how to work with entire collections at once. Creating
//   a range and summing it — [1,2,3,4] → 10 — demonstrates the producer →
//   consumer pattern that underpins all list work.
//   Pre-placed: Input.Number(start=1), Input.Number(end=5), Input.Number(step=1),
//               List.Range, List.Sum, Output.Watch.
//   Pre-drawn: n1 (start) → n4 (Range start); n2 (end) → n4 (Range end);
//              n3 (step) → n4 (Range step); n5 (List.Sum result) → n6.
//   Missing wire: n4 (List.Range list) → n5 (List.Sum port list).
//   Expected output: sum([1,2,3,4]) = 10.
// ---------------------------------------------------------------------------
const ch07 = {
  id: 'ch07',
  title: 'List Operations: Sum a range of numbers',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 20,  y: 20,  controlValues: { val: 1 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 125, controlValues: { val: 5 } },
    { id: 'n3', type: 'Input.Number', x: 20,  y: 230, controlValues: { val: 1 } },
    { id: 'n4', type: 'List.Range',   x: 270, y: 115 },
    { id: 'n5', type: 'List.Sum',     x: 520, y: 115 },
    { id: 'n6', type: 'Output.Watch', x: 770, y: 115 }
  ],
  preDrawnWires: [
    { fromNode: 'n1', fromPort: 'value', toNode: 'n4', toPort: 'start' },
    { fromNode: 'n2', fromPort: 'value', toNode: 'n4', toPort: 'end' },
    { fromNode: 'n3', fromPort: 'value', toNode: 'n4', toPort: 'step' },
    { fromNode: 'n5', fromPort: 'result', toNode: 'n6', toPort: 'value' }
  ],
  expectedOutput: { nodeId: 'n5', portName: 'result', value: 10 },
  accept(graphState) {
    return checkOutput(graphState, 'n5', 'result', 10);
  }
};

// ---------------------------------------------------------------------------
// ch08 — Python Node: compute a square root using Math.Power (exp = 0.5).
//   The Python Node chapter teaches that custom code can express operations
//   such as square roots. Math.Power with exp = 0.5 is the built-in
//   equivalent (√16 = 4), giving the learner a deterministic, engine-
//   verifiable result that mirrors what Python's math.sqrt() would return.
//   Pre-placed: Input.Number(base=16), Input.Number(exp=0.5), Math.Power,
//               Output.Watch.
//   Pre-drawn: n2 (exp=0.5) → n3 (Math.Power port exp); n3 result → n4.
//   Missing wire: n1 (base=16) → n3 (Math.Power port base).
//   Expected output: 16^0.5 = 4.
// ---------------------------------------------------------------------------
const ch08 = {
  id: 'ch08',
  title: 'Python Node: Square root via Math.Power',
  nodes: [
    { id: 'n1', type: 'Input.Number', x: 20,  y: 40,  controlValues: { val: 16 } },
    { id: 'n2', type: 'Input.Number', x: 20,  y: 155, controlValues: { val: 0.5 } },
    { id: 'n3', type: 'Math.Power',   x: 270, y: 80 },
    { id: 'n4', type: 'Output.Watch', x: 520, y: 80 }
  ],
  preDrawnWires: [
    { fromNode: 'n2', fromPort: 'value',  toNode: 'n3', toPort: 'exp' },
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
    { id: 'n1', type: 'Input.Number',  x: 20,  y: 40,  controlValues: { val: 0 } },
    { id: 'n2', type: 'Input.Number',  x: 20,  y: 155, controlValues: { val: 5 } },
    { id: 'n3', type: 'List.Sequence', x: 270, y: 70 },
    { id: 'n4', type: 'List.Sum',      x: 520, y: 70 },
    { id: 'n5', type: 'Output.Watch',  x: 770, y: 70 }
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
    { id: 'n1', type: 'Input.Number',  x: 20,  y: 40,  controlValues: { val: 3 } },
    { id: 'n2', type: 'Input.Number',  x: 20,  y: 155, controlValues: { val: 2 } },
    { id: 'n3', type: 'Math.Add',      x: 270, y: 80 },
    { id: 'n4', type: 'Input.Number',  x: 270, y: 260, controlValues: { val: 4 } },
    { id: 'n5', type: 'Math.Multiply', x: 520, y: 155 },
    { id: 'n6', type: 'Output.Watch',  x: 770, y: 155 }
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
