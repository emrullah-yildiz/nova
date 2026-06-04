# Privacy Policy

> **DRAFT v0.1 — NOT YET IN EFFECT. Pending legal review.** This describes how the
> Nova software actually handles personal data; it is not legal advice. Fill the
> `[PLACEHOLDERS]` and have counsel finalize before publishing.

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Effective date** | `[EFFECTIVE DATE]` |
| **Document owner** | `[LEGAL ENTITY]` |
| **Next review** | `[DATE]` |

`[LEGAL ENTITY]` ("Nova", "we", "us") operates the Nova visual parametric-design
application at `hi-nova.work`. This policy explains what personal data we process,
why, on what legal basis, who we share it with, and the rights you have. For the
technical detail of where data lives and how it's protected, see our companion
[Data Handling & Sub-processors](data-handling.md) document.

## 1. Who is responsible (controller)
`[LEGAL ENTITY]`, `[POSTAL ADDRESS]`, is the data controller for the personal data
described here. Privacy contact: **`[PRIVACY CONTACT EMAIL]`**. Data Protection
Officer: `[DPO or "not appointed — not required"]`. EU/UK representative (GDPR
Art. 27), if applicable: `[REPRESENTATIVE or "not applicable"]`.

## 2. What we collect
We practise data minimization — we only collect what the service needs.

- **Account data:** your email address, a salted **hash** of your password (we never
  store the plaintext password), and your display name. If you sign in with Google,
  we receive your email, name, and Google account identifier from Google instead of a
  password.
- **Authentication & security data:** session identifiers, email-verification tokens,
  and short-lived rate-limit counters; and your IP address transiently, used to
  protect against brute-force and abuse.
- **Your content:** the projects, node graphs, and versions you create, plus any data
  you import into them (for example spreadsheet/CSV files you upload, or references to
  model elements when you connect a CAD host). This may contain whatever you choose to
  put in it.
- **Collaboration data:** organizations you create or join, memberships and roles,
  and invitations/share links.
- **AI settings:** your model/provider preferences and, if you choose "bring your own
  key", your provider API key — which we store **encrypted** at rest.
- **Audit & operational logs:** security-relevant events (sign-in, sensitive writes,
  account deletion) and timestamps, for security and integrity.

We do **not** collect special-category data, and we do not use third-party
advertising or analytics trackers.

## 3. Why we process it, and our legal basis
`[Counsel to confirm the bases below.]`
- **To provide the service** (create your account, store and run your projects,
  enable collaboration) — *performance of a contract* (GDPR Art. 6(1)(b)).
- **To keep the service secure** (authentication, rate-limiting, audit logging, abuse
  prevention) — *legitimate interests* (Art. 6(1)(f)).
- **Optional AI assistance (bring-your-own-key)** — the assistant works only if you add
  your own AI provider key; your browser then sends your prompt/graph **directly** to
  that provider. Nova's servers don't process or relay it, and we store only your
  (encrypted) key. See [Data Handling §AI](data-handling.md).
- **Transactional email** (verification, invitations) — *contract / legitimate
  interests*.
- **Legal compliance** where a law requires it — *legal obligation* (Art. 6(1)(c)).

## 4. Who we share it with
We do not sell your personal data. We share it only with the infrastructure and
service providers ("sub-processors") needed to run Nova — hosting (Cloudflare),
database (Neon, EU), transactional email, and Google for "Sign in with Google". The
full, current list, roles, and locations are in
[Data Handling & Sub-processors](data-handling.md). **AI providers are not our
sub-processors:** the AI assistant is bring-your-own-key, so your data goes from your
browser straight to the provider *you* chose, under your own arrangement with them. We
may also disclose data if required by law, or to a successor in a merger/acquisition
(with notice where required).

## 5. Where your data is processed (international transfers)
Your primary account and project data is stored in the **European Union (Ireland)**.
Some processing happens on globally distributed infrastructure (Cloudflare's edge), and
sign-in (Google) and transactional email run in the **United States**. Where personal
data leaves the EEA/UK for these Nova-controlled transfers, we rely on appropriate
safeguards (Standard Contractual Clauses and our providers' data-processing terms).
Separately, if you use the bring-your-own-key AI assistant, your browser sends data
directly to the AI provider you chose (often in the US) under your own arrangement with
them — that's not a Nova transfer. Details are in [Data Handling](data-handling.md).
`[Counsel to confirm transfer mechanism for each US provider.]`

## 6. How long we keep it
- **Account & project data:** for as long as your account is active; deleted on
  request (see §7) or `[RETENTION PERIOD]` after account closure.
- **Sessions / verification tokens / rate counters:** short-lived; expire
  automatically.
- **Audit logs:** retained for `[RETENTION PERIOD]` for security/integrity, then
  deleted or anonymized.
`[Finalize retention periods — tracked as SEC-014.]`

## 7. Your rights
Subject to applicable law (e.g. GDPR/UK GDPR), you can request to **access**,
**correct**, **export** (portability), **delete**, or **restrict/object to** the
processing of your personal data, and to withdraw consent where processing is
consent-based. In the app today you can:
- **Access & export** your projects (save/export your graphs), and view your account.
- **Correct** your account details and content.
- **Delete your account** — this purges your account, signs out all your sessions,
  and removes your projects; retained audit entries are anonymized.

To exercise any right, contact **`[PRIVACY CONTACT EMAIL]`**. You also have the right
to lodge a complaint with your supervisory authority (in Ireland, the Data Protection
Commission).

## 8. Security
We protect your data with encryption in transit (HTTPS/TLS, HSTS in production),
encryption of stored secrets, salted password hashing, isolated production/development
data stores, access controls, rate-limiting, and audited sensitive operations. See
the security-measures summary in [Data Handling §Security](data-handling.md). No
system is perfectly secure, but we work to industry norms.

## 9. Children
Nova is not directed to children under `[16 / AGE]`, and we do not knowingly collect
their data.

## 10. Changes
We may update this policy; we'll change the version and effective date above and, for
material changes, notify you `[HOW — e.g. by email or in-app]`.

## 11. Contact
Questions or requests: **`[PRIVACY CONTACT EMAIL]`**, `[LEGAL ENTITY]`,
`[POSTAL ADDRESS]`.
