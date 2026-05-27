# Nova Documentation

This folder contains current planning and repository guidance only. Historical phase notes and completed migration plans were removed to keep the documentation set focused.

## Current Documents

- `AGENTS.md` - repository working instructions for coding agents and contributors.
- `backend-architecture.md` - target backend architecture for enterprise readiness.
- `enterprise-api.env.example` - example environment for API deployment configuration.
- `enterprise-mvp-requirements.md` - product, security, and scalability requirements for the enterprise MVP.
- `merge-readiness-checklist.md` - checks to run before an AI agent or contributor merges a branch.
- `public-release-checklist.md` - repository-publication checklist for source release.
- `revit-plugin-architecture.md` - Nova Connect and Revit integration architecture.
- `web-enterprise-production.md` - current enterprise API/runtime baseline and production hardening notes.

## Documentation Policy

- Keep long-lived architecture and requirement docs.
- Remove phase notes once the phase is complete and the current state is reflected elsewhere.
- Prefer updating `README.md` and this index over adding new roadmap fragments.
- Keep enterprise backend planning in `backend-architecture.md` and `enterprise-mvp-requirements.md`.
- Use `merge-readiness-checklist.md` before merging so docs and tests stay current with code.
