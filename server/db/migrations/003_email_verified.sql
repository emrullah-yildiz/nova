-- Migration 003: email verification state
--
-- Tracks whether a user's email address has been confirmed via the emailed
-- verification link. OIDC (Google/SSO) accounts are created verified; email+
-- password accounts start false until the link is clicked.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
