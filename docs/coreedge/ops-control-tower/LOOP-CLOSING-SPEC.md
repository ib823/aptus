# Loop-Closing Spec — the access request dialog and `entitySet` editing

**Status:** authorized by settled decision 2 (Build Bible v3 §12). Two small PRs, run **in parallel** with the
Ops/Control Tower front. Grounded against `ib823/aptus` @ `main` `70a6cec`; every `file:line` below was read at
that SHA.

**Why this exists.** Two governance surfaces in Developer Studio are complete on the server and unreachable from
the product. `POST /api/studio/access-grants` works and is covered by eight passing tests — and **nothing in the
app calls it**. `Interface.entitySet` is accepted by the PATCH route — and **no UI sends it**. The consequence is
that no access grant and no usable interface can be created without hand-editing the database, which means
Control Tower's decision queue and the Ops broker-traffic feed have nothing to show. These two PRs close that,
and nothing more.

**What this is not.** It is not the whole developer loop. **Write-credential issuance stays deliberately
unbuilt** (decision 2), so the write ledger stays honestly empty. Grant revocation stays deferred (decision 1).
Mapping stays v2. If you find yourself building any of those, stop.

---

## §1 · What is already true (verify at your SHA before starting)

**The access-grant request path is built and tested.**
- `requestSchema` (`src/app/api/studio/access-grants/route.ts:31-38`): `solutionId`, `externalId` (1–200),
  `operation` (`READ|CREATE|UPDATE`), `environment` (`SANDBOX|DEV|TEST|PROD`), `justification` (10–2000),
  `expiresAt` (ISO datetime, **optional**).
- Gated by `canMutateStudio` — the consultant builder role.
- The route stamps the requester so segregation of duties is enforceable at decision time, always records
  `REQUESTED`, and ignores any client-supplied decision. Eight tests in
  `tests/unit/studio/access-grants-route.test.ts` ("raising a request") pin this. **They must stay green.**
- **The only fetch to this endpoint anywhere in the app is the `PATCH`** at
  `src/components/studio/AccessGrantsClient.tsx:83`. The POST has no caller.

**The empty state already promises the thing that does not exist.**
`AccessGrantsClient.tsx:111-118` renders *"No access has been requested yet — a request records which capability
a solution needs…"* with no way to make one. Two other screens point at the same missing door:
`SolutionsClient.tsx:226` ("request access from the API Access screen") and `DiscoverClient.tsx:104-110`
("Access is requested and decided separately").

**The interface PATCH already accepts an entity set.**
- `patchSchema` (`src/app/api/studio/interfaces/route.ts:46-55`) accepts
  `entitySet: z.string().max(200).nullish()`.
- `InterfacesClient.tsx:144` renders it **read-only**: `{selected.entitySet ?? "not set"}`. The only author
  actions on that screen are *Mark ACTIVE* and *Deprecate* (`:210-224`), behind `canAuthor`. A `patch({id, …})`
  helper already exists and is used by both.
- `DiscoverClient.tsx:64-70` omits `entitySet` when creating the DRAFT, which is why every interface starts
  unset.
- Without it the broker refuses: `data/route.ts:145-166` returns 400 *"This interface has no entity set
  configured. Set one in Studio"* — advice that currently cannot be followed.

**The Test Console already holds the tenant's real entity sets.**
`TestConsoleClient.tsx:98` resolves them from the live response
(`(schemaJson.data?.entitySets ?? []).map((e) => e.name)`) and carries them in run state (`:104`, `:123`,
`:133`, `:146`). The entity box on that screen is a **per-run override that is never written back** — the value
is used for the run and discarded.

---

## §2 · PR-LC1 — the access request dialog

### The correctness constraint that shapes the whole design

At runtime a grant is matched on **`solutionId` + `externalId` + `operation` + `environment`**, all four exact
(`src/lib/northbound/access.ts:115-121` on the write path, `:211-216` on the read path). A grant whose
`externalId` differs from an interface's by a character — a typo, a copied label instead of the service id, a
trailing space — is **dead on arrival**: it will be approved, displayed in the ledger, counted in the portfolio,
and authorize nothing. Nothing in the system will ever tell anyone why.

**Therefore the dialog must not offer `externalId` or `operation` as free text.** Both are derived from an
interface the user selects. This is not a UX preference; free-text entry manufactures silently-useless grants,
and the ledger showing an approved grant that grants nothing is worse than having no ledger.

### Build

Add a **Request access** action to `/studio/access`, visible only to `canMutateStudio`. Reachable from the empty
state (which already describes it) and from the populated view. The two screens that already point here
(`SolutionsClient.tsx:226`, `DiscoverClient.tsx:104-110`) should link into it — they have been promising it.

**Fields:**

| Field | Source | Notes |
|---|---|---|
| Solution | the caller's own solutions | org-scoped, as everywhere |
| Capability | **picked from that solution's interfaces** | supplies `externalId` **and** `operation` as a locked pair |
| Environment | `SANDBOX \| DEV \| TEST \| PROD` | the requester's choice — this is the trust ladder |
| Justification | free text, 10–2000 | mirror the server bound; it is a real governance artifact, not a formality |
| Expires | ISO date | see below |

