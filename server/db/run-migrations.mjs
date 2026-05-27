import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(pool, options = {}) {
  const migrationsDir = options.migrationsDir || MIGRATIONS_DIR;
  const log = options.log || console.log;

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name      TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  // Get list of migration files sorted by name
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Get already-applied migrations
  const { rows: applied } = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      log(`[migrations] Already applied: ${file}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    log(`[migrations] Applying: ${file}...`);
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)',
        [file, Date.now()]
      );
      log(`[migrations] Applied: ${file}`);
    } catch (err) {
      log(`[migrations] FAILED: ${file} — ${err.message}`);
      throw err;
    }
  }

  log('[migrations] All migrations applied.');
}

export async function getMigrationStatus(pool) {
  const { rows } = await pool.query('SELECT name, applied_at FROM _migrations ORDER BY name');
  return rows;
}