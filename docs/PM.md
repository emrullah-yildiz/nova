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
- Sprint A2 is completed. For the next sprint:
- Delete tck-04
- Start focusinbg on 006 and 007


### Coordinator Response

```json
{
  "run": "2026-06-08",
  "tickets_actioned": [
    {
      "id": "TICK-006",
      "title": "Learning page — real Nova canvas screenshots in all 20 example slots",
      "status": "oracle-approved — awaiting PM APPROVE to archive",
      "issue": null,
      "changed": [
        "docs/tickets/TICK-006.md: Oracle APPROVE added to DoD; run comments updated"
      ],
      "how_to_test": [
        "Open the Learning page at http://localhost:5173 (npm run dev).",
        "Click through all 10 chapters — each of the 20 example slots must show a real Nova canvas screenshot with nodes, wires, and computed output visible.",
        "Temporarily rename one PNG and reload — confirm the SVG fallback appears without a broken-image icon. Restore the file.",
        "Run: npm run test:e2e — 10/10 learning specs must pass."
      ]
    },
    {
      "id": "TICK-007",
      "title": "Learning page — interactive mini-canvas exercises",
      "status": "oracle-approved — awaiting PM APPROVE to archive",
      "issue": null,
      "changed": [
        "docs/tickets/TICK-007.md: AC-1, AC-3, AC-4, AC-5, AC-8 checked [x]; full DoD checked; Oracle APPROVE issued; run comments updated"
      ],
      "how_to_test": [
        "Open the Learning overlay (npm run dev → localhost:5173).",
        "Click through all 10 chapters — each must show an Exercise section with a mini-canvas below the quiz.",
        "Chapter 1: click the output port of an Input.Number node, then click a compatible input port — a wire must appear.",
        "Try clicking an incompatible port type — nothing should happen, no partial wire.",
        "Submit a correctly completed exercise — green 'Correct! Well done.' banner must appear and the Next chapter button must be enabled.",
        "Submit an incomplete exercise — red 'Not quite — check your connections and try again.' banner must appear.",
        "Run: npm run test:e2e — 10/10 learning E2E specs must pass."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [],
  "blockers": [
    "TICK-008 remains draft — no task brief written and no agents dispatched yet. PM should confirm whether to proceed to Sprint A3 TICK-008 (Live agent dashboard) this sprint."
  ]
}
```
