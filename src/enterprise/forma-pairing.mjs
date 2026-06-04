// Forma pairing-code service (FM-M1, Link / platform-engineer).
// ----------------------------------------------------------------------------
// The Forma transport is a CLOUD RELAY — a Cloudflare Durable Object "pairing
// room" the Forma extension iframe (`forma-extension` peer) and the standalone
// Nova app (`nova-app` peer) both join by a PAIRING CODE. This module owns the
// authoritative pairing-code lifecycle, mirroring the Revit pairing-token policy
// (docs/architecture/forma-connect.md "Pairing code lifecycle"):
//
//   - HIGH ENTROPY   — 256 bits of randomness (32 random bytes → 64 hex chars),
//                      comfortably above the >=128-bit floor (the Revit bar).
//   - SESSION-BOUND  — minted FOR an authenticated Nova session/user. Oracle
//                      FM-M0 F-001: code-possession ALONE must NOT authorize a
//                      join. The nova-app peer must present its own session to
//                      join, and the room verifies the code was issued to THAT
//                      user. (The forma-extension peer joins by code only — it
//                      runs inside the user's Forma iframe, not a Nova session —
//                      but it can only ever reach a room the nova-app peer's
//                      session already authorized, and is role-capped to relay
//                      frames; it never receives Nova credentials.)
//   - SHORT-LIVED    — default 24h expiry, then rejected.
//   - ONE-TIME JOIN  — each role may bind ONCE. A second nova-app join with a
//                      stale/used code is rejected (defends against code replay).
//   - REVOCABLE      — revoke() drops the record so the room can be torn down.
//
// Storage: hashed code → record in the injected stateStore (Cloudflare KV in the
// Worker; an in-memory Map fallback in node/dev/tests). We store the HASH of the
// code, never the raw code (mirrors the session/email-verify token pattern), so
// a KV/snapshot read never leaks a live joinable code.
//
// No Forma credentials and no Nova enterprise secrets are ever stored in or
// carried by the pairing record (forma-connect.md "Security").

import crypto from 'node:crypto';
import { hashToken } from './state-hash.mjs';

export const FORMA_PAIRING_PREFIX = 'formapair:';
export const DEFAULT_PAIRING_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// 32 random bytes = 256 bits, formatted as 64 lowercase hex chars.
const CODE_BYTES = 32;
// The two relay roles. Exactly one peer per role may bind per room.
export const FORMA_PEER_ROLES = ['nova-app', 'forma-extension'];

/** Mint a high-entropy (256-bit) pairing code as lowercase hex. */
export function mintPairingCode() {
  return crypto.randomBytes(CODE_BYTES).toString('hex');
}

/**
 * Forma pairing-code service. Construct with the same `stateStore` shape the
 * EnterpriseStore uses (`get`/`set`/`delete`, TTL in ms); pass `null`/omit for an
 * in-memory fallback (node/dev/tests). `now` is injectable for deterministic
 * tests. Codes are hashed at rest; the raw code is returned only at issuance.
 */
export class FormaPairingService {
  constructor({ stateStore = null, now = () => Date.now() } = {}) {
    this.stateStore = stateStore || null;
    this.now = now;
    // In-memory fallback when no KV is wired. Keyed by hashToken(code).
    this._mem = new Map();
  }

  async _get(key) {
    if (this.stateStore) return this.stateStore.get(key);
    const record = this._mem.get(key);
    return record === undefined ? null : record;
  }

  async _set(key, value, ttlMs) {
    if (this.stateStore) return this.stateStore.set(key, value, ttlMs);
    this._mem.set(key, value);
  }

  async _delete(key) {
    if (this.stateStore) return this.stateStore.delete(key);
    this._mem.delete(key);
  }

