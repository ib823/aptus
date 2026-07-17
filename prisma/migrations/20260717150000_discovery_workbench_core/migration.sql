-- ABeam Workbench — Neutral Process Discovery consultant workbench (PR-4).
--
-- Purely additive. These tables are consultant working-state ABOUT the library,
-- not library data: the process library itself is committed JSON and stays
-- read-only until the P4 capture pipeline lands.
--
-- DiscoveryProductMap is the fenced product map (C6). It is consultant-only and
-- must never be reachable from a client surface. It stores ONLY the hand-entered
-- Oracle/NetSuite references; the SAP column is derived from origin/scope_id at
-- read time, so the table cannot manufacture a mapping the library does not
-- support.

-- CreateTable
CREATE TABLE "DiscoveryProductMap" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "oracleRef" TEXT,
    "netsuiteRef" TEXT,
    "otherRef" TEXT,
    "notedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryProductMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryGap" (
    "id" TEXT NOT NULL,
    "apqcCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fillSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "ownedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryProductMap_processId_key" ON "DiscoveryProductMap"("processId");

-- CreateIndex
CREATE INDEX "DiscoveryGap_apqcCode_idx" ON "DiscoveryGap"("apqcCode");

-- CreateIndex
CREATE INDEX "DiscoveryGap_status_idx" ON "DiscoveryGap"("status");

-- AddForeignKey
ALTER TABLE "DiscoveryProductMap" ADD CONSTRAINT "DiscoveryProductMap_notedById_fkey" FOREIGN KEY ("notedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryGap" ADD CONSTRAINT "DiscoveryGap_ownedById_fkey" FOREIGN KEY ("ownedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
