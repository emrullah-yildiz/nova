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
- When the ticket approval is failed, agents should focus on creating related logs for tickets so that when there is something wrong, we can identify the problem. Do not try to track everything immediately. Understand the problem first. 

---

## Run Session

### Planning

- Select.Faces node still does not highlight the surfaces when the mouse is hovered.
- The node looks like succesfully selecting the faces. 
- Approving the selection brings back the 2D environment. 

### Coordinator Response

```json
{
  "run": "2026-06-07",
  "tickets_actioned": [
    {
      "id": "TICK-009",
      "title": "Select.Faces — per-face hover, selection, and planar face output",
      "status": "in-progress",
      "issue": "PM confirmed: face clicking and counter work correctly; Approve correctly returns to 2D. Hover highlight (face turns blue on mouseover) still not visible in browser. All automated E2E tests pass (32/32) including hover assertions — those tests inject a fake scene item and do not exercise the real toSelectionMesh() path. The real hover pipeline uses the actual Geo.Mesh3 from the Box node, and the code path from mousemove → selectionMeshHover → _requestRender may be silently failing at some point. Per PM constraint: add targeted debug logging first so we can see exactly where the hover pipeline breaks before attempting another fix.",
      "changed": [],
      "how_to_test": [
        "npm run dev → open localhost:5173 → open browser DevTools console",
        "Create Box node → add Select.Faces → wire Box.solid → Select.Faces.mesh → Run graph",
        "Click 'Select Faces...' button",
        "Open console and type: JSON.stringify(window.__novaHoverDebug) — should show swap and activate state",
        "Move mouse over the 3D viewport — console should log per-frame hover trace",
        "Look for: candidateCount, hitFound, groupIndex, renderCalled",
        "Report which step is 0/null/undefined — that is the exact failure point"
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [
    {
      "agent": "switch",
      "brief": "T09f",
      "branch": "fix/tick-009f-hover-debug-logging"
    }
  ],
  "blockers": []
}
```
