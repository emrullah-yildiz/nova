# Nova Enterprise MVP Requirements

## Goal

Deliver the smallest enterprise-ready Nova product that allows companies to securely create, save, govern, and run visual scripting workflows with AI assistance and controlled Revit integration.

## MVP Definition

The enterprise MVP is not a full platform. It is the first version that can be piloted by a security-conscious architecture, engineering, or construction company without relying on local browser storage, personal API keys, or unaudited desktop writes.

## Target Users

- Design technologists building visual scripting workflows.
- BIM managers governing Revit automation.
- Project teams reusing approved graph workflows.
- IT/security admins reviewing access, data flow, and audit logs.

## Product Requirements

### Project Workspace

Required:

- Create a project inside an organization.
- Open an existing project.
- Save the current graph as a versioned project document.
- Load a previous project version.
- Export and import a `.nova.json` project file.
- Track project title, description, owner, created time, updated time, and active version.

Acceptance criteria:

- A user can create a project, build or modify a graph, save it, reload the browser, and recover the saved graph.
- Saving creates an immutable version record.
- The latest version is clearly identified.

### Graph Execution Records

Required:

- Record every graph run initiated from a saved project.
- Store run status, duration, user, project, graph version, and error summary.
- Keep detailed runtime output client-side for MVP unless server execution is enabled.

Acceptance criteria:

- A project owner can inspect recent runs for a project.
- Failed runs have enough metadata to debug the failure path.

### AI Assistance

Required:

- Browser sends AI requests to Nova backend, not directly to model providers.
- Backend owns provider credentials.
- Organization admin can select allowed providers and models.
- Backend records AI usage metadata.
- AI endpoint enforces rate limits.

Acceptance criteria:

- No provider API key is stored in browser local storage for enterprise mode.
- Requests are attributed to user, organization, and project.
- If rate limits are exceeded, the user receives a clear error.

### Revit / Nova Connect

Required:

- Local agent or hub requires a pairing token.
- Browser sessions pair through an explicit user action.
- Revit write operations require user approval.
- Parameter writes and geometry creation generate audit events.
- Connect messages are schema validated.

Acceptance criteria:

- An unpaired browser cannot issue Revit requests.
- A user can connect Nova to a local Revit session and query a project snapshot.
- A Revit write operation cannot happen silently.

### Collaboration And Access

Required:

- Organizations.
- Users.
- Project membership.
- Roles: owner, editor, viewer.
- Authorization checks on all project APIs.

Acceptance criteria:

- Viewers cannot save new versions.
- Editors can save versions but cannot delete projects or change membership.
- Owners can manage project membership.

### Admin And Governance

Required:

- Organization settings for AI provider policy.
- Audit log query for security-relevant events.
- Basic retention setting documented, even if fixed for MVP.

Acceptance criteria:

- Admin can review login, project access, AI request, and Revit write events.
- Audit records include actor, organization, project when applicable, action, timestamp, and result.

## Security Requirements

Required before MVP pilot:

- OIDC-ready authentication architecture.
- Password auth only acceptable for internal development.
- Tenant isolation in every backend query.
- RBAC middleware on all protected routes.
- Request body validation with explicit schemas.
- Backend-held secrets.
- Per-user and per-organization rate limits.
- CSP and core browser security headers.
- Dependency audit gate in CI.
- Error responses that do not leak secrets or stack traces.

Frontend hardening required:

- Remove enterprise API keys from `localStorage`.
- Replace unsafe user-content `innerHTML` paths.
- Treat AI responses as untrusted content.
- Validate imported graph files before loading.

## Scalability Requirements

Required before MVP pilot:

- Stateless API containers.
- Postgres-backed project persistence.
- Redis-backed sessions, pairing state, and rate limits.
- Pagination for project lists, version lists, audit logs, and large element queries.
- Background queue ready for AI and export jobs.
- Object storage path for large graph assets or geometry exports.

