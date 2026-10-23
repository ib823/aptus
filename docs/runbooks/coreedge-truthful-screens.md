# Runbook: Truthful registers and screens (P0.3)

Roadmap item P0.3 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): audit findings A29, A30, A45, A51, A58, A59, A61, A62 and A63, and the
missing screens that kept creates from being switched on.

No setting was added and none changed. Nothing on the call path refuses a call
it served before: every change here is to what a screen or a register says, or
adds a screen for an action whose route (and every gate behind it) already
existed.

## What changed, in one paragraph each

**Catalogue Health judges the import time (A29).** Freshness was judged from
`MAX(SapHubContent.updatedAt)`, and every capability probe (Probe all, the
explorer's own probe) stamps `updatedAt` when it records a tenant's answer, so
one Probe all made a catalogue imported years ago read CURRENT. A new column,
`SapHubContent.importedAt`, is written only by imports (the Rebuild and the
bundled imports in `hub-content/seed`, the harvest import,
`scripts/import-sap-hub-content.ts` and `scripts/ingest-sap-api-hub-oauth.ts`).
`/api/ops/catalogue-health` reads its oldest and newest import, and its
freshness, from that column. The migration backfills it from the importer's
own stamp (`rawMetadataJson.importedAt`), else from `updatedAt` on a row no
probe has written, else from `createdAt`; the last case can only make a
catalogue read older than it is, never fresher.

**The SAP systems "Metadata" column is that service's own answer (A30).** The
lane check recorded, under every service on a system, the `$metadata` answer
of the connection's default probe path (its apiPath or the product's first
curated service). It now asks the lane's own service, resolved exactly as the
read is (`fetchMetadataDocument`, the request `probeConnection` makes), once
per connection and service per sweep. Asked of one service, a 403 from the
tenant means SAP refused that service after a successful sign-in, so it is
recorded as `FORBIDDEN` and drawn "SAP refused" (owner: the client's SAP
admin). It used to be classed with a 401, which the board and the SAP systems
screen read as "SAP rejected our sign-in, every lane on this system stops".
Only a tenant's 403 counts: a token endpoint (or its gateway) answering 403
means CoreEdge never signed in and no `$metadata` request was sent, so it stays
`UNAUTHORIZED`, "sign-in refused", the platform admin's (review round 1).

**One masked key reference (A45).** The claim page showed the key's last four
characters and promised "your lane shows only the reference"; the consoles
showed the last four of the key's label. `SolutionClient.tokenTail` now holds
the key's own last four, written by every mint (Studio issue and rotate, the
claim link). The CoreEdge keys screen, app settings, Studio API Access and
Operations > Tokens all show `prefix…tail` from it. A key minted before this
release has no tail recorded (only its hash is stored, so there is nothing to
backfill from): the screens say "ending not recorded" until its next rotation.

**The tail always names the current key (integration review round 4).** The
code before this release does not know the column. Rolled back to it, a
rotation, a re-issue or a collected claim link wrote a new key and left the
previous key's tail in place, so after rolling forward every screen showed
the reference of a key that no longer existed. Migration
`20261025040000_token_tail_binding` adds a database trigger
(`SolutionClient_token_tail_binding`): an UPDATE that changes `tokenHash`
without writing a new `tokenTail` clears the tail, whichever build sends it,
so the screens say "ending not recorded" instead. Every mint in this release
writes both in one statement and keeps its tail; a new key whose last four
equal the old key's (one in 64^4) is cleared too, which is never a wrong
reference. A trigger, not a check on each screen, because the screens never
read the hash (`tests/unit/ops/ops-endpoints.test.ts`,
`tests/unit/coreedge/pr6-screens.test.ts`).

**Every cron is on the jobs strip (A51).** The strip's list lived in the jobs
route and omitted `northbound-retention` and `lane-checks`.
`src/lib/ops/scheduled-jobs.ts` now lists every job that records a run, with
the route that runs it. `tests/unit/ops/scheduled-jobs-coverage.test.ts`
fails when vercel.json schedules a cron, or a cron route records a job name,
that the list does not have.

