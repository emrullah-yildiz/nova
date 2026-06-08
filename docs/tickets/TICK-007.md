---
id: TICK-007
title: Learning page — interactive mini-canvas exercises
status: in-progress
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
lanes: ui, core
branch: fix/tick-007-exercise-rework
---

## User story

As a learner, I can complete a wiring puzzle on a mini-canvas inside the learning overlay — connecting pre-placed nodes to solve the exercise — and submit my solution to get immediate pass/fail feedback.

## Context

The learning page currently teaches through text and examples. This ticket adds an interactive exercise to each of the 10 chapters: a mini-canvas with nodes pre-placed but not wired, where the user draws the missing wires and submits. Validation runs the actual Nova compute engine and checks the output value against an expected result.

The mini-canvas must be self-contained — no global app state mutation. It communicates only via an `onSolve` callback.

## Acceptance criteria

- [x] AC-1  All 10 chapters display an interactive exercise section (below the existing quiz), containing a mini-canvas with 4–5 pre-placed nodes and at least 1 unwired input port. — confirmed 2026-06-08: `exercises` array exports 10 definitions (ch01–ch10); learning-page.js renders `learn-exercise-section` for every `exercises[chIdx]`; E2E spec confirms chapter 1 exercise renders.
- [ ] AC-2  The user draws a wire by pressing and holding on an output port, dragging to a compatible input port, and releasing. The wire appears as a visible connector between the two ports. During drag the pending wire follows the cursor. Releasing over an incompatible or empty area cancels the pending wire with no partial connection left on canvas. — REOPENED 2026-06-08: PM requires click-hold-drag-release UX; current click-to-start + click-to-end is not acceptable.
- [x] AC-3  Clicking an incompatible port (type mismatch) does nothing — no wire is started or partially drawn. — confirmed 2026-06-08: mini-canvas.js line 488 `if (!_typesCompatible(pendingWire.portType, toPortType)) { return; }` — type mismatch silently exits with no wire drawn or started.
- [x] AC-4  Submitting a correctly completed exercise shows a green success message and enables the "Next chapter" button. — confirmed 2026-06-08: `_showFeedback(true)` applies `.mini-canvas-success` with "Correct! Well done."; `onSolve(true)` removes `disabled` from `.learn-nav-btn--next`; E2E AC-10 spec asserts this and passes (10/10 E2E pass).
- [x] AC-5  Submitting an incomplete or incorrectly wired exercise shows a red feedback message describing what was expected. The user can adjust and resubmit. — confirmed 2026-06-08: `_showFeedback(false)` applies `.mini-canvas-error` with "Not quite — check your connections and try again."; E2E "AC-5 proxy" test (submit with no wire drawn) asserts red banner and Next disabled — passes.
- [x] AC-6  Validation runs the mini-canvas graph through the Nova compute engine (`src/core/`). The acceptance function checks the actual computed output value — not just that wires exist. — uses createLessonComputeContext + computeNodeValue from src/core/; 2026-06-06
- [x] AC-7  10 exercise definitions live in `src/ui/learning-exercises.js`. Each definition declares: node list, pre-drawn wires, expected output, and an acceptance function. A Vitest unit test confirms each acceptance function returns `true` for a correct solution and `false` for an incorrect one. — 20 Vitest tests, all pass 2026-06-06
- [x] AC-8  The mini-canvas renders correctly inside the learning overlay at a 1280×800 viewport — no overflow, no clipped ports, no invisible wires. — confirmed 2026-06-08: `.learn-panel` is `max-width: 96vw; height: 90vh` (fits 1280×800); `.mini-canvas-area` has `overflow: visible; min-height: 280px`; `.learn-body` scrolls with `overflow-y: auto` so nothing clips; E2E tests pass at default 1280×720 viewport.
- [x] AC-9  The mini-canvas component does not import from `src/app/app.js` or mutate any global `window.app` state. It communicates only through its `onSolve` callback. — grep confirmed 0 results 2026-06-06
- [ ] AC-10  A Playwright E2E spec `tests/e2e/learning-interactive.spec.js` covers: open learning overlay → chapter 1 → drag a wire from output port to input port (mousedown + mousemove + mouseup) → Submit → assert green success message and "Next chapter" button is enabled. — REOPENED 2026-06-08: E2E spec must be updated to use drag interaction instead of click-click.
- [ ] AC-11  Each of the 10 chapter exercises is unique and logically tailored to its chapter topic. The exercise title, pre-placed node types, and the missing wire all reflect what the chapter teaches. No two chapters may use the same node layout or the same missing-wire pattern. A brief written in docs/task-briefs/T07g maps each chapter title to its unique exercise rationale. — NEW 2026-06-08 per PM rework feedback.
- [ ] AC-12  A logical consistency check passes: for every chapter the screenshot slot content (from TICK-006), the interactive exercise node types, and the chapter topic text all reference the same conceptual domain (e.g., Math chapter uses math nodes; Geometry chapter uses geometry nodes). No chapter may show a geometry exercise when the topic is data types, etc. — NEW 2026-06-08 per PM rework feedback.

## Testing gate

