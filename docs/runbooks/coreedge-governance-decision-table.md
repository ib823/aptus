# Runbook: The broker's governance decision table

Roadmap item P0.15 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). This is the whole rule a northbound call is judged by, in one place, in
the order the broker applies it. It collects rules that are written down across
four runbooks and the broker's own modules:

- credentials: `docs/runbooks/coreedge-credential-hygiene.md`;
- grants and binding: `docs/runbooks/coreedge-grant-binding.md`;
- limits and limiter outages: `docs/runbooks/coreedge-rate-limits.md`;
- connection binding: `src/lib/sap-public/connection-resolver.ts`
  (`selectConnectionForEnvironment`), which no runbook described until now.

`tests/property/northbound-governance.property.test.ts` holds an oracle written
from this table, not from the code, and checks the broker against it on every
pull request over more than 10,000 generated combinations. When the broker and
this table disagree, the test fails and names the case.

The cases vary every rule below, including the three a tenant or a stale
record could get around: rows of another organisation that carry this app's,
this interface's and this product's ids (5.1, stage 6, stage 7: they never
count, and SAP is called only through the connection the table binds); an
interface edited onto a legacy grant's tuple before or after its cut-off
(stage 6); and a custom service verified through another connection or
against another host under the bound connection's key (stage 8). Change this table and the
oracle together, in the same pull request as the broker change, and say why.

## The routes

| Route | What it does |
|---|---|
| `GET /api/northbound/interfaces/[id]/data` | read (stages 1, 3, 5, 6, 7) |
| `POST /api/northbound/interfaces/[id]/data/write` | create (stages 1 to 8) |

The first stage that refuses decides the answer. Nothing after it runs, and SAP is
called only when every stage passes.

## Stage 1: the credential (every route)

Every refusal here is `401 UNAUTHENTICATED` to the caller, with no detail. The
reason is logged (`[northbound] auth rejected`) and decides which bucket the
failed lookup spends (rate-limits runbook).

| # | When | Reason |
|---|---|---|
| 1.1 | No bearer token | `NO_TOKEN` |
| 1.2 | The token is no credential's current key, no credential's previous key and no credential's dropped key | `UNKNOWN_TOKEN` |
| 1.3 | The credential is revoked. This covers its current key, its previous key and every key it dropped | `REVOKED` |
| 1.4 | The credential is deactivated | `INACTIVE` |
| 1.5 | The token is the credential's previous key and the overlap window has closed, or the overlap is no longer bound to the current key; or the token is a key the credential dropped (`RetiredClientToken`) | `ROTATED_OUT` |
| 1.6 | The credential's own expiry has passed | `EXPIRED` |
| 1.7 | The credential's app no longer exists | `SOLUTION_MISSING` |
| 1.8 | The app is `RETIRED` | `SOLUTION_RETIRED` |

An app that is `DRAFT`, `ACTIVE` or `RESTRICTED` passes: RESTRICTED stops no
runtime call (grant-binding runbook).

## Stage 2: the write key (write route only)

A missing or wrong `x-coreedge-write-key` for this credential is `403 FORBIDDEN`
(`WRITE_KEY_INVALID`).

## Stage 3: the credential's own limit

| When | Answer |
|---|---|
| The credential's bucket is spent | `429 RATE_LIMITED`, audited 429 |
| The limiter cannot be asked | `503 LIMITER_UNAVAILABLE`, audited 503 with that failure reason |

Reads and writes have separate buckets.

## Stage 4: the idempotency key (write route only)

No valid `Idempotency-Key` is `400 VALIDATION_ERROR` (`IDEMPOTENCY_KEY_REQUIRED`).

## Stage 5: the interface

| # | When | Answer |
|---|---|---|
| 5.1 | No interface with this id in the credential's organisation | `404` (`INTERFACE_NOT_FOUND`) |
| 5.2 | The interface belongs to another app | `404` with the same message (`NOT_THIS_SOLUTION`) |
| 5.3 | Read: the interface is a write interface | `403` (`WRITE_NOT_SERVED`) |
| 5.4 | Read: the interface is `DEPRECATED` | `403` (`INTERFACE_DEPRECATED`) |
| 5.5 | Write: the interface is a read interface | `403` (`READ_ONLY_INTERFACE`) |
| 5.6 | Write: the interface is not `ACTIVE` | `403` (`INTERFACE_NOT_ACTIVE`) |
| 5.7 | Write: the interface's operation is not `CREATE` | `400` (`OPERATION_NOT_SUPPORTED`) |

A read from a `DRAFT` interface is served, with the header
`x-coreedge-interface-status: DRAFT`.

## Stage 6: the grant

Every refusal here is `403 FORBIDDEN`.

**Which grants count.** A grant is considered only if it is in the credential's
organisation, app and environment, and names the interface's service id and
operation. Then:

- a grant **bound** to this interface, on the interface's SAP product, counts;
- a grant bound to another interface, or to this one on another product, never
  counts;
