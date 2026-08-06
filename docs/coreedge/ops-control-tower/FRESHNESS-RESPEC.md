# `GET /api/ops/freshness` — not built as specified, and why

**Status: the respecification below is BUILT (2026-08).** It shipped as
`GET /api/ops/catalogue-health` plus the Operations rail's "Catalogue health"
screen (`/operations/catalogue`), platform_admin-gated and deployment-scoped,
exactly per "The respecification". Deltas from this document, recorded rather
than left to be discovered:

- The staleness constant is `CATALOGUE_STALE_AFTER_DAYS` in
  `src/lib/sap-public/catalogue-health.ts`, printed beside every verdict.
- Refresh is guided from the screen but stays file-based end to end: export
  from a logged-in Hub session → commit the drop file → deploy → run the
  existing seed / harvest-import routes (typed confirmation phrase; the
  server's own inserted/updated/skipped summary is what renders, and the same
  summary is written to the append-only audit). There is no browser upload —
  the drop files are the deployment's provenance record, and an upload that
  bypassed the repository would leave the running catalogue unexplainable
  from the commit history.
- "Per-connection catalogue probing", named below as the real prerequisite for
  an org-scoped view, now partially exists: `SapConnectionProbeEvent` records
  per-connection probe history (connection-level, not per-capability). An
  org-scoped freshness view remains unbuilt and the reasoning below stands.

The original analysis is kept unedited beneath, because it is the reason the
screen has the shape it has.

**Original status: blocked on a specification correction, not on effort.** Build Bible v3
§7 calls for an organization-scoped catalogue-freshness endpoint. It cannot be
built that way, and building it anyway would produce an endpoint that returns
empty for every organization on the platform while looking like it works.

## The verification

Three facts, each checked against the schema and the source rather than inferred:

1. **`SapHubContent` has no `organizationId`.** Zero occurrences in the model
   (`prisma/schema.prisma`). The catalogue is a deployment-wide table; there is
   no column to scope a query by, so `opsWhere(actor, …)` has nothing to attach
   to.
2. **Probe results are keyed by env tenant, not by organization.** `probe-all`
   merges into `rawMetadataJson.probes[tenantKey]`, where `tenantKey` identifies
   a tenant configured in environment variables — the shared ABeam TDD tenant,
   not a customer's own SAP connection.
3. **Both writers are admin-gated and env-driven.** `hub-content/seed` and
   `hub-content/probe-all` each call `requireAdmin()` and operate on
   env-configured tenants. No per-organization code path writes this table at
   all.

So an org-scoped freshness endpoint would filter a table with no tenant column,
against probe data recorded under keys no customer connection uses. Every
organization would receive an empty result, and an empty result on a freshness
panel reads as "the catalogue is stale" or "nothing has been probed" — a claim
about the customer's estate, manufactured from a scoping mismatch.

That is precisely the failure mode this console exists to avoid, so the endpoint
is not built.

## The respecification

**Build it as a deployment-scoped catalogue-provenance panel, not a tenant view.**

It answers one question — *how current is the SAP catalogue this deployment is
serving from?* — and it answers it about the deployment, once, for everyone:

- **No tenant strip and no environment chip.** Both would imply the numbers vary
  by organization. They do not, and a control that implies a distinction the data
  cannot make is worse than no control.
- **Report, per content type: total items, the oldest and newest `updatedAt`, and
  when the last seed or probe sweep ran.** All four are real columns.
- **Staleness is a single named, exported constant, printed on screen beside the
  verdict** — the same discipline as the incident rules: a threshold a reader
  cannot trace to a line is a fabricated judgement.
- **State the probe coverage honestly.** Probes exist only for the tenants
  configured in this deployment's environment. The panel says which, and says
  that a customer's own connection health lives in Connections Health, not here.
- **Gate it to `platform_admin` alone, not to `support`.** Deployment-wide
  catalogue provenance is not an operations-of-my-tenant question, and putting it
  behind the same guard as the tenant-scoped feeds would be the third time this
  table's scope was confused for a tenant's.

## What would have to change for the original spec to be buildable

Adding `organizationId` to `SapHubContent` is not the fix — the catalogue is
genuinely shared, and duplicating it per tenant would multiply a large table to
express a distinction that does not exist.

The real prerequisite is **per-connection catalogue probing**: probe results
recorded against a customer's `SapConnection` rather than against an env tenant
key. That is a substantial piece of work with its own rate-limit and cost
implications — every probe reaches a customer's SAP system — and it belongs in
its own specification, not as an unstated dependency of a read endpoint.

Until that exists, Connections Health already answers the tenant-scoped version
of the question: it reports each connection's own last probe outcome and when it
last succeeded.
