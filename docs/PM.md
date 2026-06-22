# Nova — PM

> **This is the only file you edit.** Never touch ticket files, ARCHITECTURE.md, RULES.md, or any other doc directly.
>
> **How to use:**
> - Edit the **Sprint** section when goals change.
> - Before saying `run` in chat: write what you want this run in `### Planning` (replace the old text).
> - To approve a completed ticket: write `APPROVE TICK-NNN` in Planning.
> - Morpheus reads this file, acts, and writes the result into `### Coordinator Response`.

---

## Sprint A4

1. Create Surface paneling nodes. Surface.Panelize -> Inputs: Surface and Panel shape. This node can divide surface into multiple panels based on the given shape. The shape can be any polygon or closed curve. The properties of this node should include scale parameter to scale the shape onto surface. there should be a supportive node with premade shapes likes diagonal, rectangle, square, hexagon, circle etc. The node should be called Input.PanelShapes. It should include a dropdown with different premade panel shapes. The output of the node should give surfaces of panels, corner points of each panel and centre point of panels. 
2. Create Surface.PointAtParameter node to create points on the surface. The inputs are Surface, U and V values. 
   

## Backlog

- TICK-006 — Learning page screenshots (content-aligned, all 20 slots match chapter text).
- TICK-007 — Learning page interactive exercises (pan/zoom mini-canvas, drag-wire UX, real nodes).
- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto).
- R2 storage for large mesh artifacts.
- Mobile layout — out of scope until collab ships.
- Select Edges can select mesh edges with similar behaviour of Select Faces node.

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
- Tck 14-15 is completed. Move them to the done.
- Stay on hold for the next sprint. 
  


### Coordinator Response

```json
{
  "run": "2026-06-19",
  "tickets_actioned": [
    {
      "id": "TICK-014",
      "title": "Surface paneling — Surface.Panelize + Input.PanelShapes",
      "status": "archived",
      "issue": null,
      "changed": [
        "Shipped Input.PanelShapes (Input category): dropdown shape source with Diagonal/Rectangle/Square/Hexagon/Circle, single Shape output (closed polygon/curve per selection).",
        "Shipped Surface.Panelize (Surfaces category): inputs Surface/Shape/U/V/Scale (Scale also a control property); outputs Panels (panel surfaces), Corners (per-panel corner points), Center (one centre per panel). Tiles a unit shape across the surface UV domain; panels render via the existing Geo.addToScene mesh path.",
        "Post-merge improvements from live PM verification (not separately ticketed): Surface.ByPatch bilinear-bbox UV so a uniform u×v grid fills the patch interior instead of polar spokes (better panel distribution), plus gap-free hexagon honeycomb and diamond tessellations so panels tile without gaps/overlap."
      ],
      "how_to_test": [
        "On develop (tip ~8300cbb): npm run dev, add Input.PanelShapes — confirm dropdown lists Diagonal/Rectangle/Square/Hexagon/Circle and the Shape output changes per option.",
        "Wire Surface.ByPatch -> Surface.Panelize (Shape=Square from Input.PanelShapes) -> Output.Watch; confirm multiple panel surfaces tile the surface in the 3D viewport.",
        "Change Scale and confirm panel size + corner-point spread change. Inspect Corners (per-panel groups) and Center (one per panel).",
        "npm run lint:all (0) && npm run test (~1975 pass) && npm run build (green) && npm run test:e2e (~53 pass; surface-paneling.spec.js covers AC-4/AC-6/AC-7)."
      ]
    },
    {
      "id": "TICK-015",
      "title": "Surface.PointAtParameter — rename of Surface.PointAtUV",
      "status": "archived",
      "issue": null,
      "changed": [
        "Renamed Surface.PointAtUV -> canonical Surface.PointAtParameter (Surfaces → Evaluate; Surface + u + v -> Point; kernel pointAtUV unchanged). Exactly one selectable node ships.",
        "Backward compatibility via the proven Custom.Formula -> Custom.CodeBlock pattern: aliases on the canonical def so old node-ids and library search ('PointAtUV') resolve, plus a hidden deprecated Surface.PointAtUV stub with metadata.deprecated + metadata.migrateTo so old saved graphs migrate at load (u/v + wires preserved). Oracle fixes F-015-1 (alias) + F-015-2 (search-alias) folded in.",
        "Viewer fixes from live PM verification (not separately ticketed) that make the output point reliably visible: show all geometry on Run (dropped intermediate auto-hide), buildFromGraph renders multi-output nodes (split-mode Run refresh), camera auto-fits once instead of every re-render, and points render as small flat dots rather than 3D spheres."
      ],
      "how_to_test": [
        "On develop (tip ~8300cbb): npm run dev, search the node library for 'PointAtParameter' AND for 'PointAtUV' — both find the one node Surface.PointAtParameter.",
        "Wire Surface.ByPatch -> Surface.PointAtParameter (u=0.5, v=0.5) -> Output.Watch; confirm a readable Point3 (real coords, not [object Object]/NaN) and a visible point sitting ON the surface in the 3D viewport.",
        "Load a graph saved with the OLD Surface.PointAtUV node -> confirm it opens and migrates, u/v + wires preserved.",
        "npm run lint:all (0) && npm run test (~1975 pass) && npm run build (green) && npm run test:e2e (~53 pass; surface-pointatparameter.spec.js covers AC-5 visible point in 3D)."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [],
  "planning_notes": [
    "Both A4 goals are delivered and archived: Surface paneling (Surface.Panelize + Input.PanelShapes) and Surface.PointAtParameter. All ACs [x], merged to develop (tip ~8300cbb), Oracle APPROVE, full gate green (lint 0, ~1975 unit pass, build green, ~53 e2e pass).",
    "Holding per PM — no new tickets created and no agents dispatched this run.",
    "CORRECTION: the prior Coordinator Response's 'repo-wide vitest runner broken' blocker was a MISDIAGNOSIS — the HTMLCanvasElement.getContext() lines are benign jsdom stderr noise, not test failures. The suite runs clean. That narrative has been removed from the ticket Run comments and is void.",
    "Unticketed follow-up fixes landed live on develop from PM verification (FYI — these bypassed the ticket flow because they were interactive bug fixes): (1) Code Block series #count semantics corrected to Dynamo convention (0..1..#5 = 5 evenly-spaced, 0..#5..1 = step); (2) Surface.ByPatch bilinear-bbox UV grid; (3) Surface.Panelize gap-free hexagon honeycomb + diamond tessellation; (4) viewer: show-all-on-Run, multi-output/nested array rendering incl. Panelize corners, split-mode Run refresh, camera fit-once, flat point dots. RECOMMENDATION: PM to decide whether to retro-ticket these for the record.",
    "TICK-011 (Cosign code signing) remains DRAFT, untouched — awaits APPROVE TICK-011 if the PM wants it built."
  ],
  "blockers": []
}
```
