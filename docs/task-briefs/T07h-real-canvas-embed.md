# T07h — Real canvas embed: pan/zoom + real Nova node rendering

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** ui (switch)
**Branch:** `fix/tick-007-real-canvas-embed`
**Status:** queued
**Covers ACs:** AC-2, AC-8, AC-10, AC-11, AC-12
**Supersedes:** T07f (wire drag UX) and T07g (unique exercises) — this task
delivers all three PM directives in one cohesive change:
(a) pan/zoom on the exercise canvas,
(b) real Nova node visual rendering,
(c) real compute with the real engine (already done; keep it).

---

## Goal

The PM's three directives for TICK-007 are:

1. "Make sure that the interactive canvas is like the Nova canvas where you can
   pan and move around. I need a web view there like Nova canvas."
   → Add **pan and zoom** to the mini-canvas container in `src/ui/mini-canvas.js`.

2. "Make sure that the interactive examples contain real nodes not representatives."
   → Nodes must use **exactly the same CSS classes and layout** as the main Nova
   canvas: `.node`, `.node-header`, `.node-header-icon`, `.node-header-title`,
   `.node-body`, `.node-port`, `.port-dot`, `.num-spin-wrap` etc. The current
   mini-canvas already uses these classes, but the node width (hard-coded 140px)
   and some visual details may diverge from the real node-renderer output.
   Reconcile any remaining visual differences so nodes look identical to the main
   canvas at the same zoom level.

3. The wire drag UX (mousedown-drag-mouseup) from T07f is already implemented in
   the current `mini-canvas.js` (the drag state machine is present — check the
   code before making any changes). If it is already there, do NOT rewrite it.
   If it is partially missing, complete it.

**What this task does NOT do:** it does not replace the mini-canvas with a full
second Nova app instance. The `app.js` singleton is a monolithic single-app
system. "Real canvas" means the mini-canvas visually matches and behaviourally
matches — same pan/zoom, same node appearance, same compute — not a second `app`
instance.

---

## Owned paths

- `src/ui/mini-canvas.js`
- `tests/e2e/learning-interactive.spec.js`

## Do NOT touch

- `src/ui/learning-page.js`
- `src/ui/learning-exercises.js`
- `src/core/**`
- `src/app/app.js`
- `src/ui/node-renderer.js`
- `scripts/take-learning-shots.js`
- Any file not in "Owned paths"

---

## Architecture note — why not a second app instance

The Nova canvas is `app.js` + `node-renderer.js` + `port-handler.js` wired to a
single `#canvas-area` DOM element. There is no factory function for creating a
second independent canvas — everything is a singleton referencing `window.app`.

The mini-canvas is the right architectural choice for an embedded exercise widget:
it is self-contained (`src/ui/mini-canvas.js`), uses the real compute engine
(`createLessonComputeContext`), renders using real Nova CSS, and does not mutate
global app state. The improvements this task brings:

1. Pan/zoom on the canvas area (the main missing piece).
2. Node rendering parity with real nodes (check for remaining visual gaps).
3. Confirmed drag-based wire UX (mousedown → drag → mouseup).

---

## Feature 1 — Pan and zoom

### Current state

The `.mini-canvas-area` div has `position: relative; overflow: visible` and
nodes are positioned with absolute pixel coordinates. There is no transform
applied to the canvas, so the user cannot pan or zoom.

### Required behavior

**Pan:** middle-mouse-button drag (or Space + left-drag) translates the canvas.
The translation is achieved by applying a CSS `transform: translate(X,Y)` to an
inner wrapper that holds all nodes and the SVG overlay.

**Zoom:** scroll wheel scales the canvas. Apply `transform: translate(X,Y) scale(Z)`
to the same inner wrapper. Zoom range: 0.2 – 3.0, step multiplier 0.1 per wheel
click. Zoom towards the cursor position (adjust the translate so the point under
the cursor stays fixed).

### Implementation plan

1. Inside `createMiniCanvas`, wrap the nodes and SVG in a new `<div
   class="mini-canvas-viewport">` (the scrollable / pannable / zoomable layer).
   The outer `.mini-canvas-area` remains the clipping/sizing container.

2. Track `{ panX, panY, zoom }` state variables (initialize to 0, 0, 1).

3. Apply the transform after any pan/zoom event:
   ```js
   viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
   viewport.style.transformOrigin = '0 0';
   ```

