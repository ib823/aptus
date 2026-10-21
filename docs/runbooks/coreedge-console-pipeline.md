# Runbook: The Workbench console on the governed pipeline (P0.14b)

Roadmap item P0.14b (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`,
section 8.2): bring the Workbench console onto the pipeline, put the
deployment's own tenants under the SAP host allow-list, and prove there are no
side doors (A.3 #9).

## What changed

**Every Workbench route that reaches SAP runs on the pipeline.** The ten
routes under `/api/sap/tdd/*` and `/api/sap/ariba/*` that call SAP or Ariba
(preview, entities, operations, capabilities, the catalogue's live overlay and
detail probe, Probe all, the Ariba explorer call, the write-back and the
write-test) open a console call (`openConsoleCall`,
`src/lib/governed/console.ts`) and run its steps in order:

| Step | What it decides | Refusal (HTTP status) |
|---|---|---|
| authenticate | the route's own role gate (unchanged), and a signed-in person | as before |
| `authorise()` | a sandbox developer reads SANDBOX systems only (P0.13); a stored connection's environment ceiling (Sandbox and Dev freely, TEST, PROD or undeclared only under a live grant) | `SANDBOX_ONLY`, `NO_APPROVED_GRANT`, `UNDECLARED_ENVIRONMENT` (403) |
| `bind()` | a deployment tenant's (and Ariba's) configured hosts against the SAP host allow-list | `HOST_NOT_ALLOWED` (403), only under `COREEDGE_ENV_TENANT_HOSTS=enforce` |
| `contain()` | the console's own circuit for this system in this organization (reads only), shared by every console route | `CIRCUIT_OPEN` (503), only under `COREEDGE_CIRCUIT_BREAKER=enforce` |
| `callSap(fn, describe)` | the connector call, timed, its outcome told to the circuit: SAP's 4xx (429 and 400 included) counts nothing, and a fan-out tells what its requests were answered, not its row's 200 (see `docs/runbooks/coreedge-circuit-breaker.md`) | none: SAP's answer is reported as before |
| audit | automatic: every refusal above and every `callSap` | none |

`callSap` refuses to run (a programming error, `ConsolePipelineError`) until
the three steps have passed. The write-back opens its call in `write` mode and
sends through `callSapWrite(handle, fn)`, which takes the handle of the row
P0.7's fail-closed `beginPlatformAudit` wrote; P0.7's begin/complete pair is
still the write's whole trail.

**A named principal and a platform-scope row.** A console call is made as the
principal `console`, for the signed-in person. Each call writes:

- the organization's console row, exactly as before (`NorthboundAuditEvent`,
  `dryRun: true`, the person as `actorUserId`, no solution or credential; a
  reader with no organization reading the deployment tenant is filed under
  `-deployment-`). Ariba calls have no organization row, as before.
- NEW: one platform-scope row, `PlatformAuditEvent` with action
  `SAP_CONSOLE_READ` and its `PlatformAuditOutcome` in the same statement:
  the person (id, email, role, organization), the product, tenant, service or
  fan-out sentinel, entity set, a fingerprint of the parameters chosen (never
  their values), the correlation id the person was given (the same one as on
  the organization's row), and the outcome — `SUCCEEDED`, `BLOCKED` (refused
  by a step, with the reason), `SAP_REFUSED` (4xx) or `FAILED` — with
  `detail.principal: "console"`, the route, the status, the row count, the
  host check and, for a refusal, the step.

Neither row is billed: the usage rollup counts only `dryRun: false`
`NorthboundAuditEvent` rows and never reads the platform trail. The
Operations write ledger (`/api/ops/workbench-writes`) reads only the two write
actions, so a console read is never shown there as a write.

Console reads stay **not fail-closed**: both rows are written after the call
and a failed insert is logged (`[platform-audit] could not record a console
read`), never refused — the same rule the organization's row always had. The
write-back stays fail-closed (P0.7).

**Deployment tenants under the host allow-list.** A tenant configured through
`{PREFIX}_BASE_URL` or `{PREFIX}_TENANTS_JSON` (S4_TDD_*, SF_TDD_*,
S4_PRIVATE_TDD_*, S4_ONPREM_TDD_*, ECC_TDD_*), its `{PREFIX}_OAUTH_TOKEN_URL`
when the auth type exchanges a token, and `ARIBA_BASE_URL` /
`ARIBA_OAUTH_TOKEN_URL` are checked with `checkSapHost`
(`src/lib/studio/sap-host-allowlist.ts`), the rule a stored connection meets
on save: https, not an IP literal, localhost or an internal name, and on a SAP
suffix or `SAP_HOST_ALLOWLIST_EXTRA`. Stored connections are not re-checked.

**The no-side-doors test (A.3 #9).** `tests/unit/security/no-side-doors.test.ts`
builds a call graph of `src/` (`tests/helpers/sap-reach.ts`) and fails when a
route reaches SAP outside the pipeline, or on the pipeline without an audit
row, unless the route is on its reviewed exemption list. Every `route.ts` under
`src/app` is a route, route groups included; a page, a layout, any other
server component, a server action or middleware that reaches SAP fails it
outright. It runs in CI as part
of `pnpm test` (Quality Gates).

## The setting: `COREEDGE_ENV_TENANT_HOSTS`

| Value | Behaviour |
|---|---|
| `observe` (default; also any unrecognised value) | Checked. A host the list refuses is logged once per process (`[env-tenant-hosts] a deployment tenant's host is not on the SAP host allow-list; COREEDGE_ENV_TENANT_HOSTS=enforce would refuse this call`, with the variable name and the host) and recorded on each call's platform row (`detail.hostCheck: "unlisted"`, `detail.unlistedHosts`). The call goes ahead. |
| `enforce` | The call is refused `403 HOST_NOT_ALLOWED` before anything is sent, token exchange included; the refusal is on both rows (`failureReason: HOST_NOT_ALLOWED`, outcome `BLOCKED`). A write-back is recorded `BLOCKED` on its P0.7 row. Operations' correlation search names the binding as the hop. |
| `off` | Not checked. |

**Why observe is the default.** Production's `{PREFIX}_*` values are not in
the repository. The documented examples include landscapes "usually not
internet-reachable" (private cloud, on-premise, ECC) whose hosts may be a
customer domain, plain `http`, or an IP address, none of which the list
admits. Enforcing on deploy could stop a console read that works today.

### Before switching to enforce

1. Pull the deployment's variables into a local file
   (`vercel env pull .env.production.local`), then run
   `pnpm exec tsx --env-file=.env.production.local scripts/coreedge/env-tenant-hosts.ts`
   (or `pnpm coreedge:env-tenant-hosts` in a shell that has them). It prints
   each tenant and, for any enforce would refuse, the variable and the host —
   never a URL path or a secret. Exit 0: nothing would be refused; 1: something
   would; 2: a prefix's configuration cannot be read. Delete the pulled file.
2. Search the logs for `[env-tenant-hosts]` over a working week; or query the
   platform rows: `PlatformAuditEvent` with `action = 'SAP_CONSOLE_READ'` whose
   outcome `detail->>'hostCheck' = 'unlisted'`.
3. For each unlisted host that is a real SAP system on a customer or partner
   domain, add the domain to `SAP_HOST_ALLOWLIST_EXTRA`. A tenant on `http` or
   an IP address cannot pass: give it an https DNS name or leave the setting at
   observe.
4. Set `COREEDGE_ENV_TENANT_HOSTS=enforce` and redeploy. Check one preview of
   each deployment tenant in the Workbench.

### Rolling back

Set `COREEDGE_ENV_TENANT_HOSTS=observe` (or remove it) and redeploy. Nothing
is stored by the setting; no data changes either way.

## Finding a console read

- By the correlation id the person was given: Operations' correlation search
  finds the organization's row; for the platform trail,
  `SELECT * FROM "PlatformAuditEvent" WHERE "correlationId" = '…'` (indexed).
- Everything a person read from the console:
  `WHERE action = 'SAP_CONSOLE_READ' AND "actorUserId" = '…' ORDER BY at DESC`
  (indexed on `actorUserId, at`).

## The exemption list (A.3 #9)

Seven routes reach SAP outside the pipeline today. None is a Workbench console
route and none reads business data on a person's or an application's behalf;
each is a probe of a system or a definition, and each is recorded. They are
listed, with what they read, what records them and when they move, in
`EXEMPT` in `tests/unit/security/no-side-doors.test.ts`: the connection save's
probe-before-swap, the connection Test, a custom service's verification, the
lane re-check and nightly sweep, and the nightly and on-demand connection
probes. A.3 #9 asks for them by P3. A new route that reaches SAP fails the test
until it uses the pipeline or is added there with its reasons, and an
exemption that no longer reaches SAP outside the pipeline fails it too.

## Open decisions

- **Retention of console read rows.** The platform-scope console read rows
  (`SAP_CONSOLE_READ`) now expire with the organization's copy of the same
  reads: the nightly `/api/cron/northbound-retention` run deletes them past
  `NORTHBOUND_AUDIT_RETENTION_DAYS` (default 30), on the legal basis stated in
  `src/lib/northbound/retention.ts`, and records how many as
  `consoleReadsDeleted` in its CronRunLog row. The write-back's rows on the
  same table (P0.7) are not swept at any age. Open: whether the platform
  trail should keep console reads LONGER than the organization's trail (a
  separate period would need its own setting), which is the product owner's
  decision; until then they share the one period.
- **The `-deployment-` organization rows.** A reader with no organization
  reading the deployment tenant is still filed under `-deployment-` in
  `NorthboundAuditEvent`, as before, beside the new platform row. Whether to
  stop writing those rows now that the platform trail holds them is open (the
  usage rollup and the journey tiles already leave them out).
- **A screen for the platform trail's reads.** Platform admins query it
  directly today; a Control Tower view is not built.
- **When to enforce the host check** in production (see above), and whether
  `http` deployment tenants should ever be allowed.
- **The exempted routes** move by P3 (A.3 #9 for all routes) or with P4.1's
  transport dispatcher; the owner of each is not assigned.

## Tests

- `tests/integration/console-pipeline-golden.test.ts`: golden answers and rows
  for every moved route, recorded before the port
  (`tests/fixtures/console-pipeline/golden-before.json`) and after
  (`golden-after.json`); the only difference allowed is the added platform
  row. Plus one enforce test per moved route.
- `tests/unit/governed/console.test.ts`: the steps' order, both rows, the host
  check's three modes, Ariba, the circuit, the write mode.
- `tests/unit/security/no-side-doors.test.ts`: A.3 #9.
- `tests/unit/api/sap-console-reads-gated-and-audited.test.ts`: each console
  route's wiring.
