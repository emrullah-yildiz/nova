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

Current enterprise API endpoints:

- `POST /api/auth/dev-login`
- `POST /api/auth/oidc/callback`
- `GET /api/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members`
- `PUT /api/projects/:projectId/graph`
- `GET /api/projects/:projectId/versions`
- `POST /api/projects/:projectId/versions/:versionId/restore`
- `POST /api/ai/chat`
- `POST /api/connectors/sessions`
- `POST /api/connectors/sessions/:sessionId/pair`
- `GET /api/audit`

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

## Persistence Boundary

The `EnterpriseStore` exposes a snapshot boundary that serializes organizations, users, projects, connector sessions, AI requests, and audit events. Two adapters implement this boundary:

- **`JsonFilePersistence`** — writes a single JSON snapshot file. Suitable for local development and restart-safe demos. Not suitable for production (no concurrent writer coordination, no indexes, no backup policy).

- **`PostgresPersistence`** — reads and writes the same snapshot shape from Postgres tables. Uses a managed connection pool and atomic transactions for write operations. The snapshot adapter pattern preserves the existing domain logic and route authorization behavior while switching the storage backend.

### Migration System

Migrations live in `server/db/migrations/` as numbered SQL files. The `runMigrations` runner tracks applied migrations in a `_migrations` table. Usage:

```bash
# Apply all pending migrations
NOVA_DATABASE_URL=postgres://... node scripts/run-migrations.mjs

# Check migration status
NOVA_DATABASE_URL=postgres://... node scripts/run-migrations.mjs status

# Or via npm scripts
npm run migrate
npm run db:migrate
```

### Database Tables

The initial schema (`001_initial_schema.sql`) creates:

- `organizations` — tenants with JSONB settings (AI policy, retention, SSO config)
- `users` — user accounts with email and external subject for SSO mapping
- `organization_members` — role assignments (Owner/Admin/Editor/Viewer) within a tenant
- `projects` — project metadata, scoped to an organization
- `project_members` — project-level role assignments
- `project_versions` — immutable graph snapshots with JSONB graph data
- `graph_runs` — execution records (status, duration, error summary)
- `ai_requests` — AI proxy requests with provider, model, messages, and usage
- `connect_sessions` — Nova Connect pairing sessions with expiry
- `audit_events` — immutable security and activity log
- `rate_limit_buckets` — per-minute AI rate limit counters

### Selecting Persistence at Runtime

The API server auto-detects the persistence backend from environment variables:

1. If `NOVA_DATABASE_URL` is set → uses `PostgresPersistence` (production path)
2. If `NOVA_ENTERPRISE_STORE_FILE` is set → uses `JsonFilePersistence` (local dev)
3. Otherwise → uses in-memory store with no persistence across restarts

Production deployments should set `NOVA_DATABASE_URL` and run `npm run migrate` at deploy time. The Docker container runs migrations automatically on startup when `NOVA_DATABASE_URL` is present.

Redis remains the target for short-lived session, pairing, and rate-limit state in a future iteration.

## Security Controls

Required before enterprise MVP:

- OIDC-ready authentication with signed, expiring sessions.
- RBAC for organization and project access, including project membership for reads/writes.
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
