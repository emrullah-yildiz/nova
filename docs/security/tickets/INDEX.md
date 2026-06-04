# Security / Privacy / User-Rights Ticket Register

Maintained by the `security-auditor` agent. One row per ticket; see each
`SEC-<NNN>.md` for detail and `../README.md` for the format.

| ID | Title | Severity | Category | Status | Needs |
|----|-------|----------|----------|--------|-------|
| SEC-001 | Publish a privacy policy, ToS, and lawful-basis statement before public sign-ups | high | data-protection | open | legal |
| SEC-002 | Disclose and lawfully cover third-party sub-processors (AI, email, hosting) | high | cross-border-transfer | open | legal |
| SEC-003 | Disclose to users that AI prompts + graph data are sent to third-party AI providers | high | transparency-consent | open | mixed |
| SEC-004 | Make account deletion purge all PII — sessions, verification tokens, audit, AI logs | high | data-protection | resolved | code |
| SEC-005 | Add brute-force / rate-limiting protection to authentication endpoints | high | authn-authz | resolved | code |
| SEC-006 | Make audit log tamper-resistant, retained, and PII-bounded (not a mutable snapshot) | medium | audit-logging | open | mixed |
| SEC-007 | Provide data-subject access, portability, and rectification (DSAR) capability | medium | data-protection | open | mixed |
| SEC-008 | Stop storing BYOK AI API keys in plaintext localStorage | medium | secrets | resolved | code |
| SEC-009 | Define breach-notification, backup/recovery, and dependency-vulnerability processes | medium | breach-resilience | open | process |
| SEC-010 | Harden against XSS — add a Content-Security-Policy and audit innerHTML sinks | medium | untrusted-input | open | code |
| SEC-011 | Bound uploaded spreadsheet/CSV size and dimensions before parsing | medium | untrusted-input | resolved | code |
| SEC-012 | Separate dev and production KV namespaces (shared SESSION_KV/RATE_KV id) | medium | secrets | in-progress | config |
| SEC-013 | Enforce Revit/Connect write approval and audit server-side, not client-only | medium | approvals-governance | open | code |
| SEC-014 | Enforce data-retention limits and project/version quotas (setting is unenforced) | low | data-protection | open | mixed |
| SEC-015 | Add HSTS and security response headers on the production Worker | low | encryption | open | code |
