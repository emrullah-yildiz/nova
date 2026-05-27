import { createEnterpriseApiServer } from '../src/enterprise/api-server.mjs';

const port = Number(process.env.NOVA_API_PORT || 8787);
const host = process.env.NOVA_API_HOST || '127.0.0.1';
const corsOrigin = process.env.NOVA_CORS_ORIGIN || '*';
const persistenceFilePath = process.env.NOVA_ENTERPRISE_STORE_FILE || '';
const databaseUrl = process.env.NOVA_DATABASE_URL || '';
const allowDevLogin = process.env.NOVA_ALLOW_DEV_LOGIN !== 'false';
const sessionSecret = process.env.NOVA_SESSION_SECRET || undefined;

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

const { server } = createEnterpriseApiServer(options);

server.listen(port, host, () => {
  console.log('[Nova Enterprise API] listening on http://' + host + ':' + port);
  console.log('[Nova Enterprise API] dev login ' + (allowDevLogin ? 'enabled' : 'disabled'));
});
