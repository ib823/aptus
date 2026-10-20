# Runbook: cron job leases

## What this is

Every scheduled job in `vercel.json` runs inside a **job lease** (roadmap item
P0.18). Vercel can deliver the same scheduled invocation more than once, and a
long run can still be going when another invocation arrives. Before leases, a
duplicate did the whole job a second time, at the same moment as the first.

| Job (CronRunLog `job`) | Route | Schedule (UTC) | `maxDuration` |
|---|---|---|---|
| `trials` | `/api/cron/trials` | 02:00 | 300 s |
| `analytics` (and `coreedge-usage`, which runs in the same route) | `/api/cron/analytics` | 03:00 | 300 s |
| `northbound-reap` | `/api/cron/northbound-reap` | 03:30 | 300 s |
| `northbound-retention` | `/api/cron/northbound-retention` | 03:45 | 300 s |
| `connection-probes` | `/api/cron/connection-probes` | 04:00 | 300 s |
| `lane-checks` | `/api/cron/lane-checks` | 04:30 | 300 s |

## How it works

- **One row per job** in `JobLease` (`job`, `holder`, `acquiredAt`,
  `expiresAt`). Code: `src/lib/ops/job-lease.ts`, used by `runWithCronLease`
  in `src/lib/ops/cron.ts`.
- **Claim:** one statement, `INSERT … ON CONFLICT ("job") DO UPDATE … WHERE
  "expiresAt" <= now()`. It wins when there is no row or the row has expired,
  and returns nothing when a live lease exists. Of any number of simultaneous
  claims, exactly one wins.
- **No advisory locks.** A session-level `pg_advisory_lock` belongs to the
  database session. Behind a pooler in transaction mode that session is the
  pooler's, not the run's, so the lock is not reliable there. The lease is an
  ordinary row and needs no session.
- **Release:** the holder deletes its row when the work ends, whether the work
  succeeded or threw. The delete matches the holder, so a run that outlived its
  lease cannot delete its successor's.
- **TTL: 10 minutes** (`JOB_LEASE_TTL_MS`), twice the 300 s `maxDuration` of
  every cron route. A function killed at `maxDuration` never releases its lease.
  The lease then expires on its own within 10 minutes, long before the next
  daily schedule. `tests/unit/ops/cron-lease-coverage.test.ts` fails if a cron
  route has no `maxDuration`, or one the TTL does not outlast.
- **Clock:** expiry is judged on the database's clock (`now()`), stored as UTC.
  App instances whose clocks disagree still agree on whether a lease has
  expired.

## What a skipped invocation looks like

An invocation that finds the lease held does no work and:

- answers **HTTP 200** with
  `{"data":{"job":"…","skipped":"lease held","leaseHeldSince":"…","leaseHeldUntil":"…"}}`.
  This is not an error: the job is running, just not in this invocation.
- writes a `CronRunLog` row with `ok = true`, `skipped = true` and that summary.
  A skipped `analytics` invocation writes one for `coreedge-usage` too.

The Operations jobs strip shows the last **real** run as the outcome and adds
"N duplicate skipped" beside the history. Screens that ask what the last run
found (the lane board, catalogue health, the usage screen) ignore skipped rows.

`leaseHeldSince` tells the two causes apart:

- **A second or two before the skip:** a duplicate delivery. No action needed.
- **Minutes or hours before:** a run is still going (or died and its lease has
  not expired yet). Check the previous run's function logs.

## Operating it

**See who holds what:**

```sql
SELECT job, holder, "acquiredAt", "expiresAt", "expiresAt" > (now() AT TIME ZONE 'UTC') AS live
FROM "JobLease";
```

Normally the table is empty between runs.

**Re-run a job by hand** (with `CRON_SECRET`):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/<job>
```

If the answer is `"skipped":"lease held"`, a run holds the job. Wait for it to
finish, or until `leaseHeldUntil`.

**Clear a lease left by a killed run**, only when you know no run is going
(the function logs show the holder ended, for example at its `maxDuration`):

```sql
DELETE FROM "JobLease" WHERE job = '<job>' AND "expiresAt" > (now() AT TIME ZONE 'UTC');
```

Otherwise it expires on its own within 10 minutes of when it was claimed.

**If claiming the lease fails** (database unreachable), the route answers 500
and records a failed run with `error: "job lease could not be claimed: …"`.
Nothing runs without the lease. Every job needs the database anyway.

## The sweeps are safe to run twice

The lease stops duplicate deliveries. A run that hangs past the TTL can still
overlap the run that took its lease over, so each sweep is also safe to run
twice at once (`tests/integration/cron-sweep-idempotency.test.ts`):

| Job | Why a second concurrent run is harmless |
|---|---|
| `trials` | One conditional `UPDATE … WHERE subscriptionStatus = 'TRIALING' AND trialEndsAt <= now`. Each trial is expired once, counted once, and an organization activated mid-run is never written back to `TRIAL_EXPIRED`. |
| `connection-probes` | The status write is a compare-and-set on the status the sweep read, so exactly one sweep records each healthy-to-failing transition and sends its alert. |
| `northbound-reap`, `northbound-retention` | Deletes re-check their predicate at deletion time. |
| `analytics`, `lane-checks` | Upserts on unique keys, which write the same values again. |
| `coreedge-usage` | Each day is one transaction that makes the day match its audit rows. |

## Deploy and backout

Migration `20261021030000_job_leases` is additive. It creates `JobLease` and
adds `CronRunLog.skipped` (default `false`). The code before this release
never reads either.

Backout: roll the deployment back, then, if wanted:

```sql
DROP TABLE "JobLease";
ALTER TABLE "CronRunLog" DROP COLUMN "skipped";
```

Drop the column only after the rollback. The released code writes it on every run.

No environment variable is involved. A lease never blocks a user request, only
a second copy of a scheduled job.
