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

**A re-saved secret is checked against SAP before it is stored**
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
and key) is how its secret is rotated, and the save writes the new secret
unconditionally. So before writing anything, after step-up, the route sends
the new credentials to SAP once and records what SAP answered
(`src/lib/sap-public/rotation-probe.ts`, `rotation.ts`). The setting
`COREEDGE_ROTATION_PROBE` decides what is done with the answer:

| Value | What a probed save does |
|---|---|
| `observe` (default, and any unrecognised value) | Never refused. The save stores what was sent; its response and the Connections form say when SAP refused the new secret ("SAP refused the new password; calls through this connection will fail until it is corrected") or could not check it, and why. |
| `enforce` | Refused (`400 VALIDATION_ERROR`, nothing written, the working secret keeps serving) only when SAP refused the sign-in with the new secret while the stored one is known to work. Everything else saves, as under `observe`. |
| `off` | No probe: the new secret is stored unconditionally. |

**When it runs.** Only when the save replaces an active, directly reached
connection (not `transport: TWIN`) whose stored secret works by the record:
its last Test or nightly probe was `OK`, or a lane proved a read through it
within the lane TTL (24 hours; a re-save drops the lane checks, so such a row
was made with the stored settings), and the save changes the sign-in
credentials (the auth type, the token endpoint or a sealed secret) on the same
system (host and base path, environment, SAP client). Otherwise nothing is sent
to SAP and the save's audit row says why: `new_connection`, `deactivated`,
`tenant_twin`, `last_probe_refused` (SAP refused the stored secret, which is
when it gets rotated), `not_known_working`, `credentials_unchanged` (a label
fix, ticking Allow writes), `repointed` (the old system's record says nothing
about the new one), `probe_off`.

**What it sends.** One request, the Test button's own: the sign-in, and the
probe path's `$metadata`. At the probe path and with the timeout the save
sends, or the stored ones when it sends none (an API caller that leaves them
out still clears them on the row, as before; the probe uses the stored values
because that is where the stored secret was proven). A connection with no
probe path anywhere (ECC, whose product has no default service, without an
API path) cannot be probed: it is `skipped` with `no_probe_path`, saved, and
the form says the new secret could not be checked. The whole probe stops at 40
seconds (`ROTATION_PROBE_DEADLINE_MS`); the token exchange keeps its own
10-second limit. The route declares `maxDuration = 90` (seconds). **Open
item:** confirm the production Vercel plan's function duration limit (roadmap
D11).

**What the answer means** (`probeOutcome` in `rotation.ts`):

- `passed`: SAP served the `$metadata` with the new secret.
- `rejected`: SAP refused the sign-in: the tenant's 401, or its token
  endpoint's 401 or 403. The tenant's own 403 is not a refused sign-in: it
  comes after a sign-in SAP accepted and says the user may not read that
  service, which a correct secret also gets at a service whose `$metadata`
  the communication arrangement does not release.
- `noAnswer`: a request was sent and SAP gave no verdict on the sign-in: a
  timeout, a 5xx, no connection, the tenant's 403 or 404, a redirect, a page
  that is not a metadata document. `reason` says which (`sap_timeout`,
  `sap_http_503`, `token_timeout`, ...).
- `skipped`: nothing was sent (above), or the new credentials could not even be
  turned into a sign-in (`credentials_unusable`).

**Known to work, under enforce.** The stored secret counts as working only
when the record says so (above) and the stored row still opens: a row whose
secret will not open (a keyring mix-up, a restore) cannot be serving, so a
save over it is never refused.

**The record.** Every save's `connection_created` / `connection_replaced`
audit row carries `rotationProbe: { mode, ran, outcome, reason }` (and
`rotationProbes: n` when a save judged again after the row changed probed more
than once). `ran` is true only when a request carrying the new credentials
reached SAP or its token endpoint. A save refused under enforce writes a
`TEST_CONNECT` row `connection_rotation_refused` with the same
`rotationProbe`, never the secret. A probe that reached SAP while the save
then did not happen (a seal failure, a lost race, a refusal when judged again)
is on a `TEST_CONNECT` row `connection_rotation_probed` with `probes`,
`saved: false`, the `reason` and the last `rotationProbe`. Rows written before
wave 2's final review carry `rotationProbed`, `rotationProbeSkipped` and
`rotationProof` instead; nothing reads them, and `rotationProbed: true` on
them did not always mean SAP was called.

