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

## Notes

Any decisions, constraints, or open questions morpheus or the PM recorded here.