**Operation is displayed, never chosen.** One catalogue service may back several interfaces at different
operations, so selecting the interface selects the pair. Showing the operation as a derived, read-only
consequence of the pick is what stops a `READ` grant being raised against an interface configured for `CREATE` —
which `resolveWritableInterface` would refuse at runtime, long after approval.

**Expiry.** The schema keeps it optional. **The dialog must require it when the selected interface's operation
is `CREATE` or `UPDATE`.** PR-CT-0a makes an expiry mandatory before a *write-granting decision* can be settled,
so a write request arriving without one strands the approver: they cannot approve it and cannot add the date
themselves. Requiring it at request time means the write path arrives already bounded.

> **Be explicit in the code comment:** this UI rule is a **convenience that keeps the approver unblocked, not a
> security control.** The control is in `evaluateDecision`. A future caller hitting the API directly can still
> omit an expiry, and the decision will refuse it — which is the correct place for that to happen.

**Empty states.** A solution with no interfaces cannot have a request raised against it: say so, and link to
Discover. Do not fall back to a free-text field.

### Tests

The dialog is not visible to a role that cannot author (mirroring the route's own 403 at
`access-grants-route.test.ts:109`); a submitted request lands as `REQUESTED` with the requester stamped;
`externalId` and `operation` on the created grant match the selected interface exactly; a `CREATE`/`UPDATE`
request cannot be submitted without an expiry; the eight existing "raising a request" route tests stay green.

---

## §3 · PR-LC2 — setting an interface's entity set

Two ways in. The second is the one that matters.

**a · Inline edit on the Interfaces detail card.** Make the "Entity set" row editable behind `canAuthor`, using
the existing `patch({ id, entitySet })` helper. `nullish` in the schema means clearing it is legitimate — support
that, since an entity set entered wrongly must be removable, not just overwritable.

**b · Write-back from the Test Console — the honest moment.** After a run **returns rows**, offer *"Save as this
interface's entity set."* The Test Console already knows the tenant's real entity sets (`:98`) and the user has
just watched this one return data. That is the only point in the product where the correct value is *proven*
rather than typed, and persisting it there converts a per-run override into the interface's contract.

Do not build a picker on the Interfaces screen by fetching entity sets there: that would put a live, throttled
SAP read behind a governance screen, and add a fourth caller to a path the Ops spot-check is already being
rebuilt around. The Test Console is where live reads belong.

### Behaviour to preserve, not "fix"

**Setting or changing `entitySet` increments the interface version.** `contractChanged` at
`interfaces/route.ts:209-212` includes an `entitySet` change, so a DRAFT created without one goes to v2 the
moment it is set. That is correct — an interface that 400s and one that returns rows are different contracts —
and the version logic is tested. **Leave it alone.** Expect the bump; do not special-case DRAFT to suppress it,
and do not report it as a defect.

### Tests

Setting an entity set persists it and increments the version; clearing it back to null is possible; the Test
Console's save affordance appears **only after a run that returned rows**, never after an empty, needs-setup or
error outcome; a role without `canAuthor` sees neither affordance.

---

## §4 · Definition of done — one walk, no database

Both PRs are done when a person can complete this **entirely through the UI, with no SQL and no seed script**:

1. Register a solution and assign its three owners.
2. A **second** consultant issues its runtime credential (the existing ownership + SoD gates).
3. Create an interface from Discover.
4. **Set its entity set** (PR-LC2).
5. **Request access** for it (PR-LC1).
6. A **second** consultant approves the request.
7. Call `/api/northbound/interfaces/{id}/data` with the credential and receive rows — or an honest `EMPTY`.

If any step still needs database work, the loop is not closed. **Step 7 is the assertion**, not step 6: an
approved grant that does not produce a working call is exactly the failure §2 exists to prevent.

Note what this walk requires that this spec does **not** provide: a **write** cannot be completed, because no
write credential can be issued. That is decision 2 working as intended, not a gap in this spec.

---

## §5 · Scope boundary — stop if you reach these

- **Write-credential issuance.** Held by decision 2. Building it would populate the write ledger and is
  explicitly not wanted; the empty ledger that names a working control is the intended artifact.
- **Grant revocation**, and any change to `evaluateDecision`. Deferred by decision 1; the expiry rule belongs to
  PR-CT-0a §4.2. If PR-CT-0a has not landed yet, build LC1's expiry field anyway — it is forward-compatible.
- **Mapping** — still v2. `mappingVersion` is absent from `patchSchema` deliberately (`interfaces/route.ts:52-54`);
  an unaccepted field is a stronger guarantee than a greyed-out card.
- **Widening any RBAC helper.** Both PRs sit inside `canMutateStudio` / `canAuthor` as they stand.
- **Changing the version-bump rule** (§3).

## §6 · Sequencing

Independent of each other and of the CT sequence; either order. Both are prerequisites for the *data* that
Control Tower's decision queue (PR-CT4) and the Ops broker-traffic feed (PR-CT3) are designed to display — those
screens are built expecting real rows, so landing these before CT3/CT4 reach review is what keeps "thin" from
being mistaken for "broken".

Guardrails are the front's, unchanged: green `typecheck:strict · lint:strict · test · build`; org-scoped through
the `TenantScope` helpers; `ConfigAudit` on the mutations; secret-safe; a11y AA.
