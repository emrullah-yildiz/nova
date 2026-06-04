# Nova — Legal & Data documents (DRAFTS)

> ⚠️ **THESE ARE DRAFTS, NOT LEGAL ADVICE.** They were prepared by engineering to
> accurately describe what the Nova software actually does with data, so that
> qualified counsel has a factual, implementation-grounded starting point. **Do not
> publish them as-is.** Have a lawyer review and finalize before they go live, and
> fill every `[BRACKETED PLACEHOLDER]` (only you/counsel can supply those facts).

These mirror a versioned `/legal` portal (like the reference example): each document
carries version/effective-date/owner metadata and numbered sections.

| Document | Covers | Security ticket |
|---|---|---|
| [privacy-policy.md](privacy-policy.md) | what personal data we process, lawful basis, your rights, retention | SEC-001, SEC-007, SEC-014 |
| [data-handling.md](data-handling.md) | data map, sub-processors, AI data flow, international transfers, security measures (TOMs), retention | SEC-002, SEC-003, SEC-006, SEC-009 |
| [ip-and-ownership.md](ip-and-ownership.md) | you own your designs; we own the platform; AI/OSS/feedback | — |
| [cookie-notice.md](cookie-notice.md) | the one essential session cookie; no tracking | SEC-001 |
| [terms-of-service.md](terms-of-service.md) | accounts, acceptable use, disclaimers (skeleton) | SEC-001 |

## Placeholders you/counsel must fill
- `[LEGAL ENTITY]` — the company/sole-trader name that operates Nova and is the data controller.
- `[JURISDICTION]` — governing law / country of establishment (and whether you have an EU establishment or need an EU/UK representative under GDPR Art. 27).
- `[PRIVACY CONTACT EMAIL]` — a real inbox for privacy/DSAR requests (e.g. privacy@hi-nova.work).
- `[POSTAL ADDRESS]`, `[EFFECTIVE DATE]`, `[DPO or "not appointed"]`.
- Confirm/adjust the **lawful bases** in the Privacy Policy and whether you need consent for the AI features.
- Confirm each **sub-processor's DPA / SCCs** are actually signed (the docs list who they are; you must hold the agreements).

## Known factual anchors (true as of this draft, from the codebase)
- Primary personal-data store: **Neon Postgres in Ireland (EU)**.
- Sessions / email-verification tokens / rate-limit buckets: **Cloudflare KV** (global edge), now **isolated per environment** (dev ≠ prod).
- Compute & static assets: **Cloudflare Workers** (global edge); production domain `hi-nova.work` is HTTPS-only (HSTS).
- AI assistant sends prompts + graph context to **third-party AI providers (US)** — see data-handling.md §AI.

## Publishing
These are the content source of truth in Markdown. To surface them in-app, render
them at `/legal/<slug>` routes (a small UI task) with a footer link — out of scope
for this drafting pass; flag it if you want it wired up.
