// Pure relay-routing core for the Forma pairing-room Durable Object (FM-M1).
// ----------------------------------------------------------------------------
// Split out of worker/forma-room.mjs (the I/O shell) so the role-scoping,
// validate-before-route, presence, and write-audit DECISIONS are pure and
// unit-testable without WebSocketPair / a live DO — mirroring how
// src/app/collab-core.js factors ProjectRoom's routing out of worker/room.mjs.
//
// The DO holds at most TWO peers, one per role: exactly one `nova-app` and one
// `forma-extension` (FORMA_PEER_ROLES). A frame from one peer is relayed to the
// OTHER peer (the "target"), never echoed back. Control frames (presence) are
// emitted by the room itself.

import {
  validateFormaMessage,
  isFormaWriteMessage,
  FORMA_MESSAGE_TYPES
} from './forma-bridge.js';

export const FORMA_PEER_ROLES = ['nova-app', 'forma-extension'];

/** The peer a frame from `role` should be relayed to (the other role). */
export function otherRole(role) {
  return role === 'nova-app' ? 'forma-extension' : 'nova-app';
}

/** Set of allow-listed Forma message `type` values (FM-M0 protocol). */
const KNOWN_TYPES = new Set(Object.values(FORMA_MESSAGE_TYPES));

/**
 * Decide whether a peer with `role` may join given the roles already present.
 * Returns { ok } or { ok:false, reason }. Enforces exactly one peer per role
 * and a known role.
 *
 * @param {string} role
 * @param {Set<string>|string[]} presentRoles
 */
export function evaluateJoin(role, presentRoles) {
  if (!FORMA_PEER_ROLES.includes(role)) return { ok: false, reason: 'unknown_role' };
  const present = presentRoles instanceof Set ? presentRoles : new Set(presentRoles || []);
  if (present.has(role)) return { ok: false, reason: 'role_taken' };
  return { ok: true };
}

/**
 * Route one inbound relay frame from `fromRole`. Pure: returns a decision the
 * I/O shell acts on. Never throws.
 *
 * Returns one of:
 *   { action: 'reject', reason, errors? }        — drop the frame (and notify sender)
 *   { action: 'relay', toRole, frame, isWrite, operation }  — forward to the other peer
 *
 * VALIDATE-BEFORE-ROUTE (Oracle FM-M0 F-002): the frame must (a) parse, (b) be a
 * known FORMA_MESSAGE_TYPE on the allow-list, and (c) pass validateFormaMessage.
 * Unknown/forged/malformed frames are REJECTED, never permissively forwarded.
 *
 * @param {string} fromRole
 * @param {*} rawFrame  the parsed JSON frame (object), or null if unparsable
 */
export function routeFrame(fromRole, rawFrame) {
  if (!rawFrame || typeof rawFrame !== 'object') {
    return { action: 'reject', reason: 'unparsable_frame' };
  }
  const type = rawFrame.type;
  if (!type || typeof type !== 'string') {
    return { action: 'reject', reason: 'missing_type' };
  }
  // Allow-list: only known protocol message types are routable. Unknown types
  // are rejected, not forwarded (no permissive relay).
  if (!KNOWN_TYPES.has(type)) {
    return { action: 'reject', reason: 'unknown_type', errors: [`Unknown Forma message type: ${type}`] };
  }
  const validation = validateFormaMessage(rawFrame);
  if (!validation.ok) {
    return { action: 'reject', reason: 'validation_failed', errors: validation.errors };
  }
  return {
    action: 'relay',
    toRole: otherRole(fromRole),
    frame: rawFrame,
    isWrite: isFormaWriteMessage(type),
    operation: type
  };
}

/** Build a presence control frame the room emits to peers. */
export function presenceFrame(event, role, presentRoles) {
  const present = presentRoles instanceof Set ? Array.from(presentRoles) : Array.from(presentRoles || []);
  return {
    version: 1,
    type: 'forma.presence',
    event, // 'peer.connected' | 'peer.disconnected'
    role,
    peers: present,
    paired: present.length === FORMA_PEER_ROLES.length,
    timestamp: Date.now()
  };
}

/** Build a rejection control frame sent back to the offending peer. */
export function rejectionFrame(reason, errors, originalId) {
  return {
    version: 1,
    type: 'forma.error',
    reason,
    errors: errors || [],
    id: originalId || null,
    timestamp: Date.now()
  };
}
