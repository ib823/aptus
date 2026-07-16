# Neutral Process Discovery — Build Log

## Pre-flight verification (before PR-1)

Ran against the committed artifacts to validate the two claims the plan rests on:
"data is final and QA'd" and "designs verified against repo tokens".

### Data integrity — PASS

| Check | MANIFEST | Actual | Result |
|---|---|---|---|
| processes | 742 | 742 | match |
| value_streams | 10 | 10 | match |
| workflows | 85 | 85 | match |
| with_flow | 726 | 726 | match |
| with_substeps | 400 | 400 | match |
| no-flow processes | 16 (brief) | 16 | match |
| client vendor leaks | 0 | 0 | match |

- **Guard scan:** client dataset is clean against all 23 terms in `vendor-term-guard.json`. 0 hits.
- **Hashes:** all three files verify. Algorithm is `sha256[:16]` — CI must use this, it is not recorded in the MANIFEST.
- **Join:** client `id` ↔ consultant `scope_id`, 742/742 overlap, 0 orphans. Note the **key names differ** between datasets.

### Findings requiring a build decision

| # | Finding | Decision |
|---|---|---|
| D1 | **Partially fixed by the re-emission (see below).** Client `meta.with_flow` is now correct (726). Consultant `meta.completeness` remains **stale**: claims 155/177/306 (sums to the old 638); actual is 223/177/326 = 726. | **MANIFEST is authoritative.** Loader ignores `meta` counts entirely; CI asserts against MANIFEST only. Data is **not** edited locally — invariant 7 makes it read-only in PR-1..5, and editing would break the verified hashes. Standing decision 1 confirmed. |
| D2 | Consultant dataset has **no `completeness` field**; client dataset does. Invariant 4 requires completeness badges everywhere a process renders, including the C2 library grid. | Consultant loader derives completeness by joining `scope_id` → client `id`. No data change. |
| D3 | **46% of flow steps (1400/3035) and 31% of substeps (2877/9425) have an empty role**, but the .dc renders `{{ lane.role }}` with no fallback. | Resolved by the brief, which wins: *"Blank-role steps sit in a 'System / Automatic' lane."* No question outstanding. |
| D4 | The .dc files use **literal hex, not CSS vars** — contrary to the prompt's description. 22 of 23 values map to existing repo tokens. **`#DDD9CC` has no token** (used once: export/print-preview backdrop). | Invariant 5 forbids new colors. Use `--border-strong` (`#C4BFAE`) for the export backdrop. Deviation logged; PR-3 scope. |

### ⚠ Artifact re-emission during the session (integrity event)

The artifacts were **replaced on disk between the first pre-flight scan and the
commit**. Detected when copying into `src/data/discovery/` produced hashes that
did not match the ones verified earlier.

| File | Pre-flight hash | Committed hash |
|---|---|---|
| discovery-library.client.json | `501559ae0d27a2a9` | `71d5a13aa7ca59de` |
| discovery-library.consultant.json | `dea4591d7e4a5a63` | `626f605fc732f494` |
| vendor-term-guard.json | `57749b0be400c9e2` | `57749b0be400c9e2` (unchanged) |

The old bytes were never committed, so the two versions cannot be diffed. What
the re-emission changed, per re-verification: client `meta.with_flow` 638 → 726.
Everything else material is unchanged.

**Re-verified against the committed bytes — all pass:** three hashes
self-consistent · all five MANIFEST counts match (742/10/85/726/400) · client
dataset clean against all 23 vendor terms · join 742/742 · D2, D3, D4 unchanged.

Lessons carried into PR-1:
- Verification has a shelf life. The MANIFEST hash assertion is the only durable
  defence against silent drift — it is the reason CI checks hashes, not just counts.
- Any future "data is final" claim should be pinned to a hash, not a date.

### Notes
- Brief says "16 of 654" no-flow; 654 is the pre-overlay `sap_base` count (654 + 88 overlay = 742). The 16 figure holds against actual data.
- `grep` hangs on the .dc files (minified long lines) — CI guard should scan with a line-length-tolerant reader, not plain grep.

## Parity checklist

_Per screen · state · match/deviation · reason — populated per PR._

| Screen | State | Match / Deviation | Reason |
|---|---|---|---|
| _pending PR-2_ | | | |
