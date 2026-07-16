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
| D11 | **The .dc's V2 search has no empty state.** An unmatched query hides every workflow section, leaving the reviewer looking at a fit bar, a search box and nothing else — with no explanation. It reads as a broken page. | Added an honest empty state ("No processes match '…'. Try a shorter search, or clear it to see the whole stream.") plus an `aria-live` result count, since a list that silently re-filters is invisible to a screen reader. The brief specifies neither; this is the smallest honest fix rather than an invention of scope. |
| D10 | **The vendor-term guard scans comments, not just rendered strings** — and it fired on my own code twice: a comment quoting Affirm's landing copy (which names a product), and the phrase "enumeration **oracle**", where the ordinary security term collides with the vendor `Oracle`. | **Keep the guard strict; rephrase the prose.** Comments never render, so these were harmless — but exempting comments means parsing them out, and the parser becomes the thing that can be wrong. A guard that occasionally makes you reword a comment is cheap; a guard with a hole in it is not. Noted here so the next person hits the `Oracle`/"oracle" collision knowingly rather than fighting it. |
| D9 | **The brief specifies no landing or verify screen** — its V1–V5 are all post-verify surfaces, and the .dc prototype starts at V1. But the journey needs an entry point. | Structure mirrors Affirm's landing/verify exactly. Copy is discovery's own, because Affirm's headline names a vendor product and invariant 1 forbids that here. The brief's §10 verbatim promises are used where they fit ("Your business on one page…", "See how the standard runs your process…", "Nothing is committed…"). Legal versions are discovery-specific (`discovery-pdpa-v1`), not Affirm's — pinning a grant to `affirm-pdpa-v1` would record consent to a notice the reviewer never read. |
| D8 | **The mode switch (Present · Explore · Export) is not rendered in PR-2a.** | Brief §7 puts it in the shared chrome, but Present and Export are PR-3. A switch whose other two segments route nowhere is worse than no switch, and the "stub with the toast pattern" instruction can't be honoured: the .dc defines `flashToast` but **never calls it**, so the prototype supplies no toast copy — stubbing would mean inventing client-facing copy, which the plan forbids. It ships with the modes in PR-3. |
| D7 | **`cookies.ts` mirrored, not parameterized** (deviation from the approved option). | The Affirm file is marked *"Contractual — change requires security review"*. Threading a name/path argument through it would edit security-reviewed code for no functional gain; the constants are the only difference. Approved retroactively. |
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

## Standing policy (approved)

These are settled and apply to the rest of the build:

1. **`coverageCounts()` is the only display source.** MANIFEST is integrity-only — an anchor, not a number to show a client. Conflating the two is how 726 nearly shipped.
2. **The MANIFEST guard cross-checks `hash_algorithm`** against its own hardcoded constant. A manifest trusted to declare its own algorithm can be swapped wholesale.
3. **No self-certifying fields.** CI computes cleanliness; it never reads a claim of it. (`client_dataset_vendor_leaks: 0` was true by its own guard list while 181 jargon strings sat in the data.)
4. **Data corrections arrive as data-only re-emissions**, never local edits; a hash change outside one is a failure — stop, do not re-pin.
5. **5 discovery tables incl. `DiscoveryEngagement`** (approved — grants need a parent, and derived sealed state needs somewhere to live).
6. **`cookies.ts` mirrored, not parameterized** (D7).
7. **The migration is hand-written and verified against `prisma migrate diff`, but has NEVER run against a real Postgres** — first preview-env task.
8. **Affirm's "bundle" wording in the shared lockout email is accepted** — consultant-facing, one word, not worth forking a template over.

## The .dc prototype is not the spec

The brief wins, and this is the standing frame for every row below: the `.dc` is a
**verified prototype**, not a design intent. Three of its properties are scaffolding
that must never ship, and they are not "conflicts" so much as artefacts:

- **Source-to-Pay-only modeling.** 23 processes loaded; the other 7 streams render a
  "not modeled in this prototype pass" note. We render **all 10 streams / 742
  processes** from the loader.
- **Hardcoded stats** (654 / 638 / 55 / 8) — pre-overlay figures. We read
  `coverageCounts()`: **742 / 545 / 60**.
- **Fixture client** ("Asia Meals Group"). Client identity comes from the session.

### The 35 resolutions

