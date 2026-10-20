# CoreEdge as an R&D lab for ABAP teams

A guide for a team of ABAP developers who want to run their own CoreEdge
instance, connect it to an SAP tenant they choose, and use it to try out new
developments.

**Status of this guide.** It was written on 2026-10-19 and describes the code
as of PR #306 (CoreEdge audit batch 2). Builds from before that change classify
several errors differently from what sections 5.3 and 6.2 describe, so host a
commit that includes it. Statements about the code cite `path:line` so an
engineer can check them. Anything that could not be confirmed is marked **unverified** or
listed as unknown. It is not presented as fact.

**Updated on 2026-10-20** for interfaces that carry their own service path
(branch `custom-service-path`): your own `Z*`, `YY1_*`, ECC Gateway and
SuccessFactors custom services are now registered by path and verified live
(sections 2, 5.6, 5.7, 6.1 and exercise 4). A review round on the same branch
then made verification per environment (a DEV verify no longer opens PROD
writes), refused SAP routing in the path (`;o=`, `/sap(...)/`, `..;`), let
SuccessFactors verify one dataset instead of the whole tenant, and added the
OData version control to Studio. A second review round kept one verification
per SAP client (two clients of one PROD system no longer overwrite each other),
refused service paths outside the OData handlers (`/sap/bc/...` and other ICF
paths), made activation of a write interface require the verification and the
write chain in the **same** environment, marked an environment whose connection
was edited after its verify, and bounded the `$metadata` parsing so a hostile
8 MB answer cannot stall CoreEdge. Everything said about that feature was traced
in code and is covered by unit tests; it has **not been run against a live
tenant**.

**Before you share this repository with anyone, read section 9.** The code is
proprietary. Copying or hosting it needs the author's written permission.

---

## Short answers

| Question | Answer |
|---|---|
| Can we use it today? | Yes, as a proof of concept or R&D lab. It can make governed reads of SAP-published OData APIs and of your own OData services (`Z*`, `YY1_*`, registered by their service path), and create records, on SAP tenants that the CoreEdge host can reach. It cannot yet update records, filter reads, or reach on-premise systems from a cloud-hosted instance. |
| What is the best way to use it? | Run a separate instance for the lab, with its own database. Connect it to an S/4HANA Cloud Public Edition development or test tenant. Use ABAP both ways: as a **consumer** of the CoreEdge API, and as a **provider** — build RAP services in ADT, register them in Studio by their service path, verify them and govern them like any SAP API (section 6.1). |
| How does an ABAP team develop with it? | ABAP stays in ADT/Eclipse. CoreEdge has no ABAP editor, no transports and no deploy step (`docs/coreedge-developer-guide.md:79-83`). ABAP code can call CoreEdge over HTTPS. CoreEdge can call standard SAP services and your own OData services on your behalf. |
| Can other teams take it, host it and connect their own tenant? | Technically yes: sections 4 and 5 are the runbook. Legally, only with the author's prior written permission (`LICENSE:9-13`). |

---

## 1. What CoreEdge is, in ABAP terms

CoreEdge is a **broker**. Your application never calls SAP directly. It calls
one CoreEdge URL with a token. CoreEdge checks who is calling, whether a second
person approved that access, and which SAP system the call is bound to. Only
then does it call the SAP OData service, using SAP credentials it keeps
encrypted. The SAP credentials never leave CoreEdge.

```
 Your program (ABAP, Node, anything)
   |  HTTPS, Authorization: Bearer ce_...
   v
 CoreEdge  /api/northbound/interfaces/{id}/data
   |  checks: token valid -> interface belongs to this solution
   |          -> live approved grant for this environment
   |          -> exactly one connection bound to that environment
   |             (and to the credential's SAP client, if it names one)
   |  HTTPS, stored SAP credentials, $top=N
   v
 SAP tenant  /sap/opu/odata/...   (or /sap/opu/odata4/...)
```

### Concepts mapped to things you already know

| CoreEdge term | Closest ABAP / SAP equivalent | What it holds |
|---|---|---|
| Organization | Your team's own client space | Every Studio object is scoped to one organization. |
| Solution | A registered consuming application | Name, purpose and three owners: technical, business and support. Created as DRAFT. |
| SAP connection (`SapConnection`) | An SM59 destination, or a communication system plus communication user on the calling side | Product, base URL, SAP client, environment (SANDBOX, DEV, TEST, PROD), auth type and sealed credentials. |
| Interface | One entity set of one OData service, as activated in `/IWFND/MAINT_SERVICE` or exposed by a communication arrangement | Service id (`externalId`), product, operation (READ or CREATE) and entity set. Created as DRAFT. |
| Access grant | The approval step before a communication arrangement goes live, with an end date | Solution, service, operation and environment, plus an expiry and a justification. A second person decides it. |
| Runtime credential (`ce_...` token) | The password of a communication user, but for your app calling CoreEdge | One per solution per environment. It is shown once and stored only as a hash (`src/lib/northbound/auth.ts:25`). |
| Write key (`cew_...`) | A second secret required for create calls | It is sealed onto one runtime credential. |
| Northbound API | The one URL your program calls instead of SAP | `/api/northbound/interfaces`, `/{id}/schema`, `/{id}/data` and `/{id}/data/write`. |
| Test Console | `/IWFND/GW_CLIENT`, but through the whole governance chain | A dry-run read as the solution's credential, recorded in the audit trail as a dry run. |
| Operations Center | Gateway error log and application log for the broker | Traffic, connection health, incidents, write ledger and throttling. |
| Control Tower | A governance cockpit | Portfolio, grant decisions, audit trail, and the connection and credential registers. |

### Roles

| Role | In the lab | What it can do |
|---|---|---|
| `consultant` | Developer | The only role that can create or change anything in Developer Studio: solutions, connections, connection tests, interfaces, grant requests and decisions, and credentials (`src/lib/studio/rbac.ts:83-104`). It cannot open Operations Center or Control Tower. |
| `support` | Operations | Operations Center only (`rbac.ts:114-117`). |
| `partner_lead` | Lab lead | Created by `/signup`. Can open Control Tower read-only and can invite users. **Cannot open Developer Studio** (`rbac.ts:92-95`, `127-148`). |
| `platform_admin` | Instance owner | Can see everything. In Studio it has oversight only. It decides grants in Control Tower and has the admin screens. |

### The two-person rule

The requester of a grant cannot decide it, and an owner of the solution cannot
decide grants for it (`src/lib/coreedge/authz.ts:98-104`). A credential can only
be issued once all three owner slots are filled, and the issuer must not be one
of the owners (`src/lib/studio/solutions.ts:57-66`). Each person can claim owner
slots only for themselves (`solutions.ts:105-116`). One developer may hold all
three slots in a lab, but **you need at least two `consultant` users in the same
organization** to finish the loop.

---

## 2. Can you use it today?

"Works" means the code path exists and is enabled with no feature flag. It does
not mean every SAP release has been tested end to end.

### Works today

| Capability | Notes |
|---|---|
| Sign-in by email magic link | Needs a working SMTP relay. There is no SSO, OIDC or SAML login (`src/lib/auth/auth-options.ts:50-68`). |
| Solutions, interfaces, grants and runtime credentials in Studio | The two-person rule applies. |
| Connection to S/4HANA Cloud Public Edition, with Test | The host must be on the SAP domain allow-list and reachable from the CoreEdge host. |
| Northbound read of an SAP-published service | Returns the first N rows of one entity set, where N is at most 100. There is no filter (section 8). |
| Test Console | Reads only, with `limit` at most 50 (`src/app/api/studio/test/broker-run/route.ts:62`). |
| Starter kit download | A TypeScript/Node client, an OpenAPI 3.1 file, a mock server and fixtures. It covers reads only (`src/lib/studio/scaffold.ts:1017-1036`). |

### Works with conditions

| Capability | Condition |
|---|---|
| Northbound create (POST) | Two of the required steps have no screen yet. Enabling writes on a connection and minting the write key both need a direct API call (Appendix B). |
| Onboarding developers | Needs the admin screens, which are reachable only when `WORKBENCH_ONLY` is unset, or a direct API call (section 4.7). |
| SAP services beyond the curated ones | A platform admin must load the SAP API catalogue first (section 4.8). OData V4 service paths are guessed, so they may be wrong (section 6.1). |
| SuccessFactors | In-app SAML-bearer signing exists. The code itself says it has not been verified against a live tenant (`src/lib/sap-public/connection-resolver.ts:646-653`). Discover cannot create an interface the broker can serve. Register your own API with the path `/odata/v2` instead (section 5.6). |
| S/4HANA on-premise or SAP Cloud ERP Private (RISE) | Only from an instance hosted inside your network. The system needs a DNS name, `SAP_HOST_ALLOWLIST_EXTRA` set, and an HTTPS certificate that Node trusts (section 5.5). |
| ABAP calling the CoreEdge API | Plain HTTPS with a Bearer header works in principle. No ABAP client has been tested, and the SAP system must be able to reach the CoreEdge host (section 6.2). |
| Your own OData service (V2 or V4), any product except Ariba | Register it with its service path and OData version, then **Verify** it (section 6.1). Writes through it need a current verification in the environment they write to. On-premise and Private systems also need network reachability (section 5.5). Traced in code and covered by unit tests; not run against a live tenant. |

### Not available yet

- Gateway catalogue discovery (`/IWFND/CATALOGSERVICE`): you must know the service path. Nothing lists the customer's own services for you.
- `$filter`, `$select`, key lookup, `$expand`, `$orderby` and paging on reads.
- UPDATE, DELETE, OData actions and function imports.
- X.509/mTLS client certificates, principal propagation, SAP Cloud Connector, an outbound HTTP proxy, or a custom CA option in code.
- Field mapping or field selection. The Interfaces screen labels mapping as "v2".
- Ariba through a stored connection, in practice.
- The user-admin screens on the shared production host. `/signup` and the invite
  API stay reachable there, so whether self-service works depends on that host's
  registration policy, which could not be checked (section 3).
- A KMS-backed SAP credential key, and key rotation.
- Writes in the Test Console. Write, discovery and schema calls in the starter kit. An ABAP starter kit.

---

## 3. Choosing how to run it

| | A. Shared hosted instance | B. Your own instance on Vercel | C. Your own instance on a VM or container in your network |
|---|---|---|---|
| Who runs it | The author | Your team, in your Vercel account | Your team |
| SAP systems it can call | Internet-facing SAP cloud tenants | Internet-facing SAP cloud tenants | Cloud tenants (given outbound internet access), plus on-premise and Private Edition systems reached by DNS name |
| Fixed outbound IP, for SAP-side IP allow-lists | No. Vercel's outbound addresses are not fixed (`docs/runbooks/successfactors-saml-signing.md`, section 1, step 4) | No (Vercel's paid options were not checked) | Yes, your network's |
| Can your SAP system call it (ABAP as consumer)? | Yes, over the internet | Yes, over the internet | Only SAP systems that can reach it |
| How users are onboarded | Production runs single-host Workbench mode, which redirects the user-admin screens away (`src/middleware.ts:113-140`). `/signup` and `/invitations/` are on its allow-list, and API routes pass through (`src/lib/routing/workbench-paths.ts:63,81`; `src/middleware.ts:113-121`). Self-service sign-up and the invite API therefore depend on production's registration policy (`src/app/api/auth/signup/route.ts:58-61`), which could not be checked. Ask the owner. | Through the admin screens, provided `WORKBENCH_ONLY` is left unset | Same as B |
| Can you change the code? | No | Yes | Yes |
| Data | Shared with the presales product. `SECURITY.md:28-30` says the live deployment holds real third-party engagement data. | Your own | Your own |
| Licence | Ask the owner | Written permission needed | Written permission needed |

