-- ABeam Workbench — Presales Pass-1 (data model + four refinements).
--
-- Adds five tables that comprise the presales (Fit-to-Standard pre-onboarding)
-- engagement model, plus the necessary backref columns/indexes on existing
-- tables. No data changes to existing rows.
--
--   PresalesBundle           — one per prospect engagement
--   PresalesAccessGrant      — one per invited stakeholder email per bundle
--   PresalesSession          — short-lived guest cookie session (NOT NextAuth)
--   PresalesBundleDecision   — append-only decision history
--   PresalesAuditEvent       — append-only event log
--
-- Refinements applied at this layer:
--
--   R1  Snapshot mutability before send is enforced in application code
--       (src/lib/presales/guards.ts → assertBundleDraft). The schema only
--       stores the audit trail; no DB trigger.
--
--   R2  OTP-5 lockout is enforced in application code
--       (src/lib/presales/guards.ts → maybeApplyOtpLockout). Schema only
--       provides the otpAttemptCount counter and the revocation columns.
--
--   R3  Auto-forwarder residual risk is documented in README.md only.
--
--   R4  Four eventType values appended to the TS union in
--       src/lib/presales/audit-events.ts. eventType is stored as TEXT
--       (NOT a Postgres ENUM) so future event types do not require a
--       migration.
--
-- CASCADE rationale (called out per FK below; summary here):
--
--   Bundle is the engagement root. When a bundle is deleted (hard delete;
--   not the normal path — revocation soft-marks via revokedAt), every child
--   row goes with it: grants, sessions, decisions, audit events. This is
--   the canonical "engagement traceability lives inside the bundle" rule.
--   CASCADE on grant→bundle, session→bundle, decision→bundle, audit→bundle.
--
--   User and Organization references on the bundle are RESTRICT.
--   We never want to silently destroy a bundle because a user or org row
--   was hard-deleted. Production deletes either of those is unexpected; if
--   it ever happens, the operator must explicitly archive the bundles
--   first.
--
--   Optional consultant references (revokedBy, supersededByGrantId,
--   setByGrantId, actorUserId) SET NULL on delete. The audit/decision row
--   survives even when the actor record is gone.
--
--   Assessment.deleteMany is not expected in product — Assessments use a
--   soft-delete pattern via deletedAt. Bundle→Assessment FK is RESTRICT
--   for defense in depth.
--
-- Index strategy is deliberate. See the schema comment near
-- PresalesAuditEvent for the future [bundleId, eventType, createdAt]
-- composite index discussion (not added now; not blocking).
--
-- ────────────────────────────────────────────────────────────────────────
-- 1. CreateTable
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE "PresalesBundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "scopeCodes" TEXT[],
    "defaultScopeCode" TEXT NOT NULL,
    "contentSnapshotJson" JSONB NOT NULL,
    "clientCompanyName" TEXT NOT NULL,
    "clientLogoUrl" TEXT,
    "clientAccentColor" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopeCompletionsJson" JSONB NOT NULL DEFAULT '{}',
    "acknowledgementTextVersion" TEXT NOT NULL,
    "pdpaNoticeTextVersion" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByGrantId" TEXT,
    "signedDecisionsJson" JSONB,
    "signedPdfBlobUrl" TEXT,
    "signedPdfHash" TEXT,
    "signedWithinGrace" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresalesBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresalesAccessGrant" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "canSignOff" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedIp" TEXT,
    "acknowledgedUa" TEXT,
    "acknowledgementTextVersion" TEXT,
    "pdpaConsentCrossBorder" BOOLEAN NOT NULL DEFAULT false,
    "pdpaConsentTextVersion" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "supersededByGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresalesAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresalesSession" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "ipAtIssuance" TEXT NOT NULL,
    "userAgentAtIssuance" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleTimeoutSec" INTEGER NOT NULL DEFAULT 3600,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "PresalesSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresalesBundleDecision" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "scopeCode" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "effortDays" INTEGER NOT NULL DEFAULT 0,
    "setByGrantId" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "PresalesBundleDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresalesAuditEvent" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "grantId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresalesAuditEvent_pkey" PRIMARY KEY ("id")
);

-- ────────────────────────────────────────────────────────────────────────
-- 2. CreateIndex (unique)
-- ────────────────────────────────────────────────────────────────────────

-- tokenHash is the lookup key for /c/[token] landing. It is SHA-256 of the
-- raw token (64 hex chars) so the raw token never sits in the database.
CREATE UNIQUE INDEX "PresalesAccessGrant_tokenHash_key"
  ON "PresalesAccessGrant"("tokenHash");

