# PR-5 — the ten backend capabilities

The handoff's section 6 is titled *"Behaviours the designs assume and the backend
does not have."* The audit measured the code and found that is not quite true:
**two already exist, four were partial, three were absent**, and one is not a
repository change at all.

So PR-5 closes measured gaps rather than rebuilding what is there.

| # | Capability | Audit | Outcome |
|---|---|---|---|
| 1 | One-time claim link | absent (F22) | **built** |
| 2 | CLI `coreedge pull` | not audited | **not this repository** |
| 3 | Rate limiting | **exists** (F23) | verified — no work |
| 4 | Circuit breaker | absent (F24) | **built** |
| 5 | Scheduled checks + 24 h TTL | partial (F19) | **TTL built** |
| 6 | SAP host allowlist | partial (F25) | **allow-list built** |
| 7 | Probe-before-swap rotation | absent (F26) | **built** |
| 8 | Write access + checklist | **exists** (F27) | verified — no work |
| 9 | Correlation ID lookup | partial (F21) | **index + lookup built** |
| 10 | Per-service health matrix | partial (F20) | **built** |

---

## 1 · One-time claim link

**The ordering is the guarantee.** Nothing exists before the link is opened — no
`SolutionClient` row, no token, no hash. `createClaimLink` writes a
`KeyClaimLink` and nothing else; the key is minted inside the claim.

An expired link issues **nothing**, because there is no key behind it to leak, to
find in a backup, or to hand to whoever opens the URL next. Minting up front and
merely revealing would make *"shown once"* a UI convention described as a
guarantee, and the lane state after expiry a lie — the lane would read "no key"
while a working credential existed.

The test asserts `createClaimLink` contains no reference to `solutionClient` or
`generateClientToken` **at all**, because if it ever did the guarantee would be
gone and every other assertion would still pass.

Opening is an atomic compare-and-set: `updateMany` guarded by `claimedAt: null`
inside a transaction. Two people opening the same URL produce one key; the second
is refused. Checking and then updating would be a race.

Every refusal reads the same to the holder — wrong, expired, spent and revoked
are one sentence — for the reason the broker answers one uniform 401 to six token
failures.

### Two bugs caught in the writing

- `createdById` was set to an **organization id**: a foreign key to a user that
  does not exist. The person who *sent* the link owns the resulting key; the
  opener may not be a user of this system at all.
- The page was first placed under `(coreedge)`, **whose layout redirects
  anonymous callers** — which would have made the link undeliverable to exactly
  the person it is for. It lives in `(external)`, the repo's existing TOKEN
  group, and gets its own `/claim/` entry in `WORKBENCH_PATHS`: the `/coreedge`
  prefix does not cover it, as PR-4 noted before this existed.

## 3 · Rate limiting — already there

`RATE_LIMITS.northbound` is **60 per minute per key**, keyed by client credential
rather than IP, enforced immediately after auth and **before** grant resolution
or any SAP call, returning 429 with `retry-after` and auditing the refusal.

That is exactly what the design specifies, including the part the status depends
on: *"Nothing was sent to SAP"* is true because the check runs before anything is
sent. Rebuilding it would have been waste.

## 4 · Circuit breaker

### A 403 is not a failure

The decision the whole component turns on. SAP signed us in, understood the
request and said no — **one lane's authorisation problem, not a sick system.**
Counting it would take every other lane on that system down with it, and would
attribute the outage to the client's Basis team when it belongs to their SAP
admin. A refusal does not clear a run of real failures either: it says nothing
about health in either direction, so it moves nothing.

**Half-open lets exactly one call through.** Letting the backlog through the
moment the cooldown expires slams a recovering system with the load that broke
it. A failed probe re-opens with a **fresh** cooldown rather than counting back
up to the threshold — the system has just demonstrated it is not ready, and four
more calls to prove it is the amplification the breaker exists to stop.

### ⚠️ In-process, and it says so

State lives in module scope, so each instance keeps its own view: on N instances,
up to N probes reach a failing system per cooldown. `snapshot()` is named as one
instance's view, because presenting in-process state as fleet-wide is the same
class of lie the audit found elsewhere — a sampled figure rendered as a total.
The shared version needs the same Redis the rate limiter already falls back from.

