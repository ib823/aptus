-- Emergency withdrawal for API access grants.
--
-- v1 shipped without one on purpose: a settled grant cannot be re-decided, so
-- expiry was the only end a grant had. That works for the ordinary case and
-- fails completely for the urgent one — a leaked credential, a test artefact
-- holding PROD, a client withdrawing consent — and it left grants written
-- before the expiry rule permanently live with no remedy at all.
--
-- This does NOT re-decide anything. `decision` is untouched; revocation is a
-- second, later fact recorded beside it.

ALTER TABLE "ApiAccessGrant"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revokedReason" TEXT;

ALTER TABLE "ApiAccessGrant"
  ADD CONSTRAINT "ApiAccessGrant_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The runtime access check filters on this on every call, so it is worth an
-- index: the common case is "not revoked", and that is the cheap half.
CREATE INDEX "ApiAccessGrant_revokedAt_idx" ON "ApiAccessGrant"("revokedAt");