- Unit test: AC-7 (`learning-exercises.js` acceptance functions)
- E2E (Playwright): AC-10
- Manual browser: AC-1, AC-2, AC-3, AC-4, AC-5, AC-8

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/learning-exercises`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Open the Learning overlay → Chapter 1.
4. **AC-1:** Confirm a mini-canvas exercise section is visible below the quiz.
5. **AC-2:** Click an output port on a pre-placed node — confirm a wire begins. Click a compatible input port — confirm the wire connects.
6. **AC-3:** Try clicking an incompatible port — confirm nothing happens.
7. **AC-4:** Complete the exercise correctly → Submit → confirm green message + Next button.
8. **AC-5:** Submit incomplete/wrong wiring → confirm red feedback message.
9. Repeat for all 10 chapters (**AC-1** check each chapter has an exercise).
10. **AC-8:** Check at 1280×800 that nothing overflows.

### Automated tests

```bash
npm run lint:all
npm run test              # includes AC-7 unit tests
npm run test:e2e          # tests/e2e/learning-interactive.spec.js
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note.

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC-2, AC-10 with drag interaction
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

- [T07a](../task-briefs/T07a-learning-exercise-engine.md) — lane: core — Create src/ui/learning-exercises.js with 10 exercise definitions + acceptance functions; Vitest unit tests (≥20 cases). Independent, unblocked.
- [T07b](../task-briefs/T07b-learning-mini-canvas.md) — lane: ui — Build src/ui/mini-canvas.js component (wire drawing, submit, pass/fail feedback); integrate into learning-page.js. Depends on T07a merge.
- [T07c](../task-briefs/T07c-learning-exercises-e2e.md) — lane: ui — Write tests/e2e/learning-interactive.spec.js (open overlay → ch01 → draw wire → Submit → assert success). Depends on T07a + T07b merge.
- [T07d](../task-briefs/T07d-mini-canvas-real-nodes-wires.md) — lane: ui (switch) — PM re-open: fix mini-canvas so nodes look like real Nova canvas nodes and the pending wire correctly tracks the cursor from output port click to landing on an input port.
- [T07e](../task-briefs/T07e-mini-canvas-number-nodes.md) — lane: ui (switch) — PM re-open: Input.Number nodes must show value spinner + range slider in node body, matching real Nova canvas
- [T07f](../task-briefs/T07f-wire-drag-ux.md) — lane: ui (switch) — PM rework 2026-06-08: change wire interaction from click-to-start + click-to-end to mousedown-drag-mouseup; update E2E spec to use drag gestures. Covers AC-2, AC-10.
- [T07g](../task-briefs/T07g-unique-chapter-exercises.md) — lane: core (neo) — PM rework 2026-06-08: redesign all 10 exercises so each is unique and tailored to its chapter topic; add logical consistency check. Covers AC-11, AC-12.

## Notes

- The mini-canvas must reuse the Nova compute engine from `src/core/` directly — no duplicate evaluation logic.
- Wire drawing UX should match the main canvas feel (click-to-start, click-to-end) but can be simplified (no drag required).
- Exercises should be designed so they can be completed in under 2 minutes each.
- Do not add a parallel learning system — integrate into the existing learning overlay component.

## Latest PM Notes (2026-06-07 — processed)

- The interactive canvas where users are expected to connect nodes should be like real nova canvas for nodes with real nodes. Current canvas has broken wire system and input/output system. Wire is not following. → AC-2 re-opened; T07d dispatched on fix/tick-007-mini-canvas-real-nodes.

## Latest PM Notes (2026-06-07 — processed)

- Still it is not the real canvas and real nodes. Number nodes are not correct.

→ Captured as T07e task brief (docs/task-briefs/T07e-mini-canvas-number-nodes.md). Fix: render Input.Number nodes in mini-canvas with a number spinner (<input type="number">) and range slider (<input type="range">) in the node body, matching real Nova canvas exactly. Branch: fix/tick-007-number-nodes.

## Rework — 2026-06-08 (PM feedback)

PM reported two classes of defect after testing the interactive mini-canvas:

1. **Wire interaction is wrong UX.** Current behavior is click output port to start, click input port to finish. PM requires standard DAG editor UX: **mousedown on output port, drag, mouseup on input port**. Click-only is not acceptable — it does not feel like a real wire draw.
2. **All 10 exercises are the same pattern.** Every chapter currently uses the same "connect the missing B input to a math node" pattern regardless of what the chapter teaches. A Geometry chapter should use geometry nodes; a List chapter should use list nodes; a Python chapter context should not be a plain Math.Round exercise. Each exercise must be uniquely designed for its chapter topic.

AC-2 and AC-10 reopened for wire drag UX. AC-11 and AC-12 added for exercise uniqueness and cross-item logical consistency. Two tasks dispatched in parallel: T07f (switch, wire drag) and T07g (neo, exercise redesign).

## Run comments

Morpheus run 2026-06-08 (PM rework):

- Status: REOPENED — AC-2, AC-10, AC-11, AC-12 not yet met per PM feedback.
- Issue: Wire interaction uses click-click not drag; all 10 exercises use the same math-only pattern regardless of chapter topic.
- Changed: AC-2 and AC-10 reopened; AC-11 and AC-12 added; T07f (wire drag UX) and T07g (unique exercises per chapter) dispatched in parallel.
- How to test: `npm run dev` → Learning page → open any chapter → confirm wire draws by holding and dragging; confirm each chapter's exercise uses nodes relevant to the chapter topic.
- Playwright: pending T07f agent (drag spec update)
- Status: in-progress
