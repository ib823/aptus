# Runbook: Passkey step-up on governance actions (`COREEDGE_STEP_UP`)

Roadmap item P0.12 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section 8.2).

## What it does

A governance action needs a passkey assertion made **on this session in the
last 5 minutes**. Governance actions are deciding a grant, issuing, rotating or
revoking a runtime credential or write key, sending a claim link, saving a
connection's SAP secrets, and turning on writes for a connection. Without that
assertion, a stolen session cookie could approve access or mint a PROD key, and
separation of duties would mean nothing.

The gate is `requireStepUp` in `src/lib/auth/step-up.ts`. It reads
`Session.passkeyAssertedAt`, which is set by:

- a passkey sign-in (`/api/auth/webauthn/authenticate/verify`), and
- a step-up (`/api/auth/webauthn/step-up/options` then `/verify`). The step-up
  needs the existing session and accepts only that person's own passkeys. It
  stamps the session it was made on, and it rotates the session token.

**Registering a passkey does not set it.** Registration proves only that the
caller holds the session, which is what a stolen cookie gives an attacker. The
step-up dialog follows an enrolment with a real assertion.

**A step-up challenge counts once, on the session it was issued to.** The
challenge cookie is signed but stateless, so `/step-up/options` also stores a
hash of the challenge on the session (`Session.stepUpChallengeHash`), and
`/step-up/verify` clears it in the same write that stamps the assertion. A
replayed request, a challenge issued to another session, and a challenge from
the public sign-in options are refused with `400`. Starting a second step-up
on the same session replaces the first, so only the latest one can complete.

## The routes

| Action | Route |
|---|---|
| `grant.decide` | `PATCH /api/studio/access-grants`, `POST /api/coreedge/requests/[id]/decide`, `PATCH /api/control-tower/grants` |
| `grant.revoke` | `POST /api/control-tower/grants/[grantId]/revoke` |
| `credential.issue` / `credential.rotate` | `POST /api/studio/clients` (rotate when it replaces a live credential) |
| `credential.rotate` / `credential.revoke` | `PATCH /api/studio/clients` |
| `credential.revoke` | `POST /api/coreedge/keys/[clientId]/revoke` |
| `write_key.issue` | `POST /api/studio/clients/write-credential` |
| `claim_link.send` | `POST /api/coreedge/keys/claim-link` |
| `connection.save_secrets` | `POST /api/studio/connections` |
| `connection.enable_writes` | `PATCH /api/studio/connections`, only when the change leaves the connection active and write-enabled and it was not before |
| `passkey.add` | `GET /api/auth/webauthn/register/options` and `POST /api/auth/webauthn/register/verify`, only when the person already has a passkey |
| `passkey.remove` | `DELETE /api/auth/webauthn/credentials/[credentialId]` |

The passkeys themselves are on the list because the step-up accepts any passkey
registered to the person. If a stolen session could add its own passkey, it
could then step up with it. If it could remove the person's passkeys, its own
would become the first. A **first** passkey has nothing to step up with, so it
is trust on first use. Instead it is made visible: every passkey added or
removed writes a `ConfigAudit` row (`entityType = "Passkey"`, `action` `CREATE`
or `REVOKE`, `entityId` the credential id), and every passkey added emails the
person (`src/lib/auth/passkey-events.ts`).

Each route asks **after** its own role, tenant and ownership checks, just
before it writes. A refusal the person cannot fix never costs them a passkey
prompt first. These do not need a step-up:

- raising a request (the requester is not the control);
- re-checking a lane and testing a connection (they read, and are rate limited);
- collecting a key from a claim link (the recipient holds a one-time link, not a
  console session; sending the link is what is gated).

## Modes

`COREEDGE_STEP_UP` = `off` | `warn` | `enforce`. **Default: `warn`.** An unset
or unrecognised value reads as `warn`.

| Mode | No fresh assertion | Banner |
|---|---|---|
| `warn` | The action goes ahead. An append-only `ConfigAudit` row records it: `entityType = "StepUp"`, `action = "STEP_UP_MISSING"`, `entityId` is the action name, and `after` holds `targetId`, `reason` (`no_passkey` / `never_asserted` / `stale`) and `passkeyAssertedAt`. | Shown to everyone who can take a governance action. It asks people without a passkey to add one, and offers "Confirm with passkey now" to people who have one. |
| `enforce` | `403` with `error.code = STEP_UP_REQUIRED`. The console opens the passkey dialog and retries. If the person has no passkey, the code is `STEP_UP_ENROLMENT_REQUIRED` and the dialog offers enrolment in place. | Shown only to people with no passkey. |
| `off` | Nothing is checked or recorded. This is an escape hatch, not a steady state. | None. |

