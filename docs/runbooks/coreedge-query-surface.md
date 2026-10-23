# Runbook: the governed query surface (`COREEDGE_QUERY_SURFACE`)

Roadmap item P1.4 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.3), scope P1.4a. Code: `src/lib/odata/` (the grammar, the policy, the
checker and the compiler), `src/lib/northbound/query/` (the switch, the
cursor and the page), `src/lib/security/token-ring.ts`, the data route
`src/app/api/northbound/interfaces/[id]/data/route.ts`, Studio's
`/api/studio/interfaces/[id]/query-policy` and the Query policy card, and the
Test Console's broker run. Migration `20261027000000_query_surface`, with
`backout.sql`.

Three settings: `COREEDGE_QUERY_SURFACE`, `COREEDGE_TOKEN_KEYS` and
`COREEDGE_TOKEN_ACTIVE_KEY` (`.env.example`).

## What it does

A read carrying a **reserved name** (`select`, `filter.<Field>.<op>`,
`orderby`, `key.<Field>`, `count`, `pageSize`, `cursor`, and `expand`,
`filter` and `key` themselves) is on the query surface. Every other read is
the legacy `?limit` read, unchanged.

1. The parameters are parsed before any statement (`params.ts`): a name or a
   value outside the grammar is refused, `400 VALIDATION_ERROR`, before the
   interface is read.
2. The switch, then the ring: with `COREEDGE_QUERY_SURFACE` off, the call is
   refused `QUERY_NOT_AVAILABLE`, rule `NOT_ENABLED`. **Off refuses; it never
   ignores** (a filter that is ignored serves every row).
3. A cursor is opened in memory (AES-256-GCM under the ring, bound to the
   organisation, the credential, the interface and the API version).
4. The grant, with the interface's **compiled query policy** in the same
   statement (3 statements a page, as a legacy read).
5. The query is checked against the policy: what may be read, filtered (with
   which operators), sorted, looked up by key, counted and how large a page
   is. A field or operator the policy does not allow is `400
   POLICY_FIELD_NOT_GRANTED`, with `error.query` naming the rule.
6. CoreEdge builds the OData query itself from the checked request
   (`operation-compiler.ts`, through `buildSapUrl`): no text the caller sent
   reaches SAP except as an encoded literal. Redirects are refused.
7. The page: SAP's rows projected to the policy's fields, cut to the byte cap,
   and a sealed `nextCursor` while rows remain and the run is under its row
   cap. Every call writes one audit row with the query's columns.

A builder edits the policy in Studio (Interfaces, the Query policy card). A
verify of the service writes its **query basis** (what the contract lets a
query do) and recompiles the policy against it.

## The switch, and the guard deploy

`COREEDGE_QUERY_SURFACE` is `off` unless it is exactly `on` (trimmed, any
case). Roll it out in this order:

1. **Merge and deploy with the switch unset.** That first deployment is the
   **guard**: from it on, every rollback target refuses query parameters
   instead of ignoring them (threat N14). The legacy byte guard (413) and the
   `@` envelope fix are live from it.
2. **Measure the legacy cap** on a preview (below), and lower
   `LEGACY_RESPONSE_CAP` in a commit that cites the run.
3. **On Preview:** set the ring, then `COREEDGE_QUERY_SURFACE=on`, and
   redeploy. Run tier 2 if the sandbox key is set, and a 10,000-row paging run
   against the lab (below).
4. **On Production:** set the ring first, then the switch, and redeploy:
   environment variables apply at deployment. The production check
   (`scripts/check-production-env.js`) fails a build that has the switch on
   and no ring, a malformed ring, an active label the ring does not hold, or a
   ring key equal to `NEXTAUTH_SECRET` or to a SAP connection key.

**Kill switch.** Set `COREEDGE_QUERY_SURFACE=off` and redeploy, or Instant
Rollback to the guard deployment. Callers then get `400 VALIDATION_ERROR`,
rule `NOT_ENABLED`; their open cursors stop with it. Legacy reads are
untouched either way.

## The token ring

```
COREEDGE_TOKEN_KEYS="t1:<64 hex>,t2:<64 hex>"
COREEDGE_TOKEN_ACTIVE_KEY="t2"
```

Generate each key with `openssl rand -hex 32`. Labels are `t1`, `t2`, … It is
CoreEdge's own ring, separate from the SAP master-key ring
(`SAP_CONNECTION_ENCRYPTION_KEYS`): a cursor-key incident must not be a
secrets incident. Every use derives its own key from it (HKDF): the cursor's
cipher key, the cursor's last-row tag, and the audit row's per-organisation
query hash. With no ring, development and test derive `t0` from
`NEXTAUTH_SECRET`; production and every Vercel preview never do.

With the switch on and a ring that cannot be read, every query call is
refused `500 INTERNAL` (reason `QUERY_SURFACE_MISCONFIGURED`, `queryRule
TOKEN_RING_UNAVAILABLE`) before the interface is read; legacy reads are
unaffected. The fix is the ring, then a redeploy.

**Rotation:**

