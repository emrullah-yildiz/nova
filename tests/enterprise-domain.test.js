import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EnterpriseStore, ROLES } from '../src/enterprise/domain.mjs';
import { AuthService } from '../src/enterprise/auth.mjs';
import { JsonFilePersistence } from '../src/enterprise/persistence.mjs';

function createContext(store, organizationId, role = ROLES.OWNER, email = 'user@example.com') {
  const user = store.createUser({ email, displayName: email });
  store.addMembership({ organizationId, userId: user.id, role });
  const session = store.createAuthSession({ email, organizationId });
  return store.authenticate(session.token);
}

function createUserContext(store, organizationId, role, email) {
  const user = store.createUser({ email, displayName: email });
  store.addMembership({ organizationId, userId: user.id, role });
  const session = store.createAuthSession({ email, organizationId });
  return { user, context: store.authenticate(session.token) };
}

describe('enterprise domain', () => {
  it('uses signed auth sessions and rejects tampered or expired tokens', () => {
    let now = 1000;
    const authService = new AuthService({
      now: () => now,
      sessionSecret: 'test-session-secret',
      sessionTtlMs: 100
    });
    const store = new EnterpriseStore({ now: () => now, authService });
    const org = store.createOrganization({ name: 'A' });
    const user = store.createUser({ email: 'signed@example.com' });
    store.addMembership({ organizationId: org.id, userId: user.id, role: ROLES.OWNER });

    const session = store.createAuthSession({ email: user.email, organizationId: org.id });
    expect(session.token).toContain('.');
    expect(store.authenticate(session.token).user.email).toBe(user.email);

    expect(() => store.authenticate(session.token + 'x')).toThrow(/Invalid bearer/);
    now = 1200;
    expect(() => store.authenticate(session.token)).toThrow(/Invalid bearer/);
  });

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

  it('exports and reloads enterprise store snapshots through JSON persistence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-enterprise-store-'));
    const filePath = path.join(dir, 'store.json');
    try {
      const persistence = new JsonFilePersistence(filePath);
      const store = new EnterpriseStore({ persistence });
      const org = store.createOrganization({ name: 'Persistent Org' });
      const ctx = createContext(store, org.id, ROLES.OWNER, 'persist@example.com');
      const project = store.createProject(ctx, {
        name: 'Persistent Project',
        graph: { nodes: [{ id: 'saved-node' }], wires: [] }
      });

      const restored = new EnterpriseStore({ persistence });
      const restoredContext = createContext(restored, org.id, ROLES.OWNER, 'second@example.com');

      expect(restored.getProject(ctx, project.id).versions[0].graph.nodes[0].id).toBe('saved-node');
      expect(restored.listProjects(restoredContext).map(item => item.id)).toContain(project.id);
      expect(restored.listAuditEvents(restoredContext).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it('enforces project membership roles for reads, writes, and membership changes', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'A' });
    const owner = createUserContext(store, org.id, ROLES.OWNER, 'owner@example.com');
    const editor = createUserContext(store, org.id, ROLES.VIEWER, 'editor@example.com');
    const viewer = createUserContext(store, org.id, ROLES.VIEWER, 'viewer@example.com');
    const outsider = createUserContext(store, org.id, ROLES.VIEWER, 'outsider@example.com');
    const project = store.createProject(owner.context, { name: 'RBAC Project' });

    expect(store.listProjects(outsider.context)).toHaveLength(0);
    expect(() => store.getProject(outsider.context, project.id)).toThrow(/Project access/);

    store.addProjectMember(owner.context, project.id, { userId: editor.user.id, role: ROLES.EDITOR });
    store.addProjectMember(owner.context, project.id, { userId: viewer.user.id, role: ROLES.VIEWER });

    expect(store.getProject(viewer.context, project.id).id).toBe(project.id);
    expect(() => store.updateProjectGraph(viewer.context, project.id, {
      graph: { nodes: [], wires: [] }
    })).toThrow(/Project write/);

    expect(store.updateProjectGraph(editor.context, project.id, {
      graph: { nodes: [{ id: 'editable' }], wires: [] }
    }).versions).toHaveLength(2);
    expect(() => store.addProjectMember(editor.context, project.id, {
      userId: outsider.user.id,
      role: ROLES.VIEWER
    })).toThrow(/Project admin/);
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

  it('records AI requests without storing prompts by default', () => {
    const store = new EnterpriseStore();
    const org = store.createOrganization({ name: 'A' });
    const ctx = createContext(store, org.id);
    const project = store.createProject(ctx, { name: 'AI Project' });

    const request = store.createAiRequest(ctx, {
      projectId: project.id,
      provider: 'mock',
      model: 'nova-mock-enterprise',
      messages: [{ role: 'user', content: 'Create a tower' }]
    });
    const completed = store.completeAiRequest(ctx, request.id, {
      content: 'Done',
      usage: { inputMessages: 1 }
    });

    expect(request.status).toBe('pending');
    expect(request.messages).toHaveLength(0);
    expect(completed.status).toBe('completed');
    expect(store.listAuditEvents(ctx).some(event => event.type === 'ai.request.completed')).toBe(true);
  });

  it('enforces AI provider policy and per-minute rate limits', () => {
    let now = 0;
    const store = new EnterpriseStore({ now: () => now });
    const org = store.createOrganization({ name: 'A' });
    const context = createContext(store, org.id);
    const organization = store.requireOrganization(org.id);
    organization.settings.ai.maxRequestsPerMinute = 1;

    expect(() => store.createAiRequest(context, {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Blocked' }]
    })).toThrow(/provider/);

    store.createAiRequest(context, {
      messages: [{ role: 'user', content: 'First' }]
    });
    expect(() => store.createAiRequest(context, {
      messages: [{ role: 'user', content: 'Second' }]
    })).toThrow(/rate limit/);

    now = 60000;
    expect(store.createAiRequest(context, {
      messages: [{ role: 'user', content: 'Next minute' }]
    }).status).toBe('pending');
  });
});
