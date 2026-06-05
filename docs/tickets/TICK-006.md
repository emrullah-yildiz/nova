---
id: TICK-006
title: Learning page — real Nova canvas screenshots in all 20 example slots
status: ready
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
lanes: ui
branch: feat/learning-screenshots
---

## User story

As a learner, I see a real Nova canvas screenshot in every example slot on the learning page — so I know what the result looks like before I try it.

## Context

The learning page has 20 example slots (10 chapters × 2 examples each). Currently they show placeholder SVG images. The `attachLearningShots()` function in the learning UI already supports swapping in PNG files — it just needs the actual screenshots to be present at `public/learning/<slot-id>.png`.

Screenshots must be taken from a real running Nova session: dark theme, nodes visible, output shown in `Output.Watch` or the 3D viewport.

## Acceptance criteria

- [ ] AC-1  All 20 PNG files exist at `public/learning/` with filenames matching the exact slot IDs used by the learning page.
- [ ] AC-2  Opening the learning page and navigating every chapter shows a real Nova canvas screenshot — dark theme, nodes visible, wires connected — in each example slot. No placeholder SVG remains.
- [ ] AC-3  No screenshot slot shows a broken-image icon. The SVG fallback renders gracefully when a PNG is absent (no regression to existing fallback logic).
- [ ] AC-4  Each screenshot shows the graph from its matching example: correct node types, wired together, with the expected output visible in `Output.Watch` or the 3D viewport.
- [ ] AC-5  Every PNG is ≤ 400 KB. `git ls-files public/learning/*.png` confirms all 20 are tracked in the repository.

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

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

- [T06a](../task-briefs/T06a-learning-screenshots.md) — lane: ui — Identify 20 slot IDs, take real Nova canvas screenshots at 1280×800 dark theme, save as public/learning/<slot-id>.png ≤400 KB each

## Notes

- Screenshots should be taken at 1280×800 or higher, cropped to show the canvas area only.
- Use the dark theme (default). Do not include browser chrome.
- The slot ID list must be confirmed from the actual learning page source before taking screenshots.
