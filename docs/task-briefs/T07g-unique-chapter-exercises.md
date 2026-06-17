# T07g — Unique per-chapter exercises: logical relevance redesign

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** core (neo)
**Branch:** `fix/tick-007-unique-exercises`
**Status:** queued
**Covers ACs:** AC-11, AC-12
**Parallel with:** T07f (no shared files)

---

## Goal

Redesign the 10 interactive exercises in `src/ui/learning-exercises.js` so that:

1. Each exercise is **unique** — no two chapters use the same node layout or the same missing-wire pattern.
2. Each exercise is **logically tailored to its chapter topic** — the nodes pre-placed on the mini-canvas are the same category the chapter teaches. A Math chapter uses math nodes. A Geometry chapter uses geometry nodes. A List chapter uses list nodes. A Python chapter's exercise explains custom ports, not a plain math round.
3. A **logical consistency check** passes: chapter title, pre-placed node types, and the missing wire all align. The exercise should feel like a natural continuation of what the learner just read.

---

## Owned paths

- `src/ui/learning-exercises.js`
- `src/ui/learning-exercises.test.js` (if it exists, update it; otherwise create it at `src/ui/`)

## Do NOT touch

- `src/ui/mini-canvas.js` — wire interaction is owned by T07f
- `src/ui/learning-page.js`
- `src/core/**` (read-only — use existing compute helpers)
- `tests/e2e/**`
- `scripts/**`
- Any file not listed in "Owned paths"

---

## Background: current state

All 10 exercises currently use the same structural pattern:
- Two `Input.Number` nodes with pre-drawn wires to one math operation node.
- One input wire is missing (port `b`).
- The user connects the missing wire.
- The acceptance function checks a numeric result.

This pattern is fine for the Math and Introduction chapters, but it is inappropriate for chapters on Geometry (which should use `Point` and `Line` nodes), List Operations (which should use list nodes), Python Node (which should exercise custom port wiring), Code Block (which should use a `Custom.CodeBlock` node), and Code Terminal (which should show a programmatic context).

---

## Required exercise designs (one per chapter)

The following specifications are authoritative. Do not deviate from the chapter-exercise mapping.

### ch01 — Introduction: "Add two numbers" (KEEP — appropriate)
- Nodes: `Input.Number(3)`, `Input.Number(4)`, `Math.Add`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.a`, `n3.result → n4.value`
- Missing wire: `n2.value → n3.b`
- Accept: `n3.result === 7`
- Rationale: Introduction teaches what a graph is. Adding two numbers is the simplest possible demonstration.

### ch02 — Interface: "Observe the inspector" (REDESIGN)
- Context: Interface chapter teaches the Canvas, Node Library, Inspector Panel, Viewport.
- Nodes: `Input.Number(12)`, `Math.Sqrt`, `Output.Watch`
- Pre-drawn wires: `n2.result → n3.value`
- Missing wire: `n1.value → n2.value` (connect the number to Sqrt's input)
- Accept: `n2.result ≈ 3.464` (sqrt(12); use tolerance 0.01)
- Rationale: Simple single-wire exercise. The learner connects the number to the math node, then watches the result appear in the Output.Watch — reinforcing the "inspector shows live values" concept from the chapter.

### ch03 — Node Anatomy: "Read the ports and connect them" (REDESIGN)
- Context: Node Anatomy teaches headers, input ports (left), output ports (right), controls, port types.
- Nodes: `Input.Number(8)`, `Input.Number(2)`, `Math.Modulo`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.a`, `n3.result → n4.value`
- Missing wire: `n2.value → n3.b`
- Accept: `n3.result === 0` (8 mod 2 = 0)
- Rationale: Using `Math.Modulo` instead of Math.Add or Math.Subtract forces the learner to read the port labels carefully (a = dividend, b = divisor) — directly exercising the "read every part of a node" skill taught in chapter 3. The result (0) is unambiguous.

### ch04 — Data Types: "Connect a string to a Watch" (REDESIGN)
- Context: Data Types teaches Number, Boolean, String, List, Geometry, Null.
- Nodes: `Input.Text("Nova")`, `Output.Watch`
- Pre-drawn wires: none
- Missing wire: `n1.value → n2.value`
- Accept: output port of n2 has value `"Nova"` OR: use a secondary math node to test a number type — see below.
- Implementation note: since `readNodeOutput` may not easily check string equality through the compute engine, use a two-node numeric test instead:
  - Nodes: `Input.Number(7)`, `Input.Number(3)`, `Math.GreaterThan`, `Output.Watch`
  - Pre-drawn wires: `n1.value → n3.a`, `n3.result → n4.value`
  - Missing wire: `n2.value → n3.b`
  - Accept: `n3.result === true` (7 > 3 is true — a Boolean output)
  - Rationale: The learner completes a graph that produces a Boolean result, directly demonstrating the Boolean data type taught in chapter 4. The result type is distinct from the Number outputs in other exercises.