- an **unbound** (legacy) grant counts only under `COREEDGE_GRANT_BINDING=legacy`
  (the default), and only on an interface that already matched it at its cut-off.
  The interface "matched" from the later of its creation and its last
  `grantMatchChangedAt` edit; the cut-off is `unboundCutoffAt`, or the grant's
  own creation time when it was never stamped. Under `strict` an unbound grant
  never counts.

**Which decisions authorise.**

| Decision | Read | Write |
|---|---|---|
| `APPROVED` | yes | yes |
| `READ_ONLY` | yes | never |
| `SANDBOX_ONLY` | only in SANDBOX | only in SANDBOX |
| `REQUESTED`, `REJECTED`, `EXPIRED` | no | no |

A write also needs the grant's operation to be `CREATE` or `UPDATE`.

**The answer.**

| # | When | Reason |
|---|---|---|
| 6.1 | No counted grant authorises the call, and an unbound grant that is not revoked and not expired would have, had binding allowed it | `GRANT_NEEDS_REAPPROVAL` |
| 6.2 | No counted grant authorises the call otherwise | `NO_APPROVED_GRANT` |
| 6.3 | Every counted, authorising grant is revoked | `GRANT_REVOKED` |
| 6.4 | Every counted, authorising grant that is not revoked has expired | `GRANT_EXPIRED` |

Otherwise the call is authorised. If no bound grant was among the live ones, the
call rode on legacy matching, and the grant's `unboundLastUsedAt` is stamped.

## Stage 7: the SAP connection

Every refusal here is `403 CONNECTION_NOT_CONFIGURED`, audited with the reason.
Only the organisation's **active** connections for the interface's product count.

| # | When | Reason |
|---|---|---|
| 7.1 | The interface names a product the connector does not know | `UNKNOWN_PRODUCT` |
| 7.2 | A connection row cannot be opened (unknown auth type, secrets that fail to open) | `CONNECTION_UNREADABLE` |
| 7.3 | No active connection | `NO_CONNECTION` |
| 7.4 | Exactly one connection declares the credential's environment and, when the credential names an SAP client, that client | bound |
| 7.5 | More than one does | `AMBIGUOUS` |
| 7.6 | Some declare the environment but none the client | `NO_MATCH_FOR_CLIENT` |
| 7.7 | None declares the environment and every connection declares some other one | `NO_MATCH_FOR_ENVIRONMENT` |
| 7.8 | None declares the environment, some declare none, and this is a write | `UNDECLARED_ENVIRONMENT_WRITE` |
| 7.9 | Read: the organisation has exactly one connection, it declares no environment, and it does not name a different SAP client | bound, marked unverified |
| 7.10 | Read: that one connection names a different SAP client | `NO_MATCH_FOR_CLIENT` |
| 7.11 | Read: several connections, none declares the environment, some declare none | `NO_DECLARED_CANDIDATE` |

## Stage 8: the write switches (write route only)

| When | Answer |
|---|---|
| The bound connection's `writeEnabled` is off | `403 FORBIDDEN` (`WRITES_DISABLED`) |
| The interface carries its own service path and it has not been verified in this environment, through this connection, SAP client and host | `400 VALIDATION_ERROR` (`CUSTOM_SERVICE_UNVERIFIED`) |

## Then

The circuit breaker for the bound connection's SAP system is asked (the
governed pipeline's `contain` step, P0.14). Under the default
`COREEDGE_CIRCUIT_BREAKER=observe` it never refuses. Under `enforce`, an open
circuit answers `503 CIRCUIT_OPEN` with Retry-After and nothing is sent to SAP;
on the write route this comes after the idempotency key's replay and conflict
answers, and releases the key (docs/runbooks/coreedge-circuit-breaker.md). The
property test runs with the default, so its oracle has no row for it.

The broker calls SAP: `200` for a read, `201` for a create (or SAP's own error).

## Containment today

What an operator can do to stop calls, and the stage that then refuses them:

| Action | Refused at |
|---|---|
| Revoke a key | 1.3 |
| Deactivate a key | 1.4 |
| Retire the app | 1.8 |
| Revoke or let a grant expire | 6.3, 6.4 |
| Deprecate the interface (reads), or move it out of ACTIVE (writes) | 5.4, 5.6 |
| Deactivate the connection | 7.3 (or the next row of stage 7) |
| Switch writes off on the connection | 8 |
| Switch `COREEDGE_GRANT_BINDING` to `strict` | 6.1 |
| Switch `COREEDGE_CIRCUIT_BREAKER` to `enforce` (refuses only while a system is failing) | Then |

A scoped stop switch (FREEZE, READ_ONLY, THROTTLE) is P3.6 and not built.

## When the property test fails

The failure prints the case: the credential, app, grants, interface and
connections it generated, what the oracle expected and what the broker did.

1. Decide which is right, the broker or this table.
2. If the broker changed on purpose, change this table and the oracle in
   `tests/property/northbound-governance.property.test.ts` in the same pull
   request, and say in the description which rule changed and why.
3. If the broker changed by accident, fix the broker.

Run it alone with `pnpm test:property`.
