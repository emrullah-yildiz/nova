# T06e — Screenshot crop fix + logical relevance audit

**Parent ticket:** [TICK-006](../tickets/TICK-006.md)
**Lane:** ui (switch)
**Branch:** `fix/tick-006-screenshot-rework`
**Status:** queued
**Covers ACs:** AC-4, AC-6, AC-7

---

## Goal

Fix two classes of defect in the 20 learning page screenshots, both reported by the PM on 2026-06-08:

1. **Screenshots are cropped / half-cut.** Nodes are clipped at the right or bottom edge of the frame. The current fit-to-view + viewport setup is not producing a bounding-box-relative crop that guarantees all nodes are fully visible.
2. **Screenshots are not relevant to their slot/chapter.** Several slots contain graphs that do not match what the chapter teaches. The `intro-simple` slot ("Your first graph: double a number") shows a Math.Multiply node with the `b` input disconnected — which contradicts the "double a number" premise. Other slots may have similar mismatches.

---

## Owned paths

- `scripts/take-learning-shots.js`
- `public/learning/*.png` (regenerated files — not tracked via git diff, but must be committed)

## Do NOT touch

- `src/ui/learning-page.js`
- `src/ui/learning-exercises.js`
- `src/ui/mini-canvas.js`
- `src/core/**`
- `tests/e2e/**`
- Any file not listed in "Owned paths"

---

## Problem breakdown

### Problem 1 — Cropped screenshots

Current script calls `app.fitAll()` then screenshots `#canvas-area`. However:
- The canvas element is sized to the viewport, and nodes placed near the edges can still be clipped by the viewport boundary even after fitAll.
- The node bounding box after fitAll may leave insufficient padding, especially at 1280×720 for graphs with many nodes spread horizontally.

**Fix required:**
After `app.fitAll()`, compute the bounding box of all rendered node DOM elements and use `element.screenshot()` (Playwright) rather than `page.locator('#canvas-area').screenshot()`. This crops to the actual node bounding box plus 60px padding on all sides. If the bounding box + padding exceeds the viewport, increase the viewport height/width dynamically before taking the shot.

Alternatively: use `page.setViewportSize({ width: 1600, height: 900 })` (larger viewport), then after `fitAll()`, call `page.locator('#canvas-area').screenshot({ clip: boundingBox })` where boundingBox is computed from `app.getNodeBounds()` if that API exists, or from querying `.node-wrapper` element positions via `page.evaluate`.

The final PNG must show all nodes with at least 60px clear space on every side.

### Problem 2 — Logically incorrect or mismatched graphs

Audit every slot builder against its `slotId` and chapter description. Confirmed defect:

- **`intro-simple`** ("Your first graph: double a number"): current builder `buildIntroSimple` wires `Input.Number(5) → Math.Multiply(a)` but passes `b=2` via `onCtrl`, not via a wire. The screenshot shows the `b` port visually empty/unconnected (the control value is set but does not produce a visible wire). The example description says to wire `a` and set `b=2` as a control — this is correct behavior, but the PM sees it as a disconnected `b`. The fix is to ensure the node's `b` control value is visibly rendered in the node body (the `onCtrl` value should appear as the inline control value `2`). If it doesn't show because `onCtrl` is not reflecting in the node UI, switch to adding a second `Input.Number(2) → Math.Multiply(b)` wire so the connection is visually unambiguous.

Full audit matrix (slot → expected graph):

