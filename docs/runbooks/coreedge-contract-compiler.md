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
3. **Writes `requestSchema`'s stamp** for a write interface: which snapshot and
   interface version the body its write sends is of (`x-contract`), never the
   body itself — that is a multiple of the contract, and Studio's lists read
   the column. `/schema` renders the body from the stamped snapshot, and only
   while the stamp matches; a contract change in Studio clears it. The lists
   ask whether there is one by id, without reading it.
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
  `contract.schemasOmitted` (`TOO_LARGE`) says why `schemas` is null for a
  contract past the documents' budget.
- `GET /api/studio/interfaces` no longer returns `requestSchema` (always null
  before P1.3); it returns `hasRequestSchema`, as the Studio page does.
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
  The solution document's moves with its interfaces' contracts: one plus the
  majors they gained past 1, their minors (an interface without a compiled
  contract counts its version) plus one per interface past the first, their
  patches, and a digest as build metadata — so a major bump of any interface
  raises the document's major. An interface leaving the document lowers it.
  A write interface's `requestSchema` is written from the snapshot that is
  current after the verify, and `/schema` serves it only while that snapshot
  is still the current one.

## Semantic versions

Major: a property, navigation, operation, parameter or enum member removed or
renamed; a type, key or dataset changed; a field newly mandatory, or a
mandatory one added; nullability changed either way; a length, precision or
scale smaller; a capability withdrawn; a filter newly required; a field newly
computed or immutable; and what a read can now return that the previous
record schema refuses — a member added to an enum (a closed list; a flags
enum is a string and adding to it is minor) or a property added to a closed
complex type. Minor: an optional addition, a larger facet (the record and key
schemas state lengths as `x-odata-max-length`; only request bodies validate
them), a capability granted. Patch: labels, quick info, semantics, display formats, PersonalData
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
more than twice the description's own members plus 10,000, or once the copies
it makes — of base-type properties, and of the parameters every import of an
action carries — exceed 2 MB, and a contract over 2 MB of canonical JSON is
never stored, refused before it is serialised when it cannot be that small:
it would be read back on every `/schema` call.
`tests/unit/contracts/hostile-input.test.ts` has a case for each.

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
  time) before any IR is read; past it the answer is `422 TOO_LARGE`. The
  budget is the stored contract's own bound, so a contract the verify
  accepted is servable on every read path; `/schema` checks it the same way
  and answers `schemas: null` with `schemasOmitted: "TOO_LARGE"` past it.
  Every document is linear in what it carries: a kit response under 32 bytes
  per contract byte, a solution document under 16, `/schema`'s schemas under
  12 and its whole answer under 16, each in under 5 s, asserted at the worst
  shapes (round 2: enum- and complex-typed nullable properties under a
  511-character dataset name, one large complex type, navigations).
  Component names are at most 64 characters plus a type's own (a long
  dataset name keeps its first characters and a hash), each standalone
  schema carries only the types it reaches, and a document over 512 KB is
  served compact; client.ts declares each enum once.

## Structural containment

Three hostile-input reviews each found a new superlinear path, and each was
closed by its own check. That does not converge, so the compiler is now
contained by mechanisms that bound any path, found or not.

**The envelope (`src/lib/contracts/envelope.ts`).** The whole compile — parse,
IR, annotate, slice, canonical digest, the diff against earlier snapshots, and
every render and measurement taken at record time (`pipeline.ts`) — runs in a
`node:worker_threads` worker, one per job, terminated after it:

| Limit | Default | Override |
|---|---|---|
| Old-generation heap | 384 MB (compile), 256 MB (prepare, diff) | `COREEDGE_CONTRACT_HEAP_MB` (16–1024) |
| Young generation, stack | 32 MB, 4 MB | — |
| Wall clock | 15 s (compile), 10 s (prepare, diff) | `COREEDGE_CONTRACT_DEADLINE_MS` (100–60,000) |
| Concurrency | 2 jobs, 16 waiting; beyond that `BUSY` | — |
| One organisation's share | 1 job running, 2 waiting; beyond that `BUSY` at once | — |
| Input | a contract handed in (prepare, diff) ≤ 2 MiB each, measured before it is copied in | — |