## 5 · The TTL that was never written

The prober existed. The **comparison** did not — the audit's words: *"no code
compares lastValidatedAt against a maximum age and no status decays to stale or
unknown."* So a connection probed in March still read green in September, and
green meant *"it worked once"* rather than *"it worked recently."*

- **"Never looked" and "looked a while ago" stay different answers.** Collapsing
  them makes a brand-new connection look neglected.
- **The absence is ours.** An operator who reads `Unknown` as "SAP is down" wakes
  the client's Basis team over a cron that did not run.
- **No "just now" shortcut.** A claim that something was proven "just now" when
  it was proven fifty seconds ago is a small lie in the one place this product
  cannot afford one — every status is rendered with an age.
- **A future timestamp reports clock skew** rather than inventing a number.

### ⚠️ A disagreement between sources

A5 gives the catalogue badge a **30 day** TTL; the handoff's capability row says
**7 days**. Taken as 7 — the tighter of the two, and the one stated as a
requirement rather than as an observation. Recorded rather than resolved
silently.

## 6 · SAP host allow-list

The audit named it exactly: *"Validation is a DENY-list… any other https host may
be saved — there is no positive list of SAP domains."*

The test that matters: **`https://sap-s4-prod.attacker.example` passed every
check that existed** — https, not localhost, not an IP literal, and it reads like
an SAP system.

**The position in the Zod chain is the security property.** Refinements run
during parse, before the handler touches the database, so a host that is not
SAP's is refused **before any credential is stored**. Validating after storage
means the mistake has already happened and revoking becomes a cleanup job rather
than a refusal.

Suffix matching is anchored on a leading dot, so `ondemand.com` admits
`my-tenant.s4hana.ondemand.com` and refuses `evil-ondemand.com` — the classic
suffix bug. The deny-list still runs first, so a future entry that is too broad
cannot re-admit localhost. `SAP_HOST_ALLOWLIST_EXTRA` adds private landscapes,
because a security control that cannot be configured gets removed rather than
configured; **there is no value that turns it off**, because an off switch is
what gets left on.

## 7 · Probe before swap

`upsertSapConnection` writes the new secret unconditionally — save, then test. A
mistyped password takes **every lane on that system** down until someone notices,
and the person who typed it finds out from an outage rather than from a form. The
design's claim on that screen is "no downtime", and save-then-test cannot make
it.

The order is the capability: sign in with the **new** secret while the old still
serves → read metadata → read one row → swap only if every step passed.

**Why a data read and not just a sign-in:** a communication user can authenticate
and still be unauthorised for every entity set — the most common failure in this
system. A rotation that probes only the sign-in swaps in a credential that
authenticates and cannot read, and reports success.

**A step that never ran is not a step that failed.** If sign-in fails there is
nothing to say about metadata, and reporting it as failed sends the reader to the
wrong place.

Every refusal leads with *"Nothing changed."* The person has just mistyped a
production password, and the thing they are most afraid of is exactly what did
not happen.

### The grace window is not the overlap `issue.ts` refuses

That module says of the northbound client token: *"an overlap window is exactly
how a leaked credential survives its own rotation."* That is right, and this is a
different situation. A client token is an app's credential **to us**, and we
decide when it stops working — an overlap is a decision to keep accepting a
possibly-leaked secret. A connection secret is **our** credential to SAP, and SAP
decides which passwords work; keeping our copy for five minutes does not extend
the old secret's life by one second. It only lets a call that already read the
old value finish.

## 8 · Write access — already there

The audit found the write path, what authorises it, and the approval record all
present (F27). The four-condition checklist is a UI contract, rendered in PR-4's
review screen.

## 9 · Correlation ID lookup

Generated, returned and stored — and **unqueryable**: no index on
`correlationId`, no endpoint accepting it as a filter. So *"a builder pastes one
id and gets an answer"* meant a sequential scan or a log grep, and log-grepping
needs access nobody outside operations has and returns lines rather than facts.