**Recommendation.**

- Choose **B** when your lab tenant is S/4HANA Cloud Public Edition or
  SuccessFactors and does not restrict inbound IPs.
- Choose **C** when you need an on-premise or Private Edition system, or when
  your tenant only accepts calls from fixed IP addresses.
- Use **A** only for a guided demo. Do not use it for R&D, and do not store real
  credentials on it.

### Network reachability: two directions to check

| Direction | What must be true |
|---|---|
| CoreEdge to SAP (CoreEdge reads or creates data) | CoreEdge has no proxy setting of its own: the broker uses Node's global `fetch` (`src/lib/northbound/read.ts:145,180`; `src/lib/northbound/write.ts:222,267`), and nothing in `src` configures a proxy. Node 22's `NODE_USE_ENV_PROXY=1` (or `--use-env-proxy`), with `HTTPS_PROXY` and `NO_PROXY`, may work: Node 22.22.0 honours it, but it is **untested** with this app and with Next.js's server `fetch`. Without it, the host needs **direct** outbound HTTPS to the SAP host. The SAP host is an `https://` DNS name, never an IP address, `localhost`, `*.local` or `*.internal` (`src/lib/studio/connection-url-guard.ts:15-34`). The host must also be on the SAP domain allow-list (section 5.1). |
| SAP to CoreEdge (ABAP calls the API) | The SAP system has outbound HTTPS to the CoreEdge host, through your HTTP proxy if your landscape uses one. SAP must trust CoreEdge's TLS certificate (STRUST on-premise, the certificate trust list in ABAP Cloud). |

---

## 4. Hosting your own instance: checklist

Work through the steps in order. Each step names the person who usually does it.

### 4.0 Before you start (lab lead)

- [ ] Get written permission from the author to copy and host the code (section 9).
- [ ] Work from a cleaned copy of the repository, not from a fork with history (section 9).
- [ ] Keep `docs/coreedge-developer-guide.md` in the cleaned copy. Both build
      commands start by checking that it exists and is not empty, and fail with
      "Runtime asset check failed" otherwise. The in-app `/help/developer-guide`
      reads it too (`scripts/check-runtime-assets.mjs:6-14`; `package.json:22-23`).
- [ ] Decide which commit to host, and record it. It must include PR #306,
      which changed several answers an ABAP caller depends on (sections 5.3 and
      6.2). On Vercel, `GET /api/build` returns the commit
      (`src/app/api/build/route.ts`).
- [ ] Decide between option B and option C (section 3).

### 4.1 Prerequisites (platform engineer)

| Item | Requirement | Evidence |
|---|---|---|
| Node.js | Exactly `22.22.1`. A different patch version needs `SKIP_NODE_VERSION_CHECK=1`. | `.nvmrc`; `package.json:219`; `scripts/check-node-version.mjs:58-62` |
| pnpm | `10.23.0` | `package.json:5` |
| PostgreSQL | 15 or later, because a migration uses `NULLS NOT DISTINCT`. CI uses 16. No extensions are needed. | `prisma/migrations/20260731010000_connection_binding_tuple/migration.sql`; `.github/workflows/ci.yml:27-28` |
| SMTP relay | STARTTLS on port 587. Implicit TLS on port 465 is not supported, because `secure: false` is hard-coded. | `src/lib/email/brevo.ts:5-15` |
| Public HTTPS host name | Required. Session cookies are `secure` in production. | `src/lib/auth/session.ts:246-259` |
| Upstash Redis (REST) | Required by the production preflight. A plain TCP Redis is not supported. If Upstash cannot be reached, every `/api` call returns 429 (option C notes in 4.5). | `scripts/check-production-env.js:17-34`; `src/lib/security/rate-limit.ts:15,132-139` |
| A scheduler | Vercel Cron (option B), or cron, systemd timers or a Kubernetes CronJob (option C). | `vercel.json:4-29` |

The repository has no Dockerfile and no standalone Next.js build, so option C
is a plain `pnpm build` and `pnpm start` behind your own reverse proxy.

### 4.2 Generate secrets (platform engineer)

```bash
openssl rand -hex 32      # SAP_CONNECTION_ENCRYPTION_KEY  (must be 64 hex characters)
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 48   # PRESALES_CSRF_SECRET (32+ characters, different from NEXTAUTH_SECRET)
openssl rand -hex 32      # CRON_SECRET
```

Keep them in your secrets manager.

`SAP_CONNECTION_ENCRYPTION_KEY` needs extra care:

- **Back it up together with the database, and never change it once
  connections exist.** There is no rotation or re-seal tool. With a different
  key, every stored SAP connection and every write key becomes unreadable
  (`src/lib/sap-public/connection-crypto.ts:95-103`).
- The key is a plain environment variable. The repository's own runbook says
  that is acceptable for a proof of concept but is not the bar for storing a
  customer's production SAP credentials
  (`docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md:110-131`).
- **Connect your lab to sandbox, development and test tenants only.**

### 4.3 Environment variables