1. Add `t(n+1)` to `COREEDGE_TOKEN_KEYS` and deploy. Old cursors still open.
2. Make it active (`COREEDGE_TOKEN_ACTIVE_KEY=t(n+1)`) and deploy. New cursors
   are sealed under it.
3. Two hours later (a paging run's lifetime), remove the old key and deploy.

The audit's `queryHash` names its key (`qh1.<kid>.…`): after a rotation, the
same query hashes differently under the new key. Group by `queryHash` within
one kid.

**Compromise:** remove the kid at once and deploy. Its cursors become
`CURSOR_INVALID` (`queryRule CURSOR_KEY_UNKNOWN`), and callers restart their
runs from the first page. Nothing else is sealed under it.

## Stale and narrowed policies

| What happened | What callers get | What to do |
|---|---|---|
| A verify found a field or operator the contract no longer allows | It is **narrowed away**: the rest keeps serving; a call using it gets `400 POLICY_FIELD_NOT_GRANTED`. The verify's answer, its config audit (`TEST_CONNECT`, `after.queryPolicy.narrowed`) and the Verify panel say what went | Nothing, or the builder reviews the policy |
| A verify found the key changed, SAP newly requiring a filter the policy cannot satisfy, another entity set or OData version, a sampled contract, a singleton, or a basis too large | The policy goes **STALE**: every query is refused `QUERY_NOT_AVAILABLE`, rule `POLICY_STALE` | The builder opens the Query policy card (it shows why) and saves the policy again |
| The interface's contract changed in Studio (dataset, path or version) | The basis and the compiled policy are cleared; the source is kept. Queries get `QUERY_NOT_AVAILABLE`, rule `NO_CONTRACT` | Verify the service: the policy is compiled again |
| The policy was removed | `QUERY_NOT_AVAILABLE`, rule `NO_POLICY` | The builder enables queries again |
| A stored policy cannot be read | `QUERY_NOT_AVAILABLE`, rule `POLICY_UNREADABLE` | The builder saves it again |

A policy edit never bumps the interface's version (that would clear its
captured schema and fixtures). Every save is in the config audit: `UPDATE`,
or `PROMOTE` when it raises the row cap above 10,000, the maximum page above
500, or turns the total count on (`after.widened`). The row cap compared is
the one the save asks for, even on a dataset SAP does not page (where it
compiles to the page size), so a later verify that finds the dataset pageable
never raises the cap past what a `PROMOTE` recorded. A save that narrows an
ACTIVE interface is answered with what it takes away and written only when
the builder confirms it.

## Reading the audit row

Every query call writes one `NorthboundAuditEvent` row, in its usual insert,
with eleven more columns. Legacy reads leave all of them null, except a
`?limit` answer refused by the byte guard (`queryRule RESPONSE_TOO_LARGE`,
`responseBytes` the size it refused).