**The passport lists only access in force (A58).** It selected approvals by
their stored decision, so an expired grant stayed on the CIO's screen as
current access, and since D2 (a sandbox request is approved as APPROVED) every
new sandbox approval was listed as data leaving the client's system. The
passport and the SAP systems list's "bound lanes" now take a grant only while
it is unrevoked and unexpired by the broker's clock (`effectiveDecision`, then
`grantsRead`), and the passport never lists SANDBOX by environment. Its
subtitle, tiles and legend now say what it lists (approvals in force, reads and
writes) and what it leaves out. Its rows are keyed by grant: they were keyed by
app, feed and environment, which a READ and a CREATE approval for one feed
share, so React could drop one of the two (found in the manual pass). Each
row now has an Access column ("Read", "Write: create", "Write: update"), so a
READ and a CREATE approval for one feed no longer render as two identical
lines, and the "Writes into SAP" tile counts only approvals the broker lets
write (`grantsWrite`): a CREATE or UPDATE approval decided READ_ONLY reads
"... approved read only: no write" and is not counted (review round 1).

**Registers say what the deployment tenant serves (A59).** Control Tower's
connection register and the Operations connection health view said the
deployment's env tenant was "in use" whenever an organization had no
connection, "the broker's own fallback rule". The broker has no such rule: an
app reaches SAP only through its own organization's connections and is refused
with CONNECTION_NOT_CONFIGURED without one. Both responses now carry two facts:
`brokerReachable` (an active connection exists) and `deploymentTenant` (the env
tenant exists and serves console and explorer reads for every organization,
`servesBroker: false`). The screens show both. The response fields
`deploymentFallback`, `fallbackIsShared` and `noHealthForFallback` are gone;
only the two screens read them.

**Live means authenticates now (A61, A62).** The portfolio and the throttle
view already used the broker's own predicate (`liveKeyWhere`, P0.11), so an
expired credential is not "live" there; a regression test now pins it beside
the rest. Operations > Tokens counted write keys on every row, revoked and
expired included, and explained a zero as "by design" because "no code path
issues a write credential". It now counts write keys on live credentials only
and says where they are issued. Control Tower's credential register
(`/api/control-tower/tokens`, `counts.withWriteSecret`) counted them over
every row too, so the two registers disagreed once a credential holding a
write key expired (an expiry, unlike a revocation, leaves the sealed key in
the row); it now counts with the same predicate and says so in its
provenance (review round 3). Both counts also leave out the credentials of a
RETIRED app (review round 4): retiring an app does not revoke its
credentials, so an unexpired one keeps its sealed write key, but
authentication refuses every call with it (`SOLUTION_RETIRED`). One shared
count, `countPresentableWriteKeys` in `src/lib/ops/write-keys.ts`, serves both
registers.

**An app with no feeds has a board (A63).** The lane board called notFound()
when an app had no lanes, and an app with no feeds has none, so a new app's
owner was told it did not exist on the only screen that links to "Add data
feed". The board now asks whether the app exists (`getApp`) separately; an app
with no feeds shows the empty state with its Add data feed and App settings
links.

## Creates can be switched on from the screens

Three steps had a route and no screen, so a create interface could not reach
its first 201 without calling the API by hand:

- **Issue write key (Studio > API Access > Runtime credentials).** Each
  credential row now offers "Issue write key", or "Replace write key" once one
  exists (replacing asks first: the current key stops at once). It calls
  `POST /api/studio/clients/write-credential` through the step-up helper, so it
  asks for a passkey (`write_key.issue`) once `COREEDGE_STEP_UP=enforce`. The
  row offers it only to someone who does not own the app, on a live credential,
  where an approved CREATE or UPDATE grant covers that environment; otherwise
  the control is disabled with the reason beside it. A TEST or PROD key with no
  expiry (minted before expiry was mandatory) is disabled too while
  `COREEDGE_KEY_EXPIRY` is enforced, with "rotate it first" beside it: the
  route refuses a write key that would never end (review round 1). It is also
  disabled, with the reason, on a RETIRED app (retiring leaves the app's keys
  "active", but the route refuses it) and on an app whose three owner slots are
  not all held by live members, a slot whose owner was deactivated or left
  counting as empty, as the route judges it (review round 2). The route
  re-checks every gate. The key is shown once.
