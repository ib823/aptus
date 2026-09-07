# aptus data-acquisition brief

**Standing document. Product-scoped, not tied to any client, engagement or bid.**

Hand this to a research session working against the aptus repository. Every gap below
was **measured in aptus on 07 Sep 2026** against content release 2608, SAP S/4HANA
Cloud Public Edition. The numbers are facts about this repository, not estimates.

Written after two capabilities that are real and delivered in the product turned out to
be invisible to every catalogue aptus holds. The pattern is the point: aptus indexes SAP
content **by scope item**, so capability SAP has not attached to a scope item cannot be
found, and aptus cannot tell the difference between "does not exist" and "exists but is
not indexed here". Nine targets, all aimed at that.

---

## Rules — these matter more than the list

**Terms of use.** `sap-references/hub-content/README.md` carries a standing rule and it
is not negotiable: **no scraping, bots, headless crawlers or automated harvesting of
api.sap.com.** Use the Hub's own UI while signed in and its own export/download; do not
script the page. Reading documentation pages in a signed-in browser is fine. Where SAP
publishes an anonymous OData catalog service, that route is already implemented in
`scripts/harvest-sap-api-hub.ts` — extend it rather than replacing it with a crawler.

**One file per target.** TSV or CSV, UTF-8, exact columns as named. aptus has loaders;
it does not have a human to reshape a workbook. Flat columns, no merged cells, no
formulas, no narrative summary sheet.

**A provenance block on every file** — source URL, date read, and whether the walk was
complete or partial. aptus stamps `completeness: "floor"` on its own harvests for
exactly this reason. A lower bound stated as a lower bound is usable. A lower bound
stated as a census is a defect that propagates silently into everything downstream.

**Never infer a link SAP did not publish.** Where a mapping is derived, set
`link_source` to `DERIVED` and put the reasoning in `evidence`. `PUBLISHED` means SAP
states it on the page you read. A row with no evidence is worse than a missing row.

**Empty is data; invented is damage.** Never fill an empty field with a plausible value,
and never drop a row because a field is empty — mark it empty.

**Published, not provisioned.** Everything here is what SAP publishes. What any tenant
has activated is a different question that only a runtime probe answers, and no file in
this brief may claim it.

**Release.** 2608 unless a target says otherwise. Where a page has a release selector,
set it to 2608.

**Country.** Product-wide by default. aptus's 2608 drop currently carries Malaysia
localisation (12,245 MY-flagged process steps, 1,843 Global), so MY is the first
localisation to fill — but the schemas below are country-neutral and other localisations
drop in beside it.

---

## 1. Fiori Apps Library reference data — HIGHEST VALUE

**The gap.** aptus holds **zero** Fiori Apps Library data. Its only view of applications
is the 2608 process-step master: 14,088 steps, 1,993 distinct app IDs, attached to 618
of 822 scope items. Manage Checkbooks (F1577) and Manage Outgoing Checks (F1578) — both
delivered in Public Edition — appear in **0 of those 14,088 steps**, because SAP attached
them to no scope item. aptus therefore cannot see them at all.

This one file closes that blind spot **and** supplies half the scope-item↔API bridge
aptus has no evidence path for: an app's OData services are the bridge.

**Columns**
```
app_id · app_name · app_type · lob · business_catalog_ids · business_role_ids
odata_services · required_scope_item_ids · product_version · availability
device_types · app_hub_url
```
`required_scope_item_ids` and `odata_services` carry the value. Do not drop a row
because they are empty.

**Lands at** `sap-references/fiori-apps/apps-2608.tsv` (new directory).

**Acceptance test.** F1577 and F1578 must be present. If they are not, the walk missed
something and the file is not usable.

---

## 2. Communication scenarios (SAP_COM_*) — the only published scope-item ↔ API bridge

