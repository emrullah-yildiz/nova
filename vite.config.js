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
        'NOVA_CORS_ORIGIN', 'NOVA_PUBLIC_URL'
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
