# Runbook: Developer onboarding on the shared host

Roadmap item P0.13 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section 8.2).

This runbook covers four settings and one screen:

| Setting | Default | What it does |
|---|---|---|
| `COREEDGE_DEVELOPER_SIGNUP` | off | `open` lets a new person create a developer workspace. Any other value, including a typo, means off. |
| `COREEDGE_DEVELOPER_SIGNUP_DOMAINS` | empty | When sign-up is open, the email domains it admits. Empty means any domain. |
| `COREEDGE_BOOTSTRAP_TOKEN` | unset | The one-time token for claiming the first platform admin of an instance that has none. |
| `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS` | 587, unset, unset | Port 465 uses implicit TLS. Every other port must upgrade with STARTTLS. |

## What happens on deploy

Nothing changes for production by default.

- **Who can sign up stays the same.** With `COREEDGE_DEVELOPER_SIGNUP` unset,
  `/signup` and magic-link sign-in admit the same addresses as before
  (`AUTH_INVITATION_ONLY`, `AUTH_ALLOWED_DOMAINS`, `AUTH_WHITELIST_BYPASS`,
  in `src/lib/auth/auth-config.ts`). They create the same accounts: `/signup`
  creates a partner organization and a `partner_lead`, and a new magic-link
  user is a `consultant` with no organization. `/signup/developer` says
  sign-up is not open, and the API answers `404`.
- **Existing users and data are untouched.** No migration. No existing account
  changes role or organization.
- **Production already has a platform admin**, so the bootstrap claim refuses
  whatever token is presented. The code that made the first account on an
  empty database a platform admin has been removed. That code only ran on an
  empty database, so it never ran on production.
- **What is tighter:**
  - `POST /api/auth/signup` now has its own per-address bucket of 10 an hour
    (`signup:<ip>`), instead of sharing the 30-a-minute sign-in bucket.
  - `POST /api/auth/signup` is also limited to 5 an hour per email address.
    With developer sign-up off, a magic link sent from the sign-in page keeps
    exactly the limits it had: neither sign-up bucket is spent for it, so
    nobody can lock a new employee out of their first sign-in by draining
    them. A link sent to an existing account is never limited this way.
  - An invitation can no longer remove a platform admin's role, and a
    developer workspace's invitation can no longer replace another account's
    role.
  - The invite response no longer contains the invitation token. Only the
    invitee's email carries it. Nothing on screen used it.
  - `/coreedge/members` shows the member list only to roles that the
    member-list API already allowed: admins, `partner_lead`, `client_admin`
    and `consultant`, and a `sandbox_developer` in its own developer
    workspace.
- **SMTP.** Production uses Brevo on 587, which offers STARTTLS, so mail is
  sent as before. Unlike before, the connection now fails if a relay on 587
  does not offer STARTTLS, so the password is never sent in the clear.

## Developer workspaces (`COREEDGE_DEVELOPER_SIGNUP=open`)

**What a person gets.** Their own organization, named "<name>'s workspace",
with them in it as `sandbox_developer`. That role can do the following:

- Open Developer Studio. They land on Discover.
- Read the catalogue.
- Make live reads of **SANDBOX** tenants only. Every live-read route checks
  this: `/api/sap/tdd/preview`, `/entities`, `/operations`, `/capabilities`,
  the hub-content overlay and detail, and the Test Console broker run
  (`decideSandboxDeveloperRead` in `src/lib/sap-public/console-read-guard.ts`).
  It applies to the deployment's own tenant as well, which other roles may
  read without a grant. The Studio tenant switcher shows them only the
  SANDBOX tenants. Any other live-read route refuses the role outright:
  `refuseUnlessMayProbeTenant` refuses a sandbox developer unless the route
  passes `appliesSandboxDeveloperCeiling`. `/api/sap/ariba/call` does not
  pass it, because an Ariba realm declares no landscape.
- Invite colleagues into their own workspace as sandbox developers, at
  `/coreedge/members`.

It has **no governance right**. It cannot do any of the following:

- request access, or decide or revoke a grant;
- issue, rotate or revoke a key, mint a write key, or send a claim link;
- save a connection, at any environment, or turn on its writes;
- register an app or define a data feed;
- administer accounts or organizations.

Each of those routes refuses it with the gate the route already has
(`tests/unit/auth/sandbox-developer-governance.test.ts`). Twin rights for a
solo workspace arrive with P1.7.

