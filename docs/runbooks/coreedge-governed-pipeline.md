# Runbook: The governed pipeline (P0.14)

Roadmap item P0.14 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): extract the governed pipeline and wire the modules already built.

## What changed

**One pipeline, named steps, one refusal table.** The check sequence that was
copied into the northbound read and write routes, the Studio Test Console run
and the Workbench preview now lives once, in `src/lib/governed/pipeline.ts`:

| Step | What it decides | Refusals (HTTP status) |
|---|---|---|
| `authenticate` | The bearer key, and on a write the write key; the signed-in person on a console read | `UNAUTHENTICATED` (401), `WRITE_CREDENTIAL_INVALID` (403) |
| `rateLimit` | The credential's own bucket | `RATE_LIMITED` (429), `LIMITER_UNAVAILABLE` (503) |
| `resolveInterface` | The interface the call names, the write's Idempotency-Key and body, the dataset | `INTERFACE_NOT_FOUND`, `NOT_THIS_SOLUTION` (404); `IDEMPOTENCY_KEY_INVALID`, `BODY_INVALID`, `NO_ENTITY_SET`, `SERVICE_PATH_INVALID`, `SERVICE_UNRESOLVED`, `ENTITY_NOT_YOURS_TO_CHOOSE`, `CUSTOM_SERVICE_UNVERIFIED` (400); `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_IN_FLIGHT` (409) |
| `authorise` | The grant binding: P0.2's `authorisesHere` (`authorisation.ts`, through `access.ts`), the predicate the lane board asks; or the console's ceiling | grant reasons (403), `OPERATION_NOT_SUPPORTED` (400), `SANDBOX_ONLY`, `UNDECLARED_ENVIRONMENT` (403) |
| `bindConnection` | The customer's own connection for the credential's environment and SAP client (P0.2's `bindingFor`, on prefetched or freshly read rows), and its transport | every binding reason (403), `WRITES_DISABLED` (403), `TRANSPORT_UNAVAILABLE` (503) |
| `contain` | The circuit breaker for that SAP system | `CIRCUIT_OPEN` (503, only when enforced) |
| `callSap` | The read or write, through the connection's transport | none: SAP's answer is reported as it was |
| `audit` | One `NorthboundAuditEvent` per call that passed authentication | none |

`REFUSAL_STATUS` in the same file is the one table of reason to status; every
refusal is built from it, so no route can answer a reason with a different
status. Each route keeps its own order, wording and audit rows.

**No behaviour change.** `tests/fixtures/governed-pipeline/golden-audit-rows.json`
was recorded from the four routes before the port (49 scenarios: every
refusal they reach, served calls, SAP failures, replays) and
`tests/integration/governed-pipeline-golden.test.ts` checks the ported routes
against it: status, code, message, Retry-After and every audit row, with `id`,
`at`, `correlationId` and `durationMs` removed.
`tests/unit/governed/refusal-parity.test.ts` drives each route into every
refusal it can reach and checks the table.

**No transaction is held open across a call to SAP.** No step opens one; the
write's idempotency key is reserved and completed in separate statements around
the call. A static test (`tests/unit/governed/pipeline.test.ts`) fails if
`$transaction` appears in the pipeline or a ported route, and since P0.19
`tests/integration/governed-db-budget.test.ts` checks PostgreSQL itself at
every SAP call.

**A database budget per call (P0.19).** In the steady state a read sends at
most 4 statements (today 3) and a write 5, with the occasional statements
that runbook lists on top: `authenticate` reads the key in one statement and
`authorise` reads the interface, its grants and the connections
`bindConnection` binds from in another (`src/lib/governed/call-loads.ts`).
See [`coreedge-db-budget.md`](coreedge-db-budget.md).

**A transport per connection.** `SapConnection.transport` (migration
`20261025020000_sap_connection_transport`, backout beside it) is `DIRECT` or
`TWIN`. `src/lib/governed/transport.ts` defines the minimal `Transport` (a
`fetch`, the credential step that builds the auth headers, and whether it
reaches SAP). `DIRECT` is the platform's fetch and the executors' own
credential step, as before. `TWIN` is the stub the Tenant Twin (P1.6) plugs
into with `registerTwinEngine(engine)`; its credential step builds no headers,
so no OAuth or SAML token is exchanged and the engine sees no credential.
Until an engine is registered a TWIN connection is refused at `bindConnection`
with `TRANSPORT_UNAVAILABLE` and its fetch never reaches the network. Nothing
in the product sets TWIN yet.

**The transport is part of the one predicate** (wave 2 integration review
round 3). `transportRefusal` (transport.ts) is what `bindConnection` asks, and
the lane board, discovery's `callable` and the lane sweep's plan ask it too, so
a lane on a TWIN connection with no engine is drawn refused at binding ("served
by the Tenant Twin"), never Live, and discovery says `callable: false`
(`TRANSPORT_UNAVAILABLE`). And nothing outside the pipeline sends a TWIN
connection's stored credentials to its base URL any more (`reachedDirectly`):
the nightly lane sweep and Re-check skip it (`skippedTwin` in the sweep's
summary), the nightly connection probe skips it, Probe now and a builder's Test
answer 409 and send nothing, the rotation probe does not run on its re-save,
and the Workbench console refuses it at `bind` (503 `TRANSPORT_UNAVAILABLE`,
audited on both trails). Every row is `DIRECT` unless P1.6 or an operator marks
it `TWIN`, so none of this changes a call or a check that works today.

**The circuit breaker is wired.** See
[`coreedge-circuit-breaker.md`](coreedge-circuit-breaker.md).

**A rotated secret is probed before it replaces a working one**
(`src/lib/sap-public/rotation-probe.ts`, `rotation.ts`). See below.

**Operations has a correlation-id search** (`/coreedge/operations`, "Find a call
by its correlation id"), on `src/lib/coreedge/correlation-lookup.ts`. It reads
only the viewer's own organization's rows, shows the call's outcome, the hop it
stopped at, its service, environment, row count and duration, and never a
payload. The hop is read from the row's facts, not its status alone: a row with
a duration, an upstream failure reason or a replay reached SAP; one without
was refused by CoreEdge, at the key (401, 429, the limiter), the request
(400, 409), the connection (a binding refusal, writes disabled, an open
circuit) or the access grant (403, 404), and says nothing was sent to SAP.

**The SAP system screen shows each service's verdict and who fixes it**
(`/coreedge/sap-systems/<id>`, columns "Status" and "Who fixes it"), from
`src/lib/coreedge/service-health.ts`: a sign-in refused goes to the platform
admin, a refused dataset to the client's SAP admin, an unanswered system to the
client's Basis team.

## Probe before swap

Re-saving a connection (POST `/api/studio/connections` with the same product
and key) is how its secret is rotated. When the row being replaced is active and
its secret is working, meaning its last Test was OK, a lane has proven a read
through it (`LaneCheck`), or the save that stored the secret proved one of
those (below), and the save changes the sign-in credentials on the same system,
the route now, after step-up and before writing anything:

1. signs in with the new credentials (a token is issued, or a header built, and
   SAP does not answer 401);
2. reads the service metadata from the connection's probe path (the request the
   Test button sends). Required only when the working secret is proven to read
   it: its last Test or nightly probe was OK, or a proof of these settings is
   still fresh (see "Evidence counts only while it is true"). A probe path
   whose `$metadata` the arrangement does not release (last Test `NOT_FOUND`),
   one that has answered nothing but `TIMEOUT` or `ERROR` for longer than the
   lane TTL, or a connection with no probe path at all (ECC, whose product has
   no default service, without an API path) is not held against the new
   secret, which is then judged by step 3 (with no probe path, step 3 also
   decides the sign-in);
3. reads one row from the dataset proven readable through this connection, as
   the broker reads it. With no proven read there is nothing to compare against
   and this step is not run.

If a step fails the save is refused (`400 VALIDATION_ERROR`, the message says
which step and that nothing changed), a `TEST_CONNECT` config-audit row records
`connection_rotation_refused` and the failed step (never the secret), and the
working secret keeps serving. When SAP did not answer a step (a timeout or a
5xx), the message says so ("SAP did not answer ..."), not that the credential
was wrong. If all pass the secret is stored and the save's audit row says
`rotationProbed: true` (and `rotationProbes: n` when a save judged again after
the row changed probed more than once).

**A probe that passed is on the record even when the save does not happen**
(wave 2 integration review round 3). A passing probe has already sent the new
credentials to SAP. When the save then fails to seal (500), loses its row three
times (409), or is refused when judged again, a `TEST_CONNECT` config-audit row
records `connection_rotation_probed` with `probes`, `saved: false` and the
`reason` (`seal_or_persist_failed`, `conflict`, `refused_when_judged_again`,
`step_up_required`, `rotation_refused`), never the secret.

**The proof outlives the save.** Every re-save clears the probe status and drops
the connection's lane checks (P0.2: they were made with the settings the save
replaced). So the save's audit row records what the stored credentials are
proven to do, `rotationProof: { revision, metadata, read }`, keyed by the
connection revision that save wrote, and the next save reads it back. `read`
names exactly what was read: the interface, its version, the service path, the
entity set and when it was proven. A typo in the save right after a probed
rotation is therefore still probed and refused.

**Evidence counts only while it is true** (wave 2 integration review round 2):

- A proven read (a lane's `LaneCheck` row, or the read a save carried) counts
  only on the terms the lane board uses (P0.2): the row's entity set and
  interface version are the feed's today, it was proven within the lane TTL
  (24 hours: the nightly sweep re-proves every lane still served), the app
  carries traffic (`ACTIVE` or `RESTRICTED`) and the feed is not `DEPRECATED`.
  An edited feed, a retired app, a lapsed lane or a lane row written before
  P0.2 stamped what it read is not held against the new secret: no secret was
  proven on what the broker would read now. The newest row that still counts is
  used.
- A later Test or nightly probe status replaces the metadata proof only when it
  is about the credential: `OK` confirms it, `UNAUTHORIZED` (the secret is
  broken; the probe is then off), `NOT_FOUND` and `NO_PROBE_PATH` (the working
  secret no longer reads the `$metadata` either, so it is not demanded of the
  new one) set it aside. `TIMEOUT`, `ERROR`, `UNREADABLE` and
  `GROUP_UNREADABLE` say nothing about this credential, and the proof stands
  **for the lane TTL (24 hours) from when it was made** (wave 2 integration
  review round 3): a probe that answered OK after the last save on the record,
  or the proof a save carried, still protects the next save for a day. After
  that, a probe path that has answered nothing but `TIMEOUT` or `ERROR` no
  longer shows that the old secret reads its `$metadata`, and a correct new
  secret is not refused for it. Without the limit such a rotation was refused
  for as long as the failure lasted: a Test only writes `ERROR` again.
- `lastValidatedAt` (when a probe last answered OK) counts as a proof of the
  current settings only when it is later than the connection's last save on
  the record (the newest `connection_created` or `connection_replaced` audit
  row). The code before wave 2 never cleared it on a save, so on deploy day a
  row can carry an OK observed with other secrets, other settings or even
  another system. With no save on the record it proves nothing. A carried
  proof keeps the time it was made (`metadataProvenAt`), so carrying it through
  a label fix does not make it fresh.

**A save may wait on SAP.** A probed save makes up to three SAP requests in
series (a token exchange for OAuth, the `$metadata`, one row), so it takes as
long as SAP takes to answer them. The whole probe stops at 40 seconds
(`ROTATION_PROBE_DEADLINE_MS` in `src/lib/sap-public/rotation-probe.ts`): what
SAP has not answered by then is refused as "SAP did not answer" and audited
like any other refusal. The token exchange keeps its own 10-second limit. The
route declares `maxDuration = 90` (seconds) so the platform does not cut the
function off first; the crons already declare 300, so the project's plan
allows it. **Open item:** confirm the production Vercel plan and its function
duration limit (roadmap D11, recorded there as unverified). If the plan's
maximum were below 90 seconds the deploy would say so; the probe itself never
needs more than the deadline plus one token exchange.

Not probed, and saved exactly as before:

- a new connection, a deactivated one, one SAP last refused (last Test
  `UNAUTHORIZED`: the secret is broken, which is when it gets rotated), and one
  with no evidence of working (nothing working to protect);
- a re-save that keeps the sign-in credentials (the auth type, the token
  endpoint and every sealed secret): a label fix, or ticking Allow writes.
  Nothing is sent to SAP, so a SAP outage does not refuse it; the audit row says
  `rotationProbeSkipped: "credentials_unchanged"` and carries the proof forward;
- a re-point: a save that changes the host or base path, the environment or the
  SAP client. The old system's proof says nothing about the new one; the audit
  row says `rotationProbeSkipped: "repointed"`, carries no proof, and the new
  system is proven by its first Test, lane check or nightly probe;
- a connection served by the Tenant Twin (`transport: TWIN`): nothing is sent
  to the customer's SAP from here (above).

**If SAP is down while a secret must be changed** (for example the old password
was revoked at SAP and the host is also unreachable): deactivate the connection,
save the new secret, then reactivate it. Or set `COREEDGE_ROTATION_PROBE=off`
and redeploy; only the exact word `off` turns the probe off.

## What happens on deploy

- The migration adds `SapConnection.transport` with the default `DIRECT` on
  every row. No row changes behaviour.
- The four routes answer and audit exactly as before (the golden test).
- `COREEDGE_CIRCUIT_BREAKER` defaults to `observe`: counted and logged, never
  refused.
- `COREEDGE_ROTATION_PROBE` defaults to on. No call path is affected. It can
  refuse only a save that changes the sign-in credentials of an active,
  proven-working connection on the same system, and does so when the new
  credentials fail to prove what the old ones proved: a mistyped or
  unauthorised rotated secret, or a rotation made while SAP does not answer
  (the message then says SAP did not answer; save again once it does, or use
  the deactivate, save, reactivate path above). A save that keeps the
  credentials, or re-points the connection to another system, is not probed
  and saves as before. A probed save takes as long as SAP takes to answer the
  probe, never more than 40 seconds plus a token exchange (above).
- Rows saved before the deploy (wave 2 integration review round 3): their
  `lastValidatedAt` counts only when it is later than their last save on the
  record and within the last 24 hours, and a probe status of `TIMEOUT` or
  `ERROR` holds a proof for 24 hours at most. So a connection whose probe path
  has answered `ERROR` for longer than that while its lanes serve, the case
  most likely on deploy day, is not refused a correct rotation for its
  `$metadata`; one whose last probe was `OK` is protected as intended.
- Operations and the SAP system screen each gain a section; nothing is removed.

## Rolling back

Code first; the column is never read by the old code. `backout.sql` beside the
migration drops it, which loses nothing (every row is `DIRECT`).

## For P1.6 and P4.1

- P1.6 (Tenant Twin) registers its engine with `registerTwinEngine` and marks a
  connection `transport: TWIN`. The nightly lane sweep, the connection probe,
  Probe now, the Test button, the rotation probe and the Workbench console
  reads call `fetch` and `buildAuthHeadersFromConnection` directly, so they
  SKIP a TWIN connection today (`reachedDirectly`, wave 2 integration review
  round 3) rather than send its request to its `baseUrl` and its client secret
  or SAML assertion to its real token endpoint. A TWIN lane is therefore never
  checked, and with an engine registered it reads "not checked yet" on the
  board. P1.6 decides how a twin lane is proven: route those callers through
  `transportFor(connection)` for both the data request and the credential
  step (`transport.fetch` and `transport.authHeaders`), as the governed read
  and write already do (`tests/unit/governed/twin-transport-credentials.test.ts`
  checks every auth type makes no global fetch).
- P4.1 adds the dispatcher, connector and integration-suite transports on the
  same interface, and moves `sapFetch` and the Ariba connector onto it.
- P0.14b brings the remaining Workbench console routes onto the pipeline.

## The Workbench console (P0.14b)

The preview was the one console route ported here. Since P0.14b every
Workbench route that reaches SAP or Ariba runs the console's version of these
steps (`src/lib/governed/console.ts`: `authorise`, `bind`, `contain`,
`callSap`), as the `console` principal, with a platform-scope audit row beside
the organization's console row, and a new refusal in `REFUSAL_STATUS`,
`HOST_NOT_ALLOWED` (403), for a deployment tenant on a host the SAP host
allow-list refuses under `COREEDGE_ENV_TENANT_HOSTS=enforce`. See
[`coreedge-console-pipeline.md`](coreedge-console-pipeline.md).
