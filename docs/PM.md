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
- Approving/Canceling the selections does not switch the view to 2D node view.
- Make sure tests are green for hovering. 

### Coordinator Response

```json
{
  "ticket": "TICK-009",
  "branch": "fix/tick-009h-hover-orbit-fix",
  "status": "ready-for-pm-review",
  "agent": "switch",
  "date": "2026-06-08",
  "fixes_applied": [
    {
      "bug": "Approve/Cancel did not return to node view",
      "file": "src/ui/node-renderer.js",
      "change": "Added app.setView('nodes') to both approve and cancel callbacks in _activateNodeSelection"
    },
    {
      "bug": "Face opacity had no visual effect (transparent flag missing)",
      "file": "src/geometry/geometry-lib.js",
      "change": "Added transparent: true, opacity: 0.85 to the MeshBasicMaterial base in toSelectionMesh() — opacity was set but had no effect without transparent:true"
    }
  ],
  "already_present_in_branch": [
    "triangleToGroup parallel-array fix — hit.faceIndex now resolves correct face group for hover",
    "Orbit drag guard: pointerdown/pointermove/pointerup replaces mousedown/click",
    "_swapToFaceMeshes: body mesh replaced with per-group selection mesh on activation"
  ],
  "quality_gate": {
    "lint": "✅ 0 errors",
    "unit_geometry_selection": "✅ 41/41 passed",
    "full_unit": "✅ 1914 passed, 1 skipped",
    "build": "✅ green",
    "full_e2e": "✅ 32/32 passed"
  },
  "how_to_test": [
    "1. npm run dev → http://localhost:5173",
    "2. Add Box.ByCenterWidthDepthHeight node → run graph → switch to 3D view — box renders solid",
    "3. Add Select.Faces node → click Select button",
    "4. App switches to 3D view; box now shows as decomposed teal faces (semi-transparent 0.85)",
    "5. Move mouse over a face → face turns blue",
    "6. Click a face → turns green, toolbar shows 1 selected",
    "7. Click again → deselects, counter decrements",
    "8. Orbit drag → selection count does NOT change",
    "9. Click empty space → counter resets to 0",
    "10. Click Approve → app returns to node view; Select.Faces button shows count",
    "11. Click Select again, then Cancel → app returns to node view"
  ],
  "note": "PM tests on develop after merge. Do not merge without PM test confirmation."
}
```
