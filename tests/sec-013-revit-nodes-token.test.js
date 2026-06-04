// SEC-013: the browser-side Revit write path (RevitBridge) must obtain a
// server-issued approval token and forward it to the hub — never a fabricated
// { approved: true } boolean. These tests inject a mock NovaConnect client and a
// mock __revitWriteApproval bridge (the M4-owned consent + token-issuer hooks)
// and assert the routing/validation logic.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installRevitNodes } from '../src/integrations/revit/revit-nodes.js';

function makeGlobal({ issueWriteToken, requestWriteApproval } = {}) {
  const calls = { setParameterValues: [], sendGeometry: [] };
  const g = {
    NovaConnect: {
      status: 'connected',
      elementsByCategory: {},
      async setParameterValues(ids, paramName, values, opts) {
        calls.setParameterValues.push({ ids, paramName, values, opts });
        return ids.map((id) => ({ elementId: id, parameterName: paramName, ok: true, value: values[0] }));
      },
      async sendGeometry(envelope, identity, opts) {
        calls.sendGeometry.push({ envelope, identity, opts });
        return { ok: true, data: { directShapeId: '123' } };
      }
    },
    __revitWriteApproval: {
      requestWriteApproval: requestWriteApproval || (async () => ({ approved: true, approvedBy: 'nova-user' })),
      issueWriteToken
    }
  };
  return { g, calls };
}

function makeElement(id) {
  return { id, identity: { sourceId: id }, params: {} };
}

describe('SEC-013 RevitBridge write token routing', () => {
  let bridge;
  let calls;

  function setup(opts) {
    const made = makeGlobal(opts);
    calls = made.calls;
    // Fresh install each time (installRevitNodes is idempotent per-global).
    bridge = installRevitNodes(made.g);
    return made.g;
  }

  beforeEach(() => {
    bridge = null;
    calls = null;
  });

  it('forwards a server-issued token (not a client boolean) on parameter writes', async () => {
    setup({
      issueWriteToken: vi.fn(async () => ({ token: 'srv-token-abc', approvalId: 'hwa_1', graphVersion: 'v3' }))
    });

    const results = await bridge.setLiveParameterValues([makeElement('100')], 'Width', '1200', { graphVersion: 'v3' });

    expect(results[0].ok).toBe(true);
    expect(calls.setParameterValues).toHaveLength(1);
    const approval = calls.setParameterValues[0].opts.approval;
    expect(approval.token).toBe('srv-token-abc');
    expect(approval.approvalId).toBe('hwa_1');
    expect(approval.operation).toBe('parameter.set');
    // The legacy client-fabricated { approved: true } boolean is gone.
    expect(approval.approved).toBeUndefined();
  });

  it('blocks the parameter write when no server token issuer is wired', async () => {
    setup({ issueWriteToken: undefined });

    const results = await bridge.setLiveParameterValues([makeElement('100')], 'Width', '1200', {});

    expect(results[0].ok).toBe(false);
    expect(results[0].code).toBe('WRITE_APPROVAL_REQUIRED');
    // No write reached the hub.
    expect(calls.setParameterValues).toHaveLength(0);
  });

  it('blocks the parameter write when the user denies consent', async () => {
    setup({
      requestWriteApproval: async () => ({ approved: false, message: 'User denied' }),
      issueWriteToken: vi.fn(async () => ({ token: 'should-not-be-issued' }))
    });

    const results = await bridge.setLiveParameterValues([makeElement('100')], 'Width', '1200', {});

    expect(results[0].ok).toBe(false);
    expect(results[0].code).toBe('USER_DENIED');
    expect(calls.setParameterValues).toHaveLength(0);
  });

  it('gates sendGeometry behind a server-issued token', async () => {
    setup({
      issueWriteToken: vi.fn(async () => ({ token: 'geo-token-xyz', approvalId: 'hwa_9' }))
    });

    const fakeGeometry = { _type: 'Mesh3' };
    const res = await bridge.sendGeometry(fakeGeometry, { source: 'revit-local' }, { graphVersion: 'v5' });

    expect(res.ok).toBe(true);
    expect(calls.sendGeometry).toHaveLength(1);
    expect(calls.sendGeometry[0].opts.approval.token).toBe('geo-token-xyz');
    expect(calls.sendGeometry[0].opts.approval.operation).toBe('geometry.create');
  });

  it('refuses sendGeometry when the server declines to issue a token', async () => {
    setup({ issueWriteToken: vi.fn(async () => ({ token: '' })) });

    const res = await bridge.sendGeometry({ _type: 'Mesh3' }, { source: 'revit-local' }, {});

    expect(res.ok).toBe(false);
    expect(res.code).toBe('WRITE_APPROVAL_REQUIRED');
    expect(calls.sendGeometry).toHaveLength(0);
  });
});
