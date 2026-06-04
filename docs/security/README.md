# Security, Privacy & User-Rights Tickets

This folder is the tracked backlog of **security, privacy, and user-rights gaps** —
missing operations, policies, approvals, and controls — produced by the
`security-auditor` agent (`.claude/agents/security-auditor.md`).

> These are an **engineering audit**, not legal advice. Tickets marked
> `needs: legal` or `needs: policy` require a human (and often counsel) to decide.

## How to run an audit

Invoke the auditor and pass today's date (it must not invent dates):

```
Use the security-auditor agent. Today is <YYYY-MM-DD>. Audit the full codebase and
operations for security/privacy/user-rights gaps and create/update tickets.
```

For machine-validated structured output (a forced schema, nothing missed), run it as
a Workflow with a JSON schema instead of interactively.

## Ticket format

One file per ticket: `tickets/SEC-<NNN>.md`, with mandatory YAML frontmatter and the
body sections defined in the agent. Frontmatter fields:

| field | values |
|---|---|
| `id` | `SEC-001`, … |
| `title` | short imperative |
| `severity` | `critical` \| `high` \| `medium` \| `low` |
| `category` | `data-protection` \| `cross-border-transfer` \| `authn-authz` \| `secrets` \| `untrusted-input` \| `approvals-governance` \| `audit-logging` \| `breach-resilience` \| `encryption` \| `transparency-consent` |
| `status` | `open` \| `in-progress` \| `resolved` \| `accepted-risk` |
| `needs` | `code` \| `policy` \| `legal` \| `process` \| `config` \| `mixed` |
| `user_right_at_risk` | plain-words description |
| `affected` | files/routes/subsystems, or `organizational` |
| `discovered` | `YYYY-MM-DD` |

Body sections (all required): **Gap**, **Why it matters (user-rights impact)**,
**Evidence**, **Recommended action / acceptance criteria**, **References**.

`tickets/INDEX.md` is the register (one row per ticket). Keep it in sync.

## Severity

By **user-rights impact × likelihood**, not by fix difficulty. A missing
right-to-erasure path is `high` even if it's "just" a backlog item.

## Optional: enforce structure with a hook

To guarantee no ticket ships missing a field, add a `SubagentStop`/`PostToolUse`
hook in `settings.json` that validates every `tickets/SEC-*.md` has all required
frontmatter keys and fails loudly otherwise. (The agent's prompt already requires
them; the hook makes it non-bypassable.)
