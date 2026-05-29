# Nova Deployment Guide

This guide focuses on the current production target: Vercel for the web app
and serverless API, with Neon Postgres for cloud project persistence.

## Architecture

Nova deploys as:

1. **Vercel frontend** - Vite-built static files from `dist/`.
2. **Vercel API routes** - `api/**/*.mjs`, including Nova Cloud and the free AI proxy.
3. **Neon Postgres** - durable storage for projects, versions, members, runs, and audit data.

The production URL can serve both the app and the API:

```text
https://your-vercel-app.vercel.app
https://your-vercel-app.vercel.app/health
https://your-vercel-app.vercel.app/api/projects
```

## Vercel Project Settings

Use these build settings:

```text
Framework preset: Other
Build command: npm run build
Output directory: dist
Install command: npm install
```

## Environment Variables

Add these in Vercel Project Settings -> Environment Variables.

### API variables

```text
NOVA_DATABASE_URL=postgresql://...
NOVA_SESSION_SECRET=<long random secret>
NOVA_ALLOW_DEV_LOGIN=true
NOVA_CORS_ORIGIN=https://your-vercel-app.vercel.app
```

`NOVA_ALLOW_DEV_LOGIN=true` is currently required because the web app uses the
demo login flow. Before a public launch with real users, replace dev login with
real auth and set it to `false`.

Optional AI provider secrets:

```text
GROQ_API_KEY=<groq key for the free proxy>
NOVA_GROQ_API_KEY=<groq key for enterprise AI provider routing>
NOVA_OPENAI_API_KEY=<openai key>
NOVA_OPENROUTER_API_KEY=<openrouter key>
```

### Frontend variables

```text
VITE_NOVA_ENV=production
VITE_NOVA_API_BASE_URL=https://your-vercel-app.vercel.app
VITE_NOVA_CONNECTOR_PAIRING_URL=https://your-vercel-app.vercel.app/api/connectors/sessions
VITE_NOVA_ENTERPRISE_AI_ENABLED=false
VITE_NOVA_CLOUD_PROJECTS_ENABLED=true
```

The checked-in `public/nova-config.js` is loaded at runtime. For production,
make sure it points at the deployed API URL or is generated/overridden by your
deployment process.

## Database Migrations

Run migrations against Neon before relying on cloud saves:

```bash
npm run migrate:neon -- up
```

For local migration commands, keep the Neon connection string in `.env.local`.
Do not commit `.env.local`.

## Local Development With Neon

Start the API:

```bash
npm run dev:neon:api
```

Start the frontend:

```bash
npm run dev
```

The local frontend defaults to `http://127.0.0.1:8787` for the API.

## Verification

After deploying, check:

```text
https://your-vercel-app.vercel.app/health
```

Expected response:

```json
{
  "ok": true,
  "service": "nova-enterprise-api"
}
```

Then open Nova, create a graph, and use `File -> Save to Cloud`.
