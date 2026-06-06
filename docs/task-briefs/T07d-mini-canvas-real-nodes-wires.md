# T07d — Fix mini-canvas: real Nova node visuals + working wire tracking

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/tick-007-mini-canvas-real-nodes`
**Status:** queued
**Dependency:** none — independent branch off develop

---

## Goal

The PM reports two failures in the mini-canvas exercise component:

1. **Nodes do not look like real Nova canvas nodes.** Despite using `.node`, `.node-header`, `.node-port`, `.port-dot` CSS classes, the nodes in the mini-canvas appear visually different from the main Nova canvas (wrong sizing, wrong colors, missing border-top accent, or wrong layout).

2. **The pending wire does not follow the cursor.** After clicking an output port to start drawing a wire, the wire stays fixed or disappears rather than tracking the mouse cursor to the target input port.

This task diagnoses the exact cause of each failure and fixes both in `src/ui/mini-canvas.js` (and `style.css` if CSS is at fault).

---

## Owned paths

```
src/ui/mini-canvas.js              (fix wire tracking and node visual issues)
style.css                          (fix mini-canvas-specific CSS if needed — .mini-canvas-area,
                                    .mini-canvas-node overrides; do NOT change main .node styles)
tests/e2e/learning-interactive.spec.js   (update/fix E2E wire-drawing assertions to match fixed behavior)
```

**Do NOT touch:**
- `src/ui/learning-page.js` — exercise integration is already done; don't re-integrate
- `src/ui/learning-exercises.js` — exercise definitions are not the problem
- `src/ui/node-renderer.js` — do not touch the main canvas renderer
- `src/viewer/**`, `src/core/**`, `src/app/app.js`, `worker/**`, `api/**`
- Any file not listed above

---

## Diagnosis guide — do this before writing any code

### Issue 1: Nodes don't look like real Nova nodes

Open the app in the browser. Open the learning overlay. Inspect the mini-canvas nodes with browser DevTools:

**Check A:** Do the mini-canvas nodes use the same CSS classes as main canvas nodes?
- Main canvas node structure: `div.node > div.node-header > (icon + title)`, `div.node > div.node-body > div.node-port-row > div.node-port.input + div.node-port.output`
- Mini-canvas node structure: same — check that `box.className = 'node mini-canvas-node'` and the child divs match exactly.

**Check B:** Is `--node-color` CSS variable being applied?
- The `.node` class uses `border-top: 3px solid var(--node-color)` (per STYLE.md / the main canvas CSS). If `--node-color` is not set or overridden in the mini-canvas context, the accent color bar won't appear.
- Fix: ensure `box.style.setProperty('--node-color', meta.color)` instead of `style.cssText` template (which may not set CSS variables correctly in all browsers).

**Check C:** Is `.mini-canvas-node { position: absolute }` conflicting with the `.node` base class?
- If `.node` in the main CSS uses `position: relative` (to position port dots), and `.mini-canvas-node` overrides to `absolute`, the port dot positions may be inside the node but computed relative to the wrong parent.
- Fix: separate the positioning from the visual class — use `box.style.position = 'absolute'` and keep `box.className = 'node mini-canvas-node'` for visuals only.

**Check D:** Node width.
- Main canvas nodes are sized by content. The mini-canvas forces `width: 140px`. If the main canvas `.node` uses `min-width` or a grid layout, the 140px may clip content. Check and adjust.

**Expected result after fix:** Mini-canvas nodes look pixel-identical to a Nova node on the main canvas (same font, same port dot size and color, same border-top accent color, same header icon badge style, same body row layout).

---

### Issue 2: Pending wire does not follow the cursor

The current `_onDocMouseMove` handler is:

```js
function _onDocMouseMove(e) {
  if (!pendingWire) return;
  const fromDot = portEls.get(`${pendingWire.nodeId}:output:${pendingWire.portId}`);
  if (!fromDot) return;
  const from = _dotCenter(fromDot);
  const cr = canvasEl.getBoundingClientRect();
  const to = {
    x: e.clientX - cr.left + canvasEl.scrollLeft,
    y: e.clientY - cr.top  + canvasEl.scrollTop
  };
  pendingLine.setAttribute('d', _bezierPath(from, to));
}
```

**Potential failure modes to check:**

**A. `pendingLine.style.display` is never set to visible (`''`)?**
Search `_startPending` — it sets `pendingLine.style.display = ''`. Check that this line is not being overridden elsewhere (e.g., `_cancelPending` might fire immediately after `_startPending` if the click event bubbles to the canvas's `click` handler).

**Likely root cause:** The canvas `click` handler calls `_cancelPending()` when clicking on a non-dot element. If the output port dot click event ALSO bubbles up to the canvas `click` handler (before or after the dot's own `click` triggers `_startPending`), `_cancelPending` runs after `_startPending` and immediately hides the pending line. The fix: `e.stopPropagation()` in the output port click path — which IS present in the current code (`e.stopPropagation()` after `_startPending`). But the `_startPending` is called from `canvasEl.addEventListener('click', ...)` via the `dotEl` close check — so propagation is not the issue here.

**B. The SVG `pendingLine` is behind the canvas div?**
The SVG has `z-index: 1` and `pointer-events: none`. The canvas area is `position: relative`. If `.mini-canvas-area` is not `position: relative` or the SVG's `overflow: visible` is clipped by a parent with `overflow: hidden`, the wire SVG path renders outside the visible area.

Check in DevTools: does the SVG element exist in the DOM while a wire is pending? Does it have a `d` attribute being updated on mousemove? If yes, the handler is firing but the output is invisible. The fix: ensure `.mini-canvas-area { overflow: visible }` or increase the SVG canvas size.

**C. `_dotCenter` returns wrong coordinates?**
If the mini-canvas container is inside a modal/overlay with `transform: translateX(-50%)` or `scale`, `getBoundingClientRect()` returns viewport-relative coordinates. Subtracting `canvasEl.getBoundingClientRect().left/top` should cancel out the transform. But if the overlay has `position: fixed` and the `canvasEl` is inside it, `scrollLeft/scrollTop` on `canvasEl` may be 0 (no scroll inside the mini-canvas) making those additions harmless.

**Test:** Add `console.log('from', from, 'to', to)` to `_onDocMouseMove`. Check if `from` and `to` are reasonable pixel values. If `from` is `{x: NaN, y: NaN}`, `_dotCenter` is returning NaN — that means `getBoundingClientRect()` on the dot is returning zeros (dot is not rendered / not in the DOM). If `from` is a good value but `to` is wildly off, the `canvasEl` rect is wrong.

**Fix for wire tracking (most robust approach):**
Replace the canvas-relative calculation with viewport-relative coordinates for the SVG, and use a `viewBox` that maps to the canvas coordinate space:

```js
// In _onDocMouseMove:
const svgRect = svg.getBoundingClientRect();
const to = {
  x: e.clientX - svgRect.left,
  y: e.clientY - svgRect.top
};
// Also update _dotCenter to use svgRect:
function _dotCenter(dotEl) {
  const dr = dotEl.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  return { x: dr.left - sr.left + dr.width / 2, y: dr.top - sr.top + dr.height / 2 };
}
```

This makes all coordinates relative to the SVG element's bounding box, which is the most reliable approach regardless of scroll or transform on ancestor elements. Both `from` and `to` are now in the same coordinate space as the SVG's `d` attribute values.

---

## Fix specification

### Step 1: Fix `_dotCenter` to be SVG-relative

Replace all uses of `canvasEl.getBoundingClientRect()` as the reference frame in `_dotCenter` and `_onDocMouseMove` with `svg.getBoundingClientRect()`. This ensures wire start-points, end-points, and the cursor position are all measured relative to the same element (the SVG).

```js
function _dotCenter(dotEl) {
  const dr = dotEl.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  return {
    x: dr.left - sr.left + dr.width / 2,
    y: dr.top  - sr.top  + dr.height / 2
  };
}

function _onDocMouseMove(e) {
  if (!pendingWire) return;
  const fromDot = portEls.get(`${pendingWire.nodeId}:output:${pendingWire.portId}`);
  if (!fromDot) return;
  const from = _dotCenter(fromDot);
  const sr = svg.getBoundingClientRect();
  const to = { x: e.clientX - sr.left, y: e.clientY - sr.top };
  pendingLine.style.display = '';
  pendingLine.setAttribute('d', _bezierPath(from, to));
}
```

### Step 2: Fix node CSS variable application

Replace:
```js
box.style.cssText = `left:${node.x}px;top:${node.y}px;--node-color:${meta.color};width:140px;position:absolute;cursor:default`;
```
With:
```js
box.style.position = 'absolute';
box.style.left = `${node.x}px`;
box.style.top  = `${node.y}px`;
box.style.width = '140px';
box.style.cursor = 'default';
box.style.setProperty('--node-color', meta.color);
```

The `style.cssText` assignment treats `--node-color` as a regular property which some browsers don't set correctly. `setProperty` is the correct API for custom properties.

### Step 3: Ensure `.mini-canvas-area` does not clip the SVG

In `style.css`, add or ensure:

```css
.mini-canvas-area {
  position: relative;
  overflow: visible;   /* allow SVG wires to extend beyond the node area */
}
```

And confirm `svg` inside it has `overflow: visible` (already set in JS as `svg.style.overflow = 'visible'` — verify this is not overridden by a CSS rule targeting `svg`).

### Step 4: Fix the pending line display toggle

In `_startPending`, after setting `pendingLine.setAttribute('d', ...)`, explicitly ensure the line is visible:
```js
pendingLine.style.display = '';
pendingLine.removeAttribute('display');  // clear any SVG-level display=none
```

In `_cancelPending`, use:
```js
pendingLine.style.display = 'none';
```

(Already done, but confirm `pendingLine.setAttribute('display', 'none')` is NOT used anywhere — mixing SVG attribute `display` with CSS `style.display` can cause conflicts.)

---

## What "real Nova nodes" means visually

After this fix, each mini-canvas node must:
- Have a colored 3px top border (the node's category accent color, from `--node-color`)
- Have a dark background matching the Nova dark theme (`#1e1e2e` or similar from the `.node` CSS)
- Show the same icon badge in the header (colored circle with icon glyph)
- Show port rows with port dots on the left (inputs) and right (outputs) of the body
- Port dots must use the correct color per port type (number=blue, list=orange, point=blue, any=grey)

