# COWORK COMMISSION — `dc3`, Operations Center tranche only

**Paste this into a fresh Cowork session with the five files in §2 attached. The session has no prior context;
everything it needs is here, including the live API responses the screens must render.**

**This is a deliberately narrowed commission.** An earlier version of this brief asked for a full `dc2 → dc3`
delta covering both new workspaces. An independent review of the shipped code found that scope larger than the
evidence supports: of the elements audited, most are backable as drawn, and most of the corrections are
determinate from prose. **Four things genuinely need a designer.** They are §4. Everything else is either
already built, deferred to a later tranche, or listed in §5 as determinate so you know it is covered rather
than forgotten.

**Deliver these four and the Operations Center is unblocked.** Do not wait to produce a complete `dc3`.

---

## 1 · What this is

The CoreEdge Console is one app with three RBAC-gated workspaces: **Developer Studio** (shipped),
**Operations Center** (*is the live integration healthy now*), and **Control Tower** (*is the portfolio
governed, and is it worth it*).

You produced the current visual contract, `CoreEdge Ops & Control Tower.dc2.html`. **The layout, chrome,
component language, tokens, state coverage and drawer pattern in it are correct and stay.** You are not
redesigning. You are producing four specific things it does not contain.

**The governing rule, above everything:** this product's differentiator is *honest status* — a screen must
never show a number, state, health or environment the data cannot actually back. Where a feed under-reports,
the screen says so. If something below cannot be designed without inventing data, **say so and stop** rather
than designing a plausible-looking fiction.

That rule is not aspirational here. The endpoints these screens read were built to it: every one returns a
`provenance` block stating what it cannot see. §3 gives you their real responses. **The screens must not be
more confident than the payloads.**

## 2 · Attached files (five)

1. `CoreEdge Ops & Control Tower.dc2.html` — your current design; the baseline
2. `CoreEdge-Studio-Design-Book.html` — the design system
3. `CoreEdge-Design-Tokens.md` — tokens, to be used **verbatim**
4. `CoreEdge Developer Studio.dc.html` — the shipped Studio, as visual family precedent
5. `CoreEdge-Ops-ControlTower-Inventory.md` — capability → real data source → build status

The Build Bible is deliberately **not** attached this time. Its §7 described endpoints that have since shipped
and changed shape; the live responses in §3 supersede it for your purposes and are what the screens will
actually receive.

## 3 · What the screens will actually receive

**These are real production responses, captured after deploy.** Not examples, not schemas. Design against
these.

Note what is in them: every endpoint carries a `provenance` object, and several fields exist purely to stop a
screen over-claiming — `basis`, `sampleSize`, `notApplicable`, `eventsAreAPage`, `countBasis`, `observable`.
**Those fields are the commission.** They are the data's own admission of its limits, and they currently have
no visual treatment at all.

### `GET /api/ops/broker-traffic`

```json
{ "windowHours": 24, "scope": "scoped",
  "counts": { "total": 0, "byStatus": {}, "bySolution": {}, "byToken": {} },
  "latency": { "medianMs": null, "measured": 0, "unmeasured": 0,
               "basis": "returnedPage", "sampleSize": 0 },
  "environmentBinding": { "agreed": 0, "unverified": 0, "mismatch": 0, "notApplicable": 0 },
  "truncated": false,
  "provenance": {
    "floorNotCensus": true,
    "missing": [
      "calls throttled by the edge IP bucket, which persists nothing",
      "calls that hit a platform timeout before any audit write",
      "calls whose audit write itself failed — the feed thins when the database struggles" ],
    "eventsAreAPage": { "returned": 0, "limit": 100, "of": 0 } },
  "events": [] }
```

### `GET /api/ops/connections-health`

```json
{ "scope": "scoped",
  "counts": { "total": 0, "healthy": 0, "needsAttention": 0, "unknown": 0, "neverTested": 0, "byStatus": {} },
  "provenance": { "activeOnly": true, "excludedInactive": 0,
    "why": "A deactivated connection serves no traffic, so its probe status would be a stale claim about a system nothing is calling." },
  "bindingBacklog": { "undeclaredEnvironment": 0,
    "remediation": "Declare the environment on each connection in Studio.",
    "consequence": "Reads through an undeclared connection are served but marked unverified; writes through one are refused outright." },
  "prodConnections": 0, "connections": [] }
```

### `GET /api/ops/tokens`

