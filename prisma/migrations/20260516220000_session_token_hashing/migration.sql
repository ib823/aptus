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
--
-- Wrapped in DO $$ ... $$ so it's idempotent: only fires when the legacy
-- "token" column is still present. Once the rename has happened, every
-- subsequent invocation is a no-op — safe to re-run after the unlikely
-- case where it half-applied and rolled back, or to apply over a DB that
-- has been manually migrated.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name   = 'Session'
      AND column_name  = 'token'
  ) THEN
    -- Revoke every active session.
    UPDATE "Session"
    SET "isRevoked" = true,
        "revokedAt" = NOW(),
        "revokedReason" = 'token_hash_migration'
    WHERE "isRevoked" = false;

    -- Rename the column and its indexes. Prisma's @unique translates to
    -- CREATE UNIQUE INDEX, so the unique key is an INDEX object — rename
    -- via ALTER INDEX, not ALTER TABLE RENAME CONSTRAINT.
    ALTER TABLE "Session" RENAME COLUMN "token" TO "tokenHash";
    ALTER INDEX "Session_token_key" RENAME TO "Session_tokenHash_key";
    ALTER INDEX "Session_token_idx" RENAME TO "Session_tokenHash_idx";

    -- Overwrite the now-misnamed plaintext values with non-lookupable
    -- sentinels. The 'invalidated_' prefix is not in the hex alphabet,
    -- so these can never collide with a real SHA-256 lookup.
    UPDATE "Session" SET "tokenHash" = 'invalidated_' || "id";
  END IF;
END $$;
