# Runbook: the SAP Ariba explorer (`ARIBA_*`)

Roadmap item P0.6 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): audit findings A71 to A75. This is a holding fix. P5.3 moves Ariba onto the
REST adapter, and until then Ariba is configured only through the deployment's
`ARIBA_*` variables (`.env.example`) and served by two routes:

- `GET /api/sap/ariba/catalog` lists the endpoints and realms.
- `GET /api/sap/ariba/call` runs one live read against a realm.

The explorer is under `/sap-explorer` > SAP Ariba
(`src/components/sap/SapAribaExplorer.tsx`). The connector is
`src/lib/sap-public/ariba-connector.ts`.

## What changed, in one paragraph each

**The catalogue lists the paths the call sends to (A71).** Before, the catalogue
returned the static v2 list while `ARIBA_SOURCING_V1=true` sent the two sourcing
calls to v1. The explorer then labelled v1 data "Event Management API 2.0.0". The
catalogue now returns the resolved endpoints. A pinned entry carries the v1
path, a description that says "1.0.0, deprecated; pinned by ARIBA_SOURCING_V1",
and `pinnedLegacy: true`, which the explorer shows as a "v1 pinned" badge.

**A malformed realm list is an error, not zero realms (A72).** A value of
`ARIBA_REALMS_JSON` that is not a JSON array of objects, each with a `key` or a
`label`, used to read as "configured, no realms". Run then sent requests with no
realm. Now:

- The catalogue answers `configured: false` and `realmsError: "ARIBA_REALMS_JSON is invalid: <what is wrong>"`.
- The server log gets the same line. Neither names the value.
- The explorer shows the error and keeps Run disabled.
- The call route refuses every call with `400 VALIDATION_ERROR`.

When `ARIBA_REALMS_JSON` is set and broken, `ARIBA_REALM` is not used instead.
The variable that was set is the one the operator meant.

An empty list, `ARIBA_REALMS_JSON="[]"`, is malformed too: `realmsError` is
"it lists no realms; unset it to use ARIBA_REALM, or list at least one". It
used to read as "configured, zero realms". That silently dropped `ARIBA_REALM`
and the realm check, so a call went out with no realm, or with any realm the
caller named. To mean "no extra realms", leave `ARIBA_REALMS_JSON` unset or
empty (`""`).

**A malformed `ARIBA_*` URL is a configuration error (A73 class).**
`ARIBA_BASE_URL` and `ARIBA_OAUTH_TOKEN_URL` must each be an absolute `http` or
`https` URL. A value without a scheme, for example `myrealm.ariba.com`, used to
answer `502 "Ariba call failed"` although nothing was sent, and named no
variable. Now:

- The catalogue answers `configured: false` and `configError: "<variable> is not an absolute http(s) URL"`.
- The server log gets the same line. Neither names the value.
- The explorer shows the error and keeps Run disabled.
- The call route answers `400 VALIDATION_ERROR "Ariba configuration is invalid. <variable> is not an absolute http(s) URL"`, before any token exchange.

**A call must name a configured realm (A72).** Once any realm is configured, a
call that names no realm, or a realm not in the list, is refused with `400`
before the token exchange. The deployment's token and apiKey are not spent on a
realm it does not serve. With no realm configured at all, the realm is passed
through as before. `ARIBA_REALM_ALLOWLIST=off` restores the pass-through (see
Rollback).

**An unknown endpoint key is the caller's error (A73).** A key the catalogue does
not list, for example the old `operational-views`, used to answer `502 "Ariba
call failed"` although nothing was sent. It now answers `400 VALIDATION_ERROR
"Unknown Ariba endpoint: <key>"`, and nothing is sent.

**A token-endpoint failure is reported as one (A74).** The token response used to
be parsed before its status was read. A gateway's HTML 503 therefore showed as
`Unexpected token '<' ... is not valid JSON` with status 0. The call result now
has two new fields:

- `stage`: `"token"` when the OAuth exchange failed and the realm was never asked. Otherwise `"request"`.
- `failureReason`: the broker's `TOKEN_*` code (`src/lib/sap-public/upstream-failure.ts`), or null.

The audit row (`SAP_CAPABILITY_PROBED`, entity `sap_ariba_call`) records both
fields. The message names the token endpoint's HTTP status and what to check. It
never contains the endpoint's body or URL. A realm body labelled JSON that does
not parse now keeps the realm's own status instead of becoming status 0.

| `failureReason` | Meaning | Who fixes it |
|---|---|---|
| `TOKEN_REJECTED` | The token endpoint answered 400, 401 or 403: the client id or secret was refused | Operator: `ARIBA_CLIENT_ID`, `ARIBA_CLIENT_SECRET` |
| `TOKEN_URL_HTTP_<n>` | A 404, 405 or 3xx: the token URL points at the wrong thing | Operator: `ARIBA_OAUTH_TOKEN_URL` |
| `TOKEN_HTTP_<n>` | A 5xx, 408 or 429: the token endpoint is failing | Retry later. SAP Ariba's side |
| `TOKEN_NO_TOKEN` | A 2xx without an access token, an HTML login page for example | Operator: `ARIBA_OAUTH_TOKEN_URL` |
| `TOKEN_TIMEOUT` | No answer within `ARIBA_TIMEOUT_MS` | Retry. Check the network path |
| `TOKEN_<code>` | Could not be reached (`TOKEN_ENOTFOUND`, `TOKEN_ECONNREFUSED`, `TOKEN_FETCH_FAILED`) | Network or DNS |

