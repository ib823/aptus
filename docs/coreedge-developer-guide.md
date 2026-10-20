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
   those are refused (`src/lib/sap-public/service-path.ts`). So is SAP routing
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
  `custom:/sap/opu/odata/sap/ZUI_TRAVEL_O2`. Grants name that id, so a grant a
  second person approved for one path can never authorise another.
- **Writes need a current verification in the caller's environment.** The broker
  refuses a write through your own service unless that environment has been
  verified since the interface last changed, through the same connection, SAP
  client and host the write uses. Verifying DEV does not open PROD: verify each
  environment you write to. A WRITE interface is activated only when one
  environment holds all of it at once: a credential with a write key, an
  approved write grant, **and** a verification of the service there. Verified in
  SANDBOX with the write chain only in PROD is refused, and the Write chain row
  says `service not verified here` for PROD. Reads are not gated.
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
- **No services outside SAP's published catalogue.** See *If you write ABAP*.
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
| Same key, still in flight | `409` — one intent, one write |
| Key older than 24h | Treated as a fresh request |

Failures are recorded too. If a write was refused with a `403`, retrying the same
key returns that same `403` rather than re-attempting something the tenant has
already declined.

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
- Rotating replaces the token immediately, with no overlap window. Revoking
  stops it now and keeps the audit history.

Every call your application makes is recorded against the credential that made
it, so a leaked token can be traced to exactly what it touched and revoked
precisely — rather than rotating everything and hoping.
