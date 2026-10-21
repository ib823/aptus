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
and says where they are issued.

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
  route refuses a write key that would never end (review round 1). The route
  re-checks every gate. The key is shown once.
- **Allow writes and the write secret (Studio > Connections).** The form now
  has an "Allow writes" box and, when ticked, a write-secret field. A save that
  turns writes on is audited and stepped up as `connection.enable_writes`
  (otherwise `connection.save_secrets`, as before). "On" means live, as PATCH
  judges it: the row active AND allowing writes. A save always leaves the row
  active, so re-saving a DEACTIVATED connection with writes kept on is a save
  that turns writes on: it is stepped up as `connection.enable_writes`, and its
  audit row carries `writesEnabled: true` and `isActiveBefore: false` (review
  round 1).
- **A re-save keeps writes on.** Re-saving a connection whose writes are live
  (how credentials are rotated) starts with the box ticked; the builder
  re-enters the write secret like every other secret. Unticking it says, before
  Save, that the save turns writes off. A deactivated connection starts
  unticked, so rotating it does not quietly re-arm writes an operator stopped.

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
4. The Operations > Tokens write-key count can drop: write keys on expired
   credentials are no longer counted. Nothing was callable through them.
5. The SAP systems "Metadata" column fills with each service's own answer at
   the next lane sweep (04:30 UTC) or Re-check. Until then it shows the
   previous values. A lane whose own service refuses `$metadata` with 403 is
   drawn "SAP refused" from then on.

## Backout

Roll the code back first. Then, if the columns must go:
`pnpm migrations:backout-sql 20261025010000_truthful_registers` prints the SQL
(`backout.sql` beside the migration) with its `_prisma_migrations` line. The
code before P0.3 never reads or writes either column, so dropping them is never
needed for safety. Dropping loses the import times (Catalogue Health before
P0.3 judges from `updatedAt` again, as it did) and the key tails recorded since
the deploy.

## Open decisions

- **Backfilling key tails is impossible** (only hashes are stored). Whether to
  ask owners to rotate pre-P0.3 keys so every console shows a matching
  reference is the product owner's call; nothing is forced.
- **The status vocabulary has no audited literal for a per-service metadata
  403.** It is recorded as `FORBIDDEN` and drawn with the existing "SAP
  refused" chip; adding it to the vocabulary's audit list is left to the next
  vocabulary audit.
