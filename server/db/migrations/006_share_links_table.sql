-- Migration 006: project share links
--
-- A share link is a capability URL that grants Editor/Viewer access to a project
-- on redemption (sign-in required). The token is stored HASHED (sha256, like
-- session / email-verification tokens) — the raw token is shown to the creator
-- once and never persisted, so a database leak can't reuse it.
--
-- Idempotent (CREATE TABLE / INDEX IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS share_links (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by   TEXT NOT NULL REFERENCES users(id),
    role         TEXT NOT NULL CHECK (role IN ('Editor', 'Viewer')),
    token_hash   TEXT NOT NULL UNIQUE,
    expires_at   BIGINT,
    revoked_at   BIGINT,
    created_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_project ON share_links(project_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token_hash);

COMMIT;
