# Runbook: the Contract Compiler and ContractSnapshot (P1.3)

Roadmap item P1.3 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.3). Code: `src/lib/contracts/`, the `ContractSnapshot` model, the
verify-service, capture-schema, scaffold and northbound `/schema` routes, and
`GET /api/studio/solutions/[id]/openapi`.

Two settings: `COREEDGE_CONTRACT_ISOLATES` and
`COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY` (Contract jobs, below). Nothing here
refuses a northbound call. It changes what the contract documents say, and
where the shape in them comes from.

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
   the column. `/schema` serves the body the record rendered and stored on the
   stamped snapshot, and only while the stamp matches; a contract change in
   Studio clears it. The lists ask whether there is one by id, without
   reading it.
4. **Falls back to sampled rows.** A schema capture also records a `SAMPLED`
   snapshot while no compiled one describes the interface. A compiled one is
   never pushed aside by a capture.
5. **Generates the northbound OpenAPI** in 3.1.0 and 3.0.3 (`openapi.ts`), per
   interface in the starter kit (`openapi.json`, `openapi-3.0.json`) and per
   solution (`/api/studio/solutions/[id]/openapi?version=3.1|3.0`).

Compiling happens at verification time only, in a worker (Contract jobs,
below). The broker's per-call path never parses a description; `/schema`
serves texts rendered at record time, and the documents render from the
stored snapshot in a worker.

## What existing callers see

- `GET /api/northbound/interfaces/{id}/schema` keeps every field with its old
  meaning. It adds `contract` (`source: metadata | sampled | none`, `semver`,
  `snapshotId`, `contentHash`, `odataVersion`, `compiledAt`, `schemas`).
  `requestSchema`, which was always null because nothing wrote it, is now the
  compiled write body of a verified write interface, else still null.
  `contract.schemasOmitted` says why `schemas` is null for a contract that is
  recorded: `TOO_LARGE`, past the documents' budget; `NOT_RENDERED`, its
  schemas were not rendered when it was recorded (verify the service again).
- `GET /api/studio/interfaces` no longer returns `requestSchema` (always null
  before P1.3); it returns `hasRequestSchema`, as the Studio page does.
- `POST /api/studio/interfaces/{id}/verify-service` adds `contract` to its answer
  and to its TEST_CONNECT audit row. A description the compiler refuses still
  verifies exactly as before (the older reader lists the datasets), with
  `contract.status: NOT_COMPILED`; a snapshot that cannot be written answers
  `NOT_RECORDED`. Neither changes `verified`. `entitySets` lists the first 500
  dataset names (as many as the interface stores) and `entitySetCount` says
  how many there are; a verify sent while its organisation already has three
  in flight answers `status: BUSY` at once, having asked SAP nothing.
- `POST /api/studio/interfaces/{id}/capture-fixture` refuses a body past
  4.5 MiB with 422 `TOO_LARGE`; the starter kit names a recorded fixture past
  what a kit carries as withheld, too large, instead of loading it. It answers
  503 (busy, or the compiler off) or 429 (the organisation's compiler time
  spent) and stores nothing when the compiler cannot take the capture.
- `POST /api/studio/interfaces/{id}/capture-schema` adds `contract`, and
  answers 503 or 429 the same way.
- The starter kit and the solution document answer 503 (`Retry-After: 5`)
  when the compiler is busy or off, and 429 until 00:00 UTC when the
  organisation's compiler time is spent.
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
  `/schema`'s texts are rendered once, at record time, at most 4 MiB.
  Every document is linear in what it carries: a kit response under 32 bytes
  per contract byte, a solution document under 16, `/schema`'s schemas under
  12 and its whole answer under 16, each in under 5 s, asserted at the worst
  shapes (round 2: enum- and complex-typed nullable properties under a
  511-character dataset name, one large complex type, navigations).
  Component names are at most 64 characters plus a type's own (a long
  dataset name keeps its first characters and a hash), each standalone
  schema carries only the types it reaches, and a document over 512 KB is
  served compact; client.ts declares each enum once.

## Contract jobs

Six adversarial review rounds of an earlier design (a render share, an inline
render clock, per-organisation slots and queues, hourly and daily allowances
and a deployment-wide day) did not converge: each fix added a shared
mechanism the next round attacked, and the last one found the
deployment-wide allowance itself let one tenant deny every other. The design
below replaces all of it with fewer moving parts, against a fixed threat
model: one shared deployment serves many organisations; a builder with a
free BTP trial can serve arbitrary `$metadata` and sample rows from an
allow-listed `*.ondemand.com` host; operators and the platform are trusted.

**Three rules.**

