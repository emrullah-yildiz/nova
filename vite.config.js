import { defineConfig, loadEnv } from 'vite';

// Local dev parity with Vercel: mount api/proxy/chat.mjs as middleware so the
// free-tier proxy works on `npm start` exactly like it does in production.
// Without this, /api/proxy/chat 404s in dev (Vite only serves static assets;
// Vercel functions don't run unless you use `vercel dev`).
//
// To use the free tier locally, put your Groq key in .env.local:
//   GROQ_API_KEY=gsk_...
function vercelFunctionsDev() {
  return {
    name: 'nova:vercel-functions-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      const passthrough = [
        'GROQ_API_KEY', 'NOVA_GROQ_API_KEY',
        'GEMINI_API_KEY', 'NOVA_GEMINI_API_KEY',
        'OPENROUTER_API_KEY', 'NOVA_OPENROUTER_API_KEY',
        'CEREBRAS_API_KEY', 'NOVA_CEREBRAS_API_KEY',
        'NOVA_CORS_ORIGIN', 'NOVA_PUBLIC_URL',
        // Auth/accounts (so the sign-in modal — Google + email/password —
        // works on `npm start` with the same API as production).
        // NOVA_DATABASE_URL is intentionally NOT passed through: dev defaults to
        // an ephemeral in-memory store so sign-in works with zero DB setup. To
        // test against Neon locally, export NOVA_DATABASE_URL in your shell (and
        // run the migrations against it first).
        'GOOGLE_CLIENT_ID', 'NOVA_SESSION_SECRET', 'NOVA_ALLOW_DEV_LOGIN',
        'NOVA_OIDC_ISSUER', 'NOVA_OIDC_CLIENT_ID'
      ];
      for (const key of passthrough) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }

      let chatHandlerPromise;
      function getChatHandler() {
        if (!chatHandlerPromise) {
          chatHandlerPromise = import('./api/proxy/chat.mjs').then(m => m.default);
        }
        return chatHandlerPromise;
      }

      function parseJsonBody(req) {
        return new Promise((resolve, reject) => {
          let raw = '';
          req.on('data', chunk => { raw += chunk; });
          req.on('end', () => {
            if (!raw) return resolve({});
            try { resolve(JSON.parse(raw)); }
            catch (err) { reject(err); }
          });
          req.on('error', reject);
        });
      }

      server.middlewares.use('/api/proxy/chat', async (req, res, next) => {
        try {
          if (req.method === 'POST') {
            try { req.body = await parseJsonBody(req); }
            catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
              return;
            }
          }
          const handler = await getChatHandler();
          await handler(req, res);
        } catch (err) {
          console.error('[nova:vercel-functions-dev] handler error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { message: String(err && err.message || err) } }));
          } else {
            next(err);
          }
        }
      });

      // Enterprise/auth API parity for dev: the Cloudflare Worker entry
      // (handleEnterpriseApi) is Fetch-API based and runtime-agnostic, so we can
      // run it straight from a connect middleware. This makes /api/auth/config,
      // /api/auth/signup, /api/auth/login, /api/auth/oidc/callback, /api/me,
      // logout, etc. work on `npm start` exactly like production — without it,
      // the sign-in modal can't see GOOGLE_CLIENT_ID (so the Google button
      // hides) and email/password sign-in has no backend.
      //
      // With no NOVA_DATABASE_URL set, the store is in-memory (resets on
      // restart) — fine for dev. Put GOOGLE_CLIENT_ID in .env.local (and add
      // http://localhost:8080 as an authorized JS origin in Google Cloud) to
      // exercise Google locally.
      let enterpriseApiPromise;
      function getEnterpriseApi() {
        if (!enterpriseApiPromise) {
          enterpriseApiPromise = import('./worker/api.mjs').then(m => m.handleEnterpriseApi);
        }
        return enterpriseApiPromise;
      }

      function nodeReqToRequest(req) {
        const url = 'http://' + (req.headers.host || 'localhost') + req.url;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v == null) continue;
          headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          return Promise.resolve(new Request(url, { method: req.method, headers }));
        }
        return new Promise((resolve, reject) => {
          let raw = '';
          req.on('data', chunk => { raw += chunk; });
          req.on('end', () => resolve(new Request(url, { method: req.method, headers, body: raw || undefined })));
          req.on('error', reject);
        });
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        if (req.url.startsWith('/api/proxy/chat')) return next(); // handled above
        try {
          const handleEnterpriseApi = await getEnterpriseApi();
          const request = await nodeReqToRequest(req);
          // Default dev to the in-memory store: drop NOVA_DATABASE_URL (often
          // exported globally / in .env.local pointing at an unmigrated Neon DB)
          // so sign-in works with zero setup. Opt into the real DB with
          // NOVA_DEV_USE_DB=true (run the migrations against it first).
          const devEnv = { ...process.env };
          if (devEnv.NOVA_DEV_USE_DB !== 'true') delete devEnv.NOVA_DATABASE_URL;
          const response = await handleEnterpriseApi(request, devEnv);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            // Strip Secure from the session cookie so the browser keeps it over
            // plain http://localhost in dev (production keeps it, served over https).
            const out = key.toLowerCase() === 'set-cookie' ? value.replace(/;\s*Secure/ig, '') : value;
            res.setHeader(key, out);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('[nova:enterprise-api-dev] handler error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { message: String(err && err.message || err) } }));
          } else {
            next(err);
          }
        }
      });
    }
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [vercelFunctionsDev()],
  server: {
    port: 8080,
    open: false,
    watch: {
      ignored: ['**/coverage/**', '**/test-results/**', '**/dist/**']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html'
    }
  }
});
