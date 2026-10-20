# Runbook: Credential hygiene (`COREEDGE_KEY_EXPIRY`, rotation overlap, key prefixes)

Roadmap item P0.11 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). This runbook covers runtime keys (the bearer token a deployed app sends)
and the write key stored on the same `SolutionClient` row.

## What changed, in one paragraph each

**TEST and PROD keys expire.** Before this change a runtime key could be issued
with no expiry, and so could the write key stored on the same row. Now every TEST
or PROD key minted after the deploy carries an expiry, at most 90 days ahead by
default (`COREEDGE_KEY_MAX_TTL_DAYS`):

- An issue for PROD without `expiresAt` is refused with `400 VALIDATION_ERROR`.
  The message names the limit and the latest allowed date.
- An issue for TEST without `expiresAt` gets the default lifetime
  (`COREEDGE_KEY_DEFAULT_TTL_DAYS`, 90 days).
- An expiry beyond the maximum, or one already past, is refused with `400`.
- A rotation, or a claim link collected for a lane, renews a TEST or PROD key
  for the default lifetime. A rotation may name its own `expiresAt` instead.
- SANDBOX and DEV keys may still have no expiry. Renewing one keeps its expiry
  unless that date has passed (audit A48).
- The write key has no expiry of its own; it stops when its runtime key stops.
  Renewing an expired key (rotate, re-issue or claim link) destroys the old
  write key, as renewing a revoked one does. Issue a new write key afterwards.
  `POST /api/studio/clients/write-credential` refuses to issue a write key on a
  TEST or PROD key that has no expiry, and tells the person to rotate first.

All of these rules are applied when a key is minted, and never when a key
authenticates.

**Rotation overlaps.** Rotation used to replace the key immediately, so every
rotation broke callers until the deployment picked up the new key. The hash of
the replaced key now moves to `SolutionClient.previousTokenHash`. It keeps
authenticating until `previousValidUntil`, which is the earliest of:

- 24 hours after the rotation (`COREEDGE_KEY_ROTATION_OVERLAP_HOURS`);
- the replaced key's own expiry;
- the new key's expiry.

Further rules:

- Only a key that was live at the moment of the rotation overlaps. A revoked,
  deactivated or expired key does not come back.
- Only the immediately previous key overlaps. A second rotation inside the
  window ends the first key.
- Re-issuing on a lane that holds a live key is a rotation, and so is
  collecting a claim link for one. Both overlap.
- Except when the re-issue changes the SAP client (`sapClient`). The old key
  would otherwise read the new client for the whole window, a data container
  it was never issued for. So it stops at once, as every re-issue did before
  P0.11, and the response says "the previous token stopped working
  immediately". Rotate and claim links keep the SAP client, so they always
  overlap.
- The ROTATE audit row (`ConfigAudit.after.previousValidUntil`) records when the
  overlap ends, and so do the API response, the claim screen and the Studio
  table.
- Authentication looks a key up by its current hash first and by the previous
  hash only on a miss. A previous key past its window is refused, and the
  failure is logged as `ROTATED_OUT`.
- The overlap is bound to the key change that opened it.
  `SolutionClient.overlapForTokenHash` records the `tokenHash` written by that
  rotation, and the previous key is accepted only while the row's `tokenHash`
  still equals it. If anything else changes the current key afterwards, for
  example code from before P0.11 after a rollback, the window closes and the
  previous key is refused as `ROTATED_OUT`.

**Revocation ends both keys.** Revoking sets `revokedAt` on the row. Both the
current and the previous key resolve to that row, so both are refused as
`REVOKED` from the moment the revocation commits. An open overlap is closed at
the same time.

**Prefixes.** New keys start `ce_live_` (PROD) or `ce_test_` (SANDBOX, DEV,
TEST). `SolutionClient.tokenPrefix` records which prefix each key was minted
with. Existing rows read `ce_`, the legacy prefix. Authentication never reads
the prefix, so legacy `ce_` keys keep working until they expire. The
secret-scanning patterns are in `docs/coreedge/secret-scanning.md`.

