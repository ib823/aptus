-- Promote Assessment.status from String to a Postgres enum.
--
-- Why: the column previously accepted any string, which let typos and
-- divergent V1/V2 values (draft/in_progress vs scoping/handed_off) coexist
-- silently. Promoting to an enum gives us compile-time safety in the Prisma
-- client and a Postgres-level CHECK that no future write can introduce a
-- value outside the lifecycle.
--
-- Why all 14 values (12 V2 + 2 V1-only): a prod-data audit run via neonctl
-- against the aptus-test branch (commit predating this migration) found
-- only V2 values in use. The 2 V1 values (completed, reviewed) are included
-- defensively because (a) the AssessmentStatus TS alias still names them and
-- (b) cold seed snapshots from earlier in the project history may carry them.
-- Including them keeps the USING cast safe under ANY data state.
--
-- Order matters: in Postgres, ALTER COLUMN TYPE on a column with a default
-- requires DROPping the default first, doing the cast, then SETting the
-- default again with the new type.

CREATE TYPE "AssessmentStatus" AS ENUM (
  'draft',
  'scoping',
  'in_progress',
  'workshop_active',
  'review_cycle',
  'gap_resolution',
  'pending_validation',
  'validated',
  'pending_sign_off',
  'signed_off',
  'handed_off',
  'archived',
  'completed',
  'reviewed'
);

ALTER TABLE "Assessment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Assessment"
  ALTER COLUMN "status" TYPE "AssessmentStatus"
  USING ("status"::"AssessmentStatus");

ALTER TABLE "Assessment" ALTER COLUMN "status" SET DEFAULT 'draft'::"AssessmentStatus";
