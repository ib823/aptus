-- ContractSnapshot's /schema texts and ContractTime (P1.3, the consolidated
-- Contract Compiler containment).
--
-- schemasText, createBodyText, updateBodyText: what GET /schema serves,
-- rendered ONCE in the compiler's worker when a verify or a capture records
-- the snapshot, so the read path never renders anything. At most one row of
-- an interface holds them (the writer nulls the others in the same
-- transaction), at most 1 MiB together; text, so PostgreSQL TOASTs and
-- compresses them.
-- They are served as they are until the interface's next verify or capture
-- renders them again; nothing re-renders stored rows outside a job charged to
-- their organisation.
--
-- ContractTime: each organisation's compiler wall time per UTC day, the one
-- allowance that remains (lib/contracts/contract-time.ts): ms, the settled
-- jobs' wall time, and reservedMs, the deadlines of the jobs in flight. No
-- foreign key: a row is a counter, deleted after a week by the charge itself.
--
-- NOTHING STOPS ON DEPLOY: nullable columns with no default (a catalogue
-- change, no table rewrite) and a new table. No backfill: a snapshot without
-- texts answers schemas:null, schemasOmitted NOT_RENDERED, until its
-- interface is verified again.
--
-- Backout: backout.sql beside this file.

-- AlterTable
ALTER TABLE "ContractSnapshot" ADD COLUMN     "createBodyText" TEXT,
ADD COLUMN     "schemasText" TEXT,
ADD COLUMN     "updateBodyText" TEXT;

-- CreateTable
CREATE TABLE "ContractTime" (
    "organizationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "reservedMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractTime_pkey" PRIMARY KEY ("organizationId","day")
);