```json
{ "scope": "scoped",
  "counts": { "listed": 1, "active": 1, "revoked": 0, "expired": 0, "expiringSoon": 0,
              "neverObservedInUse": 1, "withWriteCredential": 0 },
  "provenance": {
    "lastUsedUnderReports": true,
    "countBasis": "`revoked` is counted over every credential in scope. The other counts are over the rows listed below, which exclude revoked credentials unless includeRevoked=1 — so they will not sum to `revoked + listed` in the default view.",
    "why": "lastUsedAt is written fire-and-forget and a serverless instance can freeze before it lands. It is last OBSERVED use, and is not on its own sufficient to conclude a credential is dormant.",
    "writeCredentials": "Counted from stored credential presence, never by reading it. No code path issues a write credential yet, so a zero here is by design rather than by absence of activity." },
  "credentials": [ { "label": "acme · DEV", "environment": "DEV", "state": "active",
                     "lastObservedUseAt": null, "expiresAt": null, "solutionStatus": "DRAFT" } ] }
```

### `GET /api/ops/write-ledger`

```json
{ "windowHours": 24, "scope": "scoped",
  "reservations": { "inFlight": 0, "completed": 0, "failed": 0, "staleReservation": 0, "total": 0 },
  "fromAudit": { "blocked": 0, "conflicts": 0 },
  "provenance": {
    "sourcesDoNotReconcile": true,
    "why": [
      "a write refused at the credential gate never reserves a key, so it appears only in the audit feed",
      "a write refused after reserving but before SAP has its reservation deleted, so the in-flight count can fall with nothing completing",
      "replayed and conflicted are computed at request time and never stored as row state — they are reported from the audit feed as events" ],
    "emptyByDesign": "No write credential can be issued yet, so every write is refused at the credential gate before a key is reserved.",
    "rowsAreAPage": { "reservationRows": { "returned": 0, "of": 0 }, "auditRows": { "returned": 0, "of": 0 }, "limit": 100 } },
  "reservationRows": [], "auditRows": [] }
```

### `GET /api/ops/throttle`

```json
{ "windowHours": 24, "scope": "scoped",
  "buckets": [
    { "id": "edge-read",  "key": "api:GET:{clientIp}",  "keyedBy": "client IP",  "limit": 300, "observable": false,
      "note": "Middleware bucket, applied before the route runs. A 429 here never reaches the broker and is never audited." },
    { "id": "edge-write", "key": "api:POST:{clientIp}", "keyedBy": "client IP",  "limit": 120, "observable": false, "note": "…" },
    { "id": "northbound-read",  "key": "northbound:{clientId}",       "keyedBy": "credential", "limit": 60, "observable": true,
      "note": "Per credential. A 429 here is written to the audit trail." },
    { "id": "northbound-write", "key": "northbound-write:{clientId}", "keyedBy": "credential", "limit": 60, "observable": true, "note": "…" } ],
  "credentials": [ { "label": "acme · DEV", "environment": "DEV",
                     "read":  { "known": true, "remaining": 60, "limit": 60 },
                     "write": { "known": true, "remaining": 60, "limit": 60 },
                     "throttledInWindow": 0 } ],
  "provenance": { "nonConsumingRead": true, "backend": "shared", "headroomIsPerInstance": false,
    "unknownRatherThanZero": null,
    "edgeBucketsAreNotObservable": "The two IP-keyed middleware buckets fire before the route and persist nothing, and their key is an address we cannot enumerate. Their limits are reported as configuration; no per-tenant usage figure for them exists or can be inferred.",
    "throttleCountsAreAFloor": "throttledInWindow counts audited 429s only. A call refused by an edge bucket never reached the broker and is not in this number." } }
```

### `GET /api/ops/incidents`

```json
{ "windowHours": 24, "scope": "scoped",
  "counts": { "total": 0, "critical": 0, "major": 0, "minor": 0 },
  "incidents": [],
  "rules": [
    { "id": "binding-mismatch",       "severity": "critical", "title": "A call was served from a different landscape than the credential declared", "firesWhen": "at least 1 audited call in the window has a connection environment that differs from the credential's" },
    { "id": "connection-unhealthy",   "severity": "major",    "title": "A SAP connection's last probe did not succeed", "firesWhen": "at least 1 active connection has a last validation status of UNAUTHORIZED, NOT_FOUND, TIMEOUT or ERROR" },
    { "id": "upstream-errors",        "severity": "major",    "title": "The upstream SAP system is returning errors", "firesWhen": "at least 5 audited calls in the window returned 5xx" },
    { "id": "throttled",              "severity": "minor",    "title": "A credential is being rate limited repeatedly", "firesWhen": "at least 10 audited calls in the window returned 429" },
    { "id": "expiring-credential",    "severity": "minor",    "title": "A credential expires soon", "firesWhen": "at least 1 active credential expires within the runway" },
    { "id": "undeclared-environment", "severity": "minor",    "title": "A connection has not declared its environment", "firesWhen": "at least 1 active connection has no environment set" } ],
  "thresholds": { "bindingMismatch": 1, "connectionUnhealthy": 1, "upstreamErrors": 5, "throttled": 10, "expiringCredential": 1, "undeclaredEnvironment": 1 },
  "provenance": {
    "floorNotCensus": true,
    "emptyIsNotHealthy": "An empty list means nothing crossed a threshold in what the audit feed recorded. Calls throttled at the edge, calls that timed out before an audit write, and calls whose audit write failed leave no row — and the feed thins exactly when the database is struggling.",
    "severitiesAreReproducible": "Every severity comes from a named rule with its threshold and reasoning attached. Nothing on this response is scored at request time.",
    "expiryRunwayDays": 14 } }
```

