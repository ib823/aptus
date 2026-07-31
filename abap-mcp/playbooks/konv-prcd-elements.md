# Playbook: Pricing Condition Data Model — KONV → PRCD_ELEMENTS

**Simplification Item:** `S4TWL - Data Model Changes in SD Pricing`.
**Business Impact note: 2267308.**
**Custom-code note: 2220005** ("S/4 HANA: Data Model Changes in Pricing and
Condition Technique") — this is the note SAP's own Quick Fix table ties the
`S/4HANA: Search for database operations` check to for KONV, and the one to
cite in a remediation log entry.

Applies to any ECC→S/4HANA brownfield conversion. One of the highest-frequency
remediation patterns in SD-heavy custom code.

## What changed

- Table `KONV` is replaced by `PRCD_ELEMENTS` as the persistence for pricing
  condition records of sales/billing documents. `KONV` remains as a DDIC
  structure (for internal-table typing) but holds no data in S/4HANA.
- Key field `KNUMV` semantics unchanged; field lengths differ in places
  (e.g. amounts on extended currency handling in newer releases).
- SAP provides compatibility view/redirect in some scenarios, but direct
  `SELECT ... FROM konv` fails or returns nothing depending on release —
  treat every read as mandatory remediation, never rely on redirects.

## Detection

ATC (S/4HANA readiness variant) flags these; independently grep for:

1. `SELECT ... FROM konv` / `FROM KONV` (incl. joins)
2. `MODIFY konv` / `INSERT konv` / `UPDATE konv` / `DELETE FROM konv`
   → custom writes to KONV were always unsupported; escalate, don't
   silently port them.
3. `TABLES: konv` in classic dynpro programs
4. Typed references that also need review if logic assumes DB content:
   `TYPE TABLE OF konv`, `TYPE konv`

## Fix patterns

### F1 — Simple read by KNUMV (the 80% case)

Before:
```abap
SELECT * FROM konv INTO TABLE lt_konv
  WHERE knumv = ls_vbak-knumv.
```

After (release ≥ S/4HANA 1610):
```abap
SELECT * FROM prcd_elements
  WHERE knumv = @ls_vbak-knumv
  INTO TABLE @DATA(lt_prcd).
```

(`INTO` last is our house style for consistency across the playbooks — see
`open-sql-strict-mode.md`. It is only *mandatory* in the 7.50 strict mode,
which `@DATA(...)` alone does not trigger.)

Rules:
- Keep result structure compatibility: if downstream code expects `konv`
  typing, map via `MOVE-CORRESPONDING` into `TYPE TABLE OF konv` and note
  any field-length truncation risk in the review comment.
- Convert to strict-mode Open SQL (host variables `@`, comma lists) while
  touching the statement — do the syntax modernization once, not twice.

### F2 — Reads with field lists containing dropped/changed fields

Compare selected fields against `PRCD_ELEMENTS`; fields absent there
require functional decision, not silent removal. Flag to functional
consultant with the field list.

### F3 — Writes to KONV

Do NOT translate writes to `PRCD_ELEMENTS`. Direct writes to pricing
persistence are unsupported in both worlds. Output: escalation entry —
redesign via pricing user-exits/BAdIs (e.g. pricing procedure routines) or
accept functional gap. This playbook only documents; a human decides.

### F4 — TABLES statement / dynpro usage

`TABLES: konv` remains syntactically valid (structure exists) but any
implicit assumption of DB content is dead. Trace usage; usually falls into
F1 after refactor.

## Review checklist (human gate — every object)

- [ ] Result-set equivalence reasoned about (currency, KAWRT/KWERT handling)
- [ ] No write path silently converted (F3 escalated)
- [ ] Strict-mode Open SQL applied and syntax-checked via ADT
- [ ] Change recorded to the remediation transport, not a mixed transport
- [ ] Object listed in the remediation log with SAP Note reference 2220005
      (custom code); 2267308 is the business-impact note

## Estimation guidance

**No SAP-published effort figures exist.** Our estimating basis: F1 ≈
0.25–0.5 h/occurrence incl. review; F2 ≈ 1–2 h (needs functional input); F3 ≈
open ticket, unbounded until functionally decided. Counts come straight from
`abap_run_atc` output — use `findingsByPriority` and the per-object breakdown.

## Provenance

**SAP-verified:** notes 2267308 (business impact) and 2220005 (custom code, and
the note the `S/4HANA: Search for database operations` Quick Fix table ties the
KONV findings to); the KONV → PRCD_ELEMENTS persistence change; KONV surviving
as a DDIC structure.

**Our engineering judgment, not an SAP list:** the grep patterns in Detection,
the F1–F4 grouping, the "treat every read as mandatory remediation, never rely
on redirects" rule, and the effort ranges.

**Verify in-system before client use:** the exact field-length differences
between KONV and PRCD_ELEMENTS at the client's target release, and whether any
compatibility redirect is active in their scenario.
