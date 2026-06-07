# Nova — PM Workspace

> **This is your single working document.** Sprint planning lives here. Ticket responses appear here after agents complete work. Your comments on each ticket go in the "Your Comments" block below each response. When you say **"run"**, Morpheus reads this file — it processes your comments, creates new tickets, and dispatches agents.
>
> You never need to open a ticket file. Everything you need to read and write is here.

---

## How to use this document

| You want to… | Do this |
|---|---|
| Plan this sprint | Edit "This Sprint" below |
| Add backlog ideas | Edit "Backlog" below |
| Review what agents built | Read "Ticket Responses — Awaiting Your Review" |
| Give feedback on a ticket | Write in the **"Your Comments"** block under that ticket, then say **"run"** |
| Approve a ticket | Write **"Approved"** (or any positive verdict) in Your Comments, then say **"run"** |

Morpheus reads **Your Comments** on every "run":
- **Positive / Approved** → archives the ticket, moves response to Processed History
- **Bug / Missing behavior** → reopens ticket, agents fix on a new branch, response appears here again
- **New sprint items** → creates tickets with acceptance criteria, shows them to you before work starts

---

## Product constraints (always apply)

- No features requiring Rhino to test — Host/Revit/Rhino nodes stay legacy.
- Every design follows `docs/STYLE.md` — agents must confirm this before responding.
- Nova geometry only for Select nodes — no Revit/Rhino element picking.
- Every UI change ships with a Playwright E2E spec that passes locally before merge.
- Agents never merge to `main` without explicit PM instruction.
- Brand voice: approachable, expert, clean. No jargon without explanation in user-facing copy.

---

## This Sprint — Sprint A2

1. **Select.Faces per-face selection** — When a mesh object exists in the scene, activating Select.Faces mode must let the user hover individual faces (each face highlights blue on hover), click to select them (turns green, counter increments), click again to deselect (counter decrements), click empty space to clear all (counter resets to 0). Output must be real geometry (Mesh3) compatible with downstream mesh-input nodes. The mesh displays as a unified whole in normal mode — only selection mode decomposes it into individually-selectable faces.

---

## Next Sprint — Sprint A3

- Learning page screenshots — real Nova canvas screenshots in the 20 screenshot slots (TICK-006, merged, needs PM sign-off)
- Learning page interactive exercises — mini-canvas inside learning overlay with real Nova nodes (TICK-007, merged, needs PM sign-off)
- Live agent dashboard — futuristic real-time view of agent activity (TICK-008, draft)

---

## Backlog

- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto)
- R2 storage for large mesh artifacts
- Mobile layout — out of scope until collab ships

---

## Ticket Responses — Awaiting Your Review

> Agents write here after each delivery. Read the summary, test the feature, then add your comments and say **"run"**.

---

### TICK-009 — Select.Faces per-face selection

**Status:** Merged to develop — awaiting PM re-test
**Sprint:** A2 | **Priority:** High

#### What was built
Three rounds of fixes merged to develop:
1. **Core fix**: Edge wires (LineSegments) were intercepting all raycasts — faces could never be hit. Fixed by restricting raycaster candidates to selection meshes only when face mode is active.
2. **UX fix**: Orbit drag was triggering face add/remove on mouse release. Fixed with drag-distance guard. Face colors changed from lit (MeshPhongMaterial) to flat (MeshBasicMaterial) per PM request.
3. **Output fix**: `Select.Faces` output port changed from `Face[]` (custom descriptor) to `Mesh3` — same format as Surface nodes, wirable into any mesh-input node.

#### How to test
1. `npm run dev` → open `http://localhost:5173`
2. Add `Box.ByCenterWidthDepthHeight` → connect to viewer
3. Add `Select.Faces` → click **Select**
4. Hover faces — each should turn blue (flat, no shadows)
5. Click a face — turns green, counter shows "1 face selected"
6. Orbit (drag-rotate) — counter must NOT change
7. Click empty space — counter resets to 0
8. Select 2–3 faces → click **Approve**
9. Wire `Select.Faces.faces → Output.Watch` → confirm output shows `Mesh3(N verts, N faces)`

#### What agents tested
- ✅ Unit tests: 1914 passing (geometry-lib face grouping, Select.Faces execute with Mesh3)
- ✅ Playwright E2E: AC-4 (approve flow), AC-9 (Mesh3 output), orbit no-reset (AC-T09b-8)
- ✅ Lint: 0 errors | Build: green
- ⚠️ **Not yet confirmed**: face hover highlight (blue) visible in real browser — reported as broken in last PM test

#### Known issues reported by PM (still open)
1. **Orbit still adds/removes faces** — drag guard may not be catching pointer events correctly (Three.js OrbitControls uses `pointerdown`, our guard listens on `mousedown`)
2. **No face highlighting** — colors may not be updating because the viewer render loop needs an explicit trigger after `mat.color.set()`

#### Next steps enabled with this output
- `Select.Faces.faces (Mesh3)` → `Transform.Move`, `Transform.Rotate` — move selected face
- `Select.Faces.faces (Mesh3)` → `Boolean.Difference` — subtract selected region
- `Select.Faces.faces (Mesh3)` → `Surface.Offset` — offset selected face outward

#### Your Comments
<!-- Write here. Morpheus reads on next "run". Examples: "Approved", "The blue highlight still doesn't appear", "Orbit is still adding faces" -->


---

### TICK-006 — Learning page screenshots

**Status:** Merged to develop — awaiting PM sign-off
**Sprint:** A3 | **Priority:** High

#### What was built
Programmatic screenshot script (`scripts/take-learning-shots.js`) that builds all 20 learning example graphs and saves screenshots to `public/learning/<slot-id>.png`.

#### How to test
Open the learning page in `http://localhost:5173`, navigate each chapter, confirm screenshots appear in the correct slots.

#### What agents tested
- ✅ Unit tests passing | Build green
- ✅ Screenshots generated for all 20 slots

#### Next steps enabled
- Learning page interactive exercises (TICK-007) depend on this being done

#### Your Comments
<!-- Write here. -->


---

### TICK-007 — Learning page interactive exercises

**Status:** Merged to develop — awaiting PM sign-off
**Sprint:** A3 | **Priority:** High

#### What was built
Mini-canvas component inside the learning overlay — real Nova nodes wired together with pass/fail feedback on submit.

#### How to test
Open learning page → select a chapter with an exercise → draw the required wires → click Submit → confirm green pass / red fail feedback.

#### What agents tested
- ✅ Unit tests passing | Build green | E2E: learning-interactive.spec.js passing

#### Next steps enabled
- Add more exercises per chapter
- Add score/progress tracking

#### Your Comments
<!-- Write here. -->


---

## Processed History

> Morpheus moves reviewed and resolved rounds here. Read-only for PM.

| Ticket | Round | PM Verdict | Date |
|---|---|---|---|
| TICK-005 | Remove Pattern nodes | Approved | 2026-06-06 |
| TICK-003 | E2E testing infrastructure | Approved | 2026-06-05 |
| TICK-002 | Selection E2E verification | Superseded by TICK-009 | 2026-06-07 |
