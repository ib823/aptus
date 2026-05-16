-- Migrate Session storage from plaintext tokens to SHA-256 hashes.
--
-- Before this migration, Session.token held the raw 64-char hex token also
-- present in the user's cookie. A database read therefore yielded usable
-- session tokens. After this migration, only the hash is stored; the raw
-- token lives exclusively in the cookie. Validation re-hashes the cookie
-- value before lookup.
--
-- Existing sessions cannot be migrated transparently because we don't have
-- a way to re-derive the original tokens (and even if we did via
-- pgcrypto.digest, sessions whose plaintext was already exfiltrated would
-- remain valid). The safer reset: revoke every active session and replace
-- the stored value with a per-row sentinel that cannot collide with any
-- valid SHA-256 hash (the prefix is not in the hex alphabet). Users
-- re-login once after deploy.

-- 1. Revoke every active session.
UPDATE "Session"
SET "isRevoked" = true,
    "revokedAt" = NOW(),
    "revokedReason" = 'token_hash_migration'
WHERE "isRevoked" = false;

-- 2. Rename column + matching constraint and index. RENAME preserves data
--    and the unique constraint atomically.
ALTER TABLE "Session" RENAME COLUMN "token" TO "tokenHash";
ALTER TABLE "Session" RENAME CONSTRAINT "Session_token_key" TO "Session_tokenHash_key";
ALTER INDEX "Session_token_idx" RENAME TO "Session_tokenHash_idx";

-- 3. Overwrite the now-misnamed plaintext values with non-lookupable
--    sentinels. Uses the row id to keep the unique constraint satisfied.
UPDATE "Session" SET "tokenHash" = 'invalidated_' || "id";
