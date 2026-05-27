/**
 * Nova Enterprise API — Migration Runner
 *
 * Usage:
 *   node scripts/run-migrations.mjs
 *   NOVA_DATABASE_URL=postgres://... node scripts/run-migrations.mjs status
 *
 * Reads NOVA_DATABASE_URL environment variable, or falls back to DATABASE_URL.
 */

import { runMigrations } from '../server/db/run-migrations.mjs';
import { PostgresPersistence } from '../server/db/postgres-persistence.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.NOVA_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] ERROR: NOVA_DATABASE_URL or DATABASE_URL must be set.');
    console.error('[migrate] Usage: NOVA_DATABASE_URL=postgres://user:pass@localhost:5432/nova node scripts/run-migrations.mjs [up|status]');
    process.exit(1);
  }

  const persistence = new PostgresPersistence({ connectionString: databaseUrl });
  const pool = await persistence.getPool();

  try {
    const action = process.argv[2] || 'up';

    if (action === 'status') {
      let rows = [];
      try {
        const result = await pool.query('SELECT name, applied_at FROM _migrations ORDER BY name');
        rows = result.rows;
      } catch {
        // _migrations table may not exist yet
      }

      const migDir = path.join(__dirname, '..', 'server', 'db', 'migrations');
      const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
      const applied = new Set(rows.map(r => r.name));

      console.log('\nMigration status:');
      for (const file of files) {
        const status = applied.has(file) ? '✓ APPLIED' : '— PENDING';
        console.log(`  ${status}  ${file}`);
      }
      console.log(`\n${applied.size}/${files.length} migrations applied.\n`);
      return;
    }

    if (action === 'up') {
      await runMigrations(pool);
      console.log('[migrate] All migrations applied successfully.');
      return;
    }

    console.error('[migrate] Unknown action: ' + action);
    console.error('  Available: up (default), status');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[migrate] Fatal error:', err.message);
  process.exit(1);
});