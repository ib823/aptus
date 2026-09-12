-- The per-lane check ledger.
--
-- A lane stays derived; this stores the evidence a derivation needs. One row
-- per (solution, interface, environment), holding the probe outcome, the read
-- outcome, the row count, and the instant each was established.
--
-- Metadata reachability and data readability are separate columns because SAP
-- grants them separately — the same reason the per-service matrix keeps them
-- apart, and the reason a connection-level green cannot support a lane's claim.
--
-- IF NOT EXISTS throughout: this repository has already had one cross-branch
-- collision on an identically-named index (P3018 / 42P07 on the shared preview
-- database), and the cost of the guard is nothing.
CREATE TABLE IF NOT EXISTS "LaneCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "connectionId" TEXT,
    "probeStatus" TEXT,
    "probeAt" TIMESTAMP(3),
    "readStatus" TEXT,
    "readAt" TIMESTAMP(3),
    "readRowCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaneCheck_pkey" PRIMARY KEY ("id")
);

-- One row per lane: this is the upsert target, so it is a constraint rather
-- than a convention. Two rows for one lane would make "the last check" a
-- question with two answers.
CREATE UNIQUE INDEX IF NOT EXISTS "LaneCheck_solutionId_interfaceId_environment_key"
    ON "LaneCheck"("solutionId", "interfaceId", "environment");

-- The board reads every lane in one organization.
CREATE INDEX IF NOT EXISTS "LaneCheck_organizationId_idx" ON "LaneCheck"("organizationId");

-- The freshness sweep finds the stalest first.
CREATE INDEX IF NOT EXISTS "LaneCheck_organizationId_readAt_idx"
    ON "LaneCheck"("organizationId", "readAt");
