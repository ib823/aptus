# CoreEdge northbound API changelog

What changes for an application that calls the CoreEdge northbound API
(`/api/northbound/v1/*`, or the original `/api/northbound/*`), newest version
first. The policy behind it is in the developer guide
(`docs/coreedge-developer-guide.md`, *API versions and deprecation*).

The same changelog is served as JSON, with no credential, at
`GET /api/northbound/versions` (also `/api/northbound/v1/versions`). Both are
built from `src/lib/northbound/version-policy.ts`;
`tests/unit/northbound/version-policy.test.ts` fails if this file and the
registry disagree on a version or a date.

## How to read a version

- **Version** is a month, `YYYY-MM`. Send it as `CoreEdge-Version: 2026-10` to
  pin it. Every response names the version that served it in the same header.
- **Released** is the day it became available.
- **Deprecated** is the day its deprecation takes effect. From the day it is
  announced, every response it serves carries `Deprecation` (RFC 9745).
- **Announced** is the day the deprecation and its Sunset were published: the
  day that change deployed, and the day `Deprecation` and `Sunset` first
  appeared. The 6-month notice is counted from it.
- **Sunset** is the day it stops being served. Every response it serves
  carries `Sunset` (RFC 8594) from the day that date is announced. From that
  day a request pinned to it gets `400 UNSUPPORTED_VERSION`, and an unpinned
  request is served the next supported version.
- `—` means not set.

Additive changes (a new route, a new optional request header or parameter, a
new response field or header) ship into the current version and are listed
under it with their date. Breaking changes ship only as a new version.

## 2026-10

- Released: 2026-10-24
- Deprecated: —
- Announced: —
- Sunset: —
- Status: supported, and the default for requests that do not pin a version.

The northbound API as it was served before versioning, named. Nothing a caller
sends or receives changed, except the additions marked *Added*.

- Routes: `GET /interfaces`, `GET /interfaces/{id}/schema`,
  `GET /interfaces/{id}/data?limit=N` (1 to 100, default 10) and
  `POST /interfaces/{id}/data/write` (needs `X-CoreEdge-Write-Key` and
  `Idempotency-Key`).
- Served at `/api/northbound/v1/*` and, unchanged, at `/api/northbound/*`.
  Both paths are one implementation.
- *Added:* every response carries `CoreEdge-Version`. A request may pin a
  version with the same header; an unknown or retired version is refused with
  `400 UNSUPPORTED_VERSION`, naming the supported versions.
- *Added:* `GET /versions`, this changelog as JSON. No credential needed.
- Credentials: keys minted from P0.11 start `ce_live_` (PROD) or `ce_test_`;
  keys minted before start `ce_` and keep working until they expire. The
  prefix is never read to authenticate.
- Rate limits are per credential (60 reads and 60 writes a minute) with an
  address backstop: `429 RATE_LIMITED` or `429 RATE_LIMITED_ADDRESS`, and
  `503 LIMITER_UNAVAILABLE` when the limiter cannot be asked. A call no
  per-credential limit covers (`GET /versions`, or one with no
  `Authorization` header) meets the per-address `429 RATE_LIMIT_EXCEEDED`.
