/**
 * Nova Enterprise API — startup script.
 *
 * Handles async initialization of optional OIDC verifier before creating the server.
 */

import { createEnterpriseApiServerAsync } from '../src/enterprise/api-server.mjs';

async function start() {
  const port = Number(process.env.NOVA_API_PORT || 8787);
  const host = process.env.NOVA_API_HOST || '127.0.0.1';
  const corsOrigin = process.env.NOVA_CORS_ORIGIN || '*';
  const persistenceFilePath = process.env.NOVA_ENTERPRISE_STORE_FILE || '';
  const databaseUrl = process.env.NOVA_DATABASE_URL || '';
  const allowDevLogin = process.env.NOVA_ALLOW_DEV_LOGIN === 'true';
  const sessionSecret = process.env.NOVA_SESSION_SECRET || undefined;
  const oidcIssuer = process.env.NOVA_OIDC_ISSUER || '';
  const oidcClientId = process.env.NOVA_OIDC_CLIENT_ID || '';

  const options = {
    allowDevLogin,
    corsOrigin,
    sessionSecret
  };

  if (databaseUrl) {
    options.databaseUrl = databaseUrl;
    console.log('[Nova Enterprise API] using Postgres persistence');
  } else if (persistenceFilePath) {
    options.persistenceFilePath = persistenceFilePath;
    console.log('[Nova Enterprise API] persistence file ' + persistenceFilePath);
  } else {
    console.log('[Nova Enterprise API] using in-memory store');
  }

  // Wire OIDC/JWKS verifier if both issuer and client ID are configured
  if (oidcIssuer && oidcClientId) {
    try {
      const { createJwksVerifier } = await import('../server/auth/jwks-verifier.mjs');
      options.oidcVerifier = createJwksVerifier({ issuer: oidcIssuer, clientId: oidcClientId });
      console.log('[Nova Enterprise API] OIDC verifier enabled: ' + oidcIssuer);
    } catch (err) {
      console.warn('[Nova Enterprise API] Failed to load OIDC verifier:', err.message);
    }
  }

  const { server } = await createEnterpriseApiServerAsync(options);

  server.listen(port, host, () => {
    console.log('[Nova Enterprise API] listening on http://' + host + ':' + port);
    console.log('[Nova Enterprise API] dev login ' + (allowDevLogin ? 'enabled' : 'disabled'));
    if (oidcIssuer) console.log('[Nova Enterprise API] OIDC issuer: ' + oidcIssuer);
  });
}

start().catch(err => {
  console.error('[Nova Enterprise API] Fatal startup error:', err);
  process.exit(1);
});
