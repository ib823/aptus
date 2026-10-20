# SAP key restore drill (P0.10)

The question this drill answers: **if the database is restored from a backup,
do the customers' SAP credentials in it still open?** A backup of sealed
secrets without the keys that open them is a backup of nothing, and the only
way to know the keys are where they need to be is to try.

Background: [SAP-CONNECTION-KEYSTONE-RUNBOOK.md](./SAP-CONNECTION-KEYSTONE-RUNBOOK.md#keys-envelope-encryption-rotation-reseal-verify-p010).

## What has to survive together

| Item | Where it lives | Why the restore needs it |
|---|---|---|
| The database backup | the Postgres provider's backups / point-in-time restore | holds `SapConnection` / `SolutionClient` ciphertext **and** the `OrgDataKey` rows (wrapped data keys) |
| Every master key version that backup's `OrgDataKey.keyVersion` names | the deployment environment, plus an offline custody copy | unwraps the data keys |
| `v1` (the legacy `SAP_CONNECTION_ENCRYPTION_KEY`), if the backup holds any legacy-format blob | same | opens blobs sealed before envelope sealing |
| The KMS key (once a KMS provider is in use) and the grant to use it | the cloud account | the KMS does the unwrapping |

**Key retention rule.** A master key version may be destroyed only when no
backup still inside its retention window contains an `OrgDataKey` row wrapped
by it (or, for `v1`, a legacy-format blob). Removing a version from the running
deployment after `keys:rotate` is routine; destroying the custody copy is not —
wait out the backup retention window first.

## The drill (run quarterly, and after every master rotation)

Never against the production database. Every step below runs against a
scratch database restored from a production backup.

1. **Restore** the most recent backup into a scratch database (provider branch
   or `pg_restore` into a fresh instance). Note the backup's timestamp.
2. **Assemble the keys from custody**, not from the running deployment — the
   drill is testing custody. Put them in a shell environment:

   ```bash
   export DATABASE_URL="postgresql://…/scratch"
   export SAP_CONNECTION_ENCRYPTION_KEYS="v2:<from custody>,v3:<from custody>"
   export SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY="v3"
   export SAP_CONNECTION_ENCRYPTION_KEY="<v1 from custody, if legacy blobs may exist>"
   ```

3. **Verify**, from cold:

   ```bash
   pnpm keys:verify          # exit 0 = every data key unwraps and every secret opens
   pnpm keys:verify --json > drill-$(date +%F).json
   ```

   The report counts data keys by master version and blobs by format and
   data-key version. Every count must be accounted for; `failed` must be 0.
4. **Prove the check can fail.** Re-run with one master version removed from
   `SAP_CONNECTION_ENCRYPTION_KEYS` (or a wrong value): `pnpm keys:verify` must
   exit 1 and name the rows. A verify that cannot fail proves nothing.
5. **Drop the scratch database.** It holds customer secrets in sealed form and
   the keys are in your shell; neither should outlive the drill.
6. **Record it** below: date, backup timestamp, counts, exit codes, time from
   step 1 to a passing step 3 (this is the measured recovery time for secrets).

## Reading a failure

| `verify` reports | Meaning | Fix |
|---|---|---|
| `Master key vN is not in SAP_CONNECTION_ENCRYPTION_KEYS` | a data key is wrapped by a version custody did not supply | retrieve vN from custody; if it was destroyed, those organisations' secrets must be re-entered |
| `No data key version N is stored for organization …` | a blob names a data key the restored `OrgDataKey` table does not hold — the tables came from different points in time | restore the database as one consistent snapshot |
| `A legacy-format secret needs key v1` | the backup predates the reseal | supply `v1` from custody |
| `Unsupported state or unable to authenticate data` | the bytes, the key or the row binding do not match — a corrupted row, a blob moved between rows, or the wrong key under the right name | compare the key fingerprint with custody; re-enter the credential if the row itself is damaged |

## In CI

`tests/integration/sap-key-envelope.test.ts` runs the same lifecycle against a
real database on every pull request: legacy rows, switching envelope sealing on,
reseal to 100%, rotation with the old keys removed, rekey, the way back to
legacy, and `scripts/ce-keys.ts verify` exiting 1 on a row that will not open.
That proves the tooling; only this drill proves the custody.

## Drill log

| Date | Backup timestamp | Data keys / blobs | `verify` exit (pass / forced fail) | Time to passing verify | Run by |
|---|---|---|---|---|---|
| | | | | | |