- *Added:* the edge's per-address `429 RATE_LIMIT_EXCEEDED` and its `503
  LIMITER_UNAVAILABLE` carry `correlationId`, `x-correlation-id` and
  `cache-control: no-store` on the northbound paths, like every other answer.
  The code is unchanged.
- A grant authorises the one interface it was approved for (P0.1).
- *Added:* `GET /interfaces/{id}/schema` also returns `contract` (where the
  contract came from, its semantic version and its JSON Schemas), and
  `requestSchema`, null until then, is the compiled body of a write
  interface's record once its service is verified (P1.3). Every field that was
  there before means what it meant. The starter kit's `openapi.json` and
  `openapi-3.0.json` describe the `CoreEdge-Version` header, `400
  UNSUPPORTED_VERSION` and both base paths. Generated kits and documents
  still point at `/api/northbound`, which every deployment serves; they
  move to `/api/northbound/v1` in a later release, once a deployment that
  serves it is the one a rollback would return to.
- *Added:* `GET /interfaces/{id}/schema` also counts against an
  organisation-wide budget: 120 reads a minute across all of the
  organisation's credentials, beside each credential's own 60 (P1.3). Past
  it the answer is `429 RATE_LIMITED` with `Retry-After`, and its message
  says it is the organisation's credentials together, not this one: slowing
  this key alone does not help. The code is unchanged.
- *Added:* `GET /interfaces/{id}/data` and `POST /interfaces/{id}/data/write`
  may answer `503 CIRCUIT_OPEN` with `Retry-After` when the customer's SAP
  system has failed to answer several calls in a row and the deployment
  enforces its circuit breaker (P0.14; by default it only observes, and sends
  nothing new), and `503 CONNECTION_NOT_CONFIGURED` when the connection for
  the credential's environment is served by a Tenant Twin the deployment does
  not have. Nothing is sent to SAP; a refused write releases its
  `Idempotency-Key`. The generated OpenAPI documents name both.
- *Added (P1.4):* `GET /interfaces/{id}/data` serves **queries** where the
  interface's query policy allows them and the deployment serves them
  (`COREEDGE_QUERY_SURFACE`, off by default). The reserved parameter names
  are `select`, `filter.<Field>.<op>` (`eq`, `in`, `gt`, `ge`, `lt`, `le`;
  ANDed across fields), `orderby`, `key.<Field>`, `count`, `pageSize` and
  `cursor`, and `expand`, `filter` and `key` themselves, which are refused
  rather than served. A query's 200 keeps the `?limit` envelope's keys, in
  their order, and adds `page` (`index`, `size`, `rowsServed`,
  `nextCursor`, `complete`, `stopped`) and, with `count=true` on the first
  page, `totalCount`; a key lookup answers one record and no `page`. Page on
  `page.nextCursor`, sent with the same other parameters. A query's answers
  also carry `x-ratelimit-limit`, `x-ratelimit-remaining` and
  `x-ratelimit-reset` (seconds). The per-solution OpenAPI document lists each
  interface's own parameters by name.
- *Added (P1.4):* three codes. `400 POLICY_FIELD_NOT_GRANTED`: the query asks
  for a field, operator, count, key lookup or page size the interface's
  query policy does not allow, or leaves out a filter it requires. `409
  CURSOR_STALE`: the cursor expired (15 minutes, within a paging run of 2
  hours), or the interface, its policy, its grant or its connection changed
  since the first page. `404 RECORD_NOT_FOUND`: a key lookup found no record.
  A refusal and a query outcome carry `error.query` beside `code`, `message`
  and `correlationId`: the `rule`, and the `parameter`, `field` and up to 20
  `allowed` names when they are safe to repeat. `VALIDATION_ERROR` is also
  sent as `422` when SAP refuses a query CoreEdge built (`rule
  SAP_REJECTED`), when one record is larger than the page limit, or when
  SAP's page is larger than CoreEdge reads, and as `413` for a `?limit`
  answer larger than CoreEdge can return (`rule RESPONSE_TOO_LARGE`).
- *Changed (P1.4), by refusing what was ignored:* a `?limit` read that also
  carries a reserved name (for example `?select=A&limit=5`, or a cache buster
  named `filter`) was served with that name ignored; it is now refused with
  `400 VALIDATION_ERROR` and `error.query.rule` (`NOT_ENABLED` while the
  deployment serves no queries, `NO_POLICY` on an interface with no query
  policy, `UNKNOWN_PARAMETER` for `limit` beside query parameters). A filter
  that is ignored serves every row; a refusal never does. A read with none
  of these names is unchanged, `$`-prefixed names included, which `2026-10`
  keeps ignoring on `?limit` reads.
- *Fixed (P1.4):* a `?limit` read too large for the platform's response
  limit answered the platform's bare 413 after CoreEdge had audited it as
  200; it is now refused `413 VALIDATION_ERROR` in CoreEdge's own envelope,
  with a correlation id, and audited 413. Every other `?limit` answer is the
  same bytes as before. And OData 4.01 control information (`@id`,
  `@editLink`, `nav@navigationLink` and any other key containing `@`) is
  stripped from records like `@odata.*` already was.
