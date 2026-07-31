-- Two ACTIVE connections must not be indistinguishable to the binding.
--
-- resolveSapConnectionForEnvironment already refuses AMBIGUOUS at request
-- time when several candidates match. That refusal is correct but late: the
-- pair was created days earlier, and the first symptom is an integration
-- going dark. This index stops the ambiguity being WRITTEN.
--
-- Scope, checked against production on 2026-07-31 (5 rows) before shipping:
--
--   * ACTIVE rows only. Production keeps deactivated qa-conn-* fixtures whose
--     environments collide with live rows (qa-conn-verify and
--     x5m080-development are both DEV). The resolver never reads inactive
--     rows — resolveSapConnections filters isActive: true — so the invariant
--     must not either, or this migration fails on real data.
--
--   * DECLARED environments only. environment IS NULL is the documented
--     "unbackfilled estate" state, which the resolver already quarantines
--     (reads proceed flagged bindingUnverified, writes refuse outright).
--     Blocking a second legacy row would punish an estate for not having
--     been migrated yet.
--
--   * NULLS NOT DISTINCT (PostgreSQL 15+; production is 17.10), so a NULL
--     client collides with a NULL client. Two active DEV rows that address
--     no SAP client are precisely the indistinguishable pair this exists to
--     prevent — and under the default NULLS DISTINCT the index would accept
--     them silently, which is worse than not having it.
--
-- Prisma's schema language cannot express a partial index, so this is
-- hand-written SQL and SapConnection's schema comment points here.
CREATE UNIQUE INDEX "SapConnection_active_binding_tuple"
  ON "SapConnection" ("organizationId", "product", "environment", "client")
  NULLS NOT DISTINCT
  WHERE "isActive" AND "environment" IS NOT NULL;
