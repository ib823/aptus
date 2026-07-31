# Playbook: Material Number Field Length Extension (MATNR 18 → 40)

**Simplification Item:** `S4TWL - Material Number Field Length Extension`
(component CA-FLE-MAT). **Business Impact note: 2267140.**
**Custom-code notes: 2215852** ("Material Number Field Length Extension: Code
Adaptions") **and 2215424** — 2215852 is the note the ATC Quick Fixes are tied
to; 2215424 is the note ID that appears in ATC finding text.
**Pre-check note: 2216958. Restrictions: 2233100.**

Verified against the [Simplification List for SAP S/4HANA 2025 FPS1](https://help.sap.com/doc/0df2ffddebab40cf9338488b2f18dc41/2025.latest/en-US/SIMPL_OP2025.pdf)
§5.1.5 and the [Custom Code Migration Guide 2025](https://help.sap.com/doc/9dcbc5e47ba54a5cbb509afaa49dd5a1/2025.001/en-US/CustomCodeMigration_EndtoEnd.pdf).

> ⚠️ **Do not cite SAP Note 2213569 for MATNR.** It belongs to
> `S4TWL - Classification`. It circulates widely in MATNR blog posts and is
> wrong.

---

## The one thing to tell the client first

> "Code adaptions will be needed **even if you decide not to activate** the
> extended material number functionality and stay with 18 characters."
> — Simplification List §5.1.5, verbatim

This is the sentence that kills the usual client pushback ("we're not going to
40 characters, so this doesn't apply to us"). The technical field is 40
characters in S/4HANA whether or not the business function is switched on.

## What changed

- **All domains used to define material number fields were extended to 40
  characters**, along with dependent fields where a material number can
  legitimately be stored (e.g. characteristic values).
- **Storage format did not change.** Pure-numeric material numbers under the
  standard (non-lexicographic) setting are still limited to 18 characters and
  still zero-padded to 18 on the database. Usually **no data conversion** is
  needed.
- **Exception — concatenated fields.** "Concatenation in the code uses the
  complete technical length of the field (which now is 40 characters) and is
  also reflected in the database content." Any custom field holding
  `MATNR + something` concatenated is a **data-migration** item, not just a
  code item. Escalate it (see F5).
- **Internal vs external interfaces diverged.** Internal APIs (local FMs,
  class methods, BAdIs) simply got the field widened to 40. Released
  **external** interfaces (BAPI, RFC, IDoc) kept the original 18-char field and
  got **a new 40-char field appended** — the classic BAPI compatibility
  pattern. Released Web Services needed no change (already up to 60 chars).

## Activation state — establish this before estimating

Default after conversion and for new installs: **MFLE is NOT activated.**
Two settings switch it on:

1. IMG → Cross-Application Components → General Application Functions →
   **Field Length Extension → Activate extended fields** (client-dependent),
   or transaction **FLETS** (needs auth group `FLE` on `S_TABU_DIS`).
2. Transaction **OMSL** — "Define Output Format of Material Number" — must
   allow > 18 characters.

**Activation is effectively one-way**: once values exist that are only legal
under MFLE, it cannot be cleanly deactivated.

Ask the client which state they are in *before* running estimates. It changes
the finding volume, not the remediation approach.

## Detection

**ATC check: `S/4HANA: Field length extensions`** (Quick Fixes available).
Findings are Priority 3 and can be suppressed with pseudo-comment
`"#EC CI_FLDEXT_OK`.

**Run BOTH readiness variants and diff them:**

| Variant | MATNR length setting | What the findings mean |
|---|---|---|
| `S4HANA_READINESS_NO_FLE` | 18 | **Must fix regardless** — this is the floor |
| `S4HANA_READINESS` | 40 | Floor **plus** what MFLE activation would additionally cost |

Use the **release-independent** variant names above unless you have confirmed
the release-specific pair in the client's system. Those are versioned
(`S4HANA_READINESS_2023` / `_2023_NO_FLE`, `_2025` / `_2025_NO_FLE`, …) and
which ones exist depends on the SP level and the notes applied — naming a
variant the system does not have is an avoidable stumble in front of Basis.

The delta between the two runs is the price tag on the MFLE activation
decision. Putting that number in front of the client is usually the first time
anyone has quantified it for them — but note that framing it as "the price tag"
is our estimating approach, not an SAP method.

Independently grep for (these patterns are **our** engineering judgment, not an
SAP-published list — see "Provenance" at the end):

1. `TYPE C LENGTH 18` / `LENGTH 18` / `CHAR18` on material-bearing fields
2. Offset access: `lv_matnr+0(18)`, `mara-matnr(18)`, `matnr+18`
3. `WRITE ... TO` with a fixed-length target
4. Custom DDIC structures/tables declaring MATNR as `CHAR 18` instead of
   referencing data element `MATNR`
5. ALV field catalogs with a hardcoded `outputlen`
6. `CONVERSION_EXIT_MATN1_INPUT` / `_OUTPUT` usage (see F4)
7. Local calls to released BAPIs/RFCs that populate the 18-char field
8. Fixed-length file/IDoc record layouts containing a material number

---

## Fix patterns

### F1 — Typing widened to the standard data element (the majority case)

Before:
```abap
DATA: lv_matnr TYPE c LENGTH 18.
DATA: BEGIN OF ls_row,
        matnr TYPE c LENGTH 18,
        werks TYPE werks_d,
      END OF ls_row.
```

After:
```abap
DATA: lv_matnr TYPE matnr.
DATA: BEGIN OF ls_row,
        matnr TYPE matnr,
        werks TYPE werks_d,
      END OF ls_row.
```

Rules:
- Always retype to the **data element** (`matnr`), never to a hand-rolled
  `CHAR 40` — that just moves the hardcoding.
- Check every consumer of the widened structure in the same change; widening
  one field and leaving the receiving field at 18 recreates the defect one
  call-frame later.
- ATC Quick Fix handles many of these. Review each one; do not bulk-apply
  without reading the diff.

### F2 — Offset / length access and truncating moves

Before:
```abap
lv_key = ls_mara-matnr+0(18).
MOVE ls_mara-matnr TO lv_short_matnr.   " lv_short_matnr is CHAR 18
```

After:
```abap
lv_key = ls_mara-matnr.                 " lv_key retyped per F1
```

Rules:
- If the truncation was **deliberate** — feeding a legacy interface, a fixed
  file layout, a printed form column — this is **not** F2. It is F5. Do not
  silently widen it.
- Where the target is a display field, widening changes screen and list
  layouts. Note it in the review comment; a UI break is still a break.

### F3 — Internal calls to released external APIs

The most-missed defect in this whole pattern. A released BAPI/RFC keeps its
18-char field **and** gains a new long one. Custom code that calls it locally
must populate the **long** field.

SAP's rule, verbatim: "all internal calls of external interfaces must only use
the newly added extended fields… Then only the new extended field shall be used
in all internal coding, too."

Before (local call, populating the short field):
```abap
CALL FUNCTION 'BAPI_MATERIAL_GET_DETAIL'
  EXPORTING material = lv_matnr_18   " short field
  IMPORTING ...
```

After: populate the appended long parameter instead. **The exact parameter
name varies per BAPI** — read the interface in SE37/ADT, do not guess it.

Rules:
- This changes what downstream logic receives. It needs a **functional test**,
  not just a syntax check. Flag every F3 for test coverage.
- For an S/4HANA system calling **out** to a non-extended partner system, SAP
  note 2215852 describes using a mapper (class `CL_MATNR_CHK_MAPPER`) to send
  the short form when MFLE is off. *This class/method detail comes from a
  third-party reproduction of the note, not from SAP's own site — verify
  against the note attachment before using it in a client deliverable.*

### F4 — Conversion exits

`CONVERSION_EXIT_MATN1_INPUT` raises message **BMG 140** ("The material number
is longer than the length set") for values over 18 characters
(SAP KBA 2922763). Custom code that calls the exit and ignores `sy-subrc` or
the exception will now fail silently or dump on long material numbers.

Rules:
- Add or fix the error handling; do not remove the exit call.
- Where the exit was used purely to zero-pad for a DB read, prefer letting the
  standard typing do it.

### F5 — Escalate, do not fix (functional / interface / data owners)

Route these to a human decision with a written entry in the remediation log:

| Pattern | Why it escalates | Owner |
|---|---|---|
| The MFLE activation decision itself | Landscape-wide, effectively irreversible, every SAP Business Suite communication partner is in scope | Programme / architecture |
| Fixed-length outbound or inbound interfaces (flat file, EDI, bank, carrier, WMS, MES, middleware maps) | Widening a field is a **contract change with a third party** | Interface owner |
| Custom fields holding a **concatenated** value containing MATNR | Data-migration item — DB content changes, not just code | Data migration |
| `OMSL` output format / lexicographic flag changes | Changes sort order, search helps and printed output system-wide | Functional (MM) |
| LIS objects (restriction note 2232362) | Restricted area | Functional (PP/SD) |
| DIMP LAMA long material number / manufacturer part number (notes 1597790, 2270396, 2270836) | Dedicated conversion project | Programme |
| Selection variants (note 1696821) | Conversion report, not code | Basis |

---

## Review checklist (human gate — every object)

- [ ] Retyped to the `MATNR` data element, not to a hand-rolled `CHAR 40`
- [ ] Every consumer of a widened structure checked in the same change
- [ ] No deliberate truncation silently widened (F5 escalated with the reason)
- [ ] F3 interface changes have a named functional tester
- [ ] Syntax-checked via ADT (`abap_syntax_check`) after the change
- [ ] Change recorded in the remediation transport, not a mixed transport
- [ ] Object listed in the remediation log with SAP Note reference 2215852

## Estimation guidance

**No SAP-published effort figures exist for this item** — SAP's position is
that the Custom Code Migration app and ATC Quick-Fix statistics are *inputs* to
your estimate, not a substitute for it. The ranges below are **our estimating
basis**, to be recalibrated after the first engagement:

| Pattern | Effort per occurrence (incl. review) |
|---|---|
| F1 with Quick Fix available | 0.1–0.25 h |
| F1 manual | 0.25–0.5 h |
| F2 | 0.25–0.75 h |
| F3 | 1–3 h + functional test |
| F4 | 0.5–1 h |
| F5 | Open ticket, unbounded until decided |

Occurrence counts come from `abap_run_atc` output — use `findingsByPriority`
and the per-object breakdown, and run both variants for the delta.

## Provenance

**SAP-verified** (cite freely): notes 2267140, 2215852, 2215424, 2216958,
2233100, 2232362, 1696821, 1597790, 2270396, 2270836; KBA 2922763; the check
name `S/4HANA: Field length extensions`; the variant names; every quoted
sentence above.

**Our engineering judgment, not an SAP list** (do not present as "SAP says"):
the enumerated grep patterns in Detection, the "run both variants, the delta is
the price tag" framing, and the effort ranges. Attribute
these to ATC findings and to the general rule in note 2267140 — "all places at
which a material number was moved to a field that was not long enough".

**Third-party sourced, verify before client use:** `CL_MATNR_CHK_MAPPER` and
its methods (from a blog reproduction of note 2215852, not from SAP).
