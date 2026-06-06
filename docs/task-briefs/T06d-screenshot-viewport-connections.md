# T06d — Screenshot Viewport Size + Connection Correctness

**Parent ticket:** [TICK-006](../tickets/TICK-006.md)
**Branch:** `fix/tick-006-screenshot-viewport`
**Lane:** ui (switch)
**Status:** queued
**Created:** 2026-06-07

---

## Goal

Two PM-reported issues with the 20 learning screenshots:

1. **Viewport too large for laptop screens** — screenshots are taken at a fixed viewport
   but the resulting PNGs do not show the graph nodes at a readable scale on a 1280×800
   laptop display. The canvas area must be fit-to-nodes before screenshotting so all nodes
   are visible and readable regardless of how large the viewport is.

2. **Wrong/missing connections in some slots** — some screenshots still show input
   `Input.Number` nodes with wrong default values, or wires that appear disconnected. All
   20 slot builders must be audited and corrected.

---

## Acceptance criteria covered

- **AC-2** — Every chapter example slot shows a real Nova canvas screenshot with nodes
  and wires visible. (Re-verification: nodes must be readable at 1280×800.)
- **AC-4** — Each screenshot shows correct node types, wired together, with the expected
  output visible. Input nodes must have the correct values; all required wires must be drawn.

---

## Owned paths

```
scripts/take-learning-shots.js
public/learning/*.png
```

**Do NOT touch:**
- `src/ui/learning-page.js`
- `src/ui/mini-canvas.js`
- `style.css`
- Any test file
- Any source file under `src/`

---

## Fix A — Viewport and canvas fit-to-nodes

### Current behavior

`VIEWPORT = { width: 1280, height: 800 }` is set in the script config. The screenshot is
taken of `#canvas-area` with `page.locator('#canvas-area').screenshot()`. The canvas
area has its own internal panning/zoom state and all nodes are placed at fixed pixel
coordinates like `(80, 200)`, `(320, 200)`, etc. On a 1280×800 laptop, the OS window and
browser chrome eat into the actual viewport, so the canvas area visible region may be
smaller than intended and nodes may be partially off-screen.

### Required fix

After each graph is built and computation settles, call `app.fitToView()` (or equivalent)
in `page.evaluate()` to pan/zoom the canvas so all nodes fit within the visible canvas
area. If `app.fitToView` does not exist, use `app.fitAll?.()` or manually compute a zoom
level based on node positions and the canvas element size.

Implementation approach:

```js
// After buildGraph() call and waitForTimeout, add:
await page.evaluate(() => {
  if (typeof app !== 'undefined') {
    if (typeof app.fitToView === 'function') app.fitToView();
    else if (typeof app.fitAll === 'function') app.fitAll();
    // Fallback: reset pan/zoom to show all nodes at a comfortable scale
    else if (app.canvasPan !== undefined) {
      app.canvasPan = { x: 0, y: 0 };
      app.canvasZoom = 1.0;
      app.render?.();
    }
  }
});
await page.waitForTimeout(300); // allow canvas to repaint after fit
```

Also reduce the screenshot viewport to a laptop-friendly size that matches the PM's
environment:

```js
const VIEWPORT = { width: 1280, height: 720 };
```

This ensures the Playwright browser window fits within a 1280×800 display (browser
chrome takes ~80px).

### Screenshot crop

Instead of screenshotting all of `#canvas-area` (which may include toolbar chrome), crop
to the nodes bounding box by computing the clip region:

```js
// After fit-to-view, read the bounding rect of all .node elements and screenshot
// the canvas area clipped to that region + 40px padding.
const clip = await page.evaluate(() => {
  const nodes = document.querySelectorAll('#canvas-area .node');
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const canvasRect = document.getElementById('canvas-area').getBoundingClientRect();
  nodes.forEach(n => {
    const r = n.getBoundingClientRect();
    minX = Math.min(minX, r.left - canvasRect.left);
    minY = Math.min(minY, r.top - canvasRect.top);
    maxX = Math.max(maxX, r.right - canvasRect.left);
    maxY = Math.max(maxY, r.bottom - canvasRect.top);
  });
  const PAD = 40;
  return { x: Math.max(0, minX - PAD), y: Math.max(0, minY - PAD),
           width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 };
});
const screenshotOpts = clip ? { clip } : {};
await page.locator('#canvas-area').screenshot({ path: outPath, ...screenshotOpts });
```

If node bounding boxes cannot be read (empty canvas), fall back to full `#canvas-area`
screenshot.

---

## Fix B — Audit all 20 slot builders for wrong values / disconnected wires

Audit each of the 20 `build*` functions in `scripts/take-learning-shots.js`. For each
slot, verify:

1. Every `Input.Number` node has the correct default value set via `app.onCtrl(id, 'val', N)`.
2. Every wire defined in the example is actually added via `app.addWire(...)`.
3. The `Output.Watch` node is wired from the correct port.

Known issues from prior PM feedback (fix if not yet fixed):

| Slot | Issue | Required fix |
|---|---|---|
| math-simple | Input.Number nodes may have wrong/unset values | Ensure both inputs have explicit values; verify Pythagorean result = 25 |
| math-advanced | CodeBlock timing — ports may not materialise before wiring | Use two-phase evaluate: first evaluate to create node, second to wire |
| codeblock-simple | Same CodeBlock timing issue | Two-phase evaluate |
| codeblock-advanced | Same | Two-phase evaluate |
| python-simple | Same | Two-phase evaluate |
| Any slot | Input.Number node with value 0 shows blank or misleading output | Set non-trivial values (e.g. 3, 4, 5, 10) |

Go through all 20 slots and add an inline comment next to each `app.onCtrl` call
confirming the value is correct for the example. If a slot has no `app.onCtrl` call on
any `Input.Number` node, add one now.

---

## Testing gate

| Check | Method |
|---|---|
| All 20 PNGs regenerated and exist | Script asserts existence at end |
| Each PNG ≤ 400 KB | Script asserts `stat.size <= MAX_BYTES` |
| Nodes visible and readable at 1280×720 | Manual browser: open `public/learning/*.png` and verify at actual size |
| Correct wires and values | Manual review of each PNG against the slot's chapter description |

No automated E2E spec change required — the existing `nova-learning.spec.js` checks that
PNGs load without broken-image icons.

---

## Merge checklist

- [ ] AC-2 verified: nodes + wires visible and readable in every chapter at 1280×720
- [ ] AC-4 verified: each screenshot shows correct input values, all wires connected,
      Output.Watch shows a computed result
- [ ] All 20 PNGs regenerated; none shows a broken-image icon
- [ ] Each PNG is ≤ 400 KB (script assertion passes)
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run screenshots:learning` completes without error exit code

---

## Do NOT

- Do not change `src/ui/learning-page.js` slot IDs — the filenames must continue to match.
- Do not add new dependencies to `package.json` for this script.
- Do not change the `MAX_BYTES` constant (400 KB limit stays).
- Do not commit screenshots taken at the wrong viewport; regenerate all 20 after viewport
  fix is in place.