**The gap, measured.** Of the 5,419 APIs aptus harvested from the Business Accelerator
Hub: **0 carry a scope item code, 0 carry a communication scenario.** Of 4,502 iFlows,
496 events and 734 scenarios: **0 mention any of the 822 scope codes** anywhere in
title, description or id. Only **6 iFlow rows mention `SAP_COM_` at all**.

So "which APIs does scope item X need?" has no evidence path in aptus today and none
derivable from what is held. Any answer given now is an assertion.

Communication scenarios are the bridge SAP actually publishes: a scope item's setup
instructions name its communication arrangements, and each API's Hub page names its
scenarios. Join the two and the mapping is *published*.

**Two files.**

`comm-scenarios.tsv`
```
comm_scenario_id · comm_scenario_name · direction · auth_methods
inbound_services · outbound_services · api_ids · release
```

`scope-item-comm-scenarios.tsv`
```
scope_item_id · comm_scenario_id · mandatory · source_url · link_source · evidence
```

**Lands at** `sap-references/comm-scenarios/`. Note that
`sap-references/hub-content/README.md` already documents `communicationScenarios` and
`scopeItemCodes` on the import row shape, so this data has a home in `SapHubContent`
the moment it exists.

**Acceptance test.** At least one scope item that is purely an integration enablement
item must resolve to a scenario. If every row is empty, the walk found the wrong pages.

---

## 3. What SAP does NOT support — the structural gap

**The gap.** aptus models what exists. It has **no store for negative evidence at all** —
no exclusions, no "not supported", no country restrictions, no "no future support
planned". Every table in the schema answers *what is there*.

This is the most valuable target of the nine, because an inventory that cannot express
an exclusion will present a capability as available right up to the moment someone tries
to use it. A real example of the class, from SAP's own DRC documentation: *"Real Estate
(RE-FX) invoice is not supported by the Malaysian e-invoice solution in SAP Document
Compliance and no future support confirmed."* Nothing in aptus can hold that sentence.

**Columns**
```
capability · scope_item_ids · country · what_is_not_supported · sap_statement_verbatim
source_type (KBA|Note|Help) · source_id · source_url · released_on · future_support_stated
```

**Lands at** `sap-references/restrictions/not-supported.tsv` (new directory).

Quote verbatim; never soften, never paraphrase a limitation into a caveat. Start with
localisation exclusions and the "scenarios not supported" article family, then widen.

---

## 4. CDS view catalogue

**The gap.** aptus counts 9,288 CDS views for the product and stores **none as rows** — a
deliberate size decision recorded in `scripts/harvest-sap-api-hub.ts` (`COUNT_ONLY_TYPES`)
and in the hub-content README. The consequence is a second blind spot independent of the
scope-item one: `I_OutgoingCheck` and `I_APCheckbook` are the reporting-layer answer to a
capability aptus could not find, and it could not have found them here either. Reporting
questions are answered from CDS views and aptus cannot cite a single one.

**Columns**
```
cds_name · label · type (basic|composite|consumption) · lob · analytics_enabled
odata_exposed · authorization_object · release · help_url
```

**Lands at** `sap-references/hub-harvest/CDS_VIEW.json` — **not** `hub-content/`. That
directory is statically imported into the serverless bundle and the README explicitly
forbids multi-thousand-row files there.

If the full set is impractical, take **released, analytics-enabled consumption views**
first — those are what a reporting answer cites.

---

## 5. Business catalogs and business roles

**The gap.** aptus holds 174 business role IDs on process steps and **no catalog master**.
A string like `SAP_FIN_BC_AP_CHECK_PC` cannot be resolved to anything. Authorisation,
role-design and segregation-of-duties questions are unanswerable without it.

**Columns**
```
business_catalog_id · catalog_name · business_role_ids · app_ids · lob
restriction_types · release
```

**Lands at** `sap-references/business-catalogs/catalogs-2608.tsv` (new directory).

---

## 6. Data products and integration adapters