**An expired key is never shown as live.** Every screen now uses the same
predicate (`isKeyLive` / `keyState` in `src/lib/northbound/key-policy.ts`) that
authentication uses:

- the Studio API Access table;
- Operations > Tokens (`/api/ops/tokens`), and the throttle view, which lists
  live keys only;
- the Control Tower credential register and portfolio (`hasLiveCredential`);
- the CoreEdge passport (new "Key" column), Operations > Keys (new "Expires"
  column), and app settings;
- lanes, which already applied the rule.

## What happens on deploy

Nothing that works today stops working.

- The migration `20261022010000_credential_hygiene` adds four columns.
  `tokenPrefix` is `NOT NULL DEFAULT 'ce_'`, which is a metadata-only change.
  `previousTokenHash`, `previousValidUntil` and `overlapForTokenHash` are
  nullable, and the new unique
  index is built over a column that is `NULL` on every row. There is no
  backfill. The code that runs before the deploy finishes never reads the new
  columns.
- Every existing key keeps authenticating exactly as before, including TEST and
  PROD keys that have no expiry. Each screen flags such a key as **no expiry -
  set one**.
- The first rotation of an existing key gives it an expiry, and the old key
  keeps working through the overlap. Rotating is therefore how you clear the
  flag without an outage.
- Scripts that call `POST /api/studio/clients` for PROD without `expiresAt` now
  get `400`. Add an `expiresAt` (ISO 8601). The Studio form always sends one.

## Settings

| Variable | Values | Default | Effect |
|---|---|---|---|
| `COREEDGE_KEY_EXPIRY` | `enforce`, `off` | `enforce` | `off` restores the old behaviour for keys minted from then on: any expiry or none, and no maximum. |
| `COREEDGE_KEY_MAX_TTL_DAYS` | 1-365 | 90 | Longest TEST or PROD lifetime. |
| `COREEDGE_KEY_DEFAULT_TTL_DAYS` | 1-365 | 90 | Lifetime when nobody chose one. Never more than the maximum. |
| `COREEDGE_KEY_ROTATION_OVERLAP_HOURS` | 0-168 | 24 | How long a replaced key keeps working. 0 replaces the key immediately. |

A value that does not parse, or is out of range, falls back to the default and
logs `[key-policy] ... using <default>` once per process.

## Routine operations

