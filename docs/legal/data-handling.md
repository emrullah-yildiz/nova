# Data Handling & Sub-processors

> **Version 1.0 · Effective June 4, 2026.** Implementation-grounded (verified against
> the code); prepared in good faith without a lawyer — not legal advice. Before relying
> on this publicly, **accept and file a DPA with each sub-processor** (§2) and have
> counsel review for significant/commercial use.

| | |
|---|---|
| **Version** | 1.0 |
| **Effective date** | June 4, 2026 |
| **Operator** | Nova (independent individual; no incorporated entity yet) |

This document explains, in plain terms, **what data Nova holds, where it lives, who
processes it, and how it's protected.** It complements the
[Privacy Policy](privacy-policy.md).

## 1. Data map — what we store and where
| Data | Where it's stored | Notes |
|---|---|---|
| Account (email, password **hash**, display name) | Neon Postgres — **Ireland (EU)** | password hashed (PBKDF2); never plaintext |
| Projects, node graphs, versions | Neon Postgres — **Ireland (EU)** | your content |
| Organizations, members, roles, invites/share links | Neon Postgres — **Ireland (EU)** | collaboration |
| Audit log (security events) | Neon Postgres — **Ireland (EU)** | user id/email anonymized on account deletion |
| Sessions, email-verification tokens, rate-limit counters | Cloudflare KV — **global edge** | stored as hashes; short-lived; **isolated dev ≠ prod** |
| Real-time collaboration room state | Cloudflare Durable Objects — **global edge** | transient session/cursor/graph state |
| Encrypted "bring-your-own" AI key + AI prefs | Neon Postgres — **Ireland (EU)** | **AES-GCM encrypted** at rest |
| Static app assets / compute | Cloudflare Workers — **global edge** | the SPA + API |

## 2. Sub-processors
We use the following third parties to operate Nova. Each one's Data Processing
Agreement (DPA) — including its Standard Contractual Clauses for transfers — is
incorporated into its standard terms, which apply to our account.

| Sub-processor | Role | Personal data it processes | Location | DPA / SCCs |
|---|---|---|---|---|
| **Cloudflare, Inc.** | Hosting (Workers), session/token/rate store (KV), real-time rooms (Durable Objects), CDN, DNS | Account & session identifiers; all request traffic; KV-stored session/verification/rate data | Global edge (HQ US) | Cloudflare DPA, incorporated into the self-serve Subscription Agreement (cloudflare.com/cloudflare-customer-dpa) |
| **Neon, Inc.** | Serverless Postgres database | Account, projects, collaboration, audit, encrypted AI key | **EU — Ireland** | Neon DPA (neon.tech legal / DPA) |
| **Google LLC** | "Sign in with Google" (OIDC) **only** | email, name, Google account id | US | Google Cloud/Workspace Data Processing Addendum (cloud.google.com/terms/data-processing-addendum) |
| **Resend** | Transactional email (account verification, invitations) | Recipient email address + email content | US | Resend DPA (resend.com legal) |

*(Maintenance notes: (1) keep this table current — adding/removing a sub-processor is
a notify-users event. (2) The DPA links above are the canonical locations; keep the
exact current URL/acceptance on file for accountability — each provider auto-applies
its DPA via its terms, but you should be able to produce it on request.)*

> **AI providers are NOT Nova sub-processors.** Nova operates no shared or free AI
> service and stores no AI key of its own. The assistant is **bring-your-own-key only**:
> your browser sends your prompt **directly** to the provider *you* configure (OpenAI,
> Anthropic, OpenRouter, Google Gemini, or Groq) under *your* account — Nova's servers
> never receive or relay it (see §3). Google appears in the table above for **sign-in
> only**; using Google Gemini as your own AI key is the BYOK case in §3, not this table.

## 3. AI assistant — what leaves Nova (important)
Nova's AI assistant is **bring-your-own-key (BYOK) only.** Nova does **not** operate a
shared or free AI service and stores no AI key of its own; AI is available only if
**you** add your own API key for a provider (OpenAI, Anthropic, OpenRouter, Google
Gemini, or Groq).

When you use it, **your browser sends your prompt and the relevant parts of your node
graph directly to the provider you configured**, using your own key. **Nova's servers
(Cloudflare / Neon) are not in that path** — we neither receive, relay, nor log the AI
request. We only store your API key (encrypted, in the EU) so the browser can make
those calls, and you can wipe it any time via *Settings → Disconnect / Clear keys*.

Because it's **your** key and **your** provider, that AI processing is between you and
that provider, under their terms and retention policy — review theirs if your designs
are sensitive. We do not use your content to train any model. You can avoid AI
processing entirely by not adding a key.

## 4. International transfers
Your **primary personal data (account, projects) is stored in the EU (Ireland)** via
Neon. Processing outside the EEA/UK is limited to these Nova-controlled transfers:
1. **Cloudflare's global edge** may process request data and cache session/token/rate
   entries at the nearest location worldwide.
2. **Resend** (US) when verification/invitation emails are sent.
3. **Google** (US) for "Sign in with Google".

For these we rely on the providers' **Standard Contractual Clauses and data-processing
agreements**. Separately, **BYOK AI** sends data from your browser to the provider
*you* chose (often US) — that transfer is under *your* arrangement with that provider,
not Nova's.

## 5. Security measures (technical & organizational — "TOMs" summary)
- **In transit:** HTTPS/TLS everywhere; HSTS enforced on production (`hi-nova.work`).
- **At rest:** passwords salted+hashed (PBKDF2, constant-time comparison); stored
  "bring-your-own" AI keys encrypted (AES-GCM); database managed by Neon (EU).
- **Sessions/cookies:** session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`; no
  third-party tracking cookies (see [Cookie Notice](cookie-notice.md)).
- **Access & abuse controls:** per-account tenant scoping on the API; brute-force
  rate-limiting and lockout on authentication; a strict Content-Security-Policy and
  hardening headers on the app.
- **Sensitive operations:** writes back to a connected CAD host (e.g. Revit) require a
  **server-issued, single-use approval token** and are recorded in an audit log (audit
  is a precondition of the write).
- **Isolation:** development and production use **separate** databases (Neon) and
  **separate** Cloudflare KV namespaces, so non-production activity cannot touch real
  user sessions or data.
- **Erasure:** deleting your account purges your sessions and verification tokens and
  removes your projects; retained audit entries are anonymized.
- **Supply chain:** dependencies are vulnerability-audited; secrets are kept in managed
  secret stores, never in source code.

*(Still to formalize as the project matures: a written breach-detection & notification
process (GDPR 72h) and backup/recovery using Neon point-in-time recovery — SEC-009;
audit-log retention/tamper-resistance — SEC-006.)*

## 6. Retention
See [Privacy Policy §6](privacy-policy.md). Sessions/tokens are short-lived;
account/project data persists until deletion (or within 30 days of account closure);
audit logs retained 12 months.

## 7. Contact
Data-handling questions: **nova.support@hi-nova.work**.