### ch05 — Math Operations: "Raise a base to a power" (REDESIGN)
- Context: Math Operations teaches arithmetic, rounding, trig, range/remap, constants.
- Nodes: `Input.Number(3)`, `Input.Number(4)`, `Math.Power`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.base`, `n3.result → n4.value`
- Missing wire: `n2.value → n3.exp`
- Accept: `n3.result === 81` (3^4)
- Rationale: Math.Power is distinctly a Math Operations node (not Add/Subtract/Multiply), exercises a non-trivial port name (`exp`), and the result 81 is easily verifiable. Replaced ch05's existing 2^8=256 with 3^4=81 to distinguish from the old pattern.

### ch06 — Geometry Operations: "Build a point and extract its Y coordinate" (REDESIGN)
- Context: Geometry Operations teaches Points, Lines, Surfaces, Solids, Transformations.
- Nodes: `Input.Number(0)`, `Input.Number(7)`, `Point.ByCoordinates`, `Point.Y`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.x`, `n4.y → n5.value`
- Missing wire: `n2.value → n3.y` (connect y-coordinate to the point)
- Accept: `n4.y === 7`
- Rationale: Forces the learner to connect a coordinate value to a Point node and see the geometric result — the core skill of the Geometry chapter. The extracted Y value (7) is unambiguous.

### ch07 — List Operations: "Get the first item from a list" (REDESIGN)
- Context: List Operations teaches creating lists, accessing items, transforming, lacing, list levels.
- Nodes: `Input.Number(0)`, `Input.Number(10)`, `List.Range`, `List.GetItemAtIndex`, `Output.Watch`
- Pre-drawn wires: `n2.value → n3.end`, `n3.list → n4.list`, `n4.item → n5.value`
- Missing wire: `n1.value → n4.index` (connect the index = 0 to GetItemAtIndex)
- Accept: `n4.item === 0` (range [0..9], item at index 0 is 0)
- Rationale: Teaches list indexing — "Accessing Items" is the second topic in chapter 7. The learner must connect the index port, which is the concept the chapter emphasizes.

