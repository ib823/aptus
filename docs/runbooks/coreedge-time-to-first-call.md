# Runbook: Time to first call (P2.12)

Roadmap item P2.12 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.4; targets in Appendix A.3 #1 and #2). "Seamless" was not measured. CoreEdge
now records the first occurrence of each milestone on a developer's way to a
first call, and shows two measures as median and 90th percentile against the
roadmap's targets:

| Measure | From | To | Target (median) |
|---|---|---|---|
| Time to first call (TTFC) | a developer workspace is created (self-service sign-up, P0.13) | the organization's first successful call of any kind: a SANDBOX console read, a Test Console run or a broker call, in any environment | 30 minutes or less (60 for ABAP on-premise) |
| Time to first real call (TTFRC) | an app's first access request for DEV, TEST or PROD | that app's first successful governed call on DEV, TEST or PROD (broker read or write, or a Test Console run) | 1 business day or less |

TTFRC is shown in three parts: **approver wait** (a request to its decision;
once the app has called, only the requests that call needed: those decided by
then, in the call's environment when there are any, so a parallel PROD or
write request still waiting is not counted), **SAP set-up wait** (a connection's first save to its first successful probe,
less any time already counted as approver wait) and **developer time** (the
rest).

One new setting, `COREEDGE_JOURNEY_EVENTS` (default on). Nothing here changes
what any user may do: it is a measurement.

## Where it is shown

- **Operations board**, `/coreedge/operations`, below the lanes: this
  organization's own figures (its workspace's TTFC; each of its apps' TTFRC).
