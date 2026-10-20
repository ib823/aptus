-- Bind every access grant to ONE interface and SAP product (P0.1, audit A47).
--
-- A grant stored only (solution, externalId, operation, environment), and the
-- broker re-derived authority from that tuple, so one approval extended to any
-- interface added later with the same service id on another SAP system. Each
-- grant now names the interface it was decided for and that interface's
-- product; the broker matches a bound grant on its interface only.
--
-- BACKFILL. Each existing grant is bound to the single interface its old tuple
-- matches today (same solution, organization, externalId and operation, which
-- is what the broker matched on), provided that interface existed when the
-- request was raised: an interface added later is not what anybody asked for.
-- A grant matching several interfaces today is marked AMBIGUOUS, even if only
-- one of them predates it, because the old broker serves it on all of them
-- (review round 2); one matching none, or only an interface added after it,
-- NO_MATCH. Both stay unbound, keep the old matching under legacy, and are
-- flagged for re-approval on the Control Tower grants screen and the CoreEdge
-- requests board. The statement is the one
-- `pnpm grants:binding --apply` runs (GRANT_BINDING_BACKFILL_SQL in
-- src/lib/studio/grant-binding.ts; a test keeps the two identical). It touches
-- only rows never classified (every row, here; afterwards only those the old
-- code creates during the rollout), so a flagged grant is never auto-bound and a
-- re-run binds nothing new. It cannot fail on existing data: it writes only
-- interface ids it has just read.
--
-- NOTHING STOPS ON DEPLOY. A bound grant authorises exactly what it authorised
-- before (its one matching interface). An unbound grant keeps the old matching
-- until the operator sets COREEDGE_GRANT_BINDING=strict, and each call it
-- authorises stamps unboundLastUsedAt. The running code never reads the new
-- columns, and a grant it creates during the rollout is simply unbound until
-- `pnpm grants:binding --apply` or its decision binds it.
--
-- Generated with `prisma migrate diff`; the backfill is hand-written.
--
-- Backout: ALTER TABLE "ApiAccessGrant" DROP CONSTRAINT "ApiAccessGrant_interfaceId_fkey";
--          DROP INDEX "ApiAccessGrant_interfaceId_idx";
--          ALTER TABLE "ApiAccessGrant" DROP COLUMN "interfaceId", DROP COLUMN "sapProduct",
--            DROP COLUMN "unboundReason", DROP COLUMN "unboundLastUsedAt";

-- AlterTable
ALTER TABLE "ApiAccessGrant" ADD COLUMN     "interfaceId" TEXT,
ADD COLUMN     "sapProduct" TEXT,
ADD COLUMN     "unboundLastUsedAt" TIMESTAMP(3),
ADD COLUMN     "unboundReason" TEXT;

-- CreateIndex
CREATE INDEX "ApiAccessGrant_interfaceId_idx" ON "ApiAccessGrant"("interfaceId");

-- AddForeignKey
ALTER TABLE "ApiAccessGrant" ADD CONSTRAINT "ApiAccessGrant_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "Interface"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (GRANT_BINDING_BACKFILL_SQL)
WITH "candidates" AS (
  SELECT g."id" AS "grantId",
         COUNT(i."id") AS "matches",
         COUNT(i."id") FILTER (WHERE i."createdAt" <= g."createdAt") AS "earlier",
         MIN(i."id") AS "interfaceId",
         MIN(i."sapProduct") AS "sapProduct"
  FROM "ApiAccessGrant" g
  LEFT JOIN "Interface" i
    ON i."solutionId" = g."solutionId"
   AND i."organizationId" = g."organizationId"
   AND i."externalId" = g."externalId"
   AND i."operation" = g."operation"
  WHERE g."interfaceId" IS NULL
    AND g."unboundReason" IS NULL
  GROUP BY g."id"
)
UPDATE "ApiAccessGrant" AS g
SET "interfaceId" = CASE WHEN c."matches" = 1 AND c."earlier" = 1 THEN c."interfaceId" ELSE NULL END,
    "sapProduct" = CASE WHEN c."matches" = 1 AND c."earlier" = 1 THEN c."sapProduct" ELSE NULL END,
    "unboundReason" = CASE
      WHEN c."matches" > 1 THEN 'AMBIGUOUS'
      WHEN c."matches" = 1 AND c."earlier" = 1 THEN NULL
      ELSE 'NO_MATCH'
    END
FROM "candidates" AS c
WHERE g."id" = c."grantId";
