# Nova Documentation

This folder is the coordination surface for humans and AI agents working on
Nova. Keep it small, current, and decision-oriented.

## Start Here

- `AGENTS.md` - repository instructions for AI agents and contributors.
- `ai-agent-token-guide.md` - how agents should minimize token usage and avoid repeated analysis.
- `agent-merge-checklist.md` - required checklist before merging a task branch into `develop`.
- `agent-handoff.md` - compact handoff log for context another agent should inherit.
- `architecture-decisions.md` - durable architecture decisions and their consequences.

## Current Product And Platform Docs

- `deployment-guide.md` - Cloudflare Worker deployment, branch/domain mapping, secrets, and verification.
- `accounts-collaboration.md` - account, sharing, and realtime collaboration architecture.
- `revit-plugin-architecture.md` - Nova Connect and Revit integration architecture.
- `enterprise-api.env.example` - local/secret-manager environment variable reference.

## Documentation Policy

- Update `architecture-decisions.md` whenever a durable architecture rule changes.
- Update `agent-handoff.md` when a completed workflow leaves context the next agent needs.
- Update this index when adding, removing, or renaming docs.
- Prefer updating an existing current doc over adding roadmap fragments.
- Delete stale docs when their content is superseded by a current source of truth.
