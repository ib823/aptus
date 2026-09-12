-- Per-service health: metadata reachability and data readability, stored
-- SEPARATELY (PR-5, capability 10).
--
-- The distinction already existed in code; only metadata reachability was
-- persisted. Readability facts lived in a short-TTL request cache, a
-- deployment-scoped blob keyed by tenant rather than connection, and in
-- NorthboundAuditEvent.rowCount as a side effect of real traffic. Nothing
-- joined them.
--
-- The consequence is why this table exists: one green dot per system sends half
-- of all triage to the wrong person. A 401 on metadata is the platform admin's
-- and stops every lane on that system; a 403 on a read is the client's SAP
-- admin's and stops one. "Reachable" loses exactly what decides who to call.
--
-- The unit is the SERVICE, not the connection: a system can serve one entity set
-- and refuse another, so a per-connection verdict averages things that are not
-- alike.

CREATE TABLE "SapServiceHealth" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId"   TEXT NOT NULL,
    "serviceName"    TEXT NOT NULL,
    "entitySet"      TEXT,
    "metadataStatus" TEXT,
    "metadataAt"     TIMESTAMP(3),
    "readStatus"     TEXT,
    "readAt"         TIMESTAMP(3),
    "readRowCount"   INTEGER,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapServiceHealth_pkey" PRIMARY KEY ("id")
);

-- One row per (connection, service, entity set). NULLS NOT DISTINCT so a second
-- row with a NULL entitySet cannot be inserted alongside the first: without it,
-- Postgres treats every NULL as unique and the "one row per service" guarantee
-- silently does not hold for the metadata-only case.
CREATE UNIQUE INDEX "SapServiceHealth_connectionId_serviceName_entitySet_key"
    ON "SapServiceHealth"("connectionId", "serviceName", "entitySet") NULLS NOT DISTINCT;

CREATE INDEX "SapServiceHealth_organizationId_connectionId_idx"
    ON "SapServiceHealth"("organizationId", "connectionId");

-- Staleness sweeps read by this key: "which services have not been proven
-- inside the TTL".
CREATE INDEX "SapServiceHealth_organizationId_readAt_idx"
    ON "SapServiceHealth"("organizationId", "readAt");