| # | Conflict | Winner | Rationale |
|---|---|---|---|
| 1 | V1 coverage chips: brief "654 / 638 / 60 industry-specific" vs .dc "654 / 638 / 55 workflows · 8 streams" | **Neither — the loader** | Both are prototype-era. `coverageCounts()` gives 742/545/60. The brief's *third* tile (60 industry-specific) matches our data exactly; its first two are its own numbers brought up to date. |
| 2 | V1 states: brief (a) fresh (b) mid (c) all-reviewed teal banner (d) Present (e) Export (f) skeleton vs .dc mid-progress only | **Brief** | (a)(b)(c)(f) built in 2a; (d)(e) are PR-3. §12.8: "skeleton is first-class, not an afterthought". |
| 3 | V1 ribbon: brief horizontal connected segments + per-stream fit bar, vertical on mobile vs .dc always-vertical, no fit bar | **Brief** | Fit bar added per §6/17; 2-col grid at `lg`, stacked below. |
| 4 | V1 heatmap: brief 15% fill + hover/tap + print-safe label+pattern vs .dc solid 100% + `title=` only | **Brief** | 15% via `color-mix`. `title=` is hover-only (invisible to touch/keyboard) — cells are real buttons with the count in the accessible name and an `aria-live` detail line. Pattern is PR-3 (Export). |
| 5 | V2 stream H1 support line | **Brief** | PR-2b. |
| 6 | V2 stream-level fallback: .dc replaces the whole index with a prototype-scope note | **Brief** | Scaffolding — does not ship. All streams are real. |
| 7 | V2 stream-complete teal banner | **Brief** | PR-2b. |
| 8 | V3 flow: brief START/END nodes, cross-lane elbow arrows, >12-step pagination vs .dc none | **Brief** | PR-2b. |
| 9 | V3 footnote: brief exact string vs .dc appends "Click a step for detail." | **Brief** | Verbatim §6/19. PR-2b. |
| 10 | V3 promise "See how the standard runs your process…" — absent from .dc | **Brief** | §10 verbatim. Used on the landing (D9); also V3 in 2b. |
| 11 | V3 fallback copy: §7 "No step flow catalogued for this process" vs §10 "No step flow is catalogued for this process yet — we'll map it with you." | **Brief §10** | The .dc already uses the §10 form; §10 is the verbatim-promise section. PR-2b. |
| 12 | V3 provenance: §6/12 "SOURCE: … · CURATED BY ABEAM · RENDERED PRODUCT-NEUTRAL" (mono 10 UPPERCASE, no second sentence) vs §10 sentence-case + "The process is yours; the reference names no vendor." | **§10 for the string, §6/12 for the style** | The brief conflicts with *itself*, not just the .dc. §10 is the "use exactly" list and wins the string — its second sentence is the product-agnostic promise stated out loud, and dropping it guts the line. §6/12 wins the style: mono, 10px, muted, shown never hidden. **Not force-uppercased** — shouting a two-sentence promise mangles it, and §6/12's uppercase was written for its own shorter form. |
| 13 | Appendix A wireframe shows a vendor citation + product-mapping overlay on V3 | **Brief §12.6** | The brief self-conflicts; §12.6 is the hard rule and the .dc correctly omits both. Client views never show product mapping. |
| 14 | Fit chip helper captions (4, per §9) — absent from .dc | **Brief** | PR-2b. |
| 15 | Chip label: §9 table "We do this differently" vs §9 legend + Appendix A + .dc "We differ" | **BOTH — corrected in PR-2b** | ~~Originally resolved to "We differ" everywhere.~~ **That was wrong.** Reading §9 in full: its table's "Chip label" column is the selector's authority and says **"We do this differently"**; §6/17's fit-bar legend, Appendix A and V4's bucket say **"We differ"**. Two contexts, not a conflict — a 160px chip the reviewer clicks and a compact legend row have different jobs. `fit.ts` now carries `FIT_CHIP_LABELS` (selector) and `FIT_LABELS` (legend/bucket/heatmap), both asserted verbatim. |
| 16 | "Not applicable" dims the row | **Brief** | PR-2b. |
| 17 | Differ requires a reason before summary counts it complete | **Brief** | PR-2b. Server keeps `reason` nullable so a partial write preserves the selection and the summary counts it incomplete — losing the reviewer's click would be worse. |
| 18 | Autosave tick + `aria-live` | **Brief** | PR-2b (rides with the selector). |
| 19 | V4 eyebrow needs `{DATE}` | **Brief** | PR-2b. |
| 20 | V4 stat strip order/labels | **Match** | Both agree. |
| 21 | V4 per-stream fit bars | **Brief** | PR-2b. |
| 22 | V4 bucket bands: brief 15% + serif 28 vs .dc 12% + serif 24/26 | **Brief** | 12% is outside §2's permitted alpha steps. PR-2b. |
| 23 | V4 bucket order | **Match** | Both agree. |
| 24 | Type ramp: V4 stat 26 / label 10px are off-ramp in the .dc | **Brief §3** | PR-2b. |
| 25 | Radii: .dc adds 3/5/6px beyond §2's 8/12/10/9999 | **Brief, with §6/2 for the chip** | §6/2 explicitly specifies "radius 5" for the scope chip, so the brief self-conflicts; §6 wins for that one element. The 6px heatmap cell is retained (it is the .dc's only sane fit at 22px height) — logged as a knowing deviation. |
| 26 | A11y: .dc has zero focus styles, chips are `<button>` not radiogroup, `outline:none` on inputs | **Brief §11** | The debt the plan exists to close. 2a ships focus rings, landmarks, `aria-live` on progress, 44px targets, 16px inputs. Radiogroup lands with the selector in 2b. |
| 27 | Motion: .dc hardcodes `.1s/.2s`, no reduced-motion | **Brief §2** | Uses `--dur-calm`/`--ease-calm` tokens + `motion-reduce:` variants. |
| 28 | Icons: .dc uses `◀ ▶ ⚑` glyphs | **Brief §12.4** | Inline stroke SVG. Affects PR-3's facilitator bar mostly. |
| 29 | Mode-switch keyboard `P/E/X` | **Brief** | PR-3, with the modes (D8). |
| 30 | Breadcrumb shape | **Equivalent** | .dc's STREAM / WORKFLOW + chip + name conveys §5's requirement. PR-2b. |
| 31 | Present H1 44/52 + 20px floor; .dc's facilitator bar is 12–13px | **Brief** | PR-3. |
| 32 | Process naming: brief's illustrative "Requisition to Pay" vs .dc's real catalogue data ("Requisitioning", 18J) | **The loader** | Neither is authoritative for *content* — the committed dataset is. The brief's *copy* strings still win. |
| 33 | Present ←/→ moves steps (brief) vs processes (.dc) | **Brief** | PR-3. |
| 34 | Content max-width 1040 / 1280 Present | **Match** | Explore is 1040 here. |
| 35 | Present "Park" as its own action vs .dc aliasing it to `discuss` | **Brief** | PR-3. Note: if Park and Discuss stay the same state, the brief's distinction is cosmetic — flag for PR-3. |

