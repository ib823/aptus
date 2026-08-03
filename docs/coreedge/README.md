# CoreEdge Console — build specification archive

The documents this platform was built from. Kept for provenance: when someone
asks *why* a decision was made, the answer is usually in here.

**All of this is now BUILT and merged** (PRs #142–#156). These are the source
specs, not a backlog.

## What each file is

| File | What it is | Status |
|---|---|---|
| `CoreEdge-Master-Build-Index.md` | The control sheet — 16 PRs in sequence, model tiers, the two STOP gates | ✅ executed |
| `CCC-Developer-Studio-v1-Build-Bible-v2.md` | The design-time console: data model, RBAC, honest status, seven screens | ✅ built (PR-1…7) |
| `CCC-Developer-Runtime-Build-Bible-Phase-D-v2.md` | The developer runtime loop: broker, tokens, offline mock, hardening | ✅ built (PR-D1…D7) |
| `CoreEdge-Design-Tokens.md` | Colour, type, spacing, component measurements. **The single source of truth for colour** | ✅ applied |
| `CoreEdge Developer Studio.dc.html` | The approved interactive design — 7 screens + shell, every state | ✅ translated to shadcn |
| `CoreEdge-Studio-Design-Book.html` | Rendered visual language reference | reference |
| `CoreEdge-Security-Architecture.html` | Trust boundaries the UI and APIs reflect | reference |
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

## Decisions recorded elsewhere

- **STOP-gate B** (CoreEdge is a runtime platform; the broker is built in-house
  rather than adopting SAP Integration Suite) — cleared by the product owner.
- **Write authorization** — human oversight sits at grant approval, not per call.
  Consequently grant expiry and segregation of duties carry real weight, and both
  are enforced per call.
- **The KMS gap** — see `SAP-CONNECTION-KEYSTONE-RUNBOOK.md` alongside this file.

For how to actually use the platform, see `docs/coreedge-developer-guide.md`.
