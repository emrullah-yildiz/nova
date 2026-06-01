// Pure, dependency-free helpers shared by the collaboration client (browser)
// and the ProjectRoom Durable Object (worker). Keeping the decision logic here
// — color assignment, name derivation, and message routing — lets us unit-test
// the room behaviour without spinning up miniflare/WebSockets.

// A 10-colour "cute" palette. Cursors are coloured by hashing the stable user
// id into this list, so the same user keeps the same colour across sessions and
// every client computes the same colour for a given peer.
export const CURSOR_PALETTE = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#f9844a',
  '#c77dff', '#48cae4', '#f72585', '#90e0ef', '#b5e48c'
];

// Deterministic string hash (FNV-1a-ish) → palette index. Stable across JS
// engines (no Math.random), so worker and browser agree on a peer's colour.
export function colorForUser(userId) {
  const s = String(userId == null ? '' : userId);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return CURSOR_PALETTE[h % CURSOR_PALETTE.length];
}

// The display name to put next to a cursor: first word of displayName, else the
// local-part of the email, else a friendly fallback.
export function firstNameOf(user) {
  const u = user || {};
  const dn = String(u.displayName || '').trim();
  if (dn) return dn.split(/\s+/)[0];
  const email = String(u.email || '').trim();
  if (email && email.includes('@')) return email.split('@')[0];
  if (email) return email;
  return 'Guest';
}

// Roles that may mutate the shared graph. Everyone else is watch-only.
const EDITOR_ROLES = new Set(['Owner', 'Admin', 'Editor']);
export function roleCanEdit(role) {
  return EDITOR_ROLES.has(String(role || ''));
}

// Pure message router for the ProjectRoom. Given the current participant map,
// the connection id of the sender, and a parsed inbound message, return the
// list of broadcasts to perform. The DO owns the actual sockets; this owns the
// "who gets what" decision so it can be tested in isolation.
//
//   state.peers: Map<connId, { userId, firstName, color, role }>
//   returns { broadcasts: [{ target: 'self'|'others'|'all', payload }] }
//
// Unknown/!editor `op` messages produce no broadcasts (server-authoritative
// read-only enforcement: a viewer cannot mutate the shared graph even if their
// client is tampered with).
export function routeRoomMessage(state, fromId, msg) {
  const peers = state.peers;
  const me = peers.get(fromId);
  if (!me || !msg || typeof msg !== 'object') return { broadcasts: [] };

  switch (msg.type) {
    case 'cursor':
      if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return { broadcasts: [] };
      return { broadcasts: [{ target: 'others', payload: { type: 'cursor', userId: me.userId, x: msg.x, y: msg.y } }] };

    case 'op':
      // Only editors' graph ops propagate. Viewers are silently ignored.
      if (!roleCanEdit(me.role) || !msg.op || typeof msg.op !== 'object') return { broadcasts: [] };
      return { broadcasts: [{ target: 'others', payload: { type: 'op', userId: me.userId, op: msg.op } }] };

    default:
      return { broadcasts: [] };
  }
}

// Build the {type:'init'} payload sent to a freshly-joined connection: the list
// of OTHER current peers (so the joiner can draw their cursors immediately).
export function buildInitPayload(state, joinerConnId) {
  const peers = [];
  for (const [connId, p] of state.peers) {
    if (connId === joinerConnId) continue;
    peers.push({ userId: p.userId, firstName: p.firstName, color: p.color });
  }
  return { type: 'init', peers };
}