## PR-2a · Guest infra + entry + V1 — GREEN

Branch: `feat/neutral-discovery-guest-v1`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (77 discovery tests).

**⚠ The e2e gates are WRITTEN BUT UNVERIFIED in this environment.** No Postgres is
reachable (`P1001` on localhost:5432), and `tests/e2e/global-setup.ts` opens a Prisma
client before any spec runs — so every Playwright spec fails at setup, including the
flag-off one, which needs no database of its own. Attempting it returned
`PrismaClientInitializationError`, exit 1.

This log briefly claimed "flag-off e2e ✓". That was wrong: the shell pipeline's exit
status masked the failure and I read it as a pass. Corrected here rather than
quietly. **The e2e evidence for PR-2a is outstanding and must be produced in an
environment with a database** — alongside the migration, which has still never been
executed (standing policy 7).

Compensating control added: `tests/unit/discovery/flag-gate.test.ts` statically
asserts that every route module under `app/(external)/d/**` is flag-gated. It runs
with no database and catches the realistic regression (a new /d route that forgets
its check). It is not a substitute for the e2e — it proves the check is *present*,
not that the response is *404*.

**Closed:** PR-1's `it.todo` — the vendor scan now covers `app/(external)/d/**` and
`components/discovery/**` with a non-empty self-check, so it can no longer pass
vacuously. It caught two real hits in my own code on first run (D10).

**Decisions write path:** the `DiscoveryDecision` table, the read path
(`decisionsForEngagement`), and the whole V1 fit-mix arithmetic ship in **2a**. The
**write** path — the fit selector — is **2b**. So V1's fresh/mid/all-reviewed states
are live and correct today; they simply always read `fresh` until 2b lands a way to
decide anything.

## PR-2b · V2 / V3 / V4 + the fit selector — GREEN

Branch: `feat/neutral-discovery-explore-v2`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (104 discovery tests).

**⚠ e2e written, not executed** — same environment limit as 2a (no Postgres;
`global-setup` opens Prisma before any spec). `discovery-explore.unauth.spec.ts`
covers the full journey incl. one differ-with-reason, one N/A, the radiogroup
arrow-key contract, the no-flow fallback, the sealed 409, and axe on V2–V4. It
gates in preview. **Do not read "GREEN" as "the journey has run."**

**The a11y debt is closed.** The fit selector is a real radiogroup: `role="radiogroup"`
labelled by the prompt, `role="radio"` + `aria-checked` per chip, **roving tabindex**
(one tab stop for the group, arrows move within it, wrapping, Home/End), visible
focus everywhere, `aria-live="polite"` autosave tick. Chips are managed buttons
rather than native radios because native `<input type=radio>` cannot carry the
brief's two-line label+caption chip without label gymnastics.