-- ────────────────────────────────────────────────────────────────────────
-- 3. CreateIndex (non-unique)
-- ────────────────────────────────────────────────────────────────────────

-- PresalesBundle hot paths: consultant dashboards by tenant (organizationId),
-- by creator (createdBy), expiry sweeper (expiresAt), signoff-state filtering
-- (signedAt). assessmentId for lifecycle navigation.
CREATE INDEX "PresalesBundle_assessmentId_idx"   ON "PresalesBundle"("assessmentId");
CREATE INDEX "PresalesBundle_organizationId_idx" ON "PresalesBundle"("organizationId");
CREATE INDEX "PresalesBundle_createdBy_idx"      ON "PresalesBundle"("createdBy");
CREATE INDEX "PresalesBundle_expiresAt_idx"      ON "PresalesBundle"("expiresAt");
CREATE INDEX "PresalesBundle_signedAt_idx"       ON "PresalesBundle"("signedAt");

-- PresalesAccessGrant hot paths: token lookup on landing (tokenHash, unique
-- above), grant listing per bundle, finding grants by email for consultant
-- search, expiry sweep.
CREATE INDEX "PresalesAccessGrant_bundleId_idx"  ON "PresalesAccessGrant"("bundleId");
CREATE INDEX "PresalesAccessGrant_email_idx"     ON "PresalesAccessGrant"("email");
CREATE INDEX "PresalesAccessGrant_expiresAt_idx" ON "PresalesAccessGrant"("expiresAt");

-- PresalesSession hot paths: validate by grant on every guest request,
-- list-by-bundle for consultant dashboards, expiry sweep.
CREATE INDEX "PresalesSession_grantId_idx"   ON "PresalesSession"("grantId");
CREATE INDEX "PresalesSession_bundleId_idx"  ON "PresalesSession"("bundleId");
CREATE INDEX "PresalesSession_expiresAt_idx" ON "PresalesSession"("expiresAt");

-- PresalesBundleDecision hot paths:
--   (a) "current value" lookup: WHERE bundleId = ? AND scopeCode = ?
--       AND decisionId = ? AND supersededAt IS NULL
--   (b) decision history rendering: ORDER BY setAt DESC for a bundle.
-- The first composite covers (a) without table scan; the second covers (b).
--
-- Note: the (a) index uses an explicit short name because the auto-generated
-- name (column list joined by underscore) is 67 chars. Postgres silently
-- truncates to 63 chars by dropping `_idx`; Prisma's migrate diff truncates
-- to 63 chars by shortening the column-list portion. The two diverge — to
-- prevent drift on every future migrate diff, the name is pinned in
-- schema.prisma via `map: "PresalesBundleDecision_lookup_idx"`.
CREATE INDEX "PresalesBundleDecision_lookup_idx"
  ON "PresalesBundleDecision"("bundleId", "scopeCode", "decisionId", "supersededAt");
CREATE INDEX "PresalesBundleDecision_bundleId_setAt_idx"
  ON "PresalesBundleDecision"("bundleId", "setAt");

