# Playbook: ABAP SQL Strict Mode and Clean-Core Readiness

**Not a Simplification Item.** This is a language-level playbook that rides
along with every other remediation: when you touch an SQL statement for KONV,
MATNR or VBUK, you modernise it once, in the same change.

It also covers pool and cluster **container** references (note **2577406**) and
the ABAP Cloud readiness angle (**`ABAP_CLOUD_READINESS`** variant,
Cloudification Repository).

Verified against the ABAP Keyword Documentation
([strict modes](https://help.sap.com/doc/abapdocu_750_index_htm/7.50/en-US/abenopensql_strict_modes.htm),
[7.40 SP05](https://help.sap.com/doc/abapdocu_751_index_htm/7.51/en-US/abenopensql_strict_mode_740_sp05.htm),
[7.50](https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/abenabap_sql_strictmode_750.htm)),
the [Simplification List 2025](https://help.sap.com/doc/0df2ffddebab40cf9338488b2f18dc41/2025.latest/en-US/SIMPL_OP2025.pdf)
§2.1.1, and the [Custom Code Migration Guide 2025](https://help.sap.com/doc/9dcbc5e47ba54a5cbb509afaa49dd5a1/2025.001/en-US/CustomCodeMigration_EndtoEnd.pdf).

---

## The rule that governs every fix in this playbook

**Strict mode is per statement, it is graded by release, and within a given
grade it is all-or-nothing.**

A statement enters a strict mode the moment it uses syntax introduced in that
release — and it enters *that release's* mode, not the newest one. This
distinction matters in practice:

| You write | Mode entered | So you must also obey |
|---|---|---|
| `@` host variables, comma lists | **7.40 SP05** | all `@` escaping, commas, client-column rules |
| `@DATA(...)` inline declaration | **7.40 SP08** | the above **plus** lossless-assignment and type-comparison rules |
| `FIELDS`, `UNION`, host *expressions*, GTT, CDS path expressions | **7.50** | the above **plus** `INTO` must be the last clause |

Two consequences your team will hit:

1. **`@DATA(...)` does not, by itself, force `INTO` to the end.** Outside the
   7.50 mode, `SELECT ... INTO TABLE @DATA(lt) WHERE ...` is legal ABAP. It is
   still worth writing `INTO` last as a house style — one shape, no thinking
   required — but do not tell a 20-year ABAP reviewer that the old order is a
   syntax error, because it is not, and they will know.
2. **`@DATA(...)` pulls in the 7.40 SP08 rules**, which people forget exists.
   Expect lossless-assignment and incompatible-type-comparison errors to appear
   the first time a team modernises with inline declarations. That is the mode
   doing its job, not a regression.

→ **Rewrite whole statements. Never modernise one clause.** Within a mode the
rules are not optional: half-escaped host variables in one statement is a
syntax error, not a partial improvement.

Also: **all strict modes require the program property "fixed point arithmetic"
to be active** (from 7.40 SP05 on). On an old Z-program where it is off,
turning it on is itself a change with numeric consequences — check before
assuming it is free.

## What strict mode enforces

There are **seven** strict modes: 7.40 SP05, 7.40 SP08, 7.50, 7.51, 7.52,
7.53, 7.54. They are **cumulative** — a later mode contains every earlier
rule. The three that matter for remediation work:

**7.40 SP05 mode:**

1. Anything that would be a syntax **warning** becomes a syntax **error**
2. All operand lists comma-separated — SELECT list, aggregates, expressions,
   `GROUP BY`, `ORDER BY`, `UPDATE ... SET`
3. Host variables prefixed with `@`
4. With an explicit comma list and no `DISTINCT`, every result column needs an
   identically-named component in the `INTO CORRESPONDING FIELDS` target
5. The client column must not appear in `ON`/`WHERE` unless implicit client
   handling is off
6. `CLIENT SPECIFIED` only for client-specific tables/views
7. With `FOR ALL ENTRIES`, no `STRING` / `RAWSTRING` / `GEOM_EWKB` / `LCHR` /
   `LRAW` in the SELECT list
8. Dynamic `FROM` + `ORDER BY PRIMARY KEY` on a **database view** raises
   `CX_SY_DYNAMIC_OSQL_SEMANTICS`
9. Obsolete short forms prohibited

**7.40 SP08 mode adds** (triggered by `@DATA(...)` inline declaration — i.e. by
the idiom in F1 below, so plan for these):

- Assignments that cannot be made losslessly become errors
- Comparisons between incompatible types become errors
- `AS tabalias` must be used in dynamic tokens
- Stricter `HAVING` / `GROUP BY` column rules

**7.50 mode adds:**

- **`INTO` must be the LAST clause of the SELECT** — but only in *this* mode.
  Triggered by 7.50 syntax (`FIELDS` after `FROM`, `UNION`, host expressions,
  GTT access, SQL expressions left of `WHERE`/`HAVING`, CDS path expressions,
  CDS table functions), **not** by `@` or `@DATA(...)`
- Host variables in `FETCH` / `CLOSE CURSOR` must be `@`-prefixed
- No column twice in `UPDATE ... SET`
- No `HAVING` without `GROUP BY` when the SELECT list is `*`
- No write operations on tables that have replacement objects
- CDS database views may not be accessed as obsolete data sources
- A literal read that cannot be lossless is a syntax error

## Detection

**ATC:** the readiness variants (`S4HANA_READINESS_2025` /
`S4HANA_READINESS_2025_NO_FLE`, or the release-independent `S4HANA_READINESS`)
carry the relevant checks, including
`Search problematic statements for result of SELECT/OPEN CURSOR without ORDER BY`.

**ABAP Cloud:** copy the **`ABAP_CLOUD_READINESS`** variant (e.g. to
`ZMY_ABAP_CLOUD_READINESS`); its key check is
**"Usage of Released APIs (Cloudification Repository)"**. Setup notes: 3284711,
3088062, 3507814, 3449860, 3565942, 3582797. The mapping content lives in
[SAP/abap-atc-cr-cv-s4hc](https://github.com/SAP/abap-atc-cr-cv-s4hc).

⚠️ **Check the check name on the client's SP level.** Note **3565942**
introduces replacement checks named **"Usage of APIs"** and **"Allowed
Enhancement Technologies"**, with a new data format. On a current SP you may
not find a check called "Usage of Released APIs" at all.

**Readiness-check setup notes** (needed before any of the above returns sensible
results): 2436688, 2364916, 2241080 (Simplification Database `CCMSIDB`),
2672703 (RFC user authorizations for remote ATC).

**⚠️ ATC cannot find everything, and SAP says so:** "ATC is not able to find all
potential issues (for example, dynamic coding is not covered by static code
checks)." Two runtime tools are **not optional** on a serious engagement:

- **SRTCM** (Runtime Check Monitor) in the productive system, with checks
  `Empty table in FOR ALL ENTRIES clause` and
  `Missing ORDER BY or SORT after SELECT` active
- **SQLM** (SQL Monitor): "Sort the SQL Monitor results by execution time and
  optimize the top 10-20 SQLs in your custom code which affect relevant
  business processes… this process needs to be repeated **2-3 times**."

Put SRTCM and SQLM in the client onboarding plan. Findings from them outrank
anything static analysis produces, because they come from real traffic.

---

## Fix patterns

### F1 — Whole-statement modernisation (mechanical)

Before:
```abap
SELECT vbeln posnr matnr
  INTO TABLE lt_items
  FROM vbap
  WHERE vbeln = lv_vbeln
    AND matnr IN s_matnr.
```

After:
```abap
SELECT vbeln, posnr, matnr
  FROM vbap
  WHERE vbeln = @lv_vbeln
    AND matnr IN @s_matnr
  INTO TABLE @DATA(lt_items).
```

Rules:
- Commas, `@` on every host variable, `INTO` last — all three or none.
- `@DATA(...)` inline declaration only where the old explicit type is not
  needed elsewhere; otherwise keep the declared table and use `INTO TABLE @lt_x`.
- Confirm fixed-point arithmetic is active on the program.

### F2 — `INTO CORRESPONDING FIELDS` with a name mismatch

Strict-mode rule 4 turns a previously-tolerated mismatch into an error. From
7.40 SP05 the field assignment is resolved **at program generation**, which lets
the system optimise the SELECT list actually sent to the database — so fixing
this is a performance win, not just compliance.

Before:
```abap
SELECT * FROM vbap INTO CORRESPONDING FIELDS OF TABLE lt_out WHERE ...
```

After — name the columns you actually want:
```abap
SELECT vbeln, posnr, matnr, kwmeng
  FROM vbap
  WHERE ...
  INTO CORRESPONDING FIELDS OF TABLE @lt_out.
```

### F3 — Pool and cluster container references (note 2577406)

From S/4HANA **1809**, table pools and table clusters (object type `R3TR SQLT`,
e.g. `ATAB`, `CDCLS`) are **removed**. SAP: "If references to table pools and
table clusters are not removed, **syntax errors will show up** in coding with
such references after the upgrade or conversion to release 1809."

**Calibrate the expectation before you scope this.** SAP's own position is that
such references are *"typically rare. ABAP coding normally deals with the
logical tables… and not with the container tables"*, and that *"pure type
references can be replaced by references to the fields of the logical tables"*.
The pool/cluster **tables** themselves are transformed to transparent tables by
SUM automatically. So: usually a small number of type-reference swaps,
occasionally a genuine redesign — not a blanket blocker. Find the real count
before you put an estimate on it.

Also removed: tables `DD06L`, `DD06T`, `DD16S`; views `DD06V`, `DD06VV`,
`DD16V`.

How to find them:
- Cross-reference table `WBCROSSGT` (version-number component `TY`) against your
  `SQLT` object list from `TADIR` (`program id = R3TR`, `object type = SQLT`).
  Prerequisite note **2234970** for correctly filled cross-reference tables.
- Or, on ABAP Platform 1709 / SAP_BASIS 752+, the Code Inspector variant
  **"Pools/Cluster-Types used in Programs"** — no manual object list needed.

**⚠️ Do not confuse table clusters with export/import tables** (`INDX`, `STXL`,
used by `EXPORT ... TO DATABASE`). Those are **still supported**. This
mis-identification wastes real effort on every project that makes it.

### F4 — Missing `ORDER BY` (looks mechanical; is not)

`SELECT` without `ORDER BY` on HANA returns rows in genuinely nondeterministic
order. On the old database it was accidental-but-stable, so the code worked for
fifteen years.

**Adding `ORDER BY` is not a mechanical fix.** You are choosing the sort key,
and the wrong key silently changes report output, ATP sequencing, numbering, or
which record "wins" a `READ TABLE ... INDEX 1`.

Rules:
- Take the finding from **SRTCM in production**, not from static analysis —
  SRTCM tells you the statement actually mattered.
- The sort key needs a functional owner's confirmation. Record who confirmed it.
- Where an internal `SORT` already follows the SELECT, that may be sufficient —
  read before adding a second ordering.

### F5 — `FOR ALL ENTRIES` with a possibly-empty driver table

An empty driver table means the `WHERE` condition is dropped and **all rows are
returned**. This is a data-exposure and runtime bug, not a style issue, and
static analysis cannot see whether the table can be empty.

```abap
IF lt_driver IS NOT INITIAL.
  SELECT ... FOR ALL ENTRIES IN @lt_driver ...
ENDIF.
```

Add the guard wherever emptiness is possible. Confirm against SRTCM findings.

### F6 — ABAP Cloud API substitution (design work, not remediation)

For ABAP for Cloud Development, access to SAP-delivered objects is restricted to
**released** objects; direct table access to non-released tables fails
(`SELECT ... FROM spfli` and similar), and deprecated statements (`MOVE ... TO`,
`GET REFERENCE OF`, `DESCRIBE TABLE ... LINES`) are removed from the language
version. Development is ADT-only.

The released CDS entity is **rarely a field-for-field match** for the old table
(e.g. `I_SlsPrcgConditionRecord` vs `KONV`). Every substitution needs a semantic
gap analysis. **Treat F6 as design, estimate it as design, and never let it be
counted as a remediation line item.**

---

## Mechanical vs. escalate — the split for this playbook

**Mechanical (safe to auto-propose):**
`@` on host variables · comma-separated lists · `INTO` moved last ·
explicit field lists replacing `SELECT *` where the target is known ·
type references to now-transparent former pool/cluster tables

**Escalate to functional / architecture:**

| Pattern | Why |
|---|---|
| Adding `ORDER BY` (F4) | You are choosing semantics. Highest-risk "mechanical-looking" fix in the entire S/4HANA set |
| `FOR ALL ENTRIES` emptiness (F5) | Silent all-rows behaviour; needs runtime evidence |
| Removing `CLIENT SPECIFIED` / cross-client reads | Almost always a deliberate cross-client design |
| `SELECT ... ENDSELECT` → array fetch | Changes the memory profile; a naive conversion can blow up on large result sets. Package size or CDS pushdown may be the right answer |
| ABAP Cloud API substitution (F6) | Design work with a semantic gap per object |
| Anything dynamic (dynamic table names, dynamic WHERE, generated programs) | Invisible to ATC; needs code reading and test coverage |

## Review checklist (human gate — every object)

- [ ] Whole statement rewritten, not partially modernised
- [ ] Fixed-point arithmetic active on the program
- [ ] Any added `ORDER BY` has a named functional owner who confirmed the key
- [ ] `FOR ALL ENTRIES` emptiness guards added where the driver can be empty
- [ ] Pool/cluster references removed — and export/import tables (`INDX`,
      `STXL`) *not* touched by mistake
- [ ] Syntax-checked via ADT (`abap_syntax_check`) after the change
- [ ] Performance-sensitive statements cross-checked against SQLM data
- [ ] Change in the remediation transport, logged with the driving item

## Estimation guidance

**No SAP-published effort figures.** Our estimating basis:

| Pattern | Effort per occurrence (incl. review) |
|---|---|
| F1 when done inside another fix (KONV/MATNR/VBUK) | ~0 marginal — this is why we bundle it |
| F1 standalone | 0.15–0.4 h |
| F2 | 0.25–0.75 h |
| F3 pool/cluster type reference (the usual case) | 0.25–0.5 h |
| F3 pool/cluster genuine container access (rare) | 1–4 h, may be a redesign |
| F4 ORDER BY | 0.5–2 h + functional confirmation |
| F5 FOR ALL ENTRIES guard | 0.25–0.5 h |
| F6 ABAP Cloud substitution | Design estimate, not a remediation line |

**Bundle F1 into every other playbook's fix.** Modernising the statement while
it is already open is close to free; coming back for it later is a second
review, a second transport, and a second regression test.

## Provenance

**SAP-verified:** the strict-mode ladder, rule lists and trigger conditions
(ABAP Keyword Documentation) — including that `INTO`-must-be-last belongs to
the 7.50 mode only and is *not* triggered by `@` or `@DATA(...)`; the
fixed-point-arithmetic prerequisite; SAP's "typically rare" characterisation of
pool/cluster container references; note 2577406
and the pool/cluster removal, including the `INDX`/`STXL` exception and the
`WBCROSSGT` detection method; note 2234970; the ATC variant and check names;
the `ABAP_CLOUD_READINESS` variant and its setup notes; the SRTCM check names;
the SQLM quotation; the ABAP Cloud restrictions.

**Deliberately NOT claimed as SAP-mandated:** `SELECT ... ENDSELECT` and a
blanket ban on `SELECT *`. Neither appears in a strict-mode rule list or the
Simplification List. They are performance/clean-code recommendations — position
them as such, not as conversion blockers. Over-claiming here is the fastest way
to lose credibility with a 20-year ABAP reviewer.

**Our judgment:** the F1–F6 grouping, the bundling rule, the house style of
always writing `INTO` last, and the effort ranges.

**Correction history:** an earlier draft of this playbook stated that `@`
drags a statement into the 7.50 "`INTO` must be last" rule. That is wrong —
strict modes are graded per release. It was caught in fact-checking before the
playbook was used. Recording it here because that specific claim, stated
confidently to an experienced ABAP reviewer, would have cost the tool its
credibility in one sentence.
