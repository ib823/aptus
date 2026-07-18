# Neutral Process Discovery — Build Log

## Pre-flight verification (before PR-1)

Ran against the committed artifacts to validate the two claims the plan rests on:
"data is final and QA'd" and "designs verified against repo tokens".

### Data integrity — PASS *(historical: superseded by D6)*

> ⚠ **The `with_flow` and no-flow rows below are superseded.** They record what
> was verified on 2026-07-16 against the then-frozen bytes. Both figures counted
> 181 sentinel flows as real. The honest figures are **545 with_flow / 197
> no_flow** — see D6. The row that says "no-flow processes … 16 … match" is the
> exact assertion that was true against MANIFEST and false about the content.
> Left in place deliberately: the log should show what was believed when.

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
| D1 | **Resolved by the 2026-07-17 re-emission.** Both datasets' `meta` blocks are now consistent with actuals; the stale-completeness remnant is gone. | **The stance stands regardless: MANIFEST is authoritative, `meta` is informational.** The loader reads no count from `meta` — enforced by typing it `unknown` in the schema, so a violation is a compile error. Data is never edited locally; corrections arrive as data-only re-emissions (D6 is the first). |
| D2 | Consultant dataset has **no `completeness` field**; client dataset does. Invariant 4 requires completeness badges everywhere a process renders, including the C2 library grid. | Consultant loader derives completeness by joining `scope_id` → client `id`. No data change. |
| D3 | **46% of flow steps (1400/3035) and 31% of substeps (2877/9425) have an empty role**, but the .dc renders `{{ lane.role }}` with no fallback. | Resolved by the brief, which wins: *"Blank-role steps sit in a 'System / Automatic' lane."* No question outstanding. |
| D4 | The .dc files use **literal hex, not CSS vars** — contrary to the prompt's description. 22 of 23 values map to existing repo tokens. **`#DDD9CC` has no token** (used once: export/print-preview backdrop). | Invariant 5 forbids new colors. Use `--border-strong` (`#C4BFAE`) for the export backdrop. Deviation logged; PR-3 scope. |
| D6 | **181 sentinel flows in the frozen client dataset** — see the dedicated section below. Corrected upstream by a data-only re-emission. Honest totals are now **545 with a flow / 197 without**. | `hasFlow()` is flow-presence only (sentinels no longer exist). A permanent CI assertion rejects any flow step matching `/\((?:no\|not)\b[^)]*\bsteps?\)/i` or any guard term, at step and sub-step level. V1's stat row reads `coverageCounts()` — computed from the data, never from `meta` or MANIFEST. |
| D5 | **`typecheck:strict` OOMs** (V8 heap exhausted) on a plain `import raw from "…client.json"`. With `resolveJsonModule`, tsc infers a full structural literal type across all 742 processes and their nested flows. Verified against baseline: clean `main` passes; adding the import alone tips it over. | Ambient declaration in `src/types/discovery-data.d.ts` types the two datasets as `unknown`, stopping the inference. Nothing is lost — the loaders never trusted the inferred shape; they zod-parse the raw value, which is a *stronger* guarantee (runtime validation vs. compile-time literal). Scoped to the discovery datasets, so JSON imports elsewhere keep normal inference. |

### Artifact re-emission during the session (resolved — benign)

**Explanation (confirmed by the data owner):** a legitimate upstream pipeline
re-emission. The canonical pipeline fixed `meta.with_flow` in both datasets and
refreshed the MANIFEST hashes; the 4 files were uploaded over the originals
mid-session. The hand-off was mistimed — the "no fix will arrive" instruction was
written before the upload landed. **The committed bytes are the intended,
canonical pipeline output.** No action outstanding.

It was detected only because copying into `src/data/discovery/` produced hashes
that did not match the ones verified earlier.

| File | Pre-flight hash | Committed hash (canonical, PINNED) |
|---|---|---|
| discovery-library.client.json | `501559ae0d27a2a9` | **`71d5a13aa7ca59de`** |
| discovery-library.consultant.json | `dea4591d7e4a5a63` | **`626f605fc732f494`** |
| vendor-term-guard.json | `57749b0be400c9e2` | **`57749b0be400c9e2`** (unchanged) |