| Column | Holds |
|---|---|
| `queryKind` | `LIST` (a run's first page), `PAGE` (a cursor page) or `KEY` |
| `queryShape` | The query without its values: `L\|s=*\|f=CompanyCode:eq:S,CreationDate:range[ge,lt]:DT\|o=-CreationDate\|c=1\|n=200`. Never a literal |
| `queryHash` | `qh1.<kid>.<…>`: a keyed hash of the query with its values, per organisation. Equal hashes are the same query (paging run or not); it cannot be reversed without the ring |
| `requestedFields` | The fields that left CoreEdge, or `["*"]` (every readable field) |
| `queryPolicyRev` | The compiled policy's content hash (`qp1:…`): the policy the call was held to |
| `cursorChainId` | One id per paging run, on every page of it, the first included |
| `pageIndex`, `chainRows` | The page's index in its run, and the rows served in the run so far |
| `responseBytes` | The body's size |
| `queryRule` | Why a query was refused, or what SAP's answer was (`SAP_REJECTED`, `UPSTREAM_IGNORED_PAGING`, …). For a cursor, the check that failed (`CURSOR_EXPIRED`, `CURSOR_GRANT_CHANGED`, …), which the caller is never told |
| `queryFlags` | `CUT_BY_BYTES`, `ADAPTIVE_TOP`, `ROW_CAP`, `PROJECTED`, `TOP_NOT_HONOURED`, `SKIP_NOT_HONOURED`, `PINNED_ACTIVE`, `KEY_VIA_FILTER`, `SELECT_DROPPED` |

`failureReason` keeps its meaning (why the upstream call failed, `HTTP_400`
on a `SAP_REJECTED`); a refusal before SAP leaves it null, so the correlation
search attributes it to the request, not to SAP. `PROJECTED` means SAP sent
fields that were not asked for (a service ignoring `$select`): CoreEdge
dropped them. `PINNED_ACTIVE` means a V4 draft-enabled entity: only active
records (`IsActiveEntity eq true`) are served.

## When SAP does not do what was asked

- **`502 UPSTREAM_ERROR`, rule `UPSTREAM_IGNORED_PAGING`** (flag
  `SKIP_NOT_HONOURED`): a page repeated the last row of the page before it,
  or the first row of the run, so the service ignores `$skip`. Retrying will
  not help. The service cannot be paged by offset: the builder sets a page
  size large enough for the dataset, or the service is fixed. A page that returned more rows than
  `$top` asked for is served cut, with `page.stopped: "UPSTREAM_IGNORED_PAGING"`
  (flag `TOP_NOT_HONOURED`).
- **`502 UPSTREAM_ERROR`, rule `KEY_NOT_UNIQUE`**: a key lookup through the
  filter fallback (a key value containing `/` or `\`, flag `KEY_VIA_FILTER`)
  found two records. The service's key is not unique there; escalate to its
  owner.
- **`422 VALIDATION_ERROR`, rule `SAP_REJECTED`** (`failureReason HTTP_4xx`
  or `HTTP_501`): SAP refused the query CoreEdge built. Its text is never
  forwarded. A custom service often supports fewer filters than its
  `$metadata` declares; the builder narrows the policy.

## The circuit rule

A query is shaped by its caller, so SAP's answers to it never count against
the connection's circuit: a 4xx, a 500, a 501, a redirect or an unreadable
body counts nothing. A timeout, a host that cannot be reached, a credential
that cannot be obtained, and a proxy's 502, 503 or 504 still count (decision
D14). A `?limit` read keeps the read's rule.
`docs/runbooks/coreedge-circuit-breaker.md` has the table.

## Conformance: three tiers

- **Tier 1, every PR:** `tests/conformance/odata-query/`, a strict-replay SAP
  written for this repository (V2 and V4), and the injection fuzz with its
  independent oracle (`tests/property/odata-query-injection.property.test.ts`).
- **Tier 2, manual dispatch:** `.github/workflows/odata-conformance-live.yml`
  runs `scripts/odata-conformance-live.ts` against the SAP Business
  Accelerator Hub sandbox with the secret `SAP_API_HUB_SANDBOX_API_KEY`. It
  stores verdicts only (statuses, booleans, envelope key names), compares them
  with tier 1, and on `main` opens an issue when one differs. The V4 target's
  sandbox path is not verified: give it in the run's `targets` input,
  `[{"name":"…","odata":"V4","servicePath":"…","entitySet":"…"}]`.
- **Tier 3, an operator in the lab:** the same cases through the Test Console
  against the X5M lab: a string with a quote (`filter.<Field>.eq=O'Neil`), a
  value with `/` in a key, a negative V2 decimal in a range, a V4
  draft-enabled entity, a server page cap. Record which the stack honoured.
  Their answers settle decision D18 (whether `%XX` text may be allowed) and the
  V2 decimal rule.

Acceptance A4 is met once tier 2 or tier 3 has run once with no verdict
differing from tier 1.

**The 10,000-row run.** `tests/integration/northbound-query-paging-10k.test.ts`
is the CI form (a stub at 1.5 s a page, a virtual clock). Against the lab:
enable queries on an interface with at least 10,000 rows, then page it from a
client that starts a page at most every 1.05 s (or paces by
`x-ratelimit-remaining`), and check that the audit rows share one
`cursorChainId` and that the last `chainRows` is the total.

## Measuring the legacy cap

`LEGACY_RESPONSE_CAP` (`src/lib/northbound/query/page.ts`) starts at
4,718,592 bytes (4.5 MiB), which cannot refuse an answer the platform serves
under either reading of Vercel's "4.5 MB". To set it to the real figure:

```
VERCEL_TOKEN=… VERCEL_SCOPE=<team> pnpm tsx scripts/measure-response-limit.ts
```

It deploys a throwaway function as a preview in your scope, bisects the body
size the platform starts refusing (with an incompressible body and a
compressible one), removes the deployment, and prints the recommended cap:
the largest body served less 16 KiB. Or give `--url` an endpoint you already
have that answers `?bytes=N&fill=random|zeros` with a body of exactly N
bytes. Set the constant in a commit that cites the run. Until then, a `?limit`
answer between the real limit and 4.5 MiB still meets the platform's own 413,
and its audit row says 200.

## Bulk reading

A paging run stops at the policy's row cap (`page.stopped: "ROW_CAP"`, flag
`ROW_CAP`); 10,000 by default, at most 100,000, and raising it is a `PROMOTE`
in the config audit. A caller can restart a run to read more: the bound is
then the credential's 60 calls a minute. Restarted runs of the same query
share a `queryHash` and differ in `cursorChainId`, which is what P3.5's bulk
hold will read; until it ships, watch for many chains with one hash. The
reading of SAP's API policy on bulk extraction behind this is decision D26.

## Rollback and backout

- **Rollback:** the switch `off` and a redeploy, or Instant Rollback to the
  guard deployment (or any later one). Cursors are stateless: nothing to clean
  up.
- **Backout of the migration:** only after the code is rolled back to a build
  that never reads the columns. `pnpm migrations:backout-sql
  20261027000000_query_surface` prints `backout.sql` with its
  `_prisma_migrations` line. It drops every interface's query policy, basis
  and compiled form (builders save the policy again; a re-verify rewrites the
  basis), and the query columns of audit rows written since (the rows stay).