**An endpoint dc2 designs and that does not exist: catalogue freshness.** It was specified, and it is not
being built, because the underlying table has no tenant column — an organization-scoped freshness view would
return empty for every organization while looking like it worked. **Do not design a freshness screen.** If
dc2 has one, mark it out of scope in your change log.

---

## 4 · The four things that need you

### D1 · The provenance treatment — the highest-leverage decision in this commission

**Six screens** need a permanent, legible statement that a number is incomplete and why. Look at how much
`provenance` text is in §3: it is not a footnote's worth, and it is not the same shape twice.

- **broker traffic** — *a floor, not a census*, with **three** named causes, plus `eventsAreAPage`: the counts
  are window-wide but the event list is a page of them.
- **write ledger** — two sources that deliberately **do not reconcile**, with the mechanism spelled out.
- **connections health** — deactivated connections are excluded, and the count of them is given.
- **token monitor** — `lastUsedAt` under-reports; and `countBasis` explains why the tiles do not sum.
- **throttle** — two of the four buckets are *unobservable*, and that is permanent, not a loading state.
- **incidents** — *empty is not healthy*. The most important sentence in the product, on the screen most
  likely to be glanced at.

**Design one treatment that carries this weight consistently**, not six bespoke asides. These are **not**
errors, warnings, or dismissible tooltips — they are permanent properties of the data, and they must survive
being seen a hundred times without becoming invisible.

This is where honest status either becomes visible design language or degrades into fine print nobody reads.
**Treat it as the primary deliverable.**

Two specific cases the treatment has to survive:

- **A number with a stated basis.** `latency.medianMs` comes with `basis: "returnedPage"` and `sampleSize`
  against `counts.total`. A median over 40 rows and a median over 4,000 must not look the same. (Note: unlike
  earlier drafts of this brief, latency is now **real data** — the duration field exists and is populated. It
  is no longer omitted; it is qualified.)
- **A number that is structurally absent.** `throttle`'s IP-keyed buckets have a `limit` and no usage, ever.
  Not "loading", not "zero" — *unobservable*.

### D2 · Binding-unverified, and the environment-agreement triad

dc2 contains **zero** occurrences of "unverified". The concept did not exist when you designed it, and it is
now live in the data.

A connection whose SAP environment was never declared is neither healthy-and-known nor broken. Reads through
it are served but cannot be attributed to a landscape; writes through it are refused outright.

- **On the connections view** — a per-connection *binding unverified* state, **distinct from both a health
  status and an environment chip**. Note the existing rule: an unknown environment renders **no chip at all**,
  never a guessed one. This state is how "no chip" becomes legible rather than merely blank. Getting this
  wrong produces a screen that looks like a rendering bug.
- **The backlog treatment** — `bindingBacklog.undeclaredEnvironment` is *work to clear*, with a route to the
  fix, shaped so it reads as "this should be trending to zero". Explicitly **not** a status badge that could
  sit at a constant number forever without anyone noticing.
- **On broker traffic — four outcomes, not three.** `environmentBinding` now has `agreed`, `unverified`,
  `mismatch` **and `notApplicable`**. The fourth is calls refused before any connection was reached, and it
  exists because they used to be silently counted as *agreed*. Design all four; `notApplicable` must not read
  as a failure, and `mismatch` is the alarming one.
- **A write-refused-for-undeclared-environment state** — a specific refusal an operator will see and must be
  able to act on. Not an outage, not a permissions problem; the remedy is "declare this connection's
  environment".

### D3 · Thin-not-empty

The screens will have *few* rows early, not zero — one credential, two connections, a handful of calls. The
capture in §3 is a real tenant with exactly one credential and no connections at all.

