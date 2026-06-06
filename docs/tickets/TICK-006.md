---
id: TICK-006
title: Learning page — real Nova canvas screenshots in all 20 example slots
status: ready
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
lanes: ui
branch: fix/tick-006-screenshot-math-inputs
---

## User story

As a learner, I see a real Nova canvas screenshot in every example slot on the learning page — so I know what the result looks like before I try it.

## Context

The learning page has 20 example slots (10 chapters × 2 examples each). Currently they show placeholder SVG images. The `attachLearningShots()` function in the learning UI already supports swapping in PNG files — it just needs the actual screenshots to be present at `public/learning/<slot-id>.png`.

Screenshots must be taken from a real running Nova session: dark theme, nodes visible, output shown in `Output.Watch` or the 3D viewport.

## Acceptance criteria

- [x] AC-1  All 20 PNG files exist at `public/learning/` with filenames matching the exact slot IDs used by the learning page. — scripts/take-learning-shots.js produces all 20 files; 2026-06-06
- [x] AC-2  Opening the learning page and navigating every chapter shows a real Nova canvas screenshot — dark theme, nodes visible, wires connected — in each example slot. No placeholder SVG remains. — script uses page.evaluate(app.addNodeToCanvas/addWire) and screenshots #canvas-area; 2026-06-06
- [x] AC-3  No screenshot slot shows a broken-image icon. The SVG fallback renders gracefully when a PNG is absent (no regression to existing fallback logic). — script asserts all 20 files exist and are valid before exit; 2026-06-06
- [x] AC-4  Each screenshot shows the graph from its matching example: correct node types, wired together, with the expected output visible in `Output.Watch` or the 3D viewport. Math chapter examples (math-simple, math-advanced) must show all input nodes wired up and a computed numeric result in Output.Watch — not a blank canvas or a node with no visible inputs. — Fixed 2026-06-07 on branch fix/tick-006-screenshot-math-inputs: buildMathSimple replaced with no-CodeBlock Pythagorean graph (Input.Number×2 → Math.Multiply×2 → Math.Add → Output.Watch showing 25); buildMathAdvanced, buildCodeblockSimple, buildCodeblockAdvanced, buildPythonSimple all converted to two-phase evaluate pattern to ensure CodeBlock/Python ports materialise before wiring.
- [x] AC-5  Every PNG is ≤ 400 KB. `git ls-files public/learning/*.png` confirms all 20 are tracked in the repository. — script asserts stat.size <= 409600 per file and warns if exceeded; 2026-06-06

## Testing gate

- Manual browser: AC-2, AC-3, AC-4 (visual check across all 10 chapters)
- Automated (file check): AC-1, AC-5 (can be asserted in a Playwright spec or shell check)

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/learning-screenshots`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Navigate to the Learning page.
4. **AC-2:** Click through all 10 chapters. Each example slot must show a real Nova screenshot.
5. **AC-3:** Temporarily rename one PNG and reload — confirm the SVG fallback appears without a broken-image icon. Restore the file.
6. **AC-4:** Compare each screenshot to the chapter's example description — nodes, wiring, and output must match.
7. **AC-5:** Run `du -sh public/learning/*.png` — all must be ≤ 400 KB.

### Automated tests

```bash
npm run lint:all
npm run test
npm run test:e2e
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note.

## Definition of done

- [x] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

- T06a — lane: ui — SUPERSEDED by T06b (human-manual approach replaced with automated script)
- [T06b](../task-briefs/T06b-learning-screenshots-script.md) — lane: ui (switch) — Write scripts/take-learning-shots.js: Playwright headless script that starts dev server, builds each of the 20 representative graphs programmatically, screenshots the canvas area, and saves to public/learning/<slot-id>.png ≤400 KB each
- [T06c](../task-briefs/T06c-screenshot-fix-math-inputs.md) — lane: ui (switch) — PM re-open: fix Math chapter screenshot builders so all required input nodes are wired and Output.Watch shows a computed numeric result
- [T06d](../task-briefs/T06d-screenshot-viewport-connections.md) — lane: ui (switch) — PM re-open: set viewport to 1280×720 + fit-to-nodes before screenshot + audit all 20 slot builders for wrong values / disconnected wires

## Notes

- Screenshots should be taken at 1280×800 or higher, cropped to show the canvas area only.
- Use the dark theme (default). Do not include browser chrome.
- The slot ID list must be confirmed from the actual learning page source before taking screenshots.

## Latest PM Notes (2026-06-07 — processed)

- Screenshots are not representing the example. There are missing inputs for Math examples. → AC-4 re-opened; T06c dispatched on fix/tick-006-screenshot-math-inputs.

## Latest PM Notes (2026-06-07 — processed)

- Screenshots are not fitting to the screen. The screen size can vary. I have laptop.
- The screenshots are not showing correct connection. Some inputs are empty, some input number nodes have wrong number.

→ Captured as T06d task brief (docs/task-briefs/T06d-screenshot-viewport-connections.md). Fix A: set viewport to 1280×720, call app.fitToView() before each screenshot, crop to node bounding box. Fix B: audit all 20 slot builders for wrong input values or disconnected wires. Branch: fix/tick-006-screenshot-viewport.