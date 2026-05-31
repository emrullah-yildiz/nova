// Worker-safe persistence using @neondatabase/serverless (HTTP/WebSocket, no
// raw TCP), so it runs on Cloudflare Workers where node `pg` can't. Same
// interface as PostgresPersistence; SQL is shared via snapshot-queries.mjs.
//
// CRITICAL — pool lifetime on Cloudflare Workers: a @neondatabase/serverless
// `Pool`/`Client` is carried by a WebSocket that CANNOT outlive a single
// request. workerd cancels that socket when the request that opened it ends, so
// a pool cached on the instance (or via a module-global like worker/api.mjs's
// `cachedApi`) is dead on the next request — and I/O on it hangs until the
// Worker is killed, surfacing as a "pending" request that 500s. We therefore
// create a FRESH pool per read/write, use it, and close it, all inside the one
// call (and thus the one request). See the driver README: "connect, use and
// close within a single request handler".
//
// In Node (dev/migrations/tests) a long-lived pool is fine and reconnecting per
// call is wasteful, so a caller may inject `pool` (reused, never auto-closed) or
// a `createPool` factory.
import { Pool, neonConfig } from '@neondatabase/serverless';
import { readSnapshotFromPool, writeSnapshotToPool } from './snapshot-queries.mjs';

export class NeonPersistence {
  constructor(options = {}) {
    // A pre-made pool to reuse (Node/tests). When set we never create or close
    // pools ourselves — the injector owns its lifecycle.
    this.injectedPool = options.pool || null;
    this.connectionString = options.connectionString || '';
    this.schemaVersion = options.schemaVersion || 1;
    // How to make a request-scoped pool when none was injected. Overridable so
    // tests can supply a fake without a real database / WebSocket.
    this.createPool = options.createPool || (() => new Pool({ connectionString: this.connectionString }));
    // Allow the caller to inject a WebSocket constructor for non-workerd
    // environments (workerd provides WebSocket natively, so this is a no-op there).
    if (options.webSocketConstructor) neonConfig.webSocketConstructor = options.webSocketConstructor;
  }

  // Run `fn(pool)` with a pool that lives ONLY for this call. With an injected
  // pool we reuse it and never close it; otherwise we create a fresh one and end
  // it in `finally` so its WebSocket never leaks past the current request.
  async _withPool(fn) {
    if (this.injectedPool) return fn(this.injectedPool);
    const pool = this.createPool();
    try {
      return await fn(pool);
    } finally {
      try { if (pool && typeof pool.end === 'function') await pool.end(); }
      catch { /* closing a spent pool must not mask the real result/error */ }
    }
  }

  async readSnapshot() {
    return this._withPool(pool => readSnapshotFromPool(pool, this.schemaVersion));
  }

  async writeSnapshot(snapshot) {
    return this._withPool(pool => writeSnapshotToPool(pool, snapshot));
  }

  async close() {
    if (this.injectedPool && typeof this.injectedPool.end === 'function') await this.injectedPool.end();
  }

  async isConnected() {
    try {
      return await this._withPool(async pool => { await pool.query('SELECT 1'); return true; });
    } catch {
      return false;
    }
  }
}
