-- Test Console broker dry-runs are recorded in the northbound trail with a
-- marker, not omitted: they exercise the real pipeline against a real tenant.
ALTER TABLE "NorthboundAuditEvent" ADD COLUMN "dryRun" BOOLEAN NOT NULL DEFAULT false;
