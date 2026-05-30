-- Migration 004: ensure object_artifacts + background_jobs tables exist
--
-- These tables are defined in 001_initial_schema.sql, but were added to that
-- file AFTER it had already been applied to the production Neon database. Since
-- the migration runner skips migrations recorded in _migrations, the edit never
-- reached that DB — leaving object_artifacts/background_jobs absent.
--
-- The Worker's snapshot read (server/db/snapshot-queries.mjs) does
-- `SELECT * FROM object_artifacts` / `background_jobs` on every request that
-- boots the API (login/signup), so their absence threw "relation does not
-- exist" and surfaced as a bare 500 on all auth endpoints.
--
-- Everything here is guarded with IF NOT EXISTS, so it's a no-op on a fresh DB
-- (where 001 already created these) and a fix on the stale production DB.

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_object_artifacts_project ON object_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_object_artifacts_org ON object_artifacts(organization_id);

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

CREATE INDEX IF NOT EXISTS idx_background_jobs_org ON background_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(type);

COMMIT;