- **Control Tower**, `/control-tower/journey` (new rail entry "Time to first
  call", and a card on the Control Tower home): the caller's organization, or
  every organization for a platform admin with none.
- The design-system page (`/coreedge/design-system#journey`) renders the tiles
  from fixed sample milestones; it is what the axe scan measures in both themes.

## The milestones

Table `DeveloperJourneyEvent`, one row per first occurrence. The unique key
`(organizationId, kind, scopeKey)` makes every write `ON CONFLICT DO NOTHING`,
so the first time is the one kept.

| Kind | First of | Written by |
|---|---|---|
| `WORKSPACE_CREATED` | the workspace | developer sign-up, when the clicked link creates the account and its organization (`createDeveloperWorkspaceUser`) |
| `INTERFACE_REGISTERED` | each app | `POST /api/studio/interfaces` |
| `GRANT_REQUESTED` | each grant | `POST /api/studio/access-grants` (at the grant's `createdAt`) |
| `GRANT_DECIDED` | each grant | Studio `PATCH /api/studio/access-grants`, CoreEdge `POST /api/coreedge/requests/:id/decide`, Control Tower `PATCH /api/control-tower/grants` (at `decidedAt`; `detail` is the decision) |
| `KEY_ISSUED` | each (app, environment) | `issueClientToken` (Studio clients route) and `claimKey` (claim links, `detail: claim_link`) |
| `CONNECTION_SAVED` | each connection | `POST /api/studio/connections`, new connections only (a re-save is rotation, not set-up) |
| `CONNECTION_PROBE_OK` | each connection | the Studio connection test, Operations "Probe now", the nightly probe sweep; only an `OK` probe |
| `FIRST_CALL` | each (app or console, environment) | the broker read and write routes (`detail: broker`), the Test Console (`test-console`), and a SANDBOX preview read in Discover (`console`; reads of real systems from the console are a person looking, not an app calling, and are not recorded) |

Every write happens after the action's own write, catches its own failure and
logs `[journey] milestone not recorded`: a measurement never costs anyone a
sign-up, a decision or a key.

**The broker's hot path.** `noteFirstCall` checks a per-process set first. Once
an instance has recorded (or found) the first call for an (app, environment),
every later call returns without touching the database, so the database sees
at most one no-op insert per (app, environment) per instance lifetime. The
nightly probe sweep goes through the same guard. The set is capped at 10,000
keys and cleared when full (worst case: one more no-op insert per key).

## What happens on deploy

1. Migration `20261023030000_developer_journey_events` creates the empty
   table, with indexes and a foreign key to `Organization` (cascade).
   Additive; the running code neither reads nor writes it, so it is safe ahead
   of the new code.
2. **No backfill.** Journeys are measured from milestones recorded after the
   deploy. The first call of an app that already exists cannot be recovered
   once the northbound audit retention has pruned it, and a guessed start
   would put wrong numbers on a north-star tile.
3. Existing organizations and users see two new things: the tiles (showing
   "No journeys yet" until milestones arrive) and a Control Tower rail entry.
   Nobody loses access to anything.
4. In the first days, expect:
   - each existing app's first broker call after the deploy to write one
     `FIRST_CALL` row. It has no recorded request before it, so it starts no
     journey; if that app later requests a new environment, it is counted as
     "already calling a real system" and excluded rather than measured;
   - the first nightly sweep to write one `CONNECTION_PROBE_OK` per healthy
     connection (one insert each, once);
   - grants requested before the deploy and decided after it to write a
     decision with no request, which starts nothing.

## Reading the tiles

- **Median and p90** are nearest-rank percentiles.
- **"At least"** before a figure: some journeys are still open and are counted
  at their elapsed time, which can only grow, so the figure is a floor. It is
  exact once enough finished journeys sit at or below it.
- **Open journeys.** TTFRC keeps them in the median (A.3 #2: "Unfinished SAP
  set-up is reported, not excluded") and says what each is waiting on now: an
  undecided request (approver), a saved connection with no good probe yet (SAP
  set-up), or neither (developer). TTFC counts sign-ups that never called but
  leaves them out of the median: that is drop-off, which the milestone list
  shows, not a slow first call.
- **Verdict.** "Too few to judge" below 10 journeys (A.3 #1: "at least 10
  observed users"). "Not settled" when the median is a floor under the target.
  Otherwise "Meets the target" or "Misses the target", on the median.
- **Parts.** Each part is its own median over the same journeys, so the three
  need not add up to the total's median. Within one journey they add up
  exactly: approver wait + SAP set-up wait + developer time = the journey.
- **Window.** Journeys that started in the last 90 days; milestones up to 90
  days before that are read so a journey sees a connection saved earlier.
  First calls are read whatever their age: each is written once per app and
  environment, so an app first called long ago is still known to be "already
  calling a real system" when it raises a new request.
  One read is capped at 50,000 rows; past that the tile says it covers only the
  earliest part of the window.

## Operating

```bash
# Stop recording (Vercel -> Settings -> Environment Variables), then redeploy.
COREEDGE_JOURNEY_EVENTS=off
```

```sql
-- What has been recorded for one organization, oldest first
SELECT kind, "scopeKey", "solutionId", environment, detail, at
FROM "DeveloperJourneyEvent"
WHERE "organizationId" = '<org id>'
ORDER BY at;

-- Volume by kind (rows are bounded by apps x environments, grants and
-- connections, never by traffic)
SELECT kind, count(*) FROM "DeveloperJourneyEvent" GROUP BY kind ORDER BY kind;
```

A milestone that failed to write (database outage) is retried on the next
call or probe for the broker and probes; a governance milestone (request,
decision, key, connection save, interface, sign-up) is not retried, and the
journey it belonged to is then measured from what was recorded (or not at all
if its start is missing).

## Rollback

Roll back the code and the table is simply no longer written or read. To stop
writing without a rollback, set `COREEDGE_JOURNEY_EVENTS=off`. Dropping the
table is never needed for safety; if wanted, do it in a new migration, never by
editing `20261023030000`.

## Open decisions

These need a person's decision; the code takes the stated interim position.

- **The business-day calendar.** A.3 #2 says "1 business day". Interim: 24
  hours of weekday time in UTC; Saturdays and Sundays do not count, holidays
  and the customer's time zone are not modelled. Decide the calendar (per
  organization? which holidays?) and whether "business day" means 24 weekday
  hours or a working day of 8 hours.
- **DEV only, or any real environment?** A.3 #2 measures to "the first audited
  200 on a real DEV tenant"; the delivery brief said a PROD or TEST call.
  Interim: any real environment (DEV, TEST or PROD), from the app's first
  real-environment request to its first real-environment call. Decide whether
  the target applies to DEV only and whether TEST and PROD get targets of their
  own.
- **Consumer type.** A.3 #1 sets 60 minutes for ABAP on-premise and counts the
  median per consumer type (JS/TS, Python, Java, .NET, ABAP, Power Automate, an
  MCP agent, the Lab). Nothing records which one a developer used, so every
  journey is judged against 30 minutes. Decide where the consumer type comes
  from (SDK user agent, starter kit choice, a question at sign-up).
- **SAP set-up before CoreEdge sees it.** SAP-admin set-up wait starts when a
  connection is first saved. Waiting for SAP Basis to hand over credentials
  before that counts as developer time. P2.10 (SAP admin checklist) could
  record a "set-up requested" milestone; decide whether it should.
- **Who counts as a TTFC journey.** Only self-service developer workspaces
  (sign-up with `COREEDGE_DEVELOPER_SIGNUP=open`). Organizations created by an
  admin and invited users are not measured. Decide whether an invited
  developer's first call should be its own journey (per user rather than per
  organization).
- **Retention.** Rows are few (bounded by apps, environments, grants and
  connections) and are deleted with their organization. No retention period is
  applied; `actorUserId` names the person who caused a milestone, as the audit
  tables do. Decide a retention period if one is required.
- **Backfill.** Not done (see deploy step 2). A partial baseline could be
  derived from `ApiAccessGrant`, `SapConnection`, `SapConnectionProbeEvent`
  and the retained `NorthboundAuditEvent` rows; decide whether a labelled
  "reconstructed" baseline is worth having.

## Verifying

- `pnpm vitest run tests/integration/developer-journey.test.ts` (needs
  `TEST_DATABASE_URL`): every milestone fired by its real route, once; the
  Control Tower endpoint's tile; the three-part split on pinned instants.
- `pnpm vitest run tests/integration/developer-onboarding.test.ts`: a sign-up
  starts the clock and the first sandbox read stops it.
- `pnpm vitest run tests/unit/coreedge/journey-metrics.test.ts tests/unit/coreedge/journey-recording.test.ts tests/unit/coreedge/journey-tiles.test.tsx`:
  the computation, the cheap guard and the tiles.
- `pnpm test:a11y` scans the design-system page (the tiles) and
  `/control-tower/journey` in light and dark. The Control Tower scan is
  limited to the page content (`main[data-studio-main]`): the Studio shell
  around every Control Tower screen fails color-contrast in dark today (rail
  text 1.99:1, tenant chip 1.66:1), which is the shell's defect and not this
  screen's.
