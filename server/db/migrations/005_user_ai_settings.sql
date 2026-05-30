-- Migration 005: per-user synced AI settings (encrypted)
--
-- Stores a signed-in user's AI settings — provider, model, and their BYOK API
-- keys — as a single AES-GCM ciphertext (see server/auth/webcrypto.mjs:
-- encryptSecret). The database never holds the plaintext keys; the value is
-- decrypted and returned only to the authenticated owner via
-- GET /api/me/ai-settings. The column is intentionally excluded from
-- publicUser()/`/api/me`.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — a no-op where the column already
-- exists, a fix on databases that predate it.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_settings_encrypted TEXT NOT NULL DEFAULT '';

COMMIT;
