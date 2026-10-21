# Runbook: The circuit breaker (`COREEDGE_CIRCUIT_BREAKER`)

Roadmap item P0.14 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). The breaker is the governed pipeline's `contain` step
(`src/lib/governed/pipeline.ts`, `src/lib/governed/containment.ts`,
`src/lib/northbound/circuit-breaker.ts`).

## What it does

One circuit per SAP system: per stored connection on the northbound read and
write and the Studio Test Console, and per stored connection or deployment
tenant on the Workbench preview.

| Event | What the circuit does |
|---|---|
| A call is answered (200, 201, or an empty result) | Closes; the failure count goes back to 0 |
| A timeout, a 5xx, an unreachable host, an invalid response | Counts one failure |
| SAP refuses the call (401, 403, 404, 422) | Nothing: a healthy system said no to one request |
| The fifth failure in a row | Opens for 30 seconds |
| The 30 seconds have passed | Lets exactly one call through (half-open); its outcome closes or re-opens the circuit |

The state is shared by every instance through Upstash Redis
(`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, the store the rate
limiter uses), under keys `coreedge:circuit:<system>` that expire after 24
hours untouched. Every change is a compare-and-set, so concurrent instances do
not lose a failure. Without Upstash each instance keeps its own circuits (five
failures that instance saw itself). If Redis cannot be asked, the call goes
ahead as if there were no breaker, and the error is logged once per instance
(`[circuit] the breaker's store could not be asked`).

## The setting

| Value | Behaviour |
|---|---|
| `observe` (default, and any value not listed) | Counts and opens as above, logs `[circuit] would refuse` with the circuit, its state, the correlation id and whether the store is shared, and lets the call through. Nothing any caller sees changes. |
| `enforce` | An open circuit refuses the call before anything is sent to SAP: `503 CIRCUIT_OPEN` with `Retry-After`, an audit row with `failureReason: CIRCUIT_OPEN` (the upstream-errors incident leaves it out, as SAP was not called), and the Test Console shows it as the refusal the deployed application would get. A write refused this way releases its `Idempotency-Key`. A replay of a stored write is still answered: it never calls SAP. |
| `off` | Not consulted. No Redis reads or writes. |

## What happens on deploy

Nothing a caller can see. The default is `observe`, which never refuses. The
only new work per call is one Redis read before the call to SAP and, after a
failure, a compare-and-set; a success on a circuit with no record writes
nothing.

## Switching it on

1. Leave `observe` on for at least a week of normal traffic, with Upstash
   configured (otherwise each instance judges alone and the logs say
   `shared: false`).
2. Search the logs for `[circuit] would refuse`. Every entry should fall inside
   a real SAP outage (the same window shows 502 and 504 rows for that
   connection in Operations, or the customer confirms one). An entry outside an
   outage means a system that fails often enough to trip it while serving: find
   out why before enforcing, because enforcing would refuse its calls.
3. Set `COREEDGE_CIRCUIT_BREAKER=enforce` and redeploy.
4. After the deploy, look up any `503 CIRCUIT_OPEN` a developer quotes with the
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
hand, delete its key in Upstash: `DEL coreedge:circuit:connection:<connection id>`.
