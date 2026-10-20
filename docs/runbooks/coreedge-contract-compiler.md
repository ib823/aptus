# Runbook: the Contract Compiler and ContractSnapshot (P1.3)

Roadmap item P1.3 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.3). Code: `src/lib/contracts/`, the `ContractSnapshot` model, the
verify-service, capture-schema, scaffold and northbound `/schema` routes, and
`GET /api/studio/solutions/[id]/openapi`.

There is **no new setting**, and nothing here refuses a northbound call. It
changes what the contract documents say, and where the shape in them comes from.

## What it does

1. **Compiles a service description into a Contract IR** (`compile.ts`). OData
   V2 EDMX, V4 CSDL XML and V4 CSDL JSON, into one shape: entity types and sets,
   keys, properties with type, nullability, length, precision and scale, labels
   (`sap:label`, `Common.Label`), navigations, capabilities (`sap:creatable`,
   `sap:updatable`, `sap:deletable`, `sap:pageable`, `sap:filterable`, … and the
   `Capabilities.*` terms), function imports, actions and functions, and the
   PersonalData terms (`IsPotentiallyPersonal`, `IsPotentiallySensitive`,
   `FieldSemantics`, `EntitySemantics`). V2 `sap:semantics` values that name a
   person (`email`, `tel`, `givenname`, …) are kept as a signal.
2. **Records a ContractSnapshot** when a verify succeeds (`record.ts`,
   `snapshot.ts`): the slice of the IR for the interface's dataset, its sha256
   content hash, its OData version, its source (`METADATA`), and a semantic
   version — 1.0.0 the first time; afterwards the previous one bumped by the
   structural diff (`diff.ts`). The same contract again records nothing.
3. **Writes `requestSchema`** for a write interface: the JSON Schema of the body
   its write sends, stamped with the snapshot and the interface version
   (`x-contract`). A contract change in Studio clears it; the `/schema` route
   serves it only while the stamp matches.
4. **Falls back to sampled rows.** A schema capture also records a `SAMPLED`
   snapshot while no compiled one describes the interface. A compiled one is
   never pushed aside by a capture.
5. **Generates the northbound OpenAPI** in 3.1.0 and 3.0.3 (`openapi.ts`), per
   interface in the starter kit (`openapi.json`, `openapi-3.0.json`) and per
   solution (`/api/studio/solutions/[id]/openapi?version=3.1|3.0`).

Compiling happens at verification time only. The broker's per-call path never
parses a description; `/schema` and the documents read the stored snapshot.

## What existing callers see

- `GET /api/northbound/interfaces/{id}/schema` keeps every field with its old
  meaning. It adds `contract` (`source: metadata | sampled | none`, `semver`,
  `snapshotId`, `contentHash`, `odataVersion`, `compiledAt`, `schemas`).
  `requestSchema`, which was always null because nothing wrote it, is now the
  compiled write body of a verified write interface, else still null.
- `POST /api/studio/interfaces/{id}/verify-service` adds `contract` to its answer
  and to its TEST_CONNECT audit row. A description the compiler refuses still
  verifies exactly as before (the older reader lists the datasets), with
  `contract.status: NOT_COMPILED`; a snapshot that cannot be written answers
  `NOT_RECORDED`. Neither changes `verified`.
- `POST /api/studio/interfaces/{id}/capture-schema` adds `contract`.
- The starter kit has one more file, `openapi-3.0.json`. `openapi.json` now
  draws the operation the interface actually serves: a CREATE interface's
  document describes `POST …/data/write` with its body, headers and errors
  (it used to describe a read that the broker refuses for write interfaces),
  and every document adds `GET …/schema`.
- Interfaces verified before this deploy have no snapshot until they are
  verified again; until then everything reads as it did.

## The documents

- **Paths are what the broker serves.** A READ interface: `GET …/data`. A CREATE
  interface: `POST …/data/write`. Both: `GET …/schema`. The solution document
  adds `GET /interfaces`. Get-by-key, `$filter`/`$select`/`$skip` (P1.4) and
  update/delete (P2.4) are not drawn — a path in a contract file is a promise —
  but `x-coreedge-interfaces[].operations` lists every operation with `served`,
  `allowedBySap` and `grantedIn` (the environments whose approved, bound grants
  cover it). `BROKER_OPERATIONS` in `openapi.ts` is the switch when they land.
- **Headers:** bearer auth; `X-CoreEdge-Write-Key` and `Idempotency-Key` on
  writes; `x-correlation-id`, `X-Request-Id`, `X-RateLimit-Remaining` and
  `Cache-Control` on every answer; `Retry-After` on 429, 503 and an in-flight
  409; `x-coreedge-interface-status` on a draft's read; `Idempotency-Replayed`.
- **Errors:** one `Error` envelope whose `code` enumerates every code the broker
  sends (`northbound-errors.ts`, exhaustive against the `NorthboundErrorCode`
  union at compile time), each response listing the codes it can carry, and
  `x-coreedge-refusal-reasons` naming the internal reasons behind them — every
  P0.11 key-state refusal is one `401 UNAUTHENTICATED` on purpose; P0.1's
  `GRANT_NEEDS_REAPPROVAL` is `403 FORBIDDEN`; P0.5's `TOKEN_*` reasons are
  audit-row reasons behind `UPSTREAM_ERROR`, `UPSTREAM_TIMEOUT` or `FORBIDDEN`.
