# Nova Interactive Learning & Training System — Plan (proposal)

> **Status: PROPOSAL / plan-only. No app code changed.** Owner review required
> before any build. Companion source-of-truth: [`../NOVA.md`](../NOVA.md) (§1 vision,
> §3 module map, §4 patterns — esp. *single→list*, *no tree type*, *fit gate*,
> *no duplicate nodes*). Rules: [`../ENGINEERING.md`](../ENGINEERING.md) §3, §7.
>
> Reference inspiration: the Dynamo Primer (primer2.dynamobim.org) — but Nova's
> system is **interactive (learn by doing)**, not prose + screenshots, and maps to
> **Nova's real features and data model**, never Dynamo's.

---

## 0. Fit gate — does this belong in Nova?

**Yes, with conditions.** It fits §1 ("parametric design as approachable as a web
app") and directly extends a feature that *just shipped* — the static Nova Learning
page ([`../../src/ui/learning-page.js`](../../src/ui/learning-page.js) +
`app.showLearning()/closeLearning()`). It does **not** add nodes, so the node fit
gate / no-duplicate-nodes rule does not bite — but two §4 patterns are load-bearing
constraints on *content* and on the *validation engine*:

- **Single value → one-item list** and **wire-boundary coercion** (number↔boolean):
  the lesson validator must run the **real engine** semantics, or a "correct"
  learner graph could be marked wrong (or vice-versa). We reuse the engine, we do
  not re-implement comparison rules.
- **Data is values + nested lists — there is no tree type.** The curriculum teaches
  **lists / lists-of-lists / `List.*`** (Chunk, Transpose, Flatten, GroupBy) and
  **lacing** (shortest / longest / cross). It must never introduce or imply a
  "DataTree"/tree type (removed 2026-06-04). This is an explicit content review gate.

This plan does **not** change the architecture or roadmap text in NOVA.md by itself;
if the owner approves a build, NOVA.md §5/§6 get a one-line "Learning system (Phase N)"
entry and a decision-log entry in the *build* branch (not here).

---

## 1. The load-bearing decision: sandbox + wire-checking mechanism

Everything else hangs off one choice: **how does a lesson host a node graph the
learner edits, and how do we validate their answer?**

### 1.1 What the engine already gives us (verified)

The compute engine is already **pure and graph-shaped**, which is the whole reason
this feature is feasible:

- A graph is just `{ nodes, wires }`.
  - node `= { id, type, controlValues, _portValues, ... }`
  - wire `= { fromNode, fromPort, toNode, toPort }`
- [`../../src/core/compute-engine.js`](../../src/core/compute-engine.js) exposes
  `createComputeContext(nodes, wires, { computeInner, formulaEval })` and
  `computeNodeValue(ctx, node)` — a self-contained evaluator with its own cache. It
  takes **no** DOM and **no** global app state.
- [`../../src/nodes/runtimeAdapter.js`](../../src/nodes/runtimeAdapter.js)
  `createRegistryComputeInner(registry)` is the `computeInner` for registry nodes,
  and it applies the real lacing / single→list / number↔boolean rules
  ([`../../src/core/lacing.js`](../../src/core/lacing.js)).

**Consequence:** we can evaluate any learner graph headlessly and compare results,
*without* the canvas — the validator is a pure function. The expensive/coupled part
is the *editing surface*, not the evaluation.

The editing surface, by contrast, is **not** cleanly reusable: the renderer
([`../../src/ui/node-renderer.js`](../../src/ui/node-renderer.js)) monkey-patches
`app.renderNode`/`app.*` and assumes a single global `app` (`getRuntimeApp()`),
the full library panel, viewport, properties panel, persistence, etc. Embedding the
*real* canvas inside a lesson means either dragging the whole app shell in or
forking its event handling — high coupling, high risk.

### 1.2 Recommended architecture — **scoped reuse, not a fork**

Split the two concerns and reuse each at the level where reuse is cheap:

```
Lesson runtime
├─ Mini-canvas (NEW, src/ui/learning/sandbox-canvas.js)   ← editing surface
│   purpose-built, lightweight: render nodes + ports + wires from {nodes,wires},
│   drag-to-wire, pick-a-node from a SCOPED palette, edit a control.
│   It produces/consumes the SAME {nodes,wires} shape the real engine eats.
│
├─ Engine (REUSED, unchanged): createComputeContext + createRegistryComputeInner
│   evaluate the learner's {nodes,wires} headlessly.
│
└─ Validator (NEW, src/core/learning/validate-lesson.js — PURE)
    compare learner graph/result against the lesson's "checks".
```

Why mini-canvas over reuse-the-real-canvas for **v1**:

- The engine is the hard, correctness-critical part and we reuse it 100%.
- The real canvas is a global-`app` monolith; scoping it per-lesson is the riskiest,
  highest-effort path and would couple the learning module to UI/app hot files.
- A scoped mini-canvas keeps the learning module in **new owned files** (ENGINEERING
  §3 "new file over shared edit") and off the hot-file list. It can render with the
  same node colors/port styling for visual continuity by importing the shared
  metadata/`TYPE_COLORS`, *read-only*.

**This is the #1 open decision for the owner** (see §9): accept the mini-canvas
trade-off (lower fidelity, but isolated and shippable) vs invest in a reusable
scoped instance of the real canvas (higher fidelity, much larger, touches UI/app
hot files). Recommendation: **mini-canvas for v1**, revisit real-canvas reuse only
if/when lessons need full-fidelity features (viewport geometry, properties panel).

### 1.3 The validator — three check kinds, all on the real engine

A lesson `step` declares one or more `checks`. The validator
(`validate-lesson.js`, pure, unit-testable) runs them against the learner's
`{nodes, wires}`:

1. **`output` check (preferred — robust, solution-agnostic).** "Wire it so node
   `out` produces X." We evaluate the learner graph with the real engine
   (`computeNodeValue`) and deep-compare the target node's output to an
   `expected` value (with a tolerance for numbers, and **engine-normalized**: a
   scalar vs one-item-list compare respects single→list). This is the gold standard
   because *any* correct wiring passes — it teaches the concept, not one rote answer.
2. **`wiring` check (structural).** "Connect `Number.out → Box.size`." Assert a set
   of required wires exist (by `fromNode/fromPort → toNode/toPort`, matched on
   stable lesson-defined node ids) and optionally that no forbidden extra wires
   exist. Used when there is genuinely one right topology (early wiring lessons).
3. **`presence` check.** "Add a `List.Transpose` node" / "set lacing to cross." Assert
   a node of a given `type` exists, or a `controlValues` field equals a value. Used
   for "pick the right node" and "set the control" mechanics.

On failure the validator returns the **first failed check's `hint`** (lesson-authored),
so the learner gets a targeted nudge, not a generic "wrong." Multiple-choice
("puzzle") questions are a trivial fourth check kind (`choice`) handled in the same
pass — no graph needed.

The validator is **pure and engine-backed**, so the "correct wiring → pass / wrong →
hint" mechanic is correct by construction and fully unit-testable in jsdom/node.

---

## 2. Data-driven lesson format

A lesson is **data, not code** — a JS module exporting a plain object (so authors get
type-checking/imports for node-type constants but no logic leaks in). One file per
lesson under `src/ui/learning/lessons/`, indexed by a manifest.

```js
// src/ui/learning/lessons/02-wiring.js  (illustrative shape — NOT final code)
export default {
  id: 'wiring-first-graph',
  track: 'beginner',           // 'beginner' | 'advanced'
  order: 2,
  title: 'Wiring nodes together',
  estMinutes: 4,
  intro: 'Every node is a tiny function with input and output ports…',  // prose/markdown-lite
  // Scoped palette: only these node types appear in the mini-canvas library.
  palette: ['Input.Number', 'Math.Add', 'Output.Watch'],
  // Starter graph the learner begins from (same {nodes,wires} the engine eats).
  starter: {
    nodes: [
      { id: 'a', type: 'Input.Number', controlValues: { value: 3 }, x: 40,  y: 60 },
      { id: 'b', type: 'Input.Number', controlValues: { value: 4 }, x: 40,  y: 160 },
      { id: 'sum', type: 'Math.Add', x: 260, y: 110 },
      { id: 'w', type: 'Output.Watch', x: 480, y: 110 }
    ],
    wires: []   // learner must add them
  },
  steps: [
    {
      prompt: 'Wire both numbers into Add, then Add into Watch.',
      checks: [
        { kind: 'output', node: 'w', expected: 7, tol: 1e-9,
          hint: 'Drag from each Number\'s output port to an Add input port.' }
      ]
    }
  ],
  // Optional: a fully-solved reference graph, used for a "show me" reveal and as a
  // test fixture (CI asserts the reference graph passes its own checks).
  solution: { nodes: [/*…*/], wires: [/*…*/] },
  // Hand-off: deep-link the learner into a real blank/templated project.
  handoff: { kind: 'newProject', template: null }
};
```

Lesson-format rules:

- **`palette` scopes the library** so a beginner isn't drowned in 200 nodes — a key
  pedagogical lever and also what keeps the mini-canvas simple.
- **`checks` reference lesson-stable node ids** (`'sum'`, `'w'`), decoupled from the
  runtime instance ids the mini-canvas assigns, via an id map.
- **Every lesson with a graph MUST ship a `solution`**, and **CI asserts the
  solution passes its own `checks`** — this prevents un-completable lessons (the
  learn-system analog of the node "working sample" gate, NOVA.md §4).
- Content is reviewed against the **no-tree-type / lists-of-lists** rule and node
  naming conventions before merge.

A `manifest.js` lists lessons in track + order, used to render the lesson list and
compute progress.

---

## 3. Curriculum outline (beginner → advanced)

Mapped to **Nova's real features** (engine, node library, lacing, nested lists,
Custom.CodeBlock/Custom.Python, AI, Connect/Revit, Forma) — not Dynamo's. Each module
names its **interactive mechanic**.