1. **Tenant-supplied bytes are parsed only inside a worker isolate**: a
   description, sampled rows, a fixture body.
2. **`GET …/schema` (and its `/v1` alias) never renders.** It serves texts
   rendered once at record time, from columns on the snapshot row.
3. **The Studio downloads render on demand, only in the isolate**: the
   starter kit (`GET /api/studio/interfaces/[id]/scaffold`) and the solution
   document (`GET /api/studio/solutions/[id]/openapi`), through the same gate,
   charged to the downloading organisation.

**The jobs (`src/lib/contracts/jobs.ts`), one spawn each.**

| Job | Route | In | Out |
|---|---|---|---|
| `record` | verify-service | the description (≤ 8 MiB), the dataset, the previous heads' IR texts (≤ 6, read as `ir::text` once the job holds its slot) | the dataset summary (≤ 500 names and a count), the contract's hash, size and facts, its IR text, the `/schema` texts, and the diffs — only when the hash is not one whose record is certainly unchanged |
| `capture` | capture-schema | the raw request text (≤ 4.5 MiB), the previous heads | the captured schema's text and the small validated fields; the SAMPLED contract made ready as `record` makes one |
| `fixture` | capture-fixture | the raw request text (≤ 4.5 MiB) | the compact body text (≤ 4.5 MiB), the scenario and status |
| `render` | scaffold, solutions/[id]/openapi | the kit's or document's inputs, loaded once the job holds its slot (IRs as `ir::text`, the captured schema under the ≤ 1 MiB stored / ≤ 520 KiB served decision, fixture bodies size-first ≤ 8 MiB, the grants), ≤ 16 MiB (`INPUT_TOO_LARGE` past it) | the kit's files or the document, under its budget (32 MiB caps, 32 KiB per interface, 1,016 interfaces) |

Everything the request thread only stores or sends crosses back as UTF-8
bytes, transferred, and is written as text. **The `/schema` texts** — the
four schemas, and the create and update bodies (or null) — are written by the
one budgeted writer under `schemaLimit` (64 KiB + 16 × contract bytes, at
most **4 MiB together**); past it the contract is refused `OUTPUT_TOO_LARGE`
and nothing is stored. Each record or capture write is **one transaction**:
the snapshot (or nothing, when UNCHANGED), its IR and diff, the texts on the
row `/schema` will serve (when that row is of this contract — an UNCHANGED
verify re-attaches them), the texts nulled on every other row of the
interface, and the write interface's `requestSchema` stamp; a capture's
schema on the interface in the same transaction, or nothing.

**The gate (`src/lib/contracts/envelope.ts`).**