**Make the SAP API Hub sandbox available.** A developer can read only a tenant
declared `SANDBOX`. On the shared host, declare the deployment tenant for the
API Hub sandbox:

```
S4_TDD_TENANTS_JSON='[{"key":"api-hub-sandbox","label":"SAP API Hub sandbox","baseUrl":"https://sandbox.api.sap.com/s4hanacloud","environment":"SANDBOX"}, …the existing tenants…]'
```

Without such a tenant, a developer sees Discover with "No tenant connected".
They cannot read the host's real S/4HANA tenant, whatever it is declared as.

**How someone signs up.** There are two ways in, and both end in the same
place:

1. **`/signup/developer`.** The person enters an email address and is sent a
   sign-in link. **Nothing is written yet** apart from NextAuth's one-time
   verification token.
2. **The ordinary sign-in page** (`/presales/login`) with an address that has
   no account. When sign-up is open, the page also links to
   `/signup/developer`.

The workspace and the account are created in one transaction when the person
clicks the link, by `createFirstSignInUser` in `src/lib/auth/auth-options.ts`.
So the address is proven before anything exists. The session bridge then lands
the person on `/studio/discover`.

**Who is admitted when sign-up is open:**

- an address in `COREEDGE_DEVELOPER_SIGNUP_DOMAINS` (or any address, if the
  list is empty);
- an address the ordinary registration policy already admits. While sign-up is
  open, that person also gets a workspace rather than an organization-less
  `consultant`, so signing up never grants more than this role.

`AUTH_INVITATION_ONLY` keeps governing the partner `/signup` and does not
block a developer domain. Staff who need `consultant` or more are invited, or
created in `/admin/users`, as before.

**Abuse controls:**

