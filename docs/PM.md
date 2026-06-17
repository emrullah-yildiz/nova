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

1. The project is open source now and I need the installation file to have code signature so that when people download it Microsoft will not throw security error. Use Cosign and Sigstore
   

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
- Update screenshots to be related with the topic of the learning content. 
- Make sure that the interactive canvas i like a the Nova canvas where you can pan and move around. I need a web view there like Nova canvas. 
- MAke sure that the interactive examples contains real nodes not representatives. 


### Coordinator Response

```json
{
  "run": "2026-06-17",
  "tickets_actioned": [],
  "new_tickets": [
    {
      "id": "TICK-011",
      "title": "Installer — Cosign/Sigstore keyless code signature for open-source release",
      "ac_preview": [
        "AC-1  A GitHub Actions release workflow job runs cosign sign-blob (keyless, OIDC-backed) on the compiled .msi and uploads the .sig and .pem bundle alongside the .msi in the GitHub Release assets.",
        "AC-2  The release job fails (exit non-zero) if cosign sign-blob returns a non-zero exit code, preventing an unsigned artifact from being published silently.",
        "AC-3  A docs/architecture/codesigning.md file explains how to verify a downloaded .msi using cosign verify-blob, including the exact command a user would run.",
        "AC-4  The existing CI jobs (lint, test, security, deploy-dev, deploy-production) are unchanged — no existing job step is removed, reordered, or given new required dependencies.",
        "AC-5  No private key material, certificate file, or secret is committed to the repository; signing is purely OIDC-based (GitHub Actions OIDC token) with no stored credentials."
      ]
    }
  ],
  "agents_dispatched": [],
  "planning_notes": [
    "Planning section mentions updating learning screenshots (TICK-006) and making the interactive canvas real (TICK-007). Both tickets are currently paused in the backlog. They can be resumed — write APPROVE TICK-006 and/or APPROVE TICK-007 in Planning (once the prior work is confirmed done) or confirm AC to move them to ready. No new ticket was created for these items as TICK-006 and TICK-007 already cover them.",
    "TICK-011 is new (draft) — awaiting PM AC confirmation before agents are dispatched."
  ],
  "blockers": [
    "TICK-011 is draft — agents will not be dispatched until PM confirms AC by writing APPROVE TICK-011 in Planning on the next run.",
    "TICK-006 and TICK-007 are paused. To resume either one, write their ticket id in Planning and say run."
  ]
}
```
