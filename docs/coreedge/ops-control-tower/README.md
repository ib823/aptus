# CoreEdge — Operations Center & Control Tower

The engineering and content contract for the CoreEdge Console's second and third
workspaces.

## Why these are in the repository

They were attachments. PR #175 shipped four `/api/ops/*` endpoints whose paths,
payload shapes and provenance requirements are specified by exact line in the
Build Bible — and a reviewer working from the repository alone would have found
no authority for any of them and would have been right to say they were
unspecified. The authority existed; it was in a file nobody could open from a
diff.

A spec that cannot be reached from the code it governs is not a spec.

## What is here

| File | What it is |
|---|---|
| `CCC-Ops-ControlTower-Build-Bible-v3.md` | The engineering contract. Authoritative on what data is real, which PR builds what, and the §0 design gate. Contains in-place corrections made when implementation proved the specification wrong — those are marked where they occur. |
| `CoreEdge-Ops-ControlTower-Inventory.md` | The content spec: capability → real data source → build status, with the provenance caveat for each capability. |
| `CoreEdge-Ops-ControlTower-CCC-Runbook-v2.md` | Execution order and verification steps. |
| `LOOP-CLOSING-SPEC.md` | The spec for PRs #171 and #172 — the access-request dialog and interface `entitySet` editing. |
| `FRESHNESS-RESPEC.md` | Why `GET /api/ops/freshness` was **not** built as the Bible specifies it, and what would have to change first. |
| `design/` | The visual contract. `dc2` is the Operations Center / Control Tower design and is **partly superseded** — see the gate below. |
| `reviews/` | An independent verification of PRs #168–#177, its decision brief, and the build instruction that produced PR #178. Kept because several fixes only make sense next to the finding that prompted them. |
| `archive/` | Superseded versions. Not inputs. See `archive/README.md`. |

## The design gate, and its current status

Build Bible §0 says PR-CT3, CT4 and CT5 — the actual screens — must not be built
from `dc2`, because `dc2` renders latency the data could not measure, a
`NEVER_TESTED` status the probe never returns, live revoke controls the
workspace's own owner receives a 403 on, and has no design at all for two
concepts that now exist in the data (binding-unverified, grant expiry).

**The independent review assessed that gate as stricter than the evidence
supports** (`reviews/D2-Decision-Brief_1.md`): 47 elements are backable as drawn,
21 are not, and each of the 21 has a stated correction. Three genuinely need a
designer — the provenance-note treatment, the *binding unverified* visual state,
and sparse-data density. The rest are determinate from the delta list plus the
Inventory.

That is a decision for the repository owner, not a settled fact. Until it is
settled, treat §0 as in force.

## Reading order

New to this: `CoreEdge-Ops-ControlTower-Inventory.md` first — it is the shortest
route to what the product claims and what backs each claim. Then Build Bible §7
and §8 for the two workspaces, and §10 for the screens that are empty by
construction and why that is correct rather than unfinished.
