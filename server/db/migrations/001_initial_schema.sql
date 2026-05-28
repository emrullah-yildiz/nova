-- Nova Enterprise API — Initial Schema
-- Migration 001: organizations, users, projects, versions, AI requests, connector sessions, audit events

BEGIN;

-- ============================================
-- Organizations
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  BIGINT NOT NULL
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- ============================================
-- Users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    external_subject TEXT NOT NULL DEFAULT '',
    created_at      BIGINT NOT NULL
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_subject ON users(external_subject);

-- ============================================
-- Organization Memberships
-- ============================================
CREATE TABLE IF NOT EXISTS organization_members (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('Owner', 'Admin', 'Editor', 'Viewer')),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================
-- Projects
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id                TEXT PRIMARY KEY,
    organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Untitled Project',
    created_by        TEXT NOT NULL REFERENCES users(id),
    created_at        BIGINT NOT NULL,
    updated_at        BIGINT NOT NULL,
    current_version_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_projects_org ON projects(organization_id);

-- ============================================
-- Project Members
-- ============================================
CREATE TABLE IF NOT EXISTS project_members (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('Owner', 'Admin', 'Editor', 'Viewer')),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- ============================================
-- Project Versions (immutable graph snapshots)
-- ============================================
CREATE TABLE IF NOT EXISTS project_versions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by  TEXT NOT NULL REFERENCES users(id),
    created_at  BIGINT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    graph       JSONB NOT NULL
);

CREATE INDEX idx_project_versions_project ON project_versions(project_id);

-- ============================================
-- Graph Runs (execution records)
-- ============================================
CREATE TABLE IF NOT EXISTS graph_runs (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    version_id      TEXT REFERENCES project_versions(id),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    duration_ms     BIGINT,
    error_summary   TEXT NOT NULL DEFAULT '',
    started_at      BIGINT NOT NULL,
    completed_at    BIGINT
);

CREATE INDEX idx_graph_runs_project ON graph_runs(project_id);
CREATE INDEX idx_graph_runs_org ON graph_runs(organization_id);

-- ============================================
-- Object Artifacts (large graph assets / exports)
-- ============================================
CREATE TABLE IF NOT EXISTS object_artifacts (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    content_type    TEXT NOT NULL,
    byte_size       BIGINT NOT NULL DEFAULT 0,
    storage_key     TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      BIGINT NOT NULL
);

CREATE INDEX idx_object_artifacts_project ON object_artifacts(project_id);
CREATE INDEX idx_object_artifacts_org ON object_artifacts(organization_id);

-- ============================================
-- Background Jobs
-- ============================================
CREATE TABLE IF NOT EXISTS background_jobs (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    project_id      TEXT NOT NULL DEFAULT '',
    artifact_id     TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    payload         JSONB NOT NULL DEFAULT '{}',
    result          JSONB NOT NULL DEFAULT '{}',
    error_summary   TEXT NOT NULL DEFAULT '',
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL,
    available_after BIGINT NOT NULL,
    completed_at    BIGINT
);

CREATE INDEX idx_background_jobs_org ON background_jobs(organization_id);
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_type ON background_jobs(type);

-- ============================================
-- AI Requests
-- ============================================
CREATE TABLE IF NOT EXISTS ai_requests (
    id                TEXT PRIMARY KEY,
    organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id           TEXT NOT NULL REFERENCES users(id),
    project_id        TEXT NOT NULL DEFAULT '' REFERENCES projects(id) ON DELETE SET DEFAULT,
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    message_count     INTEGER NOT NULL DEFAULT 0,
    messages          JSONB NOT NULL DEFAULT '[]',
    metadata          JSONB NOT NULL DEFAULT '{}',
    response_preview  TEXT NOT NULL DEFAULT '',
    usage             JSONB,
    created_at        BIGINT NOT NULL,
    completed_at      BIGINT
);

CREATE INDEX idx_ai_requests_org ON ai_requests(organization_id);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_project ON ai_requests(project_id);

-- ============================================
-- Connector Sessions
-- ============================================
CREATE TABLE IF NOT EXISTS connect_sessions (
    id                TEXT PRIMARY KEY,
    organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id           TEXT NOT NULL REFERENCES users(id),
    project_id        TEXT NOT NULL DEFAULT '',
    host              TEXT NOT NULL DEFAULT 'revit',
    status            TEXT NOT NULL DEFAULT 'pairing' CHECK (status IN ('pairing', 'online', 'expired', 'disconnected')),
    pairing_code      TEXT NOT NULL,
    connector_version TEXT NOT NULL DEFAULT '0.1.0',
    created_at        BIGINT NOT NULL,
    expires_at        BIGINT NOT NULL,
    paired_at         BIGINT,
    last_seen_at      BIGINT
);

CREATE INDEX idx_connect_sessions_org ON connect_sessions(organization_id);
CREATE INDEX idx_connect_sessions_status ON connect_sessions(status);

-- ============================================
-- Audit Events (immutable log)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_events (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL,
    target_id       TEXT NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      BIGINT NOT NULL
);

CREATE INDEX idx_audit_events_org ON audit_events(organization_id);
CREATE INDEX idx_audit_events_type ON audit_events(type);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);

-- ============================================
-- AI Rate Limit Buckets
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key  TEXT PRIMARY KEY,
    count       INTEGER NOT NULL DEFAULT 0,
    expires_at  BIGINT NOT NULL
);

COMMIT;