- **Allow writes (Studio > Connections).** The form now has an "Allow writes"
  box. A save that turns writes on is audited and stepped up as
  `connection.enable_writes`
  (otherwise `connection.save_secrets`, as before). "On" means live, as PATCH
  judges it: the row active AND allowing writes. A save always leaves the row
  active, so re-saving a DEACTIVATED connection with writes kept on is a save
  that turns writes on: it is stepped up as `connection.enable_writes`, and its
  audit row carries `writesEnabled: true` and `isActiveBefore: false` (review
  round 1).
- **There is no connection write secret (wave 2 integration review round 3).**
  The form first asked for a "write secret" on every save that kept writes on,
  and the API refused `writeEnabled` without one, but nothing ever read it
  back: not the broker's write route (it checks the app's own write key,
  `x-coreedge-write-key`), not the SAP request, not the Workbench write-back
  (it checks the deployment's `{PREFIX}_WRITE_SECRET`). Any string switched
  writes on, so it told operators a second factor guarded writes when none
  did. The field and the requirement are gone. What guards a create is the
  connection's Allow writes switch (switched on only by a stepped-up, audited
  save), the app's approved write grant and its write key. A `writeSecret` an
  older API caller still sends is accepted and ignored: it is not sealed.
- **A re-save keeps writes on.** Re-saving a connection whose writes are live
  (how credentials are rotated) starts with the box ticked. Unticking it says,
  before Save, that the save turns writes off. A deactivated connection starts
  unticked, so rotating it does not quietly re-arm writes an operator stopped.
- **Writes are allowed for a system, not a row (review round 2).** A save that
  keeps writes on while changing the environment, the SAP host or base path
  (the base URL's origin and path, a trailing slash ignored: behind an
  API-management or other path-routed gateway, `/s4-dev` and `/s4-prod` on one
  host are two SAP systems, review round 3) or the SAP client switches writes
  on for that system for the first time, so it is `connection.enable_writes` too, and the audit row carries
  `writesEnabled: true`, `writeTargetChanged` (the parts that moved) and
  `environmentBefore`, `baseUrlBefore` and `clientBefore` beside the new
  values (every re-save now records these). The form starts the box unticked
  for such a save and says why; ticking it is the builder's explicit choice.
- **A form opened before the row changed is refused (review round 2).** The
  form sends what it showed for the row it replaces (`expected`: its
  `isActive` and `writeEnabled`, or null for a new key). If the row has changed
  since the page loaded (for example an operator deactivated it during an
  incident), the save answers 409 naming who changed it and when, and nothing
  is saved: reload and decide on what is true now. Before Save the form also
  says when saving a deactivated connection makes it active again.
- **The check and the write are one step (review round 3).** The save is
  judged on the row as read, then the passkey is asked and the bundle sealed;
  a Deactivate landing in between used to be overwritten (the row came back
  active and writing, unannounced). The write now locks the row and goes ahead
  only while it is still exactly the row judged (active, writes, environment,
  base URL, client and revision); otherwise nothing is written and the save is
  judged again on the row as it now is. A form that showed the old row then
  gets the 409 above; an API caller's save is told what it does to the new
  row (`reactivated`, `writesEnabled`) and its passkey is asked for that
  action. A row that changes three times during one save answers 409 "kept
  changing", and nothing is saved.
- **The toggle is held to the same rule (review round 4).** PATCH (Activate,
  Deactivate, writes off) judged its gates (the twin check, the refusal to
  turn writes on from the toggle and the passkey for a toggle that turns writes
  back on) on a read, then updated the row whatever had happened since. A
  builder without a passkey whose Activate had read the row while it was
  still active undid a Deactivate that landed after that read, and writes came
  back on with no passkey asked. The update now writes only while the row
  still has the `isActive` and `writeEnabled` it was judged on; otherwise
  nothing is written and the toggle is judged again, so a stale Activate then
  needs the passkey (403 under enforce) and a stale "writes on" is refused for
  the missing secret.
