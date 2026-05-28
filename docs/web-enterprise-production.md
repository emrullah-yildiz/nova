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
- `NOVA_ALLOW_DEV_LOGIN`: set to `false` outside local development.
- `NOVA_SESSION_SECRET`: long random secret used to sign API sessions.
- `NOVA_CORS_ORIGIN`: browser app origin allowed to call the API.

## Local Baseline Commands

```powershell
npm install
npm run dev:api
npm run dev
```

The API starts on `http://127.0.0.1:8787` and bootstraps a demo organization with `owner@demo.nova`.

Use `docs/enterprise-api.env.example` as the deployment environment template.

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
- `GET /api/projects/:id/artifacts`
- `POST /api/projects/:id/artifacts`
- `GET /api/artifacts/:id`
- `GET /api/artifacts/:id/data`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/claim`
- `POST /api/jobs/:id/complete`
- `POST /api/jobs/:id/fail`
- `POST /api/connectors/sessions`
- `POST /api/connectors/sessions/:id/pair`
- `POST /api/ai/chat`
- `GET /api/audit`
- `POST /api/host-operations`

List endpoints for projects, project versions, project graph runs, project artifacts, background jobs, and audit events accept `limit` and `cursor` query parameters and return a `pagination` object with `nextCursor`, `hasMore`, `limit`, and `total`.

## Production Hardening Still Required

Before enterprise rollout, wire the OIDC callback to the production identity provider and JWKS validation, disable dev login outside local environments, move JSON persistence to a managed database, enforce HTTPS/WSS in deployment, add persistent audit retention, and deploy the connector relay on managed infrastructure.

## Deployment Baseline

The API can run as a standalone container for smoke tests and internal demos:

```powershell
docker build -f Dockerfile.api -t nova-enterprise-api .
docker run --rm -p 8787:8787 --env-file .env nova-enterprise-api
```

Production-like deployments should set `NOVA_ALLOW_DEV_LOGIN=false`, provide a strong `NOVA_SESSION_SECRET`, restrict `NOVA_CORS_ORIGIN` to the deployed browser app origin, and terminate TLS at the ingress or platform load balancer. The API also sends baseline security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Resource-Policy`.

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
