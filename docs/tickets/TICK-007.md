---
id: TICK-007
title: Learning page — interactive mini-canvas exercises
status: in-progress
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
lanes: ui, core
branch: feat/learning-exercises
---

## User story

As a learner, I can complete a wiring puzzle on a mini-canvas inside the learning overlay — connecting pre-placed nodes to solve the exercise — and submit my solution to get immediate pass/fail feedback.

## Context

The learning page currently teaches through text and examples. This ticket adds an interactive exercise to each of the 10 chapters: a mini-canvas with nodes pre-placed but not wired, where the user draws the missing wires and submits. Validation runs the actual Nova compute engine and checks the output value against an expected result.

The mini-canvas must be self-contained — no global app state mutation. It communicates only via an `onSolve` callback.

## Acceptance criteria

- [ ] AC-1  All 10 chapters display an interactive exercise section (below the existing quiz), containing a mini-canvas with 4–5 pre-placed nodes and at least 1 unwired input port. — manual browser verification pending
- [ ] AC-2  The user can draw a wire by clicking an output port then a compatible input port. The wire appears as a visible connector between the two ports. — manual browser verification pending
- [ ] AC-3  Clicking an incompatible port (type mismatch) does nothing — no wire is started or partially drawn. — manual browser verification pending
- [ ] AC-4  Submitting a correctly completed exercise shows a green success message and enables the "Next chapter" button. — manual browser verification pending
- [ ] AC-5  Submitting an incomplete or incorrectly wired exercise shows a red feedback message describing what was expected. The user can adjust and resubmit. — manual browser verification pending
- [x] AC-6  Validation runs the mini-canvas graph through the Nova compute engine (`src/core/`). The acceptance function checks the actual computed output value — not just that wires exist. — uses createLessonComputeContext + computeNodeValue from src/core/; 2026-06-06
- [x] AC-7  10 exercise definitions live in `src/ui/learning-exercises.js`. Each definition declares: node list, pre-drawn wires, expected output, and an acceptance function. A Vitest unit test confirms each acceptance function returns `true` for a correct solution and `false` for an incorrect one. — 20 Vitest tests, all pass 2026-06-06
- [ ] AC-8  The mini-canvas renders correctly inside the learning overlay at a 1280×800 viewport — no overflow, no clipped ports, no invisible wires. — manual browser verification pending
- [x] AC-9  The mini-canvas component does not import from `src/app/app.js` or mutate any global `window.app` state. It communicates only through its `onSolve` callback. — grep confirmed 0 results 2026-06-06
- [x] AC-10  A Playwright E2E spec `tests/e2e/learning-interactive.spec.js` covers: open learning overlay → chapter 1 → draw the required wire → Submit → assert green success message and "Next chapter" button is enabled. — 31/31 E2E tests pass 2026-06-06

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
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

- [T07a](../task-briefs/T07a-learning-exercise-engine.md) — lane: core — Create src/ui/learning-exercises.js with 10 exercise definitions + acceptance functions; Vitest unit tests (≥20 cases). Independent, unblocked.
- [T07b](../task-briefs/T07b-learning-mini-canvas.md) — lane: ui — Build src/ui/mini-canvas.js component (wire drawing, submit, pass/fail feedback); integrate into learning-page.js. Depends on T07a merge.
- [T07c](../task-briefs/T07c-learning-exercises-e2e.md) — lane: ui — Write tests/e2e/learning-interactive.spec.js (open overlay → ch01 → draw wire → Submit → assert success). Depends on T07a + T07b merge.

## Notes

- The mini-canvas must reuse the Nova compute engine from `src/core/` directly — no duplicate evaluation logic.
- Wire drawing UX should match the main canvas feel (click-to-start, click-to-end) but can be simplified (no drag required).
- Exercises should be designed so they can be completed in under 2 minutes each.
- Do not add a parallel learning system — integrate into the existing learning overlay component.

## PM Notes
- The interactive canvas where users are expected to connected nodes should be like real nova canvas for nodes with real nodes.
- Current canvas has broken wire system and input/output system. Wire is not following