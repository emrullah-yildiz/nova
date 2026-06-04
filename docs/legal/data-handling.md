# Data Handling & Sub-processors

> **DRAFT v0.1 — NOT YET IN EFFECT. Pending legal review.** Implementation-grounded,
> not legal advice. Confirm each sub-processor's signed DPA/SCCs and fill
> `[PLACEHOLDERS]` before publishing.

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Effective date** | `[EFFECTIVE DATE]` |
| **Document owner** | `[LEGAL ENTITY]` |

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
We use the following third parties to operate Nova. `[You must hold a signed DPA /
SCCs with each before relying on this list publicly.]`

| Sub-processor | Role | Personal data it processes | Location |
|---|---|---|---|
| **Cloudflare, Inc.** | Hosting (Workers), session/token/rate store (KV), real-time rooms (Durable Objects), CDN, DNS | Account & session identifiers; all request traffic; KV-stored session/verification/rate data | Global edge (HQ US) |
| **Neon, Inc.** | Serverless Postgres database | Account, projects, collaboration, audit, encrypted AI key | **EU — Ireland** |
| **Google LLC** | (a) "Sign in with Google" (OIDC); (b) Gemini AI *if you use it* | (a) email, name, Google account id; (b) your prompt + graph context | US |
| **Groq, Inc.** | Shared free-tier AI assistant proxy | Your prompt + graph context (only when you use free-tier AI) | US |
| **Resend** | Transactional email (verification, invitations) | Recipient email address + email content | US |
| **OpenAI / Anthropic / OpenRouter** | AI assistant — **only if you supply your own API key (BYOK)** | Your prompt + graph context, sent under your own provider account | US |

`[Keep this table current; adding/removing a sub-processor is a notify-users event.]`

## 3. AI assistant — what leaves Nova (important)
Nova has an optional AI assistant. **When you use it, the text of your prompt and the
relevant parts of your node graph/design are sent to a third-party AI provider** so it
can generate a response:
- **Free tier:** sent via our Worker to **Groq** and/or **Google Gemini** (US).
- **Bring your own key (BYOK):** sent **directly to the provider you configured**
  (OpenAI, Anthropic, OpenRouter, Google, or Groq) under **your own** account and that
  provider's terms; your key is stored encrypted and used only to make those calls.

Nova does **not** log your AI prompts by default, and does **not** use your content to
train any model. Each AI provider processes the data under its own terms and retention
policy — review theirs if your designs are sensitive. You can avoid AI processing
entirely by not using the assistant. `[Counsel: confirm consent vs. contract basis and
whether an in-app notice/consent is required before first AI use — tracked as SEC-003.]`

## 4. International transfers
Your **primary personal data (account, projects) is stored in the EU (Ireland)** via
Neon. Two categories of processing occur outside the EEA/UK:
1. **Cloudflare's global edge** may process request data and cache session/token/rate
   entries at the nearest location worldwide.
2. **AI providers and email** (Groq, Google, OpenAI/Anthropic/OpenRouter, Resend)
   process data in the **United States** when those features are used.

For these, we rely on the providers' **Standard Contractual Clauses and
data-processing agreements**. `[Counsel to confirm the transfer mechanism per provider
and reflect it here.]`

## 5. Security measures (technical & organizational — "TOMs" summary)
- **In transit:** HTTPS/TLS everywhere; HSTS enforced on production (`hi-nova.work`).
- **At rest:** passwords salted+hashed (PBKDF2, constant-time comparison); stored
  "bring-your-own" AI keys encrypted (AES-GCM); database managed by Neon.
- **Sessions/cookies:** session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`; no
  third-party tracking cookies (see [Cookie Notice](cookie-notice.md)).
- **Access & abuse controls:** per-account tenant scoping on the API; brute-force
  rate-limiting and lockout on authentication; a strict Content-Security-Policy and
  hardening headers on the app.
- **Sensitive operations:** writes back to a connected CAD host (e.g. Revit) require a
  **server-issued, single-use approval token** and are recorded in an audit log
  (audit is a precondition of the write).
- **Isolation:** development and production use **separate** databases and separate
  session/token/rate stores, so non-production activity cannot touch real user data.
- **Erasure:** deleting your account purges your sessions and verification tokens and
  removes your projects; retained audit entries are anonymized.
- **Supply chain:** dependencies are vulnerability-audited; secrets are kept in
  managed secret stores, never in source code.

`[Items still to formalize: a documented breach-detection & notification process
(GDPR 72h) and backup/recovery (Neon point-in-time recovery) — tracked as SEC-009;
audit-log retention/tamper-resistance — SEC-006.]`

## 6. Retention
See [Privacy Policy §6](privacy-policy.md). Sessions/tokens are short-lived;
account/project data persists until deletion; audit logs retained `[PERIOD]`.

## 7. Contact
Data-handling questions: **`[PRIVACY CONTACT EMAIL]`**.