**The form keeps what is stored** (wave 2 final review round 3). The
Connections form loads every non-secret setting of the connection being
replaced (label, base URL, environment, SAP client, auth type, token URL,
probe path, timeout) and sends it back unless it is edited, and it names
before Save any stored setting the save changes. Before, it started blank, so
every re-save from the form cleared the probe path and the timeout: the probe
then judged the new secret at another service or with the default timeout,
and refused correct rotations. The sealed values (user, client id, company
id, SAML user, API-key header and every secret) are never readable, so they
are always typed.

**After a rotation, Test it.** A save clears the connection's probe status
(P0.2), so until its next Test or nightly probe the connection is not known to
work, and a second re-save in that window is `skipped` with
`not_known_working`. Press Test after rotating a secret.

### Switching to enforce

`enforce` refuses a save only on SAP's own refusal of the sign-in, so the
first thing to watch is how often that happens to saves that were right:

1. Under `observe`, list the probed saves of the last 30 days:

   ```sql
   SELECT "at", "entityId", "after"->>'key' AS key,
          "after"->'rotationProbe'->>'outcome' AS outcome,
          "after"->'rotationProbe'->>'reason'  AS reason
   FROM "ConfigAudit"
   WHERE "entityType" = 'Connection'
     AND "after"->>'event' = 'connection_replaced'
     AND ("after"->'rotationProbe'->>'ran')::boolean
     AND "at" > now() - interval '30 days'
   ORDER BY "at" DESC;
   ```

2. For every `rejected` row, check what happened next: a correct secret
   re-saved minutes later (a typo caught by the warning) is what enforce
   prevents; a connection whose calls kept working after a `rejected` save is
   a false rejection, and enforce would have refused that save. Do not switch
   while any false rejection is unexplained.
3. Look at the `noAnswer` reasons. They never refuse, but `sap_timeout` on
   one connection again and again means its probe path or timeout is wrong:
   fix them on the connection, so its probes, and its Tests, answer.
4. Set `COREEDGE_ROTATION_PROBE=enforce` and redeploy. Watch for
   `connection_rotation_refused` rows (`action = 'TEST_CONNECT'`) in the first
   days; each one is a save a builder was told to retype.

**If a correct secret is refused under enforce** (SAP refuses the sign-in
while the old secret is still known to work, for example when Basis has not
activated the new password yet): wait until SAP accepts it, or deactivate the
connection, save the new secret, then reactivate it (a deactivated connection
is not probed). Or set `COREEDGE_ROTATION_PROBE=observe` and redeploy.

## What happens on deploy

- The migration adds `SapConnection.transport` with the default `DIRECT` on
  every row. No row changes behaviour.
- The four routes answer and audit exactly as before (the golden test).
- `COREEDGE_CIRCUIT_BREAKER` defaults to `observe`: counted and logged, never
  refused.
- `COREEDGE_ROTATION_PROBE` defaults to `observe`: no save is refused, and no call
  path is affected. A probed save (the new sign-in credentials of an active
  connection that works by the record) sends one request to SAP first and
  takes as long as SAP takes to answer it, never more than 40 seconds plus a
  token exchange; its response and audit row say what SAP answered, and the
  form warns when SAP refused the new secret or could not check it. A save
  that keeps the credentials, re-points the connection, or creates one sends
  nothing.
- The Connections form now loads and sends back the stored non-secret
  settings of the connection it replaces (probe path, timeout, token URL and
  the rest), so a re-save from the form no longer clears them. The API's
  semantics are unchanged: what a caller leaves out is still cleared.
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
