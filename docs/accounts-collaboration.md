# Accounts & Real-Time Collaboration — Design

Status: **Draft / proposal** (not yet implemented). Owner: TBD. Last updated: 2026-05-30.

This document describes the planned user-profile and collaboration system for Nova,
targeting an **all-Cloudflare** platform. It is meant to be reviewed before any code.

Related: `backend-architecture.md`, `enterprise-mvp-requirements.md`,
`web-enterprise-production.md`, `deployment-guide.md`.

---

## 1. Goals

- Users sign in with **Google** or **enterprise SSO** (both OIDC).
- A persistent **profile**: settings, preferences, and recent projects saved to the account.
- **Sharing**: invite collaborators to a project, or hand out a share link.
- **Live sessions**: others can **join to watch** a host work (spectate), or **collaborate**
  (co-edit) on the same graph in real time.

Non-goals (for now): SAML (OIDC only), offline-first sync, mobile apps, comments/chat-in-canvas.

---

## 2. Current state (what already exists)

Nova already has a substantial — but largely frontend-dormant — backend:

- **Auth**: `server/auth/jwks-verifier.mjs` verifies OIDC ID tokens (issuer/audience/signature);
  `src/enterprise/auth.mjs` issues HMAC-signed Nova session tokens; `/api/auth/oidc/callback`
  creates/updates users.
- **Data model (Postgres / Neon)**: `users`, `organizations`, `organization_members`,
  `projects`, `project_members`, `project_versions`, `graph_runs`, `object_artifacts`,
  `background_jobs`, `audit_events` — with roles **Owner / Admin / Editor / Viewer**.
- **API**: a raw `node:http` server (`src/enterprise/api-server.mjs`, run via
  `scripts/enterprise-api.mjs`) with ~30 routes; Postgres or JSON-file persistence.
- **Cloud client**: `NovaCloudClient` (token storage + project save/load/versioning).
- **Frontend gaps**: no login UI, no account menu, no preferences UI; recent projects and
  settings are localStorage-only; the landing "recent projects" list is static.
- **Realtime**: none (the only WebSocket is the Revit host connector, unrelated).

The domain logic in `src/enterprise/` is platform-agnostic and reusable; only the HTTP and
persistence layers are platform-bound.

---

## 3. Decisions

| Topic | Decision |
|---|---|
| Platform | **Cloudflare Workers + Durable Objects** + **Neon** (kept) |
| Auth | **Reuse existing OIDC/JWKS + Postgres user model**; add Google + SSO front-door; session in **httpOnly cookie** |
| Accounts | **Personal + orgs from day one** — auto-create a personal workspace (hidden org) on first login |
| Collaboration | **Spectate first, then co-edit**, on shared room infrastructure |
| Realtime data model | **Yjs (CRDT)** — transport-agnostic; the room host is swappable |
| Realtime transport | **Cloudflare Durable Objects** (PartyKit optional DX layer) |

Rationale for Cloudflare: live collaboration needs persistent/stateful connections, which
**Durable Objects** host natively. Keeping the SPA, API, AI proxy, and realtime rooms in one
Worker deployment removes split hosting and lets the room enforce Postgres roles directly.

---

## 4. Target architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Cloudflare                                                       │
│                                                                  │
│  Worker assets ─────── static Vite SPA                           │
│                                                                  │
│  Worker (Hono) ─────── REST API  (reuses src/enterprise logic)   │
│        │               + AI proxy (shared provider helpers)       │
│        │                                                         │
│        ├── Durable Object: ProjectRoom  (1 per live session)     │
│        │      • holds Yjs doc in memory + DO storage             │
│        │      • presence (cursors/selection/avatars)             │
│        │      • enforces role on connect (viewer=RO, editor=RW)  │
│        │      • periodic snapshot → project_versions             │
│        │                                                         │
│        ├── KV ───────── JWKS cache, rate-limit buckets           │
│        ├── R2 ───────── artifacts / exports (object_artifacts)   │
│        └── Queues ───── background_jobs                          │
│                                                                  │
└───────────────┬────────────────────────────────────────────────┘
                │ @neondatabase/serverless  /  Hyperdrive
        ┌───────▼────────┐
        │  Neon Postgres │  users, orgs, projects, versions, members…
        └────────────────┘
