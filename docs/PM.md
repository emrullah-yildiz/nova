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
      "id": "TICK-004",
      "title": "Pattern nodes on surface",
      "status": "stale-active-copy-deleted",
      "issue": "\"Delete tck-04\" matched a stale active copy at docs/tickets/TICK-004.md while the canonical archived ticket already lives in docs/tickets/done/TICK-004.md as cancelled and superseded by TICK-005.",
      "changed": [
        "docs/tickets/TICK-004.md: deleted stale active duplicate",
        "docs/tickets/done/TICK-004.md: retained as historical archived record"
      ],
      "how_to_test": [
        "Confirm docs/tickets/TICK-004.md no longer exists.",
        "Confirm docs/tickets/done/TICK-004.md still exists and INDEX.md lists TICK-004 under Done as superseded by TICK-005."
      ]
    },
    {
      "id": "TICK-006",
      "title": "Learning page screenshots",
      "status": "in-progress",
      "issue": null,
      "changed": [
        "docs/tickets/TICK-006.md: marked as Sprint A3 focus with merged-to-develop status and fresh run comments"
      ],
      "how_to_test": [
        "Open the Learning page on develop.",
        "Click through all 10 chapters.",
        "Confirm all 20 example slots show correct real Nova screenshots with no broken placeholders."
      ]
    },
    {
      "id": "TICK-007",
      "title": "Learning page interactive exercises",
      "status": "in-progress",
      "issue": null,
      "changed": [
        "docs/tickets/TICK-007.md: marked as Sprint A3 focus with merged-to-develop status and fresh run comments"
      ],
      "how_to_test": [
        "Open the Learning overlay on develop.",
        "Verify all 10 chapters contain the mini-canvas exercise.",
        "Try compatible and incompatible wiring, submit correct and incorrect solutions, and check 1280x800 layout."
      ]
    },
    {
      "id": "TICK-009",
      "title": "Select.Faces — per-face hover, selection, and Mesh3 surface output",
      "status": "archived-cleanup",
      "issue": null,
      "changed": [
        "docs/agent-workboard.md: released stale TICK-009 active claim",
        "docs/task-briefs/T09*.md: removed task briefs for archived TICK-009"
      ],
      "how_to_test": [
        "Confirm docs/tickets/done/TICK-009.md exists.",
        "Confirm no T09 task briefs remain under docs/task-briefs/.",
        "Confirm docs/agent-workboard.md has no active TICK-009 claim."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [],
  "blockers": [
    "TICK-006 is not archived because Planning did not include APPROVE TICK-006 and Oracle approval is still unchecked.",
    "TICK-007 is not archived because Planning did not include APPROVE TICK-007 and manual AC-1, AC-3, AC-4, AC-5, and AC-8 remain unchecked.",
    "TICK-008 remains draft and was not dispatched."
  ]
}
```
