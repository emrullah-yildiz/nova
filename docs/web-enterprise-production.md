# Nova Web Enterprise Production Baseline

Nova is moving toward a managed SaaS model. The browser app is the main product surface; desktop host access is provided by a connector that pairs an authenticated web session to Revit/Rhino on the user's machine.

## Runtime Configuration

The production frontend reads deploy-time configuration from `public/nova-config.js`, copied to `dist/nova-config.js` by Vite. Change this file per environment without rebuilding the bundle.

Required fields:

- `apiBaseUrl`: HTTPS API origin for project/auth/audit APIs.
- `websocketUrl`: WSS endpoint for connector sessions.
- `authProvider`: `dev` locally; OIDC/SAML provider name in enterprise environments.
- `connectorPairingUrl`: API endpoint used to create local connector pairing sessions.
- `appVersion`: release/build identifier shown in diagnostics.

Optional API environment:

- `NOVA_ENTERPRISE_STORE_FILE`: local JSON snapshot path for development or single-node demos that need data to survive API restarts.

## Local Baseline Commands

```powershell
npm install
npm run dev:api
npm run dev
```

The API starts on `http://127.0.0.1:8787` and bootstraps a demo organization with `owner@demo.nova`.

## Enterprise API Baseline

The first backend implementation is intentionally dependency-light. It establishes the contracts that later map to a managed database and SSO provider:

- Organizations and users with roles: Owner, Admin, Editor, Viewer.
- Cloud projects with graph version history.
- Connector sessions with pairing codes and expiration.
- Enterprise AI proxy requests with organization policy, rate limits, and audit events.
- Audit events for auth, project, connector, host, and AI operations.
- OIDC-ready callback flow with signed, expiring API sessions.
- Authorization checks that reject cross-organization project access and enforce project membership.
- Request validation for graph saves, connector pairing, AI chat messages, and host operations.
- Optional JSON file persistence for local development and restart-safe demos.

Current endpoints:

- `POST /api/auth/dev-login`
- `POST /api/auth/oidc/callback`
- `GET /api/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/members`
- `PUT /api/projects/:id/graph`
- `GET /api/projects/:id/versions`
- `POST /api/projects/:id/versions/:versionId/restore`
- `POST /api/connectors/sessions`
- `POST /api/connectors/sessions/:id/pair`
- `POST /api/ai/chat`
- `GET /api/audit`
- `POST /api/host-operations`

## Production Hardening Still Required

Before enterprise rollout, wire the OIDC callback to the production identity provider and JWKS validation, disable dev login outside local environments, move JSON persistence to a managed database, enforce HTTPS/WSS in deployment, add persistent audit retention, and deploy the connector relay on managed infrastructure.

## Authentication And RBAC Baseline

`POST /api/auth/dev-login` remains a local development shortcut only. Production deployments should use `POST /api/auth/oidc/callback` with an injected OIDC verifier that validates the provider token, resolves the organization slug, and maps the external subject to a Nova user.

API sessions are signed and expiring when the API server is configured with `AuthService`. All protected routes authenticate the bearer token, resolve organization membership, and then enforce project membership where a project is involved.

Organization Owner/Admin users can administer all projects in the tenant. Project Owner/Admin users can manage project membership. Project Editors can save graph versions and create connector sessions for projects they belong to. Project Viewers can read projects and versions but cannot save versions, create connector sessions, record host operations, or change membership.

## Persistence Baseline

The API can load and save an enterprise store snapshot when `NOVA_ENTERPRISE_STORE_FILE` is set:

```powershell
$env:NOVA_ENTERPRISE_STORE_FILE=".nova-data/enterprise-store.json"
npm run dev:api
```

This mode is useful for local development and single-node demos. It is not the production data layer for enterprise customers because it has no concurrent writer coordination, no query indexes, no backup policy, and no database-level access controls. Public enterprise deployments still need managed Postgres for organizations, users, projects, versions, AI requests, connector sessions, and audit events.

Use `npm run release:check` as the initial release gate.
