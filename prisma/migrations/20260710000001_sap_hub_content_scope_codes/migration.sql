-- =====================================================================
-- SapHubContent — add scopeItemCodes (Phase 3, dependency layer).
-- =====================================================================
-- Additive, guarded, idempotent. `ADD COLUMN IF NOT EXISTS` is safe on a fresh
-- DB, on a populated DB, and on an environment that already got the column via
-- `prisma db push`. No data-asserts, no dependency on other objects.
-- =====================================================================

ALTER TABLE "SapHubContent"
  ADD COLUMN IF NOT EXISTS "scopeItemCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