What the re-emission changed: `meta.with_flow` 638 → 726. It did **not** touch
consultant `meta.completeness` — a known, accepted remnant (D1).

**Re-verified against the committed bytes — all pass:** three hashes
self-consistent · all five MANIFEST counts match (742/10/85/726/400) · client
dataset clean against all 23 vendor terms · join 742/742 · D2, D3, D4 unchanged.

### D6 — 181 sentinel flows (found in PR-2, fixed upstream 2026-07-17)

**The defect.** 181 of 742 processes carried a "flow" that was a single step
titled `"(no MY mandatory steps)"` with an empty role. Not a flow — a
placeholder for an *absent* flow, encoded as a present one.

**Root cause (confirmed by the data owner).** The P1 pipeline's flow extractor
split the SAP source's "Mandatory MY flow" column verbatim. Where a process had
no Malaysia-mandatory steps, that column held the literal string, which became a
fake one-step flow. The `.dc` prototype's `isNoFlow()` detected this sentinel;
the pipeline did not.

**What it would have shipped**, had we built to spec as-is:
- A fake one-step diagram on **181 client-facing process pages**, instead of the
  honest fallback — violating brief §6/18, *"never a fake flow"*.
- V1's "with a step flow" tile reading **726**, overstating real coverage by a third.
- **SAP Malaysia-localisation jargon on a client surface**, violating invariant 1.

**Why nothing caught it.** Every defence was green simultaneously:
- The vendor guard had no matching term — "MY"/"mandatory" were not on the list.
- MANIFEST's `with_flow: 726` was internally consistent and matched the data.
- `client_dataset_vendor_leaks: 0` was *true by its own guard list*.
- My PR-1 `hasFlow()` checked `flow.length > 0`, so a one-step fake passed.
- **My PR-1 tests encoded the bug**: "exactly 16 processes have no flow" and
  "every process with a flow carries a completeness badge" both passed, because
  the 181 sentinels had a fake flow *and* an `outline` badge.

The lesson generalises past this bug: **a dataset cannot certify itself.** Counts,
self-declared leak fields, and internal consistency all agreed while the content
was wrong. Only reading the actual content caught it.

**The fix (upstream, data-only re-emission — the pinned-data policy working as designed):**
- 181 sentinel flows removed (`flow` key deleted). Those processes now match the
  16 true no-flow ones: no flow, no completeness claim.
- `vendor-term-guard.json` gains `"no MY mandatory steps"` (24 terms).
- MANIFEST records `hash_algorithm` and adds `no_flow`; `meta` is now consistent
  with actuals, so D1's remnant is gone — the meta-is-informational stance stands.

**Corrected figures — supersedes every earlier "16 no-flow" note in this log:**

| | Before | After |
|---|---|---|
| with_flow | 726 (inflated) | **545** |
| no_flow | 16 | **197** (16 original + 181 de-sentinelled) |
| completeness | 223 / 177 / 326 | **223 detailed / 177 detailed+variants / 145 outline** (+197 none) |
| with_substeps | 400 | 400 (unchanged) |

### Data is FROZEN (re-pinned 2026-07-17)

The committed bytes are the pinned source of truth for this build:

```
discovery-library.client.json      35f9efe4e8ce7bfd
discovery-library.consultant.json  31feb5416252f702
vendor-term-guard.json             13c982041670dae7
```

Superseded pins (kept for provenance):
```
pre-flight   501559ae0d27a2a9 / dea4591d7e4a5a63 / 57749b0be400c9e2
first freeze 71d5a13aa7ca59de / 626f605fc732f494 / 57749b0be400c9e2
```

The next legitimate data change is a **post-pilot refresh, arriving as its own
data-only PR with a new MANIFEST** — never a silent swap. **If these bytes ever
change outside such a PR, treat it as a failure and stop.** The MANIFEST hash
assertion in CI is what enforces this.

