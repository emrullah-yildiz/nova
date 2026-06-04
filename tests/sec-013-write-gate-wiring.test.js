import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { NovaConnectClient } from '../src/integrations/connect/client.js';
import { issueWriteToken, recordHostAuditEvent, __setCloudClientFactory } from '../src/integrations/connect/revit-write-approval.js';

// SEC-013 END-TO-END WIRING. The domain token gate (issue/consume) is covered by
// sec-013-revit-write-gate.test.js in isolation. THESE tests exercise the REAL
// wiring the reviewer flagged as broken:
//   - POST /api/host-write-approvals  → issueHostWriteApproval (the issue route)
//   - POST /api/host-operations       → consumeHostWriteApproval (consume-on-record)
//   - client.js normalizeWriteApproval (token preservation, no {approved:true})
//   - issueWriteToken (cloud-client wiring + graceful local degrade)
// so a forged/absent-token write is REJECTED at the server boundary AND audited.

function setup() {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  return buildApi({ authService, allowDevLogin: true });
}

async function signIn(dispatch) {
  const login = await dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
  return 'Bearer ' + login.body.token;
}

async function auditTypes(dispatch, auth) {
  const res = await dispatch({ method: 'GET', path: '/api/audit', authorization: auth });
  return res.body.events.map((e) => ({ type: e.type, reason: e.metadata && e.metadata.reason, approvalId: e.metadata && e.metadata.approvalId, ok: e.metadata && e.metadata.ok }));
}

describe('SEC-013 server-side write-gate wiring (issue route + consume-on-record)', () => {
  it('POST /api/host-write-approvals issues a server token (issue route is live)', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    const issued = await dispatch({
      method: 'POST', path: '/api/host-write-approvals', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id, graphVersion: 'v7' }
    });

    expect(issued.status).toBe(201);
    expect(typeof issued.body.token).toBe('string');
    expect(issued.body.token.length).toBeGreaterThanOrEqual(32);
    expect(issued.body.approvalId).toMatch(/^hwa_/);
    // Issuance itself is audited.
    expect((await auditTypes(dispatch, auth)).some((e) => e.type === 'host.write.approved')).toBe(true);
  });

  it('happy path: issue → report consumes the token AND records host.operation', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    const issued = await dispatch({
      method: 'POST', path: '/api/host-write-approvals', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id, graphVersion: 'v7' }
    });

    const recorded = await dispatch({
      method: 'POST', path: '/api/host-operations', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id, graphVersion: 'v7', token: issued.body.token, ok: true, metadata: { parameterName: 'Width' } }
    });

    expect(recorded.status).toBe(201);
    expect(recorded.body.type).toBe('host.operation');
    expect(recorded.body.metadata.approvalId).toBe(issued.body.approvalId);
    expect(recorded.body.metadata.ok).toBe(true);

    const events = await auditTypes(dispatch, auth);
    expect(events.some((e) => e.type === 'host.operation' && e.approvalId === issued.body.approvalId)).toBe(true);
  });

  it('REJECTS a reported write with NO token at the server boundary AND audits the denial', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    await expect(dispatch({
      method: 'POST', path: '/api/host-operations', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id }
    })).rejects.toMatchObject({ status: 403 });

    const events = await auditTypes(dispatch, auth);
    expect(events.some((e) => e.type === 'host.write.denied' && e.reason === 'missing_token')).toBe(true);
    // No accepted write was recorded at this boundary.
    expect(events.some((e) => e.type === 'host.operation')).toBe(false);
  });

  it('REJECTS a forged token at the server boundary AND audits the denial', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    await expect(dispatch({
      method: 'POST', path: '/api/host-operations', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id, token: 'deadbeef'.repeat(8) }
    })).rejects.toMatchObject({ status: 403 });

    const events = await auditTypes(dispatch, auth);
    expect(events.some((e) => e.type === 'host.write.denied' && e.reason === 'invalid_token')).toBe(true);
    expect(events.some((e) => e.type === 'host.operation')).toBe(false);
  });

  it('single-use: a replayed token is REJECTED on the second report AND audited', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    const issued = await dispatch({
      method: 'POST', path: '/api/host-write-approvals', authorization: auth,
      body: { operation: 'geometry.create', projectId: project.body.id }
    });

    const body = { operation: 'geometry.create', projectId: project.body.id, token: issued.body.token };
    const first = await dispatch({ method: 'POST', path: '/api/host-operations', authorization: auth, body });
    expect(first.status).toBe(201);

    await expect(dispatch({ method: 'POST', path: '/api/host-operations', authorization: auth, body }))
      .rejects.toMatchObject({ status: 403 });

    const events = await auditTypes(dispatch, auth);
    expect(events.some((e) => e.type === 'host.write.denied' && e.reason === 'invalid_token')).toBe(true);
  });

  it('REJECTS a scope-mismatched token (operation differs) AND audits the denial', async () => {
    const { dispatch } = setup();
    const auth = await signIn(dispatch);
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Tower' } });

    const issued = await dispatch({
      method: 'POST', path: '/api/host-write-approvals', authorization: auth,
      body: { operation: 'parameter.set', projectId: project.body.id, graphVersion: 'v1' }
    });

    await expect(dispatch({
      method: 'POST', path: '/api/host-operations', authorization: auth,
      body: { operation: 'geometry.create', projectId: project.body.id, graphVersion: 'v1', token: issued.body.token }
    })).rejects.toMatchObject({ status: 403 });

    const events = await auditTypes(dispatch, auth);
    expect(events.some((e) => e.type === 'host.write.denied' && e.reason === 'token_scope_mismatch')).toBe(true);
  });
});

