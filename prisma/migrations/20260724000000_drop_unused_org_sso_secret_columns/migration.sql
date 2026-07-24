-- ABeam Workbench — drop unused plaintext SSO/SCIM secret columns.
--
-- `Organization.ssoClientSecret` and `Organization.scimBearerToken` were added
-- with the Phase-13 baseline but were never wired: no application code, API
-- route (the SSO config route at /api/organizations/[orgId]/sso handles every
-- other SSO field but not these two), seed, or script ever reads or writes them.
-- They therefore hold no data and represent only a latent plaintext-secret-at-rest
-- risk. Dropping them removes that risk entirely.
--
-- When real SSO/SCIM login is built (Phase 17.10), secrets should be stored
-- encrypted from day one via the existing AES-256-GCM helper
-- (src/lib/intelligence/ai-key-crypto.ts), not in bare TEXT columns.
--
-- Safe: both columns are nullable and unreferenced, so the drop cannot lose data
-- or break a query. Not part of the guarded reconciliation migration.

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "ssoClientSecret";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "scimBearerToken";
