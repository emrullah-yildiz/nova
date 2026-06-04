# Nova — Legal & Data documents

> **Status: Version 1.0 · Effective June 4, 2026.** These documents are written to
> **accurately describe what the Nova software actually does with data** (verified
> against the codebase). They were prepared in good faith **without a lawyer**. They
> are a solid, honest baseline — but they are **not legal advice**, and before any
> significant or commercial use you should have them reviewed by counsel (see "Honest
> open items" below).

A `/legal` set, each document carrying version/effective-date/owner metadata and
numbered sections.

| Document | Covers | Security ticket |
|---|---|---|
| [privacy-policy.md](privacy-policy.md) | what personal data we process, lawful basis, your rights, retention | SEC-001, SEC-007, SEC-014 |
| [data-handling.md](data-handling.md) | data map, sub-processors, AI data flow, international transfers, security measures (TOMs), retention | SEC-002, SEC-003, SEC-006, SEC-009 |
| [ip-and-ownership.md](ip-and-ownership.md) | you own your designs; we own the platform; AI/OSS/feedback | — |
| [cookie-notice.md](cookie-notice.md) | the one essential session cookie; no tracking | SEC-001 |
| [terms-of-service.md](terms-of-service.md) | accounts, acceptable use, disclaimers | SEC-001 |

## Operator & contact
Nova is currently operated by an **independent individual** — there is **no
incorporated company yet**. All legal/privacy/support contact goes to a single inbox:
**nova.support@hi-nova.work**.

## Decisions baked into v1.0
- **Effective date:** June 4, 2026 · **Next review:** June 4, 2027.
- **No legal entity** — the operator is the natural person running Nova; that person is
  the data controller. Contact is by email (no business postal address).
- **Primary data store: Neon Postgres in Ireland (EU).** Sessions/tokens/rate in
  Cloudflare KV (now isolated dev ≠ prod). Compute on Cloudflare Workers.
- **AI is bring-your-own-key only** — no Nova free tier, no Nova-held AI key; the
  browser calls the user's chosen provider directly, so AI providers are **not** Nova
  sub-processors.
- **Sub-processors (4):** Cloudflare, Neon (EU/Ireland), Google (sign-in only), Resend.
- DPO: not appointed (not required at this scale). Age floor: 16.

## Honest open items (what a lawyer/owner should still address)
These are genuinely beyond what an engineer can settle — listed plainly rather than
hidden:
1. **No legal entity = no liability shield.** Operating as an individual means there's
   no company between you and any claim. Fine for an early/free project; revisit
   (incorporate) before charging money or scaling.
2. **You still have GDPR duties** because you process EU personal data (EU users +
   Neon in Ireland) — the docs reflect this, but the *liability/warranty/governing-law*
   clauses in the Terms and the precise lawful-basis wording are where professional
   review matters most.
3. **Governing law / jurisdiction** follows where the operator is established — set
   this explicitly once known (it's the one true blank left in the Terms).
4. **EU Art. 27 representative**: only needed if the operator is established *outside*
   the EU/UK while serving EU users — confirm based on your location.
5. **Sign & file DPAs** with the 4 sub-processors (mostly click-accept).

## Publishing
Markdown is the source of truth. To surface these in-app, render at `/legal/<slug>`
with a footer link (a small UI task — flag it if you want it wired up).
