# Nova Deployment Guide

This guide covers deploying Nova to production.

## Architecture

Nova has two deployable parts:

1. **Frontend** — Vite-built static site (HTML/CSS/JS) hosted on Cloudflare Pages
2. **API** — Node.js backend running on a server with PostgreSQL

## Frontend: Cloudflare Pages (Free)

Cloudflare Pages is the recommended frontend host. It's free, globally distributed, and supports automatic deployments from GitHub.

### One-Time Setup

1. Go to https://dash.cloudflare.com and sign up (free, no credit card required)
2. Navigate to **Workers & Pages** → **Pages**
3. Click **Connect to Git** and select your Nova repository
4. In **Build settings**, use:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**

### Environment Variables (Frontend)

After deployment, set these in Cloudflare Pages → your project → **Environment variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_NOVA_API_BASE_URL` | `https://your-api.com` | API endpoint URL |
| `VITE_NOVA_WEBSOCKET_URL` | `wss://your-api.com` | WebSocket endpoint for Connect hub |
| `VITE_NOVA_AUTH_PROVIDER` | `dev` or `oidc` | Auth method |
| `VITE_NOVA_APP_VERSION` | `0.1.0` | Build version |

### CI/CD Integration (Automatic)

The `.github/workflows/ci.yml` file has two deploy jobs already configured:

1. **`deploy-preview`** — Deploys every PR to a unique preview URL automatically
2. **`deploy-production`** — Deploys pushes to `main` to production

To enable them, set one GitHub Actions secret:
- `CF_API_TOKEN` — A Cloudflare API token with Pages write permissions

### Getting a Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use the **Cloudflare Pages** template
4. Set permissions to **Read** and **Write** for your account
5. Copy the token and add it to GitHub:
   - GitHub → Settings → Secrets and variables → Actions
   - Click **New repository secret**
   - Name: `CF_API_TOKEN`, Value: paste the token

### SPA Routing

The `public/_redirects` file ensures all routes fall back to `index.html` for client-side routing. Cloudflare Pages picks this up automatically.

## API Backend: Any Node.js Host

The API is a standard Node.js HTTP server. You can deploy it to:

### Option A: Railway (Free Tier)

1. Go to https://railway.app and sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Set the start command: `npm run dev:api`
4. Add environment variables (see `docs/enterprise-api.env.example`)
5. Add a PostgreSQL plugin (free 500MB)

### Option B: Fly.io (Free Tier)

1. Install the Fly CLI: `npm install -g @flyio/flyctl`
2. Run `flyctl launch` in the project root
3. Create a `fly.toml` with this content:
```toml
app = "nova-api"
[build]
  docker = "Dockerfile.api"
[[services]]
  internal_port = 8787
  protocol = "tcp"
  [services.concurrency]
    hard_limit = 25
  [[services.ports]]
    port = 80
    handlers = ["http"]
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

### Option C: Self-hosted (Docker)

```bash
docker build -f Dockerfile.api -t nova-api .
docker run --rm -p 8787:8787 \
  -e NOVA_DATABASE_URL=postgres://... \
  -e NOVA_SESSION_SECRET=... \
  -e NOVA_CORS_ORIGIN=https://your-frontend.pages.dev \
  nova-api
```

### Required Environment Variables (API)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NOVA_DATABASE_URL` | Production | — | PostgreSQL connection string |
| `NOVA_REDIS_URL` | Production | — | Redis URL for sessions, connector pairing, and rate limits |
| `NOVA_SESSION_SECRET` | Yes | — | Long random string for session signing |
| `NOVA_CORS_ORIGIN` | Yes | `*` | Frontend URL for CORS |
| `NOVA_ALLOW_DEV_LOGIN` | No | `false` | Set to `true` for local dev only |
| `NOVA_OIDC_ISSUER` | Optional | — | OIDC provider URL for SSO |
| `NOVA_OIDC_CLIENT_ID` | Optional | — | OIDC client ID |

### Production Checklist

- [ ] Database: `npm run migrate` run at deploy time
- [ ] Database integration check: `NOVA_POSTGRES_INTEGRATION_TESTS=true NOVA_DATABASE_URL=postgres://... npm run test:postgres`
- [ ] Redis state store configured with `NOVA_REDIS_URL`
- [ ] `NOVA_ALLOW_DEV_LOGIN` not set or explicitly `false`
- [ ] `NOVA_SESSION_SECRET` set to a strong random value
- [ ] `NOVA_CORS_ORIGIN` set to the exact frontend URL
- [ ] TLS termination at the load balancer or ingress
- [ ] Security headers already set by the API (X-Content-Type-Options, X-Frame-Options, etc.)
- [ ] Database connection uses SSL (`?sslmode=require` or `verify-full`)
- [ ] Health check endpoint: `GET /health`

### Postgres Integration Test

The Postgres persistence integration test uses a real Postgres service, creates a temporary schema, runs the production migrations in that schema, round-trips an enterprise snapshot, and drops the schema afterward.

Run it against a disposable database or staging database user:

```bash
NOVA_POSTGRES_INTEGRATION_TESTS=true NOVA_DATABASE_URL=postgres://user:password@localhost:5432/nova?sslmode=verify-full npm run test:postgres
```

Without `NOVA_POSTGRES_INTEGRATION_TESTS=true` and `NOVA_DATABASE_URL`, the test is skipped during normal unit test runs.
