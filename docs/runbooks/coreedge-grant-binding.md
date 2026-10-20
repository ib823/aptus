# Runbook: Governance gates (`COREEDGE_GRANT_BINDING`, owner liveness)

Roadmap item P0.1 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): audit findings A46, A47, A52 and A69, and the batch-1 residual races.

## What changed, in one paragraph each

**A grant authorises one interface, on one SAP product (A47).** A grant used to
store only (solution, service id, operation, environment), so one approval
reached any interface with the same service id that was added later, including
one on a different SAP system. `ApiAccessGrant` now carries `interfaceId` and
`sapProduct`. Every request is bound when it is raised (the Studio dialog sends
the interface; an older caller that sends only a service id is bound to the one
interface it names, or refused when several match), and every decision binds the
request it settles. The broker serves a bound grant for its own interface only
(`src/lib/studio/grant-binding.ts`, `src/lib/northbound/access.ts`).

**No PATCH order reaches ACTIVE without the activation gates (A46).** A change
to the operation, entity set or service of an interface that stays ACTIVE runs
the same gates as activating it (entity set present, UPDATE never activated, a
write holds the full write chain in some environment), and is audited as
`PROMOTE`. The SAP product is not editable on an interface at all. The save is
a compare-and-set on the state the gates judged, so two edits sent at once
cannot merge into an ungated ACTIVE interface: the second answers `409
CONFLICT` and is made again on what the first wrote.

**Activating a twin connection is a typed 409 (A52).** Studio's "Activate" on a
connection whose product, environment and SAP client are already served by an
active connection answers `409 CONFLICT` naming the other connection, instead of
an empty 500.

**A departed owner is no owner (A69).** An owner slot counts only while it holds
an active user of the same organization. A claim link likewise mints nothing once
the person who sent it has been deactivated or has left the organization: it is
closed with that reason when opened. The credential gates (issue, rotate,
write key, claim link) and the promotion to ACTIVE judge ownership that way, and a nightly sweep moves every
ACTIVE app with a slot no live owner holds to RESTRICTED.

**Races.** Issue, rotate and revoke a key, issue a write key, send a claim link
and open one: each now runs in one transaction that first takes the Solution row lock (the lock the
owner-slot PATCH and every decision door already took), re-checks the owner
gate while holding it, and closes the lane's pending claim links in the same
transaction as the key write.

## What happens on deploy

Nothing that works today stops without an operator choosing it.

- The migration `20261022000000_grant_interface_binding` adds the columns and
  binds each existing grant to the single interface it matches today (same
  solution, service id and operation, which is what the broker matched on),
  provided that interface existed when the request was raised. A grant that
  matches several interfaces today is marked `AMBIGUOUS`, even when only one of
  them is older than the grant (the old broker serves it on all of them); one
  that matches none, or only an interface added after it, `NO_MATCH`. Both stay
  unbound and keep the old matching under `legacy`. So a bound grant authorises
  exactly what it did before: the one interface it ever matched.
- `COREEDGE_GRANT_BINDING` defaults to `legacy`: an unbound grant keeps the old
  matching, and each call it authorises stamps `unboundLastUsedAt` (at most
  hourly per grant) and logs `[grant-binding] an unbound legacy grant authorised a call`.
- **Only on interfaces that existed at the deploy.** The migration stamps every
  grant it leaves unbound with the deploy time (`unboundCutoffAt`). Under
  `legacy` an unbound grant is honoured only on an interface created by then; a
  grant the old code created during the rollout (never stamped: `--apply` does
  not stamp) uses its own creation time instead. An interface added after the
  deploy carried no traffic before it, so this stops nothing that worked; it
  stops an old approval from reaching a new interface, on another SAP system
  say, which is exactly A47. A call there is refused with the re-approval
  message below, under `legacy` as under `strict`, and the fix is the same: a
  request raised from that interface and approved by a second person.
- Grants created by the old code during the rollout are unbound with no reason
  yet. Run `pnpm grants:binding --apply` after the deploy to bind them (or flag
  them). `--apply` never touches a grant already flagged `NO_MATCH` or
  `AMBIGUOUS`, and never binds a grant to an interface added after it was
  raised: an interface added later, on another SAP system say, is not what
  anybody approved. A flagged grant is cleared only by re-approval.
