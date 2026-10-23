-- P1.4 Governed OData query surface (docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md, P1.4).
--
-- Interface.queryPolicy          what a builder chose (src/lib/odata/policy.ts QueryPolicySourceV1); null = no query surface.
-- Interface.queryBasis           what the current METADATA contract says a query may do (src/lib/odata/basis.ts),
--                                written by a verify's transaction; outside the contract content hash.
-- Interface.queryPolicyCompiled  what the governed read enforces (at most 64 KiB), read by the access-load statement
--                                (src/lib/governed/call-loads.ts) on query-surface calls only.
-- Interface.queryPolicyRevision  +1 on every save, recompile and delete; Studio's compare-and-set.
-- NorthboundAuditEvent.*         the query's kind, literal-free shape, keyed hash, effective fields, policy revision,
--                                chain and page, rows and bytes served, the query rule and flags; written in the
--                                INSERT every call already makes (+0 statements).
--
-- NOTHING STOPS ON DEPLOY: nullable columns with no default, and one INTEGER NOT NULL DEFAULT 0 (a constant
-- default: a catalogue change, no table rewrite). No backfill: no interface has a policy until a builder saves
-- one; legacy reads leave every audit column null. NO INDEX HERE, ON PURPOSE: a plain CREATE INDEX blocks this
-- table's inserts while it builds; P3.5 adds what it needs CONCURRENTLY.
--
-- Backout: backout.sql beside this file.

-- AlterTable
ALTER TABLE "Interface" ADD COLUMN "queryPolicy" JSONB,
ADD COLUMN "queryBasis" JSONB,
ADD COLUMN "queryPolicyCompiled" JSONB,
ADD COLUMN "queryPolicyRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "NorthboundAuditEvent" ADD COLUMN "queryKind" TEXT,
ADD COLUMN "queryShape" TEXT,
ADD COLUMN "queryHash" TEXT,
ADD COLUMN "requestedFields" JSONB,
ADD COLUMN "queryPolicyRev" TEXT,
ADD COLUMN "cursorChainId" TEXT,
ADD COLUMN "pageIndex" INTEGER,
ADD COLUMN "chainRows" INTEGER,
ADD COLUMN "responseBytes" INTEGER,
ADD COLUMN "queryRule" TEXT,
ADD COLUMN "queryFlags" TEXT;
