import { describe, it, expect } from 'vitest';
import { NeonPersistence } from '../server/db/neon-persistence.mjs';

// Regression for the Cloudflare cloud-save 500: on Workers a
// @neondatabase/serverless Pool's WebSocket cannot outlive the request that
// opened it. A pool reused across requests is dead and its I/O hangs until the
// Worker is killed (the "pending" save that 500s). NeonPersistence must
// therefore create a FRESH pool per read/write and close it within that call —
// never cache one across calls (and thus across requests).

function makeFakePool() {
  const pool = {
    ended: false,
    queries: [],
    connected: 0,
    async connect() {
      this.connected++;
      const client = this;
      return {
        query: (text, params) => client.query(text, params),
        release: () => {}
      };
    },
    async query(text) {
      this.queries.push(text);
      return { rows: [] }; // empty DB → readSnapshot yields empty collections
    },
    async end() { this.ended = true; }
  };
  return pool;
}

function emptySnapshot() {
  return {
    schemaVersion: 1,
    organizations: [], users: [], projects: [], graphRuns: [],
    objectArtifacts: [], shareLinks: [], backgroundJobs: [],
    connectorSessions: [], aiRequests: [], auditEvents: []
  };
}

describe('NeonPersistence pool lifetime (Workers safety)', () => {
  it('creates a fresh pool per operation and closes it — never reuses one across calls', async () => {
    const pools = [];
    const persistence = new NeonPersistence({
      createPool: () => { const p = makeFakePool(); pools.push(p); return p; }
    });

    await persistence.readSnapshot();
    await persistence.writeSnapshot(emptySnapshot());
    await persistence.readSnapshot();

    // One distinct pool per call — no cross-call (cross-request) reuse.
    expect(pools).toHaveLength(3);
    // Every pool was closed within its own call, so no WebSocket leaks past the
    // request that opened it.
    expect(pools.every(p => p.ended)).toBe(true);
  });

  it('actually performs the write transaction against the per-call pool', async () => {
    const pools = [];
    const persistence = new NeonPersistence({
      createPool: () => { const p = makeFakePool(); pools.push(p); return p; }
    });

    await persistence.writeSnapshot(emptySnapshot());

    const [pool] = pools;
    expect(pool.connected).toBe(1);            // checked out a client for the tx
    expect(pool.queries).toContain('BEGIN');
    expect(pool.queries).toContain('COMMIT');
    expect(pool.ended).toBe(true);
  });

  it('reuses an injected pool and never closes it (Node/dev/tests own its lifecycle)', async () => {
    const pool = makeFakePool();
    const persistence = new NeonPersistence({ pool });

    await persistence.readSnapshot();
    await persistence.writeSnapshot(emptySnapshot());

    expect(pool.ended).toBe(false);            // injector owns close()
    await persistence.close();
    expect(pool.ended).toBe(true);             // explicit close() still ends it
  });
});
