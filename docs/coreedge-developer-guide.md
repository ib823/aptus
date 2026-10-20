# CoreEdge for developers — what it does, and what stays yours

CoreEdge Developer Studio governs the **integration edge**: the boundary where a
solution you build meets a client's SAP system. It is not an IDE, not a
deployment platform, and not a place your application lives.

This document exists because that boundary is easy to misread, and misreading it
wastes days.

---

## The short version

| | Where it lives |
|---|---|
| Your application code | **Your repository**, your language, your framework |
| Your database | **Yours.** CoreEdge neither sees nor stores it |
| Your build, tests, CI | **Yours.** Run them offline against the generated mock |
| ABAP development | **ADT / Eclipse**, as always |
| Which SAP capability you may consume, at what operation, in which environment, and who approved it | **CoreEdge** |
| The contract your app codes against | **CoreEdge** generates it; you take it away |
| The runtime call that reaches the client's SAP tenant | **CoreEdge** brokers it |

If a question is about *what your solution does*, the answer is in your repo.
If it is about *what your solution is allowed to touch in SAP*, the answer is in
CoreEdge.

---

## The loop, end to end

1. **Discover** — see what this client's tenant actually exposes. A capability
   reads as *Activated* only where a live probe returned 200; "empty",
   "not set up" and "error" stay three different things throughout.
2. **Govern** — register a solution, define the interfaces it consumes, request
   access. A second person decides: you cannot approve your own request.
3. **Prove** — run the interface against the real tenant in the Test Console.
   Capture the schema and the responses while you are there.
4. **Take it away** — download the starter kit: an OpenAPI contract, a typed
   client, a runnable demo, and an offline mock seeded with what you just saw.
5. **Build** — in your own IDE, on your own machine, in whatever stack you use.
6. **Test offline** — `npm run mock` and your suite runs with no network and no
   SAP tenant. Your CI never touches a customer's system.
7. **Run for real** — change `COREEDGE_BASE_URL`, supply the client credential,
   and the same code reads the client's live SAP data.

Steps 5 and 6 are entirely on your machine. That is deliberate.

---

## Working in your own stack

**The OpenAPI document is the portable artifact.** A TypeScript client is
generated for convenience, but nothing depends on you using TypeScript:

```bash
openapi-generator-cli generate -i openapi.json -g python  -o ./client
openapi-generator-cli generate -i openapi.json -g go      -o ./client
openapi-generator-cli generate -i openapi.json -g java    -o ./client
```

Your database, ORM, test framework, and deployment target are not CoreEdge's
business and it does not try to make them so.

### Testing offline

```bash
npm run mock                              # serves recorded responses, no network
COREEDGE_SCENARIO=empty npm run mock      # or pick a scenario per request: ?scenario=…
```

Capture fixtures for **all four** states — data, empty, needs-setup, error — not
just the happy one. A suite that only proves your code works when everything is
fine is proving the easy half; the states that break integrations are the other
three.

---

## If you write ABAP

**Build ABAP in ADT.** CoreEdge has no ABAP editor, no transport management and
no deploy step, and it should not pretend otherwise. CDS views, RAP behaviour
definitions, function modules, transports — all unchanged, all in Eclipse.

The intended far side of that work is that the OData service your ABAP exposes
(RAP, or a published CDS view) is governed like any standard SAP API: you define
an **Interface** against it, request access, and your consuming application calls
it through the northbound API.

### Your own services (Z\*, YY1\_\*, ECC Gateway)

A service you build yourself — a `Z*` RAP service, a key-user `YY1_*_CDS` view or
custom business object, an ECC NetWeaver Gateway service, SuccessFactors'
`/odata/v2` with your `cust_*` MDF objects — is in neither the curated list nor
SAP's catalogue. You register it **by its service path** instead:

