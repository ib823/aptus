-- SapConnection.environment: free text -> SapEnvironment enum  (settled decision D1)
--
-- WHY. The column was TEXT with the comment "free text so a landscape with other
-- names is not forced to lie". The binding compares it with a credential's
-- environment (SolutionClient.environment) and a grant's
-- (ApiAccessGrant.environment), both of which are drawn from exactly four words.
-- A connection declaring a fifth could never bind to anything, so the freedom was
-- not expressiveness — it was a value the resolver could not use, reachable by any
-- write path that skipped `normalizeEnvironment`.
--
-- THE CONVERSION IS LOSSY IN ONE DIRECTION AND THE LOSS IS DELIBERATE. Anything
-- that is not one of the four words becomes NULL — "undeclared" — which is a state
-- this schema already models and the resolver already handles (a read proceeds
-- flagged bindingUnverified; a write refuses with UNDECLARED_ENVIRONMENT_WRITE).
-- Mapping an unrecognised landscape onto one of the four would be the guess this
-- column exists to avoid: silently calling someone's "STAGING" row PROD is how an
-- accidental production write happens. A row that loses its label refuses loudly
-- instead, and an operator re-declares it in Studio.
--
-- Values that DO convert, case- and whitespace-insensitively, plus the common
-- long forms seen in landscape naming:
--   SANDBOX | SBX                    -> SANDBOX
--   DEV | DEVELOPMENT                -> DEV
--   TEST | QA | QAS                  -> TEST
--   PROD | PRD | PRODUCTION          -> PROD
-- Everything else, including the empty string, becomes NULL.

CREATE TYPE "SapEnvironment" AS ENUM ('SANDBOX', 'DEV', 'TEST', 'PROD');

-- The partial unique index is built ON this column, so Postgres drops it with the
-- type change. Drop it explicitly first so the migration states the fact rather
-- than relying on a cascade, and recreate it at the end against the new type.
DROP INDEX IF EXISTS "SapConnection_active_binding_tuple";

ALTER TABLE "SapConnection"
  ALTER COLUMN "environment" TYPE "SapEnvironment"
  USING (
    CASE upper(btrim("environment"))
      WHEN 'SANDBOX'     THEN 'SANDBOX'::"SapEnvironment"
      WHEN 'SBX'         THEN 'SANDBOX'::"SapEnvironment"
      WHEN 'DEV'         THEN 'DEV'::"SapEnvironment"
      WHEN 'DEVELOPMENT' THEN 'DEV'::"SapEnvironment"
      WHEN 'TEST'        THEN 'TEST'::"SapEnvironment"
      WHEN 'QA'          THEN 'TEST'::"SapEnvironment"
      WHEN 'QAS'         THEN 'TEST'::"SapEnvironment"
      WHEN 'PROD'        THEN 'PROD'::"SapEnvironment"
      WHEN 'PRD'         THEN 'PROD'::"SapEnvironment"
      WHEN 'PRODUCTION'  THEN 'PROD'::"SapEnvironment"
      ELSE NULL
    END
  );

-- Recreated verbatim from 20260731010000_connection_binding_tuple, against the new
-- column type. Same three scoping decisions, and they still hold:
--
--   * ACTIVE rows only — the resolver filters isActive: true, so the invariant
--     must not be stricter than the rule it protects, or deactivated fixtures
--     collide with live rows and the migration fails on real data.
--   * DECLARED environments only — NULL is the documented undeclared state, which
--     the resolver already quarantines. Blocking a second undeclared row would
--     punish an estate for not having been migrated yet, and the conversion above
--     can only have INCREASED the number of such rows.
--   * NULLS NOT DISTINCT (PostgreSQL 15+), so a NULL client collides with a NULL
--     client. Two active DEV rows addressing no SAP client are precisely the
--     indistinguishable pair this exists to prevent.
CREATE UNIQUE INDEX "SapConnection_active_binding_tuple"
  ON "SapConnection" ("organizationId", "product", "environment", "client")
  NULLS NOT DISTINCT
  WHERE "isActive" AND "environment" IS NOT NULL;