- **Wire types** follow the service's version: a V2 `Int64`, `Decimal`, `Double`
  or date is a string; V4's are numbers and RFC 3339 strings. A record requires
  only its key and stays open (`additionalProperties: true`) for extension
  fields; write bodies are closed and require only what SAP marks mandatory
  (`Common.FieldControl` Mandatory, SuccessFactors `sap:required`) — never
  what is merely non-nullable, because SAP fills those with initial values.

## Semantic versions

Major: a property, navigation, operation, parameter or enum member removed or
renamed; a type, key or dataset changed; a field newly mandatory, or a
mandatory one added; nullability changed either way; a length, precision or
scale smaller; a capability withdrawn; a filter newly required; a field newly
computed or immutable. Minor: an optional addition, a larger facet, a capability
granted. Patch: labels, quick info, semantics, display formats, PersonalData
annotations, partners, bindings. A change of source (sampled ↔ compiled)
compares field names only. The full list is in `src/lib/contracts/diff.ts`.

## Hostile input

The description comes from a customer's system. `xml.ts` refuses a DOCTYPE
(no entity can be declared, so no expansion and no external fetch), a document
over 8 MB, nesting past 64 levels, more than 400,000 elements or 128 attributes
on one element, and keeps at most 64 KB of text per element. The parser is a
single linear pass (saxes); nothing pattern-matches markup.
`tests/unit/contracts/hostile-input.test.ts` has a case for each.

## Golden tests

`tests/fixtures/contracts/edmx/` holds six descriptions written for this
repository (no SAP `$metadata` is bundled: roadmap §9.1 #17). For each,
`tests/fixtures/contracts/golden/<name>/` holds the IR, the JSON Schemas and
both OpenAPI documents, and both documents are validated against the official
3.1 and 3.0 specification schemas (vendored in
`tests/fixtures/contracts/openapi-spec/`, Apache-2.0). After a deliberate
change, regenerate and read the diff — it is the contract change:

```bash
pnpm vitest run tests/unit/contracts -u
```

## The corpus job (SAP's own descriptions)

`.github/workflows/contract-corpus.yml` runs `pnpm contracts:corpus` weekly, on
demand, and on pull requests that touch the compiler. It fetches 28 S/4HANA
Cloud V2 descriptions from the SAP Business Accelerator Hub sandbox, compiles
each, validates every dataset's read and create documents in both OpenAPI
versions, and reports PersonalData coverage (P1.5's input). It fails when fewer
than 20 compile (`CONTRACT_CORPUS_MIN`), when SAP publishes one the compiler
refuses, or when a document does not validate.

**Nothing is stored.** Descriptions are held in memory and dropped; no
artefact, no cache, and the log and step summary carry only API ids and counts.

**The secret.** `SAP_API_HUB_SANDBOX_API_KEY`: sign in at api.sap.com, open
Settings → Show API Key, and add the value under the repository's Settings →
Secrets and variables → Actions → New repository secret. Without it the job
logs a notice and skips; fork pull requests never receive it. To try another
list, set `CONTRACT_CORPUS_APIS` (comma-separated API ids) on a manual run.

## Dependencies

- **saxes 6.0.0** (runtime; ISC; Louis-Dominique Dubeau; about 160 kB unpacked,
  one dependency, xmlchars). Already in the tree through jsdom and exceljs, so
  the lockfile only gains the direct entry. A strict, namespace-aware,
  single-pass SAX parser that does not process DTDs, so it cannot be made to
  expand or fetch an entity. Hand-writing an XML tokenizer would be a second,
  less-tested parser of hostile input.
- **ajv 8.18.0, ajv-formats 3.0.1** (dev only; MIT; already in the tree through
  webpack's schema-utils). Validate the generated documents against the
  official OpenAPI specification schemas in the tests and the corpus job.
- **Not taken: the OASIS odata-openapi converter [E45]** (0.29.0). It generates
  an OpenAPI for the OData service itself — SAP's paths, `$filter` parameters
  and V4 JSON payloads, with V2 converted to V4 semantics — while CoreEdge needs
  the northbound API (its own paths and envelope) with each version's real wire
  format; the parts that fit (CSDL XML → JSON) are a small share of it. Its
  `odata-csdl` dependency pulls `colors` (the package sabotaged in January 2022)
  and applies no size or depth bound to its input, and its licence is "see
  LICENSE.md" (OASIS). The IR keeps CSDL JSON's semantics, so adopting the
  converter later for the Swagger 2.0 projection (P2.8) remains open.

## Open items

- **The corpus API list is unverified** until the first run with the secret
  (the sandbox was unreachable from the build environment). Adjust the list in
  `scripts/contract-corpus.ts` or with `CONTRACT_CORPUS_APIS` if some ids no
  longer answer; the job needs 20 to compile.
- **abap-openapi [E21] is not run.** It is not published to npm: its README has
  you clone it, `npm ci && npm run transpile` (it pulls `@abaplint/*`) and run
  `node test_v2/index.mjs <openapi.json> <out-dir> <name>` (checked at commit
  `63c3e170d1f2db10039f86a62ed3a73b4c017a71`, MIT). Running a third-party
  generator from a clone in CI is a supply-chain decision for the owner. To
  close the item: pin that commit in a CI job, feed it every golden
  `openapi-3.0.json`, and assert it generates and that `abaplint` passes on
  the output.
- **Which environment's description is the contract of record.** A snapshot
  records the environment and connection whose verify produced it, and the
  newest wins: a DEV service ahead of PROD makes the latest contract DEV's.
  Whether the published contract should follow PROD only is a product decision.
- **One snapshot chain per interface.** Two interfaces on the same dataset each
  get their own contract when each is verified.