1. **Register the interface with its path and OData version.** Studio →
   Interfaces → **Register your own API** (or Discover → *Not in the catalogue?*),
   or the API:

   ```http
   POST /api/studio/interfaces
   { "solutionId": "…", "sapProduct": "s4hana-onprem", "name": "Travel read",
     "servicePath": "/sap/opu/odata/sap/ZUI_TRAVEL_O2", "odataVersion": "V2",
     "operation": "READ", "entitySet": "Travel" }
   ```

   The path is the part of the service URL after the host, starting with `/` —
   copy it from the service binding in ADT (*Service URL*) or from
   `/IWFND/MAINT_SERVICE`, without `$metadata` and without `?sap-client`
   (CoreEdge adds the client from the connection). It is a path on the
   connection's own host and nothing else: a full URL, `//host`, `..` (also
   `..;`), `?`, `#`, backslashes, whitespace and percent-escapes that hide any of
   those are refused (`src/lib/sap-public/service-path.ts`); any other escape is
   decoded and the path stored as plain text, so one service has one id. So is SAP routing
   that would pick another system or client than the connection's: Gateway
   matrix parameters such as `;o=<system alias>`, `;mo` or `;c=`, and an ICF
   session segment such as `/sap(bD1lbiZjPTIwMA==)/`. The only matrix parameter
   kept is a version suffix on the last segment, `;v=0002` (the short form
   `;v=2` is accepted and stored as `;v=0002`). And it must be an
   OData service: under `/sap/opu/odata/` or `/sap/opu/odata4/` on an ERP or
   S/4HANA system, or `/odata/v2` (exactly) or under `/odatav4/` on
   SuccessFactors. Any other ICF path — `/sap/bc/…`, `/sap/public/…`, a
   customer REST handler — is refused, because reads are not checked against
   `$metadata` and the connection's credentials travel with every call. An ICF
   alias for an OData service is not accepted; use the service's
   `/sap/opu/odata…` path. Ariba is REST, not OData, and has no path.
2. **Verify it in every environment you will write to.** On the interface,
   **Verify** asks the SAP system for the service's `$metadata` through your
   organization's connection for the environment you pick — the same binding a
   call from that environment uses, SAP client included — and lists its datasets.
   It reads no business data (`POST /api/studio/interfaces/<id>/verify-service`
   with `{ "environment": "DEV", "sapClient": "100" }`; it never saves a
   dataset). Save the dataset with **Use this dataset**, or
   `PATCH /api/studio/interfaces` with `{ "id": "<id>", "entitySet": "<name>" }`,
   then verify again: a dataset change clears verification. A successful verify is
   recorded for that environment and SAP client only, with the connection and
   host that answered. One system serving two clients in the same environment
   (two connections, client 100 and client 200) keeps two verifications: verify
   each client you write to, and verifying one never removes the other.
   Activation, and the Write chain row, count an environment as verified only
   when the connection your credential for it binds to (its environment and
   SAP client) is the one verified: verifying client 100 does not make PROD
   ready for a credential bound to client 200. For SuccessFactors on
   `/odata/v2`, once the interface names its dataset, Verify asks for that one
   dataset's description (`/odata/v2/<EntitySet>/$metadata`) instead of the
   whole tenant's, which is large and slow enough to time out. An OData V4
   service under `/odatav4/` has no per-dataset description and is read whole.
3. **Request access and issue keys as normal.** Grants, the two-person rule,
   tokens, the write key, `Idempotency-Key`, rate limits and the audit trail apply
   exactly as they do to catalogue services.

What is different, and why:

- **The interface's id is derived**: `custom:<path>`, for example
  `custom:/sap/opu/odata/sap/zui_travel_o2`. Grants name that id, so a grant a
  second person approved for one service can never authorise another. Under
  `/sap/opu/odata/` and `/sap/opu/odata4/` the id is the path in lower case,
  because SAP resolves those paths without regard to case: typing
  `/SAP/OPU/ODATA/SAP/ZUI_TRAVEL_O2` gives the same id and the same grants. On
  `/sap/opu/odata/`, `;v=0001` is the default version and is left out of the
  id, so the path with and without it is one service. The path CoreEdge calls
  keeps the spelling you typed.
- **Writes need a current verification in the caller's environment.** The broker
  refuses a write through your own service unless that environment has been
  verified since the interface last changed, through the same connection, SAP
  client and host the write uses. Verifying DEV does not open PROD: verify each
  environment you write to. A WRITE interface is activated only when one
  environment holds all of it at once: a credential with a write key, an
  approved write grant, **and** a verification of the service there. Verified in
  SANDBOX with the write chain only in PROD is refused, and the Write chain row
  says `service not verified here` for PROD. The connection that environment's
  credential binds to must also have writes enabled; if it does not, the row
  says `writes disabled on the connection`, and an administrator enables them
  under Connections. Reads are not gated.
