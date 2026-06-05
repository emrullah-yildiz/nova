# T07a — Learning exercises: engine definitions + Vitest unit tests

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** core (agent: neo)
**Branch:** `feat/learning-exercises`
**Status:** queued
**Dependency:** none — can start immediately. T07b and T07c depend on T07a being merged first.

---

## Goal

Create `src/ui/learning-exercises.js` containing 10 exercise definitions — one per learning chapter. Each definition includes the node list, the pre-drawn wires, the expected output, and an acceptance function. Write Vitest unit tests that confirm each acceptance function returns `true` for a correct solution and `false` for an incorrect one, using the Nova compute engine from `src/core/` directly.

---

## Owned paths

```
src/ui/learning-exercises.js               (CREATE — exercise definitions)
tests/learning-exercises.test.js           (CREATE — Vitest unit tests)
```

**Do NOT touch:**
- `src/ui/learning-page.js` — owned by T07b
- `src/app/app.js` — hot file; do not import or reference it
- `src/core/node-library.js` — read only; do not register new node types
- `tests/e2e/**` — owned by T07c
- Any file outside the two owned paths above

---

## Interface contract (T07b reads this)

`src/ui/learning-exercises.js` must export a single named export:

```js
export const exercises = [
  {
    id: 'ch01',                 // matches chapter index (ch01..ch10)
    title: 'string',            // short label shown above the mini-canvas
    nodes: [
      {
        id: 'n1',               // unique within the exercise
        type: 'Math.Add',       // Nova node type string from node-library
        x: 120,                 // canvas x position (pixels)
        y: 80,                  // canvas y position (pixels)
        inputs: {               // pre-set input port values (optional)
          a: 3,
          b: null               // null = unwired, user must connect
        }
      }
      // ... 3-4 more nodes
    ],
    preDrawnWires: [
      { fromNode: 'n1', fromPort: 'result', toNode: 'n2', toPort: 'value' }
    ],
    expectedOutput: {
      nodeId: 'n3',             // the node whose output is checked
      portName: 'result',       // the output port name
      value: 6                  // the expected computed value (deep-equal)
    },
    accept: (graphState) => boolean   // returns true if solution is correct
  }
  // ... 9 more entries (ch02..ch10)
];
```

The `accept` function receives a `graphState` object shaped as:
```js
{
  nodes: [ { id, type, inputs: { portName: value } } ],
  wires: [ { fromNode, fromPort, toNode, toPort } ]
}
```

The function must run the graph through the Nova compute engine and return `true` only if the output at `expectedOutput.nodeId / portName` deep-equals `expectedOutput.value`.

### Compute engine usage pattern

Do not re-implement evaluation. Use the engine from `src/core/`:

```js
import { buildGraph, evaluateGraph } from '../core/graph-engine.js';  // adjust path to actual module
// OR whichever function the core exposes for evaluating a graph from a node+wire list.
```

Before writing code, grep `src/core/` to find the correct evaluation entry point:

```bash
grep -rn "export.*eval\|export.*compute\|export.*execute\|export.*run" src/core/ --include="*.js"
```

Use exactly what the engine exports — do not duplicate logic.

---

## Exercise design requirements

Each of the 10 exercises must:
- Have 4–5 pre-placed nodes.
- Have at least 1 unwired input port that the user must connect to solve the exercise.
- Be completable in under 2 minutes.
- Use only node types that exist in the Nova node library (verify against `src/core/node-library.js` or `src/nodes/categories/`).
- Produce a deterministic, easily-verifiable output value (a number, a string, or a short list — not a geometry object).

Suggested exercise themes (one per chapter, aligned to the chapter's teaching topic):
- ch01: Add two numbers (Math.Add, Number literal × 2, Output.Watch)
- ch02: Multiply then watch (Math.Multiply, Number literals, Output.Watch)
- ch03: String concatenation or Text.Join
- ch04: List creation and List.Count
- ch05: List.Map or List.Filter
- ch06: Conditional / Logic node
- ch07: Math.Power or Math.Sqrt
- ch08: Range node → List.Count
- ch09: Point creation → Point.X extraction
- ch10: Nested arithmetic (two operations chained)

Adjust themes to match the actual chapter topics in `src/ui/learning-page.js` — grep the chapter titles before deciding:

```bash
grep -n "chapter\|title\|heading" src/ui/learning-page.js | head -40
```

---

## Vitest unit tests (`tests/learning-exercises.test.js`)

For each of the 10 exercises, write at minimum 2 test cases:

```js
describe('ch01 exercise', () => {
  it('accept returns true for correct solution', () => {
    const correctGraph = { /* wires that complete the exercise */ };
    expect(exercises[0].accept(correctGraph)).toBe(true);
  });

  it('accept returns false for missing wire', () => {
    const missingWire = { /* wires list with the required wire absent */ };
    expect(exercises[0].accept(missingWire)).toBe(false);
  });
});
```

Total: ≥ 20 test cases (2 per chapter). All must pass with `npm run test`.

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-6 | Acceptance functions call the Nova compute engine and check actual output value |
| AC-7 | 10 exercise definitions in `src/ui/learning-exercises.js`; Vitest unit tests pass |

AC-1 through AC-5, AC-8, AC-9, AC-10 are covered by T07b and T07c.

---

## Testing gate

- Unit test: `npm run test` must pass — all ≥ 20 exercise unit tests green (AC-7).
- No Playwright E2E spec needed from this task (that is T07c).
- No manual browser check needed from this task.

---

## Merge checklist

- [ ] AC-6 verified: acceptance functions call `src/core/` engine; no duplicate evaluation logic
- [ ] AC-7 verified: `npm run test` passes; `tests/learning-exercises.test.js` contains ≥ 20 tests, all green
- [ ] All 10 exercise entries cover ch01–ch10
- [ ] Each exercise has 4–5 nodes and ≥ 1 unwired port
- [ ] Node types used in exercises are confirmed to exist in the node library
- [ ] `src/ui/learning-exercises.js` does NOT import from `src/app/app.js` or reference `window.app`
- [ ] `npm run lint:all` — 0 errors
- [ ] Workboard row released on merge (T07b and T07c may proceed after this merges)

---

## Notes

- T07b (the mini-canvas UI component) depends on the `exercises` export shape defined here. The interface contract in this brief is authoritative — do not deviate from the named export or the object shape without updating T07b's brief.
- T07c (Playwright E2E) depends on both T07a and T07b being merged. Do not dispatch T07c until this task and T07b are merged to `feat/learning-exercises`.
- The `accept` function must be a pure function of `graphState` — no DOM access, no `window.*` reads.
- If the chapter topics in `learning-page.js` do not align with the suggested themes above, use the actual chapter themes. The chapter-to-exercise mapping should be intuitive, not forced.
