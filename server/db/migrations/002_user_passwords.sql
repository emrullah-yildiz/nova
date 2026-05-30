-- Migration 002: email+password account credentials
--
-- Adds a password hash to users so accounts can be created with email+password
-- in addition to Google/SSO (OIDC) sign-in. OIDC-only users keep '' here.
-- The hash is PBKDF2-HMAC-SHA256 stored in a self-describing PHC-style string
-- (pbkdf2$sha256$<iterations>$<salt>$<hash>); see server/auth/webcrypto.mjs.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

COMMIT;
