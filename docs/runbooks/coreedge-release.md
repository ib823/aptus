# Runbook: CoreEdge release protocol and recovery (P0.17)

Roadmap item P0.17 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`,
section 8.2). Before it, "the release protocol" that P1.1 and section 1.5 rely
on was one sentence. There is one Vercel project, one production deployment
and one production database (`docs/deployment-urls.md` §1-2), so every deploy
of this repository is a CoreEdge release, whatever it changes. This runbook is
how each one goes out, how it is checked, and how it is taken back.

| Step | What | Evidence |
|---|---|---|
| 1 | Pull request with green `ci.yml` and `migration-integrity.yml` | the checks on the PR |
| 2 | Migrations additive only (expand/contract), each with written backout SQL | `pnpm migrations:check` (CI gate 0), the rehearsal (CI gate 4) |
| 3 | A Vercel Preview on its own database | `scripts/verify-preview-db-isolation.sh` PASS; `pnpm migrations:check --database` on the preview database |
| 4 | Promote: merge to `main`, then run the release's post-promote commands | the production build log; `/api/build` names the merge commit; each post-promote command's output |
| 5 | Post-deploy check: one SAP-standard read, one `Z*` read, one refused call, audit rows present | `pnpm release:post-deploy-check --markdown`, posted on the merged PR |
| 6 | Rollback, when needed: Vercel Instant Rollback plus backout SQL; after rolling forward, the post-promote commands again | the incident record; `prisma/backed-out-migrations.json` if a migration came out |

**Every production deploy records the checklist** (step 5) on the pull
request it came from. A deploy without a recorded PASS is not finished.

Nothing in this runbook changes what the application does. It adds two CI
gates, four operator commands and one record. No application setting, no
migration, and no change for any user.

---

## Step 1: a pull request with green CI

Work on a branch and open a pull request (`CONTRIBUTING.md`, "Workflow").

- **`ci.yml`** (Quality Gates): security audit, strict type check, strict
  lint, the generated client under strict, every unit and integration test
  against PostgreSQL, the production build, HTTP auth tests; E2E smoke and
  visual regression jobs after it. It runs on pull requests **to `main`**. A
  pull request stacked on another branch gets it when it is retargeted to
  `main`, or on demand (Actions, CI, "Run workflow").
- **`migration-integrity.yml`** (runs on every pull request and every push to
  `main`):
  - **Gate 0, the migration protocol** (`pnpm migrations:check --base
    origin/<the pull request's base branch>`, or the push's parent on
    `main`): see step 2. A pull request to `main` is held against
    `origin/main`; one stacked on a wave branch against that branch, so a
    wave branch that is behind `main` does not make its stacked pull
    requests look as if they removed the migrations `main` gained since.
  - Gate 1: the Brownfield reconciliation migration has no destructive
    statement.
  - Gate 2: migration history reproduces `schema.prisma` with zero drift
    (`pnpm db:check-drift` locally).
  - Gate 3: a database built with `prisma migrate deploy` boots the client.
  - **Gate 4, the backout rehearsal** (`pnpm migrations:rehearse-backout`): see
    step 2.

Merge only when both workflows are green on the pull request's last commit.

## Step 2: additive migrations, each with backout SQL

### Why additive only

Production runs `prisma migrate deploy` inside `vercel-build`, **before**
`next build` (`package.json`). So, for every release:

1. while the new deployment builds, the **old code serves on the new schema**;
2. if the build then fails, the old code **keeps** serving on the new schema;
3. a Vercel Instant Rollback (step 6) brings the old code back **on the new
   schema**: it runs no build, so no migration runs and nothing is undone.

A migration is safe only if the code before it runs correctly against the
schema after it. That is expand/contract:

- **Expand (any release):** a new table; a nullable column; a NOT NULL column
  **with a DEFAULT**; a new index; a foreign key on a new column; a backfill
  that fills only what this migration added.