These are all driven by the existing Nova CSS classes — the fix is ensuring the classes apply correctly in the overlay context.

---

## Testing gate

- Manual browser: Open learning overlay → Chapter 1 → mini-canvas. Confirm:
  - Nodes have colored top border and dark background matching the main canvas.
  - Click an output port dot → a dashed bezier wire appears and follows the cursor as you move the mouse.
  - Click a compatible input port → the wire snaps and becomes a solid colored wire.
  - Submit with correct wiring → green success message.
- E2E (Playwright): Existing `tests/e2e/learning-interactive.spec.js` tests should pass. Update any test that relied on the broken behavior. Specifically ensure the "draw wire → submit" flow passes.
- `npm run lint:all && npm run test && npm run test:e2e` — all pass.

---

## Merge checklist

- [ ] Node visual: mini-canvas nodes have colored top border matching the category accent color
- [ ] Node visual: nodes use dark background and same font/layout as main canvas nodes
- [ ] Wire tracking: after clicking an output port, a dashed bezier wire visibly follows the cursor across the mini-canvas and beyond
- [ ] Wire landing: clicking a compatible input port completes the wire (solid colored bezier)
- [ ] Wire type mismatch: clicking an incompatible port does nothing (no wire drawn)
- [ ] `tests/e2e/learning-interactive.spec.js` passes with no test modifications that weaken assertions
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] `npm run test:e2e` — all pass
- [ ] TICK-007 AC-2 checkbox updated with branch reference and date
- [ ] Workboard row released on merge

---

## Notes

- The mini-canvas component is in `src/ui/mini-canvas.js` — a self-contained module. Do not modify `src/ui/learning-page.js` unless the integration call site needs a fix.
- The SVG-relative coordinate approach (using `svg.getBoundingClientRect()` as the reference) is robust to all overlay positioning scenarios (fixed, absolute, transformed). Use it.
- Do NOT add drag support — the PM spec says click-to-start, click-to-end. Keep it as is.
- If the DevTools inspection reveals the SVG `d` attribute is being updated correctly but the line is still invisible, check for a parent element with `overflow: hidden` that clips the SVG. Add `overflow: visible` to the parent chain.
