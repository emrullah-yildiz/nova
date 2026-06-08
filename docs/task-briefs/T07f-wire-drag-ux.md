# T07f — Wire drag UX: mousedown-drag-mouseup interaction

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** ui (switch)
**Branch:** `fix/tick-007-wire-drag-ux`
**Status:** queued
**Covers ACs:** AC-2, AC-10
**Parallel with:** T07g (no shared files)

---

## Goal

Replace the current "click output port to start, click input port to finish" wire-drawing interaction in the mini-canvas with standard DAG editor drag UX:

- **mousedown** on an output port dot → begins the pending wire (wire follows cursor)
- **mousemove** anywhere → pending wire tracks cursor
- **mouseup** on a compatible input port dot → wire connects and is drawn permanently
- **mouseup** anywhere else (empty space, incompatible port, same side) → pending wire is cancelled; no partial connection remains

This matches the UX the user already knows from tools like Blender, Unreal, and the main Nova canvas. The current click-click pattern was acceptable as an MVP but the PM has explicitly requested drag-and-drop wiring.

---

## Owned paths

- `src/ui/mini-canvas.js`
- `tests/e2e/learning-interactive.spec.js`

## Do NOT touch

- `src/ui/learning-exercises.js` — exercise content is owned by T07g
- `src/ui/learning-page.js`
- `src/core/**`
- `scripts/take-learning-shots.js`
- Any file not listed in "Owned paths"

---

## Current behavior (to replace)

In `src/ui/mini-canvas.js`, the wire-drawing state machine works like this:

1. `_onPortClick(portEl, nodeId, portName, portType, side)` is called on `click` events on port dots.
2. If no `pendingWire` exists and the port is an output: set `pendingWire = { fromNode, fromPort, portType }` and show the pending SVG line.
3. If a `pendingWire` exists and the port is a compatible input: call `_connectWire()` to finalise.
4. `_onDocMouseMove` updates the pending SVG line endpoint to the cursor position.
5. Clicking empty canvas area calls `_cancelPending()`.

## Required behavior (new)

Replace the click state machine with a drag state machine:

1. **`mousedown` on a port dot:**
   - If the port is an output port: begin dragging. Set `_dragging = true`, store `pendingWire = { fromNode, fromPort, portType }`, show the pending SVG line starting at the port dot center.
   - If the port is an input port: do nothing on mousedown (input ports cannot initiate wires).
   - Prevent the default browser drag behavior (`event.preventDefault()`).

2. **`mousemove` on the document while `_dragging` is true:**
   - Update the pending SVG line endpoint to the current cursor position (already done by `_onDocMouseMove` — keep this logic).
   - Optionally: highlight input port dots that are compatible with `pendingWire.portType` to guide the user.

3. **`mouseup` on the document while `_dragging` is true:**
   - Determine whether the mouseup target is (or is inside) a port dot.
   - If yes and the port is a compatible input port: call `_connectWire()` to finalise.
   - In all other cases: call `_cancelPending()`.
   - Always set `_dragging = false` and clear highlights.

### Event wiring notes

- Add `mousedown` listener to each port dot in `_renderNode()` (replace or supplement the `click` listener).
- Add `mousemove` listener to `document` (already exists for `_onDocMouseMove`; keep it, just ensure it only runs when `_dragging` is true).
- Add `mouseup` listener to `document` (add new; fires after any mousedown anywhere on the page).
- The `mouseup` handler on the document must correctly resolve the target to a port dot. Use `event.target.closest('[data-port]')` or the existing port dot selector. Ensure event bubbling is not broken by `stopPropagation` calls.
- Remove the `click`-based port handler (or demote it to a no-op guard) so that old click behavior does not interfere.

### Cancellation on Escape

Pressing `Escape` while dragging should also cancel the pending wire. Add a `keydown` listener that calls `_cancelPending()` when `event.key === 'Escape'` and `_dragging` is true.

---

## E2E spec update

`tests/e2e/learning-interactive.spec.js` currently uses:

```js
await portEl.click(); // start wire
await targetPortEl.click(); // end wire
```

Replace these with drag gestures using Playwright's `mouse.move` + `mouse.down` + `mouse.up`:

```js
const fromBox = await outputPortEl.boundingBox();
const toBox   = await inputPortEl.boundingBox();
const fromX = fromBox.x + fromBox.width / 2;
const fromY = fromBox.y + fromBox.height / 2;
const toX   = toBox.x + toBox.width / 2;
const toY   = toBox.y + toBox.height / 2;

await page.mouse.move(fromX, fromY);
await page.mouse.down();
await page.mouse.move(toX, toY, { steps: 10 });
await page.mouse.up();
```

Update every test that draws a wire to use this drag pattern. Do not change the assertions — only the interaction method changes.

---

## Implementation steps

1. Read `src/ui/mini-canvas.js` in full. Identify `_onPortClick`, `_onDocMouseMove`, `_cancelPending`, `_connectWire`, `_renderNode`.
2. Add a `_dragging` boolean field (initialize to `false`).
3. In `_renderNode()`: replace the `click` listener on port dots with a `mousedown` listener. The mousedown handler initiates drag only for output ports.
4. In `_onDocMouseMove`: guard with `if (!_dragging) return;`.
5. Add a `document` `mouseup` handler: resolve target port → connect or cancel.
6. Add a `document` `keydown` handler: Escape → cancel.
7. Remove old click-based port initiation logic (or disable it with a guard).
8. Update `tests/e2e/learning-interactive.spec.js`: replace all wire-drawing `.click()` pairs with `mouse.move + mouse.down + mouse.move + mouse.up` gestures.
9. Run `npm run lint:all && npm run test && npm run test:e2e`. All must pass.

---

## Interface/contract

This task touches only `src/ui/mini-canvas.js`. The external API (the `createMiniCanvas(container, exerciseDef, onSolve)` function signature and the `onSolve` callback) must remain identical. T07g's exercise definitions are consumed as-is — T07f must not change the `exercises` array schema.

---

## Testing gate

- **AC-2:** Manual browser test — mousedown on output port dot, drag cursor across canvas, release on input port dot → wire appears. Release on empty space → no wire.
- **AC-10:** E2E spec `learning-interactive.spec.js` — all tests pass using drag interaction. The spec that draws ch01's wire must use mouse drag, not click.
- **AC-3** (no regression): clicking an incompatible port type (mousedown + mouseup on incompatible input) still does nothing.

---

## Merge checklist

- [ ] AC-2 verified: drag-and-release connects a wire; release on empty space cancels without partial wire
- [ ] AC-3 verified: incompatible port drag does nothing
- [ ] AC-10 verified: E2E spec uses drag gestures and all tests pass
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run test:e2e` → all learning-interactive specs pass
- [ ] `npm run build` → green
- [ ] Workboard row released; TICK-007.md AC-2, AC-10 checked [x]
