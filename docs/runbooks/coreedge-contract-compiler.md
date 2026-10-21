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
  A create body also names the entity type's navigations, optional, for a
  deep insert (V4: an array or a record, and `<nav>@odata.bind` for a target
  that is not contained; V2: `{ "results": [...] }` or an array, a record or a
  `__metadata` link); the related record itself is an open object, because
  the slice names a navigation's target only.
- **Versions in the documents.** The kit's `info.version` is the compiled
  contract's semantic version with the interface version as build metadata
  (`2.0.0+iface.3`); without a compiled contract it is `1.<interface version>.0`.
  A write interface's `requestSchema` is written from the snapshot that is
  current after the verify, and `/schema` serves it only while that snapshot
  is still the current one.

## Semantic versions

Major: a property, navigation, operation, parameter or enum member removed or
renamed; a type, key or dataset changed; a field newly mandatory, or a
mandatory one added; nullability changed either way; a length, precision or
scale smaller; a capability withdrawn; a filter newly required; a field newly
computed or immutable. Minor: an optional addition, a larger facet, a capability
granted. Patch: labels, quick info, semantics, display formats, PersonalData
annotations, partners, bindings. Closing an open entity type is major; opening
one is minor. A change of source (sampled ↔ compiled), and two sampled
contracts, compare field names only: what a sample happened to observe (a type
only where a value was seen, null only where one was) is not a declaration.
The full list is in `src/lib/contracts/diff.ts`.

Environments are not in step: DEV runs ahead of PROD by transports, and
connections that log on in different languages label the same structure
differently. Each environment is followed along its own snapshots
(`snapshot.ts`): a verify that matches the environment's own newest snapshot,
or a newer one another environment already recorded, records nothing; anything
else is a new version, diffed against the environment's own newest snapshot (or,
for its first verify, the nearest other environment's). Verifying DEV and PROD
in turn therefore records each contract once; an environment going back to an
older contract of its own is still a new version.

## Hostile input

The description comes from a customer's system. `xml.ts` refuses a DOCTYPE
(no entity can be declared, so no expansion and no external fetch), a document
over 8 MB, nesting past 64 levels, more than 400,000 elements or 128 attributes
on one element, and keeps at most 64 KB of text per element. The parser is a
single linear pass (saxes); nothing pattern-matches markup.

What the compiler emits is bounded too, because one declaration can be emitted
many times: every import of an action carries its parameters, so one action
with 3,000 parameters imported 3,000 times was 9,000,000 objects from 300 KB.
Every property, navigation, parameter, enum member, entity set and operation
spends from a budget equal to the element bound, and a description past it is
refused as `TOO_MANY_MEMBERS` (CSDL XML and JSON alike). The slice is refused
(`TOO_LARGE`, reported as `NOT_COMPILED`) once folding base types would give it
more than twice the description's own members plus 10,000, and a contract over
4 MB of canonical JSON is never stored: it would be read back on every
`/schema` call. `tests/unit/contracts/hostile-input.test.ts` has a case for each.

The bounds that hold for any description inside the parser's (hostile-input
review round 1; each asserted in that file, the stored ones in
`tests/integration/contract-snapshots.test.ts`):

- **Compile.** An entity set or singleton name declared twice in one service is
  `INVALID_CSDL` (sets are addressed by name everywhere downstream; N
  same-named sets each copied one annotation target's P paths, N×P, and
  exhausted the heap). The capability property paths an annotation puts on a
  set spend from the member budget. A name (Name, Namespace, Alias, a role,
  partner or constrained property) over 511 characters, or a type reference
  over 1,035, is `INVALID_CSDL`. A refusal or a success in under 5 s.
- **Diff.** A snapshot stores at most 200 changes (the most severe first, the
  rest counted in `omitted`), each `at` and `change` cut to 300 characters:
  under 1 MB whatever the contract.
- **Render.** A starter kit or a solution document carries at most 2 MB of
  compiled contract, added up from `ContractSnapshot.irBytes` (kept at record
  time) before any IR is read; past it the answer is `422 TOO_LARGE`. Every
  document is linear in what it carries: a kit response under 32 bytes per
  contract byte, a solution document under 16, `/schema`'s schemas under 8,
  each in under 5 s; client.ts declares each enum once.

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
- **Which environment's description is the contract of record (open decision).**
  Versions no longer flip between environments (see Semantic versions), but
  the documents, the kit and `/schema` serve the newest version describing the
  interface's service and dataset, whichever environment recorded it: with DEV
  ahead of PROD that is DEV's, so a PROD caller can be shown a field PROD does
  not have yet (harmless in a record, which stays open; a create body is
  closed, and PROD refuses the field). `/schema` at least never serves one
  environment's request body beside another's contract: `requestSchema`
  follows the current snapshot. Options: serve PROD's contract and fall
  back to the highest-ranked verified environment; or serve one per
  environment. A product decision; nothing is chosen here.
- **SuccessFactors' `sap:` namespace URI is not confirmed on a live tenant.**
  SuccessFactors is understood to bind `sap:` to
  `http://www.successfactors.com/edm/sap` rather than SAP Gateway's
  `http://www.sap.com/Protocols/SAPData`; the compiler accepts both (the
  golden SuccessFactors file uses the former). Confirm against the roadmap's SF
  test tenant's `$metadata`; if SF uses yet another URI, add it to
  `SAP_ATTRIBUTE_NAMESPACES` in `csdl-xml.ts`.
- **One snapshot chain per interface.** Two interfaces on the same dataset each
  get their own contract when each is verified.