`organizationId` leads the index, so the lookup is **tenant-scoped by
construction** rather than by a filter someone can forget to add.

**The answer carries no payload**, and most of the test effort is there. An audit
trail that leaked payloads would be its own incident — a worse one than the
problem it solves, because it would be systematic, retained and queryable by id.
It returns a row **count**, which is a fact about the call; what those rows
contained is the customer's data.

*"Wrong id"* and *"aged out"* are separate outcomes because they send the reader
to different places, and the miss path runs no second scan — a count over the
whole table to explain a miss is exactly the scan the index exists to avoid.

## 10 · Per-service health matrix

The distinction existed in code; only metadata reachability was **persisted**.
Readability lived in a short-TTL request cache, a deployment-scoped blob keyed by
tenant rather than connection, and in `NorthboundAuditEvent.rowCount` as a side
effect of real traffic. Nothing joined them.

**The consequence is the capability:** *"One green dot per system sends half of
all triage to the wrong person."*

| Fact | Owner | Blast radius |
|---|---|---|
| metadata 401 | Platform admin | **Every** lane on the system |
| read 403 | Client SAP admin | **One** lane |

Same colour on a dashboard, opposite phone calls. A test asserts they never
resolve to the same owner.

**The unit is the service, not the connection** — a system can serve one entity
set and refuse another, so a per-connection verdict averages things that are not
alike. `EMPTY` is stored as the success it is: folding it into a failure is the
single most common way this product could lie about a healthy lane.

A dataset **404** reports `Unknown` with the real reason rather than `SAP
refused`, because PR-2 found the eighteen statuses have no chip for it and the
nearest is explicitly a 403 — which would send the user to their SAP admin over
something a different dataset would fix.

---

## 2 · The CLI — not a change to this repository

`coreedge pull` authenticates as the app owner and writes the key into the local
environment. It is a **separate distributable** — a published npm package or
binary with its own release process — and nothing in this repository would
contain it.

Its copy therefore stays blocked. `COPY_BLOCKED_ON_BACKEND` is now exactly
`["coreedge pull"]`: the claim-link phrases came off the list because capability
1 landed, and a test greps `src/` to keep the CLI's out until it exists. Shipping
the link alone makes every "or" in that copy false.

## What this PR does not do

**It builds the capabilities; it does not yet rewire PR-4's screens onto them.**
The lane derivation still returns `Unknown` for want of a per-lane read ledger,
and `SapServiceHealth` is the table that ledger belongs in. Joining them is a
focused follow-up with its own before/after, and folding it into a PR that
already carries three migrations would make both harder to review.

Also deliberately absent: the `@@index` on `KeyClaimLink.claimedClientId`, the
retention sweep for `NorthboundAuditEvent` (the audit noted nothing deletes it —
that is a separate decision with a compliance dimension), and the operator UI for
closing a circuit early.

## Files

| Added | |
|---|---|
| `src/lib/northbound/claim-link.ts` | Mint on open, once |
| `src/app/(external)/claim/[token]/page.tsx` | The claim surface |
| `src/lib/coreedge/freshness.ts` | The TTL comparison |
| `src/lib/studio/sap-host-allowlist.ts` | Positive host list |
| `src/lib/northbound/circuit-breaker.ts` | Per-system breaker |
| `src/lib/coreedge/correlation-lookup.ts` | Exact-match lookup |
| `src/lib/sap-public/rotation.ts` | Probe-before-swap decision |
| `src/lib/coreedge/service-health.ts` | Per-service verdict + owner |
| `tests/stubs/server-only.ts` | Makes server modules testable under vitest |
| 3 migrations | `KeyClaimLink`, correlation index, `SapServiceHealth` |
| 6 test files | 81 assertions |

| Changed | |
|---|---|
| `prisma/schema.prisma` | Two tables, one index |
| `src/app/api/studio/connections/route.ts` | Allow-list in the parse chain |
| `src/lib/routing/workbench-paths.ts` | `/claim/` |
| `src/lib/coreedge/copy.ts` | Claim-link phrases unblocked |
| `vitest.config.ts` | `server-only` alias |
