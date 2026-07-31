# Playbook: SD Status Tables and Document Flow — VBUK / VBUP / VBFA

**Simplification Items:**
`S4TWL - SD Simplified Data Models` (component SD-BF-MIG) — **Business Impact
note 2267306**; and `S4TWL - VBFA - Indirect Docflow Relationships` —
**Business Impact note 2469315**.

**Custom-code cookbooks (pull the attachments, they are the real content):**
- **Note 2198647** — "S/4 HANA: Data Model Changes in SD". 14+ numbered cases
  for VBUK/VBUP remediation.
- **Note 2470721** — VBFA / STUFE adaptation cases.
- **Note 2418242** — VBFA reconstruction report + correction instructions.
- **Note 2224436** — conversion pre-check (class `CLS4H_CHECKS_SD_DATA_MODEL`),
  relevant **up to target release 1610**; from 1709 the append-field check runs
  inside SUM in phase `ACT_UPG`.

Verified against the [Simplification List for SAP S/4HANA 2025 FPS1](https://help.sap.com/doc/0df2ffddebab40cf9338488b2f18dc41/2025.latest/en-US/SIMPL_OP2025.pdf)
§§11.1.9 and 11.1.12.

---

## The trap that makes this pattern dangerous

**VBUK and VBUP still exist in S/4HANA. They are simply no longer filled.**

`SELECT ... FROM vbuk` **compiles cleanly, dumps nothing, and returns zero
rows.** There is no syntax error to catch it. A report silently returns
nothing; a status check silently concludes "not delivered"; an interface
silently ships an empty file. This is materially worse than a dropped table.

Worse still, pre-conversion rows can remain physically present in VBUK/VBUP
after conversion (SAP KBA **3563944**), so a smoke test on historical data can
*pass* while every new document fails. **Never accept "we tested it and it
returned rows" as evidence that a VBUK read is fine.**

## What changed

- **Status tables eliminated.** "Status fields have been moved to the
  corresponding header and item tables — VBAK and VBAP for sales documents,
  LIKP and LIPS for deliveries, VBRK for billing documents."
- **Document flow table VBFA simplified** (see §VBFA below).
- **SD document category widened:** data element `VBTYP` (CHAR 1) replaced by
  `VBTYPL` (CHAR 4); field `VBTYP_EXT` (CHAR 4) eliminated. This one produces
  **hard syntax errors**, so it surfaces immediately.
- **Document index tables eliminated:** VAKPA, VAPMA, VLKPA, VLPMA, VRKPA,
  VRPMA. Rebate index **VBOX** and LIS tables **S066/S067** also gone
  (notes 2267377, 2270544 — functionally redesigned areas, not code fixes).

### Where the status fields went

| Was | Now | Status include structure |
|---|---|---|
| VBUK (header) | **VBAK** (sales), **LIKP** (delivery), **VBRK** (billing) | `VBAK_STATUS`, `LIKP_STATUS`, `VBRK_STATUS` |
| VBUP (item) | **VBAP** (sales item), **LIPS** (delivery item) | `VBAP_STATUS`, `LIPS_STATUS` |

The fields keep their original names (`GBSTK`, `LFSTK`, `WBSTK`, `GBSTA`,
`LFSTA`, `WBSTA`, …). *Field-name lists circulating in blogs are DDIC-reference
sourced, not SAP-published — read the actual `*_STATUS` include in the client's
system rather than trusting a list.*

### SAP's documented replacement is read function modules, not a view

Unlike Finance (ACDOCA and friends, which got compatibility views), the
documented replacement path here is **read function modules**. We could not
find any SAP statement that a VBUK/VBUP compatibility view exists, and none
appears in the Simplification List — but treat "there is definitively no such
view" as our reading, not as an SAP statement, and check in-system before
asserting it to a client.

- `SD_VBUK_READ_FROM_DOC` — read VBUK-equivalent data from VBAK/LIKP/VBRK
- `SD_VBUK_READ_FROM_DOC_MULTI` — the multi-document variant

These honour correctly-placed custom append fields. *An item-level equivalent
(`SD_VBUP_READ_FROM_DOC`) is **unverified** — check in-system before citing it
to a client.*

## Custom append fields on VBUK/VBUP — get this wrong and data is lost

SAP's rule, verbatim:

> "Each append field must have **the same name and the same data type** as it
> does in the source table, and each one has to be appended to the
> **table-specific status include structure** (VBAK_STATUS, LIKP_STATUS,
> VBRK_STATUS, VBAP_STATUS or LIPS_STATUS). **Only then** will the field be
> considered by the automatic data conversion… **Do not** choose a different
> field name or data type. **Do not** append the field directly to the document
> table."

Two blind spots in SAP's own SUM check (from target release 1709 onward) that
you must cover manually:

1. It **only finds `Z*` / `Y*` namespace appends.** A partner namespace append
   (`/ABC/...`) is silently missed.
2. It is **skipped entirely** if an SPDD transport is already integrated into
   the conversion.

→ **Do a manual inventory of VBUK/VBUP appends. Do not rely on the tool.**

## Detection

**ATC checks** (S/4HANA readiness variant):

| Check | Flags |
|---|---|
| `S/4HANA: Search for database operations` | VBUK, VBUP, VBFA (also KONV, BSEG) |
| `S/4HANA: Search for usages of simplified objects` | VBTYP |
| `S/4HANA: Search for S/4 related syntax errors` | VBTYP |

**Clear the syntax-error check group first** — those are hard breaks (the
CHAR1→CHAR4 VBTYP change) and everything else is easier to read once they are
gone.

Independently grep for:

1. `FROM vbuk` / `FROM vbup`, including joins and `FOR ALL ENTRIES`
2. `INSERT`/`UPDATE`/`MODIFY`/`DELETE` on vbuk/vbup → always F5
3. `TYPE vbuk` / `TYPE TABLE OF vbuk` / `TYPE vbup`
4. `TABLES: vbuk`
5. `FROM vbfa` without a `STUFE` restriction → see F4
6. `VBTYP` typed as CHAR 1, literals compared against a 1-char document category
7. Custom DDIC views over VBUK/VBUP → F5 (cookbook cases 13–14)

---

## Fix patterns

### F1 — Status read where the document row is already being read (highest volume)

Cookbook cases 1–2. The code already selects VBAK/VBAP/LIKP/LIPS/VBRK and then
does a second SELECT on the status table. Collapse the two.

Before:
```abap
SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = lv_vbeln.
SELECT SINGLE gbstk lfstk FROM vbuk INTO (lv_gbstk, lv_lfstk)
  WHERE vbeln = lv_vbeln.
```

After:
```abap
SELECT SINGLE vbeln, gbstk, lfstk
  FROM vbak
  WHERE vbeln = @lv_vbeln
  INTO @DATA(ls_vbak).
```

Rules:
- One SELECT instead of two — this is exactly the change SAP made the model for.
- Modernise the statement to strict-mode ABAP SQL while you are in it
  (see `playbooks/open-sql-strict-mode.md`); do the syntax work once.
- Quick Fixes exist for many of these. Read every diff.

### F2 — Status read where the document type is statically known

Cookbook case 3. The code reads VBUK but you can see from context that it only
ever handles, say, deliveries. Switch to the one correct table.

Before:
```abap
SELECT * FROM vbuk INTO TABLE lt_vbuk
  FOR ALL ENTRIES IN lt_likp
  WHERE vbeln = lt_likp-vbeln.
```

After:
```abap
SELECT vbeln, gbstk, wbstk, kostk
  FROM likp
  FOR ALL ENTRIES IN @lt_likp
  WHERE vbeln = @lt_likp-vbeln
  INTO TABLE @DATA(lt_status).
```

Rules:
- **Check the actual `*_STATUS` include before naming fields.** The five
  includes are not symmetric. `LFSTK` ("Delivery Status, All Items") is in
  `VBAK_STATUS` — the *sales order* header — and does **not** exist in
  `LIKP_STATUS`; selecting it from LIKP is a syntax error. `VBRK_STATUS` has
  only a handful of fields. Assuming the VBUK field list carries over
  unchanged to every successor table is the most common error in this pattern.
- The claim "only ever deliveries" must be **evidenced in the review comment**,
  not assumed. If you cannot evidence it, it is F5.
- `FOR ALL ENTRIES` over an empty driver table returns **all rows**. If the
  original had no emptiness guard, add one — and see the Open SQL playbook.

### F3 — Read function module where the document type is genuinely dynamic

Where the code legitimately handles more than one category and the mapping is
resolvable at runtime, call the SAP-provided reader rather than rebuilding the
CASE logic:

```abap
CALL FUNCTION 'SD_VBUK_READ_FROM_DOC'
  EXPORTING  iv_vbeln = lv_vbeln
  IMPORTING  es_vbuk  = ls_vbuk       " check the actual signature in-system
  EXCEPTIONS OTHERS   = 1.
```

Rules:
- **Verify the interface in the client's system** — signatures differ by
  release and the FM list above is what we could confirm, not a contract.
- This preserves custom append fields, which a hand-written CASE will not.

### F4 — VBFA and the STUFE field

Read this before touching any VBFA code. The history is non-obvious:

- Early S/4HANA releases **removed** `STUFE` from VBFA. Only direct
  relationships were stored; indirect ones were **deleted during conversion**.
- `STUFE` was **re-introduced** as of **1709 SP00 / 1610 SP02 (FPS2) /
  1511 SP04**, or via correction instructions in note **2418242**.
- SAP's own wording: "The table VBFA and its content **changes incompatibly**."

So there are two distinct defects, in opposite directions:

**F4a — code written during the STUFE-less window now over-selects.**
It omitted a STUFE filter because the field did not exist. With STUFE back,
indirect relationships are returned too.

```abap
SELECT * FROM vbfa
  WHERE vbelv = @lv_vbeln
    AND stufe = '00'         " restore "direct relationships only"
  INTO TABLE @lt_vbfa.
```

Note the `@` on the `INTO` target: once any host variable in the statement is
escaped, **all** of them must be (7.40 SP05 strict mode). A half-escaped
statement does not compile.

**F4b — duplicated STUFE.** Custom structures that `INCLUDE` VBFA (or
`VBFAVB` / `VBFAS`) and gained their own `STUFE` field during the removal
window now carry it twice. Remove the custom one.

Also: code referencing `VBFAD-STUFE` (the include-group name) needs adapting,
and code that mixed direct VBFA selects with `CL_SD_DOCUMENT_FLOW_RT` calls now
double-processes.

**SAP's recommended target pattern — release-independent, prefer it:**
```abap
CL_SD_DOCUMENT_FLOW_RT=>GET_SUCCESSORS( ... iv_path_length = '1' )   " direct only
CL_SD_DOCUMENT_FLOW_RT=>GET_PREDECESSORS( ... )
```

**`RFMNG` is unchanged** as far as we can verify (still QUAN 15). Do not assert
an RFMNG change in a client deliverable; if code depends on its semantics,
verify in-system.

### F5 — Escalate, do not fix

| Pattern | Cookbook case | Why it escalates | Owner |
|---|---|---|---|
| SELECT on VBUK/VBUP that **cannot** be mapped to one document table (queries spanning order + delivery + billing at once) | 4 | No single successor table exists — needs redesign and a functional decision on which categories are in scope | Functional (SD) |
| `INSERT` / `UPDATE` / `DELETE` on VBUK or VBUP | 10–12 | Unsupported in both worlds. Someone maintained status outside the standard status framework — that is business logic, not syntax | Functional (SD) |
| Custom append fields on VBUK/VBUP | — | Which table(s) should the field go to? Getting it wrong **loses the data during conversion** | Functional (SD) + Basis |
| Custom DDIC projection / database views over status tables | 13–14 | Every consumer must be re-tested | Functional + test lead |
| VBFA indirect-relationship reconstruction (note 2418242) | — | Data topic; needs an outage window | Basis + archiving |
| Code reading VAKPA/VAPMA/VLKPA/VLPMA/VRKPA/VRPMA, VBOX, S066/S067 | — | Functionally redesigned areas (Settlement Management, Credit Management) | Functional |

---

## Review checklist (human gate — every object)

- [ ] Zero-rows risk explicitly reasoned about — this is a **silent** failure
      mode, so "it ran without error" is not evidence
- [ ] Tested against a document created **after** conversion, not only history
      (KBA 3563944)
- [ ] Where the mapping to one document table was assumed, the evidence is in
      the review comment
- [ ] No write path silently converted (F5 escalated)
- [ ] `FOR ALL ENTRIES` driver tables have an emptiness guard
- [ ] VBFA changes state which STUFE behaviour the target release has
- [ ] Custom appends verified present on the `*_STATUS` include, correct name
      and type — including any partner-namespace appends the SUM check misses
- [ ] Strict-mode ABAP SQL applied and syntax-checked via ADT
- [ ] Change in the remediation transport; logged with note reference 2198647
      (or 2470721 for VBFA)

## Estimation guidance

**No SAP-published effort figures.** Our estimating basis, to recalibrate after
the first engagement:

| Pattern | Effort per occurrence (incl. review) |
|---|---|
| F1 (document row already read) | 0.25–0.5 h |
| F2 (statically-known document type) | 0.5–1 h |
| F3 (read FM) | 1–2 h |
| F4a / F4b (VBFA STUFE) | 0.5–1.5 h |
| VBTYP CHAR1→CHAR4 syntax fixes | 0.1–0.25 h |
| F5 | Open ticket, unbounded |

Counts come from `abap_run_atc` output. Note that the VBUK/VBUP finding count
**understates** the work: cookbook case 4 items look identical to case 3 items
in ATC output and only separate on reading the code.

## Provenance

**SAP-verified:** notes 2267306, 2198647, 2224436, 2469315, 2418242, 2470721,
2267377, 2270544; KBA 3563944; the status-table mapping; the append-field rule
and both SUM-check blind spots; the STUFE removal/re-introduction releases; the
ATC check names; every quoted sentence.

**Secondary-sourced, verify in-system:** the specific status field-name lists
(DDIC-reference sourced — and the LIKP/LFSTK trap above is exactly why);
`SD_VBUP_READ_FROM_DOC`; the exact signatures of the read FMs and of
`CL_SD_DOCUMENT_FLOW_RT` (SAP's cookbook documents `iv_path_length` only on
`GET_SUCCESSORS`); the recovered cookbook case numbering, and the mapping of
cases to our F1–F5 grouping (pull the real attachment from note 2198647 — only
part of it was publicly retrievable).

**Our judgment:** the grep list, the effort ranges, the F1–F5 grouping, and the
"no compatibility view exists" reading.
