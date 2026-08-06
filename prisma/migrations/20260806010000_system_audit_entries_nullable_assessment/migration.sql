-- System-level audit events (org governance, catalogue imports, onboarding)
-- were written with assessmentId "system"/"SYSTEM", violating the FK on every
-- call — no Assessment with that id exists — so the writes threw or were silently
-- swallowed. NULL is the honest value: these events have no assessment.
ALTER TABLE "DecisionLogEntry" ALTER COLUMN "assessmentId" DROP NOT NULL;

-- The relation is optional now, and Prisma's canonical FK for an optional
-- relation is ON DELETE SET NULL (required was RESTRICT). Recreate it so the
-- history-built database matches the schema exactly. NOT destructive: the
-- constraint is re-added in the same migration, and no row can be orphaned by
-- the swap because both forms reference the same key.
ALTER TABLE "DecisionLogEntry" DROP CONSTRAINT "DecisionLogEntry_assessmentId_fkey";
ALTER TABLE "DecisionLogEntry" ADD CONSTRAINT "DecisionLogEntry_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
