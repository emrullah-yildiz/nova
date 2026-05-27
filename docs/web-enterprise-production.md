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

## Local Baseline Commands

```powershell
npm install
npm run dev:api
npm run dev
```

The API starts on `http://127.0.0.1:8787` and bootstraps a demo organization with `owner@demo.nova`.

## Enterprise API Baseline

The first backend implementation is intentionally dependency-light and in-memory. It establishes the contracts that later map to a managed database and SSO provider:

- Organizations and users with roles: Owner, Admin, Editor, Viewer.
- Cloud projects with graph version history.
- Connector sessions with pairing codes and expiration.
- Enterprise AI proxy requests with organization policy, rate limits, and audit events.
- Audit events for auth, project, connector, host, and AI operations.
- OIDC-ready callback flow with signed, expiring API sessions.
- Authorization checks that reject cross-organization project access and enforce project membership.
- Request validation for graph saves, connector pairing, AI chat messages, and host operations.

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

Before enterprise rollout, wire the OIDC callback to the production identity provider and JWKS validation, disable dev login outside local environments, move data to a managed database, enforce HTTPS/WSS in deployment, add persistent audit retention, and deploy the connector relay on managed infrastructure.

## Authentication And RBAC Baseline

`POST /api/auth/dev-login` remains a local development shortcut only. Production deployments should use `POST /api/auth/oidc/callback` with an injected OIDC verifier that validates the provider token, resolves the organization slug, and maps the external subject to a Nova user.

API sessions are signed and expiring when the API server is configured with `AuthService`. All protected routes authenticate the bearer token, resolve organization membership, and then enforce project membership where a project is involved.

Organization Owner/Admin users can administer all projects in the tenant. Project Owner/Admin users can manage project membership. Project Editors can save graph versions and create connector sessions for projects they belong to. Project Viewers can read projects and versions but cannot save versions, create connector sessions, record host operations, or change membership.

Use `npm run release:check` as the initial release gate.