- **Editing a connection asks for a new verify.** If an administrator changes a
  connection's host or SAP client after a verify (or deactivates it), writes in
  that environment are refused, and Studio says *Verify again: the connection
  for … has changed since it was verified* instead of listing it as open.
- **Changing the path, the version or the dataset is a new contract**: the
  version bumps, verification clears in every environment, and an active write
  interface returns to draft (verify again, then activate). Only a **path**
  change produces a new id, so only then do existing grants detach and a new one
  is needed; after a version or dataset change the grants stay attached. In
  Studio the path and the version are edited together under **Change path or
  version**, and when Verify answers `VERSION_MISMATCH` it offers **Switch to
  V2/V4 and verify again**. With the API:
  `PATCH /api/studio/interfaces { "id": "…", "odataVersion": "V4" }`.
- **Catalogue and custom do not convert.** To move an interface from a catalogue
  service to your own (or back), register a new one.

Evidence level: traced in code and covered by unit tests
(`tests/unit/lib/sap-public/service-path.test.ts`,
`tests/unit/northbound/custom-service-read.test.ts`,
`tests/unit/northbound/custom-service-write.test.ts`,
`tests/unit/studio/verify-service-route.test.ts`); not yet run against a live
tenant.

So the rule stands — **CoreEdge governs the OData your ABAP exposes; it does not
build your ABAP.** If a service is not probeable (no OData endpoint — SOAP, async,
RFC-only), it shows as *Not probeable* rather than being silently marked
available.

---

## What CoreEdge does not do (in this version)

Being explicit here is cheaper than letting you discover it mid-sprint:

- **No in-browser editing.** The scaffold produces downloads; there is no
  workspace, no terminal, no deploy button.