### ch08 — Python Node: "Wire the input to a Python node" (REDESIGN)
- Context: Python Node teaches writing Python, input/output ports, RevitBridge, error handling.
- Nodes: `Input.Number(5)`, `Custom.Python`, `Output.Watch`
- The Python node code is pre-set to: `result = value * 2`  (so its input port is `value`, output is `result`)
- Pre-drawn wires: `n2.result → n3.value`
- Missing wire: `n1.value → n2.value` (connect the number to the Python node's inferred input port)
- Accept: `n2.result === 10`
- Rationale: The learner must connect an Input.Number to a Python node's dynamically-inferred input port — the exact skill taught in "Input and Output Ports" in chapter 8. The Python code `result = value * 2` infers a `value` input port; the learner draws the wire.
- Implementation note: The exercise engine must pre-set `n2.controlValues = { code: 'result = value * 2' }` and the compute context must evaluate it. Use `createLessonComputeContext` as before. Confirm that the Python/CodeBlock node type used in mini-canvas can materialise ports from a pre-set code string.

### ch09 — Code Terminal: "Sum a sequence" (KEEP — appropriate)
- Nodes: `Input.Number(0)`, `Input.Number(5)`, `List.Sequence`, `List.Sum`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.start`, `n2.value → n3.count`, `n4.result → n5.value`
- Missing wire: `n3.list → n4.list`
- Accept: `n4.result === 10`
- Rationale: Code Terminal chapter teaches programmatic access to the graph. The exercise uses List nodes which are relevant to "Creating Nodes Programmatically" and "Inspecting Values". Already appropriate — keep.

### ch10 — Code Block: "Chain two operations" (KEEP — appropriate)
- Nodes: `Input.Number(3)`, `Input.Number(2)`, `Math.Add`, `Input.Number(4)`, `Math.Multiply`, `Output.Watch`
- Pre-drawn wires: `n1.value → n3.a`, `n2.value → n3.b`, `n4.value → n5.b`, `n5.result → n6.value`
- Missing wire: `n3.result → n5.a` (chain Add output into Multiply input)
- Accept: `n5.result === 20` ((3+2)*4)
- Rationale: Code Block chapter teaches expression chaining. The exercise literally requires chaining two arithmetic operations — matching the chapter's core concept. Already appropriate — keep.

---

## Implementation steps

1. Read `src/ui/learning-exercises.js` in full (already read by orchestrator — confirmed 310 lines).
2. Enumerate which chapters need redesign: ch02, ch03, ch04, ch05, ch06, ch07, ch08.
3. For each redesigned chapter, write a new exercise definition object matching the spec above.
4. Verify via `checkOutput` that the `accept()` function returns `true` for the specified wired state and `false` for the missing-wire state (the test cases in the unit test file must cover both).
5. For ch08 (Python node): before committing, run a quick unit test confirming that `createLessonComputeContext` can evaluate a Python node with `code: 'result = value * 2'` and input `value = 5` → output `result = 10`. If the Python node is not evaluatable in the test context (no Python runtime), fall back to `Custom.CodeBlock` with `code: 'result = value * 2'` (CodeBlock supports simple expressions).
6. Update (or create) `src/ui/learning-exercises.test.js` — for every exercise add at minimum:
   - One test where `accept()` returns `true` (all wires present).
   - One test where `accept()` returns `false` (the required missing wire is absent).
7. Run `npm run test` — all tests (including the new ones) must pass.
8. Run `npm run lint:all` and `npm run build`.

---

## Interface/contract

The export from `src/ui/learning-exercises.js` must remain:

```js
export const exercises = [ /* 10 items, index = chapter index 0..9 */ ];
```

Each item has: `{ id, title, nodes, preDrawnWires, expectedOutput, accept }`.

The `nodes` array items: `{ id, type, x, y, controlValues? }`.
The `preDrawnWires` array items: `{ fromNode, fromPort, toNode, toPort }`.
The `accept(graphState)` function receives `{ nodes, wires }` where `wires` are the FULL set of wires (pre-drawn + user-drawn).

Do not change the schema. T07f depends on this schema to render exercises — any schema change would break T07f.

---

## Logical consistency check (AC-12)

After writing all 10 exercises, verify the following matrix. Every row must be "yes":

| Chapter | Exercise uses same-domain nodes | Exercise missing wire requires chapter skill | Screenshot slot uses same domain |
|---|---|---|---|
| Introduction | Math.Add | connecting first wire | intro-simple: multiply graph |
| Interface | Math.Sqrt | connecting input to show live output | interface-simple: add+watch |
| Node Anatomy | Math.Modulo | reading port label `b` (divisor) | node-layout-simple: add+watch |
| Data Types | Math.GreaterThan → Boolean output | connecting to produce a Boolean | data-types-simple: string+number |
| Math Operations | Math.Power | reading port label `exp` | math-simple: pythagorean |
| Geometry Operations | Point.ByCoordinates + Point.Y | connecting a coordinate | geometry-simple: line |
| List Operations | List.Range + List.GetItemAtIndex | connecting the index port | lists-simple: reverse |
| Python Node | Custom.Python (or CodeBlock) | connecting custom inferred port | python-simple: squares |
| Code Terminal | List.Sequence + List.Sum | connecting list output | code-terminal-simple: terminal |
| Code Block | Math.Add + Math.Multiply chain | connecting chained output | codeblock-simple: rectangle |

This matrix is the acceptance evidence for AC-12. Include a comment block at the top of `learning-exercises.js` summarizing the matrix.

---

## Testing gate

- **AC-11:** Unit tests in `learning-exercises.test.js` — every exercise has a `true` and `false` acceptance test; no two exercises use the same node type layout; all 10 `id` values are unique.
- **AC-12:** Code review — matrix comment in `learning-exercises.js` maps each chapter to its domain; no chapter uses a different domain's nodes.
- No E2E changes required for this task — T07f owns the E2E spec.

---

## Merge checklist

- [ ] AC-11 verified: all 10 exercises are unique; unit tests have true+false cases for all 10
- [ ] AC-12 verified: consistency matrix comment present in learning-exercises.js; all rows pass
- [ ] `npm run test` → all pass (≥20 new/updated exercise unit tests)
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run build` → green
- [ ] Workboard row released; TICK-007.md AC-11, AC-12 checked [x]
