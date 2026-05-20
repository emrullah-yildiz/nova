import { EnterpriseStore, ROLES } from '../src/enterprise/domain.mjs';

function createContext(store, organizationId, role = ROLES.OWNER, email = 'user@example.com') {
  const user = store.createUser({ email, displayName: email });
  store.addMembership({ organizationId, userId: user.id, role });
  const session = store.createAuthSession({ email, organizationId });
  return store.authenticate(session.token);
}

describe('enterprise domain', () => {
  it('stores projects inside an organization and blocks cross-organization access', () => {
    const store = new EnterpriseStore();
    const orgA = store.createOrganization({ name: 'A' });
    const orgB = store.createOrganization({ name: 'B' });
    const ctxA = createContext(store, orgA.id, ROLES.OWNER, 'a@example.com');
    const ctxB = createContext(store, orgB.id, ROLES.OWNER, 'b@example.com');

    const project = store.createProject(ctxA, { name: 'Tower', graph: { nodes: [{ id: 'node-1' }], wires: [] } });

    expect(store.listProjects(ctxA)).toHaveLength(1);
    expect(store.listProjects(ctxB)).toHaveLength(0);
    expect(() => store.getProject(ctxB, project.id)).toThrow(/Cross-organization/);
  });

  it('creates graph versions and restores previous versions', () => {
    const store = new EnterpriseStore({ now: (() => { let t = 1; return () => t++; })() });
    const org = store.createOrganization({ name: 'A' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Facade', graph: { nodes: [{ id: 'a' }], wires: [] } });

    const updated = store.updateProjectGraph(ctx, project.id, {
      graph: { nodes: [{ id: 'b' }], wires: [] },
      message: 'Second'
    });
    const restored = store.restoreProjectVersion(ctx, project.id, updated.versions[0].id);

    expect(updated.versions).toHaveLength(2);
    expect(restored.versions).toHaveLength(3);
    expect(restored.versions[2].graph.nodes[0].id).toBe('a');
  });

  it('enforces roles for writes and audit access', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'A' });
    const viewer = createContext(store, org.id, ROLES.VIEWER, 'viewer@example.com');
    const admin = createContext(store, org.id, ROLES.ADMIN, 'admin@example.com');

    expect(() => store.createProject(viewer, { name: 'Blocked' })).toThrow(/Write access/);
    store.createProject(admin, { name: 'Allowed' });
    expect(store.listAuditEvents(admin).length).toBeGreaterThan(0);
    expect(() => store.listAuditEvents(viewer)).toThrow(/Admin access/);
  });

  it('creates connector pairing sessions and rejects expired sessions', () => {
    let now = 1000;
    const store = new EnterpriseStore({ now: () => now });
    const org = store.createOrganization({ name: 'A' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'Host Project' });
    const session = store.createConnectorSession(ctx, { host: 'revit', projectId: project.id });

    expect(session.status).toBe('pairing');
    expect(store.pairConnector(ctx, session.id, session.pairingCode).status).toBe('online');

    const expired = store.createConnectorSession(ctx, { host: 'revit' });
    now = expired.expiresAt + 1;
    expect(() => store.pairConnector(ctx, expired.id, expired.pairingCode)).toThrow(/expired/);
  });
});