- 10 sign-ups an hour per caller address, in one `signup:<ip>` bucket for
  both ways in. The edge spends it on `POST /api/auth/signup`. The sign-in
  link for a new address spends it too (`checkSignupCallerLimit`, in the
  link's `sendVerificationRequest`), so `POST /api/auth/signin/email` is no
  way around it. A sign-in link for an existing account never spends it. With
  the setting off, nothing spends it except `/api/auth/signup`, as before.
- 5 an hour per email address, for both ways in. The sign-in link spends it
  only while sign-up is open.
- A limiter outage refuses sign-up with `503 LIMITER_UNAVAILABLE`, failing
  closed.
- A workspace starts with the trial seat limit of 5. Pending invitations count
  as seats while they are pending.
- When a sandbox developer sends an invitation, the organization may send at
  most 10 sandbox developer invitations in any 24 hours
  (`DEVELOPER_WORKSPACE_INVITES_PER_DAY`), counting revoked, expired and
  accepted ones. Revoking frees a seat but not a send, so invite-then-revoke
  cannot be used to email an unlimited number of addresses. Past the budget,
  the invite route answers `429`. Administrators are not limited by it.
- The seat and budget checks and the create run under a lock on the
  organization's row, so invitations sent at the same moment queue up and
  cannot together exceed either limit.
- A sandbox developer's invitation is mailed only to an address that has no
  account on the host. For any other address the invitation is still created
  and charged to the seats and the budget, and the answer is the same `201`,
  so the invite form cannot be used to find out which addresses are
  registered. Nobody receives the token, so nobody can accept it.
- An invitation from a developer workspace never reactivates an account an
  administrator deactivated: accepting it answers `409`.

**To turn it off**, unset `COREEDGE_DEVELOPER_SIGNUP`. Workspaces already
created keep working. New addresses are then admitted by the registration
policy alone, as before.

## Invite and member screens on a WORKBENCH_ONLY host

`/coreedge/members` lists the organization's members and pending invitations,
and has the invite form. It is under `/coreedge`, so `WORKBENCH_ONLY` does not
redirect it. The invitation email links to `/invitations/<token>`, which is
also reachable. The portal's `/organization/users` stays unreachable on that
host.

Who may do what is decided in one place, `src/lib/auth/org-invites.ts`:

- **Invite:** a platform admin, in any organization. A `partner_lead` or
  `client_admin`, in their own organization only. A `sandbox_developer`, in
  its own **developer workspace** only: an organization in which no member
  and no pending invitee holds any role but `sandbox_developer`. A sandbox
  developer that a client admin placed in a customer organization invites
  nobody and sees no member list there.
- **Read the member list:** the same people, plus a `consultant`. The
  members screen asks the same question. Anyone else sees a sentence that
  says who can see the list.
- **Which role can be offered:** a sandbox developer can invite only sandbox
  developers. Everyone else is limited by the role hierarchy, as before.
- **Which invitations can be seen and revoked:** a sandbox developer sees and
  revokes only sandbox developer invitations, in its own workspace. Everyone
  else sees and revokes every invitation in their organization, as before.
- **Accepting:** the token travels only in the invitee's email. The invite
  response does not include it, so an inviter cannot accept on someone
  else's behalf.

The CoreEdge Home screen links to the members screen, and so does Discover for
a developer.

## Creating an organization (`POST /api/admin/organizations`)

Only a platform admin can do this. It needs a fresh passkey step-up
(`org.create`), and personal or CI tokens are refused. The body is:

```json
{ "name": "Acme Manufacturing", "orgType": "client", "contactEmail": "it@acme.example", "domain": "acme.example" }
```

`orgType` is one of `client` (the default), `partner` or `platform`. It is
written to both type columns. The response is `201` with the new
organization. Each creation writes a `PlatformGovernanceAudit` row
(`entityType = "Organization"`, `action = "CREATE"`).

To add people, invite the first one with
`POST /api/organizations/<id>/users`.

## The first platform admin of a new instance

No one becomes platform admin by signing in first. To set up an instance that
has no platform admin:

1. Generate a token of at least 32 characters, for example
   `openssl rand -hex 32`. Set it as `COREEDGE_BOOTSTRAP_TOKEN`, then redeploy.
   A shorter token counts as no token.
2. Give it to the person who should administer the instance, by a channel the
   instance does not use (not its own email).
3. That person signs in (by magic link, or with a developer workspace if
   sign-up is open), opens `/coreedge/bootstrap` and enters the token.

The claim checks, in order:

1. The caller has a session.
2. The token matches, compared in constant time on SHA-256 digests.
3. The governance step-up passes (`platform.bootstrap`). Under `enforce`, the
   person enrols a passkey first. Tokens are refused in every mode.
4. In one serializable transaction: there is no active platform admin, the
   token has not been used before, the person's role is set to
   `platform_admin`, and a `PlatformGovernanceAudit` row
   (`action = "BOOTSTRAP_ADMIN"`) records the token's SHA-256, never the
   token itself.

Every refusal writes a `BOOTSTRAP_REFUSED` row with its reason
(`NOT_CONFIGURED`, `INVALID_TOKEN`, `ADMIN_EXISTS`, `TOKEN_USED` or
`CONFLICT`).

After the claim, **unset `COREEDGE_BOOTSTRAP_TOKEN`**. Even if you leave it,
it cannot be used again: its hash is on the audit row, and while an admin
exists the claim is refused anyway.

**Recovering an instance that has lost every admin.** Configure a **new**
token and repeat the steps. The old token stays refused even when no admin
exists.

**Checking claims and attempts:**

```sql
SELECT "at", "actorId", action, after->>'refusal' AS refusal
FROM "PlatformGovernanceAudit"
WHERE action IN ('BOOTSTRAP_ADMIN', 'BOOTSTRAP_REFUSED')
ORDER BY "at" DESC;
```

## SMTP: implicit TLS and STARTTLS

`src/lib/email/smtp-options.ts` is the only place SMTP connection settings
are built. The app's mail and the presales guest mail both use it.

| `SMTP_PORT` | Connection |
|---|---|
| `465` | Implicit TLS: TLS from the first byte (RFC 8314). |
| anything else (587 by default) | Plain text, then STARTTLS. The STARTTLS upgrade is **required** (`requireTLS`), so a relay that does not offer it fails rather than receiving the password in the clear. |

- `SMTP_SECURE=true` asks for implicit TLS on a port other than 465.
- `SMTP_REQUIRE_TLS=false` allows a plain-text relay, such as a local MailHog
  on 1025. **Never set it on a real deployment.**

**Symptom of the old defect.** On port 465, every send hung until it timed
out, so no sign-in link arrived.

**Symptom after this change, if your relay offers no STARTTLS on 587.** Sends
fail with a nodemailer error that STARTTLS is required. Fix the relay, or move
it to 465.
