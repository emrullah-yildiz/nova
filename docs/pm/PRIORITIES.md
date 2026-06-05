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

## This sprint - Sprint A1

1. **Ticket + PM architecture** — Morpheus writes and tracks tickets. I give goals, agents deliver.
2. **Select Faces/Edges/Points — full verification** — Confirm the wiring fix works end-to-end in the browser; add Playwright spec.
3. **Testing infrastructure** — Every UI feature must have a Playwright E2E spec before merge.
4. Make sure that Pattern nodes can work with given surface. The output is showing every panel, voronoi cell individually with their points and surface

## Next sprint
- Create a live app connected to this repo that shows how agents are working, what they are current doing, connection between tasks(if there is a sequence), how much token is being used currently(estimated). The app should start working when I say Run on the chat. It should look futuristic with high level animations. 
- Learning page screenshots — real Nova canvas screenshots in the 20 screenshot slots.
- Learning page interactive exercises — mini-canvas inside learning overlay. Create puzzled nodes and ask users to combine them on the mini canvas and submit the solution to be approved. 

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
