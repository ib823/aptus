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
-- NO_MATCH. A PENDING request (REQUESTED) carries no traffic, so it is bound
-- to the one interface that matched it when it was raised, whatever was added
-- since, as its decision would bind it (wave 1a final review); otherwise it is
-- AMBIGUOUS or NO_MATCH by that same rule. Both stay unbound, keep the old matching under legacy, and are
-- flagged for re-approval on the Control Tower grants screen and the CoreEdge
-- requests board. The statement is the one
-- `pnpm grants:binding --apply` runs (GRANT_BINDING_BACKFILL_SQL in
-- src/lib/studio/grant-binding.ts; a test keeps the two identical). It touches
-- only rows never classified (every row, here; afterwards only those the old
-- code creates during the rollout), so a flagged grant is never auto-bound and a
-- re-run binds nothing new. It cannot fail on existing data: it writes only
-- interface ids it has just read.
--
-- THE LEGACY CUT-OFF (wave 1a integration review). Every grant left unbound
-- here is stamped with this deploy's time (unboundCutoffAt;
-- GRANT_BINDING_CUTOFF_SQL, which the same test keeps identical). Under legacy
-- it is honoured only on interfaces that existed by then: one added after the
-- deploy carried no traffic before it, so the old tuple matching there would
-- only extend the approval to it, on another SAP product say: A47 again. The
-- operator's re-run does not stamp, so a grant the old code creates during the
-- rollout keeps its own createdAt as its cut-off. The stamp is the deploy's
-- time IN UTC, like every createdAt it is compared with: the column has no
-- time zone, and a bare CURRENT_TIMESTAMP would store the migrating session's
-- local time (wave 1a final review).
--
-- Interface.grantMatchChangedAt (wave 1a final review) records when a PATCH
-- last changed an interface's externalId or operation, the two fields a grant
-- is matched on. NULL on every existing row: what each matched before the
-- deploy, it matched by its creation as far as anything can tell, and legacy
-- keeps serving it. The cut-off is judged on the later of the two, so moving
-- an old interface onto an unbound grant's tuple after the deploy is treated
-- as adding one, which legacy refuses.
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
--            DROP COLUMN "unboundReason", DROP COLUMN "unboundLastUsedAt",
--            DROP COLUMN "unboundCutoffAt";
--          ALTER TABLE "Interface" DROP COLUMN "grantMatchChangedAt";

-- AlterTable
ALTER TABLE "ApiAccessGrant" ADD COLUMN     "interfaceId" TEXT,
ADD COLUMN     "sapProduct" TEXT,
ADD COLUMN     "unboundCutoffAt" TIMESTAMP(3),
ADD COLUMN     "unboundLastUsedAt" TIMESTAMP(3),
ADD COLUMN     "unboundReason" TEXT;

-- AlterTable
ALTER TABLE "Interface" ADD COLUMN     "grantMatchChangedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ApiAccessGrant_interfaceId_idx" ON "ApiAccessGrant"("interfaceId");

-- AddForeignKey
ALTER TABLE "ApiAccessGrant" ADD CONSTRAINT "ApiAccessGrant_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "Interface"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (GRANT_BINDING_BACKFILL_SQL)
WITH "candidates" AS (
  SELECT g."id" AS "grantId",
         COUNT(i."id") AS "matches",
         COUNT(i."id") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "earlier",
         MIN(i."id") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "interfaceId",
         MIN(i."sapProduct") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "sapProduct"
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
SET "interfaceId" = CASE WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN c."interfaceId" ELSE NULL END,
    "sapProduct" = CASE WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN c."sapProduct" ELSE NULL END,
    "unboundReason" = CASE
      WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN NULL
      WHEN g."decision" = 'REQUESTED' AND c."earlier" > 1 THEN 'AMBIGUOUS'
      WHEN g."decision" = 'REQUESTED' THEN 'NO_MATCH'
      WHEN c."matches" > 1 THEN 'AMBIGUOUS'
      ELSE 'NO_MATCH'
    END
FROM "candidates" AS c
WHERE g."id" = c."grantId";

-- The legacy cut-off (GRANT_BINDING_CUTOFF_SQL)
UPDATE "ApiAccessGrant" SET "unboundCutoffAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "interfaceId" IS NULL AND "unboundCutoffAt" IS NULL;
