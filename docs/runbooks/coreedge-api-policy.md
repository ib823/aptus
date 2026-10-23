# Runbook: The SAP API Policy §1.2 sign-off (`COREEDGE_API_POLICY_SIGNOFF`)

Roadmap item P1.2 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.3). The rule is `src/lib/studio/api-policy.ts`; the broker's check is in
`src/lib/northbound/authorisation.ts` (`authorisesHere`), the grant decisions'
in `src/lib/studio/grant-policy.ts`.

## What it is for

SAP API Policy v.4.2026a, §1.2: a customer's and a third party's applications
must not call SAP APIs that are not Published APIs, except as SAP's
documentation permits or SAP authorises; the customer verifies that each
endpoint is a Published API. On S/4HANA Cloud Public Edition the customer's
own services (`Z*`, `Y*`, `YY1_*`) are the ones that question applies to: the
catalogue cannot say they are published, and a path a builder typed can name
any service on the system, SAP's unpublished ones included. The sign-off is
the customer's own record of the answer, made once per service by someone
other than the person who chose that service.

An interface needs one when its product is `s4hana` (S/4HANA Cloud Public
Edition) and it is registered by its own service path, or names a `Z*`, `Y*`
or `YY1_*` service (`policySignOffRequired`). Other products do not: on
private cloud and on-premise the policy itself allows custom-developed ABAP
interfaces.

## Recording and withdrawing a sign-off

Studio, Interfaces, the interface's *SAP API Policy §1.2* row, **Record**
(`POST /api/studio/interfaces/<id>/policy-sign-off`). The dialog quotes §1.2
with the policy's version and asks for:

- the basis: *Permitted by SAP documentation for this product*, *Authorised by
  SAP* (reference required) or *Other* (reference required);
- the acknowledgement;
- a passkey step-up (action `policy.signoff`), under `COREEDGE_STEP_UP` like an
  access decision (`docs/runbooks/coreedge-step-up.md`).

The signer must be a builder other than the person who chose the service the
interface calls: the actor of the newest `ConfigAudit` row that set it, the
interface's CREATE row or a later UPDATE or PROMOTE row whose `after` says
`serviceChanged: true`. A builder who re-points an interface to another
service is that service's requester, and the registrant may then sign it. An
interface whose row is missing, or names another service than the one it
calls now, is signed with `requesterUnknown: true` recorded, rather than
refused.
The field and its `ConfigAudit` row (`POLICY_SIGN_OFF`) are written in one
transaction, compare-and-set on the service it covers, so a sign-off can never
land on a service changed under it (409). **Withdraw**
(`DELETE`) clears it and writes `POLICY_SIGN_OFF_WITHDRAWN`. Changing the
interface's service (its path or OData version) clears it too: a sign-off covers one service, and
it is stored with that service's identity and the policy's id, so one of an
older policy or another service does not count.

## The setting

| Value | Behaviour |
|---|---|
| `observe` (default; also any unrecognised value) | Nothing is refused. A grant approval (Studio API Access, CoreEdge requests, Control Tower) on such an interface without a sign-off goes ahead, and its `ConfigAudit` DECISION row's `after` carries `policySignOffMissing: true`. A call through it is served and logged: `[api-policy] a call was served on a customer-built S/4 Public service with no §1.2 sign-off; COREEDGE_API_POLICY_SIGNOFF=enforce would refuse it`, with the organisation and the interface. Studio shows *§1.2 sign-off needed* on the interface either way. |
| `enforce` | Any approval (APPROVED, READ_ONLY or SANDBOX_ONLY) of access to such an interface without a sign-off is refused, saying why; a rejection is not. The northbound read and write refuse it with `403 API_POLICY_SIGN_OFF_REQUIRED`, before anything is sent to SAP and before a write's `Idempotency-Key` is claimed, and the lane board shows the same refusal. |
| `off` | Neither: no check, no log, no audit note. |

**Why observe is the default.** Enforcing is a new refusal of traffic that
works today: every S/4 Public interface registered by its own path before
P1.2 has no sign-off, and would be refused on the deploy.

**Before switching to enforce: seven clean days.** Run in observe for at
least a working week, then:

- Grant decisions that enforce would have refused:

  ```sql
  SELECT "organizationId", "entityId", at FROM "ConfigAudit"
  WHERE "entityType" = 'ApiAccessGrant' AND action = 'DECISION'
    AND (after->>'policySignOffMissing')::boolean IS TRUE
  ORDER BY at DESC;
  ```

- Calls it would have refused: search the logs for `[api-policy]`.

Each interface listed needs its sign-off recorded (Studio, Interfaces), by a
builder other than the person who chose its service, or it loses its traffic. When seven
consecutive days show no new row and no log line, set
`COREEDGE_API_POLICY_SIGNOFF=enforce` and redeploy.

**Rolling back the setting:** set it to `observe` (or remove it) and redeploy.
Nothing is stored by the setting; recorded sign-offs stay.

## Rolling back the deploy

`Interface.apiPolicySignOff` is an additive column (migration
`20261027010000_tenant_service_discovery`). A build before P1.2 does not read
it, so a rollback simply stops checking; the sign-offs stay for the roll
forward. The backout drops the column and every sign-off with it: run it only
after rolling back, and only when they are not wanted
(`docs/runbooks/coreedge-tenant-discovery.md`, *Rolling back*).