**Flow diagram** (§6/19) built properly: role lanes with the System / Automatic
fallback, START/END nodes, and **cross-lane elbow connectors**. The geometry needs
no DOM measurement — lane rows are a fixed uniform height, so a connector's elbow
is derived from lane indices alone and renders correctly on the server, no refs or
effects. Flows over 12 steps wrap into bands (§6/19's "Explore wraps to rows").

**Compensating unit coverage** for what e2e can't prove here: `decisions.test.ts`
(upsert key, reason-trimming, reason-clearing on state change, the differ gate)
against a mocked client, and `copy.test.ts` asserting every §10 verbatim string
character-for-character — so a well-meaning tweak to a client promise fails CI.

### New in PR-2b

- **Conflict #15 corrected** — see the table. The chip and the legend carry
  different labels, both from the brief.
- **Conflict #12 refined** — the brief conflicts with itself on provenance; §10
  wins the string, §6/12 the style.
- **D11** — the .dc's search has no empty state; added one.

## Parity checklist

| Screen | State | Match / Deviation | Reason |
|---|---|---|---|
| V2 `/d/stream/[id]` | default | **Deviation — brief** | All 10 streams real; support line added (#5); no prototype scaffolding |
| V2 | search / no match | **Deviation — D11** | .dc has no empty state; added one + `aria-live` count |
| V2 | stream-complete | **Built from brief** | Teal 15% banner (#7) |
| V2 | sealed | **Built from brief** | .dc models none |
| V2 · process card | full / fallback / N/A | Match + §11 | Fit dot always paired with its label; N/A dims the row (#16) |
| V3 `/d/process/[pid]` | undecided | Match | Chips unselected, no reveal box |
| V3 | decided-standard | Match | standard-means box, verbatim |
| V3 | differ-with-reason | Match + gate | Expectation note verbatim; incomplete state surfaced (#17) |
| V3 | discuss-parked | Match | navy-soft note, verbatim |
| V3 | not applicable | Match | No box; row dims on the V2 card |
| V3 | **fallback (197 no-flow)** | Match | Honest panel; selector still available (§7 V3(e)); never an empty diagram |
| V3 · flow | ≤12 steps | **Built from brief** | START/END + cross-lane elbows (#8) — .dc has neither |
| V3 · flow | >12 steps | **Built from brief** | Wraps into bands (#8) |
| V3 · flow | blank roles | Match | System / Automatic lane |
| V3 · sub-step drill | expanded / empty | Match | Optional markers; "No further detail captured for this step." |
| V3 · provenance | all | **Deviation — §10 over §6/12** | Keeps "the reference names no vendor"; mono style, not uppercased (#12) |
| V3 · selector | all four + sealed | **Built from brief** | Real radiogroup + helper captions (#14, #26) |
| V4 `/d/summary` | live | Match | Stat strip from live decisions; serif 28 (#24) |
| V4 | incomplete differs | **Built from brief** | §9 honest gap capture, surfaced explicitly |
| V4 · buckets | populated / empty | **Deviation — brief** | 15% bands + serif 28 (#22); reason inset keeps its amber border |
| V4 · per-stream fit bars | all | **Built from brief** | .dc omits entirely (#21) |
| V4 · eyebrow | all | **Built from brief** | `{DATE}` added (#19) |
| V4 · export CTA | stub | **Deferred to PR-6** | Rendered disabled with an explanation, not a live button that does nothing |
| Landing `/d/[token]` | default | Deviation — copy is discovery's own | Brief specifies no landing (D9); §10 promises used verbatim |
| Landing | invalid/revoked/superseded/sealed | Match | Four guards → one terminal; never reveals which |
| Verify `/d/verify` | default / invalid / expired / rate-limited / exhausted | Match | Mirrors Affirm; OtpInput reused unchanged |
| Terminal `/d/expired` | default | Match | Polymorphic; `GuestTerminal` reused |
| Terminal `/d/ended` | default | Match | Friendly sign-out variant |
| V1 `/d/home` | (a) fresh 0% | **Built from brief** | .dc models no fresh state |
| V1 | (b) mid-progress | Match | Ribbon segments + rings |
| V1 | (c) all-reviewed | **Built from brief** | Teal banner, verbatim: "Every stream reviewed — ready for the workshop." |
| V1 | (f) skeleton | **Built from brief** | .dc models none; `Suspense` fallback mirrors real geometry |
| V1 | sealed / read-only | **Built from brief** | Derived `state != "issued"`; .dc models no sealed state |
| V1 · coverage row | all | **Deviation — loader, not .dc** | 742/545/60 vs .dc's 654/638/55·8 |
| V1 · ribbon | untouched / in-progress / reviewed | **Deviation — brief** | Per-stream fit bar added; reviewed gets its own teal treatment |
| V1 · heatmap | all | **Deviation — brief** | 15% fill; real buttons + `aria-live` instead of `title=` |
| V1 · what-happens-next | current=1 | Match | Ordered list; connectors decorative |
| V1 · mode switch | — | **Deferred to PR-3** | D8 — no toast copy exists to stub with |
