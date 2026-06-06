# T07e — Mini-Canvas: Input.Number Nodes Match Real Nova Canvas

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Branch:** `fix/tick-007-number-nodes`
**Lane:** ui (switch)
**Status:** queued
**Created:** 2026-06-07

---

## Goal

The PM reports that the mini-canvas interactive exercises still do not look like the real
Nova canvas, specifically that `Input.Number` nodes are displayed incorrectly.

On the real Nova canvas, an `Input.Number` node (type `number-input`) renders:
- A header with the icon `#` and title `Number`.
- A node body that contains a **number spinner widget**: an `<input type="number">` showing
  the current value, with up/down spin buttons (`▲`/`▼`) to the right.
- Below the spinner, a **range slider** (`<input type="range">`) synchronized to the number
  input.
- No input ports (it is a source node). One output port: `value`.

The current mini-canvas renders `Input.Number` nodes with only ports and a plain header
— no value display, no spinner, no slider. This makes them look completely different from
the real canvas and confuses learners about what the node does.

---

## Acceptance criteria covered

- **AC-1** — All chapters show an exercise mini-canvas with correctly rendered nodes (re-verification).
- **AC-8** — The mini-canvas renders correctly at 1280×800 — no overflow or clipped content.
- New sub-requirement (PM comment 2026-06-07): `Input.Number` nodes in the mini-canvas
  display the current numeric value visually in the node body, matching the real Nova canvas.

---

## Owned paths

```
src/ui/mini-canvas.js
tests/e2e/learning-interactive.spec.js
```

**Do NOT touch:**
- `src/ui/learning-page.js`
- `src/ui/learning-exercises.js`
- `src/ui/node-renderer.js`
- `style.css`
- Any source file under `src/core/`, `src/nodes/`, `src/viewer/`

---

## What to change in `src/ui/mini-canvas.js`

### 1. Add `Input.Number` value display to node rendering

In the node rendering loop (the `nodes.forEach` block, around line 208), after the header
and before the body ports, detect `Input.Number` nodes and inject a value display:

```js
// Inside the nodes.forEach loop, after `box.appendChild(header)` and before body port loop:
if (node.type === 'Input.Number') {
  const val = node.value !== undefined ? node.value : 0;
  const valueRow = document.createElement('div');
  valueRow.className = 'node-control mini-canvas-number-control';
  valueRow.style.cssText = 'padding:4px 10px 4px 10px;';

  // Number display (read-only to keep mini-canvas simple — no wired input logic needed)
  const numWrap = document.createElement('div');
  numWrap.className = 'num-spin-wrap';
  numWrap.style.cssText = 'position:relative;width:100%';

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.value = val;
  numInput.readOnly = true;   // mini-canvas is display-only; value is fixed at exercise time
  numInput.style.cssText = 'width:100%;padding:3px 20px 3px 8px;font-size:11px;height:24px;' +
    'box-sizing:border-box;background:var(--bg-tertiary);border:1px solid var(--border-color);' +
    'border-radius:4px;cursor:default';
  numInput.addEventListener('click', (e) => e.stopPropagation());

  numWrap.appendChild(numInput);
  valueRow.appendChild(numWrap);

  // Range slider to show the value visually
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = val;
  slider.disabled = true;   // display-only
  slider.style.cssText = 'width:100%;margin-top:4px';
  valueRow.appendChild(slider);

  box.appendChild(valueRow);
}
```

The `node.value` field must be sourced from the exercise definition. Update the exercise
definition format (in `src/ui/learning-exercises.js`) to support an optional `value`
property on `Input.Number` nodes. If absent, default to 0.

### 2. Update exercise node definitions to include `value`

In `src/ui/learning-exercises.js`, every `Input.Number` node in every exercise definition
must have a `value` field. Example:

```js
// Before (missing value):
{ id: 'n1', type: 'Input.Number', x: 60, y: 80 }

// After:
{ id: 'n1', type: 'Input.Number', x: 60, y: 80, value: 3 }
```

The `value` field is already used by the exercise's `accept()` function to compute the
expected result — align the display value with the computation value.

**IMPORTANT:** `src/ui/learning-exercises.js` is outside this task's owned paths. Coordinate
with the core lane or add the `value` field in `mini-canvas.js` by falling back to the
`accept`-computed input values. The safest approach without touching `learning-exercises.js`
is to expose `value` as an optional node property that `mini-canvas.js` reads (if present)
and renders. Exercise definitions already pass through `exercise.nodes` — adding `value`
there is a data-only change and does not modify function signatures.

If the exercises already have value fields (check the file before coding), skip the
`learning-exercises.js` edit entirely.

### 3. Ensure node body height does not overflow at 1280×800 (AC-8)

With the value display added, the node box will be taller. Verify that:
- `.mini-canvas-area` has `overflow: auto` or sufficient height to show all nodes.
- The slider does not push nodes below the mini-canvas viewport boundary.
- If the mini-canvas uses a fixed pixel height in CSS, increase it by ~40px or switch to
  `min-height` + `auto`.

---

## Testing gate

| AC | Coverage |
|---|---|
| Input.Number shows value | E2E: assert `.mini-canvas .node` containing `Input.Number` header has an `input[type=number]` element inside the node body |
| Slider visible | E2E: assert `input[type=range]` inside the same node |
| No overflow at 1280×800 | E2E: set viewport 1280×800, open ch01 exercise, assert `.mini-canvas-area` `scrollHeight <= clientHeight` (or no x/y scroll) |

Add these assertions to `tests/e2e/learning-interactive.spec.js` (extend the existing
ch01 test block, do not add a new spec file).

---

## Merge checklist

- [ ] `Input.Number` mini-canvas nodes show a number input (`<input type="number">`) and
      range slider (`<input type="range">`) in the node body, matching the real Nova canvas
- [ ] The displayed value matches the `node.value` from the exercise definition
- [ ] No overflow at 1280×800 viewport — all nodes visible without scrolling
- [ ] Wire drawing still works correctly after layout change (port dot positions unchanged)
- [ ] E2E spec assertions added and passing
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run test:e2e` → all pass

---

## Interface notes

- `node.value` is an optional numeric field on nodes in `exercise.nodes[]`. Type: `number`.
  Default: `0`. Mini-canvas reads it; exercises provide it.
- Do not add any wiring or event handlers to the number input or slider — they are
  display-only in the mini-canvas. Value editing is not part of the exercise UX.
- The output port (`value`) is still rendered in the node's port row as before.
  The value display widget sits between the header and the port row.

---

## Do NOT

- Do not make the number input interactive (no `oninput` handlers) — mini-canvas inputs
  are fixed for each exercise.
- Do not import from `src/ui/node-renderer.js` — mini-canvas is self-contained.
- Do not change the `createMiniCanvas` public API signature.
- Do not touch `style.css` for this fix — use inline styles or existing CSS classes
  (`.node-control`, `.num-spin-wrap`, `.num-spin-btn` are already defined globally).