describe('SEC-013 client.js normalizeWriteApproval (no client-minted approval on the wire)', () => {
  function captureSentParameterSet() {
    const sent = [];
    const client = new NovaConnectClient({ WebSocketImpl: function () {} });
    client.request = async (type, payload) => { sent.push({ type, payload }); return { payload: { results: [], geometries: [] } }; };
    return { client, sent };
  }

  it('preserves a server token and DOES NOT emit {approved:true}', async () => {
    const { client, sent } = captureSentParameterSet();
    await client.setParameterValues(['100'], 'Width', ['1200'], {
      approval: { token: 'srv-token-abc', approvalId: 'hwa_1', operation: 'parameter.set', graphVersion: 'v3', approved: true, approvedBy: 'nova-user' }
    });
    const approval = sent[0].payload.approval;
    expect(approval.token).toBe('srv-token-abc');
    expect(approval.approvalId).toBe('hwa_1');
    expect(approval.operation).toBe('parameter.set');
    expect(approval.graphVersion).toBe('v3');
    // The forgeable client booleans are stripped — never on the wire.
    expect(approval.approved).toBeUndefined();
    expect(approval.approvedBy).toBeUndefined();
  });

  it('with no approval option, carries NO token (no fabricated approval)', async () => {
    const { client, sent } = captureSentParameterSet();
    await client.setParameterValues(['100'], 'Width', ['1200'], {});
    const approval = sent[0].payload.approval;
    expect(approval).toEqual({});
    expect(approval.approved).toBeUndefined();
  });
});

describe('SEC-013 issueWriteToken (cloud-client wiring + graceful local degrade)', () => {
  it('requests a server token via the cloud client when authenticated', async () => {
    const calls = [];
    const restore = __setCloudClientFactory(() => ({
      isConfigured: () => true,
      isAuthenticated: () => true,
      async issueHostWriteApproval(args) { calls.push(args); return { token: 'server-minted', approvalId: 'hwa_42', operation: args.operation, graphVersion: args.graphVersion }; }
    }));
    try {
      const issued = await issueWriteToken({ operation: 'parameter.set', projectId: 'prj_1', graphVersion: 'v9' });
      expect(calls[0]).toMatchObject({ operation: 'parameter.set', projectId: 'prj_1', graphVersion: 'v9' });
      expect(issued.token).toBe('server-minted');
      expect(issued.approvalId).toBe('hwa_42');
      expect(issued.local).toBe(false);
    } finally {
      restore();
    }
  });

  it('degrades gracefully to a local token when signed out (no hard break)', async () => {
    const restore = __setCloudClientFactory(() => ({
      isConfigured: () => true,
      isAuthenticated: () => false,
      async issueHostWriteApproval() { throw new Error('should not be called when signed out'); }
    }));
    try {
      const issued = await issueWriteToken({ operation: 'geometry.create' });
      expect(issued.local).toBe(true);
      expect(issued.token).toMatch(/^local:/);
    } finally {
      restore();
    }
  });

  it('a local token is never reported to the server (no consume/audit attempt)', async () => {
    let reported = false;
    const restore = __setCloudClientFactory(() => ({
      isConfigured: () => true,
      isAuthenticated: () => true,
      async recordHostOperation() { reported = true; return { ok: true }; }
    }));
    try {
      const result = await recordHostAuditEvent({ ok: true }, { operation: 'parameter.set', token: 'local:revit:parameter.set:1:123' });
      expect(result).toBeNull();
      expect(reported).toBe(false);
    } finally {
      restore();
    }
  });

  it('reports a real server token to POST /api/host-operations (the consume call)', async () => {
    let body = null;
    const restore = __setCloudClientFactory(() => ({
      isConfigured: () => true,
      isAuthenticated: () => true,
      async recordHostOperation(payload) { body = payload; return { ok: true }; }
    }));
    try {
      await recordHostAuditEvent({ ok: true }, { operation: 'parameter.set', token: 'srv-real', approvalId: 'hwa_7', graphVersion: 'v2', projectId: 'prj_1', parameterName: 'Width' });
      expect(body.token).toBe('srv-real');
      expect(body.approvalId).toBe('hwa_7');
      expect(body.graphVersion).toBe('v2');
      expect(body.operation).toBe('parameter.set');
    } finally {
      restore();
    }
  });
});