### Beginner track

| # | Module | Teaches | Interactive mechanic |
|---|---|---|---|
| B1 | What is Nova / the canvas | nodes = functions, the canvas, the library | guided tour + 1 MCQ ("which is an output port?") |
| B2 | Ports & wiring | drawing wires, data flows downstream, live recompute | **wiring check**: connect Number→Add→Watch to make 7 |
| B3 | Data types | number / string / boolean / point / vector / curve | **presence + output**: build a Point from 3 numbers; MCQ on type colors |
| B4 | Controls & inputs | sliders, number/string inputs, editing `controlValues` | **presence**: set a slider so output hits a target |
| B5 | Lists | List.Create, Range, Length, GetItem | **output check**: produce `[0,2,4,6,8]` with Range |
| B6 | List operations | Map-style ops, Filter, Sort, Flatten | **output check**: filter a list to evens |
| B7 | Lacing | shortest / longest / cross product | **presence (control)**: switch lacing so 2 lists pair into a grid of points |
| B8 | Lists of lists | nested lists, `List.Chunk`, `List.Transpose` (NO tree type) | **output check**: chunk a flat list into rows, transpose it |
| B9 | Live geometry & viewer | geometry nodes → viewport (read-only embed or screenshot) | **wiring**: wire points→curve→surface; MCQ on what renders |
| B10 | Capstone (beginner) | combine the above | small **multi-check** task: a parametric grid of points/boxes from sliders + lacing |

