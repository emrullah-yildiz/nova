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

1. **Select.Faces per-face selection** — When a mesh object exists in the scene, activating Select.Faces mode must let the user hover individual faces (each face highlights blue on hover), click to select them (turns green, counter increments), click again to deselect (counter decrements), click empty space to clear all (counter resets to 0). Output must be the selected face(s) as real planar geometry. The mesh displays as a unified whole in normal mode — only selection mode decomposes it into individually-selectable faces using Three.js BufferGeometry groups + per-face materials.

## Sprint A3 (next)

- Learning page screenshots — real Nova canvas screenshots in the 20 screenshot slots (TICK-006).
- Learning page interactive exercises — mini-canvas inside learning overlay with real Nova nodes (TICK-007).
- Live agent dashboard — futuristic real-time view of agent activity (TICK-008).

## Backlog

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
- The screenshots are half-cut and not relevant to the exercise. They are not looking correctly wired as well. 
- Mini interactive canvas looks good but the wire movement should be click hold and connect. not click only. The exercise should not be same for all them. Do a logical check for items like images and interactive examples and topics.


### Coordinator Response

```json
{
  "run": "2026-06-08",
  "tickets_actioned": [
    {
      "id": "TICK-006",
      "title": "Learning page — real Nova canvas screenshots in all 20 example slots",
      "status": "reopened — rework in progress",
      "issue": "Screenshots are cropped/half-cut (nodes clipped at viewport edge); several slot graphs are not relevant to their chapter topic; intro-simple shows Math.Multiply with the b input visually disconnected.",
      "changed": [
        "docs/tickets/TICK-006.md: AC-4 reopened; AC-6 (no-crop guarantee, 60px padding) and AC-7 (slot-topic relevance) added; Rework section and updated Run comments written; branch set to fix/tick-006-screenshot-rework.",
        "docs/task-briefs/T06e-screenshot-crop-relevance.md: new brief covering bounding-box crop fix and full 20-slot audit matrix.",
        "docs/tickets/INDEX.md: status row updated.",
        "docs/agent-workboard.md: T06e row claimed by switch."
      ],
      "how_to_test": [
        "After T06e merges: npm run dev → open Learning page → click all 10 chapters.",
        "Each of the 20 example slots must show a fully-framed screenshot — no node cropped or cut off at any edge, at least 60px clear margin on each side.",
        "The intro-simple slot must show Input.Number(5) → Math.Multiply(a), Input.Number(2) → Math.Multiply(b), Multiply.result → Output.Watch displaying 10.",
        "Every other slot's graph must match the chapter description per the audit matrix in T06e.",
        "npm run test:e2e — all learning E2E specs must still pass."
      ]
    },
    {
      "id": "TICK-007",
      "title": "Learning page — interactive mini-canvas exercises",
      "status": "reopened — rework in progress",
      "issue": "Wire interaction uses click-to-start + click-to-end; PM requires mousedown-drag-mouseup. All 10 exercises use the same math-only pattern regardless of chapter topic (e.g., Geometry chapter uses no geometry nodes).",
      "changed": [
        "docs/tickets/TICK-007.md: AC-2 and AC-10 reopened for wire drag UX; AC-11 (unique exercises) and AC-12 (logical consistency) added; Rework section and updated Run comments written; branch set to fix/tick-007-exercise-rework.",
        "docs/task-briefs/T07f-wire-drag-ux.md: new brief for switch agent — change to mousedown/mousemove/mouseup drag, update E2E spec to use drag gestures.",
        "docs/task-briefs/T07g-unique-chapter-exercises.md: new brief for neo agent — redesign ch02–ch08 exercises with domain-appropriate nodes and unique patterns.",
        "docs/tickets/INDEX.md: status row updated.",
        "docs/agent-workboard.md: T07f and T07g rows claimed."
      ],
      "how_to_test": [
        "After T07f merges: npm run dev → Learning page → any chapter → hover over an output port dot → press and hold (mousedown) → drag across canvas → release (mouseup) on an input port — a wire must appear.",
        "Release on empty canvas space — no partial wire must remain.",
        "After T07g merges: open chapters 2 through 8 — exercises must use nodes from the chapter's domain (geometry nodes in ch06, list nodes in ch07, Python/CodeBlock node in ch08, etc.).",
        "No two chapters may present the same node layout.",
        "npm run test:e2e — all learning-interactive specs must pass using drag gestures."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [
    {
      "agent": "switch",
      "brief": "T06e",
      "branch": "fix/tick-006-screenshot-rework",
      "ticket": "TICK-006",
      "description": "Fix cropped screenshots and audit all 20 slot builders for topic relevance and correct wiring."
    },
    {
      "agent": "switch",
      "brief": "T07f",
      "branch": "fix/tick-007-wire-drag-ux",
      "ticket": "TICK-007",
      "description": "Replace click-click wire UX with mousedown-drag-mouseup; update E2E spec."
    },
    {
      "agent": "neo",
      "brief": "T07g",
      "branch": "fix/tick-007-unique-exercises",
      "ticket": "TICK-007",
      "description": "Redesign exercises ch02–ch08 with domain-appropriate nodes; add AC-11/AC-12 consistency check."
    }
  ],
  "blockers": [
    "TICK-008 remains draft — no task brief written and no agents dispatched. PM should confirm whether to proceed to TICK-008 (Live agent dashboard) once the TICK-006/007 rework lands."
  ]
}
```
