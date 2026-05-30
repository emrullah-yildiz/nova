import { describe, it, expect } from 'vitest';
import { EnterpriseStore } from '../src/enterprise/domain.mjs';

// Regression: rapid mutations must not run two concurrent full-snapshot writes
// against an async persistence (Postgres deadlocks on overlapping full-table
// DELETE+INSERT transactions — which surfaced as an invite "failing" after it
// had already been created + emailed).

describe('snapshot persistence serialization', () => {
  it('serializes concurrent async writes (max in-flight = 1) and persists the latest state', async () => {
    let active = 0, maxActive = 0, writes = 0, lastOrgCount = 0;
    const persistence = {
      readSnapshot() { return null; },
      async writeSnapshot(snapshot) {
        active++; maxActive = Math.max(maxActive, active); writes++;
        await new Promise(r => setTimeout(r, 5));
        lastOrgCount = (snapshot.organizations || []).length;
        active--;
        return true;
      }
    };
    const store = new EnterpriseStore({ persistence });
    await store.ready();

    // Three mutations back-to-back → three persist() calls with overlapping timing.
    store.createOrganization({ name: 'A' });
    store.createOrganization({ name: 'B' });
    store.createOrganization({ name: 'C' });

    await store.flushPersistence();

    expect(maxActive).toBe(1);          // never two concurrent transactions
    expect(writes).toBeGreaterThanOrEqual(1);
    expect(lastOrgCount).toBe(3);       // final write reflects all three orgs
  });

  it('a transient async write failure does not reject flushPersistence', async () => {
    let n = 0;
    const persistence = {
      readSnapshot() { return null; },
      async writeSnapshot() { n++; if (n === 1) throw new Error('transient'); return true; }
    };
    const store = new EnterpriseStore({ persistence });
    await store.ready();
    store.createOrganization({ name: 'A' }); // first write throws
    store.createOrganization({ name: 'B' }); // second write succeeds
    await expect(store.flushPersistence()).resolves.toBeUndefined(); // swallowed, not propagated
  });
});