4. **Middle-mouse pan:**
   - `mousedown` on the `.mini-canvas-area` with `e.button === 1` (middle) OR
     `mousedown` on `.mini-canvas-area` when `e.spaceKey` is held → set
     `_panning = true`, record `panStartX / panStartY`.
   - `mousemove` on document: if `_panning`, update `panX/panY`.
   - `mouseup` on document: set `_panning = false`.
   - Prevent default on the middle-mouse-down to suppress browser autoscroll.

   Space+drag alternative (for trackpad/laptop users):
   - `keydown` on document when `e.code === 'Space'` and the mini-canvas has
     focus: set `_spacePan = true`.
   - `keyup` when Space released: set `_spacePan = false`.
   - In the `mousedown` handler: if `_spacePan` and `e.button === 0`, start pan.

5. **Scroll wheel zoom:**
   - `wheel` on `.mini-canvas-area`:
     ```js
     const delta = e.deltaY > 0 ? 0.9 : 1.1;
     const newZoom = Math.max(0.2, Math.min(3.0, zoom * delta));
     // Keep the cursor point fixed:
     const rect = canvasEl.getBoundingClientRect();
     const cursorX = e.clientX - rect.left;
     const cursorY = e.clientY - rect.top;
     panX = cursorX - (cursorX - panX) * (newZoom / zoom);
     panY = cursorY - (cursorY - panY) * (newZoom / zoom);
     zoom = newZoom;
     _applyTransform();
     e.preventDefault();
     ```

6. **Wire coordinate adjustment:** the `_dotCenter(dotEl)` function currently
   reads `getBoundingClientRect()` relative to the SVG element. This works as
   long as the SVG is inside the same transformed layer as the nodes. Ensure the
   SVG is inside `.mini-canvas-viewport` so it shares the same coordinate space.
   If the SVG is positioned inside the viewport layer, the bezier path coordinates
   remain correct without any zoom/pan adjustment.

7. **Pending wire cursor tracking:** the `_onDocMouseMove` handler currently
   computes cursor position relative to the SVG bounding rect:
   ```js
   const sr = svg.getBoundingClientRect();
   const to = { x: e.clientX - sr.left, y: e.clientY - sr.top };
   ```
   Since the SVG is inside the transformed viewport, this calculation naturally
   gives coordinates in the SVG's own space (which is the same as the nodes'
   space). No changes required here — just verify it still works after introducing
   the viewport wrapper.

---

## Feature 2 — Node rendering parity

### Current state

`mini-canvas.js` renders each node with:
- `box.className = 'node mini-canvas-node'` ✓
- Node header with `.node-header`, `.node-header-icon`, `.node-header-title` ✓
- `.node-body` with `.node-port.input / .node-port.output`, `.port-dot`, `.port-label` ✓
- For `Input.Number`: `.num-spin-wrap` with `<input type="number">` and spin buttons ✓
- Node width hard-coded to 140px — check if this matches real node width

### Checks to perform

1. Open the main Nova canvas in the browser. Inspect a real `Input.Number` node.
   Record its width, header height, body padding, port dot size, and font sizes.
2. Compare to the mini-canvas rendered version. Adjust any CSS inline styles on
   the mini-canvas node box to match.
3. If the real node has `--node-color` driving the header border, the mini-canvas
   already sets `box.style.setProperty('--node-color', meta.color)` — confirm
   this resolves correctly.
4. Add missing node types to `PORT_SCHEMA` and `NODE_META` in `mini-canvas.js`
   if any exercises use node types not currently covered. Check
   `src/ui/learning-exercises.js` for the full list of node types used across
   all 10 exercises:
   - `Input.Number`, `Input.Slider`, `Input.Integer`, `Input.Text`
   - `Math.Add`, `Math.Subtract`, `Math.Multiply`, `Math.Divide`, `Math.Power`,
     `Math.Round`, `Math.Modulo`, `Math.Clamp`
   - `Output.Watch`
   - `List.Range`, `List.First`, `List.Sum`, `List.Count`, `List.Sequence`
   - `Point.ByCoordinates`, `Point.Y`

   For any type missing from `PORT_SCHEMA`, add the correct input/output port
   definitions by reading the node definition in `src/nodes/categories/` or
   `src/core/nodes.js`. Do not guess port names — read the source.

5. Add any missing entries to `NODE_META` (icon + color). Icons must be Unicode
   glyphs/symbols, never text abbreviations (per STYLE.md and RULES.md node
   standards). Correct icons for missing types:
   - `Math.Modulo`: `%`
   - `Math.Clamp`: `⊂`
   - `Input.Slider`: `⇔`
   - `List.First`: `⊣`
   - `Point.Y`: `Y` (acceptable as single letter since it is a coordinate axis label)

---

## Feature 3 — Wire drag UX (verify / complete)