**The gap.** The Hub harvest counted these and could not carry them — `HUB_TYPE_MAP` in
`scripts/harvest-sap-api-hub.ts` has five entries. `_provenance.unmappedArtifactTypes` in
`sap-references/api-hub-catalog.json` is the authoritative list of what was counted and
refused: **1,525 artefacts across 15 types**, of which **DataProduct 334** and
**IntegrationAdapter 91** matter most, followed by BusinessObject 152, ValueMapping 281
and MessageMapping 255.

Same column shape as the existing harvest files, so the loader takes them unchanged:
```
externalId · title · description · packageId · status · apiType · hubUrl
product · packageTechnicalName · version · hubState · hubVersion
hubModifiedAt · hubSubType · catalogueRelease
```

**Lands at** `sap-references/hub-harvest/DATA_PRODUCT.json` and
`INTEGRATION_ADAPTER.json`. Both need new `SapHubContentType` enum values — that is
WS10.1, an additive migration.

---

## 7. Scope items with no process steps — 204 of 822

**The gap.** 618 of 822 scope items carry steps; **204 carry none**. Any requirement or
process that lands on one of those gets a placeholder rather than a process, and aptus
cannot say why the item is empty. The distinction that matters is invisible today: an
item with no steps because nobody wrote them, versus an item that is pure enablement for
a **separately subscribed product** and legitimately has none.

For each of the 204, one row:
```
scope_item_id · has_test_script · has_bpd · has_setup_instructions
is_enablement_only · separate_subscription · depends_on_product · source_url
```
`is_enablement_only` and `separate_subscription` are the two that change what an item
means commercially.

**Lands at** `sap-references/2608/scope-item-coverage.tsv`.

---

## 8. Localisation content

**The gap.** aptus flags each process step `MY` or `Global` but holds no localisation
master — no statement of what a country localisation actually delivers, what it does
not, and what changed when.

**Columns**
```
country · capability · scope_item_ids · statutory_basis · delivered_content
not_delivered · sap_note_ids · effective_from · source_url
```

**Lands at** `sap-references/localisation/<country>.tsv`.

Malaysia first, since that is the localisation the 2608 drop carries: e-invoicing and
the tax authority interface, SST, withholding tax, statutory and MFRS reporting, payroll
statutory touchpoints, central-bank reporting. `not_delivered` is not optional — it is
the column that makes this file worth more than the marketing page.

---

## 9. SAP Notes and Knowledge Base Articles keyed to scope items

**The gap.** aptus holds SAP *content* but no SAP *knowledge*. Corrections that
overturned catalogue-derived conclusions have come from KBAs, and none was reachable
from anything aptus stores. There is no table for a note, no link from a note to a scope
item or an app, and no way to ask "what does SAP know about this that the content files
do not say?"

**Columns**
```
note_id · type (Note|KBA) · title · scope_item_ids · fiori_app_ids · country
category (prerequisite|restriction|implementation|troubleshooting) · released_on
summary · url
```

**Lands at** `sap-references/sap-notes/notes-2608.tsv` (new directory).

Prioritise mandatory note sequences — the ones SAP names as the single point of entry
for a solution — and anything a delivery plan would lift wholesale.

---

## Priority

1. **Fiori Apps Library** (#1) — closes the blind spot and supplies half the API bridge
2. **Communication scenarios** (#2) — the other half; unblocks the WS10 linkage
3. **Not-supported register** (#3) — the only target that adds a *kind* of fact aptus
   cannot currently represent
4. **Data products + integration adapters** (#6) — cheap, unblocks WS10.1
5. Everything else in order

## Related

- `docs/2608/WS10-SCOPE.md` — the integration and connectivity workstream these targets
  feed, and the measured linkage gap in full
- `sap-references/hub-content/README.md` — the terms-of-use rule and the import row shape
- `scripts/harvest-sap-api-hub.ts` — the existing anonymous catalogue route and the
  reasoning behind `COUNT_ONLY_TYPES`
