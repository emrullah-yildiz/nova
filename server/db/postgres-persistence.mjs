import pg from 'pg';

export class PostgresPersistence {
  constructor(options = {}) {
    this.pool = options.pool || null;
    this.connectionString = options.connectionString || '';
    this.schemaVersion = options.schemaVersion || 1;
    this._poolPromise = null;
  }

  async getPool() {
    if (this.pool) return this.pool;
    if (!this._poolPromise) {
      this._poolPromise = new pg.Pool({
        connectionString: this.connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
      this._poolPromise.on('error', err => {
        console.error('[PostgresPersistence] Pool error:', err.message);
      });
    }
    return this._poolPromise;
  }

  async close() {
    if (this.pool) return;
    if (this._poolPromise) {
      const pool = await this._poolPromise;
      await pool.end();
      this._poolPromise = null;
    }
  }

  async readSnapshot() {
    const pool = await this.getPool();

    const organizations = (await pool.query('SELECT * FROM organizations')).rows;
    const users = (await pool.query('SELECT * FROM users')).rows;
    const memberships = (await pool.query('SELECT * FROM organization_members')).rows;
    const projects = (await pool.query('SELECT * FROM projects')).rows;
    const projectMembers = (await pool.query('SELECT * FROM project_members')).rows;
    const versions = (await pool.query('SELECT * FROM project_versions ORDER BY created_at ASC')).rows;
    const connectorSessions = (await pool.query('SELECT * FROM connect_sessions')).rows;
    const aiRequests = (await pool.query('SELECT * FROM ai_requests')).rows;
    const auditEvents = (await pool.query('SELECT * FROM audit_events ORDER BY created_at ASC')).rows;

    // Reconstruct EnterpriseStore snapshot shape
    return {
      schemaVersion: this.schemaVersion,
      organizations: organizations.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : (r.settings || {}),
        createdAt: r.created_at
      })),
      users: users.map(r => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        externalSubject: r.external_subject,
        memberships: memberships
          .filter(m => m.user_id === r.id)
          .map(m => ({
            organizationId: m.organization_id,
            role: m.role
          })),
        createdAt: r.created_at
      })),
      projects: projects.map(r => {
        const projectVersions = versions.filter(v => v.project_id === r.id);
        return {
          id: r.id,
          organizationId: r.organization_id,
          name: r.name,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          currentVersionId: r.current_version_id,
          members: projectMembers
            .filter(m => m.project_id === r.id)
            .map(m => ({
              userId: m.user_id,
              role: m.role
            })),
          versions: projectVersions.map(v => ({
            id: v.id,
            projectId: v.project_id,
            createdAt: v.created_at,
            createdBy: v.created_by,
            message: v.message,
            graph: typeof v.graph === 'string' ? JSON.parse(v.graph) : (v.graph || {})
          }))
        };
      }),
      connectorSessions: connectorSessions.map(r => ({
        id: r.id,
        organizationId: r.organization_id,
        userId: r.user_id,
        projectId: r.project_id,
        host: r.host,
        status: r.status,
        pairingCode: r.pairing_code,
        connectorVersion: r.connector_version,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        pairedAt: r.paired_at,
        lastSeenAt: r.last_seen_at
      })),
      aiRequests: aiRequests.map(r => ({
        id: r.id,
        organizationId: r.organization_id,
        userId: r.user_id,
        projectId: r.project_id,
        provider: r.provider,
        model: r.model,
        status: r.status,
        messageCount: r.message_count,
        messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : (r.messages || []),
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
        responsePreview: r.response_preview,
        usage: r.usage ? (typeof r.usage === 'string' ? JSON.parse(r.usage) : r.usage) : null,
        createdAt: r.created_at,
        completedAt: r.completed_at
      })),
      auditEvents: auditEvents.map(r => ({
        id: r.id,
        organizationId: r.organization_id,
        userId: r.user_id,
        type: r.type,
        targetId: r.target_id,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
        createdAt: r.created_at
      }))
    };
  }

  async writeSnapshot(snapshot) {
    const pool = await this.getPool();

    // Use a transaction to write the full snapshot atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing data
      await client.query('DELETE FROM audit_events');
      await client.query('DELETE FROM ai_requests');
      await client.query('DELETE FROM connect_sessions');
      await client.query('DELETE FROM project_versions');
      await client.query('DELETE FROM project_members');
      await client.query('DELETE FROM graph_runs');
      await client.query('DELETE FROM projects');
      await client.query('DELETE FROM organization_members');
      await client.query('DELETE FROM users');
      await client.query('DELETE FROM organizations');

      // Insert organizations
      if (snapshot.organizations) {
        for (const org of snapshot.organizations) {
          await client.query(
            'INSERT INTO organizations (id, name, slug, settings, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, settings=EXCLUDED.settings, created_at=EXCLUDED.created_at',
            [org.id, org.name, org.slug, JSON.stringify(org.settings || {}), org.createdAt]
          );
        }
      }

      // Insert users and their memberships
      if (snapshot.users) {
        for (const user of snapshot.users) {
          await client.query(
            'INSERT INTO users (id, email, display_name, external_subject, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, external_subject=EXCLUDED.external_subject, created_at=EXCLUDED.created_at',
            [user.id, user.email, user.displayName || '', user.externalSubject || '', user.createdAt]
          );
          // Insert memberships
          if (user.memberships) {
            for (const m of user.memberships) {
              await client.query(
                'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, user_id) DO UPDATE SET role=EXCLUDED.role',
                [user.id + '_' + m.organizationId, m.organizationId, user.id, m.role]
              );
            }
          }
        }
      }

      // Insert projects with members and versions
      if (snapshot.projects) {
        for (const project of snapshot.projects) {
          await client.query(
            'INSERT INTO projects (id, organization_id, name, created_by, created_at, updated_at, current_version_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, organization_id=EXCLUDED.organization_id, created_by=EXCLUDED.created_by, created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, current_version_id=EXCLUDED.current_version_id',
            [project.id, project.organizationId, project.name, project.createdBy, project.createdAt, project.updatedAt, project.currentVersionId]
          );

          // Insert project members
          if (project.members) {
            for (const m of project.members) {
              await client.query(
                'INSERT INTO project_members (id, project_id, user_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT (project_id, user_id) DO UPDATE SET role=EXCLUDED.role',
                [project.id + '_' + m.userId, project.id, m.userId, m.role]
              );
            }
          }

          // Insert project versions
          if (project.versions) {
            for (const v of project.versions) {
              await client.query(
                'INSERT INTO project_versions (id, project_id, created_by, created_at, message, graph) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET project_id=EXCLUDED.project_id, created_by=EXCLUDED.created_by, created_at=EXCLUDED.created_at, message=EXCLUDED.message, graph=EXCLUDED.graph',
                [v.id, v.projectId || project.id, v.createdBy || project.createdBy, v.createdAt, v.message || '', JSON.stringify(v.graph || {})]
              );
            }
          }
        }
      }

      // Insert connector sessions
      if (snapshot.connectorSessions) {
        for (const s of snapshot.connectorSessions) {
          await client.query(
            'INSERT INTO connect_sessions (id, organization_id, user_id, project_id, host, status, pairing_code, connector_version, created_at, expires_at, paired_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, paired_at=EXCLUDED.paired_at, last_seen_at=EXCLUDED.last_seen_at',
            [s.id, s.organizationId, s.userId, s.projectId || '', s.host || 'revit', s.status, s.pairingCode, s.connectorVersion || '0.1.0', s.createdAt, s.expiresAt, s.pairedAt || null, s.lastSeenAt || null]
          );
        }
      }

      // Insert AI requests
      if (snapshot.aiRequests) {
        for (const r of snapshot.aiRequests) {
          await client.query(
            'INSERT INTO ai_requests (id, organization_id, user_id, project_id, provider, model, status, message_count, messages, metadata, response_preview, usage, created_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, response_preview=EXCLUDED.response_preview, usage=EXCLUDED.usage, completed_at=EXCLUDED.completed_at',
            [r.id, r.organizationId, r.userId, r.projectId || '', r.provider, r.model, r.status, r.messageCount || 0, JSON.stringify(r.messages || []), JSON.stringify(r.metadata || {}), r.responsePreview || '', r.usage ? JSON.stringify(r.usage) : null, r.createdAt, r.completedAt || null]
          );
        }
      }

      // Insert audit events
      if (snapshot.auditEvents) {
        for (const e of snapshot.auditEvents) {
          await client.query(
            'INSERT INTO audit_events (id, organization_id, user_id, type, target_id, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
            [e.id, e.organizationId, e.userId, e.type, e.targetId || '', JSON.stringify(e.metadata || {}), e.createdAt]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async isConnected() {
    try {
      const pool = await this.getPool();
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      return false;
    }
  }
}