| slotId | Expected graph summary |
|---|---|
| intro-simple | Input.Number(5) → Math.Multiply(a); Input.Number(2) → Math.Multiply(b); Multiply.result → Output.Watch showing 10 |
| intro-advanced | Input.Number(10=floors) → Multiply(a); Input.Number(3=floorHeight) → Multiply(b); Multiply.result → Output.Watch showing 30 |
| interface-simple | Math.Add(a=4,b=6) → Output.Watch showing 10; Inspector panel visible if possible |
| interface-advanced | Input.Number(100) → List.Range(end); List.Range.list → Output.Watch |
| node-layout-simple | Math.Add(a=7,b=3) → Output.Watch showing 10 |
| node-layout-advanced | Input.Slider(val=5) → Math.Multiply(a); Math.Multiply(b=3) → Output.Watch showing 15 |
| data-types-simple | Input.Text("Hello") → Output.Watch; Input.Number(42) → Output.Watch (two separate watch nodes) |
| data-types-advanced | List.Create(1,2,3,4,5) → Logic.Compare(>=3).result → List.FilterByBoolean.mask; List.Create.list → List.FilterByBoolean.list; FilterByBoolean.inList → Output.Watch |
| math-simple | Input.Number(3) → Multiply(a,b)=9; Input.Number(4) → Multiply(a,b)=16; both results → Math.Add → Output.Watch showing 25 |
| math-advanced | List.Range(0,360,45) → Custom.CodeBlock(sin(rad(angles))) → Output.Watch |
| geometry-simple | Point.ByCoordinates(0,0,0) + Point.ByCoordinates(5,3,0) → Line.ByStartPointEndPoint; 3D viewport |
| geometry-advanced | 4× Point.ByCoordinates → List.Create → Polyline.ByPoints → Surface.ByCurveExtrude + Vector(0,0,5); 3D viewport |
| lists-simple | List.Create(10,20,30) → List.Reverse → Output.Watch showing [30,20,10] |
| lists-advanced | List.Range(x) + List.Range(y) → Point.ByCoordinates (cross-product grid); Output.Watch |
| python-simple | List.Create(1,2) → Custom.Python(result=[x**2 for x in elements]) → Output.Watch showing [1,4] |
| python-advanced | Custom.Python (RevitBridge code shown, no compute expected) → Output.Watch |
| code-terminal-simple | Math.Add(4,6) → Output.Watch; terminal overlay visible if possible |
| code-terminal-advanced | Input.Number(10) → Math.Multiply(b=5) → Math.Add(b=3) → Output.Watch showing 53; terminal overlay visible |
| codeblock-simple | Custom.CodeBlock(area=width*height; diagonal=sqrt(width^2+height^2)) with width=3,height=4 → 2× Output.Watch showing 12 and 5 |
| codeblock-advanced | Custom.CodeBlock(circle 24 points) → Point.ByCoordinates; 3D viewport showing circle |

For each slot where the current builder produces a different graph, rewrite the builder function.

**Key fix for `intro-simple`:** Switch from `onCtrl(n2,'b',2)` to adding a second `Input.Number(2)` wired to `n2.b` so the wire is visually drawn.

---

## Implementation steps

1. Read the current `buildIntroSimple` function. Confirm whether `onCtrl` produces a visible inline value on the node. If not, replace with a wired second Input.Number.
2. For each slot in the audit matrix, open the current builder and compare it to the expected graph. Note mismatches.
3. Fix each builder that mismatches.
4. Fix the crop issue: after `app.fitAll()`, use a bounding-box screenshot approach with 60px padding. Preferred approach: `page.setViewportSize({width:1600,height:900})` before navigation, then after fitAll call `page.evaluate()` to get all `.node` element bounding rects, compute the union bounding box, add 60px padding, and pass `{clip: {x,y,width,height}}` to the screenshot call.
5. Re-run the screenshot script: `node scripts/take-learning-shots.js`.
6. Visually inspect all 20 PNGs — confirm no cropping, all nodes visible, all graphs match the expected graph summary above.
7. Run `npm run lint:all && npm run test && npm run build` — must all pass.
8. Commit the updated script and all 20 regenerated PNGs. The PNGs must be committed (they are in `public/learning/` and are content-serving assets).

---

## Testing gate

- **AC-6:** Visual inspection of all 20 PNGs — every node fully in frame with clear margin.
- **AC-7:** Visual + code audit — each builder's graph matches the expected graph in the audit matrix above.
- **AC-4:** Each Watch node shows a computed numeric/list value, not blank.
- **AC-1, AC-5:** File existence + size check (existing assertions in the script).

No new Playwright E2E spec is required for this task — the screenshot script itself is the test. The existing learning E2E specs must still pass (`npm run test:e2e`).

---

## Merge checklist

- [ ] AC-4 verified: all Watch nodes show computed values in screenshots
- [ ] AC-6 verified: all 20 PNGs show zero cropped nodes; 60px+ padding on every edge
- [ ] AC-7 verified: every builder matches the audit matrix; `intro-simple` shows a wired b input
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run build` → green
- [ ] `npm run test:e2e` → all learning specs pass (no regressions)
- [ ] All 20 PNGs committed to `public/learning/`
- [ ] Workboard row released; INDEX.md updated; TICK-006.md AC-4, AC-6, AC-7 checked [x]
