-- Give executive access grants an end.
--
-- The presales invite flow has always required a Starts-at/Expires-at window.
-- The affirm executive invite — which emails an external party a link to a
-- client's unreleased Fit-to-Standard decisions — had no expiry field at all,
-- so every link ever issued was valid forever.

ALTER TABLE "AffirmAccessGrant" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Back-fill existing grants to 30 days from their creation, which is the same
-- default the API now applies. Grants already older than that land in the past
-- and read as expired immediately — correct: an invite sent months ago for a
-- workshop that has happened should not still open.
UPDATE "AffirmAccessGrant"
SET "expiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "expiresAt" IS NULL;

CREATE INDEX "AffirmAccessGrant_expiresAt_idx" ON "AffirmAccessGrant"("expiresAt");