Past any of them the worker is terminated and the verify reports the contract
`NOT_COMPILED` with `RESOURCE_LIMIT` (or `BUSY`, `UNAVAILABLE`), while the
verify's own verdict comes from the older readers exactly as before the
compiler existed. The request thread only copies the description in and a
bounded summary out (the dataset names, the version, the one sliced contract
with its digest and rendered sizes — never the whole IR). The log line is
`[contracts] envelope refused { job, reason, ms, cause }`; `cause` is a code
or an error name (`deadline`, `ERR_WORKER_OUT_OF_MEMORY`, `HeapNotCapped`),
never text from the description.

Two things it takes to hold in production:

- **The heap cap survives `--max-old-space-size`.** V8 lets that process-wide
  flag (NODE_OPTIONS often sets it) override a worker's own resource limits:
  a worker asked for 384 MB got the process's 8 GB. So the flag is set to the
  worker's cap while its isolate is created (spawns are serialised for it) and
  put back the moment it is online; the request thread's heap, sized at
  start, is untouched. The worker checks the heap it was given before it runs
  anything, and one past its cap refuses the job (`HeapNotCapped`, refused as
  `UNAVAILABLE`), so a compile never runs uncapped. `--max-semi-space-size`
  overrides the worker's young generation the same way (a process started
  with `NODE_OPTIONS=--max-semi-space-size=64` gave every worker 192 MB of it,
  and every compile was `UNAVAILABLE`), so it is set to 0 ("not set") for the
  same moment and put back to what the process started with.
- **The worker chunk is found and deployed.** webpack bundles the worker as
  `.next/server/chunks/contract-compiler-worker.js`. It resolves the chunk's
  URL with the publicPath, which Next's server bundle sets to the client's
  `/_next/`, so the URL pointed at `file:///_next/…` and every compile in a
  production build was `UNAVAILABLE`; the publicPath is empty for exactly that
  expression. And a worker chunk is outside every route's chunk graph, so the
  function trace left it out: `next.config.ts` includes it for the two routes
  that spawn it (verify-service, capture-schema), and
  `scripts/check-runtime-assets.mjs --built` fails the build if it is missing
  or untraced.

**The output budget (`src/lib/contracts/budget.ts`).** One writer counts every
byte of contract-derived output as it writes it and stops at a stated limit
(`BudgetExceeded`, a typed refusal): the canonical digest streams through it
into the hash, the slice charges each copy to it, and the stored diff,
`/schema`, the starter kit and the solution document are written by it. It
writes exactly what `JSON.stringify` wrote (so every stored content hash is
unchanged). The limits, each proportional to what it is made from and capped:

| Output | Bound |
|---|---|
| Description | ≤ 8 MiB |
| Contract (canonical JSON) | ≤ max(128 KiB, 12 × description chars), ≤ 2 MiB |
| Stored diff | ≤ 1 MiB |
| `/schema` answer | ≤ 64 KiB + 16 × contract bytes, ≤ 16 MiB |
| Starter kit (all files) | ≤ 512 KiB + 32 × contract bytes + 8 × fixture bytes, ≤ 32 MiB |
| Solution document | ≤ 256 KiB + Σ (128 KiB + 16 × contract bytes), ≤ 32 MiB, over contracts and captured schemas adding up to ≤ 2 MiB, for ≤ 254 interfaces |
| Captured schema | ≤ 2,000 fields and 512 KiB, from a request body ≤ 4.5 MiB; read back only while its stored text is ≤ 1 MiB |
| Snapshot history | ≤ 100 rows per interface, plus each environment's newest |

**Rendered at record time.** Before a contract is stored, every read path's
output is rendered from it under that read path's budget, inside the
envelope, as a read interface and as a create interface, under the longest
names an interface and a solution may have. A contract whose outputs would
not fit is refused (`OUTPUT_TOO_LARGE`, reported `NOT_COMPILED`). So every
read renders a contract that was already rendered once, within the same
bytes, in bounded time: the budget a read applies is a function of the size
kept at record time (`irBytes`), and a read that would pass it answers
`TOO_LARGE` (`schemasOmitted` on `/schema`, 422 on the kit and the solution
document) instead of rendering past what was stored.

**The Studio list reads no schema.** `GET /api/studio/interfaces` and the
Interfaces page select neither `requestSchema` nor `responseSchema`; where
each response schema stands is read from its stamp in the database
(`src/lib/studio/response-schema-states.ts`), and the API answer no longer
carries the `responseSchema` column (nothing read it; `responseSchemaState`
is there, as before).

**Structural hardening, round 1.** A review of the containment above found
the paths that ran around it rather than through it; each is now bounded by a
stated limit, at the edge where the input arrives:

- **Captured schemas.** One hostile row of 358,000 distinct short keys (4.4 MB,
  under Vercel's body limit) made an 11.5 MB stored `responseSchema`, seconds
  of inference on the request thread, a sampled contract copied into the
  envelope only to be refused, and an 11.5 MB `/schema` answer on every call
  outside its 64 KB budget. Now `capture-schema` reads its body up to 4.5 MiB
  and no further (`src/lib/security/bounded-body.ts`), refuses a row with more
  keys than a schema could describe before validating it, stops the inference
  past 2,000 distinct fields and refuses a schema past 512 KiB — `TOO_LARGE`,
  nothing stored. On the way out, `/schema`, the kit and the solution document
  learn each stored schema's size from the database first
  (`capturedSchemaFacts`, `octet_length` of its text) and read only one that
  describes the current contract and is inside 1 MiB; `/schema` charges what
  it serves to the same budget as the contract's schemas, and past it answers
  `responseSchema: null` with `responseSchemaOmitted: "TOO_LARGE"`.
- **The solution document** is decided before it is loaded or built: more
  than 254 interfaces, or compiled contracts and captured schemas adding up
  past 2 MiB, is `TOO_LARGE` before any of them is read; then only the
  schemas it renders are read, and the build charges each interface's part to
  the document's budget as it is made, stopping at the interface that passes
  it.
- **Snapshot history.** Each decision reads the one row it needs (the newest,
  an environment's newest, the newest with a hash, the newest describing the
  interface now), each an indexed lookup, whatever the history; and when a row
  is recorded, rows older than the newest 100 are removed, except each
  environment's newest. A description flipping between two contracts no
  longer makes every read slower.
- **The envelope's queue** is shared fairly (above): one organisation's
  hostile service holds at most one slot and two queue places, so another
  organisation's verify still compiles; a wait that times out leaves the
  queue at once.

**Proved in a production build.** `pnpm build` (CI unset; the built check
reports the worker emitted and traced), `pnpm start` with
`NODE_OPTIONS=--max-old-space-size=8192`, and real `POST verify-service`
calls against a local SAP stub (one connection, DEV, client 100), while a
second client polled `GET /api/northbound/versions` every 100 ms:

| Description | Verify answer | Compile | Server meanwhile |
|---|---|---|---|
| business-partner golden (9.6 KB V2) | 200 OK, contract `RECORDED` 1.0.0 | in the worker, < 1 s | every probe served |
| 8 MB CSDL JSON of ~1M members, default limits | 200 (older readers), no contract | ~7 s in the worker, refused there by the member cap | 57/57 probes, max 58 ms, median 17 ms |
| the same, `COREEDGE_CONTRACT_DEADLINE_MS=3000`, 10 times | 200 each, ~3.2 s each | `RESOURCE_LIMIT`, cause `deadline`, each | 26-28 probes each, all served, max 133 ms |
| the same, `COREEDGE_CONTRACT_HEAP_MB=64` (process flag 8 GB) | 200 each, ~2.5 s each | `RESOURCE_LIMIT`, cause `ERR_WORKER_OUT_OF_MEMORY` | all probes served, max 54 ms |

The worker's heap (300+ MB at peak) goes back when it is terminated; ten
compiles in a row, with a GC between them, hold the process's own heap at
24 MB and its RSS at a plateau (no growth per compile). The kit, the solution
document and the Studio list answered 200 from the same server. In-process,
before the envelope, the same 8 MB description held the request thread for
7.4 s.

**The fuzz property test.** `tests/property/contracts-fuzz.property.test.ts`
generates CSDL XML (V2, V4) and CSDL JSON from a grammar with adversarial
weights and asserts, for every case, that the compile never throws, that a
sample — refused descriptions too — gives the same answer in the real
envelope, field by field (compiled or refused alike, the same datasets,
version, dataset hash and size), and that every prepared
contract and every read path stays inside its bound in linear time. CI runs
120 cases; `CONTRACTS_FUZZ_ITERATIONS=5000` (and `CONTRACTS_FUZZ_SEED`) for a
long local run. Run when this landed: 5,000 cases from seed 13 and 3,000 from
seed 2026, inputs up to the 8 MB cap, 6,656 compiled and 14,750 datasets
prepared, every refusal typed, the worst factors seen 2.45 (contract per
description byte), 4.6 (`/schema`), 6.8 (kit) and 2.8 (solution document)
per contract byte beyond each budget's floor — inside every stated bound.

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