- **Contract (a later release, never the one that stops using the object):**
  dropping or renaming a table or column, changing a column's type, `SET NOT
  NULL`, deleting rows. Only once no deployed code, including the deployment a
  rollback would bring back, reads the object. Such a migration carries a line
  saying why that is true now:

  ```sql
  -- Contract: nothing reads "Interface"."legacyFoo" since #331 (deployed 2026-11-02); the rollback target is #333.
  ```

`pnpm migrations:check` refuses, in every migration added after `520ee318`
without a `Contract:` line: `DROP` of any object (and `ALTER TABLE ... DROP`
except `DROP NOT NULL`), `DELETE FROM`, `TRUNCATE`, `RENAME`, a column type
change, `SET NOT NULL`, and `ADD COLUMN ... NOT NULL` without `DEFAULT`,
including inside a guarded `DO $$ BEGIN ... EXCEPTION WHEN ... END $$` or
`IF ... THEN` block. It reads only executable SQL (comments and string
literals are ignored), so it also refuses dynamic SQL (`EXECUTE '...'`,
`EXECUTE format(...)`) it cannot read: write the statement out instead. It
cannot judge everything: **in review, also ask** whether a new unique index or
constraint could refuse a write the old code makes, and whether a backfill is
safe to run while the old code writes the same rows.

### Backout SQL

Every migration added after `520ee318` (the Phase 0a deploy, the cutoff in
`scripts/lib/migration-protocol.ts`) carries the SQL that undoes it, in one of
two places:

- **New migrations: a `Backout:` section in the header of `migration.sql`.**
  A statement may run on over comment lines indented two or more spaces:

  ```sql
  -- Backout: ALTER TABLE "ApiAccessGrant" DROP CONSTRAINT "ApiAccessGrant_interfaceId_fkey";
  --          DROP INDEX "ApiAccessGrant_interfaceId_idx";
  --          ALTER TABLE "ApiAccessGrant" DROP COLUMN "interfaceId";
  ```

- **A migration already applied somewhere: a `backout.sql` file beside it.**
  Its `migration.sql` can never be edited (below), so its backout, or a
  correction to a wrong header, goes in `prisma/migrations/<name>/backout.sql`.
  Prisma reads only `migration.sql` from a migration directory, so the file
  changes nothing that is applied. When both exist, the file wins. P0.17 added
  one for each Phase 0b migration that had none: `20261022010000_credential_hygiene`,
  `20261023010000_contract_stamps`, `20261023020000_catalogue_address_verification`
  and `20261023030000_developer_journey_events`.

`Backout: none — <reason>` is allowed when nothing in the schema needs
undoing (for example a backfill of columns an earlier migration added); the
reason is required. The backout never touches `_prisma_migrations`: the
tooling does that (step 6).

Migrations at the cutoff (the 87 on `main` at `520ee318`, listed with their
checksums in `scripts/lib/migration-cutoff.json`) keep whatever they say.

### Never edit a migration a database may have applied

`prisma migrate deploy` records each migration it applies, with the SHA-256
of its file, and **never runs it again**. It does not even warn when the file
has changed since: an edited migration gives `No pending migrations to apply`
and exit 0. So an edit reaches every database built afterwards and never the
ones that already applied it, and the two silently disagree.

This happened in Phase 0a/0b. A column was added to
`20261022000000_grant_interface_binding` after a preview database had already
applied it, so the preview never got the column; the column had to move to a
new migration (`20261021090000_interface_grant_match_changed_at`, see its
header), and `20261022020000_retired_client_tokens` exists for the same
reason. **The rule: once a migration has been pushed, change it only by adding
a new migration.** A preview builds on every push, and applies the branch's
migrations to the preview database (step 3), long before `main` has them.

What enforces it:

- **Against `main` (CI gate 0, hard):** no migration at the cutoff or on
  the pull request's base branch (`origin/main` for a pull request to
  `main`; on a push to `main`, the commit before the push) may be
  modified, renamed or removed. A stacked pull request reaches `main` only
  through its base branch, whose own pull request to `main` is held
  against `origin/main`. The one exception is a migration recorded in
  `prisma/backed-out-migrations.json` (step 6).
- **Against a database (before promoting):** `pnpm migrations:check
  --database` compares the checksums the database recorded with the files
  here, and fails on any applied migration whose file has changed. Run it
  against the preview database in step 3.

### Commands

```bash
pnpm migrations:check                      # the rules, against the cutoff and origin/main
pnpm db:check-drift                        # history == schema.prisma (needs DATABASE_URL)
pnpm migrations:backout-sql <name>         # print one migration's backout script
BACKOUT_DATABASE_URL=postgresql://... \
  pnpm migrations:backout-apply <name>     # run it on that one database (step 6), after confirming its name