-- PresalesAuditEvent hot paths:
--   (1) per-bundle audit timeline rendering: WHERE bundleId = ? ORDER BY createdAt.
--       This also serves the R1 snapshot-lock probe (filters by bundleId
--       and eventType='bundle_sent' LIMIT 1) under current load.
--   (2) per-grant timeline (consultant inspects one stakeholder's actions).
--   (3) event-type aggregations (e.g. weekly otp_failed count). Cardinality
--       on eventType is low — 32 distinct values — so this is most useful
--       when paired with a time range, which is why createdAt rides along.
-- A future composite [bundleId, eventType, createdAt] would serve R1's
-- probe more directly. Not added now (would shadow existing indexes for
-- queries that don't filter on eventType). See the schema comment near
-- PresalesAuditEvent for the rationale.
CREATE INDEX "PresalesAuditEvent_bundleId_createdAt_idx"
  ON "PresalesAuditEvent"("bundleId", "createdAt");
CREATE INDEX "PresalesAuditEvent_grantId_createdAt_idx"
  ON "PresalesAuditEvent"("grantId", "createdAt");
CREATE INDEX "PresalesAuditEvent_eventType_createdAt_idx"
  ON "PresalesAuditEvent"("eventType", "createdAt");

-- ────────────────────────────────────────────────────────────────────────
-- 4. AddForeignKey
--
-- Each FK calls out its CASCADE behavior. Required (NOT NULL) FKs use
-- RESTRICT (immediate constraint check; matches Prisma's default for
-- required relations without an explicit onDelete) unless the parent row
-- is the engagement root (PresalesBundle), in which case CASCADE is correct
-- because the engagement is the unit of deletion. Optional FKs use SET NULL
-- so the audit/decision row survives the actor's deletion.
-- ────────────────────────────────────────────────────────────────────────

-- PresalesBundle → Assessment. RESTRICT: an Assessment with active presales
-- must be explicitly archived first; we never silently lose engagement state
-- because of a stray Assessment hard-delete. (Normal Assessment lifecycle
-- uses soft-delete via deletedAt.)
ALTER TABLE "PresalesBundle" ADD CONSTRAINT "PresalesBundle_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- PresalesBundle → Organization. RESTRICT: same reasoning as Assessment.
ALTER TABLE "PresalesBundle" ADD CONSTRAINT "PresalesBundle_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- PresalesBundle.createdBy → User. RESTRICT: bundle creator is permanent
-- evidence; deactivated consultants soft-flag via User.deactivatedAt rather
-- than hard-delete.
ALTER TABLE "PresalesBundle" ADD CONSTRAINT "PresalesBundle_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- PresalesBundle.revokedBy → User (optional). SET NULL: revocation history
-- survives the revoker's deletion.
ALTER TABLE "PresalesBundle" ADD CONSTRAINT "PresalesBundle_revokedBy_fkey"
  FOREIGN KEY ("revokedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesBundle.signedByGrantId → PresalesAccessGrant (optional).
-- SET NULL: in the unlikely path where a grant is hard-deleted out from
-- under a signed bundle, the bundle keeps its signedAt/signedPdfHash and
-- loses only the back-pointer. (Grants are normally CASCADE'd by bundle
-- delete, so this only matters in operator-driven cleanup.)
ALTER TABLE "PresalesBundle" ADD CONSTRAINT "PresalesBundle_signedByGrantId_fkey"
  FOREIGN KEY ("signedByGrantId") REFERENCES "PresalesAccessGrant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesAccessGrant.bundleId → PresalesBundle. CASCADE: grants belong to
-- the bundle; deleting the engagement root deletes its access surface.
ALTER TABLE "PresalesAccessGrant" ADD CONSTRAINT "PresalesAccessGrant_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "PresalesBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PresalesAccessGrant.revokedBy → User (optional). SET NULL.
ALTER TABLE "PresalesAccessGrant" ADD CONSTRAINT "PresalesAccessGrant_revokedBy_fkey"
  FOREIGN KEY ("revokedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesAccessGrant.supersededByGrantId → PresalesAccessGrant (self-ref).
-- SET NULL: the re-issue chain is informational; severing it does not
-- invalidate either grant.
ALTER TABLE "PresalesAccessGrant" ADD CONSTRAINT "PresalesAccessGrant_supersededByGrantId_fkey"
  FOREIGN KEY ("supersededByGrantId") REFERENCES "PresalesAccessGrant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesSession.grantId → PresalesAccessGrant. CASCADE: a session has no
-- meaning without its grant.
ALTER TABLE "PresalesSession" ADD CONSTRAINT "PresalesSession_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "PresalesAccessGrant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PresalesSession.bundleId → PresalesBundle. CASCADE: denormalized tenant
-- pointer; bundle deletion sweeps sessions.
ALTER TABLE "PresalesSession" ADD CONSTRAINT "PresalesSession_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "PresalesBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PresalesBundleDecision.bundleId → PresalesBundle. CASCADE.
ALTER TABLE "PresalesBundleDecision" ADD CONSTRAINT "PresalesBundleDecision_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "PresalesBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PresalesBundleDecision.setByGrantId → PresalesAccessGrant (optional).
-- SET NULL: the decision row is evidence and outlives the grant pointer.
ALTER TABLE "PresalesBundleDecision" ADD CONSTRAINT "PresalesBundleDecision_setByGrantId_fkey"
  FOREIGN KEY ("setByGrantId") REFERENCES "PresalesAccessGrant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesAuditEvent.bundleId → PresalesBundle. CASCADE.
ALTER TABLE "PresalesAuditEvent" ADD CONSTRAINT "PresalesAuditEvent_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "PresalesBundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PresalesAuditEvent.grantId → PresalesAccessGrant (optional). SET NULL.
ALTER TABLE "PresalesAuditEvent" ADD CONSTRAINT "PresalesAuditEvent_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "PresalesAccessGrant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PresalesAuditEvent.actorUserId → User (optional). SET NULL.
ALTER TABLE "PresalesAuditEvent" ADD CONSTRAINT "PresalesAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