### Advanced track

| # | Module | Teaches | Interactive mechanic |
|---|---|---|---|
| A1 | The AI assistant | describe→graph, read-graph, BYOK, fenced actions | guided + MCQ (no live AI call required; explains the workflow) |
| A2 | Custom.CodeBlock | inline expressions, multi-assignment outputs, `..`/`#` series shorthand | **output check**: a CodeBlock that turns a list of points into shifted points (geometry-meaningful) |
| A3 | Custom.Python | full-script escape hatch, inferred inputs, last-assignment output | **output check**: a Python cell processing element parameters / point coords |
| A4 | Building data workflows | combining lists + lacing + code for real structure | multi-check: panel a surface into a grid (paneling math) |
| A5 | Connect to Revit | the Connect ribbon, pairing, read pilot, approved writes (server-authoritative) | guided + MCQ on the **approval/audit** model; no real host required |
| A6 | Forma | pulling/pushing Forma geometry | guided + MCQ |
| A7 | Capstone (advanced) | end-to-end | **façade/paneling capstone**: drive a paneled façade from inputs, with output checks at each stage |

Content scope is itself an open decision (§9) — the **v1 slice is intentionally a
subset** (see §6), not all 17 modules.

### Curriculum guardrails (content review gates)

- Use **Nova node names** exactly (`List.Transpose`, `Custom.CodeBlock`,
  `Math.Add`) — verify each referenced `type` exists in the registry before merge.
