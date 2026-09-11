# AD-11: One runtime credential per solution, across all environments

**Status:** Proposed — owner decision required (raised 2026-09-11, findings register R21 / walkthrough F13)

## Context

`SolutionClient.solutionId` is `@unique` (`prisma/schema.prisma`, "One runtime
identity per solution in v1"). A solution therefore holds exactly one runtime
credential, and that credential carries one `environment` and one `sapClient`.

An application promoted through a landscape — DEV, then TEST, then PROD — cannot
hold a DEV and a TEST credential at the same time. Issuing the second **replaces**
the first: the previous token stops working the moment the new one is minted.
The issue response warns loudly and names the environment change, which is
honest; the constraint itself is what a developer runs into on the first
promotion.

Observed in the walkthrough: the QA-E2E-Main solution's TEST credential could
only be issued by killing its DEV one, so the application could not be tested
against both at once.

What holds this in place today:

- The Test Console and the broker bind by **the credential's** environment and
  SAP client (`resolveSapConnectionForEnvironment`). One credential → one
  binding target per solution.
- The write credential seals onto the same row (`setWriteCredential`).
- The northbound audit trail keys `clientTokenId` per call; per-environment
  reporting today comes from the credential's own `environment` column.

## Decision

_Not yet taken._ Two options, with a recommendation.

**Option A — keep v1 as is.** One identity per solution. Promotion = re-issue.
Document it in the Studio help and on the issue dialog (already partly done).
Zero migration. The cost is borne on every promotion, by every solution.

**Option B — one credential per (solution, environment).** Replace
`@unique([solutionId])` with `@@unique([solutionId, environment])`. Each
environment gets its own token, its own SAP client, its own write key and its
own revocation. The runtime is unchanged: a token already resolves to exactly
one environment, and every grant, binding and audit row is already keyed by
environment.

Recommendation: **Option B**, sequenced after the current findings batches
merge. It is a schema change with a migration and touches the issue,
write-credential and Test Console credential lookups (`findFirst` by
`solutionId` becomes `findFirst` by `solutionId + environment`), so it is a
change of its own, not a fix inside another PR.

## Consequences

**Option A**
- Positive: nothing to migrate; the constraint is already documented.
- Negative: every landscape promotion kills the previous environment's
  integration until re-pointed; parallel DEV/TEST testing is impossible.

**Option B**
- Positive: promotion is additive; a PROD credential can be issued while TEST
  keeps running; revocation is per environment.
- Negative: one migration; the "no credential" refusals in broker-run and
  the write-credential route must name the environment they looked for;
  the credentials table gains a row per environment and its SoD checks run
  per row.
- Neutral: rate limit and audit are already per token.

## Alternatives considered

- **Environment-agnostic tokens** (one token valid in every environment,
  environment chosen per call): rejected — it reintroduces the "sandbox
  credential reached production" class of failure the environment binding
  exists to prevent.