Lessons carried into PR-1:
- Verification has a shelf life. The MANIFEST hash assertion is the only durable
  defence against drift — it is why CI checks hashes, not just counts.
- **Every count matched across the swap.** A counts-only guard would have passed
  straight through it. The hash caught it; nothing else would have.
- Any "data is final" claim should be pinned to a hash, not a date.

### Notes
- Brief says "16 of 654" no-flow; 654 is the pre-overlay `sap_base` count (654 + 88 overlay = 742). The 16 figure holds against actual data.
- `grep` hangs on the .dc files (minified long lines) — CI guard should scan with a line-length-tolerant reader, not plain grep.

## PR-1 · Data layer + guards — GREEN

Branch: `feat/neutral-discovery-data-layer` (off the artifacts branch — PR-1
imports the datasets, so basing on main would not compile).

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ (0 warnings) · `pnpm test` ✓
179 files / 3816 tests, no regressions · 46 new discovery tests ✓

**Shipped**
- `src/data/discovery/` — the 4 pinned artifacts, copied verbatim (hashes re-verified post-copy).
- `src/lib/discovery/schema.ts` — zod for both datasets. `meta` is typed `unknown`, making D1 a compile error rather than a convention.
- `src/lib/discovery/client-library.ts` — client loader. Imports the client dataset and nothing else. Owns `laneForRole()` (D3).
- `src/lib/discovery/consultant-library.ts` — consultant loader; derives completeness across the join (D2).
- `src/lib/discovery/serializers.ts` — the allowlist boundary. Field-by-field, never spread. No mapper accepts a `ConsultantProcess` — a compile-time wall. PR-6's client pack reuses these.
- `src/lib/discovery/guards.ts` — `NEUTRAL_DISCOVERY_ENABLED`, mirroring `isAffirmExternalEnabled()`.
- `src/types/discovery-data.d.ts` — D5.

**Amended 2026-07-17 (D6).** `hasFlow()` corrected; `coverageCounts()` added as
the single source for V1's stat row (computed, never `meta`/MANIFEST); the
placeholder-flow assertion added; and the PR-1 tests that encoded the sentinel
bug rewritten to the honest 545/197 split.

**The three guards**
1. **Vendor terms** (`tests/unit/discovery/vendor-terms.test.ts`) — whole-file regex, no shelling out (plain grep hangs on the minified .dc files). Client dataset: 0 hits / 23 terms. Includes counter-tests: the scan must detect a real term, must ignore "sapling", and the *consultant* dataset must come back dirty — if it ever reads clean, the scan is broken, not the data.
2. **MANIFEST** (`manifest.test.ts`) — counts + `sha256[:16]`, algorithm hardcoded with a comment (it is not recorded in the file). Hashes pinned as constants **and** checked against disk.
3. **Dependency boundary** (`dependency-boundary.test.ts`) — transitive import-graph walk from every `(external)` entry point.

**Deviations:** D5 only (see above). No new tokens, colors, or fonts. Data untouched.

### Notes for review
- **The MANIFEST guard pins hashes rather than only self-checking.** Self-consistency would have passed straight through this session's swap — data and MANIFEST changed together, and every count still matched. Only a pinned expectation catches that class of drift. A failure here with no data-only PR in flight means **stop**, not re-pin.
- **The boundary test walks transitively, not by grep.** The realistic leak is two hops: a shared helper imports the consultant loader, a client route imports the helper. A direct grep never sees it.
- **One honest gap:** the vendor-term scan over `app/(external)/d/**` and `components/discovery/**` currently scans **zero files** — those roots do not exist until PR-2. It passes vacuously today. Rather than fake a non-empty assertion, it is marked `it.todo("PR-2: assert CLIENT_SOURCE_ROOTS scan a non-empty file set")`. **PR-2 must close this**, mirroring the Affirm hex guard's non-empty self-check.

## Parity checklist

_Per screen · state · match/deviation · reason — populated per PR._

| Screen | State | Match / Deviation | Reason |
|---|---|---|---|
| _pending PR-2_ | | | |
