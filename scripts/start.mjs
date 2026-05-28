/**
 * Nova Enterprise API — Production startup script.
 *
 * Runs migrations if NOVA_DATABASE_URL is set, then starts the API server.
 */

import { runMigrations } from '../server/db/run-migrations.mjs';
import { PostgresPersistence } from '../server/db/postgres-persistence.mjs';

export async function main(env = process.env) {
  const dbUrl = env.NOVA_DATABASE_URL;

  if (dbUrl) {
    console.log('[start] Running database migrations...');
    const pg = new PostgresPersistence({ connectionString: dbUrl });
    const pool = await pg.getPool();
    try {
      await runMigrations(pool);
      console.log('[start] Migrations complete.');
    } finally {
      await pool.end();
    }
  } else {
    console.log('[start] No NOVA_DATABASE_URL set — skipping migrations.');
  }

  // Start the API server (importing enterprise-api.mjs starts listening)
  await import('./enterprise-api.mjs');
}

// Run if executed directly
main().catch(err => {
  console.error('[start] Fatal error:', err);
  process.exit(1);
});
