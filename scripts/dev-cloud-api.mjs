import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('.data');
fs.mkdirSync(dataDir, { recursive: true });

process.env.NOVA_DATABASE_URL = '';
process.env.NOVA_ALLOW_DEV_LOGIN = 'true';
process.env.NOVA_ENTERPRISE_STORE_FILE = path.join(dataDir, 'nova-store.json');

await import('./enterprise-api.mjs');
