---
id: TICK-NNN
title: Short descriptive title
status: draft | ready | in-progress | blocked | done
priority: high | medium | low
type: feature | bug | chore
sprint: [name]
created: YYYY-MM-DD
lanes: [roles]
branch: type/tick-NNN-short
---

## Summary

One paragraph: what this ticket is and why it exists now.

## Problem definition

What is broken or missing. What user-facing behavior is wrong or absent.
Link to architecture docs if relevant.

## Acceptance criteria

Each item is binary (pass/fail) and observable in a running browser or test output.
Morpheus writes these. PM confirms via `docs/PM.md` before any code starts.

- [ ] AC-1  [Observable outcome — what the user sees or what the test asserts]
- [ ] AC-2  [Another outcome]
- [ ] AC-3  [Another outcome]

## Testing gate

- E2E (Playwright): AC-N, AC-N
- Unit test: AC-N
- Manual browser: AC-N

## How to test

1. `git switch develop && git pull --ff-only && git switch <branch>`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. [Ticket-specific steps]

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers UI-gated ACs
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, branch deleted, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T?](../task-briefs/T?-name.md) — lane: description

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run YYYY-MM-DD**
- Issue: [what was wrong, or null if this was new work]
- Changed: [bullet list of files or behaviors changed]
- How to test: [numbered steps from npm run dev]
- Playwright: [pass "N pass, 0 fail" | not applicable]
- Status: pass | fail | pending PM