- A pending request that matches several interfaces, or that the migration
  flagged, can no longer be approved, only rejected (and raised again from its
  interface). A pending, unflagged request that matches exactly one interface
  that existed when it was raised is bound to it when it is decided.
- On the first night, the owner sweep moves every ACTIVE app whose owner was
  deactivated, deleted or moved to another organization to RESTRICTED, with a
  `ConfigAudit` row (actor `system:owner-liveness`). **RESTRICTED stops no
  runtime call**: the app's keys keep working, and so does its monitoring: the
  04:30 UTC lane checks cover ACTIVE and RESTRICTED apps alike
  (`LANE_CHECKED_APP_STATUSES`, `src/lib/coreedge/lanes.ts`), because both carry
  traffic. Issuing or rotating its key is refused until someone live claims the
  empty slot.

## Where approvers see unbound grants

- **Control Tower → Access governance**: a "need re-approval" count, and a flag
  on each unbound live grant with when it was last used.
- **CoreEdge → Requests**: an "Approved access that needs re-approval" table,
  most recently used first.
- **Studio → API Access**: the product a grant is bound to, or the re-approval
  flag.

To clear one: raise a new request from the interface it is for, have a second
person approve it, then revoke the old grant in Control Tower.

## Switching to strict

1. `pnpm grants:binding --apply` (checks the grants the old code created during
   the rollout; idempotent, and it never binds a flagged grant).
2. `pnpm grants:binding` shows the counts: unbound by reason, how many are still
   live, and how many were used in the last 7 days.
3. Re-approve or revoke each live one until `pnpm grants:binding --check` exits 0.
4. Set `COREEDGE_GRANT_BINDING=strict` in the deployment and redeploy.

Under strict an unbound grant's calls are refused with `403` and error code
`FORBIDDEN`, the code every missing-grant refusal carries; what tells them apart
is the message, "The access grant for this capability was approved before grants
were bound to one interface, and this deployment does not honour such grants on this interface.
Ask for it to be approved again against this interface." (The broker's internal
reason is `GRANT_NEEDS_REAPPROVAL`; it is not sent on the wire, and the
northbound call log records the status only.) Because strict is switched on only
once `--check` reports no live unbound grant, these refusals should not occur;
if one does, the grant is on the re-approval lists. **Rollback:** set it back to `legacy` (or unset
it) and redeploy; nothing is migrated by the switch.

## The owner sweep

It rides the `northbound-reap` cron (daily 03:30 UTC) and its job lease, and
records its own `CronRunLog` row as `owner-liveness` (`checked`, `restricted`,
`skipped`), shown in the Operations jobs strip. Each drop is made in its own
transaction under the Solution row lock, on a re-read made while holding it, so a
colleague reclaiming the slot at the same moment is never overwritten. The stale
owner ids stay in their slots; Studio shows them as "no longer in this
organization".

To recover an app: someone who will answer for it claims the empty slot in Studio
and promotes the app to ACTIVE again. Promotion is judged on live owners too, so
"Promote to ACTIVE" is refused (`409`, naming the slot) while a departed owner
still holds a slot, and an edit to an ACTIVE app in that state moves it to
RESTRICTED at once, as the sweep would.

## Checking it worked

```sql
-- Unbound grants, by reason
SELECT "unboundReason", count(*) FROM "ApiAccessGrant" WHERE "interfaceId" IS NULL GROUP BY 1;

-- Unbound grants still carrying traffic in the last 7 days
SELECT id, "organizationId", "externalId", "environment", "unboundLastUsedAt"
FROM "ApiAccessGrant"
WHERE "interfaceId" IS NULL AND "unboundLastUsedAt" > now() - interval '7 days';

-- What the owner sweep did
SELECT "startedAt", ok, "summaryJson" FROM "CronRunLog"
WHERE job = 'owner-liveness' ORDER BY "startedAt" DESC LIMIT 5;
```
