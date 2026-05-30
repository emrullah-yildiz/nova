// Worker-safe replacements for the node state store (redis-over-TCP) and object
// storage (node:fs): Cloudflare KV for session state, R2 for artifacts. Same
// interfaces the EnterpriseStore / artifact handlers expect.

// KV-backed state store (get/set/delete/increment with TTL). KV's minimum
// expirationTtl is 60s, so short TTLs are clamped up.
export function createKvStateStore(kv) {
  const ttlOpts = (ttlMs) => (ttlMs ? { expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)) } : {});
  return {
    async get(key) {
      return kv.get(key, 'json'); // null when missing
    },
    async set(key, value, ttlMs = 0) {
      await kv.put(key, JSON.stringify(value), ttlOpts(ttlMs));
    },
    async delete(key) {
      await kv.delete(key);
    },
    async increment(key, ttlMs = 0) {
      const next = Number((await kv.get(key)) || 0) + 1;
      await kv.put(key, String(next), ttlOpts(ttlMs));
      return next;
    }
  };
}

// R2-backed object storage (putObject/getObject), matching the node disk store's
// interface used by the artifact routes.
export function createR2ObjectStorage(bucket) {
  return {
    async putObject(key, bytes) {
      await bucket.put(key, bytes);
    },
    async getObject(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return new Uint8Array(await object.arrayBuffer());
    }
  };
}
