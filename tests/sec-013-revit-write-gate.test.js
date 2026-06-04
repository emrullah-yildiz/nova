import { EnterpriseStore, ROLES } from '../src/enterprise/domain.mjs';

// SEC-013: the authoritative Revit/Connect write-approval gate lives in
// domain.mjs. A write must present a server-issued, single-use approval token
// bound to {operation, projectId, graphVersion}; an unapproved or forged-token
// write is rejected at this boundary AND audited as a denial, and an approved
// write is recorded.

function createContext(store, organizationId, role = ROLES.OWNER, email = 'user@example.com') {
  const user = store.createUser({ email, displayName: email });
  store.addMembership({ organizationId, userId: user.id, role });
  const session = store.createAuthSession({ email, organizationId });
  return store.authenticate(session.token);
}

function auditTypes(store, context) {
  return store.listAuditEvents(context).map(e => e.type);
}

function lastAudit(store, context, type) {
  return store.listAuditEvents(context).filter(e => e.type === type).at(-1);
}

describe('SEC-013 Revit/Connect write gate', () => {
  it('issues a single-use token and records an accepted write (audit as precondition)', () => {
    let now = 1000;
    const store = new EnterpriseStore({ now: () => now });
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    const issued = store.issueHostWriteApproval(ctx, {
      projectId: project.id,
      operation: 'parameter.set',
      graphVersion: 'v7'
    });
    expect(typeof issued.token).toBe('string');
    expect(issued.token.length).toBeGreaterThanOrEqual(32);
    expect(issued.approvalId).toMatch(/^hwa_/);

    // Issuance is itself audited.
    expect(auditTypes(store, ctx)).toContain('host.write.approved');

    const event = store.consumeHostWriteApproval(ctx, issued.token, {
      projectId: project.id,
      operation: 'parameter.set',
      graphVersion: 'v7',
      ok: true,
      metadata: { parameterName: 'Width', elementCount: 3 }
    });

    expect(event.type).toBe('host.operation');
    expect(event.metadata.ok).toBe(true);
    expect(event.metadata.approvalId).toBe(issued.approvalId);
    expect(event.metadata.parameterName).toBe('Width');
    // The accepted write is recorded.
    expect(auditTypes(store, ctx)).toContain('host.operation');
  });

  it('rejects a write with no token and audits the denial', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    expect(() =>
      store.consumeHostWriteApproval(ctx, '', { projectId: project.id, operation: 'parameter.set' })
    ).toThrow(/required/i);

    const denial = lastAudit(store, ctx, 'host.write.denied');
    expect(denial).toBeTruthy();
    expect(denial.metadata.reason).toBe('missing_token');
    // No accepted write was recorded.
    expect(auditTypes(store, ctx)).not.toContain('host.operation');
  });

  it('rejects a forged / unknown token and audits the denial', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    expect(() =>
      store.consumeHostWriteApproval(ctx, 'deadbeef'.repeat(8), {
        projectId: project.id,
        operation: 'parameter.set'
      })
    ).toThrow(/invalid/i);

    const denial = lastAudit(store, ctx, 'host.write.denied');
    expect(denial.metadata.reason).toBe('invalid_token');
    expect(auditTypes(store, ctx)).not.toContain('host.operation');
  });

  it('enforces single use: a replayed token is rejected and audited', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    const issued = store.issueHostWriteApproval(ctx, {
      projectId: project.id,
      operation: 'geometry.create'
    });

    // First use succeeds.
    store.consumeHostWriteApproval(ctx, issued.token, {
      projectId: project.id,
      operation: 'geometry.create'
    });

    // Replay is refused (the token was burned) and recorded as invalid.
    expect(() =>
      store.consumeHostWriteApproval(ctx, issued.token, {
        projectId: project.id,
        operation: 'geometry.create'
      })
    ).toThrow(/invalid/i);

    const denial = lastAudit(store, ctx, 'host.write.denied');
    expect(denial.metadata.reason).toBe('invalid_token');
  });

  it('rejects an expired token and audits the denial', () => {
    let now = 1000;
    const store = new EnterpriseStore({ now: () => now });
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    const issued = store.issueHostWriteApproval(ctx, {
      projectId: project.id,
      operation: 'parameter.set',
      ttlMs: 1000
    });

    now += 5000; // past expiry

    expect(() =>
      store.consumeHostWriteApproval(ctx, issued.token, {
        projectId: project.id,
        operation: 'parameter.set'
      })
    ).toThrow(/expired/i);

    expect(lastAudit(store, ctx, 'host.write.denied').metadata.reason).toBe('token_expired');
  });

  it('rejects a token whose scope does not match the write (op/project/version)', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'Acme' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Tower' });

    const issued = store.issueHostWriteApproval(ctx, {
      projectId: project.id,
      operation: 'parameter.set',
      graphVersion: 'v1'
    });

    // Same token, different operation → scope mismatch.
    expect(() =>
      store.consumeHostWriteApproval(ctx, issued.token, {
        projectId: project.id,
        operation: 'geometry.create',
        graphVersion: 'v1'
      })
    ).toThrow(/does not match/i);

    expect(lastAudit(store, ctx, 'host.write.denied').metadata.reason).toBe('token_scope_mismatch');
  });

  it('refuses to issue a token to a caller without project write access', () => {
    const store = new EnterpriseStore();
    const orgA = store.createOrganization({ name: 'A' });
    const orgB = store.createOrganization({ name: 'B' });
    const owner = createContext(store, orgA.id, ROLES.OWNER, 'owner@a.com');
    const outsider = createContext(store, orgB.id, ROLES.OWNER, 'out@b.com');
    const project = store.createProject(owner, { name: 'Tower' });

    // Cross-org outsider cannot even see the project → 404 (no existence leak).
    expect(() =>
      store.issueHostWriteApproval(outsider, { projectId: project.id, operation: 'parameter.set' })
    ).toThrow(/not found/i);
  });

  it('rejects a token presented by a different user', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'Acme' });
    const owner = createContext(store, org.id, ROLES.OWNER, 'owner@acme.com');
    const editor = createContext(store, org.id, ROLES.EDITOR, 'editor@acme.com');
    const project = store.createProject(owner, { name: 'Tower' });

    const issued = store.issueHostWriteApproval(owner, {
      projectId: project.id,
      operation: 'parameter.set'
    });

    // A different authenticated user cannot consume the owner's token.
    expect(() =>
      store.consumeHostWriteApproval(editor, issued.token, {
        projectId: project.id,
        operation: 'parameter.set'
      })
    ).toThrow(/does not belong/i);

    expect(lastAudit(store, owner, 'host.write.denied').metadata.reason).toBe('token_owner_mismatch');
  });
});