**`limit` must be a positive integer (A75).** Before, `limit=` or `limit=abc`
sent `$top=NaN` upstream and dropped every row, so the answer was an empty
success. Now a `limit` that is present but not a whole number of 1 or more
answers `400 "limit must be a positive integer"`. An absent limit means 10, and
anything above 50 is capped at 50, as before. The connector also guards against
NaN on its own. `fields` now describes the rows returned, not rows that were
dropped.

**Unchanged.** The probe guard still runs first. A sandbox developer is refused
with 403 before any of the checks above, and before any OAuth exchange (P0.13).
The explorer's own Run sends a realm from the configured list and `limit=10`, so
it meets every new check.

## Settings

| Variable | Default | Values |
|---|---|---|
| `ARIBA_REALM_ALLOWLIST` | `enforce` | `enforce`: a call must name a configured realm while any is configured. `off`: any realm, or none, is passed through. Any other value is read as `enforce`. |
| `ARIBA_SOURCING_V1` | unset (v2) | `true` pins the two sourcing endpoints to v1. The catalogue shows the pin. |

No other setting was added. Malformed configuration, unknown endpoint keys and
bad limits are refused whatever these are set to.

## On deploy

- **No schema change and no data change.** Audit rows written before the deploy
  have no `stage` or `failureReason`.
- **The explorer behaves the same** for a deployment whose `ARIBA_*` values are
  well formed.
- **A deployment with a malformed `ARIBA_REALMS_JSON`**, `"[]"` included, stops
  sending realm-less calls and shows the error instead. A call sent with no
  realm could not reach the realm the operator meant to configure.
- **A deployment whose `ARIBA_BASE_URL` or `ARIBA_OAUTH_TOKEN_URL` has no
  scheme** gets `400` naming the variable where it got `502`. No call could
  succeed with that value before, so nothing that worked stops working.
- **A script or person calling `/api/sap/ariba/call` directly** with a realm the
  deployment does not list, a renamed endpoint key or a bad `limit` now gets
  `400` where it used to get a call or a `502`.

## Checks after deploy

1. Open `/sap-explorer` > SAP Ariba. The Realm picker lists the configured realms, and no red banner shows.
2. If the banner shows, fix the variable it names. Common mistakes:
   - `ARIBA_REALMS_JSON` is a single object instead of an array: wrap it in `[ ]`;
   - `ARIBA_REALMS_JSON` has a trailing comma;
   - `ARIBA_REALMS_JSON` has an entry with neither `key` nor `label`;
   - `ARIBA_REALMS_JSON` is `[]`: unset it, or list the realms;
   - `ARIBA_BASE_URL` or `ARIBA_OAUTH_TOKEN_URL` lacks `https://`.
3. With `ARIBA_SOURCING_V1=true`, check that "Sourcing Events" shows `/v1/` and the "v1 pinned" badge.
4. Run once. A token failure shows "token step failed" in the badge, with what to check.

## Rollback

- Realm list refusals break a caller you cannot change at once: set
  `ARIBA_REALM_ALLOWLIST=off` and redeploy. Then add the realms that caller
  needs to `ARIBA_REALMS_JSON`, and remove the setting.
- Anything else: revert the P0.6 commit. Nothing in the database depends on it.

## Open decisions

- **Realm required when none is configured?** With no realm configured, a call
  is still sent with whatever realm the caller names, or none. Every Ariba API in
  the catalogue takes a realm, so refusing a deployment with no realm may be the
  right rule. It would change behaviour for any deployment configured that way,
  so it is left for the Ariba owner to decide with P5.3.
- **Retire `ARIBA_REALM_ALLOWLIST`.** The switch is a rollback only. When to
  remove it is open: one release after the deploy with no use of `off` is the
  suggestion.
- **Require https for the `ARIBA_*` URLs?** An `http` base or token URL is
  still accepted, as before this item, although the token step then sends the
  client secret in clear. Ariba itself serves only https, so refusing `http`
  is likely right. It would change behaviour for a deployment pointed at an
  http proxy or mock, so it is left for the Ariba owner to decide with P5.3.
- **v2 sourcing paths are still unverified** against a live tenant (2608 WS8).
  This item does not change that. It only makes the explorer show which version
  is being called.

## On the console pipeline (P0.14b)

`/api/sap/ariba/call` runs on the Workbench console pipeline
(`src/lib/governed/console.ts`): after the probe guard and the request checks
above, the call is authorised (a sandbox developer is refused, as before),
`ARIBA_BASE_URL` and `ARIBA_OAUTH_TOKEN_URL` are checked against the SAP host
allow-list (`COREEDGE_ENV_TENANT_HOSTS`, default `observe`: logged and
recorded, never refused; `enforce`: `403 HOST_NOT_ALLOWED` before the token
exchange), the console's own circuit for the realm is consulted (observing
unless `COREEDGE_CIRCUIT_BREAKER=enforce`), and every call leaves a
platform-scope row (`PlatformConsoleRead`) naming the person, the endpoint and
the realm, with the result's status and reason. An Ariba call files no
organization row, so Operations' correlation search finds its id through that
row, for a call made by a member of the searcher's organization. The
best-effort `logDecision` entry is still written beside it. See
`docs/runbooks/coreedge-console-pipeline.md`.
