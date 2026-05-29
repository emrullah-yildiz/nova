import { loadEnvFile } from './load-env-file.mjs';

loadEnvFile('.env.local');

if (!process.env.NOVA_DATABASE_URL) {
  throw new Error('NOVA_DATABASE_URL is missing. Add it to .env.local or set it in the shell.');
}

process.env.NOVA_ALLOW_DEV_LOGIN = process.env.NOVA_ALLOW_DEV_LOGIN || 'true';

await import('./enterprise-api.mjs');
