# Archive — superseded Ops & Control Tower pack documents

These files are **historical record only**. They are the pack as believed at `main` `70a6cec` (#167), before the
two-pass reconciliation of 2026-07-26/27. **Do not attach them to a build or recon session** and do not cite them
as current.

They are kept because the findings register (D1) cites several of them by claim — F2 (inventory filename
mismatch), F3 (references to documents that do not exist), F4 (the shell/rail generalization shape), and F30+.
Those findings become unverifiable if the originals are deleted.

| Archived file | Superseded by |
|---|---|
| `SUPERSEDED-CCC-Ops-ControlTower-Build-Bible-v2.md` | `../CCC-Ops-ControlTower-Build-Bible-v3.md` |
| `SUPERSEDED-CoreEdge-Ops-ControlTower-Inventory-v2.md` | `../CoreEdge-Ops-ControlTower-Inventory.md` (v3) |
| `SUPERSEDED-CoreEdge-Ops-ControlTower-CCC-Runbook-v1.md` | `../CoreEdge-Ops-ControlTower-CCC-Runbook-v2.md` |
| `SUPERSEDED-COWORK-REASSESS-PROMPT.md` | spent — the reassessment it commissioned produced the v3 pack |
| `SUPERSEDED-PACK-AMENDMENTS-RECONCILED.md` | absorbed into `../CCC-Ops-ControlTower-Build-Bible-v3.md` |

## Why the amendments register was archived rather than kept as an attachment

`SUPERSEDED-PACK-AMENDMENTS-RECONCILED.md` is the CCC⇄Cowork reconciliation record. It was briefly listed as a
build input, and that was a mistake: its own line 3 declares itself **"BINDING inputs to D2, D3, D4, D5"**, and
it describes decision 4 (environment binding) as **open** — which it no longer is. A build session attaching it
would read a settled question as open and reopen it, and a header disclaimer would not help, because the attach
list would already have legitimised the file.

Everything load-bearing in it is absorbed into Bible v3: F54 and F54a (§4.4), the reframed F38 (§7 catalogue
freshness), the write-ledger blend and its reconciliation caveat (§7), and the RBAC test constraints (§5.3).
It is kept only as provenance for how the v3 pack was reached.

**Known-wrong content in the archived versions** (do not copy forward): the connection-health enum lists
`NEVER_TESTED`, which does not exist in code; the throttle gauge is specced on a consuming `checkRateLimit`; the
PR-Rbac file list covers four files when eight exhaustive `Record<UserRole, …>` maps break; the shell
generalization is described as a rail change when the rail is already parameterized; and there is no pre-work PR
for the environment binding or grant-decision semantics.