REHEARSAL_DATABASE_URL=postgresql://...localhost.../scratch \
SHADOW_DATABASE_URL=postgresql://...localhost.../scratch_shadow \
  pnpm migrations:rehearse-backout          # back out everything under the protocol, then roll forward
```

**The rehearsal** (CI gate 4) is what makes the backout SQL more than prose.
On a database built from history it backs out every migration under the
protocol, newest first, with exactly the script `migrations:backout-sql`
prints; checks the result has zero drift against the migrations kept; runs
`migrate deploy` again (the roll-forward); and checks zero drift against
`schema.prisma`. A backout that forgets an index, a constraint or a column
fails there. It is destructive to the database it is given: a host other than
`localhost`, `127.0.0.1`, `::1` or `postgres` is refused without
`--allow-remote`. If it fails half-way, drop that scratch database and build
a fresh one (`prisma migrate deploy`) before running it again.

## Step 3: a Vercel Preview on its own database

Every push to the pull request's branch builds a Vercel Preview, and
`vercel-build` runs `migrate deploy` against the **Preview** environment's
`DATABASE_URL`. This project's previews use their own Neon project, holding
synthetic data only, not production's
(`docs/neutral-discovery/PREVIEW-DB-RUNBOOK.md`).

1. **Verify the isolation** (read-only, needs the Vercel CLI linked to the
   project):

   ```bash
   ./scripts/verify-preview-db-isolation.sh
   ```

   It pulls each environment's `DATABASE_URL`, compares the Neon endpoint ids,
   and prints only a masked label and a fingerprint. **PASS** (exit 0): carry
   on. **FAIL** (exit 1) or **INCONCLUSIVE** (exit 2): stop. A preview would
   be migrating production; fix the Preview-scoped variables first
   (PREVIEW-DB-RUNBOOK step 2). Run it for every release that has a
   migration: the scope toggle on a Vercel variable is the one setting that,
   set wrong, defeats the separation.

2. **Check what the preview database applied:**

   ```bash
   DATABASE_URL="<preview direct URL>" pnpm migrations:check --database
   ```

   It fails if the preview database applied a different version of any
   migration in this branch (the Phase 0a/0b failure above). It also lists, as
   notes, migrations the preview database applied that this checkout lacks:
   **all previews share the one preview database**, so another branch's
   migrations appear here. Prisma ignores those on deploy. If it fails: restore
   the migration file as applied, put the change in a new migration, and, if
   the preview database must match, rebuild it from history
   (PREVIEW-DB-RUNBOOK steps 3-4; it holds synthetic data only).

3. **Click through the preview** (`CONTRIBUTING.md`: the preview URL is the
   point of the pull request), including the screens the change touches.

4. **Where the preview has a release canary** (open decision D3), run the
   post-deploy check against it, with `COREEDGE_CHECK_BASE_URL` set to the
   preview URL, the preview canary's key and interface ids,
   `COREEDGE_CHECK_AUDIT_DATABASE_URL` set to the preview database, and
   `COREEDGE_CHECK_PROTECTION_BYPASS` set to the project's protection bypass
   secret (Vercel, Settings, Deployment Protection).

5. **Optionally rehearse this release's backouts on the preview's data**, if
   step 2 listed no migration from another branch (otherwise the zero-drift
   comparison sees that branch's objects and fails):

   ```bash
   REHEARSAL_DATABASE_URL="<preview direct URL>" \
   SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scratch_shadow" \
     pnpm migrations:rehearse-backout --since <this release's first migration> --allow-remote
   ```

   This drops and recreates the release's objects in the preview database;
   their synthetic rows are lost. CI gate 4 already rehearses every backout on
   an empty database; this adds rows.

## Step 4: promote

Squash-merge the pull request (`gh pr merge --squash --delete-branch`). Vercel
builds production from `main`:

1. `scripts/check-production-env.js` refuses a production build with
   missing or dangerous settings;
2. `scripts/migrate-deploy-with-retry.mjs` applies pending migrations to the
   production database (retrying a cold Neon start);
3. the catalogue import, reconcile, lifecycle stamp and content check run;
4. `next build`. A failure anywhere leaves the previous deployment serving.

Watch the build log (`CONTRIBUTING.md`, "When the build fails on Vercel":
read the log before forming a theory). When it is ready:

```bash
curl -sS https://ab-workbench.vercel.app/api/build
```

must name the merge commit.

### After promotion: the release's own commands

Some migrations change data only once, when `vercel-build` applies them. The
old build keeps serving for the minutes until `next build` finishes, so
anything it writes in that window misses what the migration did, and a
command run **after** promotion catches it up. Each such migration's runbook
says so; this table is where the release protocol collects them. **Before
running the post-deploy check, run the command of every migration below that
this release contains**, against production's direct `DATABASE_URL`:

| Migration | Command (count, then fix) | Why | Runbook |
|---|---|---|---|
| `20261023010000_contract_stamps` | `pnpm contracts:stamp`, then, if it reports unstamped captures, `pnpm contracts:stamp --apply` | a schema or fixture captured while the old build served carries no contract stamp, and is withheld as "unverified" (`schemaCaptured: false`, left out of the starter kit) until stamped | `docs/runbooks/coreedge-contract-hygiene.md`, "What happens on deploy" |

Each command is safe to run any number of times. Paste its output into the
deploy record (step 5) under the post-deploy check. **The rule for new
migrations:** a migration whose runbook asks for a command after promotion
adds a row here in the same pull request.

## Step 5: the post-deploy check

Run it from an operator's machine as soon as `/api/build` names the merge
commit:

```bash
export COREEDGE_CHECK_BASE_URL="https://ab-workbench.vercel.app"
export COREEDGE_CHECK_KEY="<the canary's key, from the password manager>"
export COREEDGE_CHECK_STANDARD_INTERFACE="<canary SAP-standard interface id>"
export COREEDGE_CHECK_CUSTOM_INTERFACE="<canary Z*/YY1_* interface id>"
export COREEDGE_CHECK_REFUSED_INTERFACE="<canary interface with no grant>"
export COREEDGE_CHECK_AUDIT_DATABASE_URL="<read-only production URL>"
export COREEDGE_CHECK_EXPECT_COMMIT="<merge commit SHA>"
pnpm release:post-deploy-check
```

| Line | Passes when |
|---|---|
| The expected commit is serving | `/api/build` answers 200 and names `COREEDGE_CHECK_EXPECT_COMMIT` |
| The app reaches its database | `/api/health` answers `healthy` |
| Discovery lists the canary interfaces as expected | `GET /api/northbound/interfaces` lists the standard interface as a `catalogue` service and the `Z*` one as `custom`, both with `callable: true`, and the refused one with `callable: false` |
| One SAP-standard read through the broker | `GET .../<standard>/data?limit=1` answers 200 |
| One Z* (customer-built) read through the broker | `GET .../<custom>/data?limit=1` answers 200 |
| A call with no grant is refused | `GET .../<refused>/data?limit=1` answers 403 `FORBIDDEN` (without `COREEDGE_CHECK_REFUSED_INTERFACE`: an unknown id, 404 `NOT_FOUND`) |
| Every governed call left its audit row | a `NorthboundAuditEvent` row exists for each correlation id returned, with the status the caller got and the interface called |

Exit 0 when every line passes, 1 when one fails, 2 when the settings are
incomplete. It prints statuses, record counts and correlation ids only: never
the key, the bypass secret, a database URL or an SAP record (every line goes
through `scripts/lib/redact.ts`, and each read asks for one record).

What one run adds to production: four audit rows (discovery and the three
calls; five when the `Z*` interface has its own key), the canary's daily usage
counters, and,
once ever, the canary app's first-call milestone (P2.12). The reads go to the
canary's own SAP system (open decision D3), never a customer's.

### Record the deploy

```bash
pnpm release:post-deploy-check --markdown > /tmp/post-deploy.md
gh pr comment <merged PR number> --body-file /tmp/post-deploy.md
```

The comment holds the result, the commit and deployment id, each line and the
correlation ids. A direct push to `main` (only docs and build-only changes,
`CONTRIBUTING.md`) is recorded on the commit instead:
`gh api repos/{owner}/{repo}/commits/<sha>/comments -F body=@/tmp/post-deploy.md`.

### If the check fails

- **Refused call served (200), or an audit line failing:** governance or the
  audit trail is broken. Roll back now (step 6), then investigate.
- **A read failing:** quote its correlation id in the feed page's lookup
  (`/coreedge/apps/...`) or find it in `/operations/traffic`. If the canary's
  SAP system itself is down (Operations, Connections: its probe fails too), it
  is not the release; record that on the PR and re-run when the system is
  back. Otherwise roll back.
- **Health or build failing:** the deployment is not serving correctly. Roll
  back.
- **Settings incomplete (exit 2):** the check did not run, so nothing is
  verified. Fix the settings and run it; do not record a PASS.
- **A canary grant refused:** discovery reports the SAP-standard or `Z*`
  interface "not callable" with `GRANT_EXPIRED`, `GRANT_REVOKED`,
  `NO_APPROVED_GRANT` or `GRANT_NEEDS_REAPPROVAL` (the line names the
  canary's grant), and that interface's read answers 403 `FORBIDDEN`. Every
  grant has an expiry, so the canary's lapse on a date. Open the canary app
  in Studio, Access. If the grant has expired, been revoked or awaits
  re-approval, **it is the canary, not the release**: renew it (canary set-up,
  step 4), record that on the PR and re-run. If the grant shows approved and
  in date, the release refused a valid grant: roll back.

Who decides, and how fast, is open decision D6. Until it is set: whoever
promoted decides, and rolls back first when unsure.

### The release canary (one-time set-up)

The check needs an app it is allowed to call. Set it up once (open decision
D3 names who owns it and where):

1. An organization the operator belongs to, and in it an app (solution)
   called "Release canary", with its three owners.
2. A connection to a lab SAP system (proposed: the X5M lab), declared as DEV.
3. Three interfaces on that app:
   - a SAP-standard read with an entity set (for example
     `API_BUSINESS_PARTNER`, `A_BusinessPartner`);
   - a `Z*` or `YY1_*` read, registered with "Register your own API" and
     verified against the lab system;
   - a third read, with **no** grant (the refused call).
4. DEV access requests for the first two, approved by someone who owns
   neither (the normal four-eyes rule). Every approval carries an expiry
   (`GRANT_REQUIRES_EXPIRY`), so record the two expiry dates beside the key
   in the password manager, with a reminder two weeks before. **Renewal:**
   before the earlier date, raise a new DEV request for each interface and
   have it approved, again by someone who owns neither; then run the
   post-deploy check against production once to confirm. A lapsed canary
   grant fails the check ("If the check fails", "A canary grant refused").
5. A DEV key, issued with an expiry, kept in the team password manager. It is
   never committed, never put in Vercel, and rotated like any key
   (`docs/runbooks/coreedge-credential-hygiene.md`), before its expiry date.
6. A read-only database login for the audit lookup (open decision D4),
   proposed:

   ```sql
   CREATE ROLE release_reader LOGIN PASSWORD '<generated>';
   GRANT CONNECT ON DATABASE <database> TO release_reader;
   GRANT USAGE ON SCHEMA public TO release_reader;
   GRANT SELECT ON "NorthboundAuditEvent" TO release_reader;
   ```

   Its URL is `COREEDGE_CHECK_AUDIT_DATABASE_URL`. The check only ever reads
   rows by the correlation ids the deployment just returned.

## Step 6: rollback

### The code: Vercel Instant Rollback

Vercel dashboard, project `aptus`, Deployments: open the previous production
deployment, "Instant Rollback" (CLI: `vercel rollback <deployment url>`).
Production's hostnames point at it again. It runs no build:
no migration runs, and the schema stays as the release left it, which is
safe because every migration is additive (step 2).

After a rollback, Vercel stops assigning production to new deployments
automatically until one is promoted by hand. **It does not stop building
them, and every production build of `main` runs `migrate deploy` against the
production database, promoted or not** (`vercel-build` runs
`scripts/migrate-deploy-with-retry.mjs` with the Production `DATABASE_URL`
before `next build`). A merge to `main` therefore changes production's schema
even while the rolled-back deployment serves. So:

1. revert the pull request on `main` in its own pull request (`git revert`),
   keeping any migration directory it added (gate 0 refuses removing one
   unless it was backed out, below). If a migration is to be backed out too,
   this revert pull request is the one that removes it, **before** the backout
   runs: follow the order in the next section instead;
2. the fix comes as a new pull request through steps 1-5;
3. promote it (Vercel, Deployments, "Promote", or `vercel promote <url>`),
   which turns automatic promotion back on;
4. after rolling forward, run the post-promote commands of step 4 ("After
   promotion: the release's own commands") again for every migration in that
   table that production has applied: the rolled-back build wrote without
   them while it served.

Then run the post-deploy check against the rolled-back deployment and record
it on the original pull request, with what happened.

### The rows the release wrote, read by the old code

An additive schema keeps the old code running, but the old code also READS
what the release wrote while it served, and it reads it as it understood the
tables before. A release must not leave rows the old code would misreport,
nor columns the old code changes without knowing (wave 2 integration review
round 4). The two cases Phase 0b wave 2 met, and how each is closed:

- **A new kind of row in an old table.** The Workbench console's read rows
  were going to be `PlatformAuditEvent` rows, which the old Workbench writes
  ledger lists as writes. They are a table of their own (`PlatformConsoleRead`)
  instead (`docs/runbooks/coreedge-console-pipeline.md`, "Rolling back the
  deploy").
- **A new column the old code leaves stale.** `SolutionClient.tokenTail` names
  the current key; the old code changes the key without knowing the column.
  A trigger clears the tail whenever the key changes without it
  (`docs/runbooks/coreedge-truthful-screens.md`, "Backout").

A release that adds either kind says, in its runbook, what the old code shows
after a rollback.

### The schema: backout SQL, rarely

An expand migration left in place is harmless to the old code, and leaving it
is the default. Run backout SQL only when the migration itself hurts the code
that is now serving (for example a constraint that refuses its writes, or a
backfill that wrote wrong values), and only after the code rollback.

**The order matters.** The backout deletes the migration's
`_prisma_migrations` row, and every production build of `main` runs `migrate
deploy` against production (above). If `main` still holds the migration's
directory when the backout runs, the next merge or redeploy of `main`
re-applies it, putting back the constraint or backfill that was hurting the
code now serving. So the directory leaves `main` first, and the backout runs
after; the reverse order leaves that window open.

1. Print the script, newest migration first, and read it:

   ```bash
   pnpm migrations:backout-sql 20261023030000_developer_journey_events > /tmp/backout.sql
   ```

   It is the migration's backout SQL, then the deletion of its
   `_prisma_migrations` row, in one transaction. Deleting the row is what lets
   a later `migrate deploy` apply the migration again; left in place, Prisma
   believes it is applied and the roll-forward deploys code against a schema
   missing it. (`prisma migrate resolve --rolled-back` cannot do this: it only
   accepts a migration that failed.)
2. **Remove the migration from `main` first.** In the revert pull request (or
   a pull request of its own when the revert already merged), delete the
   migration's directory and record it in `prisma/backed-out-migrations.json`
   (`"<name>": "<UTC date>, <who>, <why>, <incident or PR>"`); gate 0 allows
   exactly that removal. Merge it. Its production build runs `migrate deploy`,
   which finds nothing pending (the migration is still applied, and an
   applied migration missing from the directory is ignored), so production is
   unchanged. The fixed version comes back under a **new** name: a database
   that applied the old file and was not backed out (a preview, a
   developer's) would never run a changed file under the old name.
3. **Wait until no production build holds the directory.** In Vercel,
   Deployments, filtered to Production: the removal's build has finished, and
   no build of an older commit of `main` is queued or building (cancel any
   that is). Until the backout is done, merge nothing else to `main`.
4. Apply the script to production, with its direct (unpooled) URL:

   ```bash
   BACKOUT_DATABASE_URL="<production direct URL>" \
     pnpm migrations:backout-apply 20261023030000_developer_journey_events
   ```

   It prints the host and database it is about to change (never the
   password) and asks for the database name to be typed back. It runs exactly
   the script step 1 printed, with `DATABASE_URL` and `DIRECT_DATABASE_URL`
   both set to that one URL. **Do not run `prisma db execute --schema
   prisma/schema.prisma` with only `DATABASE_URL` set**: `schema.prisma` has
   `directUrl = env("DIRECT_DATABASE_URL")`, and the prisma CLI connects to
   that instead, so the script would run on whatever `DIRECT_DATABASE_URL`
   holds (the shell's, or the checkout's `.env`, which `.env.example` points at
   a local database) and report success while production is unchanged. A
   failure rolls the whole script back; nothing is half-applied.
5. Confirm: `DATABASE_URL="<production direct URL>" pnpm migrations:check
   --database` no longer lists the migration as "applied on this database but
   not in this checkout" (it does before step 4). This command reads with the
   Prisma client, which uses `DATABASE_URL` and nothing else.

Data in what the backout drops is lost; each backout says what (for the four
`backout.sql` files, in their headers). A dropped table or column is not
recoverable from the application; only a database restore (below) brings it
back.

## Recovery: backups and the timed restore drill

Backups of the production database come from the Postgres provider (Neon),
not from Vercel (`docs/deployment-urls.md` §2); there is no standby
deployment. The roadmap's acceptance for P0.17 is a timed restore of the
production backup into a scratch project that meets an RPO and an RTO set by
the product owner. **Neither number exists yet** (open decision D1). Until
the product owner sets them, the drill below measures what the current set-up
achieves, so the decision is made against a measured figure.

**Proposed drill** (owner and cadence: open decision D2):

1. Record the start time (T0) and the time of the restore point you choose
   (Tp, for example "one hour ago").
2. In the Neon console, restore the production project's data as of Tp into
   a **new, separate scratch project or branch** (Neon's point-in-time
   restore; how far back it can go depends on the plan: confirm it, D2).
   Never into the preview project: previews must hold synthetic data only
   (PREVIEW-DB-RUNBOOK).
3. Point a local checkout at it (never a Vercel environment), setting **both**
   variables to the scratch URL, because the prisma CLI connects to
   `schema.prisma`'s `directUrl` (`DIRECT_DATABASE_URL`) rather than
   `DATABASE_URL` and would otherwise report on another database:

   ```bash
   export DATABASE_URL="<scratch direct URL>"
   export DIRECT_DATABASE_URL="<scratch direct URL>"
   pnpm exec prisma migrate status    # must report the schema up to date
   pnpm migrations:check --database   # must pass
   ```
4. Prove the data: `pnpm verify:data`, and the row counts of the CoreEdge
   tables that matter most (`Solution`, `Interface`, `ApiAccessGrant`,
   `SolutionClient`, `NorthboundAuditEvent`) against production.
5. Record the end time (T1). Measured RTO = T1 - T0 (to a usable database;
   pointing production at it would add a Vercel environment change and a
   redeploy, measure that once too). Measured RPO = the newest audit row in the
   scratch copy compared with Tp.
6. Delete the scratch project. It held production data: access only for the
   person running the drill, deleted the same day, and the deletion recorded.
7. Record the result where the deploy records go (D5), with T0, Tp, T1, both
   figures and anything that did not work.

Production data in a scratch copy is a personal-data and client-data
question as well as an operational one; whether the drill may copy it at all,
or must use a masked copy, is part of D2.

## Open decisions

These need a person's decision. Nothing above invents an answer; the interim
position is stated.

- **D1, RPO and RTO.** How much data may be lost (RPO) and how long CoreEdge
  may be down (RTO) after a database loss. Owner: the product owner. Interim:
  none set; the drill measures the current figures.
- **D2, the restore drill.** Who runs it, how often (proposed: before P0
  exit, then quarterly and after any provider or plan change), whether
  production data may be copied for it or a masked copy is required, and the
  Neon plan's point-in-time restore window (to be confirmed with the
  provider, not assumed).
- **D3, the release canary.** Which organization and app, which SAP system and
  environment (proposed: the X5M lab, DEV), who holds the key and how often it
  is rotated, who renews the canary's grants and for how long each approval
  runs, and whether the preview database gets a canary of its own so
  step 3 can run the check before promoting.
- **D4, the audit lookup's database login.** Proposed: the `release_reader`
  role above, with SELECT on `NorthboundAuditEvent` only. Alternative: run the
  lookup by hand from Operations, Traffic (the check would then need a manual
  mode, not built).
- **D5, where the deploy record lives.** Proposed and documented above: a
  comment on the merged pull request. Alternatives: a release log in the
  repository, or a ticket per deploy.
- **D6, who may promote and roll back, and how fast a failed check must be
  acted on.** Today anyone who can merge to `main` promotes, and anyone with
  the Vercel project role can roll back. Whether a second person must confirm
  a production promote, and a time limit for the decision after a failed
  check, are not set.
- **D7, an automatic checksum gate in the build.** `pnpm migrations:check
  --database` could run in `vercel-build` before `migrate deploy`, failing a
  preview (and production) build that would silently skip an edited
  migration. Not done here, because it changes the production build and
  production's recorded checksums have never been compared with the files.
  Proposed: run it once by hand against production, then add it in warn-only
  mode.
- **D8, `ci.yml` on stacked pull requests.** It runs only on pull requests to
  `main`, so a pull request onto a wave branch gets Quality Gates only when
  retargeted or run by hand. Whether to widen it is a CI-cost decision.
- **D9, a standby.** A second Vercel project with its own database (the only
  real standby, `docs/deployment-urls.md` §2) is worth building only if D1's
  RTO is shorter than a restore takes. Decide after the first drill.

## Settings

No application setting. The tools read these on the operator's machine only
(`.env.example`, "Release tooling"); never set them in Vercel:

| Variable | Used by | Required |
|---|---|---|
| `COREEDGE_CHECK_BASE_URL` | post-deploy check | yes |
| `COREEDGE_CHECK_KEY` | post-deploy check | yes |
| `COREEDGE_CHECK_STANDARD_INTERFACE`, `COREEDGE_CHECK_CUSTOM_INTERFACE` | post-deploy check | yes |
| `COREEDGE_CHECK_AUDIT_DATABASE_URL` | post-deploy check | yes |
| `COREEDGE_CHECK_CUSTOM_KEY`, `COREEDGE_CHECK_REFUSED_INTERFACE`, `COREEDGE_CHECK_EXPECT_COMMIT`, `COREEDGE_CHECK_PROTECTION_BYPASS` | post-deploy check | no |
| `REHEARSAL_DATABASE_URL`, `SHADOW_DATABASE_URL` | backout rehearsal | yes, for it |
| `BACKOUT_DATABASE_URL` | `migrations:backout-apply` (it sets `DATABASE_URL` and `DIRECT_DATABASE_URL` from it for the prisma CLI) | yes, for it |
| `DATABASE_URL` | `migrations:check --database` | yes, for it |

## Code

- `scripts/lib/migration-protocol.ts`: the rules (immutability, backout
  parsing, the additive lint, checksum comparison, the backout script).
- `scripts/lib/migration-cutoff.json`: the cutoff's migrations and checksums,
  generated once from git (a test compares it with git).
- `scripts/lib/migration-rehearsal.ts`, `scripts/migration-backout.ts`: the
  rehearsal, `migrations:backout-sql` and `migrations:backout-apply`
  (`prismaCliEnv` sets both database variables for every prisma CLI run).
- `scripts/check-migration-protocol.ts`: `pnpm migrations:check`.
- `scripts/lib/post-deploy-check.ts`, `scripts/coreedge/post-deploy-check.ts`:
  the post-deploy check; `scripts/lib/redact.ts`: what keeps secrets out of
  their output.
- `prisma/backed-out-migrations.json`: the register of migrations removed
  after a backout.
- Tests: `tests/unit/ops/migration-protocol.test.ts`,
  `tests/unit/ops/post-deploy-check.test.ts`,
  `tests/integration/migration-backout-rehearsal.test.ts` (real PostgreSQL and
  prisma CLI), `tests/integration/post-deploy-check.test.ts` (the real broker
  routes).
