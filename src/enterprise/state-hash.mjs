// Token hashing, split out of state-store.mjs so the domain can import it
// without pulling state-store's node:net/node:tls (redis-over-TCP) deps, which
// don't bundle on Cloudflare Workers. node:crypto's createHash IS supported on
// workerd (nodejs_compat), so this module is worker-safe.
import crypto from 'node:crypto';

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
