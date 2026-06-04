// Brute-force / abuse throttle for the authentication routes (SEC-005).
//
// Reuses the same Workers-KV bucket pattern as the AI-proxy limiter in
// worker/index.mjs (`checkRate`): one JSON bucket per key, counter incremented
// per attempt, KV TTL set to the bucket reset. Here it is applied to auth with
// per-IP AND per-account keys plus an exponential lockout so that repeated
// failed sign-ins / token guesses are rejected with a 429 BEFORE the expensive
// PBKDF2 verify ever runs.
//
// Interface (the auth dispatcher calls this first):
//   checkAuthRate(env, { ip, accountKey, action }) -> { ok, retryAfterMs }
//     ok          — false when the caller is over the limit / locked out.
//     retryAfterMs — how long to wait before retrying (0 when ok).
//
// Counters are only consumed on the *attempt* (checkAuthRate). A successful
// auth should clear the account bucket via resetAuthRate() so a legitimate user
// isn't penalised by their earlier typos.
//
// No RATE_KV bound (local dev / Node tests with no injected store) → always ok,
// matching the proxy limiter's fail-open-in-dev default.

// Per-action limits. `windowSec` is the rolling window for the counter; once
// `max` attempts land inside it, the caller is locked out for `lockoutSec`,
// which doubles every subsequent over-limit attempt up to `maxLockoutSec`
// (exponential backoff). `perAccount` limits are tighter than `perIp` because
// one IP behind a NAT may carry many users, but a single account being hammered
// is a strong brute-force signal.
const ACTION_LIMITS = {
  // Password sign-in: the primary brute-force surface (PBKDF2 per attempt).
  login: {
    perIp: { max: 20, windowSec: 15 * 60 },
    perAccount: { max: 8, windowSec: 15 * 60 },
    lockoutSec: 30,
    maxLockoutSec: 60 * 60
  },
  // Password change: authenticated, but still verifies the current password
  // (PBKDF2) — throttle per account so a hijacked session can't grind it.
  'change-password': {
    perIp: { max: 20, windowSec: 15 * 60 },
    perAccount: { max: 8, windowSec: 15 * 60 },
    lockoutSec: 30,
    maxLockoutSec: 60 * 60
  },
  // Email-verification token guessing: high-entropy tokens, but unbounded
  // guessing is still online brute force — cap it hard per IP.
  verify: {
    perIp: { max: 30, windowSec: 15 * 60 },
    perAccount: null,
    lockoutSec: 30,
    maxLockoutSec: 60 * 60
  },
  // Re-send verification email: abuse = spam + cost. Cap per IP and per email.
  'resend-verification': {
    perIp: { max: 10, windowSec: 60 * 60 },
    perAccount: { max: 5, windowSec: 60 * 60 },
    lockoutSec: 60,
    maxLockoutSec: 6 * 60 * 60
  },
  // Sign-up: cap account creation / MX-probing / email sends per IP and email.
  signup: {
    perIp: { max: 10, windowSec: 60 * 60 },
    perAccount: { max: 5, windowSec: 60 * 60 },
    lockoutSec: 60,
    maxLockoutSec: 6 * 60 * 60
  }
};

const KEY_PREFIX = 'arl:'; // auth-rate-limit (distinct from the proxy's 'rl:')

function now() { return Math.floor(Date.now() / 1000); }

// Read a bucket, count this attempt against it, and persist with a KV TTL that
// covers both the rolling window and any active lockout. Returns the decision
// for this one key. Shape:
//   { count, windowResetAt, lockedUntil, strikes }
async function consumeBucket(kv, key, limit, lockoutSec, maxLockoutSec) {
  const t = now();
  let bucket = await kv.get(key, 'json');
  if (!bucket || typeof bucket !== 'object') bucket = null;

  // Active lockout still in effect → reject without spending more of the window.
  if (bucket && bucket.lockedUntil && bucket.lockedUntil > t) {
    // Touch the TTL so the lockout record survives until it expires.
    await kv.put(key, JSON.stringify(bucket), { expiration: bucket.lockedUntil + 1 });
    return { ok: false, retryAfterMs: (bucket.lockedUntil - t) * 1000 };
  }

  // Window expired (or first hit) → start a fresh rolling window. Carry the
  // strike count so backoff keeps escalating across windows for a persistent
  // attacker, but let it decay once they finally back off (window fully reset).
  if (!bucket || !bucket.windowResetAt || bucket.windowResetAt <= t) {
    bucket = { count: 0, windowResetAt: t + limit.windowSec, lockedUntil: 0, strikes: bucket && bucket.lockedUntil ? (bucket.strikes || 0) : 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit.max) {
    // Over the limit: escalate the lockout exponentially per strike.
    bucket.strikes = (bucket.strikes || 0) + 1;
    const backoff = Math.min(lockoutSec * Math.pow(2, bucket.strikes - 1), maxLockoutSec);
    bucket.lockedUntil = t + backoff;
    const expiration = Math.max(bucket.windowResetAt, bucket.lockedUntil) + 1;
    await kv.put(key, JSON.stringify(bucket), { expiration });
    return { ok: false, retryAfterMs: backoff * 1000 };
  }

  await kv.put(key, JSON.stringify(bucket), { expiration: bucket.windowResetAt + 1 });
  return { ok: true, retryAfterMs: 0 };
}

// Throttle one auth attempt. Checks the per-IP bucket and (when an accountKey is
// supplied for this action) the per-account bucket; the caller is over the limit
// if EITHER bucket trips, and we report the longer retry. Fails open when no KV
// is bound so local dev / Node tests aren't blocked.
export async function checkAuthRate(env, { ip, accountKey, action } = {}) {
  const kv = env && env.RATE_KV;
  const limits = ACTION_LIMITS[action];
  if (!kv || !limits) return { ok: true, retryAfterMs: 0 };

  const checks = [];
  if (limits.perIp && ip) {
    checks.push(consumeBucket(kv, KEY_PREFIX + action + ':ip:' + ip, limits.perIp, limits.lockoutSec, limits.maxLockoutSec));
  }
  if (limits.perAccount && accountKey) {
    checks.push(consumeBucket(kv, KEY_PREFIX + action + ':acct:' + accountKey, limits.perAccount, limits.lockoutSec, limits.maxLockoutSec));
  }
  if (checks.length === 0) return { ok: true, retryAfterMs: 0 };

  const results = await Promise.all(checks);
  const blocked = results.filter(r => !r.ok);
  if (blocked.length === 0) return { ok: true, retryAfterMs: 0 };
  return { ok: false, retryAfterMs: Math.max(...blocked.map(r => r.retryAfterMs)) };
}

// Clear the per-account + per-IP buckets for an action after a SUCCESSFUL auth,
// so a legitimate user who fat-fingered their password a few times isn't locked
// out. Best-effort: never throws into the success path.
export async function resetAuthRate(env, { ip, accountKey, action } = {}) {
  const kv = env && env.RATE_KV;
  if (!kv || !ACTION_LIMITS[action]) return;
  const keys = [];
  if (ip) keys.push(KEY_PREFIX + action + ':ip:' + ip);
  if (accountKey) keys.push(KEY_PREFIX + action + ':acct:' + accountKey);
  try { await Promise.all(keys.map(k => kv.delete(k))); } catch { /* best effort */ }
}

export const AUTH_RATE_LIMITS = ACTION_LIMITS;
