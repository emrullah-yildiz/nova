import pg from 'pg';
import { readSnapshotFromPool, writeSnapshotToPool } from './snapshot-queries.mjs';

// Node persistence using the `pg` driver (raw TCP). Not worker-safe — the
// Cloudflare Worker uses NeonPersistence (neon-persistence.mjs) instead. The
// snapshot SQL is shared via snapshot-queries.mjs.
export class PostgresPersistence {
  constructor(options = {}) {
    this.pool = options.pool || null;
    this.connectionString = options.connectionString || '';
    this.schemaVersion = options.schemaVersion || 1;
    this._poolPromise = null;
  }

  async getPool() {
    if (this.pool) return this.pool;
    if (!this._poolPromise) {
      this._poolPromise = new pg.Pool({
        connectionString: this.connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
      this._poolPromise.on('error', err => {
        console.error('[PostgresPersistence] Pool error:', err.message);
      });
    }
    return this._poolPromise;
  }

  async close() {
    if (this.pool) return;
    if (this._poolPromise) {
      const pool = await this._poolPromise;
      await pool.end();
      this._poolPromise = null;
    }
  }

  async readSnapshot() {
    return readSnapshotFromPool(await this.getPool(), this.schemaVersion);
  }

  async writeSnapshot(snapshot) {
    return writeSnapshotToPool(await this.getPool(), snapshot);
  }

  async isConnected() {
    try {
      const pool = await this.getPool();
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      return false;
    }
  }
}
