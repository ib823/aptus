# aptus data-acquisition brief — Philippines localisation

**Standing document. Country-scoped, not tied to any client, engagement or bid.**

Companion to `DATA-ACQUISITION-BRIEF.md`, which is product-scoped. That brief asks
"what does aptus not know about SAP Cloud ERP?". This one asks a narrower question:
**aptus was loaded from a Malaysian content drop. What does it therefore not know
about the Philippines?**

Every number below was **measured in aptus on 07 Sep 2026** against content release
2608, SAP S/4HANA Cloud Public Edition. They are facts about this repository.

---

## Read this first: aptus is not as Malaysia-only as it looks

The obvious assumption — "aptus has no Philippines data at all" — is wrong, and
acting on it would waste most of a harvest re-collecting things the repository
already holds. Five of the twelve country-bearing datasets are **already
multi-country and already carry the Philippines**:

| Dataset | Malaysia | Philippines | Gap? |
|---|---:|---:|:--|
| `SapProcessStep.countries` | 14,365 steps · 477 items | **13,988 steps · 478 items** | **No** |
| `SapCoMasterObject.country` | 20 | **20** | **No** |
| `ConfigActivity.countrySpecific` | named in many lists | **named in many lists** | **No** |
| `SapFioriApp` (5,854) | no country column — global | global | **No** |
| `SapCommScenario` / `ScopeItemCommScenario` (496 / 1,149) | no country column — global | global | **No** |
| `SapFormTemplate` (272) | no country column — global | global | **No** |
| `SapFiscalYearVariant` (26) | no country column — global | global | **No** |

The process-step master is the striking one. SAP publishes each step with the full
list of countries it reaches, and WS1.4 loaded that list intact. The Philippines
reaches **478 scope items — one more than Malaysia**, not fewer:

```
in MY but not PH   6   3F7  5IK  6A9  7EZ  7G4  7G5
in PH but not MY   7   1WQ  2OO  5VX  5VY  5VZ  5YU  5YV
```

All seven PH-only codes already exist in the catalogue, as `country = XX`
(country-independent) with `availableInMy = false`. Nothing needs harvesting for
them.

**So do not re-harvest process steps, Fiori apps, communication scenarios, forms,
fiscal year variants or CO master objects. aptus has them for the Philippines
already.**

---

## What is genuinely missing — six targets

These are the datasets loaded from a Malaysia-specific source, where the
Philippines equivalent does not exist in aptus at all.

### Rules (unchanged from the product brief, and they still bind)

- **No scraping, bots, headless crawlers or automated harvesting of api.sap.com.**
  Signed-in UI and SAP's own export only. Where SAP publishes an anonymous OData
  or page-content service, extend `scripts/harvest-sap-api-hub.ts` rather than
  crawling a rendered page.
- **One file per target.** TSV, UTF-8, exact columns as named, flat — no merged
  cells, no formulas, no summary sheet.
- **A provenance block on every file** — source URL, date read, and whether the
  walk was complete or partial. A lower bound stated as a lower bound is usable;
  a lower bound stated as a census is a defect that propagates silently.
- **Never infer a link SAP did not publish.** `link_source = PUBLISHED` means SAP
  states it on the page you read; anything else is `DERIVED` with the reasoning in
  `evidence`. A row with no evidence is worse than a missing row.
- **A blank is a blank.** If SAP does not publish a value, leave the cell empty.
  Do not write "N/A", "TBC", or a plausible substitute. aptus distinguishes "SAP
  publishes nothing" from "nobody looked", and a filled-in guess destroys that
  distinction permanently.

---

### Target 1 — Scope-item availability for the Philippines · **highest value**

**The gap.** aptus holds 822 scope items for PUBLIC/2608. 623 are flagged
`availableInMy = true` with a `myAvailableSince` date, because WS1.2 loaded SAP's
**Availability & Dependencies** export for Malaysia. There is no equivalent column
or data for the Philippines — `availableInPh` does not exist, and neither does the
underlying export.

This matters more than anything else on the list. Without it aptus cannot answer
"is scope item X available to a Philippine company code?" — the first question of
any multi-country scoping conversation — and it cannot tell whether the 822 items
it holds are even the right 822 for a PH rollout. **A scope item SAP offers in the
Philippines but not Malaysia may be absent from the catalogue entirely, and aptus
currently has no way to know.**

