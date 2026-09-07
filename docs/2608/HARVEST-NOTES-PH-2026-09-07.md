# aptus data-acquisition — Philippines, targets 1–6

Run 2026-09-07 against `PHDATAACQUISITIONBRIEF.md`. Content release 2608, SAP S/4HANA
Cloud Public Edition. Every file carries its own provenance block; this note is the map.

## The headline: four of six targets needed no harvest

The brief's own preamble warns that aptus is less Malaysia-only than it looks. That is
truer than the brief knew. **Three of the six "genuinely missing" targets were already
sitting in `sap-references/2608/`, in files aptus loaded from and then read only the
Malaysian column of.**

| Target | Where it actually was | Result |
|---|---|---|
| 1 availability | `Availability_Dependencies_EN_XX.xlsx` — a **59-country** matrix; PH is column BG | 679 rows, no harvest |
| 2 tax account assignment | `..._for_YCOA.xlsx` sheet `T030K` — **66 countries**; 22 PH rows beside the 59 MY rows | 22 rows, no harvest |
| 3 chart of accounts | `..._for_YCOA.xlsx` sheet `Template CoA YCOA` — a column per country company code; **PH (5810)** | 578 rows, no harvest |
| 6 org structure | `2608_Org_Data_Overview_EN_XX.xlsx` — country-**templated**, publishes no PH values | 0 rows: finding, not gap |
| 2 tax codes | not in the repo; SAP publishes them anonymously on help.sap.com instead | 18 rows, harvested |
| 4 restrictions | help.sap.com, walked in full | 0 rows: documented empty |
| 5 BPDs | Best Practices content library, signed-in only | not collected |

**Target 1 is sharper than "the file was on disk".** `scripts/lib/sap-2608/parse.ts`
already parses *every* country column into `AdScopeItem.countries`. The Philippine
availability is parsed today and thrown away at persist time, because only
`availableInMy` and `myAvailableSince` are columns. This is a schema and loader change,
not a data-acquisition problem — and the same is true for the other 57 countries.

## Acceptance tests

- **T1.** All 7 PH-only codes carry a non-empty `available_since`: 1WQ=1811, and
  2OO/5VX/5VY/5VZ/5YU/5YV=2308. **0 codes in the file are new to aptus.** 625 items carry
  a release, 54 carry SAP's published `No`. 145 codes aptus holds have no row in the
  export at all and are listed in `availability-ph-uncovered.tsv` rather than left silent.
- **T2.** Every `tax_code` in the rates file resolves against the codes file — vacuously,
  the rates file has 0 rows (see below). 0 published rates carry no percentage.
- **T3.** 578 Philippine accounts, against Malaysia's 871 in aptus. Not 871, so no
  accidental re-read — and the two numbers are not comparable anyway: aptus's 871 came
  from the MY **local** workbook, this 578 from the **template** chart. Named in the file.
- **T4.** Documented empty result with the pages walked. See below.
- **T6.** No parent-child relationship asserted: no rows emitted.

## Three findings worth more than the row counts

**1. There is no Philippine chart of accounts, and that is the answer.**
The YCOA workbook carries 20 `Alternative Account Number` columns for countries with
their own local chart — AT, BE, BR, CH, CN, CZ, DE, ES, FI, FR, HU, JP, LU, NO, PT, RO,
RU, SE, TR, TW. **There is no PH column.** SAP publishes the Philippines as using the
YCOA template chart directly. Malaysia has no such column either.

**2. SAP publishes no Philippine e-invoicing at all — so there is no BIR EIS restriction
to find.** The brief asks whether SAP publishes a Philippine equivalent of Malaysia's
five Peppol cross-border restrictions. The Philippines localisation deliverable mentions
Peppol 0 times, "electronic invoice" 0 times, "e-invoic" 0 times, EIS 0 times. SAP's own
*Supported Compliance Tasks* page for SAP Document and Reporting Compliance, Cloud
Edition enumerates **35 countries across 487 task rows** — Malaysia, Singapore and
Vietnam among them — and the Philippines is not one of them. The absence is upstream of
any restriction: there is no feature to restrict. That is recorded in
`not-supported-ph-evidence.tsv`, **not** in the register, because absence from a list is
not a sentence in which SAP states a non-support.

**3. `not-supported-ph.tsv` is empty on purpose, and it must stay that way.**
127 topics of the Philippines deliverable (125 with a body, 237,659 characters) plus a
re-scan of the entire 12,959-page corpus WS13 already harvested. Under the **identical
rule** that produced the 539 rows of `not-supported.tsv`: **zero matches**. The
deliverable's text contains "not support" 0 times, "unsupported" 0, "limitation" 0, "out
of scope" 0, "no plans" 0. SAP writes this localisation without non-support language.
Eight near-miss sentences — real published constraints in "cannot"/"must not"/"not
available" phrasing — are in the evidence companion. Widening the rule to catch them
would change Malaysia's 11 and the other 39 countries' counts too, so the rule was not
widened for one country.

## What is blocked, and by what

**Target 5 (BPDs) and the tax-rate half of target 2** need the SAP Best Practices content
library, which requires a signed-in session. `me.sap.com/processnavigator` returns an SPA
shell anonymously, and `help.sap.com/doc/.../<CODE>_S4CLD2608_BPD_EN_PH.xlsx` returns the
same 631-byte HTML shell for *any* filename — including one that does not exist — so a
200 there means nothing. Nothing was downloaded, and no file was invented.

`tax-rates-ph.tsv` is empty for a precise reason: SAP's published tax-code page carries no
rate column. Several descriptions read `Output VAT 12%-Goods`; **no rate was extracted
from that prose**, because reading a number out of a description is inference. The rates
live in `2608_Pre-configured_Tax_Codes_EN_PH.xlsx`, which is the one file worth fetching
by hand.

## Two things to check before loading

**Column names.** The brief names `scope_item_codes` and `statement_verbatim`. The
`not-supported.tsv` delivered on 07 Sep uses `scope_item_ids` and
`sap_statement_verbatim`. This file follows the **brief**. If the WS13 loader keys on the
older names, rename those two headers — the data is unaffected.

**The 822.** A&D (679) ∪ Process-Steps Scope (659) ∪ Retired (143) = **824**, not 822.
This walk did not resolve the 2-code difference; it is stated rather than smoothed over.

## Extra files the brief did not ask for

- `withholding-tax-codes-ph.tsv` — 53 Philippine withholding tax codes **with published
  rates**. Kept because the brief's own rule says a column SAP publishes must not be
  discarded at harvest time. Not merged into the rates file: withholding codes are a
  different code space and the join does not exist.
- `availability-ph-uncovered.tsv` — the 145 codes with no published PH availability.
- `not-supported-ph-evidence.tsv` — read its `evidence_type` column before using it, and
  do not load it into `SapNotSupported`.

Cross-check worth acting on: the YCOA `T030K` sheet names 7 Philippine tax codes —
**S4, S5, S6, SE, SO, V8, V9** — that SAP's published tax-code page does not list. The
published page is a floor.
