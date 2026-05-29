# Cloudflare Pages — AI free-tier proxy setup

Nova's AI Assistant supports two modes:

| Mode | When | Who pays |
|---|---|---|
| **BYOK** (Bring Your Own Key) | The user has entered an API key in Settings → Preferences | The user (their provider account, usually $0 on free tiers) |
| **Free proxy** | The user has *no* key configured | Nova's deployment, via a server-side Groq free tier (currently $0 — rate-limited, no auto-billing) |

This document is how to wire up the **free proxy** for a deployment. Without it, users without an API key will see *"Free model not available on this deployment"* in chat and have to bring their own key.

> The proxy is a single Cloudflare Pages Function at [functions/api/proxy/chat.js](../functions/api/proxy/chat.js). It accepts an OpenAI-shaped chat completion request, forwards it to Groq with the `GROQ_API_KEY` env var, and pipes the streamed response back to the browser. The key never reaches the browser.

---

## One-time setup (10 minutes)

### 1. Get a free Groq API key

1. Sign up at **<https://groq.com>** with email — free, **no credit card required**.
2. Console → **API Keys** → **Create API Key** → give it any name → copy the value (you only see it once).

The Groq free tier is currently **~30 requests/minute, ~14k tokens/minute** with no automatic billing — when the limit is hit they return `429` errors, never a bill.

### 2. Set the key in Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → your Nova project → **Settings** → **Variables and Secrets**.
2. Click **Add**.
3. **Type:** Secret (encrypted at rest; never visible again after creation).
4. **Variable name:** `GROQ_API_KEY`
5. **Value:** the key from step 1.
6. Switch the **Environment** dropdown at the top of the page to the other environment and add the same secret there too — otherwise PR previews won't have AI.
7. Save.

### 3. (Recommended) Add a rate-limiting rule

Without this, one abusive user could exhaust the entire Groq free tier for everyone else.

1. Cloudflare dashboard → your project → **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
2. **Rule name:** `Nova free-tier proxy`
3. **If incoming requests match:** URI Path *contains* `/api/proxy/`
4. **Then:** Block, for `60 seconds`, when matching threshold:
   - Requests: **20**
   - Period: **1 minute**
5. Deploy.

This caps each IP at 20 chat requests per minute. Adjust to taste.

### 4. Redeploy

Either merge to `main` (triggers the production deploy) or click **Deployments** → top deployment → **"Retry deployment"** to pick up the env var.

---

## Verifying it works

1. Open Nova in an incognito window — guarantees no saved API key in localStorage.
2. Open the AI Assistant panel and send a prompt.
3. Expected:
   - The chat streams a response.
   - Settings → Preferences shows *"🆓 No key — using free shared model (Groq Llama 3.3 70B)."*
4. Common failure modes:
   - **"Free model not available on this deployment"** → `GROQ_API_KEY` not set, or set on only one environment. Check step 2.
   - **"Free-tier limit hit"** → working as designed; either wait a moment or add the rate-limiting rule from step 3.

---

## Costs

You will see:
- **$0** on the Cloudflare Workers bill (Pages Functions are free up to 100,000 requests/day).
- **$0** on the Groq bill (free tier has no auto-billing — they `429` you, they don't charge you).

You will only ever pay if you **manually** add a credit card to Groq and choose to upgrade. The proxy will not do that for you.

---

## Removing the proxy

If you want to disable free mode entirely (force every user to BYOK):

1. Cloudflare dashboard → Pages project → Settings → Variables and Secrets → **delete** `GROQ_API_KEY` from both environments.
2. Redeploy.

Users with no key will now see the *"Free model not available"* message and be prompted to add their own. BYOK users are unaffected.
