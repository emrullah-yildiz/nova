import crypto from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../server/db/run-migrations.mjs';
import { PostgresPersistence } from '../server/db/postgres-persistence.mjs';

const databaseUrl = process.env.NOVA_DATABASE_URL || '';
const runPostgresIntegration = process.env.NOVA_POSTGRES_INTEGRATION_TESTS === 'true' && databaseUrl;
const describePostgres = runPostgresIntegration ? describe : describe.skip;

describePostgres('PostgresPersistence integration', () => {
  let adminPool;
  let pool;
  let schemaName;

  beforeAll(async () => {
    schemaName = 'nova_it_' + crypto.randomBytes(6).toString('hex');
    adminPool = new pg.Pool({ connectionString: databaseUrl });
    await adminPool.query('CREATE SCHEMA ' + quoteIdentifier(schemaName));
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: '-c search_path=' + schemaName
    });
    await runMigrations(pool, { log: () => {} });
  }, 30000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (adminPool && schemaName) {
      await adminPool.query('DROP SCHEMA IF EXISTS ' + quoteIdentifier(schemaName) + ' CASCADE');
      await adminPool.end();
    }
  }, 30000);

  it('round-trips the enterprise snapshot through migrated Postgres tables', async () => {
    const persistence = new PostgresPersistence({ pool });
    const snapshot = createSnapshot();

    await persistence.writeSnapshot(snapshot);
    const restored = await persistence.readSnapshot();

    expect(restored.organizations).toHaveLength(1);
    expect(restored.users).toHaveLength(1);
    expect(restored.projects).toHaveLength(1);
    expect(restored.projects[0].versions[0].graph.nodes[0].id).toBe('node_1');
    expect(restored.graphRuns[0].status).toBe('completed');
    expect(restored.aiRequests[0].provider).toBe('mock');
    expect(restored.connectorSessions[0].status).toBe('online');
    expect(restored.auditEvents.map(event => event.type)).toContain('project.version.created');
  });
});

function createSnapshot() {
  const now = Date.now();
  return {
    schemaVersion: 1,
    organizations: [{
      id: 'org_it',
      name: 'Integration Org',
      slug: 'integration-org',
      settings: {
        dataRetentionDays: 365,
        ai: {
          allowedProviders: ['mock'],
          allowedModels: { mock: ['nova-mock-enterprise'] },
          promptLogging: false,
          maxRequestsPerMinute: 20
        }
      },
      createdAt: now
    }],
    users: [{
      id: 'usr_it',
      email: 'integration@example.com',
      displayName: 'Integration User',
      externalSubject: 'oidc|integration',
      memberships: [{ organizationId: 'org_it', role: 'Owner' }],
      createdAt: now
    }],
    projects: [{
      id: 'prj_it',
      organizationId: 'org_it',
      name: 'Integration Project',
      createdBy: 'usr_it',
      createdAt: now,
      updatedAt: now,
      currentVersionId: 'ver_it',
      members: [{ userId: 'usr_it', role: 'Owner' }],
      versions: [{
        id: 'ver_it',
        projectId: 'prj_it',
        createdAt: now,
        createdBy: 'usr_it',
        message: 'Initial integration graph',
        graph: {
          version: 2,
          nodes: [{ id: 'node_1', type: 'number-input' }],
          wires: []
        }
      }]
    }],
    graphRuns: [{
      id: 'run_it',
      projectId: 'prj_it',
      organizationId: 'org_it',
      userId: 'usr_it',
      versionId: 'ver_it',
      status: 'completed',
      durationMs: 25,
      errorSummary: '',
      startedAt: now,
      completedAt: now + 25
    }],
    connectorSessions: [{
      id: 'con_it',
      organizationId: 'org_it',
      userId: 'usr_it',
      projectId: 'prj_it',
      host: 'revit',
      status: 'online',
      pairingCode: 'ABC123',
      connectorVersion: '0.1.0',
      createdAt: now,
      expiresAt: now + 600000,
      pairedAt: now + 1000,
      lastSeenAt: now + 2000
    }],
    aiRequests: [{
      id: 'air_it',
      organizationId: 'org_it',
      userId: 'usr_it',
      projectId: 'prj_it',
      provider: 'mock',
      model: 'nova-mock-enterprise',
      status: 'completed',
      messageCount: 1,
      messages: [],
      metadata: { source: 'integration' },
      responsePreview: 'Done',
      usage: { inputMessages: 1 },
      createdAt: now,
      completedAt: now + 10
    }],
    auditEvents: [{
      id: 'aud_it',
      organizationId: 'org_it',
      userId: 'usr_it',
      type: 'project.version.created',
      targetId: 'prj_it',
      metadata: { versionId: 'ver_it' },
      createdAt: now
    }]
  };
}

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}