Initial scale target:

- 50 organizations.
- 500 total users.
- 50 concurrent active users.
- 100 concurrent local Connect sessions.
- 10,000 saved project versions.
- 1 million audit events.

These targets are intentionally modest but force the right backend shape early.

## Non-Goals For MVP

- Real-time multiplayer graph editing.
- Full marketplace for plugins.
- Full SCIM lifecycle management.
- Complex billing.
- Server-side execution of every geometry operation.
- Offline-first sync.
- Fine-grained field-level permissions.
- Cross-organization sharing.

## Implementation Milestones

Status checked: 2026-05-28.

### Milestone 1: Backend Spine

- [x] Create `server/` backend scaffold.
- [x] Add health endpoint.
- [x] Add database migration setup.
- [x] Add organization, user, project, and project version models.
- [x] Add project save/load APIs.
- [x] Add audit event writer.

### Milestone 2: Enterprise AI Proxy

- [x] Add `/ai/chat` endpoint.
- [x] Move provider credentials to backend. Status: enterprise mode supports server-held OpenAI-compatible provider keys; legacy local browser-key mode still exists for non-enterprise use.
- [x] Add rate limiting.
- [x] Add organization model policy.
- [x] Add frontend enterprise AI client path.

### Milestone 3: Secure Connect Pilot

- [x] Harden pairing flow.
- [x] Require token by default.
- [x] Add session expiry.
- [x] Add schema validation for Connect messages.
- [ ] Add Revit write approval and audit event creation. Status: host-operation audit endpoint exists; explicit approval enforcement still needs to be wired through the local Revit write flow.

### Milestone 4: Production Pilot Readiness

- [x] Add Docker deployment.
- [x] Add environment templates.
- [ ] Add structured logs.
- [ ] Add error reporting.
- [ ] Add load-test scripts.
- [x] Add deployment guide.
- [ ] Add security review checklist.

### Current MVP Completion Snapshot

- [x] Users can authenticate through dev or OIDC-ready flows.
- [x] Users can create projects and save/load immutable graph versions.
- [x] Graph runs can be recorded and inspected for saved projects.
- [x] AI requests go through backend policy, usage metadata, rate limits, and audit logging.
- [x] Enterprise frontend AI can call the Nova backend without browser-held provider keys.
- [x] Project APIs enforce organization and role boundaries.
- [x] Audit logs capture authentication, project, AI, graph-run, and Connect session events.
- [x] Postgres schema and migrations exist for enterprise persistence.
- [x] API startup now supports async persistence initialization.
- [x] Production Postgres persistence has an integration test harness for a real Postgres service. Status: verified against Neon on 2026-05-28; run with `NOVA_POSTGRES_INTEGRATION_TESTS=true NOVA_DATABASE_URL=... npm run test:postgres`.
- [x] High-risk user-content HTML paths hardened. Status: chat rendering escapes untrusted text before markdown formatting; saved/imported project names are escaped in open/recent/recovery dialogs.
- [x] Redis-backed sessions, pairing state, and rate limits are wired. Status: API uses `NOVA_REDIS_URL` when configured; tests cover the state-store contract with the in-memory adapter.
- [x] Pagination for large lists is wired. Status: project, version, graph-run, and audit list endpoints accept `limit` and `cursor`, return `pagination` metadata, and keep their existing array response keys.
- [ ] Background queue and object storage paths remain pending.
- [ ] Revit write approval must be enforced end-to-end before pilot.

## MVP Exit Criteria

Nova is ready for an enterprise pilot when:

- A user can authenticate, create a project, save/load graph versions, and run workflows.
- AI requests go through backend policy and logging.
- Revit integration requires pairing and explicit write approval.
- Project APIs enforce organization and role boundaries.
- Audit logs capture sensitive operations.
- CI passes lint, tests, browser workflow tests, build, and audit.
- Deployment documentation exists for at least one production-like environment.