Read the current `src/ui/mini-canvas.js` before making any changes. The drag
state machine (mousedown → _startPending → document mousemove → document mouseup
→ _completeWire / _cancelPending) was implemented in T07f. If it is present and
correct, do not touch it.

If it is absent or incomplete, implement it per the T07f brief:

- `mousedown` on output port dot → `_startPending(dotEl)`, `_dragging = true`,
  `e.preventDefault()`.
- Document `mousemove` guard: `if (!_dragging) return`.
- Document `mouseup`: if target is a compatible input port dot → `_completeWire`,
  else → `_cancelPending`.
- `Escape` keydown when `_dragging` → `_cancelPending`.

---

## E2E spec update

`tests/e2e/learning-interactive.spec.js` must:

1. Use drag interaction (not click-click) for drawing wires:
   ```js
   const fromBox = await page.locator('[data-node-id="n1"][data-port-role="output"]').boundingBox();
   const toBox   = await page.locator('[data-node-id="n3"][data-port-role="input"][data-port-name="b"]').boundingBox();
   await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
   await page.mouse.down();
   await page.mouse.move(toBox.x + toBox.width / 2,   toBox.y + toBox.height / 2, { steps: 10 });
   await page.mouse.up();
   ```

2. Add a test that verifies pan/zoom works:
   - Find the mini-canvas container.
   - Scroll wheel over it (mouse.wheel) and confirm the viewport transform changes.
   - Or simply assert that the `.mini-canvas-viewport` element exists and has a
     `transform` style attribute after scroll.

3. All existing assertions (green success banner, Next button enabled) must still
   pass.

---

## Implementation steps

1. Read `src/ui/mini-canvas.js` in full.
2. Verify the drag wire UX is present. Note any gaps.
3. Add the viewport wrapper (`<div class="mini-canvas-viewport">`) inside
   `.mini-canvas-area`. Move node creation and SVG into this wrapper.
4. Add pan state variables and the middle-mouse / Space+drag pan handlers.
5. Add wheel zoom handler. Apply transform after every pan/zoom change.
6. Verify `_dotCenter` and pending wire cursor tracking still work correctly
   after the viewport wrapper is introduced.
7. Audit `PORT_SCHEMA` and `NODE_META` for missing node types. Add any that are
   used in `learning-exercises.js` but absent from the schema.
8. Check node visual parity with the real canvas. Adjust inline styles if needed.
9. Update `tests/e2e/learning-interactive.spec.js`:
   - Replace any click-click wire interactions with drag gestures.
   - Add pan/zoom test (scroll wheel → transform applied).
10. Run: `npm run lint:all && npm run test && npm run test:e2e`
    All must pass.

---

## Interface/contract

The public API of `createMiniCanvas(containerEl, exercise, { onSolve })` must
remain identical. Exercise definitions in `src/ui/learning-exercises.js` are not
changed by this task. The `onSolve(passed, message)` callback contract is
unchanged.

---

## Testing gate

- **AC-2:** Manual test — mousedown on output port dot, drag across canvas,
  release on compatible input port → wire connects. Release on empty space → no
  wire. This should already pass if T07f wire drag is present; re-verify.
- **AC-8:** At 1280×800 viewport, the mini-canvas renders within the overlay
  with no overflow. Nodes are not clipped. Ports are visible and interactive.
- **AC-10:** E2E spec passes with drag gesture interactions. Scroll wheel zoom
  test passes.
- **AC-11/AC-12:** Confirm `src/ui/learning-exercises.js` exercises use domain-
  appropriate node types for each chapter (read the file — this was addressed in
  T07g; do not regress it). If T07g's PORT_SCHEMA additions are not yet in
  `mini-canvas.js`, add them now.

---

## Merge checklist

- [ ] AC-2 verified: drag-and-release connects a wire; release on empty space cancels
- [ ] AC-8 verified: no overflow at 1280×800; all ports visible and interactive
- [ ] AC-10 verified: E2E spec passes with drag gestures; scroll/pan test passes
- [ ] Pan works: middle-mouse drag (or Space+drag) translates the canvas nodes
- [ ] Zoom works: scroll wheel scales the canvas toward the cursor position
- [ ] All node types used in exercises are in PORT_SCHEMA + NODE_META
- [ ] Node visual appearance matches real Nova canvas nodes
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass (including AC-7 unit tests in learning-exercises)
- [ ] `npm run test:e2e` → all learning-interactive specs pass
- [ ] `npm run build` → green
- [ ] Workboard row released; INDEX.md updated; TICK-007.md AC-2, AC-8, AC-10 checked [x]
