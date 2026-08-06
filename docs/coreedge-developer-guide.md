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

Where CoreEdge helps is the far side of that work:

1. You expose an OData service from your ABAP (RAP, or a published CDS view).
2. It appears in the capability catalogue like any other service, with honest
   status from a live probe against the client's tenant.
3. You define an **Interface** against it, request access, and it is governed
   exactly like a standard SAP API.
4. Your consuming application — Node, Python, Java, anything — calls it through
   the northbound API with a client credential.

So the rule is: **CoreEdge governs the OData your ABAP exposes; it does not build
your ABAP.** If your service is not probeable (no OData endpoint — SOAP, async,
RFC-only), it will show as *Not probeable* rather than being silently marked
available. That is accurate, not a limitation of the probe.

---

## What CoreEdge does not do (in this version)

Being explicit here is cheaper than letting you discover it mid-sprint:

- **No in-browser editing.** The scaffold produces downloads; there is no
  workspace, no terminal, no deploy button.
- **No field-level mapping or transformation** — see below.
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

Writes are supported, and deliberately harder to reach than reads. Five things
must all be true, and every one of them can refuse you:

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
| Same key, same payload | The **recorded outcome**, replayed — SAP is not touched again |
| Same key, **different** payload | `409` — that is a bug in your code, not a retry |
| Same key, still in flight | `409` — one intent, one write |
| Key older than 24h | Treated as a fresh request |

Failures are recorded too. If a write was refused with a `403`, retrying the same
key returns that same `403` rather than re-attempting something the tenant has
already declined.

**A timeout is the case this exists for.** If a write times out, you genuinely do
not know whether the record was created. Retry with the **same** key: if it
landed, you get the original result; if it did not, the write is attempted once.
Either way you end up with exactly one record.

### Where the human is

There is **no per-call confirmation** — an unattended application cannot give
one. Human oversight sits at **grant approval**: a second person (never the
requester) approved the WRITE grant and worked through the write checklist.
That approval is the single human checkpoint for every write your solution makes,
which is why **grant expiry is enforced on every call** — "approved once" must
not become "approved forever".

## Credentials

- A client credential is issued **per solution**, from the API Access screen.
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
