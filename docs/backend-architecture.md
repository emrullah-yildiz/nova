# Nova Backend Architecture

## Purpose

Define the backend needed to move Nova from a browser-first prototype into an enterprise-ready product with secure project storage, AI mediation, local CAD integration, auditability, and scalable deployment.

## Current Baseline

Nova currently runs primarily as a Vite browser application with modular source files under `src/`. It includes:

- Graph and geometry execution in the browser.
- AI calls from the browser client.
- Local Revit integration modules.
- A Node-based Nova Connect hub in `scripts/connect-hub.cjs`.
- CI gates for linting, tests, browser workflow checks, audit, and production build.

The main enterprise gap is the absence of a trusted backend boundary. Enterprise users need identity, tenant isolation, durable project storage, secret management, policy enforcement, audit trails, and controlled integration with local desktop tools.

## Architecture Direction

Use a modular monolith for the first backend release. Keep service boundaries explicit in code, but deploy one API while the product surface is still changing.

Recommended initial modules:

- `identity`: users, organizations, teams, roles, invitations, SSO hooks.
- `projects`: project metadata, graph documents, graph versions, assets.
- `ai`: provider routing, server-held secrets, usage limits, prompt policy, response logging.
- `connect`: local CAD session pairing, signed handshakes, message routing metadata.
- `execution`: graph validation, run records, optional server-side execution jobs.
- `audit`: immutable security and activity events.
- `admin`: organization settings, model policy, integration policy, retention settings.

## Deployment Shape

Initial production shape:

- Frontend: Vite static build served from CDN or app hosting.
- API: Node.js backend container.
- Database: Postgres.
- Cache/session store: Redis.
- Object storage: S3-compatible storage for large project artifacts and exports.
- Background jobs: Redis-backed queue or managed queue.
- Observability: structured logs, metrics, traces, and error tracking.

Future split candidates:

- AI proxy service, if provider traffic and quota rules become complex.
- Connect broker, if concurrent desktop sessions become high volume.
- Geometry/execution workers, if server-side graph runs become computationally heavy.

## Data Model

Minimum tables for MVP:

- `organizations`
- `users`
- `organization_members`
- `projects`
- `project_members`
- `project_versions`
- `graph_runs`
- `ai_requests`
- `connect_sessions`
- `audit_events`

Key rules:

- Every project belongs to one organization.
- Every project version is immutable once saved.
- Graph documents are schema-versioned.
- AI requests are linked to user, organization, project, and optional graph version.
- Revit write operations create audit events.

## API Surface

MVP REST endpoints:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`
- `GET /organizations/:organizationId/projects`
- `POST /organizations/:organizationId/projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `GET /projects/:projectId/versions`
- `POST /projects/:projectId/versions`
- `GET /projects/:projectId/versions/:versionId`
- `POST /projects/:projectId/runs`
- `POST /ai/chat`
- `POST /connect/sessions`
- `POST /connect/sessions/:sessionId/pair`
- `GET /audit/events`

All project, AI, Connect, and audit endpoints must be tenant-scoped and authorize against organization/project roles.

## AI Boundary

Browser clients must not store enterprise provider secrets. The backend AI module should:

- Store provider API keys server-side.
- Support organization-level provider policy.
- Enforce per-user and per-organization rate limits.
- Redact or block sensitive project data according to policy.
- Record usage metadata without storing full prompts by default.
- Allow full prompt logging only when explicitly enabled by an organization admin.

## Nova Connect Boundary

The local Connect hub should become a trusted local agent rather than an open unauthenticated router.

MVP requirements:

- Pairing token required by default.
- Short-lived session IDs.
- Browser origin validation.
- Backend-issued pairing challenge.
- Signed or MAC-protected session handshake.
- Explicit user approval before Revit write operations.
- Audit events for parameter writes and geometry creation.

The existing `scripts/connect-hub.cjs` is a useful prototype. Production work should either harden it directly or move it under a backend-owned package with tests.

## Security Controls

Required before enterprise MVP:

- OIDC-ready authentication.
- RBAC for organization and project access.
- Request schema validation.
- Output encoding and XSS cleanup in the frontend.
- CSP and security headers.
- Server-side AI secret management.
- Rate limiting.
- Audit logging.
- Dependency scanning in CI.
- Signed release artifacts for desktop/local agent distribution.

## Scalability Controls

Required before enterprise MVP:

- Stateless API process.
- Postgres-backed durable project storage.
- Redis-backed session/rate-limit state.
- Background job queue for long-running work.
- Object storage for large graph/export payloads.
- Pagination on large project, audit, and element lists.
- Load testing for project save/load, AI requests, and Connect session routing.

## First Implementation Milestone

Milestone 1 should deliver:

- Backend scaffold under `server/`.
- Health endpoint.
- Project create/read/update/version endpoints.
- Postgres migration setup.
- Request validation helper.
- Audit event writer.
- AI proxy endpoint with mock provider in tests.
- Frontend API client for project save/load.

This gives Nova a real enterprise backend spine without forcing the graph engine or CAD integration to be rewritten immediately.