| | |
|---|---|
| Workers at once | `COREEDGE_CONTRACT_ISOLATES` (default 1; 0 turns the compiler off) |
| Per organisation | 1 running, 3 waiting; the 5th job is `BUSY` at once, before anything is loaded |
| Per process | 32 waiting; past it `BUSY` at once |
| Dispatch | a freed slot goes to the waiting job whose organisation was served least recently (never served first; first in, first out on a tie; the map forgets an organisation after an hour) |
| Wait | at most min(10 s, the caller's deadline); then `BUSY`, out of the queue |
| Worker limits | old generation 384 MB, young 32 MB, stack 4 MB, 10 s from spawn (or less: the caller's deadline bounds wait and run together) |
| Order per job | allowance check → queue → load inputs → spawn → result and the worker's exit → slot freed → wall time charged |

A job's slot is free only once its worker has exited (5 s grace, logged), so
live isolates never pass `COREEDGE_CONTRACT_ISOLATES`. The heap cap survives
a process started with `--max-old-space-size` or `--max-semi-space-size`
(V8 lets either override a worker's own limits): both flags are set to the
worker's caps while its isolate is created — spawns are serialised for it —
and put back the moment it is online or has exited; the worker checks the
heap it was given before it runs anything, and one past its cap refuses the
job (`HeapNotCapped`, `UNAVAILABLE`), so nothing runs uncapped. The log line
is `[contracts] envelope refused { job, reason, ms, cause }`; `cause` is a
code or an error name (`deadline`, `ERR_WORKER_OUT_OF_MEMORY`,
`HeapNotCapped`, `input`, `request-deadline`, `allowance`), never text from
the input.

**The verify's fetch gate (`src/lib/studio/service-verify.ts`).** At most 3
verifies of one organisation, and 16 of the process, in flight from before
SAP is asked until the verify has answered, with **no queue**: past either,
`status: BUSY` at once, SAP never asked. A hung SAP holds one of an
organisation's three. The verify has 45 s (`maxDuration` 60): the SAP read
(≤ 8 MiB, ≤ 30 s), then the allowance, the gate and the record job within
what is left, then the writes. When the job did not run (BUSY, the
organisation's time spent, the compiler off, `RESOURCE_LIMIT`), the verify
answers exactly as before the compiler existed — the datasets read by the
older reader in bounded slices on the request thread — with
`contract.status: NOT_COMPILED`, the refusal's own words and
`retryAfterSeconds` where there is one.

**Each organisation's compiler time (`src/lib/contracts/contract-time.ts`).**
One row per organisation and UTC day in `ContractTime`: a job is refused
before it is queued once the organisation has used
`COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY` (default 40; 0 is unlimited), and
every job is charged its wall time from spawn to exit — verify, capture,
fixture, kit and document alike, a job killed at its deadline or heap
included. The refusal says "your organisation has used its N s of contract
compile time for today" and retries at the next 00:00 UTC (downloads and
captures: 429 with `Retry-After`). Rows older than 7 days are deleted by a
charge (at most once an hour per process). There is no deployment-wide sum,
no hour window, no read window, no Upstash and no in-memory store; `/schema`
never touches it.

**What the routes answer.**

| Route | Busy | Time spent | Compiler off | Too large |
|---|---|---|---|---|
| verify-service | `contract: NOT_COMPILED`, retry in 5 s; a 4th concurrent verify of one organisation `status: BUSY` before SAP is asked | `contract: NOT_COMPILED`, its words, retry at 00:00 UTC | `NOT_COMPILED` "compiler disabled" | `NOT_COMPILED` (`TOO_LARGE`, `OUTPUT_TOO_LARGE`, `RESOURCE_LIMIT`) |
| capture-schema, capture-fixture | 503, `Retry-After: 5`, nothing stored | 429 until 00:00 UTC, nothing stored | 503, nothing stored | 422 `TOO_LARGE`; a body past 4.5 MiB has its own message |
| scaffold, solutions/[id]/openapi (deadline 25 s) | 503, `Retry-After: 5` | 429 until 00:00 UTC | 503 | 422 with the input's or the output's message |
| `/schema`, `/v1/…/schema` | never | never | unaffected | `schemasOmitted: TOO_LARGE` past the documents' budget; `NOT_RENDERED` for a current snapshot without texts |

**`/schema` (`src/app/api/northbound/interfaces/[id]/schema/route.ts`).** One
query for the interface, the captured schema through the existing
size-first decision, `currentSnapshotSummaries` (one `DISTINCT ON`, with the
`octet_length` of the three texts), and one `SELECT` of the schemas text and
the one body the current stamp names. The answer is spliced (`RawJson`):
`requestSchema` is the body text with `"x-contract":` and the stamp appended
as its last member — byte for byte what `JSON.stringify({ ...body,
"x-contract": stamp })` wrote. Nothing is rendered or parsed; it imports
nothing that could (`tests/unit/contracts/schema-read-path.test.ts`).

**Settings (two).**

| Setting | Default | Hobby | Pro |
|---|---|---|---|
| `COREEDGE_CONTRACT_ISOLATES` | 1 (0 turns the compiler off: the kill switch) | 1 | 2, on a 4 GB / 2 vCPU function |
| `COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY` | 40 (0 is unlimited) | 40 | 120, or 0 with Spend Management set above normal use |

Upstash stays optional, for the existing rate limiters only.

**Memory on a Hobby function (2 GB / 1 vCPU, Fluid).** The server about
617 MB; one worker at its cap, +402-472 MB of RSS; 16 in-flight descriptions,
≤ 256 MB (8 MiB each, twice as UTF-16); `/schema` transients ≤ 3 × 4 MiB per
read: about 1.4 GB. `tests/unit/contracts/gate.test.ts` holds
768 + ISOLATES × 544 + 16 × 16 ≤ 2,048 for the default.

**Before the first push: a Preview probe (not committed).** Vercel documents
no runtime heap flags (its `NODE_OPTIONS` guidance covers builds; this repo
sets `--max-old-space-size` only for `next build`), so on a Preview deploy
log `process.execArgv`, `NODE_OPTIONS` and a no-op worker's
`v8.getHeapStatistics().heap_size_limit`, then verify one golden and one
worst-case description and read `/schema`, the kit and the document. If the
worker's heap is not capped the jobs fail closed (`UNAVAILABLE`, the verify's
contract `NOT_COMPILED`), never uncapped.

**On Pro.** Set function memory to 4 GB / 2 vCPU (Performance) for the five
spawning routes, then `COREEDGE_CONTRACT_ISOLATES=2`; set
`COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY` to 120, or 0 with Spend Management
set above normal use. Nothing else differs.

**The worker chunk is found and deployed.** webpack bundles the worker as
`.next/server/chunks/contract-compiler-worker.js`, outside every route's chunk
graph (and outside the shared split chunks: `next.config.ts`,
`keepContractWorkerWhole`). Its URL is resolved with an empty publicPath (the
server bundle carries the client's `/_next/`). `next.config.ts` traces it
into the five routes that spawn it — verify-service, capture-schema,
capture-fixture, scaffold and solutions/[id]/openapi (`/schema` spawns
nothing) — and `scripts/check-runtime-assets.mjs --built` fails the build if
it is missing, untraced, or cannot start from what a route's trace ships.

**The output budget (`src/lib/contracts/budget.ts`).** One writer counts every
byte of contract-derived output as it writes it and stops at a stated limit
(`BudgetExceeded`, a typed refusal), writing exactly what `JSON.stringify`
wrote (so every stored content hash is unchanged):

| Output | Bound |
|---|---|
| Description | ≤ 8 MiB |
| Contract (canonical JSON) | ≤ max(128 KiB, 12 × description chars), ≤ 2 MiB |
| Stored diff | ≤ 1 MiB |
| `/schema` texts | ≤ 64 KiB + 16 × contract bytes, ≤ 4 MiB together, rendered at record time |
| Starter kit (all files) | ≤ 512 KiB + 32 × contract bytes + 8 × fixture bytes, ≤ 32 MiB |
| Solution document | ≤ 256 KiB + Σ (32 KiB + 16 × contract bytes), ≤ 32 MiB, over contracts and captured schemas adding up to ≤ 2 MiB, for ≤ 1,016 interfaces |
| Render input | ≤ 16 MiB (`INPUT_TOO_LARGE`) |
| Captured schema | ≤ 2,000 fields and 512 KiB, from a request body ≤ 4.5 MiB; read back only while its stored text is ≤ 1 MiB, and served (by all three readers alike) only while its served JSON is ≤ 520 KiB |
| Recorded fixture | ≤ 4.5 MiB of compact JSON, from a request body ≤ 4.5 MiB; a kit reads fixtures only while their stored text adds up to ≤ 8 MiB, and names the rest as too large |
| Verify's datasets | ≤ 500 names cross back, with their count and whether the interface's dataset is among them |
| Snapshot history | ≤ 100 rows per interface, plus each environment's newest; `/schema` texts on one row per interface |

**The Studio list reads no schema.** `GET /api/studio/interfaces` and the
Interfaces page select neither `requestSchema` nor `responseSchema`; where
each response schema stands is read from its stamp in the database
(`src/lib/studio/response-schema-states.ts`).

**Byte identity.** The goldens and every content hash are unchanged. For
every golden dataset and every fuzz-prepared contract, `/schema` spliced from
the stored texts is f54c6f5a's rendered `/schema`, with and without a current
stamp (`tests/unit/contracts/jobs.test.ts`,
`tests/property/contracts-fuzz.property.test.ts`, against
`tests/helpers/schema-reference.ts`); the kit and the document of every
golden dataset are f54c6f5a's bytes but for the one deliberate change in
every generated OpenAPI document — `schemasOmitted`'s enum, whose
`UNAVAILABLE` (never deployed) became `NOT_RENDERED`
(`tests/fixtures/contracts/golden/read-paths.f54c6f5a.json`).

**The fuzz property test.** `tests/property/contracts-fuzz.property.test.ts`
generates CSDL XML (V2, V4) and CSDL JSON from a grammar with adversarial
weights and asserts, for every case, that the compile never throws; that a
sample — refused descriptions too — gives the same answer as the record job
in the real envelope and in process, field by field; that every dataset is
made ready to record inside its budgets or refused for a stated one; that its
`/schema` is f54c6f5a's byte for byte; and that the kit and the document
render under their budgets or are refused there, in linear time. CI runs
120 cases from seed 13 (deterministic); `CONTRACTS_FUZZ_ITERATIONS` and
`CONTRACTS_FUZZ_SEED` for a long local run.

### Accepted risks

Each with its bound; closing it would cost more code and attack surface than
it prevents.

- **R1. Sybil organisations against Hobby's 4 CPU-hours a month.** One
  hostile organisation spends at most 40 s a day of worker wall time, about
  0.34 CPU-hours a month (about 9% of the quota); k organisations, k × 0.34:
  about 12 sustained for a month exhaust the quota from compiles alone — and
  the same organisations could spend it through ordinary routes anyway.
  Mitigations: Vercel usage notifications, `COREEDGE_CONTRACT_ISOLATES=0`, Pro
  Spend Management, and signup controls (outside P1.3).
- **R2. Queue delay.** A job waits at most (distinct organisations ahead) ×
  10 s, and past its caller's wait it is `BUSY`; one hostile organisation adds
  at most 10 s.
- **R3. `/schema`'s request-thread cost.** A ≤ 4 MiB text select and splice
  (a copy, no escaping), plus the captured-schema read (≤ 1 MiB parsed, about
  10-15 ms), at the northbound rates (60 a minute per credential, 300 per
  IP).
- **R4. Request-thread copies.** A verify holds ≤ 8 MiB of description, ≤ 16
  per process; a kit or document loader copies ≤ 16 MiB per job, one per slot
  (the record and capture loaders ≤ 6 head IRs, likewise); a capture holds
  ≤ 4.5 MiB of text.
- **R5. CPU sharing.** On 1 vCPU one job shares the CPU with the request
  thread for ≤ 10 s.
- **R6. Allowance overshoot.** An organisation's concurrent jobs, each
  checked before it is queued, can overshoot its day by ≤ 4 × 10 s.
- **R7. `NOT_RENDERED` after an interface is pointed back to an earlier
  dataset without a re-verify.** The earlier row lost its texts to the newer
  one. Fix: verify again.
- **R8. Storage.** Texts ≤ 4 MiB per interface; IR history as before. There is
  no organisation storage quota; that gap predates this change.
- **R9. Vercel's runtime heap flags are unverified.** The jobs fail closed
  (`UNAVAILABLE`, the verify's contract `NOT_COMPILED`) rather than run
  uncapped; the Preview probe above checks it.
- **R10. Product-visible changes.** A contract whose `/schema` texts pass
  4 MiB is refused `OUTPUT_TOO_LARGE` at record (real contracts: the goldens
  2-11 KB of texts, an EmpJob-sized one about 170 KB; a write interface's
  texts are about 5 × its schema, so an unlabelled 8,000-field dataset is past
  it). A contract whose kit or document passes its budget is now recorded
  and refused only at download. A 4th concurrent verify of one organisation
  is `BUSY` at once. A kit or document download costs about 0.1-0.2 s of the
  organisation's allowance and one spawn. Two verifies of one interface
  recording different contracts at the same moment: one records, the other
  answers `NOT_RECORDED` ("verify again"), its diffs having been taken
  against heads that moved.

### Review findings S1-S39

The 39 findings of the six review rounds, as this design disposes of them.
Kept fixes: S1 (`/schema` serves a captured schema only through the
size-first decision, R3), S3 (the document decided from SQL sizes before any
load, rendered only in the worker), S4 (history and heads bounds; texts on one
row), S5 (one gate, simplified), S6 (the flag swap and `HeapNotCapped`; R9),
S7 (fuzz parity, now against the record job), S9 (release on exit), S10 (one
servable decision), S11 (32 KiB per interface, 1,016 interfaces), S12 (the
body-size message), S13 (the bounded summary and the sliced fallback; the
verify turn became the fetch gate), S14 (slot-first loading; `/schema` loads
no IR), S15 (fixture caps, size-first reads), S16 (chunk tracing for the five
spawning routes), S17 (render input 16 MiB), S21 (texts across the boundary),
S22 (the fetch gate, never queued), S23, S25 (the 45 s budget clamps wait and
run, one job per verify), S26, S28 (transferred bytes written as text; the
diff in the same job), S29, S32 (a per-organisation daily wall-time allowance
in Postgres, no deployment day; R1), S38 (the CPU-time stall measure).
Closed by design: S2 (capture parses, infers and records in the job), S8 and
S20 (`/schema` never renders; the downloads render only in the isolate), S18
and S19 (no render share, no inline share), S24 (live isolates ≤
`COREEDGE_CONTRACT_ISOLATES`), S27 (capture-fixture parses in the job), S31
(capture is atomic; the kit budgets from what it renders), S33 (no
deployment-wide counter), S34 (least-recently-served dispatch), S35 and S36
(refusals name the organisation and 00:00 UTC; busy says seconds), S37 (no
shared day; wall time from spawn to exit, about 0.1 s for a golden job, so
40 s is about 400 jobs a day), S39 (northbound reads never run a job or
spend anything). Residual: S30 (R5's deadline: whether a contract is recorded
depends only on byte caps and the 10 s deadline, about 5× a real 8 MiB
description's 1.8 s).

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
refuses, when a document does not validate, or when a dataset's `/schema`
texts would pass the 4 MiB a record stores (it reports the largest).

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