**Personal and CI tokens are refused in every mode, `off` included**
(`STEP_UP_TOKEN_REFUSED`). A token has no passkey to step up with. Every caller
is a cookie session today. The token features (P2.11a, P3.2, P3.3) must set
`SessionUser.authMethod` to their own kind, and the gate then refuses them.

The three decision routes check the gate inside the transaction that holds the
Solution row lock, but write the warn-mode row **after** the transaction ends
(`checkStepUp`, then `recordStepUpMissing`). Written inside it, the row needed a
second pooled connection while the transaction held one, and with the pool
exhausted by decisions queued on the same lock every decision timed out.

Warn is the default because most approvers have no passkey today, and the
production relying-party ID is not settled. Enforcing on deploy would lock out
the people the approvals depend on.

## Moving from warn to enforce

1. **Settle the domain first.** The passkey relying-party ID is the hostname
   (`src/lib/auth/webauthn.ts`). A passkey registered on one host does not work
   on another, and it cannot be migrated (`docs/deployment-urls.md` §5). Set
   `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` explicitly on the production project.
   If they derive from `NEXTAUTH_URL`, a later hostname change would invalidate
   every passkey without warning.
2. **Get approvers enrolled.** The warn banner asks them. To see who is still
   acting without a step-up:

   ```sql
   SELECT "actorId", after->>'reason' AS reason, count(*), max("at") AS last_seen
   FROM "ConfigAudit"
   WHERE "entityType" = 'StepUp' AND action = 'STEP_UP_MISSING'
     AND "at" > now() - interval '7 days'
   GROUP BY 1, 2
   ORDER BY last_seen DESC;
   ```

   `no_passkey` means that person must enrol. `never_asserted` and `stale` mean
   they have a passkey, and enforce will simply prompt them for it.

   Passkeys added recently, and whether each was a first passkey (trust on
   first use) or added beside an existing one:

   ```sql
   SELECT "actorId", "entityId" AS credential_id, after->>'firstPasskey' AS first,
          after->>'stepUp' AS step_up, after->>'ipAddress' AS ip, "at"
   FROM "ConfigAudit"
   WHERE "entityType" = 'Passkey' AND action = 'CREATE'
     AND "at" > now() - interval '7 days'
   ORDER BY "at" DESC;
   ```
3. **Switch** when no `no_passkey` rows have appeared for 7 days from anyone
   who still approves. Set `COREEDGE_STEP_UP=enforce` in the Vercel project's
   Production environment and redeploy. No migration is involved.
4. **Watch** the first day. A `403` with `STEP_UP_REQUIRED` in the logs is the
   gate working. A person who cannot complete the dialog needs a passkey on the
   device they are using (Settings → Security).

## Rolling back

Set `COREEDGE_STEP_UP=warn` (or delete it) and redeploy. Nothing else changes:
the columns stay (`Session.passkeyAssertedAt` and `Session.stepUpChallengeHash`,
both additive and nullable), and warn mode starts recording again.

Use `off` only if the audit writes themselves are a problem. In `off` the gate
records nothing, but it still refuses tokens.

## Locked out

Under `enforce`, adding a passkey beside an existing one and removing one both
need a step-up with a passkey the person still has. Someone who has another
passkey (a second device, a synced passkey) signs in with a magic link, steps up
with it, and then adds or removes passkeys under **Settings → Security**.

Someone who has lost **every** passkey cannot step up at all. An administrator
resets their MFA: **Admin → Users → Reset MFA** (`PATCH
/api/admin/users/[userId]` with `resetMfa`). This deletes their passkeys and
revokes their sessions. They then sign in with a magic link and enrol a new
first passkey, which needs no step-up and is recorded and emailed like any
other. Confirm the request with the person through another channel before
resetting, because the reset is what turns a stolen session into a first
enrolment.

An organization that needs an action taken before that can be done should have
another eligible approver take it. Lifting `enforce` for everyone is the last
resort, and it is recorded nowhere except the deploy history.