- **No updates to existing records.** Writes create; see *Writing to SAP*.
- **No discovery of the tenant's own services.** A service outside SAP's published
  catalogue (your `Z*` or `YY1_*`) is registered by its path, not found for you:
  see *Your own services* (P1.2 adds discovery from the tenant's own catalogue).
- **No field-level mapping or transformation.** An interface passes the
  service's own shape through unchanged. The Mapping card is visible and
  disabled so the intent is legible.
- **No ABAP lifecycle.** See above.
- **No hosting of your app.** CoreEdge is the integration edge, not a PaaS.

---

## Honest status — the one thing to get right

Every surface in CoreEdge, and the northbound API your app calls, keeps these
apart:

| What you get | Means | What to do |
|---|---|---|
| `200` with records | Data | Use it |
| `200` with `records: []`, `empty: true` | **No records** — the service answered and had nothing | Treat as data. Render "nothing here" |
| `403` | Not set up, or no approved grant | Fix access. **Do not retry** |
| `502` / `504` | The tenant or the broker failed | Retry, then escalate |

**An empty result is not an error.** Conflating those two is the most common way
an integration lies to its users, and it is the reason this distinction is
carried all the way from the probe to the generated client.

### Every status, and whether to retry it

One meaning per status and `error.code`, so your retry logic can branch on
them. Every error body is `{ "error": { "code", "message", "correlationId" } }`;
quote the `correlationId` (also the `x-correlation-id` header) when you ask for
help.

<!-- retry-table: tests/unit/northbound/token-failure-retry-table.test.ts reads this table; keep one row per status and code. -->
| Status | `error.code` | Means | Retry? |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | The request is not valid, or the feed's own definition is incomplete (no dataset, no service) | **No.** Fix the request, or the feed in Studio |
| `401` | `UNAUTHENTICATED` | The token is missing, unknown, revoked or expired | **No.** Fix the token |
| `403` | `FORBIDDEN` | Not set up: no approved grant for this call; or the customer's SAP connection cannot sign in — a credential is missing, its token endpoint refused it, or its token URL is wrong; or SAP itself refused (401/403) | **No.** Fix access or the connection, then call again |
| `403` | `CONNECTION_NOT_CONFIGURED` | The customer has not connected that SAP system for your environment | **No.** The customer connects it |
| `404` | `NOT_FOUND` | No such interface for your credential, or the dataset does not exist on the tenant | **No.** |
| `409` | `CONFLICT` (still in progress) | A write's `Idempotency-Key` is still being processed: your retry arrived while the first attempt was running. The response carries `Retry-After` | **Yes, after `Retry-After`, with the same key.** That returns the first attempt's outcome. Never re-send under a new key: the first attempt may still create the record. If it is still in progress after a few minutes, escalate with the `correlationId` |
| `409` | `CONFLICT` (different write) | The `Idempotency-Key` was already used for a different payload or destination. No `Retry-After` | **No.** A different write takes a new key. See *Idempotency is not optional* |
| `422` | `VALIDATION_ERROR` | A write SAP rejected as invalid: the payload is wrong | **No.** Fix the payload |
| `429` | `RATE_LIMITED` | **Your credential** has used its budget (60 reads and 60 writes a minute). Keys are limited one by one: another key's use does not spend it | **Yes, after `Retry-After`.** Slow this key down |
| `429` | `RATE_LIMITED_ADDRESS` | **Your address**, not your credential, is over a limit: too many calls from it in total, or too many calls from it with an unrecognised credential. Another key, or another caller on a shared egress, may have spent it | **Yes, after `Retry-After`.** Lowering one key's rate does not help: find what else calls from that address, or what is sending a bad key |
| `502` | `UPSTREAM_ERROR` | The tenant, or the connection's token endpoint, failed, throttled (its own 429), or could not be reached. Nothing was refused | **Yes, with backoff,** then escalate. Back off for real: it may be SAP throttling you. A write that answered `502` before reaching SAP says so and was not applied: retry it with the same key |
| `503` | `LIMITER_UNAVAILABLE` | CoreEdge could not check its rate limits, so it refused the call for safety. Nothing was sent to SAP, and your budget was not spent | **Yes, after `Retry-After`.** |
| `504` | `UPSTREAM_TIMEOUT` | The tenant, or the connection's token endpoint, did not answer in time | **Yes, with backoff.** A write that timed out after it was sent returns the same answer under its key; see *Idempotency is not optional* |

**Branch on `error.code`, not only on the status.** A `429 RATE_LIMITED` is
about your own credential; a `429 RATE_LIMITED_ADDRESS` is about the address
you call from. Neither is ever sent for an outage: when the limiter itself is
down you get `503 LIMITER_UNAVAILABLE`, which says nothing about your rate.
When SAP or its token endpoint throttles, you get `502 UPSTREAM_ERROR`, so back
off on a `502` as well, not only on a `429`.

---

## Interface status and reads

Reads check the interface's status too, asymmetrically and on purpose:

- **`DRAFT`** is served. A draft read is merely premature — but you are told:
  the response carries `x-coreedge-interface-status: DRAFT`, and discovery
  returns the status per interface, so building against an unfinished contract
  is a choice you make knowingly, never a fact you were denied.
- **`DEPRECATED`** is refused (`INTERFACE_DEPRECATED`). Deprecation is the
  builder's statement that new traffic should stop; an interface kept for the
  record must not quietly keep serving it. Discovery agrees: a deprecated
  interface is never advertised as callable.

---

## One grant, one interface

An approved grant authorises **one interface, on one SAP product**: the
interface the request was raised against. Adding an interface for the same
service on another SAP system (an on-premise system beside S/4HANA Cloud, say)
does not inherit the approval; request access for it as well. A grant still
names its environment and operation, so a READ grant in SANDBOX authorises
neither a write nor PROD.

Grants approved before this rule (P0.1) were bound to the one interface they
matched. One that matched none or several is flagged for re-approval on the
CoreEdge requests board and keeps working until the deployment switches to
strict binding (`COREEDGE_GRANT_BINDING=strict`). After that its calls are
refused with `403 GRANT_NEEDS_REAPPROVAL`: ask for access again from the
interface, and do not retry.

An interface that is ACTIVE stays behind the activation checks when its
contract changes: switching an active interface to a write, or changing its
entity set, runs the same checks as activating it and is audited as a
promotion.

---

## Writing to SAP

Writes are supported, and deliberately harder to reach than reads. **Today a write
means creating a record.** The broker POSTs to the interface's entity set, which
OData treats as a create, so an interface whose operation is `UPDATE` cannot be
activated and is refused on every call with `400 VALIDATION_ERROR` — rather than
sending your change as a create, which would add a new record instead of changing
the one you meant. Updating existing records is planned work.

For a `CREATE` interface, five things must all be true, and every one of them can
refuse you:

1. The interface is **`mode: WRITE`** and **`status: ACTIVE`** — a draft has not
   been reviewed, and a write from an unreviewed interface changes a client's
   system on nobody's authority.
2. An **approved WRITE grant** exists for that capability, **in your
   environment**, and has not expired. A READ grant never authorises a write, and
   a SANDBOX grant never authorises PROD.
3. The client's SAP connection has **`writeEnabled`** — a per-tenant veto that
   overrides any grant.
4. You send a **separate write credential** (`X-CoreEdge-Write-Key`). Your bearer
   token alone cannot write: read tokens travel further, get logged by proxies
   and pasted into issues, so the ability to read never implies the ability to
   change anything.
5. You send an **`Idempotency-Key`**. This one is mandatory and there is no way
   around it — see below.

```bash
curl -X POST "$COREEDGE_BASE_URL/interfaces/$IFACE/data/write" \
  -H "Authorization: Bearer $COREEDGE_TOKEN" \
  -H "X-CoreEdge-Write-Key: $COREEDGE_WRITE_KEY" \
  -H "Idempotency-Key: order-4471-attempt-1" \
  -H "Content-Type: application/json" \
  -d '{"record": {"BusinessPartnerName": "Acme"}}'
```

### Idempotency is not optional

A write into a production ERP must survive being retried. Networks drop
responses *after* the server has committed; HTTP clients retry on timeout; load
balancers replay. Without a key, one logical write becomes two records in a
client's ledger.

So: **reuse the same key when you retry.** The rules are:

| Situation | What you get |
|---|---|
| First call with a key | The write happens |
| Same key, same payload and SAP destination | The **recorded outcome**, replayed — SAP is not touched again |
| Same key, **different** payload or destination | `409` — a different write requires a different intent/key |
| Same key, still in flight | `409` with `Retry-After` — one intent, one write. Retry with the same key after `Retry-After` to get the outcome |
| Key older than 24h | Treated as a fresh request |

Failures SAP answered are recorded too. If SAP itself refused a write (a `401`
or `403` from SAP), retrying the same key returns that same answer for 24 hours
rather than re-sending something the tenant has already declined: fix the SAP
side, then write again under a **new** key (SAP refused, so nothing was created).
Two kinds of failure are never recorded, so the same key works on the retry:

- **CoreEdge's own refusals** (the write key, the grant, the connection binding,
  writes disabled on the connection, your own service not verified in this
  environment). They happen before the key is reserved.
