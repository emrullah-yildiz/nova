// Worker-safe persistence using @neondatabase/serverless (HTTP/WebSocket, no
// raw TCP), so it runs on Cloudflare Workers where node `pg` can't. Same
// interface as PostgresPersistence; SQL is shared via snapshot-queries.mjs.
//
// In a Worker, pass a Hyperdrive/Neon connection string from env. In Node (e.g.
// dev or migrations) the driver also works; for plain Node a WebSocket
// constructor may need configuring (neonConfig.webSocketConstructor).
import { Pool, neonConfig } from '@neondatabase/serverless';
import { readSnapshotFromPool, writeSnapshotToPool } from './snapshot-queries.mjs';

export class NeonPersistence {
  constructor(options = {}) {
    this.pool = options.pool || null;
    this.connectionString = options.connectionString || '';
    this.schemaVersion = options.schemaVersion || 1;
    // Allow the caller to inject a WebSocket constructor for non-workerd
    // environments (workerd provides WebSocket natively, so this is a no-op there).
    if (options.webSocketConstructor) neonConfig.webSocketConstructor = options.webSocketConstructor;
  }

  getPool() {
    if (!this.pool) this.pool = new Pool({ connectionString: this.connectionString });
    return this.pool;
  }

  async close() {
    if (this.pool && typeof this.pool.end === 'function') await this.pool.end();
  }

  async readSnapshot() {
    return readSnapshotFromPool(this.getPool(), this.schemaVersion);
  }

  async writeSnapshot(snapshot) {
    return writeSnapshotToPool(this.getPool(), snapshot);
  }

  async isConnected() {
    try {
      await this.getPool().query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
