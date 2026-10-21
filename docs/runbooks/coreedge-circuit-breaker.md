# Runbook: The circuit breaker (`COREEDGE_CIRCUIT_BREAKER`)

Roadmap item P0.14 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). The breaker is the governed pipeline's `contain` step
(`src/lib/governed/pipeline.ts`, `src/lib/governed/containment.ts`,
`src/lib/northbound/circuit-breaker.ts`).

## What it does

One circuit per SAP system: per stored connection on the northbound read and
write and the Studio Test Console.

The Workbench preview has circuits of its own, one per organization and
system (stored connection or deployment tenant), under
`coreedge:circuit:console:<organization>:<system>`. The builder chooses the
preview's entity set, so its outcomes must not reach anyone else: a builder's
previews never count into the circuit that guards the deployed application's
calls, and one organization's previews of the shared deployment tenant
(`S4_TDD_*`) never refuse another organization's. SAP's own 4xx answer to a
preview (a parameterised entity set asked without its parameters, a set the
arrangement does not release) counts as a refusal, not a failure, though the
audit row still records it as 502.

| Event | What the circuit does |
|---|---|
| A call is answered (200, 201, or an empty result) | Closes; the failure count goes back to 0 |
| A read that times out, gets a 5xx, cannot reach the host, or gets an invalid response | Counts one failure |
| A write that times out, cannot reach the host, cannot get its credential, or whose CSRF handshake fails | Counts one failure |
| SAP refuses the call (401, 403, 404, 422) | Nothing: a healthy system said no to one request |
| SAP answers a write's POST with any other status (a 5xx included), or throttles a write (408, 429) | Nothing: see below |

A write's payload is the caller's choice, and SAP answers a bad one with a 500
(a Gateway technical exception, a RAP short dump on a field value) as readily
as with a 400; enough writes earn a 429. The connection's circuit is shared by
every solution that uses it, so were those answers counted, one solution's
five bad writes would open it and, under `enforce`, refuse every other
solution's reads and writes on the connection for 30 seconds at a time while
SAP is healthy. So only what SAP did not answer counts for a write. The
production reads, whose query the interface fixes, still count SAP's 5xx, so a
system that is really failing still opens the circuit for the writes too.
| The fifth failure in a row | Opens for 30 seconds |
| The 30 seconds have passed | Lets exactly one call through (half-open); its outcome closes or re-opens the circuit |

The state is shared by every instance through Upstash Redis
(`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, the store the rate
limiter uses), under keys `coreedge:circuit:<system>` that expire 24 hours
after the circuit last changed. Every change is a compare-and-set, so concurrent instances do
not lose a failure. Without Upstash each instance keeps its own circuits (five
failures that instance saw itself). If Redis cannot be asked, the call goes
ahead as if there were no breaker, and the error is logged once per instance
(`[circuit] the breaker's store could not be asked`). A Redis that accepts the
connection and does not answer is treated the same way: each breaker operation
gives up after 400 ms (`STORE_DEADLINE_MS` in `circuit-breaker.ts`), each
Upstash request is aborted at that deadline and retried at most once, and the
call goes ahead. A write's outcome reaches the breaker only after its
`Idempotency-Key` is completed and its audit row written, so a slow Redis can
never leave a write SAP performed without its stored outcome.

## The setting

| Value | Behaviour |
|---|---|
| `observe` (default, and any value not listed) | Counts and opens as above, logs `[circuit] would refuse` with the circuit, its state, the correlation id and whether the store is shared, and lets the call through. Nothing any caller sees changes. A call it would have refused is not counted (enforcing, it would never have reached SAP), so the stored circuit follows the same timeline as under `enforce` and there is one `would refuse` line for every call `enforce` would refuse. |
| `enforce` | An open circuit refuses the call before anything is sent to SAP: `503 CIRCUIT_OPEN` with `Retry-After`, an audit row with `failureReason: CIRCUIT_OPEN` (the upstream-errors incident leaves it out, as SAP was not called), and the Test Console shows it as the refusal the deployed application would get. A write refused this way releases its `Idempotency-Key`. A replay of a stored write is still answered: it never calls SAP. |
| `off` | Not consulted. No Redis reads or writes. |

## What happens on deploy

Nothing a caller can see. The default is `observe`, which never refuses. The
one cost a caller can notice is latency while Upstash is unhealthy: at most
400 ms before the call to SAP and 400 ms after it, in place of waiting on
Redis without limit.

The new work per governed call, with Upstash configured, is two Redis reads:
one before the call to SAP and one after it, when its outcome is recorded.
A compare-and-set (one more command) is sent only when the circuit changes:
a failure, the circuit opening or closing, a half-open probe being taken or
ending. A success on a closed circuit with no failures, and a refusal on a
closed circuit, write nothing, so a healthy connection's record is not renewed
and expires 24 hours after its last change. Size the Upstash plan for two
commands per governed call plus the rate limiter's own; the instance is shared
with the limiter.

## Switching it on

1. Leave `observe` on for at least a week of normal traffic, with Upstash
   configured (otherwise each instance judges alone and the logs say
   `shared: false`).
2. Search the logs for `[circuit] would refuse`. Each entry is one call that
   `enforce` would have refused (a `console:` circuit is a Workbench preview's,
   not the deployed application's). Every entry should fall inside a real SAP
   outage (the same window shows 502 and 504 rows for that connection in
   Operations, or the customer confirms one). An entry outside an outage means
   a system that fails often enough to trip it while serving: find out why
   before enforcing, because enforcing would refuse its calls.
3. Know what `enforce` refuses: everything on the connection, reads and
   writes from every solution that uses it, for as long as it is open. Only
   a system's failures open it (the table above); one solution's payloads
   cannot.
4. Set `COREEDGE_CIRCUIT_BREAKER=enforce` and redeploy.
5. After the deploy, look up any `503 CIRCUIT_OPEN` a developer quotes with the
   correlation-id search in Operations: it names the connection hop and says
   nothing was sent to SAP.

## Switching it off

Set `COREEDGE_CIRCUIT_BREAKER=observe` (or `off`) and redeploy. No data needs
clearing: circuit records expire on their own, and are only read while the
breaker is consulted.

## When a circuit is open and SAP is back

The next call after the 30 seconds probes it and closes it on success. There is
no operator button yet to close one early (`closeEarly` exists in
`circuit-breaker.ts` for this instance's memory only). To clear a shared one by
hand, delete its key in Upstash: `DEL coreedge:circuit:connection:<connection id>`
(a preview's: `DEL coreedge:circuit:console:<organization id>:connection:<connection id>`).