- **A write that was never sent**: the connection's credential could not be
  used, the CSRF handshake failed, or SAP answered `408` or `429`. The key is
  released.

The destination includes the environment, SAP client, connection, service,
entity set, and interface version. Rotating a token for the same destination
preserves retries; rebinding it to another destination cannot replay the old
result. Replays preserve the original response body and include
`Idempotency-Replayed: true`. The correlation header identifies the current
attempt; a recorded error body retains its original correlation ID.

During the destination-binding upgrade, unexpired keys written by the older
version return `409` because their destination cannot be verified. Check the
original outcome before issuing a new write. Do not change keys merely to get
past this refusal.

If the response to your application is lost, retry with the **same** key to get
the recorded outcome. If the broker itself times out waiting for SAP, the
recorded outcome is a timeout: SAP may already have committed. Retrying the key
does not send another write or determine SAP's final state. Reconcile that
outcome with SAP before starting a new intent. The key expires after 24 hours;
retrying after that window can perform another write.

### Where the human is

There is **no per-call confirmation** — an unattended application cannot give
one. Human oversight sits at **grant approval**: a second person (never the
requester) approved the WRITE grant and worked through the write checklist.
That approval is the single human checkpoint for every write your solution makes,
which is why **grant expiry is enforced on every call** — "approved once" must
not become "approved forever".

## Which SAP hosts a connection may use

A connection's base URL (and OAuth token URL) must be `https://` and its host
must end, on a whole DNS label, in a domain SAP serves from
(`src/lib/studio/sap-host-allowlist.ts`). The check runs when the connection is
saved, before any credential is stored.

- **SAP cloud** — `ondemand.com`, `cloud.sap`, `s4hana.cloud.sap`, `sap.com`,
  `ariba.com`, `sapariba.com`, `concursolutions.com`, `fieldglass.net`.