| Variable | Needed? | Secret? | Value |
|---|---|---|---|
| `DATABASE_URL` | Required | Yes | Postgres connection string. On option B, append `?connection_limit=5&pool_timeout=10`, as `.env.example:1-3` advises, so that concurrent functions do not exhaust Postgres connections. Use your provider's pooled URL if it offers one. |
| `DIRECT_DATABASE_URL` | Required. The Prisma CLI refuses to run without it (`prisma/schema.prisma:5-9`). | Yes | The same as `DATABASE_URL` when no connection pooler is used. With a pooler (typical on option B), the direct, unpooled URL, which migrations use. |
| `NEXTAUTH_SECRET` | Required | Yes | From 4.2 |
| `NEXTAUTH_URL` | Required | No | Your public `https://` URL |
| `NEXT_PUBLIC_APP_URL` | Recommended. Set it before building. | No | The same URL. It is used for page metadata (it defaults to the original deployment's URL), the sitemap and presales links (`src/app/layout.tsx:29`; `src/lib/http/app-origin.ts:15-20`). Starter kits do **not** use it: they take their base URL from the origin of the browser request (`src/app/api/studio/interfaces/[id]/scaffold/route.ts:48-50`), so check `COREEDGE_BASE_URL` in a downloaded kit. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Required in practice. Without `SMTP_USER`, a production instance sends no magic link and nobody can sign in (`auth-options.ts:60-68`). | `SMTP_PASS` is | Your relay. Optionally set `EMAIL_SENDER_NAME` too, so that emails do not carry the original branding. |
| `SAP_CONNECTION_ENCRYPTION_KEY` | Required for CoreEdge. The preflight only warns, but without it no SAP connection can be saved. | Yes | From 4.2 |
| `CRON_SECRET` | Required by the production preflight. With it unset, every scheduled job refuses all callers (`src/lib/ops/cron.ts:28-33`). | Yes | From 4.2 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Required by the production preflight | The token is | Upstash REST endpoint |
| `PRESALES_CSRF_SECRET` | Required by the production preflight | Yes | From 4.2 |
| `AUTH_ALLOWED_DOMAINS` | Set it. The example file's values are another organisation's domains (`.env.example:204`). | No | Your email domain |
| `AUTH_INVITATION_ONLY`, `AUTH_WHITELIST_BYPASS` | Policy settings (section 4.7) | No | `false` and `true` while bootstrapping |
| `SAP_HOST_ALLOWLIST_EXTRA` | Needed for on-premise or Private Edition hosts. It is missing from `.env.example`. | No | Comma-separated domain suffixes, for example `corp.example.com` |
| `NORTHBOUND_AUDIT_RETENTION_DAYS` | Optional | No | 7 to 3650. The default is 30. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Optional | No | Error reporting |
| `BLOB_READ_WRITE_TOKEN`, `BYOAI_ENCRYPTION_KEY`, AI provider keys | Optional. Used by the presales product. | Yes | Leave them unset for a CoreEdge lab |
| `WORKBENCH_ONLY`, `WORKBENCH_HOST`, `PORTAL_HOST` | **Leave unset** | No | When unset, Studio, Operations, Control Tower and the admin screens are all reachable on one host |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | **Leave unset** | No | They are then derived from `NEXTAUTH_URL`. The example file sets them to localhost (`.env.example:28-30`). |
| `S4_TDD_*`, `S4_PRIVATE_TDD_*`, `S4_ONPREM_TDD_*`, `ECC_TDD_*`, `SF_TDD_*`, `ARIBA_*`, and each prefix's `{PREFIX}_TENANT_ENVIRONMENT` and `{PREFIX}_TENANT_CLIENT` | **Leave unset** for a lab | Yes | These define one deployment-wide shared tenant per product, which skips the host allow-list (`.env.example:271-278`; `src/lib/sap-public/tdd-connector.ts:449-542`). Use per-organization connections instead. |
| `ENABLE_SIMULATION_BRIDGE`, `ALLOW_SIMULATION_BRIDGE_IN_PROD`, `ALLOW_DEV_SEED_IN_PROD`, `ALLOW_TEST_LOGIN`, `ENABLE_TEST_LOGIN_ENDPOINT`, `ALLOW_TEST_LOGIN_IN_PROD`, `ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST`, `INTERNAL_TEST_DEPLOYMENT` | **Never set** | | These are test backdoors (`scripts/check-production-env.js:63-92`) |

### 4.4 Database (platform engineer)

Create the schema the way production does. **Do not** use `pnpm db:push`, even
though `README.md:24` shows it.

```bash
pnpm install --frozen-lockfile
node scripts/migrate-deploy-with-retry.mjs        # or: pnpm exec prisma migrate deploy
pnpm exec tsx scripts/import-product-scope.ts    sap-references/product-scope/public-sap-sample.json
pnpm exec tsx scripts/reconcile-product-scope.ts sap-references/product-scope/public-sap-sample.json
pnpm exec tsx scripts/assert-content-release-landed.ts
```

The last three commands repeat what the Vercel build runs (`package.json:23`).
On option B, Vercel runs the migration and the last three commands on every
deployment. Installing dependencies is Vercel's own step.

**Do not run `pnpm db:seed` before step 1 of section 4.7.** CoreEdge does not
need the presales content it loads, and the build does not run it. Its last step
creates a `consultant` user, `affirm-curation@abeam.local`, whenever the shipped
curation has reviewed items, and it has five (`prisma/seed.ts:56`;
`prisma/seeds/value-stream/chapters.ts:11-27`; `curation-model/chapters/curated.json`).
The first magic-link sign-in then becomes a plain `consultant` instead of
`platform_admin` (`src/lib/auth/auth-options.ts:24-25`), and nobody can open
`/admin`, invite users or rebuild the catalogue. If that has already happened,
promote the owner directly in the lab database:

```sql
UPDATE "User" SET role = 'platform_admin' WHERE email = '<owner email>';
```

### 4.5 Build and run

**Option B (Vercel).** Create a new Vercel project in your own account and point
it at your cleaned repository. `vercel.json` sets the build command to
`pnpm run vercel-build`. That command runs the environment preflight, the
migrations and the content import, and Vercel registers the six scheduled jobs.
Set the variables from 4.3 in the project settings before the first deployment.

- **Give Preview deployments their own database, or turn preview builds off.**
  `vercel-build` runs `migrate deploy` on every deployment, including Preview
  deployments of any branch. The preflight relaxes only its hardening checks
  for Preview (`package.json:23`; `scripts/check-production-env.js:96-111`).
  If `DATABASE_URL` and `DIRECT_DATABASE_URL` are set for all environments,
  every push of an experimental branch migrates the lab database.
- **Use a Vercel Pro team for a company lab.** Vercel's Hobby plan is for
  non-commercial, personal use only, and on Hobby each scheduled job runs at
  some point within its scheduled hour, so the 04:30 lane check is not
  guaranteed to follow the 04:00 probe. This comes from Vercel's documentation
  (https://vercel.com/docs/plans/hobby and
  https://vercel.com/docs/cron-jobs/usage-and-pricing, read on 2026-10-19), not
  from the repository.

**Option C (VM or container).** `pnpm build` skips the preflight and the
migrations (`package.json:22-23`), so run those steps yourself:

```bash
NODE_ENV=production node scripts/check-production-env.js   # preflight; fix every [FAIL] (one exception below)
NODE_ENV=production STRIP_TEST_AUTH=1 pnpm build           # removes the test-login routes from the build
pnpm start                                                 # listens on port 3003
```

- `STRIP_TEST_AUTH=1` deletes the test-auth source files from the checkout
  (`scripts/strip-test-auth-for-production.mjs:116-131`), so build in a
  throwaway checkout.
- Build and run on the same OS and OpenSSL family. The Prisma generator declares
  no `binaryTargets`.
- Put a TLS reverse proxy in front. For rate limiting, the app trusts
  `X-Vercel-Forwarded-For` first, then `X-Real-IP`, then the leftmost
  `X-Forwarded-For` (`src/lib/security/client-ip.ts:14-30`). The proxy must
  therefore **strip** any client-supplied `X-Vercel-Forwarded-For` and
  **overwrite** `X-Real-IP`.
- **Test the full sign-in round trip through the proxy.** Under `next start`,
  Next.js 15.5 builds `request.url` from the bound host name (`localhost`) and
  port 3003, not from the public `Host` header, because
  `experimental.trustHostHeader` is not set in `next.config.ts`
  (`node_modules/next/dist/server/next-server.js:1312`;
  `node_modules/next/dist/server/lib/render-server.js:97`). The sign-in bridge,
  the last hop after the magic link, builds its redirect from that URL
  (`src/app/api/auth/bridge/route.ts:83`), so the browser is sent to
  `localhost:3003`. The proxy must rewrite `Location` headers that point there,
  for example with nginx `proxy_redirect http://localhost:3003/ https://<host>/;`
  plus the same line for `https://localhost:3003/`. Starter kits carry the same
  localhost base URL (`src/app/api/studio/interfaces/[id]/scaffold/route.ts:50`):
  edit `COREEDGE_BASE_URL` in the kit's `.env.example` and the server URL in its
  OpenAPI file. This was traced in the Next.js source, not run. On Vercel it
  does not happen.
- **Rate-limit backend.** The host needs HTTPS egress to the Upstash REST
  endpoint, and the code has no proxy setting (section 3). In production, any
  Upstash error makes the limiter fail **closed**, so an unreachable or blocked
  Upstash turns every non-exempt `/api/*` call, northbound included, into 429
  (`src/lib/security/rate-limit.ts:132-139`; `src/middleware.ts:243-296`). For a
  single-process VM with no internet egress, leave `UPSTASH_*` unset. The
  in-memory limiter then works, because there is only one process
  (`rate-limit.ts:154`), and the preflight's `[FAIL]` for those two variables is
  the one to accept.
- Point health checks at `/api/health`. It returns 200 when the database answers
  and 503 when it does not.

### 4.6 Scheduled jobs

On option B, Vercel runs these from `vercel.json`. On option C, schedule them
yourself. Each is a GET that must send `Authorization: Bearer $CRON_SECRET`.

| Time (UTC) | Job | Purpose |
|---|---|---|
| 02:00 | `/api/cron/trials` | Trial status |
| 03:00 | `/api/cron/analytics` | Analytics rollup |
| 03:30 | `/api/cron/northbound-reap` | Deletes expired idempotency keys |
| 03:45 | `/api/cron/northbound-retention` | Deletes audit rows older than the retention period |
| 04:00 | `/api/cron/connection-probes` | Daily health probe of every connection |
| 04:30 | `/api/cron/lane-checks` | Must run after the connection probes |

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://coreedge-lab.example.com/api/cron/connection-probes
```

Without these jobs, Operations only shows manual tests, and the idempotency and
audit tables grow without limit. The times are cron expressions in `vercel.json`;
on Vercel's Hobby plan they run within the hour, not at the minute (section 4.5).

### 4.7 First accounts: the order matters

The **first user ever created by a magic-link sign-in becomes `platform_admin`**.
Every later one becomes `consultant` **with no organization**, and Studio refuses
such users (`src/lib/auth/auth-options.ts:23-34`; `rbac.ts:170-176`). `/signup`
creates an organization plus a `partner_lead`, never a platform admin
(`src/app/api/auth/signup/route.ts:89-121`). `pnpm db:seed` **does** create a
user (section 4.4), so run it, if at all, only after step 1.

1. **Platform owner.** Before you share the URL, open `/login`, enter your email
   address and follow the link. You are now `platform_admin`. Check that `/admin`
   opens. Set `AUTH_ALLOWED_DOMAINS` beforehand so that nobody outside your
   domain can register first.
2. **Lab lead.** Use a different email address. Open `/signup` and enter the
   lab's organization name. You become `partner_lead` of a new organization on a
   trial plan. A trial organization can invite only while it has fewer than
   **5 active users**, the lab lead included. The limit is
   min(`maxPartnerUsers`, the plan's limit), and it is checked when an
   invitation is created, not when it is accepted (`src/types/commercial.ts:18`;
   `src/lib/commercial/usage-metering.ts:59-81`;
   `src/app/api/organizations/[orgId]/users/route.ts:154-174`). A larger lab gets
   "User seat limit reached". To lift it, the platform owner raises both values
   with the plan call in Appendix B. Trial expiry only changes a
   banner, because nothing enforces it. If you sign up with an email address
   that already exists, you only get a sign-in link and no organization is
   created.
3. **Developers.**
   - The platform owner opens `/admin/organizations`, selects the lab
     organization and clicks **Invite User**.
   - Invite at least two developers with role **Consultant**, and optionally one
     **Support** user for Operations Center.
   - Each invitee accepts at `/invitations/<token>`. Accepting creates the user
     with that role and organization (`src/app/api/invitations/[token]/accept/route.ts`).
   - `/organization/users` lists users but has no invite button
     (`src/app/(portal)/organization/users/page.tsx:25`). A lab lead who wants to
     invite people without the platform owner uses the API call in Appendix B.
4. **Lock registration.** Once everyone has accepted, set
   `AUTH_INVITATION_ONLY=true` and `AUTH_WHITELIST_BYPASS=false`, then redeploy.
   Invited users are not affected, because they already exist when they sign in
   (`src/lib/auth/auth-options.ts:184-213`). Note that this also blocks
   `/signup`.
5. **Optional.** Set the organization's MFA policy to `required`. Studio then
   asks for a passkey (`src/lib/auth/permissions.ts:365-375`).

Sessions last 30 days (720 hours) unless revoked (`src/constants/config.ts:5`;
`src/lib/auth/session.ts:77`). The 24-hour NextAuth token is used only to reach
the sign-in bridge. A user without an organization, including the platform
owner, may hold one session at a time: signing in from a second browser silently
ends the first. Organization users are limited by the organization's
`maxConcurrentSessions` setting, 3 by default (`session.ts:52`;
`prisma/schema.prisma:2833`).

### 4.8 Load the SAP API catalogue (platform owner)

Studio **Discover** lists only rows of the catalogue table (`SapHubContent`),
and that table is empty on a fresh database.

```bash
# run with DATABASE_URL and DIRECT_DATABASE_URL pointing at the lab database
pnpm sap:catalog:import    # reads sap-references/api-hub-catalog.json into SapApiReference
```

Then, signed in as `platform_admin`, open **Operations → Catalogue health**,
type the confirmation phrase `REBUILD SAP HUB CATALOGUE` and click **Rebuild
from bundled drops** (`src/components/ops/CatalogueHealthClient.tsx:81,237,418`;
`src/app/(operations)/operations/catalogue/page.tsx:16-33`). The rebuild copies
the API reference rows into the catalogue and adds the curated services. It
requires an admin (`src/app/api/sap/tdd/hub-content/seed/route.ts:255`).

Do not look for the button in **Studio → Discover**. Discover's **Rebuild from
API reference** calls the same route, but it sits inside the catalogue, and
Discover shows "No tenant connected" instead of the catalogue to anyone whose
organization has no connection. The platform owner has no organization, so it
never sees the button (`src/lib/auth/auth-options.ts:24-33`;
`src/app/(studio)/studio/discover/page.tsx:74-105`; `src/lib/studio/tenants.ts:77-123`).

### 4.9 Smoke test

- [ ] `GET /api/health` returns 200.
- [ ] A developer signs in and opens `/studio`. They see the Studio screens, not "role-gated".
- [ ] **Studio → Connections** shows no blocking banner about the encryption key.
- [ ] **Operations → Catalogue health** shows the rebuilt catalogue. **Studio →
      Discover** stays empty until the first connection is saved; check that it
      lists services after section 5.
- [ ] `GET /api/northbound/interfaces` without a token returns 401 `UNAUTHENTICATED`.
- [ ] One scheduled job, called with the secret, returns 200, and the same call without it is refused.

---

## 5. Connecting your SAP tenant

### 5.1 Rules for every connection

The base URL and the OAuth token URL are checked when you save
(`src/app/api/studio/connections/route.ts:90-131`). Each URL must meet all of
these rules:

- It uses `https://`, with no user name or password in the URL.
- Its host is not an IP address (IPv4 or IPv6), not `localhost`, and not
  `*.local` or `*.internal`. This holds **even if you add the domain to the
  extra list**.
- Its host is, or ends in, one of these suffixes: `ondemand.com`,
  `hana.ondemand.com`, `s4hana.cloud.sap`, `cloud.sap`, `sap.com`,
  `successfactors.com`, `successfactors.eu`, `ariba.com`, `sapariba.com`,
  `concursolutions.com`, `fieldglass.net`, or a suffix listed in
  `SAP_HOST_ALLOWLIST_EXTRA` (`src/lib/studio/sap-host-allowlist.ts:41-63`).
  The extra list can add suffixes but cannot switch the check off.

Nothing resolves DNS when the connection is saved. A DNS name that points at a
private address is therefore accepted. That is what lets an instance inside your
network reach an on-premise system.

Only a `consultant` can add, change or test a connection.

### 5.2 What Studio asks for (Studio → Connections)

| Field | Meaning |
|---|---|
| Product | One of `S/4HANA Cloud`, `SuccessFactors`, `SAP Cloud ERP Private`, `SAP S/4HANA (on-premise)`, `SAP ERP (ECC)` or `Ariba` (`src/lib/sap-public/tdd-connector.ts:445-560`) |
| SAP client | Three digits. Shown only for Cloud ERP Private, on-premise and ECC. CoreEdge appends it to every call as `sap-client=`. |
| Tenant key | A short id of your choice. Saving again under the same key **replaces** the connection. |
| Label | A display name |
| Environment | `SANDBOX`, `DEV`, `TEST` or `PROD`. Aliases are accepted: `SBX`, `DEVELOPMENT`, `QA`, `QAS`, `PRD` and `PRODUCTION`. Any other word is **refused** (`src/lib/sap-public/environment.ts:26-49`). The form's help text suggests free text; the server disagrees. Always set an environment, because a connection with no environment never accepts a write. |
| Base URL | The API host, for example `https://<your-tenant>-api.s4hana.cloud.sap`, with no trailing path to a service |
| Probe path | Optional. The service root that the Test calls, for example `/sap/opu/odata/sap/API_BUSINESS_PARTNER`. The broker does not use it, but it replaces the default target of the daily connection probe and the lane checks, so Operations health reports on it (`src/lib/studio/connection-health.ts:66-72`). |
| Timeout (ms) | Optional. The form accepts up to 120000, but the code caps the Test and reads at 30 s and writes at 45 s. |
| Auth type | `basic`, `bearer`, `oauth-client-credentials`, `oauth-saml-bearer` (SuccessFactors) or `api-key`. There is no X.509 option. |

Two connections for the same product, environment and SAP client cannot both be
active. The save is refused, because the broker could not tell them apart.

### 5.3 How the Test works and how to read it

**Test** sends one GET to `{base URL}{probe path}/$metadata`, with the SAP
client when one is set. Without a probe path, S/4 products use the V4 Purchase
Order service (`/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001`,
scenario `SAP_COM_0053`), SuccessFactors uses `/odata/v2/$metadata`, and ECC and
Ariba have no default (`src/lib/studio/connection-health.ts:66-73`).

| Result | Meaning | Usual cause, in SAP terms |
|---|---|---|
| `OK` | 200 with an EDMX metadata document: reachable and authenticated. | |
| `UNAUTHORIZED` | 401 or 403. Also: the token endpoint refused the client credentials, a credential field is missing, or the tenant redirected to another host, such as a login page (`src/lib/sap-public/upstream-failure.ts:124-153`). | Communication arrangement not set up, wrong communication user or password, locked user, missing `S_SERVICE` authorisation, wrong SAP client, wrong OAuth client |
| `NOT_FOUND` | 404 | Service not activated (`/IWFND/MAINT_SERVICE`, `/IWFND/V4_ADMIN`), or the probe path is wrong. Common when `SAP_COM_0053` is not in your arrangement and no probe path is set. |
| `TIMEOUT` | No answer within the timeout (10 s by default, 30 s at most) | Firewall drops the traffic, or the host cannot be reached from where CoreEdge runs |
| `ERROR` | Any other status, or the connection could not be made. Also a 200 that is not an OData metadata document (`src/lib/studio/connection-health.ts:185-201`). | DNS failure, connection refused, or a TLS certificate the CoreEdge host does not trust. A 200 that is not metadata usually means the UI host was entered instead of the `-api` host. |
| `NO_PROBE_PATH` | Nothing to call | ECC or Ariba without a probe path |
| `CONNECTION_UNREADABLE` | The stored secrets cannot be decrypted | `SAP_CONNECTION_ENCRYPTION_KEY` changed. Save the connection again. |

The Operations Center labels can mislead. `TIMEOUT` reads "reached, did not
answer in time", but it also covers hosts that were never reached. `ERROR` reads
"the tenant returned a failure", but it also covers DNS and TLS failures.

### 5.4 S/4HANA Cloud Public Edition

**On the SAP side (your tenant administrator).**

- Create a communication system that represents CoreEdge, with an **inbound**
  communication user. User and password authentication is the simplest choice.
- Create a communication arrangement for each scenario whose APIs you want to
  call. The scenarios CoreEdge has curated are `SAP_COM_0053` (purchase orders,
  also the default probe), `SAP_COM_0057` (supplier invoices), `SAP_COM_0101`
  (purchase contracts) and `SAP_COM_0054` (commercial projects)
  (`tdd-connector.ts:213-287`).
- For other APIs, use the scenario that Discover shows for the service.
- The repository has no step-by-step SAP-side guide. Follow SAP's documentation
  for communication management.

**In Studio.**

| Field | Value |
|---|---|
| Product | `S/4HANA Cloud` |
| Base URL | `https://<your-tenant>-api.s4hana.cloud.sap` |
| Environment | `DEV` or `TEST` |
| Auth type | `basic` with the communication user, or `oauth-client-credentials` |
| Probe path | Optional. Set one if `SAP_COM_0053` is not arranged. |

The correct OAuth token URL for an S/4HANA Cloud communication arrangement is
not documented in the repository. Start with `basic`.

**Network.** The tenant is on the internet. If the tenant restricts inbound
calls by IP address, a Vercel-hosted instance cannot be allow-listed, because
its outbound addresses are not fixed. Use option C in that case.

### 5.5 S/4HANA on-premise and SAP Cloud ERP Private (RISE)

These systems are normally **not reachable from a Vercel deployment**, and
CoreEdge has no Cloud Connector support (`tdd-connector.ts:474-479`). Use
option C, with the instance inside your network or VPN.

**On the SAP side (Basis).**

- Activate the OData service: `/IWFND/MAINT_SERVICE` for V2, `/IWFND/V4_ADMIN`
  for V4 service groups.
- Make sure HTTPS is active on the ICM, or on the Web Dispatcher in front of it.
- Create a technical user with `S_SERVICE` and the business authorisations the
  API needs.
- Give the host a DNS name that does **not** end in `.local` or `.internal`. IP
  addresses are always refused.

**On the CoreEdge host.**

- Set `SAP_HOST_ALLOWLIST_EXTRA` to the domain, for example `corp.example.com`,
  and redeploy.
- The host must trust the system's TLS certificate. CoreEdge has no option for
  this in code. Setting Node's standard `NODE_EXTRA_CA_CERTS` to your internal
  CA bundle is the obvious route, but it is **untested**.

**In Studio.**

| Field | Value |
|---|---|
| Product | `SAP S/4HANA (on-premise)` or `SAP Cloud ERP Private` |
| SAP client | For example `100` |
| Environment | `DEV` |
| Auth type | `basic`, or `oauth-client-credentials` if your Gateway issues tokens |
| Probe path | The root of a service that is activated, for example `/sap/opu/odata/sap/API_BUSINESS_PARTNER` |

When one environment has connections for several SAP clients (section 5.2
allows this), set the **SAP client** on the runtime credential in API Access to
the client of the connection it should use (`src/components/studio/ClientCredentials.tsx:191-202`).
A credential without a client then gets 403 `CONNECTION_NOT_CONFIGURED`, because
two connections match. A credential whose client no connection carries gets the
same code with a different message (`src/lib/sap-public/connection-resolver.ts:414-429,509-512`).

For the broker to serve a standard service on these products, the catalogue row
must be marked for that edition, or register the service path yourself
(section 6.1). Whether the loaded catalogue covers Private and on-premise well
enough was not checked. A registered path does not depend on it.

### 5.6 SuccessFactors

Follow `docs/runbooks/successfactors-saml-signing.md`.

1. In Admin Center, under **Manage OAuth2 Client Applications**, register a
   client with an X.509 certificate.
2. Note the API key, the company id and the API host.
3. Choose an active user ID with the role-based permissions the APIs need.
4. In Studio, choose auth type `oauth-saml-bearer` with the token URL
   `https://<api-host>/oauth/token`. Paste the private key; CoreEdge then signs a
   fresh assertion for every token request.

Caveats:

- The exchange has **not** been verified against a live tenant.
- **Discover cannot create a SuccessFactors interface the broker can serve.**
  For SuccessFactors the broker matches only three curated keys
  (`employee-central`, `recruiting`, `onboarding`) and skips the catalogue
  fallback (`src/lib/sap-public/resolve-hub-service.ts:21-33`), while Discover's
  **Add to interface** always sends the catalogue row's SAP API id
  (`src/components/studio/DiscoverClient.tsx:62-70`).
- **Register your own API instead.** Studio → Interfaces → **Register your own
  API**: product `SuccessFactors`, service path `/odata/v2`, OData version `V2`,
  and the entity set — a standard entity such as `PerPerson`, or one of your
  custom MDF objects (`cust_*`). Then **Verify** it. Set the entity set
  first: with one set, Verify asks for that dataset's own description,
  `/odata/v2/<EntitySet>/$metadata`, not the whole tenant's
  (`src/lib/studio/service-verify.ts:49-79`). Only the `/odata/v2` root works
  this way; an OData V4 service under `/odatav4/` serves its description only
  at its own root, so Verify reads it whole. The tenant-wide `/odata/v2/$metadata`
  is large and slow (SAP's own Employee Central performance guidance says so)
  and is likely to end in `TIMEOUT` (10 s by default, 30 s at most) or
  `METADATA_TOO_LARGE` (8 MB); with no entity set, that is what Verify has to
  ask. The one-dataset request was traced in code and covered by unit tests,
  not run against a live tenant.
- Every custom SuccessFactors interface on `/odata/v2` has the same grant id,
  `custom:/odata/v2`, so one approved grant covers all of that solution's
  interfaces on the root. This is the same per-service grant rule as for
  catalogue services; the entity set still decides what is read. The curated-key
  route in Appendix B also still works.
- Basic auth is allowed with warnings after 2026-11-20 and refused after the
  deletion date (2027-11-12 by default; `SF_BASIC_AUTH_DELETION_DATE` overrides it).

### 5.7 ECC, Ariba and the Business Accelerator Hub sandbox

- **ECC.** You can save a connection and test it with a probe path. ECC has an
  empty service list and no catalogue scope
  (`src/lib/sap-public/dynamic-catalog.ts:105-111`), so the broker serves your
  Gateway services by registering their paths (section 6.1) — the only way in.
  Only services activated in NetWeaver Gateway (`/IWFND/MAINT_SERVICE`) exist.
  Reachability is as for on-premise (section 5.5).
- **Ariba.** The Ariba connector reads only `ARIBA_*` environment variables. A
  stored Ariba connection can be saved, but it is not usable in practice.
- **Business Accelerator Hub sandbox.** The `api-key` auth type exists for it
  (default header `apikey`). Whether the sandbox works end to end through the
  broker was **not verified**.

### 5.8 Enabling writes on a connection

The Studio form never sends `writeEnabled`. Saving a connection through the form
therefore turns writes **off**, including saving it again only to change a
password (`src/components/studio/ConnectionsClient.tsx:420-465`). The
enable-writes switch (`PATCH`) refuses to turn writes on
(`connections/route.ts:630`).

The only way to turn writes on is a direct `POST` with `writeEnabled: true` and a
`writeSecret` (Appendix B). The server requires the `writeSecret` but never reads
it at runtime. The secret that actually authorises writes is the per-credential
write key.

---

## 6. Developing with ABAP

### 6.1 ABAP as provider: your RAP or CDS service behind CoreEdge

**What CoreEdge supports today.** At call time, the broker turns an interface
into a URL path from one of three sources, in this order
(`src/lib/sap-public/interface-service.ts:94-110`):

1. **The interface's own service path**, when it carries one. This is how your
   `Z*` RAP service, a key-user `YY1_*_CDS` view or custom business object, an
   ECC Gateway service or a SuccessFactors custom MDF object is reached. The
   path is used as given and nothing else is tried: if it is no longer valid,
   the call is refused with 400, never sent to a catalogue service instead.
2. The curated service list of the product.
3. A row in the catalogue table (`SapHubContent`) with the same id. This applies
   only to S/4 edition products: Public, Private and on-premise
   (`src/lib/sap-public/resolve-hub-service.ts:15-40`).

Sources 2 and 3 are unchanged. The same resolution serves the northbound read
and write, the Test Console, the nightly lane checks and the `callable` flag in
the discovery list, so none of them can disagree about which service an
interface calls (`src/lib/ops/lane-check-sweep.ts:88-106`).

**What you can do today.**

- Build the service in ADT. The table below and exercise 4 in section 7 cover
  the choices.
- Register it in Studio → Interfaces → **Register your own API** (Discover links
  there too), with its service path and OData version.
- **Verify** it in an environment. CoreEdge fetches `$metadata` through your
  connection for that environment, confirms it is an EDMX document, checks the
  OData version, and lists the entity sets. Pick yours from the list.
- Request access, issue the credential and, for writes, the write key, exactly
  as for a catalogue service.

Evidence level: traced in code and covered by unit tests
(`tests/unit/lib/sap-public/service-path.test.ts`,
`tests/unit/lib/sap-public/interface-service.test.ts`,
`tests/unit/northbound/custom-service-read.test.ts`,
`tests/unit/northbound/custom-service-write.test.ts`,
`tests/unit/studio/verify-service-route.test.ts`). **Not run against a live
tenant.**

**How to build the service so it fits CoreEdge.**

| Choice | Recommendation | Why |
|---|---|---|
| Protocol | Service binding of type **OData V2 - Web API** or **OData V4 - Web API** | Both work when you register the exact path, because nothing is guessed. Copy it from the binding's *Service URL*: V2 is `/sap/opu/odata/sap/<service>`, V4 is `/sap/opu/odata4/sap/<service group>/srvd_a2x/sap/<service>/<version>`. (A **catalogue** V4 path is still guessed (`src/lib/sap-public/hub-content.ts:526-542`); Verify can check it.) |
| Draft | A non-draft projection for the API | A create through a draft-enabled V4 BO most likely produces only a draft instance. This is SAP-side behaviour and was not tested. |
| Authentication | User and password on the inbound communication user, or OAuth client credentials | CoreEdge has no X.509 client certificates. |
| Operation | Design for create and read | The broker can read the first N rows and create records. It cannot update. |
| Exposure, S/4HANA Cloud Public | A custom communication scenario with your binding as inbound service, plus a communication system with an inbound user and a communication arrangement | This is SAP's documented inbound pattern for custom services. |
| Exposure, on-premise or Private | Register the V2 service in `/IWFND/MAINT_SERVICE`, or publish the V4 service group in `/IWFND/V4_ADMIN` | |

**Registering your own API.**

1. **Find the service root.** In ADT, open the service binding and copy the
   *Service URL*; on-premise, `/IWFND/MAINT_SERVICE` shows it too. Keep only the
   part after the host, starting with `/`, without `$metadata` and without
   `?sap-client=…` — CoreEdge adds the SAP client from the connection, after the
   full path. For example `/sap/opu/odata/sap/ZUI_LAB_TRAVEL_O2`. A version
   suffix such as `;v=0002` on the last segment is kept (`;v=2` is accepted and
   stored as `;v=0002`, so both are one grant id); every other matrix
   parameter is refused (see the rules below).
2. **Register it.** Studio → Interfaces → **Register your own API**: solution,
   name, product, service path, OData version (set from the path until you
   choose), operation, and optionally the entity set. Or with the API
   (Appendix B):

   ```js
   await fetch('/api/studio/interfaces', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       solutionId: '<solution id>', sapProduct: 's4hana', name: 'Lab travel read',
       servicePath: '/sap/opu/odata/sap/ZUI_LAB_TRAVEL_O2', odataVersion: 'V2',
       operation: 'READ', entitySet: 'Travel'
     })
   }).then(r => r.json());
   ```

   It creates a DRAFT and grants nothing, like **Add to interface**.
3. **Verify it in each environment you will write to.** Open the interface,
   choose the environment (and SAP client) under **Verified**, and press
   **Verify** (`POST /api/studio/interfaces/<id>/verify-service`,
   `src/app/api/studio/interfaces/[id]/verify-service/route.ts:73`). It asks the
   connection a call from that environment would use, and a success is recorded
   for that environment and SAP client only. Two clients of one system in the
   same environment are verified, and kept, separately. The panel lists the
   environments verified, and flags one whose connection has been edited since
   (*Verify again: the connection for ... has changed*). A result on screen
   belongs to the interface version it was asked about; after a change to the
   path, the version or the dataset it disappears, so verify again.
   Outcomes:

   | Shown as | Status | What to do |
   |---|---|---|
   | verified | `OK` | Nothing. The datasets are listed; pick one with **Use this dataset** if you have not. |
   | no such service | `NOT_FOUND` | Check the path against the binding's Service URL or `/IWFND/MAINT_SERVICE`, and that the service is published. |
   | sign-in refused | `UNAUTHORIZED` | SAP answered 401 or 403, or redirected to a login page: check the communication user, the arrangement and `S_SERVICE`. |
   | dataset not found | `ENTITY_SET_MISSING` | Names are case-sensitive. A near match is offered as *Did you mean …?*. |
   | version differs | `VERSION_MISMATCH` | The service describes itself as the other OData version. Press **Switch to V2/V4 and verify again** under the answer, or change it under **Change path or version**. |
   | too large | `METADATA_TOO_LARGE` | The description is over 8 MB (`src/lib/studio/service-verify.ts:82`). Split the service. |
   | no connection | `BINDING_REFUSED` | No connection declares that environment (or SAP client). Fix it in Connections. |
   | failed, no answer | `ERROR`, `TIMEOUT` | 5xx, a 200 that is not EDMX (often a login page), or no answer in time. |

4. **Request the grant, issue the credential**, and for a write interface the
   write key, as for any service. Then **Mark ACTIVE**.

**Rules that follow from the design.**

- **The id is derived**: `custom:<path>`
  (`src/lib/sap-public/service-path.ts:259-261`). Grants name that id, so a
  grant a second person approved for one path never authorises another.
- **The path is a path on the connection's host and nothing else.** A full URL,
  `//host`, `.` or `..` segments (also with parameters, `..;` or `..;x=1`, which
  servlet containers and proxies read as `..`), empty segments, `?`, `#`,
  backslashes, whitespace and control characters, `$metadata`, and
  percent-escapes that decode to any of those or to `;` (`%2e%2e`, `%2f`,
  `%3b`, `%252e`) are refused, with a sentence saying what to enter instead
  (`src/lib/sap-public/service-path.ts:184-255`). Ariba is REST, not OData, and
  has no path.
- **The path must be an OData service.** It has to sit under `/sap/opu/odata/`
  or `/sap/opu/odata4/`, or be SuccessFactors' `/odata/v2` or under `/odatav4/`
  (`src/lib/sap-public/service-path.ts:137-155`). Reads are not checked against
  `$metadata`, and the connection's credentials go with every call, so without
  this rule a path such as `/sap/bc/adt/...`, `/sap/bc/soap/rfc` or a customer
  REST handler would have been called through the broker and its JSON served as
  records. An ICF alias for an OData service is refused too; register the
  service's `/sap/opu/odata...` path instead.
- **The path cannot choose the SAP system or client.** The connection and its
  environment binding decide that, and the grant, the audit row and the write
  gate all read the binding. A Gateway hub routes `;o=<system alias>` to another
  backend, and an ICF session segment such as `/sap(bD1lbiZjPTIwMA==)/` carries
  another client (`c=200`), both behind the connection's host where no origin
  check sees them. So every matrix parameter except a version suffix on the
  last segment (`;v=` and one to four digits, stored as four) is refused, and `(` or `)` in the first
  two segments are refused. These are documented SAP behaviours; whether a
  particular hub honours them was not tested. A path stored before this rule
  no longer resolves, and its calls answer 400 until the path is corrected.
- **Writes need a current verification for the caller's environment.** The
  write route refuses a custom service unless the write credential's
  environment has a successful verify since the interface last changed, made
  through the same connection, SAP client and host the write is bound to. It
  refuses before the `Idempotency-Key` is reserved and before SAP is called
  (`src/app/api/northbound/interfaces/[id]/data/write/route.ts:302-318`,
  `src/lib/sap-public/service-verifications.ts:116-128`). Verifying SANDBOX or
  DEV does not open PROD, and verifying client 200 does not open (or close)
  client 100. A custom WRITE interface is activated only when one environment
  holds a credential with a write key, an approved write grant **and** a
  verification of the very connection that credential binds to (its
  environment and SAP client), unchanged since
  (`src/app/api/studio/interfaces/route.ts:433-450,501-521`,
  `src/lib/sap-public/current-connections.ts`, `src/lib/studio/write-readiness.ts:104-111`).
  Verified in SANDBOX with the write chain only in PROD is refused, and the
  Write chain row shows `service not verified here` for PROD. So is PROD
  client 100 verified while the PROD credential is bound to client 200. Reads are not
  gated.
- **Changing the path, the version or the dataset is a new contract.** The
  version bumps, verification clears in every environment, and an active write
  interface returns to draft; changing one of them and activating in the same
  request is refused. Only a **path** change produces a new id, so only then do
  existing grants detach (ask for a new one); an active read interface stays
  active, and its calls answer 403 until the new grant is approved. After a
  version or dataset change the grants stay attached
  (`src/app/api/studio/interfaces/route.ts:416-431,532-569`).
- **A failed verify never clears an earlier success**, in any environment, so a
  timeout cannot stop live writes. A verify is recorded only if the interface
  did not change while SAP was answering; a verify of another environment that
  lands at the same moment is kept, not overwritten
  (`src/app/api/studio/interfaces/[id]/verify-service/route.ts:226-273`).
- **Verify is audited and throttled like the connection Test**: a console-read
  row in the northbound trail and a `TEST_CONNECT` config-audit entry, and the
  tight live-SAP rate-limit bucket (`src/lib/security/rate-limit.ts:292`).
- **Catalogue and custom do not convert.** To move an interface from one to the
  other, register a new one.

### 6.2 ABAP as consumer: calling CoreEdge from ABAP

This should work today, within the API limits from section 8, but it has not
been tested from ABAP. The call is plain HTTPS with headers.

1. **In CoreEdge.** Register a solution, an interface, an approved grant and a
   runtime credential (exercise 1). Note the interface id and the `ce_` token.
2. **Network.** The SAP system must reach the CoreEdge host over HTTPS and trust
   its certificate. On-premise, import the CA chain into the SSL client PSE in
   STRUST. In ABAP Cloud, add it to the certificate trust list if the call fails
   with a TLS error. Whether a Vercel host's chain is trusted by default was not
   checked. On-premise, also check in RZ11 that client-side SNI is on
   (`icm/HTTPS/client_sni_enabled = TRUE`, or `ssl/client_sni_enabled` on 7.21
   and 7.22 kernels) and that `ssl/client_ciphersuites` allows TLS 1.2. Shared
   hosts such as Vercel's edge need SNI, and on older kernels it is often off, so
   the handshake fails (typically `SSSLERR_CONN_CLOSED` in the ICM trace). Run
   the SM59 connection test before writing code. This is SAP-side guidance and
   was not verified from this repository.
3. **Destination.**
   - *On-premise:* in SM59, create a type G destination, for example
     `ZCOREEDGE`. Set the host to the CoreEdge host, port 443, path prefix
     `/api/northbound`, SSL active, and no logon data, because the token travels
     in a header. Add your HTTP proxy if your landscape needs one.
   - *ABAP Cloud (S/4HANA Cloud developer extensibility or BTP ABAP
     environment):* in ADT, create an outbound service of type HTTP and a
     communication scenario that contains it, then publish locally. The service
     id used at runtime is expected to carry a `_REST` suffix; check the exact
     id in ADT. The administrator creates a communication system for
     the CoreEdge host and a communication arrangement. **Unknown:** whether
     the communication system can be set to outbound authentication "none", so
     that your code adds the Bearer header itself. Check this on your release.
4. **Secrets.** CoreEdge accepts only a static `Bearer` token
   (`src/lib/northbound/auth.ts:32-37`), plus a second static header for writes.
   SM59 and communication arrangements store Basic, X.509 and OAuth credentials,
   not an arbitrary header value. Do not hard-code tokens in source code. This
   guide does not recommend a store, because none was verified. Agree one with
   your security team.

**Read: OUTLINE to adapt. Not compiled, not tested against CoreEdge.** Check
every signature on your release.

```abap
" ABAP Cloud flavour, run as an ADT console application.
CLASS zcl_ce_read_demo DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_ce_read_demo IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA(lv_iface_id) = `<interface id from Studio>`.
    DATA(lv_token)    = `<ce_ token: load it from your agreed secret store>`.

    TRY.
        DATA(lo_dest) = cl_http_destination_provider=>create_by_comm_arrangement(
                          comm_scenario = 'ZCE_NORTHBOUND_CS'
                          service_id    = 'ZCE_NORTHBOUND_REST' ).
        DATA(lo_client) = cl_web_http_client_manager=>create_by_http_destination( lo_dest ).
        DATA(lo_req)    = lo_client->get_http_request( ).

        " VERIFY: whether this path is appended to the outbound service's path prefix.
        lo_req->set_uri_path( i_uri_path = |/interfaces/{ lv_iface_id }/data?limit=50| ).
        lo_req->set_header_field( i_name = 'Authorization' i_value = |Bearer { lv_token }| ).
        lo_req->set_header_field( i_name = 'Accept'        i_value = 'application/json' ).

        DATA(lo_resp)   = lo_client->execute( if_web_http_client=>get ).
        DATA(lv_status) = lo_resp->get_status( )-code.
        DATA(lv_corr)   = lo_resp->get_header_field( 'x-correlation-id' ).
        DATA(lv_json)   = lo_resp->get_text( ).
        lo_client->close( ).

        " 200 body: { "data": { "records": [...], "count": n, "empty": bool,
        "                      "interface": { "id", "name", "version" }, "note": "..." } }
        " Error body: { "error": { "code": "...", "message": "...", "correlationId": "..." } }
        out->write( |HTTP { lv_status }, correlation id { lv_corr }| ).
        out->write( lv_json ).
      CATCH cx_http_dest_provider_error cx_web_http_client_error INTO DATA(lx_err).
        out->write( lx_err->get_text( ) ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
```

```abap
" Classic ABAP flavour (on-premise, SM59 type G destination ZCOREEDGE).
DATA lo_http     TYPE REF TO if_http_client.
DATA lv_code     TYPE i.
DATA lv_iface_id TYPE string VALUE '<interface id from Studio>'.
DATA lv_token    TYPE string.   " load from your agreed secret store; never hard-code

cl_http_client=>create_by_destination(
  EXPORTING  destination = 'ZCOREEDGE'
  IMPORTING  client      = lo_http
  EXCEPTIONS OTHERS      = 1 ).
IF sy-subrc <> 0.
  " destination missing or not authorised
ENDIF.

" VERIFY: whether this is appended to the SM59 path prefix /api/northbound.
cl_http_utility=>set_request_uri( request = lo_http->request
                                  uri     = |/interfaces/{ lv_iface_id }/data?limit=50| ).
lo_http->request->set_method( if_http_request=>co_request_method_get ).
lo_http->request->set_header_field( name = 'Authorization' value = |Bearer { lv_token }| ).
lo_http->request->set_header_field( name = 'Accept'        value = 'application/json' ).

lo_http->send( EXCEPTIONS OTHERS = 1 ).
lo_http->receive( EXCEPTIONS OTHERS = 1 ).
lo_http->response->get_status( IMPORTING code = lv_code ).
DATA(lv_json) = lo_http->response->get_cdata( ).
DATA(lv_corr) = lo_http->response->get_header_field( 'x-correlation-id' ).
lo_http->close( ).
" Parse lv_json with your JSON tool of choice, for example /ui2/cl_json on classic ABAP.
```

**Create: OUTLINE.** The differences from the read are listed here, for either
flavour.

- **Path:** `/interfaces/{id}/data/write`, method POST.
- **Headers:**
  - `Authorization: Bearer <ce_ token>`
  - `X-CoreEdge-Write-Key: <cew_ key>`
  - `Content-Type: application/json`
  - `Idempotency-Key: <key>`. It is mandatory: 8 to 255 characters from
    `A-Z a-z 0-9 _ . : -` (`src/lib/northbound/idempotency.ts:36`).
- **Idempotency key:** for example `cl_system_uuid=>create_uuid_c32_static( )`,
  which raises `cx_uuid_error`. Store it with your business document **before**
  sending, and send the **same** key on every retry of the same intent. Keys are
  honoured for 24 hours.
- **Body:** `{"record": { ...fields of the entity... }}`, for example
  `` `{"record":` && lv_record_json && `}` ``. Do **not** send an `entity` field.
  A value that differs from the governed entity set is refused.
- **Success:** 201 with `data.created`, `data.record` and `data.location`. A
  replay of the same key returns the stored response with the header
  `idempotency-replayed: true`.

**Payload format.** CoreEdge passes `record` to SAP unchanged
(`src/lib/northbound/write.ts:304-309`). Reads return SAP's own OData JSON with
only the `__metadata`, `__deferred` and `@odata.*` envelope removed
(`src/lib/northbound/read.ts:63-72`; `src/lib/sap-public/odata-envelope.ts:72-81`).
Field names and value formats are therefore those of the SAP service behind the
interface:

- Use the service's exact property names, usually PascalCase such as
  `PurchaseOrder`, not ABAP's upper-case component names.
- Use that OData version's encodings. In V2, `Edm.DateTime` is `/Date(<ms>)/`
  and `Edm.Decimal` is a JSON string. V4 uses ISO 8601 dates and JSON numbers.
- There is no request contract to check against, because `requestSchema` is
  never written (`src/app/api/northbound/interfaces/[id]/schema/route.ts:121`).
  Use the service's `$metadata` as the contract, or the interface's `/schema`
  once a response schema has been captured in Studio
  (`src/app/api/studio/interfaces/[id]/capture-schema/route.ts:68`).
- `/ui2/cl_json` writes upper-case names by default, which SAP rejects (422).
  Its `camel_case` mode gives lowerCamelCase (`purchaseOrder`), which does not
  match either. Map names explicitly, and convert V2 dates and decimals
  yourself. This is OData and ABAP behaviour, not tested against CoreEdge.

**How the ABAP caller should react to each answer** (`src/lib/northbound/respond.ts`;
read and write routes). `error.message` names the cause in every case, so log
it.

| HTTP | `error.code` | Meaning | What the caller should do |
|---|---|---|---|
| 200 | | Rows. `empty: true` is a valid empty result. | Process the rows |
| 201 | | Record created | Store `record` and `location` |
| 400 | `VALIDATION_ERROR` | Configuration problem: no entity set, unresolvable service, bad body or bad idempotency key | Fix the configuration. Do not retry. |
| 401 | `UNAUTHENTICATED` | Token missing, wrong, revoked, rotated or expired | Stop. Get a new token. |
| 403 | `FORBIDDEN` | CoreEdge refused: no live grant, grant expired or revoked, or wrong write key; writes are not enabled on the connection (any Studio-form save turns them off, section 5.8); the interface is not ACTIVE (writes) or is DEPRECATED (reads); the interface's operation does not match the route (a CREATE interface on `/data`, a READ interface on `/data/write`) (`src/lib/northbound/access.ts:146-162,298-314`; `src/app/api/northbound/interfaces/[id]/data/write/route.ts:248-256`). Or SAP itself answered 401/403. Also: the connection's stored credential is unusable or its token endpoint refused it, and SAP was never called (`src/lib/northbound/read.ts:166-172`). | Do not retry. Fix the cause the message names: in Studio, with the Appendix B call, in the grant, or in the SAP arrangement. CoreEdge's own refusals are never stored under the key. A 401/403 from SAP on a write **is** stored and replayed for 24 hours, so after fixing the SAP side, send under a **new** key. SAP refused, so nothing was created. |
| 403 | `CONNECTION_NOT_CONFIGURED` | No connection bound to the credential's environment, two connections match (the credential names no SAP client), or none carries the credential's SAP client (`src/lib/sap-public/connection-resolver.ts:414-429`) | Fix the connection or the credential's SAP client. Do not retry. |
| 404 | `NOT_FOUND` | Interface not found for this solution, or SAP returned 404 | Check the interface id and the service activation |
| 409 | `CONFLICT` | Key reused with a different payload, or the first request is still in flight | Use a new key only for a new intent |
| 422 | `VALIDATION_ERROR` | SAP rejected the payload (writes) | Fix the payload. Do not retry unchanged. |
| 429 | `RATE_LIMITED` | More than 60 calls per minute for this credential. Reads and writes have separate budgets (`src/lib/security/rate-limit.ts:234`). Discovery and schema calls spend the read budget too. | Wait for the `retry-after` seconds. Only `/data` and `/data/write` send it; assume 60 s otherwise. |
| 429 | `RATE_LIMIT_EXCEEDED` | The per-IP limit in the middleware, for the whole calling host: 300 GET or 120 POST per minute on `/api/*`. Every ABAP program behind the same SAP egress IP shares it. In production an unreachable Upstash gives this answer to every call. The body has no `correlationId`, and there is no `x-correlation-id` header (`src/middleware.ts:243-296`). | Wait for `Retry-After`. Treat any 429 as retryable; do not branch only on `RATE_LIMITED`. |
| 502 | `UPSTREAM_ERROR` | SAP or its token endpoint failed. For reads also: SAP answered with a status other than 200, 401, 403 or 404, for example 400 because the entity set needs a key, a filter or parameters CoreEdge cannot send, or SAP answered 200 with something that is not OData JSON, such as a login page (`src/lib/northbound/read.ts:123-127,200-208`). For writes also: SAP's 408 and 429, which mean SAP did not process the write. | Reads: retry with backoff a few times only. If the 502 persists, quote the correlation id: an SAP rejection or a non-OData answer does not clear on retry. Writes: see "Retrying a failed write" below. |
| 504 | `UPSTREAM_TIMEOUT` | SAP did not answer in time. It can also be the connection's token endpoint. | Reads: retry. Writes: see below. |

**Retrying a failed write (502 or 504).** Read `error.message`.

- If it says the write was never sent or was not applied, the key was
  released, so retry with the **same** key; it really does write. This
  covers the credential step, the CSRF handshake and SAP's 408 or 429
  (`src/lib/northbound/write.ts:275-290,358,375-383,423-463`;
  `src/app/api/northbound/interfaces/[id]/data/write/route.ts:425-429`).
- Otherwise SAP may have acted, and the same key replays the stored answer for
  24 hours (`idempotency-replayed: true`). Check SAP for the record before you
  send again under a new key.

Always log `x-correlation-id`, for example in the application log (BAL). It is
the key that links your call to the CoreEdge audit trail. The middleware's
`RATE_LIMIT_EXCEEDED` answer is the one response without it.

### 6.3 ADT tooling: the bundled abap-mcp server

`abap-mcp/` is a separate Python tool, and nothing in the web app calls it. It
is an MCP server that lets an AI client such as Claude Code read an ABAP system
through the ADT REST APIs.

| | |
|---|---|
| Status | v0.2. Read-only. 73 offline tests. **Never validated against a live system** (`abap-mcp/README.md:8-11`). |
| Tools | List profiles, check connection, search objects, get source, object structure, object metadata, run ATC, get ATC findings, syntax check |
| Runs on | A developer laptop over stdio. Python 3.11 or later, with `mcp>=1.2.0,<2` (`abap-mcp/pyproject.toml`). |
| SAP side | `/sap/bc/adt` active in SICF, and a service user with display-only ADT authorisations. `abap-mcp/README.md:16` names `S_ADT`, but SAP has no authorisation object of exactly that name. Ask Basis for `S_ADT_RES`, `S_RFC` for the ADT function groups, and `S_DEVELOP` with the display activity, and check with SU53 after a first probe run. This is SAP-side guidance, not verified from this repository. HTTPS with Basic auth only. |
| Not included | Write, activate, lock or transport tools. Where-used, DDIC and CDS source. |

Setup, following `abap-mcp/README.md`:

```bash
cd abap-mcp
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp profiles/example.profile.yaml profiles/lab-dev.yaml
# edit id (set it to lab-dev: it must match --profile and the ABAP_MCP_LAB_DEV_*
# variable names), base_url, sap_client, release and atc_check_variant (use a
# variant that exists on your system; the example's is a readiness variant)
export ABAP_MCP_LAB_DEV_USER=<display-only service user>
export ABAP_MCP_LAB_DEV_PASS=<password>
python -m pytest                                              # offline tests
python scripts/adt_probe.py --profile lab-dev --object-type PROG --object-name <a Z program> --out captures/
```

- The profile id comes from the `id:` key inside the file, not from the file
  name, and the credential variables are derived from it
  (`abap-mcp/src/abap_mcp/profiles.py:95-110,128-136`). A copied file still says
  `id: sandbox-dev`, and `--profile lab-dev` then fails with "Unknown profile".
- `captures/` contains object names and findings. It is git-ignored; keep it that way.
- If the code you analyse belongs to a customer, get written consent first,
  because source code is sent to the AI provider
  (`abap-mcp/docs/client-onboarding-checklist.md`).

SAP's own ADT tooling now ships an ADT MCP server in ADT for VS Code. Per SAP's
tutorial (https://developers.sap.com/tutorials/abap-environment-adt-vscode.html),
it needs an SAP BTP ABAP environment, an S/4HANA Cloud ABAP environment, or
S/4HANA 2025 or later. The repository's own assessment argues against SAP's
server for read-only analysis today (`abap-mcp/docs/build-vs-adopt.md:90-93`):

- It needs a developer's interactive Eclipse or VS Code session.
- It has no server-side read-only enforcement, only a client-side approval
  dialog. It runs inside your own ADT session with your own authorisations, so
  it is not limited to reading.
- Its documented tool list has no source-read or object-search tool.

If your lab system qualifies, check that SAP's tool list covers ATC on your
release before you choose it for a read-only exercise. Otherwise use `abap-mcp`,
which runs as a display-only service user. `build-vs-adopt.md` records the
trade-offs, and that decision is still open.

---

## 7. Lab playbook: the first two weeks

Five exercises, from the simplest to the most ambitious. Exercises 1 and 4 use
only features that work today, apart from the optional stretch goal in exercise
4. Exercise 2 uses an ABAP client path nobody has tested, exercise 3 needs the
Appendix B API calls, and exercise 5 uses a tool never validated against a live
system (section 2; `abap-mcp/README.md:8-11`). Treat those three as experiments
and record what happens.

The examples assume three people:

- **Lab lead**: platform owner and `partner_lead`.
- **Developer A**: `consultant`, owner of the solution.
- **Developer B**: `consultant`, reviewer and issuer.

### Exercise 1: stand up the lab and make the first governed read (days 1-3)

**Goal.** Everyone sees the whole governance chain work once, on a standard API.

**Steps.**

1. Lab lead: host the instance and bootstrap the accounts (sections 4.1 to 4.9).
2. SAP administrator: in a development or test tenant, arrange a scenario with a
   read API you care about. `SAP_COM_0053` is the easiest choice because it is
   also the default probe.
3. Developer A: in **Studio → Connections**, add the connection with
   environment `DEV` and click **Test**. Continue only when the result is `OK`.
4. Developer A: in **Solutions**, create a solution and claim the three owner
   slots.
5. Developer A: in **Discover**, choose the service and create a READ interface.
   In **Interfaces**, set the entity set exactly as it is named in the service's
   `$metadata`.
6. Developer A: in **API Access**, request a READ grant for `DEV` with an expiry
   date and a justification.
7. Developer B: decide the grant as **APPROVED**. `SANDBOX_ONLY` works only for
   SANDBOX grants: on a DEV grant it is accepted, authorises nothing, and the
   request has to be raised again (`src/lib/studio/grants.ts:70-96,167-173`).
   Then issue a runtime credential for `DEV` and copy the `ce_` token, which is
   shown only once. For on-premise or Private, when one environment has
   connections for several SAP clients, set the credential's SAP client to the
   connection's client (section 5.5).
8. Developer B: in the **Test Console**, run the interface.
9. Anyone: run these calls from a laptop.

   ```bash
   curl -sS -H "Authorization: Bearer $CE_TOKEN" https://coreedge-lab.example.com/api/northbound/interfaces
   curl -sS -H "Authorization: Bearer $CE_TOKEN" "https://coreedge-lab.example.com/api/northbound/interfaces/<id>/data?limit=5"
   ```

**Done when.**

- Discovery shows `"callable": true`.
- The data call returns 200 with records.
- The same call with a wrong token returns 401 `UNAUTHENTICATED`.
- The Test Console run appears in the audit trail as a dry run.

### Exercise 2: read through CoreEdge from ABAP (days 3-6)

**Goal.** An ABAP class calls the CoreEdge API and handles every outcome cleanly.

**Steps.**

1. Basis: create the destination (section 6.2, step 3) and trust the CoreEdge
   certificate.
2. Developer: adapt the read outline into a class or report, and parse
   `data.records` into an internal table.
3. Log the HTTP status and `x-correlation-id` for every call.
4. Provoke and handle the failure cases:
   - Developer B, who is not an owner, rotates the credential in API Access. An
     owner of the solution cannot (`src/app/api/studio/clients/route.ts:349-352`).
     The old token must now give 401. Put the new token in your secret store.
   - Let the grant expire, or have the platform owner revoke it in Control
     Tower. The call must now give 403. A decided grant cannot be decided again
     (`src/lib/studio/grants.ts:167-173`), so Developer A then requests a new
     READ grant and Developer B approves it. Otherwise later reads keep
     returning 403.
   - Send more than 60 calls in a minute. You must get 429 `RATE_LIMITED` with
     `retry-after`.

**Done when.** The class prints the record count on success, and each of 401,
403 and 429 produces a clear message with the correlation id. Developers can
explain why a 403 must not be retried.

### Exercise 3: create a record through the write path (week 2, DEV or SANDBOX only)

**Goal.** Learn the write chain and idempotency.

**Steps.**

1. Choose a standard API that your communication arrangement allows to create
   records.
2. Developer A: create an interface with operation `CREATE` and set its entity
   set. Request a CREATE grant for `DEV`.
3. Developer B: decide the grant as **APPROVED**, not `SANDBOX_ONLY`, which on a
   DEV grant authorises nothing, and acknowledge the write checklist.
4. Developer A: enable writes on the connection with the Appendix B call.
5. Developer B, who is not an owner: mint the write key with the Appendix B call
   and copy the `cew_` key.
6. Developer A: in **Interfaces**, mark the interface ACTIVE. The screen shows
   which environments have the full write chain.
7. POST a record with an `Idempotency-Key`, using curl or the ABAP create
   outline.
8. Send the same request again with the same key. Then send a different payload
   with the same key.

**Done when.**

- The first POST returns 201, and the record is visible in SAP.
- The repeat returns the same body with `idempotency-replayed: true`.
- The changed payload returns 409.
- If you have a Support user, the call appears in **Operations → Write ledger**.
- Discovery shows `"callable": false` for this interface even with the full
  write chain in place, because `callable` describes reads only (Appendix A).

### Exercise 4: build a RAP service ready for governance (week 2)

**Goal.** Produce a custom OData service the way CoreEdge will need it, and
prove that CoreEdge can reach it.

**Steps.**

1. In ADT, build a small non-draft RAP business object with a projection, a
   service definition and a service binding of type **OData V2 - Web API** (or
   **OData V4 - Web API**).
2. Expose it:
   - S/4HANA Cloud: a custom communication scenario with the binding as inbound
     service, a communication system with an inbound user, and a communication
     arrangement.
   - On-premise: register the service in `/IWFND/MAINT_SERVICE`.
3. In CoreEdge, register it: Studio → Interfaces → **Register your own API**,
   with the path from the binding's Service URL and its OData version (section
   6.1). Open the interface and press **Verify** for DEV. Pick your entity set
   from the list it returns. You do not need to change the connection's probe
   path for this; the connection stays as it is, writes included.
4. Write down what the team would need from CoreEdge to call this service:
   entity sets, operations, filters and keys. This becomes your input to the
   product backlog (section 8).
5. Request a READ grant for DEV on the interface, have a second person approve
   it, issue a DEV credential, and make one broker read — from the Test Console,
   or with `curl` and the credential's token. Record exactly what came back.

**Done when.** Verify returns `OK` with your entity set, and one broker read of
your own service succeeds (rows, or an honest empty result). The gap list is
written down.

### Exercise 5: ATC and code analysis with an MCP client (week 2, optional, in parallel)

**Goal.** Judge whether AI-assisted, read-only ABAP analysis is useful on your
releases.

**Steps.**

1. Choose SAP's ADT MCP server only if your system qualifies and its tool list
   covers ATC on your release. It runs with your own authorisations, not a
   display-only user (section 6.3). Otherwise use `abap-mcp`.
2. For `abap-mcp`: set it up as in section 6.3 against a sandbox, with a
   display-only user.
3. Run `adt_probe.py` against one `Z` object.
4. Register the server with your MCP client. Run `abap_check_connection`, then
   `abap_run_atc` on a few `Z` objects.

**Done when.** The probe passes every step on your release, the ATC findings
match what ADT shows for the same objects and check variant, and every mismatch
is logged.

---

## 8. Limits, known gaps and who to ask

### API limits to design around

| Limit | Detail |
|---|---|
| Reads | Only `?limit=`, with a default of 10, a minimum of 1 and a maximum of 100. CoreEdge sends SAP only `$top` and `$format=json`. There is no `$filter`, `$select`, key lookup, `$expand` or paging, and `?entity=` is ignored (`src/app/api/northbound/interfaces/[id]/data/route.ts:87`; `src/lib/northbound/read.ts:56, 149, 177`). |
| Writes | CREATE only. An UPDATE interface cannot be activated, and DELETE does not exist (`src/lib/studio/write-readiness.ts:177-179`). |
| One entity set per interface | It is fixed in Studio. The caller cannot choose it. |
| Rate | 60 calls per minute per credential for reads, discovery and schema calls included, and a separate 60 for writes. The middleware also limits per IP: 300 GET and 120 POST per minute on `/api/*`, shared by every caller behind the same egress IP, with its own 429 shape (section 6.2). |
| Timeouts | Reads: 15 s by default, 30 s at most. Writes: 45 s at most. Token requests: 10 s. |
| Contracts | `requestSchema` is never written, so a write interface has no request contract. |
| Tokens | A read token issued without an expiry never expires. Grants must have one. |

### Product gaps that matter most for an ABAP team

1. Gateway catalogue discovery (`/IWFND/CATALOGSERVICE`), so a developer can
   pick one of the customer's own services instead of typing its path.
2. On-premise reachability from a hosted instance, through Cloud Connector, a
   proxy or a custom CA.
3. Filtered and keyed reads, and paging.
4. UPDATE with ETag handling.
5. X.509 client certificates towards SAP.
6. A CoreEdge authentication scheme that SM59 and communication arrangements can
   store natively, such as OAuth client credentials.
7. An ABAP sample in the starter kit.
8. Screens for enabling writes and minting the write key.
9. A screen to create organizations and invite users while `WORKBENCH_ONLY` is
   set.
10. A KMS-backed key with versioning and rotation.

### Who to ask

| Topic | Contact |
|---|---|
| Permission to copy or host, and product questions | The author, through the contact route given in `LICENSE`. `SECURITY.md` describes a small project without a staffed security team. It offers no response-time guarantee, but says to expect an acknowledgement within a week (`SECURITY.md:22-24`). |
| Security issues | Follow `SECURITY.md`. Do not test against the live deployment. |
| Communication arrangements, users, SICF, STRUST, `/IWFND/*` and firewall rules | Your SAP Basis and security team |
| API reference and screen help | `docs/coreedge-developer-guide.md`, and the in-app manual at `/help` |

---

## 9. Before you hand this repo to another team

### Licence

The repository is under a proprietary licence with all rights reserved. Nobody
may copy, modify, distribute, host or otherwise use it without the author's
**prior express written permission** (`LICENSE:1-19`; `README.md:3-5`). The
repository being publicly readable does not grant any of these rights.

Before another team takes the code:

- Get a written licence from the author that covers copying, modifying, hosting
  and internal R&D use.
- `abap-mcp/` has no licence file of its own, and its README calls it
  proprietary. Make sure the written permission covers it explicitly.
- Whether the employer of the people who wrote the code also has a claim is a
  legal question that the repository cannot answer. Settle it at the same time.

### Handing over a clean copy

1. **Export the tree without history**, for example with `git archive`. Do not
   hand over a fork. The local clone is shallow, so earlier commits could not be
   audited for removed material.
2. **Have someone who knows the past engagements review these locations.** They
   are known to hold customer-identifying, partner-restricted or
   deployment-specific material that the confidentiality guard does not catch:

   | Location | What to review |
   |---|---|
   | `tests/fixtures/classification/sap-2602/cases.json` | Verbatim requirement texts from a customer tender. Replace them with synthetic cases. |
   | `scripts/` | Import and classification scripts named after customers or bids. List them all and review each one. |
   | `docs/design/` | Reports and screenshots |
   | `Conversion/`, `logs/` | Partner-portal harvests that name a user account. Personal company email addresses. |
   | `fit-portal-transfer/specs/`, `curation-model/`, `docs/neutral-discovery/data/` | Possible customer-specific content. Only the names were checked. |
   | `docs/deployment-urls.md`, `docs/runbooks/`, `docs/coreedge/`, `tests/` | Production host names, real-looking SAP tenant host names and connection keys |
   | `sap-references/2608/*.xlsx`, `sap-references/hub-harvest/`, `sap-references/api-hub-catalog.json`, `Conversion/api-hub-*.json` | SAP content. Whether your SAP agreements allow redistributing it is an open question. |
   | `scripts/lib/confidential-terms.json` | Its `note` fields are free text. Review them in case they hint at the hashed terms. |

   Whatever you strip from `docs/`, keep `docs/coreedge-developer-guide.md`.
   The build and the in-app `/help/developer-guide` require it (section 4.0).
3. **Run the guard and add to it.** Add the customer names with
   `pnpm guard:add-term`, then run `pnpm guard:confidentiality`. The guard skips
   binary files (`.xlsx`, `.docx`, `.pdf`, `.pptx`) and files over 4 MB, and it
   does not run in CI. Check binaries by hand.
4. **Do not pass on any secret or database.** The receiving team generates its
   own secrets (section 4.2). It must never receive another instance's
   `SAP_CONNECTION_ENCRYPTION_KEY`, database dump or `.env` files.
5. **Change the defaults that point at the original owner.** These are
   `AUTH_ALLOWED_DOMAINS`, `WEBAUTHN_*`, the branding defaults in `.env.example`,
   and `EMAIL_SENDER_NAME`.
6. **Fix or flag the documentation drift in Appendix C**, so the new team is not
   misled.

---

## Appendix A: northbound API quick reference

Every call needs `Authorization: Bearer ce_...`.

| Method and path | Purpose | Calls SAP? |
|---|---|---|
| `GET /api/northbound/interfaces` | Lists this solution's interfaces, with `callable` and `service: { source: "custom" \| "catalogue", odataVersion }` | No |
| `GET /api/northbound/interfaces/{id}/schema` | Returns the stored response schema. `requestSchema` is always null. | No |
| `GET /api/northbound/interfaces/{id}/data?limit=N` | Read. N is between 1 and 100. | Yes |
| `POST /api/northbound/interfaces/{id}/data/write` | Create. Also needs `X-CoreEdge-Write-Key` and `Idempotency-Key`. | Yes |

The success envelope is `{ "data": ... }`. The error envelope is
`{ "error": { "code", "message", "correlationId" } }`. Every response from the
northbound route handlers carries `x-correlation-id` and `cache-control: no-store`
(`src/lib/northbound/respond.ts:60-61,84-86`). The middleware's per-IP 429
`RATE_LIMIT_EXCEEDED` answers before the route and carries neither (section 6.2).

A DRAFT interface is still served for reads, with the header
`x-coreedge-interface-status: DRAFT`. Writes require ACTIVE and return 403
`FORBIDDEN` otherwise (`src/lib/northbound/access.ts:153-162`). `callable` in the
discovery list describes reads only, and is always false for CREATE interfaces
(`src/app/api/northbound/interfaces/route.ts:169-174`). For your own API it is
also false when the stored path would be refused. The list never returns a
service path field or a host; a custom interface's `externalId` is its grant id,
`custom:<path>`. A write through your own API is refused with 400
`VALIDATION_ERROR` until it has been verified since it last changed.

## Appendix B: Studio API calls that have no screen yet

Run these in the browser developer console while you are signed in to your
CoreEdge instance, so that your session cookie is sent with them. Each call
enforces the same role and two-person checks as the screens.

**Turn writes on for a connection.** Any `consultant` can run this. It saves the
connection again under the same key, so you must enter all its fields and
credentials again.

```js
await fetch('/api/studio/connections', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    product: 's4hana', key: '<same key as before>', label: '<label>',
    baseUrl: 'https://<your-tenant>-api.s4hana.cloud.sap',
    environment: 'DEV', authType: 'basic', username: '<user>', password: '<password>',
    apiPath: '<probe path, if you use one>',
    // client: '<3 digits>',   // on-premise and Private: required if the connection has one
    writeEnabled: true,
    writeSecret: '<any non-empty value; required, not used at runtime>'
  })
}).then(r => r.json());
```

Do not save this connection through the Studio form afterwards. A form save
turns writes off again. For on-premise and Private, include `client`: a `POST`
without it clears the stored SAP client (`src/app/api/studio/connections/route.ts:558`).
`apiPath` also becomes the target of the daily connection probe (section 5.2).

**Register your own API** (the same as the Studio dialog, section 6.1). Any
`consultant` can run this. Leave `externalId` out: it is derived as
`custom:<servicePath>`.

```js
await fetch('/api/studio/interfaces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    solutionId: '<solution id>', sapProduct: 's4hana-onprem', name: '<name>',
    servicePath: '/sap/opu/odata/sap/ZUI_LAB_TRAVEL_O2', odataVersion: 'V2',
    operation: 'READ', entitySet: '<entity set>'
  })
}).then(r => r.json());
```

**Change your own API's OData version** (the **Change path or version** control,
or **Switch to V2/V4 and verify again** after a `VERSION_MISMATCH`). Any
`consultant` can run this. The interface version bumps, verification clears and
an active write interface returns to draft; the grant id is unchanged.

```js
await fetch('/api/studio/interfaces', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '<interface id>', odataVersion: 'V4' })
}).then(r => r.json());
```

**Choose your own API's dataset** (the **Use this dataset** button, after a
verify lists the datasets). Verify never saves one. Any `consultant` can run
this. The interface version bumps, verification clears (verify again) and an
active write interface returns to draft; the grant id is unchanged.

```js
await fetch('/api/studio/interfaces', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '<interface id>', entitySet: '<entity set>' })
}).then(r => r.json());
```

**Verify an interface's service in one environment** (the **Verify** button).
Any `consultant` can run this; `sapClient` only where the product addresses one.
Run it for each environment (and SAP client) you will write to: a write is
refused in an environment that has not been verified through the connection and
client it uses.

```js
await fetch('/api/studio/interfaces/<interface id>/verify-service', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ environment: 'DEV', sapClient: '100' })
}).then(r => r.json());   // data.status, data.verified, data.entitySets
```

**Create an interface against a curated SuccessFactors key** (the older route
for section 5.6; registering `/odata/v2` as your own API also works). Any
`consultant` can run this.

```js
await fetch('/api/studio/interfaces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    solutionId: '<solution id>', sapProduct: 'successfactors',
    externalId: 'employee-central', name: '<name>',
    operation: 'READ', entitySet: '<entity set>'
  })
}).then(r => r.json());
```

**Mint the write key.** Run this as a `consultant` who is **not** an owner of the
solution. The solution needs a live credential and an approved CREATE grant in
that environment (`src/app/api/studio/clients/write-credential/route.ts`).

```js
await fetch('/api/studio/clients/write-credential', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ solutionId: '<solution id>', environment: 'DEV' })
}).then(r => r.json());   // the key is in data.writeKey, shown once
```

**Invite a user as the lab lead** (`partner_lead`), when the platform owner is
not available:

```js
await fetch('/api/organizations/<orgId>/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'dev@example.com', role: 'consultant' })
}).then(r => r.json());
```

**Lift the trial seat limit** (section 4.7, step 2). Run this as the
`platform_admin`. The effective limit is the lower of `maxPartnerUsers` and the
plan's limit, so set both (`src/lib/commercial/usage-metering.ts:59-81`;
`src/app/api/admin/organizations/[orgId]/plan/route.ts:10-17,51`).

