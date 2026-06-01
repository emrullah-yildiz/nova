import { describe, it, expect } from 'vitest';
import {
  CURSOR_PALETTE, colorForUser, firstNameOf, roleCanEdit,
  routeRoomMessage, buildInitPayload
} from '../src/app/collab-core.js';

function makeState(peers) {
  const map = new Map();
  for (const p of peers) map.set(p.connId, { userId: p.userId, firstName: p.firstName, color: p.color, role: p.role });
  return { peers: map };
}

describe('colorForUser', () => {
  it('is deterministic for the same id', () => {
    expect(colorForUser('usr_abc')).toBe(colorForUser('usr_abc'));
  });

  it('always returns a palette colour', () => {
    for (const id of ['a', 'usr_1', 'usr_2', 'longer-id-xyz', '']) {
      expect(CURSOR_PALETTE).toContain(colorForUser(id));
    }
  });

  it('spreads different ids across more than one colour', () => {
    const colors = new Set();
    for (let i = 0; i < 30; i++) colors.add(colorForUser('usr_' + i));
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe('firstNameOf', () => {
  it('uses the first word of displayName', () => {
    expect(firstNameOf({ displayName: 'Emrullah Yildiz' })).toBe('Emrullah');
  });
  it('falls back to the email local-part', () => {
    expect(firstNameOf({ email: 'jane.doe@example.com' })).toBe('jane.doe');
  });
  it('returns Guest when nothing is available', () => {
    expect(firstNameOf({})).toBe('Guest');
    expect(firstNameOf(null)).toBe('Guest');
  });
  it('prefers displayName over email', () => {
    expect(firstNameOf({ displayName: 'Sam Smith', email: 'x@y.com' })).toBe('Sam');
  });
});

describe('roleCanEdit', () => {
  it('grants edit to Owner/Admin/Editor', () => {
    expect(roleCanEdit('Owner')).toBe(true);
    expect(roleCanEdit('Admin')).toBe(true);
    expect(roleCanEdit('Editor')).toBe(true);
  });
  it('denies Viewer and unknown roles', () => {
    expect(roleCanEdit('Viewer')).toBe(false);
    expect(roleCanEdit('')).toBe(false);
    expect(roleCanEdit(undefined)).toBe(false);
  });
});

describe('routeRoomMessage', () => {
  const editorState = () => makeState([
    { connId: 'c1', userId: 'u1', firstName: 'Ann', color: '#fff', role: 'Editor' },
    { connId: 'c2', userId: 'u2', firstName: 'Bob', color: '#000', role: 'Viewer' }
  ]);

  it('fans out a cursor message to others only', () => {
    const out = routeRoomMessage(editorState(), 'c1', { type: 'cursor', x: 10, y: 20 });
    expect(out.broadcasts).toHaveLength(1);
    expect(out.broadcasts[0].target).toBe('others');
    expect(out.broadcasts[0].payload).toEqual({ type: 'cursor', userId: 'u1', x: 10, y: 20 });
  });

  it('ignores a cursor message with non-numeric coords', () => {
    const out = routeRoomMessage(editorState(), 'c1', { type: 'cursor', x: 'a', y: 2 });
    expect(out.broadcasts).toHaveLength(0);
  });

  it('rebroadcasts an editor op to others', () => {
    const op = { kind: 'node.move', id: 'node-1', x: 5, y: 6 };
    const out = routeRoomMessage(editorState(), 'c1', { type: 'op', op });
    expect(out.broadcasts).toHaveLength(1);
    expect(out.broadcasts[0].payload).toEqual({ type: 'op', userId: 'u1', op });
  });

  it('DROPS an op from a viewer (server-authoritative read-only)', () => {
    const op = { kind: 'node.remove', id: 'node-1' };
    const out = routeRoomMessage(editorState(), 'c2', { type: 'op', op });
    expect(out.broadcasts).toHaveLength(0);
  });

  it('ignores messages from unknown connections', () => {
    const out = routeRoomMessage(editorState(), 'ghost', { type: 'cursor', x: 1, y: 1 });
    expect(out.broadcasts).toHaveLength(0);
  });

  it('ignores unknown message types', () => {
    const out = routeRoomMessage(editorState(), 'c1', { type: 'wat' });
    expect(out.broadcasts).toHaveLength(0);
  });
});

describe('buildInitPayload', () => {
  it('lists other peers but not the joiner', () => {
    const state = makeState([
      { connId: 'c1', userId: 'u1', firstName: 'Ann', color: '#aaa', role: 'Editor' },
      { connId: 'c2', userId: 'u2', firstName: 'Bob', color: '#bbb', role: 'Viewer' }
    ]);
    const payload = buildInitPayload(state, 'c2');
    expect(payload.type).toBe('init');
    expect(payload.peers).toEqual([{ userId: 'u1', firstName: 'Ann', color: '#aaa' }]);
  });

  it('is empty when the joiner is alone', () => {
    const state = makeState([{ connId: 'c1', userId: 'u1', firstName: 'Ann', color: '#aaa', role: 'Editor' }]);
    expect(buildInitPayload(state, 'c1').peers).toEqual([]);
  });
});
