# T2 — CodeBlock Series Bug (fix/codeblock-series)

**Lane:** core-engineer  
**Branch:** `fix/codeblock-series`  
**Started from:** `develop` (clean)

## Goal
The CodeBlock DSL series shorthand (`1..10..#2`, `1..#2..10`, `1..10..2`) produces
no output. The bug is in one or both of:
- `src/runtime/codeblock-syntax.js` — `desugarSeries` helper
- `src/runtime/codeblock-eval.js` — evaluator that processes desugared series

Find the root cause, fix it, and add a focused test.

## Context (from NOVA.md §4)
`Custom.CodeBlock` has a `..`/`#` series shorthand that **desugars** to a
number-list literal (`desugarSeries`) — it is not a `List.Range`/`List.Sequence`
clone. The two share the inference engine (`runtime/python-port-decl.js`) but stay
distinct. Codegen tracks *live* ports, not the static def.

## Owned paths (do not touch anything outside these)
- `src/runtime/codeblock-eval.js`
- `src/runtime/codeblock-syntax.js`
- `tests/codeblock-series.test.js` (new test file — create it)
- `tests/codeblock-core.test.js` (may extend if needed)

## Do NOT touch
- `src/ui/node-renderer.js` (hot)
- `src/core/node-library.js` (hot)
- Any other file outside the owned paths above

## Steps
1. `git switch develop && git pull --ff-only origin develop`
2. `git switch -c fix/codeblock-series`
3. Read `src/runtime/codeblock-syntax.js` fully. Trace `desugarSeries`.
4. Read `src/runtime/codeblock-eval.js` fully. Trace the evaluator's handling of the
   desugared output.
5. Write a failing test in `tests/codeblock-series.test.js` for each of the three
   syntaxes: `1..10..#2`, `1..#2..10`, `1..10..2`.
6. Locate the bug (likely a regex group mismatch, wrong desugar output form, or
   evaluator not handling the desugared AST node).
7. Fix the bug. Run the new tests — they must pass.
8. Run `npm run test` — existing tests must still pass.
9. Run `npm run lint:all` — zero errors.
10. Commit, merge to develop, push.

## Expected contract (series semantics)
| Syntax | Meaning | Expected output |
|---|---|---|
| `1..10..2` | start..end..step | `[1, 3, 5, 7, 9]` |
| `1..10..#2` | start..end..count | `[1, 10]` (2 evenly-spaced values) |
| `1..#2..10` | start..count..end (same as above, alt form) | `[1, 10]` |

Verify the output is a real JS array of numbers, not `[object Object]` or `NaN`.

## Merge checklist
- [ ] Claim row in `docs/agent-workboard.md` before starting.
- [ ] New test file committed and passing.
- [ ] `npm run test` all green.
- [ ] Release workboard row on merge.