**Source.** SAP Signavio Process Navigator / SAP Best Practices Explorer, the
*Availability and Dependencies* export for SAP S/4HANA Cloud Public Edition 2608,
with the country set to **Philippines**. Same export WS1.2 read for Malaysia — the
country selector is the only change.

**File.** `sap-references/2608/availability-ph.tsv`

| column | meaning |
|---|---|
| `scope_item_id` | e.g. `J59` |
| `scope_item_name` | as published |
| `country` | `PH` |
| `available_since` | release the item became available in PH, e.g. `2402` |
| `lifecycle_status` | as published — retired / deprecated / planned / blank |
| `lifecycle_note` | verbatim if SAP prints one |
| `license_required` | as published |
| `provisioning` | as published |
| `required_scope_codes` | `\|`-separated |
| `successor_scope_codes` | `\|`-separated |
| `sap_component` | as published |
| `lobs` | `\|`-separated |
| `business_areas` | `\|`-separated |

**Acceptance test.** Every `scope_item_id` in the file either resolves against the
822 items already in PUBLIC/2608, **or is reported as a new code aptus does not
hold** — the second case is the finding, not an error. Report both counts
explicitly. Also confirm the 7 PH-only codes above (`1WQ 2OO 5VX 5VY 5VZ 5YU 5YV`)
appear with a non-empty `available_since`.

---

### Target 2 — Philippine tax codes and rates

**The gap.** `SapTaxCode` holds 32 rows, `SapTaxRate` 34, `SapTaxAccountAssignment`
34 — **all `country = MY`, zero for any other country.** Loaded in WS11 from the
Malaysian tax workbook in the 2608 drop.

**Source.** The 2608 Best Practices content library, the tax configuration workbook
for the **Philippines** country version (the PH counterpart of the MY file WS11
read). Typically published alongside the country-specific Best Practices package.

**Files.** `sap-references/2608/tax-codes-ph.tsv`

| column | meaning |
|---|---|
| `country` | `PH` |
| `tax_code` | e.g. `V1` |
| `description` | as published |
| `tax_type` | input / output as published |
| `transaction_key` | as published |
| `reporting_country` | as published |

`sap-references/2608/tax-rates-ph.tsv`

| column | meaning |
|---|---|
| `country` | `PH` |
| `tax_code` | joins the file above |
| `condition_type` | as published |
| `rate_percent` | numeric, blank if SAP publishes none |
| `valid_from` | as published |

`sap-references/2608/tax-account-assignment-ph.tsv`

| column | meaning |
|---|---|
| `country_variant` | `PH` |
| `transaction_key` | as published |
| `tax_code` | as published, blank where the assignment is code-independent |
| `gl_account` | as published |
| `description` | as published |

**Acceptance test.** Every `tax_code` in the rates file resolves against the codes
file. Report the count of rates SAP publishes with no percentage — those exist and
must stay blank, not zero.

---

### Target 3 — Philippine chart of accounts

**The gap.** `SapGlAccount` holds 871 rows, every one `countryVariant = MY`.

**Source.** The 2608 country-specific chart of accounts / G/L account list for the
Philippines, from the same Best Practices content library as target 2.

**File.** `sap-references/2608/gl-accounts-ph.tsv`

| column | meaning |
|---|---|
| `country_variant` | `PH` |
| `gl_account` | as published |
| `short_text` | as published |
| `long_text` | as published |
| `account_group` | as published |
| `account_type` | as published |
| `pl_or_bs` | as published |
| `chart_of_accounts` | as published |

**Acceptance test.** Report the count, and report how it compares to Malaysia's
871. A Philippine chart materially larger or smaller than the Malaysian one is
plausible; a count that lands on exactly 871 deserves a second look for an
accidental re-read of the MY file.

---

### Target 4 — Philippine restrictions (what SAP states it does not support)

**The gap.** `SapNotSupported` holds 539 rows. 264 name no country; the other 275
name **38 countries — and the Philippines is not one of them.** Malaysia has 11.

This is not evidence that SAP publishes no Philippine restrictions. It is evidence
that the **anonymous help.sap.com slice WS13 harvested carries none.** The
distinction matters: aptus would otherwise present "zero Philippine restrictions"
as a finding, when it is an unexplored source.