Design for sparse data that still looks intentional. **One row must not look like a broken screen**, and a
single-item list must not look like a loading state that stalled.

### D4 · The connection-health status vocabulary

dc2 contains `NEVER_TESTED` (4 occurrences) and **zero** occurrences of `NO_PROBE_PATH`. The probe returns
exactly: `OK · UNAUTHORIZED · NOT_FOUND · TIMEOUT · ERROR · NO_PROBE_PATH`.

- **`NEVER_TESTED` keeps its label but leaves the scale of observed outcomes.** It is not a probe return
  value; it is the schema's own name for the **null column** — the *absence* of a stored result. Give it its
  own visually distinct state outside the scale.
- **`NO_PROBE_PATH` is a real outcome with no design.** It means *we* have no path to probe and refused to
  guess one. It is our ignorance, not the tenant's fault, and the copy must not read as a tenant failure. It
  rolls up under **unknown**, never under **needs attention** — the count must follow the framing or the
  screen nags an operator about a gap on our side.
- **The stale-timestamp pairing is correct and must be designed as such.** "Last validated" moves **only** on
  a successful 200. A connection can legitimately show `TIMEOUT` beside a three-week-old "last validated" —
  that pairing is the truth (it last worked three weeks ago; it is failing now), not a bug. Design it so an
  operator reads it that way and nobody "tidies" it later.

---

## 5 · Determinate — do NOT design these

Listed so you know they are handled, not forgotten. A competent implementer produces the same answer from
prose as you would from HTML, so designing them spends your time for nothing.

- **The write ledger's state vocabulary.** dc2 shows *replayed* and *conflicted* as ledger states. They are
  responses computed at request time and leave no row. Only in-flight, completed and stored-failure are row
  states; the rest come from the audit feed as events. The endpoint already returns exactly this shape.
- **The write ledger's empty state copy**, which is already written and verifiable: *"No write credential can
  be issued yet, so every write is refused at the credential gate before a key is reserved."* Render it as a
  demonstration of the product's honesty rather than an apology — and **never with sample rows**. If your
  provenance treatment (D1) covers this well, that is sufficient.
- **Workspace chrome, breadcrumbs and rail section lists.** Already built and shipped for all three
  workspaces, including the Support role's treatment. An earlier brief asked for this first; it is done.

## 6 · Deferred to a second tranche — do not design now

These are Control Tower, and holding the Operations Center for them is what this narrowing exists to avoid.

- **Grant expiry states** — time-remaining, approaching-expiry, lapsed, and the progressive-trust ladder.
- **The revoke controls** on the token and connection registries, and their visible-but-disabled treatment.

Commission both together once the Operations Center is building.

## 7 · Do not design these at all

- **No grant revocation control** anywhere — revocation is deferred by decision, and required expiry is the
  control instead.
- **No write-credential issuance UI** — deliberately held; it is why the write ledger is empty.
- **No catalogue freshness screen** — see §3.
- **No secrets, tokens, hashes, or SAP hostnames** on any screen. Sealed-secret *presence* may be shown as a
  yes/no, never the value.
- **No new SAP call.** These screens read data already captured.

## 8 · Constraints

Design Book components and tokens **verbatim** — the Operations Center must be visually indistinguishable in
family from the shipped Studio. Every data view needs its full state set: **data / empty / needs-setup /
error / loading**, where *empty*, *not set up* and *error* are always three different things and never
collapse into one another. PROD environments render as a warning; unknown environments render **no chip**.

Accessibility AA: visible focus rings, keyboard reachability, and status **never conveyed by colour alone** —
*unverified*, *mismatch* and *notApplicable* are exactly where colour-only encoding creeps in, and they are
the three that matter most to get right.

## 9 · Deliverable

1. **The four items in §4**, in dc2's format and component language. A full `dc3` file is welcome but is not
   required and must not delay delivery — if it is faster to deliver §4 as an addendum to dc2, do that.
2. **A short change log** — one line per item: what it is, which screen, which of D1–D4 it answers. Note
   anything in dc2 you are marking out of scope (freshness, the deferred Control Tower items).
3. **An open-questions list** — anything you could not resolve without inventing data or making a product
   decision. **Do not resolve these yourself.**

## 10 · When to stop and ask

Stop and report rather than designing, if: something cannot be shown without data that does not exist; a
screen seems to require a new live SAP call; a control you are asked to add would need a permission nobody
has; or the payloads in §3 contradict this brief. **The payloads win on what is true; you win on how it
looks.**

A stopped question is cheap. A designed screen that implies a capability the system does not have gets built,
shipped, and believed.
