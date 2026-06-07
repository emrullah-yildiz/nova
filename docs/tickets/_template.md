---
id: TICK-NNN
title: Short descriptive title
status: draft
priority: high | medium | low
type: feature | bug | chore | spike
sprint: YYYY-MM-DD
created: YYYY-MM-DD
lanes: ui-engineer | core-engineer | platform-engineer | geometry-engineer | connect-engineer
branch: type/short-name
---

## User story

As a [type of user], I can [do something specific], so that [I get this value].

## Context

Why this ticket exists now. What constraint, complaint, or goal drove it.
Link to relevant architecture docs if needed.

## Acceptance criteria

Each item is binary (pass/fail) and observable in a running browser or test output.
Morpheus writes these. PM confirms before any code starts.

- [ ] AC-1  [Observable outcome — what the user sees or what the test asserts]
- [ ] AC-2  [Another outcome]
- [ ] AC-3  [Another outcome]

## Testing gate

Which AC require Playwright E2E coverage before merge (mandatory for UI features).
Which AC are covered by unit tests.
Which AC require manual browser verification.

Example:
- E2E (Playwright): AC-1, AC-2, AC-4
- Unit test: AC-3, AC-5
- Manual browser: AC-6

## How to test

Step-by-step instructions an agent or reviewer can follow to verify the ticket is done.
Each step must be reproducible from a clean `develop` branch with `npm run dev`.

### Local dev verification (required before marking any AC done)

1. `git switch develop && git pull --ff-only && git switch <branch-name>`
2. `npm install && npm run dev` — confirm the dev server starts at `http://localhost:5173`
3. Open `http://localhost:5173` in a browser.
4. [Replace steps below with the specific actions for THIS ticket]
   - Add the relevant node(s) from the library panel.
   - Wire inputs as described in each AC.
   - Observe the output in `Output.Watch` or the 3D viewport.
   - Record: actual value / appearance / behaviour and whether it matches the AC.

### Automated tests

```bash
npm run lint:all          # must be 0 errors
npm run test              # all unit/integration tests must pass
npm run test:e2e          # Playwright specs must pass (if E2E AC exist)
```

Record results as: `PASSED — N tests, 0 failures` or describe the failure.

### How to mark an AC done

In this file, change `- [ ] AC-N` to `- [x] AC-N` and append a note:
- For automated: `— covered by tests/path/to/spec.js:line`
- For manual: `— manual browser YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T?](../task-briefs/T?-name.md) — lane: description

## Agent Response

> Written by the agent after merging to develop. Morpheus copies this into `docs/pm/PM.md` under the ticket section so the PM can review it without opening this file.

**Status:** <!-- Merged to develop — awaiting PM re-test -->
**Branch merged:** <!-- type/tick-NNN-description -->
**Date:** <!-- YYYY-MM-DD -->

### What was built
<!-- 2–4 bullet points: what changed, key decisions made -->

### How to test
<!-- Numbered steps from a clean `npm run dev` start -->

### Validation run
- Lint: <!-- ✅ 0 errors / ❌ N errors -->
- Unit tests: <!-- ✅ N passing / ❌ -->
- Build: <!-- ✅ green / ❌ -->
- Playwright E2E: <!-- ✅ all pass / ❌ N failed / ⚠️ not applicable -->
- Manual browser: <!-- ✅ tested YYYY-MM-DD / ⚠️ not yet -->

### Known gaps or open questions
<!-- Anything the PM should know before testing. If none: "None." -->

---

## PM Comments

> PM writes here after testing on develop. Do not edit — morpheus reads this on next "run".

<!-- ✅ Approved / ❌ Bug: [description] / ⚠️ [question] -->

---

## Notes

Any decisions, constraints, or open questions morpheus or the PM recorded here.
