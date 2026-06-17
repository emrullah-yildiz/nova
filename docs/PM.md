# Nova — PM

> **This is the only file you edit.** Never touch ticket files, ARCHITECTURE.md, RULES.md, or any other doc directly.
>
> **How to use:**
> - Edit the **Sprint** section when goals change.
> - Before saying `run` in chat: write what you want this run in `### Planning` (replace the old text).
> - To approve a completed ticket: write `APPROVE TICK-NNN` in Planning.
> - Morpheus reads this file, acts, and writes the result into `### Coordinator Response`.

---

## Sprint A2

1. TCK 006
2. TCK 007
3. TCK 008

## Backlog

- TICK-006 — Learning page screenshots (content-aligned, all 20 slots match chapter text).
- TICK-007 — Learning page interactive exercises (pan/zoom mini-canvas, drag-wire UX, real nodes).
- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto).
- R2 storage for large mesh artifacts.
- Mobile layout — out of scope until collab ships.

---

## Product constraints

- No features that require Rhino to test — host and Rhino nodes stay legacy.
- Every design follows STYLE.md.
- Nova geometry only for Select nodes — no Revit/Rhino element picking.
- Every UI change ships with a Playwright spec.
- Agents never merge to `main` without explicit PM instruction.

---

## Run Session

### Planning
- Update screenshots to be related with the topic of the learning content. 
- Make sure that the interactive canvas i like a the Nova canvas where you can pan and move around. I need a web view there like Nova canvas. 
- MAke sure that the interactive examples contains real nodes not representatives. 


### Coordinator Response

```json
{
  "run": "2026-06-08",
  "tickets_actioned": [
    {
      "id": "TICK-006",
      "title": "Learning page — real Nova canvas screenshots in all 20 example slots",
      "status": "reopened — rework in progress (T06f, second pass)",
      "issue": "T06e audit matrix was written without reading src/ui/learning-page.js. Several builders produce wrong graphs: intro-advanced shows a 2-node multiply (result 30) instead of the 3-input parametric tower (result 600); data-types-advanced uses wrong node types; math-simple missing Math.Sqrt; code-terminal builders do not match their step descriptions; geometry-advanced uses wrong node names.",
      "changed": [
        "docs/task-briefs/T06f-content-aligned-screenshots.md: new brief with corrected audit matrix derived directly from learning-page.js source. Supersedes T06e.",
        "docs/tickets/TICK-006.md: second Rework section added; Task briefs section updated; Run comments updated.",
        "docs/tickets/INDEX.md: branch updated to fix/tick-006-content-aligned-screenshots.",
        "docs/agent-workboard.md: T06e row replaced with T06f row for switch agent."
      ],
      "how_to_test": [
        "After T06f merges: npm run dev → open Learning page → click all 10 chapters.",
        "intro-advanced must show 5 nodes: Input.Number(10) + Input.Number(3) → Multiply1 → Multiply2 ← Input.Number(20); Multiply2.result → Output.Watch showing 600.",
        "Every slot's graph must match the exact steps described in the chapter text from src/ui/learning-page.js.",
        "All 20 PNGs: no node cropped, 60px+ margin on all sides.",
        "npm run test:e2e — all learning E2E specs must still pass."
      ]
    },
    {
      "id": "TICK-007",
      "title": "Learning page — interactive mini-canvas exercises",
      "status": "reopened — rework in progress (T07h, second pass)",
      "issue": "Mini-canvas has no pan or zoom — does not feel like the real Nova canvas. Some node types used in exercises may be absent from PORT_SCHEMA in mini-canvas.js. Wire drag UX (mousedown-drag-mouseup) was added in T07f but needs verification. Exercises were redesigned in T07g but PORT_SCHEMA entries for those node types must be confirmed.",
      "changed": [
        "docs/task-briefs/T07h-real-canvas-embed.md: new brief covering (1) pan/zoom via CSS transform on viewport wrapper, (2) PORT_SCHEMA + NODE_META audit for all exercise node types, (3) drag wire UX verification, (4) E2E spec update with drag interactions + scroll wheel test. Supersedes T07f and T07g.",
        "docs/tickets/TICK-007.md: second Rework section added; Task briefs section updated; Run comments updated.",
        "docs/tickets/INDEX.md: branch updated to fix/tick-007-real-canvas-embed.",
        "docs/agent-workboard.md: T07f + T07g rows replaced with single T07h row for switch agent."
      ],
      "how_to_test": [
        "After T07h merges: npm run dev → Learning page → any chapter exercise.",
        "Scroll wheel over the mini-canvas — nodes zoom in/out toward cursor.",
        "Middle-mouse drag (or Space+drag) — all nodes pan together.",
        "Mousedown on output port dot, drag, release on compatible input port — wire connects.",
        "Release on empty canvas space — no partial wire remains.",
        "Submit correctly wired exercise — green success banner; Next chapter button enabled.",
        "npm run test:e2e — all learning-interactive specs pass."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [
    {
      "agent": "switch",
      "brief": "T06f",
      "branch": "fix/tick-006-content-aligned-screenshots",
      "ticket": "TICK-006",
      "description": "Read learning-page.js, derive exact graph for each of the 20 slots from chapter step text, rewrite builders. Key fix: intro-advanced must show 3-input 2-multiply parametric tower (Output.Watch = 600). Supersedes T06e."
    },
    {
      "agent": "switch",
      "brief": "T07h",
      "branch": "fix/tick-007-real-canvas-embed",
      "ticket": "TICK-007",
      "description": "Add pan/zoom to mini-canvas (CSS transform viewport wrapper). Audit PORT_SCHEMA + NODE_META for all exercise node types. Verify drag wire UX. Update E2E spec with drag gestures + scroll test. Supersedes T07f + T07g."
    }
  ],
  "blockers": [
    "TICK-008 remains draft — no task brief written, no agents dispatched. PM should confirm whether to proceed to TICK-008 (Live agent dashboard) once the TICK-006/007 rework lands.",
    "T06f depends on the agent reading src/ui/learning-page.js (specifically the _attachChapterExamples() data and the LEARNING_CHAPTERS sections array) before touching any builder. The brief is explicit about this. If the agent skips this read, the audit matrix will be wrong again.",
    "T07h: the pan/zoom feature must not break wire coordinate tracking. The _dotCenter() function and pending wire cursor math are relative to the SVG bounding rect — the SVG must be inside the same transformed viewport wrapper as the nodes for this to remain correct."
  ]
}
```
