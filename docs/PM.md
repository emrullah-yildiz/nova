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

- Hovering on the mesh surface does not highlight the mesh surface. 
- The Select.Faces node does not show mesh surfaces separately. 


### Coordinator Response

```json
{
  "run": "2026-06-08",
  "tickets_actioned": [
    {
      "id": "TICK-009",
      "title": "Select.Faces — per-face hover, selection, and planar face output",
      "status": "pending-pm-merge-test",
      "issue": "Two visual bugs (faces appear opaque / not decomposed, hover highlight not visible) are caused by a missing `transparent: true` flag on the MeshBasicMaterial in toSelectionMesh(). Without it THREE.js ignores the opacity value entirely and the selection mesh renders identically to the solid body mesh — teal tint is invisible, and the hover color change is too subtle to notice. A second fix restores node view on Approve/Cancel. Both fixes are committed on branch fix/tick-009h-hover-orbit-fix which has NOT yet been merged to develop — the PM is testing the unfixed develop build.",
      "changed": [
        "src/geometry/geometry-lib.js — added transparent: true, opacity: 0.85 to MeshBasicMaterial in toSelectionMesh()",
        "src/ui/node-renderer.js — added app.setView('nodes') to approve and cancel callbacks in _activateNodeSelection",
        "src/viewer/geo-selector.js — triangleToGroup parallel-array fix; pointerdown/pointermove/pointerup orbit drag guard replaces mousedown/click"
      ],
      "how_to_test": [
        "1. Merge fix/tick-009h-hover-orbit-fix to develop first (or switch to the branch directly).",
        "2. npm run dev → http://localhost:5173",
        "3. Add Box.ByCenterWidthDepthHeight node → run graph → switch to 3D view — box renders solid.",
        "4. Add Select.Faces node → click Select button.",
        "5. App switches to 3D view; box now shows as decomposed semi-transparent teal faces (opacity 0.85) — faces are visually distinct from the body mesh.",
        "6. Move mouse over a face → that face turns blue.",
        "7. Click a face → turns green, toolbar shows '1 face selected'.",
        "8. Click again → deselects, counter decrements.",
        "9. Orbit drag → selection count does NOT change.",
        "10. Click empty space → counter resets to 0.",
        "11. Click Approve → app returns to node view; Select.Faces button shows count."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [],
  "blockers": [
    "fix/tick-009h-hover-orbit-fix not yet merged to develop — PM cannot test either bug fix until the branch is merged. Quality gates all green: lint 0 errors, 1914 unit tests, build green, 32/32 E2E. Safe to merge."
  ]
}
```
