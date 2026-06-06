# Nova — PM Priorities

> **You own this file.** Edit it when goals change. Then say **"run"** in Claude Code.
> Morpheus reads this, creates tickets with acceptance criteria, and dispatches agents.
>
> Rules:
> - "This sprint" = work starting now. Keep it to 3–5 items.
> - "Next" = committed but not started yet.
> - "Backlog" = ideas, not scheduled.
> - Write what you want to achieve (user-facing outcome), not how to implement it.

---

## This sprint - Sprint A2

1. **Select.Faces per-face selection** — When a mesh object exists in the scene, activating Select.Faces mode must let the user hover individual faces (each face highlights blue on hover), click to select them (turns green, counter increments), click again to deselect (counter decrements), click empty space to clear all (counter resets to 0). Output must be the selected face(s) as real planar geometry. The mesh displays as a unified whole in normal mode — only selection mode decomposes it into individually-selectable faces using Three.js BufferGeometry groups + per-face materials.

## Next sprint - Sprint A3
- Learning page screenshots — real Nova canvas screenshots in the 20 screenshot slots (TICK-006, in-progress on develop, needs PM sign-off).
- Learning page interactive exercises — mini-canvas inside learning overlay with real Nova nodes (TICK-007, in-progress on develop, needs PM sign-off).
- Live agent dashboard — futuristic real-time view of agent activity (TICK-008, draft).
- Create a live app connected to this repo that shows how agents are working, what they are currently doing, connection between tasks (if there is a sequence), how much token is being used currently (estimated). The app should start working when I say Run on the chat. It should look futuristic with high level animations.

## Backlog

- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto).
- R2 storage for large mesh artifacts.
- Learning page interactive exercises — mini-canvas inside learning overlay.
- Mobile layout — out of scope until collab ships.

---

## Product constraints (always apply)

- No features that require  Rhino to test — host and Rhino nodes stay legacy.
- Every design follows rules of Style.md
- Nova geometry only for Select nodes — no Revit/Rhino element picking.
- Every UI change ships with a Playwright spec.
- Agents never merge to `main` without explicit PM instruction.
