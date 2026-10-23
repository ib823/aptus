# Runbook: Tenant service discovery and registration from a file (P1.2)

Roadmap item P1.2 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.3). Discover lists the services a connection's own SAP Gateway catalogue
reports ("On this tenant"), registers a service from its description file
("From a file"), and names the SAP communication scenario that enables an S/4
Public service ("Ask Basis"). The developer's view is in
`docs/coreedge-developer-guide.md`, *Finding your services on the tenant* and
*Registering from a description file*.

## What is read

**The live listing** is `POST /api/sap/tdd/tenant-services`
(`src/app/api/sap/tdd/tenant-services/route.ts`), Discover's **Read the
service list**. It is a console read on the governed pipeline
(`docs/runbooks/coreedge-console-pipeline.md`), so it writes the
organisation's console row (`externalId` `-tenant-catalogue-`, `rowCount` the
services listed) and one `PlatformConsoleRead` row, and meets the console's
gates in order:

| Gate | Rule |
|---|---|
| role | a builder, for the organisation's own connections; a platform admin only, for a deployment tenant (`S4_TDD_*`), as Probe all |
| `authorise()` | a sandbox developer lists SANDBOX connections only; TEST, PROD and an undeclared environment need a live grant for the environment (`NO_APPROVED_GRANT`, 403) |
| `bind()` | a Tenant Twin connection is never listed (503); a deployment tenant's host must pass the allow-list under `COREEDGE_ENV_TENANT_HOSTS=enforce` |
| `contain()` | the console's circuit for the system |
| limiter | one listing per connection every 2 minutes (`sap:tenant-services:<org>:<connection>`); its 429 gives the circuit's permit back |

The requests, on the connection's own base URL and SAP client:

