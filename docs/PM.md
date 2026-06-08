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

- Hovering on the mesh surface does not highlight the mesh surface. Use logs to detect the problem instead of guessing. 
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
      "issue": "T09i diagnostic agent ran all 7 [Nova diag] log checkpoints in the running browser. ALL checkpoints confirmed correct values: sceneItems=1, _mesh3 present and has groupFaces/toSelectionMesh, bodyMesh found via traverse, toSelectionMesh produces 6 faceGroups + 12 triangleToGroup entries (correct for a box), swap completes (original removed, selection mesh added), anySelMesh=true in hover handler, hover raycast finds candidateMeshes=1 with intersects=3, selectionMeshHover maps faceIndex→groupIndex correctly, and material colors confirm one face turns 0x89b4fa (blue) on hover while others stay 0x94e2d5 (teal). No code changes were needed — the T09h fixes are correct and complete. Screenshots confirm teal face decomposition and blue hover are both visually working on the branch.",
      "changed": [
        "docs/tickets/TICK-009.md: Run comments updated with T09i diagnostic log values and visual confirmation"
      ],
      "how_to_test": [
        "1. Merge fix/tick-009h-hover-orbit-fix to develop (quality gates all green: lint 0 errors, 1910 unit tests, 32/32 E2E, build green).",
        "2. npm run dev → http://localhost:5173",
        "3. Create Box.ByCenterWidthDepthHeight → run graph → switch to 3D view — box renders solid.",
        "4. Add Select.Faces → click Select button.",
        "5. EXPECT: toolbar shows 'Face selection active 0 selected', box shows semi-transparent teal faces (NOT solid grey).",
        "6. Move mouse over a face — EXPECT: that face turns blue, others stay teal.",
        "7. Click a face — EXPECT: turns green, counter shows '1 face selected'.",
        "8. Click same face again — EXPECT: deselects, counter shows '0 faces selected'.",
        "9. Orbit-drag — EXPECT: selection count does NOT change.",
        "10. Click empty viewport space — EXPECT: counter resets to '0 faces selected'.",
        "11. Click Approve — EXPECT: returns to node view."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [],
  "blockers": [
    "fix/tick-009h-hover-orbit-fix not yet merged to develop — PM must merge and test manually in the browser to confirm the visual bugs are resolved (automated tests pass, diagnostic logs confirm the pipeline is correct, but PM reported bugs on a prior build and must verify themselves)."
  ]
}
```
