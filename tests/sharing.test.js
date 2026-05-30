import { describe, it, expect } from 'vitest';
import { EnterpriseStore, ROLES } from '../src/enterprise/domain.mjs';

// Project sharing: cross-org, membership-based access via share links. These
// drive the domain directly (the dispatcher just forwards to these methods).

// A signed-in, email-verified user in their own personal-workspace org.
function verifiedContext(store, email) {
  const org = store.createOrganization({ name: email + "'s workspace" });
  const user = store.createUser({ email, displayName: email });
  store.addMembership({ organizationId: org.id, userId: user.id, role: ROLES.OWNER });
  store.markEmailVerified(user.id);
  const session = store.createAuthSession({ email, organizationId: org.id });
  return { org, user, context: store.authenticate(session.token) };
}

function setup() {
  const store = new EnterpriseStore();
  const owner = verifiedContext(store, 'owner@example.com');
  const collaborator = verifiedContext(store, 'collab@example.com');
  const project = store.createProject(owner.context, { name: 'Shared Tower', graph: { nodes: [{ id: 'n1' }], wires: [] } });
  return { store, owner, collaborator, project };
}

describe('share links + cross-org access', () => {
  it('Editor link: a different-org user redeems and can read + write the project', () => {
    const { store, owner, collaborator, project } = setup();
    const link = store.createShareLink(owner.context, project.id, { role: ROLES.EDITOR });
    expect(typeof link.token).toBe('string');

    // Before redeeming, the collaborator can't even see it (404, not 403).
    expect(() => store.getProject(collaborator.context, project.id)).toThrow(/Project not found/);

    const summary = store.redeemShareLink(collaborator.context, link.token);
    expect(summary.id).toBe(project.id);

    // Now they can read and write.
    expect(store.getProject(collaborator.context, project.id).name).toBe('Shared Tower');
    const updated = store.updateProjectGraph(collaborator.context, project.id, { graph: { nodes: [], wires: [] }, message: 'edit' });
    expect(updated.versions.length).toBeGreaterThan(1);
  });

  it('Viewer link: redeemer can read but not write', () => {
    const { store, owner, collaborator, project } = setup();
    const link = store.createShareLink(owner.context, project.id, { role: ROLES.VIEWER });
    store.redeemShareLink(collaborator.context, link.token);
    expect(store.getProject(collaborator.context, project.id).name).toBe('Shared Tower');
    expect(() => store.updateProjectGraph(collaborator.context, project.id, { graph: { nodes: [], wires: [] } })).toThrow(/write/i);
  });

  it("a cross-org editor's runs + artifacts attach to the project's org (visible to the owner)", () => {
    const { store, owner, collaborator, project } = setup();
    store.redeemShareLink(collaborator.context, store.createShareLink(owner.context, project.id, { role: ROLES.EDITOR }).token);

    store.recordGraphRun(collaborator.context, project.id, { status: 'completed' });
    const artifact = store.createObjectArtifact(collaborator.context, project.id, { name: 'export.json' });

    // Owner sees the collaborator's run + artifact on the project.
    expect(store.listGraphRuns(owner.context, project.id).length).toBe(1);
    expect(store.listObjectArtifacts(owner.context, project.id).length).toBe(1);
    expect(artifact.organizationId).toBe(project.organizationId);
    // Regression: the cross-org editor can read their own artifact back (no org 403).
    expect(store.getObjectArtifact(collaborator.context, artifact.id).id).toBe(artifact.id);
  });

  it('does not let a different-org admin in without a member role (escalation guard)', () => {
    const { store, collaborator, project } = setup();
    // collaborator is Owner of their OWN org but has no role on this project.
    expect(() => store.getProject(collaborator.context, project.id)).toThrow(/Project not found/);
    expect(store.listSharedProjects(collaborator.context)).toHaveLength(0);
  });

  it('caps share-link roles at Editor/Viewer (no Admin/Owner via link)', () => {
    const { store, owner, project } = setup();
    expect(() => store.createShareLink(owner.context, project.id, { role: ROLES.ADMIN })).toThrow(/Editor or Viewer/);
    expect(() => store.createShareLink(owner.context, project.id, { role: ROLES.OWNER })).toThrow(/Editor or Viewer/);
  });

  it('redeem: unknown→404, revoked→410, expired→410, unverified→403, idempotent, never downgrades', () => {
    const { store, owner, collaborator, project } = setup();

    expect(() => store.redeemShareLink(collaborator.context, 'deadbeef')).toThrow(/not found/i);

    const revoked = store.createShareLink(owner.context, project.id, { role: ROLES.VIEWER });
    store.revokeShareLink(owner.context, project.id, revoked.id);
    expect(() => store.redeemShareLink(collaborator.context, revoked.token)).toThrow(/no longer valid/i);

    // Expired (negative-ttl link via a clock we control).
    let now = 1000;
    const store2 = new EnterpriseStore({ now: () => now });
    const o2 = verifiedContext(store2, 'o2@example.com');
    const c2 = verifiedContext(store2, 'c2@example.com');
    const p2 = store2.createProject(o2.context, { name: 'P2', graph: { nodes: [], wires: [] } });
    const expiring = store2.createShareLink(o2.context, p2.id, { role: ROLES.VIEWER, expiresInMs: 10 });
    now = 2000;
    expect(() => store2.redeemShareLink(c2.context, expiring.token)).toThrow(/no longer valid/i);

    // Unverified redeemer → 403.
    const unverified = verifiedContext(store, 'unv@example.com');
    unverified.user.emailVerified = false; // simulate unverified
    store.users.get(unverified.user.id).emailVerified = false;
    const live = store.createShareLink(owner.context, project.id, { role: ROLES.EDITOR });
    expect(() => store.redeemShareLink(unverified.context, live.token)).toThrow(/[Vv]erify/);

    // Idempotent + no downgrade: redeem Editor, then a Viewer link → stays Editor.
    store.redeemShareLink(collaborator.context, live.token);          // Editor
    const viewerLink = store.createShareLink(owner.context, project.id, { role: ROLES.VIEWER });
    store.redeemShareLink(collaborator.context, viewerLink.token);    // must NOT downgrade
    const members = store.getProject(owner.context, project.id).members.filter(m => m.userId === collaborator.user.id);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe(ROLES.EDITOR);
  });

  it('listSharedProjects shows shared projects for the member and never double-lists', () => {
    const { store, owner, collaborator, project } = setup();
    store.redeemShareLink(collaborator.context, store.createShareLink(owner.context, project.id, { role: ROLES.EDITOR }).token);

    // Collaborator: appears in shared, not in own-org projects.
    expect(store.listSharedProjects(collaborator.context).map(p => p.id)).toContain(project.id);
    expect(store.listProjects(collaborator.context).map(p => p.id)).not.toContain(project.id);
    // Owner: appears in own projects once, not in shared.
    expect(store.listProjects(owner.context).filter(p => p.id === project.id)).toHaveLength(1);
    expect(store.listSharedProjects(owner.context)).toHaveLength(0);
  });

  it('stores the token hashed, never in plaintext', () => {
    const { store, owner, project } = setup();
    const link = store.createShareLink(owner.context, project.id, { role: ROLES.EDITOR });
    const snapshot = store.exportSnapshot();
    const record = snapshot.shareLinks.find(l => l.id === link.id);
    expect(record.tokenHash).toBeTruthy();
    expect(record.tokenHash).not.toBe(link.token);
    expect(JSON.stringify(snapshot.shareLinks)).not.toContain(link.token); // raw token never persisted
    // The public link object exposes no token hash either.
    expect(store.listShareLinks(owner.context, project.id)[0].tokenHash).toBeUndefined();
  });
});
