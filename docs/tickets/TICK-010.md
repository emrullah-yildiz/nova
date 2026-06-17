---
id: TICK-010
title: Code Block — series shorthand syntax for creating number ranges
status: in-progress
priority: high
type: feature
sprint: A2
created: 2026-06-17
lanes: core
branch: feat/tick-010-codeblock-series
---

## Summary

The Code Block node (`Custom.CodeBlock`) supports a `..` range shorthand.
Two new forms are added alongside the existing `start..end..step` form:

- `start..step..#count` — start at `start`, increment by `step`, `count` times → `count+1` values.
- `start..#amount..end` — produce exactly `amount` evenly-spaced values from `start` to `end`.

## Syntax table

| Form | Tokens | Example | Result |
|---|---|---|---|
| `start..end` | start, end (step=1) | `0..5` | `[0,1,2,3,4,5]` |
| `start..end..step` | start, end, step | `0..10..2` | `[0,2,4,6,8,10]` |
| `start..step..#count` | start, step, #count | `0..10..#2` | `[0,10,20]` |
| `start..#amount..end` | start, #amount, end | `0..#5..10` | `[0,2.5,5,7.5,10]` |

Key rule: the `#` prefix on the **middle** token → evenly-spaced (`amount` values from start to end).
The `#` prefix on the **last** token → step-by-count (`count` steps of size `step` from `start`).

## Acceptance criteria

- [x] AC-1  `0..10..2` still produces `[0,2,4,6,8,10]` — existing form unchanged.
- [x] AC-2  `0..5` still produces `[0,1,2,3,4,5]` — existing two-token form unchanged.
- [x] AC-3  `0..10..#2` produces `[0,10,20]` (start=0, step=10, count=2 → 3 values).
- [x] AC-4  `0..5..#3` produces `[0,5,10,15]` (start=0, step=5, count=3 → 4 values).
- [x] AC-5  `0..#5..10` produces `[0,2.5,5,7.5,10]` (5 evenly-spaced from 0 to 10).
- [x] AC-6  `1..#3..7` produces `[1,4,7]` (3 evenly-spaced from 1 to 7).
- [x] AC-7  A Vitest unit test in `tests/codeblock-series.test.js` asserts AC-1 through AC-6 by calling `desugarSeries` / `evalCodeBlock` directly.
- [x] AC-8  The Code Block node's help/hint text lists all four forms so users know the syntax. Suggested text: `0..10 | 0..10..2 | 0..10..#count | 0..#amount..10`

## Implementation notes

The parser lives in `src/runtime/codeblock-syntax.js` (`desugarSeries`).
Current token detection:
- 2 tokens, no `#` → `start..end` (step 1)
- 3 tokens, no `#` → `start..end..step`
- `#` on middle token → existing count form (already works for `start..#amount..end`)
- `#` on last token → **NEW**: `start..step..#count` — emit `count+1` values: `start + i*step` for `i` in `0..count`

## Testing gate

- Unit: AC-1 through AC-7 (`codeblock-series.test.js`)
- Manual: AC-3, AC-5 (add CodeBlock + Watch node in dev, confirm output)
- Manual: AC-8 (hint visible in node)

## How to test

1. `git switch feat/tick-010-codeblock-series && npm run dev`
2. Add `Custom.CodeBlock` + `Output.Watch` to the canvas.
3. Type `out = 0..10..#2` — Watch shows `[0, 10, 20]`.
4. Type `out = 0..5..#3` — Watch shows `[0, 5, 10, 15]`.
5. Type `out = 0..#5..10` — Watch shows `[0, 2.5, 5, 7.5, 10]`.
6. Type `out = 0..10..2` — Watch shows `[0, 2, 4, 6, 8, 10]` (no regression).
7. `npm run test` — all pass including new unit tests.

## Definition of done

- [x] All ACs checked `[x]`
- [x] `npm run lint:all` → 0 errors
- [x] `npm run test` → all pass
- [x] `npm run build` → green
- [ ] Oracle APPROVE
- [ ] Merged to `develop`

## Task briefs

Links added by morpheus after PM confirms AC.

## Run comments

<!-- Replaced every run -->

**Run 2026-06-17**
- Status: in-progress → branch feat/tick-010-codeblock-series ready for Oracle review.
- Changed: `src/runtime/codeblock-syntax.js` — new `stepCount` path in `buildList`; `mark3==='#'` case now emits `start..step..#count` (count+1 step-driven values) instead of old evenly-spaced semantics.
- Changed: `tests/codeblock-series.test.js` — full rewrite covering all 4 forms across desugarSeries + evalCodeBlock (19 tests, all pass).
- Changed: `tests/codeblock-core.test.js` — updated 4 tests that encoded old `mark3==='#'` semantics.
- Changed: `src/nodes/categories/custom.js` — description and inline comment updated with all four forms.
- Gates: lint:all 0 errors, test 1902/1902 pass, build green.
