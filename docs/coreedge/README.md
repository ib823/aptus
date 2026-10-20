# CoreEdge Console — build specification archive

The documents this platform was built from. Kept for provenance: when someone
asks *why* a decision was made, the answer is usually in here.

**They are historical, not a description of today's product.** The PRs they
specify (#142–#156: the keystone, the v1 Studio and the Phase D runtime) were
built and merged, but not always as written: the specs were corrected during the
build (below), and much has been built since that they never mention or rule out
(customer-built services, step-up, envelope keys, grant binding, key expiry,
per-credential rate limits, developer sign-up, contract-stamped fixtures,
verified catalogue addresses, time-to-first-call measurement). Neither are they a backlog: what
is still to do lives in the roadmap.

What CoreEdge does today, and does not do:

| Question | Where the answer is |
|---|---|
| What can CoreEdge do, scored from the code | `capability-registry.json`, generated from `src/lib/coreedge/capability-registry.ts` (`docs/runbooks/coreedge-capability-registry.md`) |
| What is planned, and in which phase | `CoreEdge-Gap-Study-and-Roadmap.md` |
| How to use it as a developer | `docs/coreedge-developer-guide.md` |
| Which security controls are built | `CoreEdge-Security-Architecture.html` (reviewed against the code in P0.16) |
| How CoreEdge itself is released, rolled back and recovered | `docs/runbooks/coreedge-release.md` (P0.17) |

CI refuses "planned", "not yet built" and similar wording next to a feature the
registry marks shipped, in these documents and the CoreEdge code's comments
(`pnpm coreedge:doc-claims`, `docs/runbooks/coreedge-doc-claims.md`).

## What each file is

| File | What it is | Status |
|---|---|---|
| `CoreEdge-Master-Build-Index.md` | The control sheet — 16 PRs in sequence, model tiers, the two STOP gates | ✅ executed; historical |
| `CCC-Developer-Studio-v1-Build-Bible-v2.md` | The design-time console: data model, RBAC, honest status, seven screens | ✅ built (PR-1…7); historical |
| `CCC-Developer-Runtime-Build-Bible-Phase-D-v2.md` | The developer runtime loop: broker, tokens, offline mock, hardening | ✅ built (PR-D1…D7); historical, with one correction to §7 (below) |
| `CoreEdge-Design-Tokens.md` | Colour, type, spacing, component measurements. **The single source of truth for colour** | ✅ applied |
| `CoreEdge Developer Studio.dc.html` | The approved interactive design — 7 screens + shell, every state | ✅ translated to shadcn; historical |
| `CoreEdge-Studio-Design-Book.html` | Rendered visual language reference | reference |
| `CoreEdge-Security-Architecture.html` | Trust boundaries the UI and APIs reflect, and which controls are built | current (reviewed in P0.16) |
| `sap-connection-keystone.patch` | The keystone slice as originally delivered | ⚠️ **already applied** — see below |

## Do not re-apply the patch

`sap-connection-keystone.patch` landed as **PR-0 (#142)** and is on `main`.
It is kept as the as-delivered artifact, not as something to run. Applying it
again would conflict with the live schema.

## Where the specs and reality diverged

Three claims in the specs turned out to be wrong about this codebase. They were
corrected during the build, and the corrections are the interesting part:

1. **The `SapConnection` keystone was described as "already merged".** It existed
   on no branch. It shipped as PR-0.
2. **The roles `Developer` and `Support` did not exist.** Resolved by mapping
   Developer → `consultant`; `platform_admin` gets oversight without authorship.
3. **The business-domain lens was specified over the `domain` field.** That field
   holds SAP's own vocabulary (`"AI"`); line-of-business lives on `packageId`.
   Built as specified, the lens would have silently returned nothing.

A fourth correction came later: the spec pointed the connectivity probe at
`/api/sap/tdd/capabilities`, which resolves its tenant from **environment
variables** — so a stored connection could have been reported healthy because a
*different* SAP system answered. The probe reads the connection's own credentials
instead.

A fifth came later still. Phase D §7 said a customer's own OData service (the
one their ABAP exposes) needed "no new build": it would surface through the
catalogue and the normal Discover → Interface flow. It did not. A `Z*` or `YY1_*`
service is in neither the curated list nor SAP's catalogue, so Discover never
showed it and every route refused it. Registering it by its service path, with a
`$metadata` verification per environment and grants scoped to the path, was new
build: roadmap item P1.1 (#307). §7 now carries the correction.

## Decisions recorded elsewhere

- **STOP-gate B** (CoreEdge is a runtime platform; the broker is built in-house
  rather than adopting SAP Integration Suite) — cleared by the product owner.
- **Write authorization** — human oversight sits at grant approval, not per call.
  Consequently grant expiry and segregation of duties carry real weight, and both
  are enforced per call.
- **The KMS gap** — partly closed. SAP secrets are sealed under per-organisation
  data keys with versioned, rotatable master keys (P0.10), but the only key
  provider built in is the environment, so the master key still sits in the
  deployment's environment. Which cloud KMS to plug in is an open decision. See
  `SAP-CONNECTION-KEYSTONE-RUNBOOK.md` alongside this file.

For how to actually use the platform, see `docs/coreedge-developer-guide.md`.
