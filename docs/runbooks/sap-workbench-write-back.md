# Runbook: Workbench write-back to SAP, and its audit trail

## What this covers

Two routes change data in a live SAP system on a person's say-so, outside the
northbound broker:

| Route | What it does | Where it is used |
|---|---|---|
| `POST /api/sap/tdd/write` | Creates one record in an entity set | Write Mode on `/sap-explorer` |
| `POST /api/sap/tdd/hub-content/write-test` | Creates a throwaway record, then deletes it, to prove a service is writable | API only; no screen calls it |

Both write to the **deployment's own tenant** (configured through
`{PREFIX}_*` environment variables, for example `S4_TDD_*`), never to an
organization's stored connection.

Since roadmap item P0.7, every such write leaves an audit record that names the
person, written **before** SAP is called.

## Switching it on and off

Write-back is off unless the deployment says otherwise. Every one of these must
hold, per product prefix:

| Setting | Default | Effect |
|---|---|---|
| `{PREFIX}_WRITE_ENABLED` | `false` | Must be exactly `true`, or both routes answer 403 before anything else. |
| `{PREFIX}_WRITE_SECRET` | empty | Must be set and supplied by the caller. Unset means every write is refused. |
| `{PREFIX}_WRITE_TEST_ENABLED` | unset | The write-test only: must be exactly `true`. |
| `{PREFIX}_WRITE_TEST_ENTITYSETS` | unset | The write-test only: comma-separated entity sets it may touch. |

The caller must also be a `platform_admin` and type the confirmation phrase.

**To switch write-back off now**, with no deploy: remove
`S4_TDD_WRITE_ENABLED` (and any other `{PREFIX}_WRITE_ENABLED`) from the Vercel
production environment, then redeploy or wait for the next deployment to pick
it up. Write Mode then shows "Write-back is disabled". This is the control the
roadmap asks for until a real client credential is stored on the shared host.

No new setting was added for the audit. It is not optional: a write that cannot
be recorded is not sent. `{PREFIX}_WRITE_ENABLED` remains the one switch.

## What is recorded

`PlatformAuditEvent`, inserted after every guard has passed and before the
first SAP call (for the write-test, before the `$metadata` read as well):

- the person: user id, email, role, and their organization if they have one
  (a platform admin may have none; that is recorded as such);
- the action: `SAP_WORKBENCH_WRITE` or `SAP_WORKBENCH_WRITE_TEST`;
- the target: product, tenant key and label, service key and path, entity set;
- a SHA-256 of the payload and its top-level field names. **Never the values.**
- a correlation id, which the response returns as `x-correlation-id`.

`PlatformAuditOutcome`, inserted once afterwards:

| Outcome | Meaning | What to do |
|---|---|---|
| `SUCCEEDED` | SAP accepted the write (a write-test also deleted its record) | Nothing |
| `BLOCKED` | Refused after the event was recorded, before any write was sent (the write-test's `$metadata` gate) | Nothing; nothing was written |
| `SAP_REFUSED` | SAP answered 4xx | Nothing was written; fix the payload or the SAP side |
| `OUTCOME_UNKNOWN` | SAP answered 5xx, timed out, or the call threw | Check SAP before anyone repeats the write |
| `LEFT_BEHIND` | A write-test created its record and could not delete it | The record is still in SAP. Its address is in `detail.location`; delete it in SAP |
| *(no outcome row)* | Recorded before SAP was called, outcome never saved | If older than 15 minutes, treat as `OUTCOME_UNKNOWN` |

Both tables are append-only: there is no update or delete in the code
(`tests/unit/northbound/dod-gaps.test.ts` asserts it), and the database allows
one outcome per event (`eventId` is unique).

## If the audit cannot be written

The route answers **503 `AUDIT_UNAVAILABLE`** and sends nothing to SAP: "The
write was not sent to SAP: its audit record could not be written. Nothing was
changed." The server log line is
`[platform-audit] could not record a SAP write before sending it; refusing`.

This happens only when the database is unreachable or the
`20261021000000_platform_audit_event` migration has not been applied. The
deploy runs `prisma migrate deploy` before the build
(`scripts/migrate-deploy-with-retry.mjs`), so a deployment that serves the new
code has the tables.

If the outcome cannot be saved, the person still gets SAP's answer, and the log
says `[platform-audit] could not record the outcome of a SAP write; the event
has none`. The event then shows as "never recorded" after 15 minutes.

## Where to see it

**Operations → Write ledger** (`/operations/writes`), panel **Workbench
write-backs**, for platform admins only. It lists who wrote what, where, and
the outcome, with a "Check SAP" count for outcome unknown, left behind and
never recorded. The feed is `GET /api/ops/workbench-writes`.

These tables hold SAP writes only. The same admins' passkey enrolments,
revocations and `STEP_UP_MISSING` admissions are in `PlatformGovernanceAudit`
(`docs/runbooks/coreedge-step-up.md`), which this screen does not show. To
answer "what did this admin do", query both.

It is not shown to `support` users or to anyone scoped to an organization: the
rows belong to no organization, and the people in them are platform admins.

To find one write from a correlation id:

```sql
SELECT e.*, o.*
FROM "PlatformAuditEvent" e
LEFT JOIN "PlatformAuditOutcome" o ON o."eventId" = e.id
WHERE e."correlationId" = '<id from x-correlation-id>';
```

## Adding another route that writes to SAP

`tests/unit/security/sap-write-audit-coverage.test.ts` fails for any file that
imports a SAP-writing helper (`createSapEntitySetRecord`,
`deleteSapEntityByLocation`, `runCapabilityWriteTest`) and does not
`await beginPlatformAudit(...)` before calling it and `completePlatformAudit(...)`
after. The `catch` around `beginPlatformAudit` must end with
`return platformAuditUnavailable()` (or rethrow): a catch that logs and carries
on, or a `.catch()` on the promise, fails the test, because the route would then
write to SAP with no row. Imports are resolved to files, so an `@/` path, a
relative path and a folder `index.ts` count the same. The test also fails for a
new lib module that wraps or re-exports one of those helpers (a barrel is a
wrapper), for a file that names a helper without importing it from the module
that defines it, and for a new POST, PUT, PATCH, MERGE or DELETE in the modules
that talk to SAP, until someone classifies it. Follow
`src/app/api/sap/tdd/write/route.ts`.

## On the console pipeline (P0.14b)

Both write routes now send to SAP only through a console call in write mode
(`openConsoleCall(..., mode: "write")`, `src/lib/governed/console.ts`):
`callSapWrite(handle, fn)` takes the handle `beginPlatformAudit` returned, so
the write cannot reach SAP before its row exists. After the row is written,
the deployment tenant's host is checked against the SAP host allow-list; under
`COREEDGE_ENV_TENANT_HOSTS=enforce` an unlisted host is refused `403
HOST_NOT_ALLOWED` and the row is completed `BLOCKED` with that reason. The
default, `observe`, changes nothing here. The A.3 #9 static test
(`tests/unit/security/no-side-doors.test.ts`) covers both routes; see
`docs/runbooks/coreedge-console-pipeline.md`.