```js
await fetch('/api/admin/organizations/<orgId>/plan', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'ENTERPRISE', maxPartnerUsers: 50 })
}).then(r => r.json());
```

## Appendix C: places where the docs and the code disagree

In each case the code is what runs.

| Topic | The documentation says | The code does |
|---|---|---|
| Schema setup | `README.md:24` uses `pnpm db:push`. `README.md:39` calls `pnpm build` "what Vercel runs". | Production runs `prisma migrate deploy` inside `vercel-build` (`vercel.json:3`; `package.json:23`) |
| `SAP_HOST_ALLOWLIST_EXTRA` | Missing from `.env.example` | Read by `src/lib/studio/sap-host-allowlist.ts:56-63` |
| Connection environment | The form describes the field as free text | Only SANDBOX, DEV, TEST, PROD and their aliases are accepted |
| Write keys | The activation refusal says to issue the write credential "under API Access" (`write-readiness.ts`) | No screen calls the write-credential API |
| Write replays | `docs/coreedge-developer-guide.md:289-291` says "Failures are recorded too", and that a 403 the tenant declined replays under the same key | Right for a 401/403 from SAP itself: it is stored and replayed for 24 hours, so after fixing the SAP side, retry under a **new** key (SAP refused, so nothing was created). CoreEdge's own refusals (write key, grant, connection binding, writes disabled) happen before the key is reserved and are never stored. A write that was never sent (credential step, CSRF handshake, SAP 408 or 429) is not recorded either: the key is released (`src/app/api/northbound/interfaces/[id]/data/write/route.ts:425-429`). |
| Read options | The design mock lists `$top`, `$skip`, `$filter` and `$select` | Only `limit` is read |
| Starter kit OpenAPI | Its 400 description says "pass ?entity=" (`src/lib/studio/scaffold.ts:146`) | `?entity=` is ignored |
| Target expansion spec | `docs/coreedge-sap-target-expansion-spec.md` says nothing in it has been applied, and that SAML bearer and CSRF are missing | Private, on-premise and ECC products, SAP-client addressing, SAML bearer and CSRF all exist |
| `SAP_CONTENT_RELEASE`, `EMAIL_SERVER`, `DEFAULT_AI_PROVIDER` | `.env.example` gives defaults of 2602, "alternative to SMTP" and anthropic | The code defaults to 2608, always sends mail through `SMTP_*`, and falls back to OpenAI |
| Catalogue rebuild | The button warns that rows SAP no longer publishes disappear | The rebuild route contains no delete |
