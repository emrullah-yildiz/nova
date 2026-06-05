# T5 — Learning Page Examples (feat/learning-examples)

**Lane:** ui-engineer  
**Branch:** `feat/learning-examples`  
**Started from:** `develop` (clean)

## Goal
`src/ui/learning-page.js` contains 10 chapters. For each chapter add:
1. One **simple example** — numbered step-by-step explanation.
2. One **advanced example** — numbered step-by-step explanation.
3. **SVG illustrations** for each example using the existing helper pattern
   (`nodeBox`, `port`, `svgFrame` or equivalent helpers already in the file).

The learning system must match Dynamo Primer quality: concept explanation,
step-by-step exercises, and at least one interactive question the user must answer
correctly before advancing.

## Owned paths (do not touch anything outside these)
- `src/ui/learning-page.js` — add examples to all 10 chapters
- `tests/learning-page.test.js` — extend/add tests to cover new examples

## Do NOT touch
- `src/ui/node-renderer.js` (hot — owned by T4)
- `src/core/node-library.js` (hot — owned by T4)
- Any other file

## Steps
1. `git switch develop && git pull --ff-only origin develop`
2. `git switch -c feat/learning-examples`
3. Claim row in `docs/agent-workboard.md` (status `active`) + push branch.
4. Read `src/ui/learning-page.js` fully. Identify:
   - The 10 chapter objects/sections.
   - The existing SVG helper functions (`nodeBox`, `port`, `svgFrame` or similar).
   - The existing example structure so you match the established pattern exactly.
5. Read `tests/learning-page.test.js` to understand what is currently tested.
6. For each of the 10 chapters, add inside the chapter definition:
   ```js
   simpleExample: {
     title: '...',
     steps: ['1. ...', '2. ...', '3. ...'],  // numbered, concrete
     svg: svgFrame([...]),                    // use existing helpers
     quiz: { question: '...', answer: '...' } // one interactive question
   },
   advancedExample: {
     title: '...',
     steps: ['1. ...', '2. ...', '3. ...'],
     svg: svgFrame([...]),
     quiz: { question: '...', answer: '...' }
   }
   ```
   Match the exact field names/shape used by the renderer — inspect what the
   renderer expects before inventing field names.
7. Extend `tests/learning-page.test.js` to assert:
   - Every chapter has `simpleExample` and `advancedExample`.
   - Both have `steps` (array with ≥3 items) and `quiz` (question+answer).
   - SVG strings are non-empty.
8. Run `npm run test` — all green. `npm run lint:all` — zero errors.
9. Run `npm run build` — passes.
10. Commit, merge to develop, push. Release workboard row.

## Quality bar (per NOVA.md Rules for Agents)
- Each lesson must have a concept explanation, step-by-step exercises, and at least
  one interactive question the user must answer correctly before advancing.
- Examples must be grounded in real Nova nodes and workflows — not hypothetical ones.
- SVG illustrations must actually illustrate the node graph described in the steps.

## Chapter inventory (read learning-page.js to confirm exact 10 titles, then fill these in)
The 10 chapters likely cover topics like: Introduction, Numbers & Math, Points,
Curves, Lists, Geometry, Logic, Custom Code, AI Copilot, and a Capstone. Read the
file to confirm and use the actual titles.

## Merge checklist
- [ ] Claim row in `docs/agent-workboard.md` before starting.
- [ ] All 10 chapters have simpleExample + advancedExample + SVG + quiz.
- [ ] Tests extended and passing.
- [ ] `npm run test` all green.
- [ ] `npm run build` passes.
- [ ] Release workboard row on merge.
