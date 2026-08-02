-- One vocabulary for organization type, and two columns that agree.
--
-- `Organization` carries both `type` and `orgType` for the same idea, in two
-- spellings. Rows were written three different ways:
--
--   signup                 type = 'PARTNER'  orgType = 'partner'
--   test-login             type = 'partner'  orgType = <default 'client'>
--   ensureOrganization     type = 'client'   orgType = <default 'client'>
--
-- Different screens read different columns — the admin organization list badges
-- `type`, the settings page prints `orgType` — so one organization could show as
-- two different types depending on where you looked. Worse, `type` is what
-- reaches `getRolesForOrgType` and decides which roles may be invited or
-- assigned, so the column nothing validated was the one governing access.
--
-- The writers now set both, canonically. This brings the rows already written
-- into line. Canonical is lowercase: it matches the `OrgType` union, the
-- `orgType` column default, and the zod enum the update API already validates
-- against — three things that already agreed with each other.
--
-- ADDITIVE AND REVERSIBLE. No column is dropped and no row is deleted; only the
-- two type strings are rewritten, and only where they are not already canonical.

-- 1 · Fold every observed spelling of `type` into the canonical vocabulary.
UPDATE "Organization"
SET "type" = CASE lower(btrim("type"))
  WHEN 'platform'      THEN 'platform'
  WHEN 'partner'       THEN 'partner'
  WHEN 'client'        THEN 'client'
  WHEN 'direct_client' THEN 'client'
  ELSE "type"          -- unrecognised: left verbatim so it can be seen and fixed
END
WHERE "type" IS NOT NULL;

-- 2 · Same for `orgType`.
UPDATE "Organization"
SET "orgType" = CASE lower(btrim("orgType"))
  WHEN 'platform'      THEN 'platform'
  WHEN 'partner'       THEN 'partner'
  WHEN 'client'        THEN 'client'
  WHEN 'direct_client' THEN 'client'
  ELSE "orgType"
END
WHERE "orgType" IS NOT NULL;

-- 3 · Where the two columns disagree, `type` wins.
--
-- Not arbitrary: `type` is the column that reaches role assignment, so it is
-- the one whose value has already had consequences. Copying `orgType` over it
-- could silently widen or narrow which roles an organization may assign.
-- `orgType` is corrected to match instead.
UPDATE "Organization"
SET "orgType" = "type"
WHERE "type" IN ('platform', 'partner', 'client')
  AND "orgType" IS DISTINCT FROM "type";