- **Never** say "tree" / "DataTree" / "graft branches"; nesting is **lists of lists**
  via `List.*` (NOVA.md §4). A reviewer checks every lesson for this.
- Code examples (A2/A3) must be **geometry/Revit-meaningful** (process points,
  element params) per the node "valuable workflow" spirit — no toy `x = 1`.
- Lacing/levels lessons must match the **real engine** behavior (auto-laceable vs
  list-consuming nodes), which the engine-backed validator enforces automatically.

---

## 4. Progress & navigation

- **Lesson list / track UI:** a tracks-and-lessons index (Beginner / Advanced),
  each lesson showing locked/started/completed state and est. minutes. Reached from
  the existing Learning overlay (see §5).
- **Progress storage — phased:**
  - **v1: `localStorage`** keyed per lesson id (`nova.learning.progress`). Zero
    backend, works signed-out, ships immediately. Treated as untrusted/best-effort
    (it's just progress, not a security boundary).
  - **later: account-synced.** When accounts land (NOVA.md §6 is *Phase 0 not
    started*), persist progress on the user profile so it follows them across
    devices. This is explicitly **deferred** — do not block v1 on accounts.
- **"Try it in a real project" hand-off:** each lesson's `handoff` deep-links into a
  real blank or templated project via the existing `app.newProject()` (already wired
  in the static page's footer button), optionally seeding the project with the
  lesson's solution graph as a starting point.

---

## 5. Relation to the current Learning page

**Extend, don't replace.** The shipped static page
([`../../src/ui/learning-page.js`](../../src/ui/learning-page.js)) is a good
*linear tour / on-ramp*; the interactive system is the *do-it-yourself curriculum*.

Recommended shape:
- Keep the static tour as the **intro/landing** inside the Learning overlay.
- Add an **"Interactive lessons"** entry on that page that opens the tracks list →
  a lesson → the mini-canvas runtime.
- Both live under Help → Nova Learning (one entry point, two depths: skim the tour,
  or do the lessons). The static page's content can later be folded in as Beginner
  modules B1/B9 if we want a single surface — but that's optional and not v1.

No duplication of the overlay shell: the interactive runtime mounts inside the same
`learning-overlay` the static page already creates.

---

## 6. v1 vs later phases (smallest shippable interactive slice)

**v1 — "the mechanic, proven on a vertical slice" (smallest shippable):**

- The **engine-backed validator** (`src/core/learning/validate-lesson.js`, pure) with
  `output`, `wiring`, `presence`, `choice` checks + unit tests.
- The **lesson format** + manifest + **3 beginner lessons** (B2 wiring, B5 lists,
  B7 lacing) — enough to prove all check kinds and the core mechanic.
- A **minimal mini-canvas** (`src/ui/learning/sandbox-canvas.js`): render
  nodes/ports/wires from `{nodes,wires}`, drag-to-wire, scoped palette, edit a
  control, a "Check" button, hint display.
- Wire an **"Interactive lessons"** entry into the existing Learning overlay.
- **localStorage** progress.
- CI test: every shipped lesson's `solution` passes its own `checks`.

**Phase 2 — breadth + polish:** complete the beginner track (B1, B3–B4, B6, B8–B10),
viewer embed for geometry lessons, MCQ polish, lesson list/progress UI refinement.

**Phase 3 — advanced track:** A1–A7 incl. Custom.CodeBlock/Python and Connect/Forma
modules, capstone(s).

**Phase 4 — account-synced progress** (rides on accounts landing) and, *only if
demanded*, the real-canvas-reuse upgrade for full-fidelity lessons.

Be honest: this is a **large, multi-phase feature**. v1 alone is a real chunk
(validator + mini-canvas + 3 lessons + wiring). The mini-canvas is the long pole.

---

## 7. Matrix-lane assignments (for the eventual build — not dispatched now)

> Plan-only: no agents dispatched, no workboard rows claimed. This is the proposed
> partition for when the owner approves a build. Tasks are disjoint and sequenced.

| Task | Lane (agent) | Owns (new files) | Depends on | Mechanic |
|---|---|---|---|---|
| L0 Validator + lesson schema | **Neo** (core-engineer) | `src/core/learning/validate-lesson.js`, `src/core/learning/lesson-schema.js`, tests | — | engine-backed checks (pure) |
| L1 Mini-canvas sandbox | **Switch** (ui-engineer) | `src/ui/learning/sandbox-canvas.js`, `src/ui/learning/runtime.js` (+ CSS) | L0 (schema/validator API) | editing surface + Check button |
| L2 Lesson content (beginner v1) | **Tank** (content) | `src/ui/learning/lessons/*.js`, `src/ui/learning/manifest.js`, lesson tests | L0 (format) | 3 lessons B2/B5/B7 |
| L3 Code/Revit examples (advanced lessons, Phase 3) | **Mouse** (content + connect/Python) | advanced lesson files under `lessons/` | L0, L1, L2 | A2/A3/A5 examples |
| L4 Overlay integration | **Switch** (ui-engineer) | one-line wiring touch in `src/app/app.js` + `src/ui/learning-page.js` entry | L1, L2 | "Interactive lessons" entry |

Lane mapping per NOVA.md §3 / tech-lead mapping table:
- **Switch = ui** (`ui-engineer`) — owns the canvas-sandbox + overlay integration
  (the UI-heavy lane). L4 touches the **hot file** `src/app/app.js` and
  `src/ui/learning-page.js` — single lock, sequence last.
- **Neo = core** (`core-engineer`) — owns the engine hooks: the pure validator that
  drives compute (`createComputeContext`/`computeNodeValue`) and the lesson schema.
- **Tank / Mouse = content** — author lessons (Tank: beginner; Mouse: advanced incl.
  Revit/Python examples), owning only files under `lessons/`.

**Hot-file note:** the only hot-file touch is L4 (`src/app/app.js`,
`src/ui/learning-page.js`); everything else lands in new owned files (ENGINEERING §3
"new file over shared edit"), so L0/L1/L2 parallelize cleanly. The
**per-PR security pass** (ENGINEERING §7) still gates each task — esp. anything that
renders lesson content (treat lesson prose as untrusted → no raw HTML injection;
render as text/markdown-lite) and the localStorage read/write.

**Execution order:** L0 first (defines the contract). Then parallel { L1, L2 }.
Then L4. L3 is Phase 3, after v1 lands.

---

## 8. Security & correctness notes

- **Lesson content is data we ship**, but render it defensively anyway (no
  `innerHTML` of arbitrary lesson strings without escaping) so a future
  account-authored or community lesson can't XSS — same spirit as the static page's
  self-contained, no-external-dependency approach.
- **Custom.Python lessons run user code** in the existing Python runtime; the
  sandbox must reuse the *same* execution path as the real app (no new, looser
  evaluator). No new code-execution surface is introduced by the learning system.
- **Progress in localStorage is best-effort, not a trust boundary** — never gate
  anything security-relevant on it.

---

## 9. Open decisions for the owner

1. **Mini-canvas vs reuse the real canvas (the big one).** Recommendation:
   purpose-built **mini-canvas for v1** (isolated, shippable, off hot files); reuse
   engine 100%; revisit real-canvas reuse only if lessons need full fidelity
   (viewport geometry, properties panel). Confirm or override.
2. **v1 content scope.** Recommendation: **3 beginner lessons** (B2 wiring, B5 lists,
   B7 lacing) to prove all check kinds, then expand. Owner sets the v1 lesson count.
3. **Progress storage.** Recommendation: **localStorage now**, account-sync deferred
   to ride the accounts work (NOVA.md §6). Confirm we don't block on accounts.
4. **Relation to static page.** Recommendation: **extend** — interactive lessons are
   reached *from* Help → Nova Learning; static tour stays as the on-ramp. Confirm.
5. **Validation default.** Recommendation: prefer the **`output` check** (solution-
   agnostic) over rigid `wiring` checks wherever a target value can express the goal,
   so multiple correct solutions pass. Confirm as the authoring default.
6. **Geometry in lessons.** Do beginner geometry lessons (B9/B10) need a live
   embedded viewport, or are inline SVG/screenshots + an output check enough for v1?
   (A live viewport pulls the viewer's coupling into the sandbox — defer if possible.)

---

*End of proposal. No app code, no workboard rows, no merge/push — owner review next.*
