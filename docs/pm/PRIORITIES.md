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

## This sprint

1. **Ticket + PM architecture** — Morpheus writes and tracks tickets. I give goals, agents deliver.
2. **Select Faces/Edges/Points — full verification** — Confirm the wiring fix works end-to-end in the browser; add Playwright spec.
3. **Testing infrastructure** — Every UI feature must have a Playwright E2E spec before merge.

## Next sprint

- Learning page screenshots — real Nova canvas screenshots in the 20 screenshot slots.
- AI codegen — structured node-list output instead of free Python (retire parser fragility).

## Backlog

- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto).
- R2 storage for large mesh artifacts.
- Learning page interactive exercises — mini-canvas inside learning overlay.
- Mobile layout — out of scope until collab ships.

---

## Product constraints (always apply)

- No features that require Revit or Rhino to test — host nodes stay legacy.
- Nova geometry only for Select nodes — no Revit/Rhino element picking.
- Every UI change ships with a Playwright spec.
- Agents never merge to `main` without explicit PM instruction.
