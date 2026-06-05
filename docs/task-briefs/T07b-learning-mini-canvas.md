# T07b — Learning exercises: mini-canvas UI component

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** ui (agent: switch)
**Branch:** `feat/learning-exercises`
**Status:** queued
**Dependency:** T07a must be merged to `feat/learning-exercises` before this task starts (T07b imports from `src/ui/learning-exercises.js`).

---

## Goal

Build the interactive mini-canvas exercise component and integrate it into the existing learning overlay. Each of the 10 chapters gets an exercise section below the existing quiz, rendered using the exercise definitions from `src/ui/learning-exercises.js`. The component handles wire drawing, submission, and pass/fail feedback entirely in isolation — no global app state mutation.

---

## Owned paths

```
src/ui/learning-page.js     (MODIFY — integrate mini-canvas into each chapter section)
src/ui/mini-canvas.js       (CREATE — self-contained mini-canvas component)
style.css                   (MODIFY — mini-canvas styles only; minimal additions)
```

**Do NOT touch:**
- `src/ui/learning-exercises.js` — owned by T07a; read-only for this task
- `src/app/app.js` — hot file; must not import from it or mutate `window.app`
- `src/core/node-library.js` — hot file; do not register new node types
- `src/viewer/**` — do not touch the 3D viewer
- `tests/e2e/**` — owned by T07c
- `src/ui/node-renderer.js` — hot file; do not touch

---

## Interface contract (read T07a brief for full shape)

Import from `src/ui/learning-exercises.js`:

```js
import { exercises } from './learning-exercises.js';
// exercises[i].nodes, exercises[i].preDrawnWires, exercises[i].accept
```

The mini-canvas receives one exercise object and calls `onSolve(passed: boolean, message: string)` when the user submits.

The `accept(graphState)` function is the acceptance gate — call it on submit with the current wire state:

```js
const graphState = {
  nodes: exercise.nodes,               // same node list (inputs may have been updated by pre-drawn wires)
  wires: [...exercise.preDrawnWires, ...userDrawnWires]
};
const passed = exercise.accept(graphState);
```

---

## Component specification

### `src/ui/mini-canvas.js`

Exports a single factory function or class:

```js
export function createMiniCanvas(containerEl, exercise, { onSolve }) { ... }
```

- Renders into `containerEl` (a `<div>` provided by `learning-page.js`).
- Does not touch `document.body` or any element outside `containerEl`.
- Does not read or write `window.app`, `window.nova`, or any other global.

#### Port rendering

- Each node is rendered as a labelled box at the `x`, `y` position from `exercise.nodes[i]`.
- Input ports are rendered on the left edge; output ports on the right edge.
- Pre-drawn wires (from `exercise.preDrawnWires`) are rendered as SVG `<line>` or `<path>` elements connecting the appropriate ports.
- Unwired input ports are visually distinct (e.g., hollow circle) to signal they are connectable.

#### Wire drawing interaction

- Click an output port: starts a pending wire. The port is highlighted.
- Click a compatible input port: wire is drawn and added to `userDrawnWires`.
- "Compatible" means the output port's type matches the input port's type, OR either is type `any`. Use the node definition's port `type` field.
- Click an incompatible input port (type mismatch): nothing happens (no-op). No partial wire is left dangling.
- Click anywhere else (canvas background or a node label): cancels the pending wire.
- A port that already has a wire connected may be clicked to replace the wire (remove old, start new pending).

#### Submit button

- A "Submit" button is rendered below the canvas.
- On click: build `graphState`, call `exercise.accept(graphState)`, then call `onSolve(passed, message)`.
- If `passed` is `true`: show a green success banner inside `containerEl` with text "Correct! Well done." The "Next chapter" button in the learning overlay must become enabled (communicate via `onSolve` callback — do not directly manipulate the Next button DOM outside `containerEl`).
- If `passed` is `false`: show a red feedback banner with text "Not quite — check your connections and try again." The Submit button remains active.

#### Viewport constraint

At 1280×800 viewport:
- The mini-canvas must not overflow the learning overlay container.
- All node boxes and ports must be visible — no clipping.
- The canvas area should be a fixed height (e.g., 300px) and full-width within the overlay column.

---

## Integration in `src/ui/learning-page.js`

1. For each chapter section (ch01–ch10), add an exercise container `<div>` after the existing quiz section.
2. Call `createMiniCanvas(div, exercises[i], { onSolve })` on each chapter's container when the chapter is activated (not all at once on page load — lazy-initialize to avoid memory pressure).
3. The `onSolve` callback:
   - If `passed`: enable the "Next chapter" navigation button for the current chapter.
   - Always: do nothing outside the chapter's own DOM subtree.

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-1 | 10 chapters display an exercise section with mini-canvas |
| AC-2 | Wire drawing: click output → click compatible input → wire appears |
| AC-3 | Incompatible port click: no-op |
| AC-4 | Correct submission → green success message + Next button enabled |
| AC-5 | Incorrect submission → red feedback message; resubmit possible |
| AC-8 | Mini-canvas renders at 1280×800 without overflow or clipped ports |
| AC-9 | Component does not import from `src/app/app.js` or mutate `window.app` |

AC-6 and AC-7 are covered by T07a. AC-10 is covered by T07c.

---

## Testing gate

- Manual browser: AC-1, AC-2, AC-3, AC-4, AC-5, AC-8 — test all 10 chapters.
- No new Vitest unit test required from this task (the acceptance functions are tested in T07a).
- E2E coverage for AC-10 is provided by T07c — do not write a Playwright spec here.

Post-implementation self-check before marking tasks done:

```bash
npm run lint:all
npm run test
npm run build
```

All must pass.

---

## Merge checklist

- [ ] AC-1 verified: manual browser — all 10 chapters show an exercise section with mini-canvas
- [ ] AC-2 verified: manual browser — wire drawing works; wire appears connecting two compatible ports
- [ ] AC-3 verified: manual browser — incompatible port click does nothing
- [ ] AC-4 verified: manual browser — correct solution → green banner + Next button enabled
- [ ] AC-5 verified: manual browser — wrong solution → red banner; resubmit works
- [ ] AC-8 verified: manual browser at 1280×800 — no overflow, all ports visible
- [ ] AC-9 verified: `grep -r "app\.js\|window\.app" src/ui/mini-canvas.js src/ui/learning-page.js` returns 0 results
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] `npm run build` — succeeds
- [ ] Workboard row released on merge (T07c may proceed after this merges)

---

## Notes

- Use SVG for wire rendering (not Canvas 2D) — SVG integrates cleanly with the DOM port elements and is easier to position precisely.
- The mini-canvas is not a miniature version of the full viewer — it is a purpose-built DOM/SVG component. Do not import from `src/viewer/`.
- Keep style additions to `style.css` minimal and scoped (e.g., `.mini-canvas`, `.mini-canvas-node`, `.mini-canvas-wire`). Do not touch existing rule sets.
- `style.css` is not listed as a hot file, but it is shared. Make additions only — do not remove or rename any existing rule.
- The learning overlay's "Next chapter" button must already exist in the DOM before T07b's `onSolve` can enable it. If it does not exist, add it in `learning-page.js` (owned by this task).