- **SuccessFactors** — `successfactors.com`, `successfactors.eu`, `sapsf.com`,
  `sapsf.eu`, `sapsf.cn` and `hr.cloud.sap`. Together these cover every API
  server in SAP's "List of SAP SuccessFactors API Servers"
  ([KBA 2215682](https://userapps.support.sap.com/sap/support/knowledge/en/2215682),
  checked 2026-10-20). Use your data centre's API server, for example
  `https://api17.sapsf.com`, not the web UI host.
- **Your own domain** (on-premise, RISE, partner hosted) — set
  `SAP_HOST_ALLOWLIST_EXTRA` to a comma-separated list of suffixes, for example
  `corp.example.com`, and redeploy. It adds to the list; nothing switches the
  check off.

Matching is per label: `sapsf.com` admits `api17.sapsf.com`, never
`evil-sapsf.com` or `sapsf.com.evil.io`. IP addresses, `localhost`, `*.local`
and `*.internal` are refused whatever the list says.

**SuccessFactors and Basic auth.** SAP retires HTTP Basic for SuccessFactors
APIs on 2026-11-20 (unsupported, and unavailable for new configurations) and
deletes it on a tentative 2027-11-12. Saving a **new** SuccessFactors
connection with Basic shows that, dated, on the form and returns it as
`warning` from `POST /api/studio/connections`; the save still succeeds, and
existing connections are not touched. Use OAuth SAML bearer instead
(`docs/runbooks/successfactors-saml-signing.md`).

## Credentials

- A client credential is issued **per solution and environment**, from the API
  Access screen — one for DEV, one for TEST, one for PROD. Re-issuing for an
  environment replaces that environment's token only.
- The raw token is shown **once**. Only its hash is stored, so it genuinely
  cannot be shown again — copy it when you issue it.
- Keep it **server-side**. It is not a public API key and must never reach a
  browser bundle.
- The person who **owns** a solution cannot issue its credential; a colleague
  must. Same second-pair-of-eyes rule as approving access.
- **The prefix says where a key reaches.** A PROD key starts `ce_live_`; a
  SANDBOX, DEV or TEST key starts `ce_test_`. Keys issued before these prefixes
  start with plain `ce_` and keep working until they expire. CoreEdge never
  reads the prefix to authenticate you, so nothing breaks when your key's
  prefix changes at its next rotation.
- **TEST and PROD keys expire.** The issuer chooses the date, up to 90 days
  ahead. A PROD key cannot be issued without one: the request is refused with
  400. A TEST key issued without one gets the default of 90 days. SANDBOX and
  DEV keys may still be issued with no expiry. A TEST or PROD key issued before
  this rule may have no expiry. It keeps working, and the Studio and the
  Operations screens show it as **no expiry - set one** until it is rotated.
  The write key (`cew_`) is stored on the same credential, so it stops when the
  runtime key does. It does not come back when an expired or revoked key is
  renewed: ask for a new write key after the renewal. Studio does not issue a
  write key on a TEST or PROD key that has no expiry: rotate the key first.
- **Rotating overlaps.** Rotating mints a new key with a fresh lifetime. The
  key it replaces keeps working for 24 hours, or until it would have expired if
  that is sooner. The response, the claim screen and the Studio table show the
  exact time as `previousValidUntil`. Deploy the new key inside that window and
  no call fails. Only the immediately previous key overlaps: if you rotate twice
  in a day, the first key stops at the second rotation. A key that had already
  stopped (revoked, deactivated or expired) does not come back for the window.
  Re-issuing for an environment, or collecting a claim link for a lane that
  already has a working key, is a rotation and overlaps the same way. The
  exception is a re-issue that names a different SAP client: the old key
  stops at once, so it never reads a client it was not issued for.
- **The overlap can be switched off.** If your platform team sets the overlap
  to 0 hours, rotating replaces the key at once. The rotation response says
  "the previous token stopped working immediately": deploy the new key
  straight away.
- **A leak is a revoke, not a rotation.** Revoking ends the current key **and**
  the previous one in the same moment, and keeps the audit history. Then issue
  a new key.
- **Scan for leaks.** The patterns that match every CoreEdge credential, for
  GitHub secret scanning, gitleaks or a log filter, are in
  `docs/coreedge/secret-scanning.md`.

Every call your application makes is recorded against the credential that made
it, so a leaked token can be traced to exactly what it touched and revoked
precisely — rather than rotating everything and hoping.