- **One warn-mode record per request (review round 4).** Under
  `COREEDGE_STEP_UP=warn`, a save or toggle judged again after the row changed
  used to write a `STEP_UP_MISSING` row for each judgement, one of them for an
  action that never happened (a secret save over the row as it had been). The
  passkey is now checked without I/O on each judgement, and the admission is
  recorded once, for the latest judgement, whether or not it was written.

An API caller that sends no `expected` is not checked, so nothing that saves
connections today is refused. A save that reactivates a deactivated row says
so in its response (`reactivated: true`, `reactivatedNotice`) and its audit
row (`reactivated: true`).

The API is unchanged for its callers: a POST without `writeEnabled` still
saves writes off. Over a connection whose writes were live, the response now says
so (`writesTurnedOff: true` and `writesNotice`) and the audit row records
`writesDisabled: true`; it is not refused, because off is the safe direction
and refusing would break an API caller that re-saves credentials today. PATCH
still refuses to turn writes on (it cannot supply the secret) and now names the
form that can.

`tests/integration/create-from-screens.test.ts` runs the whole path through the
real routes against PostgreSQL with SAP stood in: register the create
interface, save the connection from the form's own request body, request and
approve the write grant, issue the credential and the write key, activate, and
write; then rotate the connection from the form and write again, and save with
writes off and see the broker refuse.

## On deploy

1. The migration `20261025010000_truthful_registers` adds two nullable columns
   and backfills `importedAt`. It takes one pass over `SapHubContent` (a few
   thousand rows) and none over `SolutionClient`.
2. Catalogue Health may move from CURRENT to STALE for a type whose last import
   is older than 183 days but which was probed recently. That is the fix: run
   the file-based refresh it asks for.
3. Keys minted before the deploy read "ending not recorded" until their next
   rotation. Nothing else about them changes.
4. The Operations > Tokens write-key count, and Control Tower's
   `withWriteSecret`, can drop: write keys on expired credentials, and on
   retired apps' credentials, are no longer counted. Nothing was callable
   through them.
5. The SAP systems "Metadata" column fills with each service's own answer at
   the next lane sweep (04:30 UTC) or Re-check. Until then it shows the
   previous values. A lane whose own service refuses `$metadata` with 403 is
   drawn "SAP refused" from then on.

## Backout

Roll the code back first (Vercel Instant Rollback keeps the columns and the
trigger, and that is the safe default). While rolled back, every key change
clears that key's tail through the trigger; after rolling forward those keys
show "ending not recorded" until their next rotation, never another key's
ending. If the columns must go anyway, back out newest first:
`pnpm migrations:backout-sql 20261025040000_token_tail_binding` (the trigger),
then `pnpm migrations:backout-sql 20261025010000_truthful_registers` print the
SQL (`backout.sql` beside each migration) with its `_prisma_migrations` line.
The code before P0.3 never reads or writes either column, so dropping them is
never needed for safety. Dropping loses the import times (Catalogue Health
before P0.3 judges from `updatedAt` again, as it did) and the key tails
recorded since the deploy. Backing out the trigger alone, with the column
kept, brings the stale-tail hazard back for a rollback after it.

## Open decisions

- **Backfilling key tails is impossible** (only hashes are stored). Whether to
  ask owners to rotate pre-P0.3 keys so every console shows a matching
  reference is the product owner's call; nothing is forced.
- **System selectors inside the sealed credentials are not compared (review
  round 3).** A connection's writes are judged per system by environment, SAP
  host and base path, and SAP client. A SuccessFactors company ID, or a
  basic-auth user of the form `user@company`, also chooses the system, but it
  is sealed and not readable when the save is judged. Whether a change of
  company should count as moving writes (which would mean comparing a keyed
  digest of it, stored beside the row) is the product owner's call; until
  then, re-saving with another company and writes kept on is recorded as
  `connection.save_secrets`.
- **The status vocabulary has no audited literal for a per-service metadata
  403.** It is recorded as `FORBIDDEN` and drawn with the existing "SAP
  refused" chip; adding it to the vocabulary's audit list is left to the next
  vocabulary audit.
