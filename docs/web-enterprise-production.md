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
- Authorization checks that reject cross-organization project access.

Current endpoints:

- `POST /api/auth/dev-login`
- `GET /api/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id/graph`
- `GET /api/projects/:id/versions`
- `POST /api/projects/:id/versions/:versionId/restore`
- `POST /api/connectors/sessions`
- `POST /api/connectors/sessions/:id/pair`
- `POST /api/ai/chat`
- `GET /api/audit`
- `POST /api/host-operations`

## Production Hardening Still Required

Before enterprise rollout, replace the dev auth/session model with a real OIDC/SAML integration, move data to a managed database, enforce HTTPS/WSS in deployment, add persistent audit retention, and deploy the connector relay on managed infrastructure.

Use `npm run release:check` as the initial release gate.