- OData V2: `GET /sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection?$format=json&$top=500&$skip=<n>`, page after page.
- OData V4, only when the person listing ticks it and never on S/4HANA Cloud
  Public Edition (the product's communication users cannot read it):
  `GET /sap/opu/odata4/iwfnd/config/default/iwfnd/catalog/0002/ServiceGroups?$expand=DefaultSystem($expand=Services)&$top=500`.

**The stored listing** is `GET /api/studio/tenant-services`
(`src/app/api/studio/tenant-services/route.ts`): the database only, no SAP
call, the ordinary Studio read bucket. It is on its own path because the
edge's live-SAP bucket is chosen by pathname
(`src/lib/security/rate-limit.ts`, `isLiveSapTenantRoute`): on the live
route's path every visit to the tab would spend a live slot.

**What is stored**, one row per connection in `TenantServiceListing` (an
organisation-anchored model under the tenant guard): when and by whom it was
listed, its correlation id, the catalogue's status, the V4 status, whether it
was cut, and the entries (id, technical name, version, OData version, the path
on the connection's own host or none, title, §1.2 class, catalogue id,
scenario ids). Never a host, a URL or a credential. A deployment tenant's
listing is never stored: that tenant is shared by every organisation here.
When the connection is edited, its revision moves and the tab says the stored
listing predates the change.

## Limits, and why

| Limit | Value | Why |
|---|---|---|
| page size | 500 | SAP's catalogue answers large pages slowly |
| pages | 10 | |
| services | 5,000 | larger than any catalogue measured; a hostile one stops here |
| bytes a page | 2 MiB, decoded | `bodyPrefix` counts decoded bytes, so a compression bomb stops at the cap |
| bytes in all | 8 MiB | the instance is small and shared by every organisation |
| time | 20 s | the whole listing, each page's body included: a host that trickles a body is cut off there |
| stored entries | 1 MiB of JSON | SAP's services that are not Published APIs are dropped first and customer-built ones last; the tab says how many of the services read the store left out |

The listing never requests an address the catalogue gives: paging is
CoreEdge's own `$skip`, a redirect is not followed (`redirect: "manual"`),
and a listed `ServiceUrl` becomes a path only when it is on the connection's
own origin (under its base path) and passes `validateServicePath`; any other
address is stored as no path, and that service gets no Register action. The
parser reads the fields it needs and nothing else, every string capped
(`src/lib/sap-public/tenant-discovery.ts`; the hostile-input cases are in
`tests/unit/sap/tenant-discovery.test.ts`).

## What a status means

| `catalogueStatus` | Meaning | What to do |
|---|---|---|
| `OK` | every page answered | |
| `UNAUTHORIZED` | SAP answered 401, 403 or a redirect: the connection's user may not read the catalogue | register by path or from the file; the screen names no scenario, because SAP documents none for reading the catalogue |
| `NOT_FOUND` | 404: no Gateway catalogue at that address | as above |
| `TIMEOUT` | the 20 s ran out before the first page | try again later |
| `TRUNCATED` | a limit stopped it, or a later page failed: what was read is stored | |
| `ERROR` | any other answer, or a body that is not a catalogue page | try again later; the console row has the status |

## Recording the lab fixture (P1.8)

The classifier is proved on a synthetic fixture,
`tests/fixtures/tenant-discovery/catalogservice-v2.lab-shape.json`, marked
`_synthetic`. To replace it with what the lab really lists:

1. In Studio, Discover, choose the lab's connection, open **On this tenant**
   and **Read the service list**.
2. `pnpm coreedge:tenant-discovery --connection <key>` prints the stored
   listing by class: check the lab's `Z*` and `YY1_*` services are under
   customer-built.
3. `pnpm coreedge:tenant-discovery --connection <key> --record` writes
   `tests/fixtures/tenant-discovery/catalogservice-v2.lab.json`: the V2
   entries as a catalogue page, with no host and no titles. It reads the
   database only (`scripts/coreedge/tenant-discovery-record.ts`).
4. Add a case to `tests/unit/sap/tenant-discovery.test.ts` over the recorded
   file asserting the lab's customer-built services, keep the synthetic file
   for the shape and hostile cases, and record the listing in the roadmap's
   P1.2 Status (date, correlation id, counts).

## Ask Basis, and its coverage

The catalogue's rows and detail name the communication scenarios SAP's own
table (`SapCommScenario`, "Available Interfaces for Your Selected Scope",
loaded per content release) lists the service under, joined by the exact
technical id of the address CoreEdge calls, from the newest release with
scenario rows, in one statement (`src/lib/sap-public/comm-scenarios.ts`). A
derived V4 address is a guess and is never joined.
`pnpm coreedge:scenario-coverage` prints, from the database, how many curated
S/4 services show the scenario their definition names and how many S/4 Public
OData V2 catalogue rows show one (on the 2608 files: 5 of 5 and 180 of 211);
it exits 1 when either is under 80%, and 2 when no release is loaded.

## Registration from a file

`POST /api/studio/interfaces/from-description`
(`src/app/api/studio/interfaces/from-description/route.ts`), multipart with a
`description` file and a `fields` JSON part. It never calls SAP. In order: a
builder, the organisation's limiter (20 uploads an hour), `Content-Length`
(4 MiB and 64 KiB of form), the contract compiler's admission before any of
the body is read (`COREEDGE_CONTRACT_ISOLATES=0` turns it off, and the
organisation's daily compiler time applies:
`docs/runbooks/coreedge-contract-compiler.md`), a bounded read, strict UTF-8,
the same field rules as `POST /api/studio/interfaces`, the compile in the
worker, then one transaction: the DRAFT interface, its 1.0.0
`ContractSnapshot` (`origin` `UPLOAD`, no environment, no connection) with its
texts, the request schema stamp for a write, and a `ConfigAudit` CREATE row
with the file's sha256 and size. A file over 4 MiB is refused with a message
to verify the service from the tenant instead.

## Rolling back

The tables and columns are additive (migration
`20261027010000_tenant_service_discovery`, with its `backout.sql`). A build
before P1.2 reads none of them: rolled back, Discover loses its two new tabs,
uploaded drafts stay as drafts with their snapshot (a pre-P1.2 build ignores
`origin`), and stored listings are kept for the roll forward. Run the backout
only after rolling back, as `docs/runbooks/coreedge-release.md` describes; it
drops the stored listings and every recorded sign-off
(`docs/runbooks/coreedge-api-policy.md`).
