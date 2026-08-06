# CoreEdge — commercial decisions awaiting the owner

**Status: decision memo, deliberately not built.** The engineering half of the
commercial split shipped (2026-08): a per-product-line `Subscription` entity,
the nightly `CoreEdgeUsageRollup` from `NorthboundAuditEvent`, the Control
Tower Usage screen that reads rollups only, and `checkFeatureAccess` taking a
`productLine`. Everything in THIS document is the half that is a business
decision, recorded here so it is settled once, on purpose, rather than
implied by whoever writes the next route.

## What the engineering now supports, so the decisions are real

- An organization can hold independent WORKBENCH / COREEDGE / APTUS
  subscriptions (`Subscription` rows; `Organization.plan` remains the
  Workbench compatibility source). No subscription for a line means **no
  access to that line's gated features** — nothing is inherited from the
  Workbench plan, because inheritance would be a pricing decision nobody took.
- Consumption per organization-day is recorded (calls, rows read, writes,
  refusals, distinct interfaces/credentials) and is deliberately a **floor**:
  the audit feed under-reports, so pricing built on it under-counts in the
  customer's favour. If billing must be exact-count, metering has to move
  in-path (before the audit write), which is a latency and availability trade
  the owner must accept explicitly.
- `externalRef` on `Subscription` is provider-agnostic. Choosing a payment
  processor later is a data migration, not a remodel.

## The open decisions

1. **Pricing basis.** The rollup supports per-call, per-row, per-interface,
   per-credential (seat-like), or flat-tier pricing. The distinct-credential
   count is the closest analogue to "seats"; calls/rows are the closest to
   metered consumption. Nothing in the product nudges either way yet.
2. **Whether refusals are billable.** They are recorded separately and
   excluded from `calls`-derived pricing signals on the Usage screen. A 403
   storm is a misconfigured client — treating it as revenue punishes the
   customer for our refusal being correct.
3. **Naming and packaging.** "CoreEdge Console" vs the Workbench: sold as an
   add-on, a standalone product, or a bundled tier. This decides whether the
   signup funnel needs a second product page and whether `orgType: partner`
   organizations can buy it directly.
4. **Licensing of the northbound API.** Whether a customer's own solutions
   calling the broker is included in their subscription or metered separately
   from consultant use of the console screens. The audit rows distinguish the
   two (credential vs console session) so either answer is implementable.
5. **Trial semantics for COREEDGE.** The Workbench trial machinery
   (`trial-manager`) expires `Organization`-level trials. A CoreEdge trial
   would be a `Subscription` row with `status: TRIALING` and an `endsAt`; the
   sweep does not yet expire those — wire it when the trial offer exists,
   not before.
6. **Repository visibility.** Whether the CoreEdge code stays in this repo or
   splits. The audit's evidence: every shared module (auth, tenancy, audit,
   SAP layer) is imported by both halves today, so a split is a real project,
   and nothing commercial forces it.

## What must NOT be decided by default

- No payment processor is wired, and no route should write `externalRef`
  until one is chosen.
- The Usage screen must keep reading rollups only. The first time a
  billing-adjacent number is computed live against the audit table, the
  number and the table start disagreeing under load — during an outage, in
  the direction that overstates usage.
