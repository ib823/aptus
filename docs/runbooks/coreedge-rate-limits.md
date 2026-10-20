# Runbook: Rate limits, limiter outages and token-endpoint failures

Roadmap item P0.5 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2), audit findings A43 and A44 and the batch-2 follow-ups.

## What changed

| Before | After |
|---|---|
| Every `/api/*` call spent a per-IP bucket in the middleware (300 GET, 120 other a minute), so one runaway key throttled every other key behind the same address — with a 429 that had no correlation id and no audit row. | Authenticated **machine routes** are limited at the edge **per presented credential**, then by a high per-IP backstop. Browser and console routes are unchanged. |
| A rate-limiter (Upstash) outage returned the same `allowed: false` as a real limit, so every caller was told **429 "too many requests"**, it was audited as 429, and the throttled incident fired. | The limiter still refuses during an outage, but says so: **503 `LIMITER_UNAVAILABLE`** with `Retry-After`, audited 503 with failureReason `LIMITER_UNAVAILABLE`. |
| Token-endpoint failures had two spellings per fact by auth type (`OAUTH_TOKEN_HTTP_503`, `SAML_BEARER_HTTP_503`), some with no hint that the token step failed (`FETCH_FAILED`, the console's bare `TIMEOUT`), and the console and the broker drew the refused/outage line in different places. | One classifier (`credentialFailure` in `src/lib/sap-public/upstream-failure.ts`) for the broker, the console, the probe and the connection Test, and one `TOKEN_*` vocabulary. |
| A same-key write replay was counted as traffic on the credential, grant and interface in the topology, and could be quoted as a lane's last call. | Replays are left out of the topology and the lane's last call, as they already were from the lane board, usage and incidents. The traffic screen still shows them in their own bucket. |

## Machine routes at the edge (A43)

`src/middleware.ts`, `machineRouteLimit`. A machine route is any path under
`MACHINE_API_PREFIXES` in `src/lib/security/rate-limit.ts`: `/api/northbound`
today, and the reserved `/api/twin`, `/api/events/ingest`, `/api/mgmt`,
`/api/outbound` and `/api/mcp`, so each is per-credential from its first deploy.

For a call that carries `Authorization: Bearer …`:

0. `machine-authfail:<ip>` — 60 **failed credential lookups** a minute
   (`RATE_LIMITS.machineAuthFailure`). The route spends it on every 401 for a
   presented key (`noteFailedCredential`, `src/lib/northbound/auth-failures.ts`);
   the edge only reads it, before anything else, and refuses the address while
   it is empty. Without it, a client sending a new made-up key on every call
   gets a fresh credential bucket each time and meets only the backstop below:
   up to 6,000 database lookups a minute per address, where the old per-IP
   bucket allowed 120 writes or 300 reads. With it, such a flood costs at most
   60 lookups a minute per address; after that, each call costs one Upstash
   read and nothing else. A key that authenticates never spends it.
   **Trade-off:** while an address is over it, valid keys calling from that
   same address are refused too (the edge cannot tell them apart without the
   lookup). That lasts until the window frees room, and only an address that is
   sending failing keys can cause it.
1. `machine:cred:<first 128 bits of SHA-256(bearer)>` — 600 a minute
   (`RATE_LIMITS.machineCredential`). The bearer itself is never stored. The
   route still authenticates the credential and applies its own budget
   (`northbound:<clientId>` 60 reads, `northbound-write:<clientId>` 60 writes a
   minute), with an audit row; the edge ceiling is above both, so it never
   refuses a call the route would serve.
2. `machine-ip:<ip>` — 6,000 a minute (`RATE_LIMITS.machineIpBackstop`),
   checked **only after the credential's own bucket admitted the call**. A
   runaway key is refused at its own ceiling first, so it can spend at most a
   tenth of its address's backstop. Only a flood of random keys reaches it.

A machine call **with no bearer**, and every browser or console route, keeps the
per-IP buckets it always had (`api:<method>:<ip>`, `auth:`, `sap-live:`,
`report:`).

An edge refusal of a machine call uses the broker's envelope:
`{ "error": { "code", "message", "correlationId" } }` with `x-correlation-id`
and `Retry-After`. The code says whose limit it was:

| Bucket | Status and code | Developer's next step |
|---|---|---|
| `machine:cred:` | 429 `RATE_LIMITED` | Slow that key down |
| `machine-ip:` (backstop) | 429 `RATE_LIMITED_ADDRESS`, "Too many requests from this address." | Find what else calls from that address |
| `machine-authfail:` | 429 `RATE_LIMITED_ADDRESS`, "…with an unrecognised client credential from this address…" | Find what is sending a wrong, revoked or expired key |

It is **not audited** (middleware has no database), so looking up that
correlation id finds no row: the call never reached the broker.

To see which addresses are tripping `machine-authfail:`, search the server log
for `[northbound] auth rejected` / `[northbound-write] auth rejected` (one line
per failed lookup, with the reason) and the Upstash data browser for keys under
the `abeam:ratelimit:60:60000` prefix ending in `machine-authfail:<ip>`.

### Setting: `COREEDGE_MACHINE_RATE_LIMIT`

| Value | Behaviour |
|---|---|
| unset / `credential` (default) | As above. |
| `ip` | The old shared per-IP buckets for machine routes too, and the edge no longer reads `machine-authfail:` (the route still counts failures; nothing reads them). **A rollback switch only**: it brings A43 back. |

Anything else reads as the default. On deploy nobody is locked out: for every
existing caller whose key authenticates, the new edge limits are higher than
the old ones, and the route's own per-credential budgets are unchanged. The
only caller refused sooner than before is an address sending more than 60
failing keys a minute, which the old per-IP bucket let make 120 to 300 lookups.

## Limiter outage (A44)

`checkRateLimit` (`src/lib/security/rate-limit.ts`) returns
`reason: "unavailable"` when Upstash cannot be asked in production. The answer
is built by `src/lib/security/rate-limit-response.ts` (or `northboundThrottleRefusal`
in `src/lib/northbound/respond.ts` for the broker's own envelope).

The decision per route class — every class keeps **failing closed**, as it did;
only the answer changes. Nothing was documented as failing open, and the
in-memory fallback is no limit at all on serverless:

| Route class | Bucket(s) | During an outage |
|---|---|---|
| Sign-in, MFA, passkey ceremonies | `auth:`, `webauthn-*` | 503 `LIMITER_UNAVAILABLE` — refusing is the brute-force protection |
| Live SAP console routes | `sap-live:` | 503 — the bucket protects the customer's SAP system |
| Browser API reads and changes, reports | `api:`, `report:` | 503 |
| Machine routes (edge) | `machine:cred:`, `machine-ip:` | 503 in the broker's envelope, with a correlation id. The `machine-authfail:` read comes back unknown and refuses nothing; the two buckets after it answer the outage |
| Northbound routes (in-route) | `northbound:`, `northbound-write:` | 503, audited 503 / `LIMITER_UNAVAILABLE` |
| Studio Test Console dry run | `northbound:` | refusal `LIMITER_UNAVAILABLE`, audited 503 dry run |
| Lane re-check, Probe all | per lane, per tenant | 503 |
| Ops throttle gauge | `peekRateLimit` | "unknown", never zero (unchanged; it gates nothing) |

**Never 429.** A 429 means "this credential used its budget"; a developer backs
off on it. In dev and test (no `NODE_ENV=production`) an outage still falls back
to the per-process limiter, as before.

What operators see: the throttle view counts audited 429s only, so an outage
does not appear there; the **throttled** incident counts 429s, and the
**upstream errors** incident excludes rows whose failureReason is
`LIMITER_UNAVAILABLE`. A correlation lookup of such a row says the call stopped
at the key's hop and that nothing was sent to SAP (and one of a token-endpoint
failure, `TOKEN_*`, says the token endpoint failed, not SAP). Find outage
refusals with:

```sql
SELECT date_trunc('minute', "at") AS minute, count(*)
FROM "NorthboundAuditEvent"
WHERE "failureReason" = 'LIMITER_UNAVAILABLE' AND "at" > now() - interval '1 day'
GROUP BY 1 ORDER BY 1;
```

The server log has `[RATE LIMIT] Shared backend failed` once per instance.
Check the Upstash status and the `UPSTASH_REDIS_REST_URL`/`TOKEN` values; there
is no setting to fail open.

## Token-endpoint failures: one classifier

`credentialFailure(err)` decides, for an error the credential step threw:

| Token endpoint | Kind | Broker | Console read | Connection Test | Reason |
|---|---|---|---|---|---|
| 400, 401, 403 | refused | 403 `FORBIDDEN` | 403 | `UNAUTHORIZED` | `TOKEN_REJECTED` |
| 404, 405, a 3xx | refused (wrong URL) | 403 `FORBIDDEN`, "check the token URL" | 403 | `UNAUTHORIZED` | `TOKEN_URL_HTTP_<n>` |
| 408, 429, 5xx | unavailable | 502 `UPSTREAM_ERROR` | 502 | `ERROR` | `TOKEN_HTTP_<n>` |
| 2xx without a token | unavailable | 502 `UPSTREAM_ERROR` | 502 | `ERROR` | `TOKEN_NO_TOKEN` |
| no answer in 10 s | timeout | 504 `UPSTREAM_TIMEOUT` | 502 | `TIMEOUT` | `TOKEN_TIMEOUT` |
| unreachable | unavailable | 502 `UPSTREAM_ERROR` | 502 | `ERROR` | `TOKEN_<code>` (`TOKEN_ECONNRESET`, `TOKEN_FETCH_FAILED`) |
| a field missing, unusable key, … | refused | 403 `FORBIDDEN` | 403 | `UNAUTHORIZED` | the error's own code (`CONNECTION_MISCONFIGURED`, `SAML_BEARER_MISCONFIGURED`, `SAML_PRIVATE_KEY_UNUSABLE`, …) |

On a write, every row above is unattempted: the Idempotency-Key is released,
so a retry with the same key performs the write. The developer guide's retry
table (`docs/coreedge-developer-guide.md`, "Every status, and whether to retry
it") is checked against this by `tests/unit/northbound/token-failure-retry-table.test.ts`.

SAP's own answers are unchanged: a tenant's 429 on a read or a console read is
502 with `HTTP_429` (it does not raise the throttled incident); on a write it is
502 "not created, retry", and the key is released.

### Old codes in existing rows

Rows written before this change keep their old codes; nothing is rewritten. If
you query by reason across the change, match both:

| New | Old |
|---|---|
| `TOKEN_REJECTED` | `OAUTH_TOKEN_REJECTED`, `SAML_BEARER_REJECTED` |
| `TOKEN_HTTP_<n>` | `OAUTH_TOKEN_HTTP_<n>`, `SAML_BEARER_HTTP_<n>` |
| `TOKEN_NO_TOKEN` | `OAUTH_TOKEN_MISSING`, `SAML_BEARER_NO_TOKEN` |
| `TOKEN_FETCH_FAILED` | `CREDENTIAL_UNAVAILABLE` |
| `TOKEN_TIMEOUT` (console reads) | `TIMEOUT` |

## Replays

A replay is a same-key write retry answered from the stored outcome; SAP is not
called. It is excluded from the topology's counts (`attributeCalls` in
`src/lib/ops/topology.ts`, and the query in `src/app/api/console/topology/route.ts`)
and from a lane's last call (`lastLaneCall` in `src/lib/coreedge/queries.ts`).
The lane board and both incident rules already excluded them.

Two places count them **on purpose**, because a replay is still a request the
broker answered:

| Where | Excludes replays from | Still counts replays in |
|---|---|---|
| Usage rollup (`src/lib/commercial/coreedge-usage.ts`) | `writes` (a replay is not a created record) | `calls` and `refusals` |
| Broker-traffic screen (`src/app/api/ops/broker-traffic/route.ts`) | the status breakdown (shown as its own `replayed` bucket) and the empty-read count | `total`, calls per solution and calls per credential |

So a credential retrying one write five times shows six calls on the traffic
screen and in Usage `calls`, one write in Usage `writes`, and one call on the
topology and the lane board.