**Find the keys that still need an expiry.** Use Operations > Tokens ("No
expiry" tile) or the Control Tower register ("No expiry - set one"), or run:

```sql
SELECT "organizationId", "solutionId", environment, "createdAt", "lastUsedAt"
FROM "SolutionClient"
WHERE "isActive" AND "revokedAt" IS NULL AND "expiresAt" IS NULL
  AND environment IN ('TEST', 'PROD')
ORDER BY "createdAt";
```

**Give one an expiry without an outage.** In Studio > API Access, press
**Rotate** on the row. The new key is shown once and gets the default lifetime.
The old key keeps working until the time shown under "previous key works until".
Deploy the new key before then.

**Rotate before expiry.** Operations > Tokens marks keys within 14 days of
expiry as "expiring soon". Rotate them the same way.

**Watch an overlap close.** `previousValidUntil` is shown on Operations >
Tokens, Operations > Keys and the Studio table while the window is open. A call
made with the old key after the window shows in the runtime log as
`[northbound] auth rejected { reason: "ROTATED_OUT" }`. If you see that, the
deployment never picked up the new key.

## Incident: a key has leaked

1. **Revoke it, do not rotate it.** Rotating keeps the leaked key working for
   the overlap window. Revoke from Operations > Keys (with a reason) or Studio
   > API Access. That ends the current key, the previous key, and the write key
   on the row.
2. Issue a new key, or send a claim link, for the lane. A key replaced after a
   revocation gets no overlap.
3. If the leak was a write key (`cew_`), step 1 has already destroyed it. Issue
   a new write key once the new runtime key is in place.

## Rollback

- **Policy only:** set `COREEDGE_KEY_EXPIRY=off`, or
  `COREEDGE_KEY_ROTATION_OVERLAP_HOURS=0`, and redeploy. Keys already minted
  keep the expiry they were given.
- **Code:** you can revert the deploy.
  - The previous code ignores the new columns. While it runs, an open overlap
    stops working, because the old code never looks up `previousTokenHash`.
    Callers that have not yet picked up their new key fail until they do.
  - The old code also never writes these columns. A rotation, revocation or
    re-issue made under it leaves `previousTokenHash` and `previousValidUntil`
    exactly as they were.
  - Rolling forward is still safe for any key the old code changed. The old
    code's write changes `tokenHash` but not `overlapForTokenHash`, so the
    overlap is no longer bound to the current key, and authentication refuses
    the previous key (`ROTATED_OUT`). This holds even when the operator used
    the old code to revoke a leaked key and then issue a new one.
  - A row the old code did not touch keeps its overlap after the roll-forward,
    until `previousValidUntil`. That is the overlap its rotation asked for.
  - Keys minted with `ce_live_` or `ce_test_` keep working under the old code,
    because authentication only ever compared hashes.
  - The old code mints plain `ce_` keys and never writes
    `SolutionClient.tokenPrefix`. A key it rotates or re-issues on a row that
    had a `ce_live_` or `ce_test_` key keeps that prefix in the column. After
    the roll-forward, Operations > Keys, Operations > Tokens, app settings and
    the Studio table show the key as `ce_live_••••abcd` although it starts
    `ce_`. Authentication is unaffected. When you match a leaked string, or a
    scanner hit on the legacy `ce_` pattern, against those screens, match on
    the environment and the last four characters, or run the tidy-up below
    first.
- **Tidy up after a roll-forward (optional).** A row the old code changed can
  still show "previous key works until ..." on the screens until that time,
  even though authentication already refuses the key. To clear those rows:

  ```sql
  UPDATE "SolutionClient"
  SET "previousTokenHash" = NULL, "previousValidUntil" = NULL, "overlapForTokenHash" = NULL
  WHERE "previousTokenHash" IS NOT NULL
    AND "overlapForTokenHash" IS DISTINCT FROM "tokenHash";
  ```

  To stop the screens showing a `ce_live_` or `ce_test_` prefix on a key the
  old code minted, reset the prefix on every row whose key this build cannot
  vouch for:

  ```sql
  UPDATE "SolutionClient"
  SET "tokenPrefix" = 'ce_'
  WHERE "tokenPrefix" <> 'ce_'
    AND "overlapForTokenHash" IS DISTINCT FROM "tokenHash";
  ```

  The database cannot tell which keys the old code minted, so this also
  resets keys that the new code minted without an overlap (a first issue, or a
  re-issue after a revocation). That costs only detail: `ce_` begins every
  key, so a screen showing it is never wrong. The next rotation of each key
  writes its real prefix again.

- **Schema:** the migration is additive. Leave it in place on a code rollback.

## Verification after deploy

1. Issue a PROD key in Studio with no expiry through the API. Expect `400`.
2. Issue a TEST key. It starts `ce_test_` and shows an expiry 90 days out.
3. Rotate it. Both keys authenticate (`GET /api/northbound/interfaces` with each
   bearer token). The ROTATE row in the audit trail carries
   `previousValidUntil`.
4. Revoke it. Both keys get `401` at once.
5. Operations > Tokens shows any pre-P0.11 TEST or PROD key without an expiry as
   "no expiry - set one", and no expired key as active.
6. After a rollback and roll-forward, check that no overlap outlived a key
   change made by the old code. Authentication refuses these keys anyway; a
   non-zero count only means the screens need the tidy-up under Rollback:

   ```sql
   SELECT count(*) FROM "SolutionClient"
   WHERE "previousValidUntil" > now()
     AND "overlapForTokenHash" IS DISTINCT FROM "tokenHash";
   ```
