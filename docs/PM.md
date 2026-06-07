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
- Nodes returns meshes whose surface/edges can be picked by Select.Faces and Select.Edges nodes. 

---

## Run Session

### Planning

- Select.Faces node does not highlight the surfaces when the mouse is hovered.
- The node returns single mesh even though multiplace faces are selected. Accepted behaviour is that it needs to return meshes per faces.
- Approving the selection should bring back to the 2D node view. 

### Coordinator Response

```json
{
  "run": "2026-06-07",
  "tickets_actioned": [
    {
      "id": "TICK-009",
      "title": "Select.Faces — per-face hover, selection, and planar face output",
      "status": "in-progress",
      "issue": "Three PM-reported bugs: (C) hover highlight not working, (D) output is a single mesh instead of one Geo.Mesh3 per face, (E) Approve does not return to 2D node view.",
      "changed": ["Task brief T09e created", "Branch fix/tick-009c-hover-output-approve dispatched to switch agent"],
      "how_to_test": [
        "npm run dev → open localhost:5173",
        "Create Box node → add Select.Faces → click Select",
        "Bug C: hover over faces — each face must turn blue",
        "Bug D: select 2 faces → Approve → wire Output.Watch to output → must show 2 Geo.Mesh3 objects",
        "Bug E: after Approve, UI must return to the 2D node editor canvas automatically"
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [
    { "agent": "switch", "brief": "T09e-hover-output-approve", "branch": "fix/tick-009c-hover-output-approve" }
  ],
  "blockers": []
}
```