**Source.** help.sap.com, *What's Not Supported* / country-specific restriction
notes for SAP S/4HANA Cloud Public Edition 2608, filtered to the Philippines.
Include SAP Notes and KBAs where they are the publication — flag which is which.

**File.** `sap-references/restrictions/not-supported-ph.tsv` — same columns as the
existing `not-supported.tsv`, so the WS13 loader reads it unchanged:

`capability`, `scope_item_codes`, `country`, `what_is_not_supported`,
`statement_verbatim`, `source_type`, `source_id`, `source_url`, `released_on`,
`future_support_stated`

**Acceptance test.** `statement_verbatim` is SAP's own sentence, unedited and
unsummarised. `country` reads exactly `Philippines` — the register uses full
English names, not ISO codes, and `src/lib/tobe/countries.ts` maps them. **If the
walk finds nothing, say so explicitly with the pages searched** — a documented
empty result is a real deliverable here and closes the question.

**Specific thing worth checking.** Malaysia has five rows stating cross-border
electronic invoices are not supported on the Peppol network. The Philippines has
its own e-invoicing regime (BIR EIS). Whether SAP publishes an equivalent
restriction is exactly the kind of thing that surfaces late and expensively.

---

### Target 5 — Philippine process diagrams (BPDs)

**The gap.** `src/lib/fts/data/` holds 9 hand-built scope-item files, all generated
from `*_EN_MY.xlsx` / `.docx` Best Practices process diagrams. There are none for
the Philippines.

**Value, stated honestly: lower than the four above.** WS14 wired the To-Be engine
to the process-step master, which already covers 478 PH scope items. The BPDs add
one thing the master does not publish — the **expected result** per step — and
they add it for 9 items. Worth collecting, not worth collecting first.

**Source.** SAP Best Practices Explorer, process diagram downloads for 2608 with
country **Philippines**, for whichever scope items matter to the engagement.

**File.** The raw `.xlsx` and `.docx` into `sap-references/2608/bpd-fts/`, named as
SAP names them (`<CODE>_S4CLD2608_BPD_EN_PH.xlsx`). `scripts/emit-fts-2608.ts`
already parses this shape; it does not need a PH variant, only the files.

**Acceptance test.** `pnpm sap:2608:emit-fts` parses each file without the
table-strip fallback firing, and the emitted step count matches the workbook's
activities after the "Test Procedures" marker.

---

### Target 6 — Philippine org-structure sample values

**The gap.** `SapOrgStructureElement` holds 116 rows — 47 storage locations, 16
purchasing groups, 8 shipping points, 4 plants, 4 sales orgs and so on. It has
**no country column at all**, and the values came from the Malaysian drop. So aptus
cannot say whether a given sample org unit is the MY one or a global one.

**Value: lowest of the six.** These are SAP's sample values, not a client's real
org structure, and every real engagement replaces them. Collect it last, or not at
all if effort is tight.

**Source.** The 2608 organisational-structure workbook for the Philippines country
version.

**File.** `sap-references/2608/org-structure-ph.tsv` — columns
`country`, `element_type`, `element_id`, `element_name`, `parent_type`,
`parent_id`.

**Acceptance test.** Read each column down independently. **Do not read across a
row to assert a parent-child relationship the workbook does not state** — WS11's
`parseOrgStructure()` carries that rule for the MY file and it applies here for the
same reason.

---

## Priority, if you can only do some

1. **Target 1 — availability.** Everything else is detail; this one determines
   whether aptus even holds the right scope items for a PH rollout.
2. **Target 4 — restrictions.** Cheap, and it is the dataset that answers
   "what will bite us in month 6". A documented empty result still closes it.
3. **Targets 2 and 3 — tax and G/L.** Needed for any finance-shaped conversation.
4. **Target 5 — BPDs.** Adds expected-result text on a handful of items.
5. **Target 6 — org structure.** Sample values a real project replaces anyway.

---

## Two things to state plainly when reporting back

**What you could not find is a finding.** If SAP publishes no Philippine
restriction register, say that with the URLs you walked. aptus records
"no data" and "not looked" as different things, and a brief that returns silence
for a genuine absence corrupts that distinction for everyone downstream.

**Do not normalise across countries.** If SAP's PH tax workbook has a column the MY
one lacks, keep it and name it. The loaders can be extended; a column discarded at
harvest time is gone.