```

Required runtime changes (Node → `workerd`):
- `node:crypto` → **WebCrypto** (`crypto.subtle`): RSA-SHA256 verify in `jwks-verifier.mjs`,
  HMAC in `auth.mjs`.
- `pg` (`server/db/postgres-persistence.mjs`) → **`@neondatabase/serverless`** or **Hyperdrive**.
- AI proxy in-memory rate limit → **KV** or a Durable Object.
- Raw `node:http` routing (`api-server.mjs`) → **Hono** app on a Worker (handlers reuse the
  existing domain functions).

---

## 5. Data-model deltas

```sql
-- users: profile + preferences
ALTER TABLE users ADD COLUMN avatar_url text;
ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- share links: frictionless "here's my project"
CREATE TABLE share_links (
  id            uuid PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,         -- random, unguessable
  role          text NOT NULL,                -- 'viewer' | 'editor'
  visibility    text NOT NULL DEFAULT 'unlisted', -- 'unlisted' | 'public'
  created_by    uuid NOT NULL REFERENCES users(id),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

- **Personal workspace**: on first login, create an `organizations` row flagged personal and
  an `organization_members(Owner)` row for the user. "Personal" projects are just rows under
  that org — no separate code path.
- **Live session metadata** (host, mode, started_at, participant list) lives in the Durable
  Object (ephemeral); only durable snapshots go to `project_versions`.

---

## 6. API additions (Worker / Hono)

- `GET /api/me`, `PUT /api/me` — profile + preferences.
- `GET /api/projects`, `GET /api/projects/shared` — "My Projects" / "Shared with me".
- `POST /api/projects/:id/members`, `DELETE …` — manage collaborators.
- `POST /api/projects/:id/share-links`, `GET`, `DELETE` — share-link CRUD.
- `POST /api/projects/:id/session` — start/get a live session → returns the DO room URL + a
  short-lived room token scoped to the user's role.
- Existing auth/project/version routes are ported as-is.

---

## 7. Auth flow

1. Frontend redirects to Google / SSO (Authorization Code **+ PKCE**).
2. Provider redirects back with a code; the SPA posts it to a Worker.
3. Worker exchanges the code, receives the OIDC **ID token**, verifies it with the JWKS
   verifier (now WebCrypto), upserts the user, ensures a personal workspace.
4. Worker issues a Nova session token and sets it as an **httpOnly, Secure, SameSite cookie**
   (the SPA and API share the same Worker origin, so this is first-party).
5. Subsequent API calls authenticate via the cookie; the realtime room is handed a separate
   short-lived, role-scoped token.

Account linking: same `external_subject`/email links Google and SSO to one user.

---

## 8. Realtime design

**Graph → Yjs document**
- `Y.Map<nodeId, {type, x, y, controls?, ...}>` — nodes
- `Y.Array<{fromNode, fromPort, toNode, toPort}>` — wires
- `Y.Map<nodeId, Y.Map<ctrlId, value>>` — control values
- **Presence** (awareness): cursor, viewport, selection, user {name, avatar, color}.

**ProjectRoom (Durable Object)**
- One instance per active session; holds the authoritative Yjs doc in memory, persisted to DO
  storage; loads the latest `project_versions` snapshot on cold start.
- On WebSocket connect: validate the room token → resolve role → **viewer = read-only**
  (awareness only, Yjs updates rejected), **editor = read-write**. The server is the authority;
  a tampered client cannot gain write access.
- Periodically (and on last-leaver) snapshot the Yjs doc → `project_versions` so the live doc
  and version history reconcile.

**Spectate (Phase 4)** — viewers attach read-only + presence; "follow host" binds the viewer's
camera to the host's viewport. No conflict resolution needed.

**Co-edit (Phase 5)** — editors write to the shared doc; multi-cursor; the **engine recomputes**
on remote ops. Guard against echo loops: tag local transactions and skip re-applying our own
origin. The 3D viewport rebuilds from the recomputed graph.

Transport stays behind a Yjs provider interface, so swapping DOs ↔ y-websocket ↔ Liveblocks is
an adapter change, not a rewrite.

---

## 9. Roadmap

| Phase | Deliverable |
|---|---|
| **0 — Platform** | Worker/Hono + static assets; crypto→WebCrypto; pg→neon-serverless/Hyperdrive; AI proxy→Worker; `wrangler.toml` bindings. |
| **1 — Accounts** | Google/SSO login UI, cookie session, personal workspace + org create/join, account menu/avatar, logout. |
| **2 — Cloud profile** | `users.preferences`; settings + recent projects synced; real "My Projects" + "Shared with me". |
| **3 — Sharing** | Members UI + share links + role management. |
| **4 — Spectate** | ProjectRoom DO + Yjs doc + presence; read-only live view; follow-host. |
| **5 — Co-edit** | Editor write access; multi-cursor; snapshot-to-versions. |

Phase 0 is infra-only and the riskiest; it unlocks both the cookie session and native realtime.

---

## 10. Risks & open questions

- **`workerd` ≠ Node** — audit remaining Node-only deps before porting (known: crypto, pg — both
  addressed above).
- **Cookie session** replaces localStorage tokens — verify CORS/CSRF posture (SameSite, double-submit
  if needed). `NovaCloudClient` must move from Bearer-in-localStorage to cookie.
- **DO ↔ engine** — remote ops must recompute without echo loops and without thrashing the 3D view.
- **Snapshot cadence** — balance version-history granularity vs write load on Neon.
- **Cost** — DO + KV + R2 usage scales with concurrency; model it before launch.
- **Open**: PartyKit (DX) vs raw Durable Objects? Hyperdrive vs Neon serverless driver?
  Per-project single room vs per-session rooms? SAML SSO ever needed?

---

## 11. Migration checklist (Phase 0)

- [ ] `wrangler.toml` with bindings: DO (`ProjectRoom`), KV, R2, Queues, Hyperdrive, secrets.
- [ ] Hono Worker entry; mount existing domain handlers; route parity with `api-server.mjs`.
- [ ] Port `jwks-verifier.mjs` and `auth.mjs` crypto to WebCrypto; add tests.
- [ ] Swap `postgres-persistence.mjs` to `@neondatabase/serverless` (or Hyperdrive); keep schema.
- [ ] Keep AI provider helpers shared; Worker endpoint owns deployed rate limiting via KV/DO.
- [ ] Worker assets binding for the Vite build; wire `develop` to `nova-dev` and `main` to `nova`.
- [ ] CI: deploy with Wrangler; keep `npm run lint:all` + `vitest` gates.
- [ ] Staging cutover + DNS; verify auth, save/load, AI proxy end-to-end; then production.
