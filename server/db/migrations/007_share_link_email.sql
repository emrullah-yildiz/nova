-- Migration 007: optional invitee email on share links
--
-- When a share link is created by inviting someone by email (vs the generic
-- "anyone with the link" copy flow), we record the invited address so the
-- project's access panel can show pending invites. Nullable / '' for
-- copy-link-style links.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE share_links ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

COMMIT;
