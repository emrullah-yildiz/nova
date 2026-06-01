# Nova Deployment Guide

Nova deploys only to Cloudflare Workers. The Worker serves both the Vite SPA
from `dist/` and the `/api/*` backend from `worker/index.mjs`.

## Branches And Domains

| Git branch | Worker environment | Public URL |
|---|---|---|
| `develop` | `nova-dev` (`--env dev`) | `https://nova-dev.ey-myacc.workers.dev` |
| `main` | `nova` | `https://hi-nova.work` |

Do not attach `hi-nova.work` to preview or dev deployments. Production traffic
should only point at the default `nova` Worker deployment from `main`.

The Cloudflare dashboard screenshot for `nova.ey-myacc.workers.dev` shows the
top-level production Worker. Develop branch updates are deployed to the separate
`nova-dev` Worker environment and should be checked at
`https://nova-dev.ey-myacc.workers.dev`.

In Cloudflare, the `nova-dev` Worker should show only its Workers.dev URL. If
`nova-dev` lists `hi-nova.work`, remove that custom domain/route from `nova-dev`
in **Workers & Pages -> nova-dev -> Settings -> Domains & Routes**. Keep
`hi-nova.work` attached only to the production `nova` Worker.

## Architecture

Nova deploys as:

1. **Cloudflare Worker** - serves static assets, API routes, AI proxy, auth, and realtime entrypoints.
2. **Cloudflare assets binding** - serves the Vite build from `dist/`.
3. **Durable Objects** - host project collaboration rooms.
4. **KV** - stores session/email-verification state and AI rate-limit buckets.
5. **Neon Postgres** - stores users, organizations, projects, versions, members, runs, and audit data.

## Deploy

GitHub Actions deploys automatically:

```text
develop -> npm run build -> wrangler deploy --env dev
main    -> npm run build -> wrangler deploy --env=""
```

Manual deployment is still useful for emergency verification:

```bash
npm run build
npx wrangler deploy --env dev
npx wrangler deploy --env=""
```

## GitHub Actions deploy credentials

The `deploy-dev` / `deploy-production` jobs in `.github/workflows/ci.yml`
authenticate to Cloudflare with two **repository secrets**
(*Settings → Secrets and variables → Actions → New repository secret* — add
them as Secrets, not Variables):

| Secret | Value |
|---|---|
| `CF_API_TOKEN` | A Cloudflare API token (see below) |
| `CF_ACCOUNT_ID` | The account ID that owns the `nova` / `nova-dev` Workers (`npx wrangler whoami`, or Cloudflare dash → *Workers & Pages → Account ID*) |

If either secret is missing, the deploy step **skips with a warning** instead
of failing the pipeline — so CI stays green until deployment is wired up.

Create the token from the **"Edit Cloudflare Workers"** template
(*My Profile → API Tokens → Create Token*), scoped to:

- **Account Resources** → the account that owns the Workers (`ey.myacc@gmail.com`).
- **Zone Resources** → `hi-nova.work` (required for the production custom-domain
  route; dev uses `workers.dev` and doesn't need it).

That template grants exactly what `wrangler deploy` needs here: *Workers
Scripts: Edit* (the script, the `[assets]` upload, and the `ProjectRoom`
Durable Object migration), *Workers KV Storage: Edit* (`SESSION_KV` /
`RATE_KV`), *Account Settings: Read*, and *User Memberships: Read*. A token
missing Workers permissions, or scoped to a different account than
`CF_ACCOUNT_ID`, fails with `Authentication error [code: 10000]`.

Paste the token value with no trailing newline/space.

## Required Cloudflare Secrets

Set secrets per Worker environment in Cloudflare or with Wrangler:

```bash
npx wrangler secret put NOVA_SESSION_SECRET
npx wrangler secret put NOVA_DATABASE_URL
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put RESEND_API_KEY
```

For the dev environment:

```bash
npx wrangler secret put NOVA_SESSION_SECRET --env dev
npx wrangler secret put NOVA_DATABASE_URL --env dev
npx wrangler secret put GROQ_API_KEY --env dev
npx wrangler secret put RESEND_API_KEY --env dev
```

Use a separate Neon database or schema for `dev` so changes from `develop` do
not touch production data.

## Runtime Variables

Non-secret variables live in `wrangler.toml`.

Production:

```text
NOVA_PUBLIC_URL=https://hi-nova.work
NOVA_CORS_ORIGIN=https://hi-nova.work
NOVA_ALLOW_DEV_LOGIN=false
```

Dev:

```text
NOVA_PUBLIC_URL=https://nova-dev.ey-myacc.workers.dev
NOVA_CORS_ORIGIN=https://nova-dev.ey-myacc.workers.dev
NOVA_ALLOW_DEV_LOGIN=false
```

## Database Migrations

Run migrations against the target Neon database before relying on cloud saves:

```bash
npm run migrate:neon -- up
```

For local migration commands, keep the Neon connection string in `.env.local`.
Do not commit `.env.local`.

## Local Development

Run a local Worker with the same entrypoint used in production:

```bash
npm run build
npm run cf:dev
```

For frontend-only iteration:

```bash
npm run dev
```

## Verification

After deploying, check:

```text
https://nova-dev.ey-myacc.workers.dev/api/health
https://nova-dev.ey-myacc.workers.dev/nova-deployment.json
https://hi-nova.work/api/health
https://hi-nova.work/nova-deployment.json
```

The `nova-deployment.json` response should contain the GitHub commit SHA from
the deploy run. Then open Nova, sign in, create a graph, and use
`File -> Save to Cloud`.