  /**
   * Issue a pairing code BOUND to an authenticated Nova session/user. Returns
   * `{ code, expiresAt }`; `code` is the raw code shown to the user once and
   * never stored in the clear.
   *
   * @param {{ userId: string, organizationId?: string, ttlMs?: number }} opts
   */
  async issue({ userId, organizationId = '', ttlMs = DEFAULT_PAIRING_TTL_MS } = {}) {
    if (!userId) throw new Error('Forma pairing code requires an authenticated user.');
    const code = mintPairingCode();
    const key = FORMA_PAIRING_PREFIX + hashToken(code);
    const expiresAt = this.now() + ttlMs;
    const record = {
      userId: String(userId),
      organizationId: String(organizationId || ''),
      expiresAt,
      createdAt: this.now(),
      // One-time-join bookkeeping: which roles have already bound to the room.
      joinedRoles: {},
      revoked: false
    };
    await this._set(key, record, ttlMs);
    return { code, expiresAt };
  }

  /** Load a (non-expired, non-revoked) record by raw code, else null. */
  async _loadValid(code) {
    if (!code) return { key: null, record: null, reason: 'missing_code' };
    const key = FORMA_PAIRING_PREFIX + hashToken(String(code));
    const record = await this._get(key);
    if (!record) return { key, record: null, reason: 'unknown_code' };
    if (record.revoked) return { key, record: null, reason: 'revoked' };
    if (record.expiresAt && record.expiresAt < this.now()) {
      await this._delete(key);
      return { key, record: null, reason: 'expired' };
    }
    return { key, record, reason: null };
  }

  /**
   * Authorize a peer joining the room for `code` as `role`.
   *
   * F-001 enforcement: when `role === 'nova-app'` the caller MUST present the
   * Nova session userId the code was issued to (`sessionUserId`); a mismatch is
   * rejected — code-possession alone never authorizes the Nova peer. The
   * `forma-extension` peer joins by code only (it has no Nova session).
   *
   * One-time-join: a role that has already bound is rejected (replay defense).
   *
   * Returns `{ ok: true, record }` on success (the role is recorded as bound and
   * persisted), else `{ ok: false, reason }`.
   *
   * @param {{ code: string, role: string, sessionUserId?: string|null }} opts
   */
  async authorizeJoin({ code, role, sessionUserId = null } = {}) {
    if (!FORMA_PEER_ROLES.includes(role)) return { ok: false, reason: 'unknown_role' };
    const { key, record, reason } = await this._loadValid(code);
    if (!record) return { ok: false, reason: reason || 'unknown_code' };

    // F-001: the nova-app peer must present the session the code was issued to.
    if (role === 'nova-app') {
      if (!sessionUserId) return { ok: false, reason: 'session_required' };
      if (String(sessionUserId) !== record.userId) return { ok: false, reason: 'session_mismatch' };
    }

    // One-time-join per role.
    if (record.joinedRoles && record.joinedRoles[role]) {
      return { ok: false, reason: 'already_joined' };
    }

    record.joinedRoles = record.joinedRoles || {};
    record.joinedRoles[role] = this.now();
    const ttlMs = Math.max(1000, record.expiresAt - this.now());
    await this._set(key, record, ttlMs);
    return { ok: true, record };
  }

  /**
   * Resolve the owning Nova user/org for a code WITHOUT binding a role. Used by
   * the room to key audit rows. Returns `{ ok, userId, organizationId }` or
   * `{ ok: false, reason }`.
   */
  async resolveOwner(code) {
    const { record, reason } = await this._loadValid(code);
    if (!record) return { ok: false, reason: reason || 'unknown_code' };
    return { ok: true, userId: record.userId, organizationId: record.organizationId };
  }

  /**
   * Revoke a code (admin / teardown path). Idempotent: returns true if a record
   * was found and dropped, false otherwise. `expectUserId`, when supplied, scopes
   * the revoke to the code's owner (a user may only revoke their own code).
   */
  async revoke(code, { expectUserId = null } = {}) {
    if (!code) return false;
    const key = FORMA_PAIRING_PREFIX + hashToken(String(code));
    const record = await this._get(key);
    if (!record) return false;
    if (expectUserId !== null && String(expectUserId) !== record.userId) return false;
    await this._delete(key);
    return true;
  }
}

export function createFormaPairingService(opts = {}) {
  return new FormaPairingService(opts);
}
