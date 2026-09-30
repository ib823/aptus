# Product scope content in Aptus

## What is consolidated

`/sap-explorer/scope-catalog` reads the existing S/4HANA Cloud Public Edition
scope catalog and the new `ProductScopeItem` table in one view. The latter is
for SAP products whose content does not share the S/4 scope item structure.
Each record is identified by product, solution, source release, country,
language, and code. A process without an SAP scope ID receives an explicit
`PROCESS` kind and a stable Aptus code; it must not be presented as an SAP
scope item. Source URL, source type, hash, and import date remain with it.

The detail page shows imported steps and questions. Its SVG is generated only
from ordered imported steps, with a label saying it is an Aptus rendering. An
official SAP diagram or test-script URL is linked separately. Empty step or
question arrays remain visibly missing; a narrative description is never
converted into fictional implementation steps or BDC questions.

## Import public or partner content

1. Record the SAP product, solution, release/version, country, language, and
   exact source URL for each source package or page. For SAP for Me / Signavio
   Process Navigator exports, retain the downloaded original and its release
   information in the evidence store. Check the export's permitted use before
   sharing beyond the partner workspace.
2. Convert reviewed records into a JSON manifest following
   `sap-references/product-scope/public-sap-sample.json`. Keep SAP scope IDs
   verbatim. For Ariba workflows without a scope ID, use `scopeKind: "PROCESS"`
   and a stable process key. Ordered `processSteps` require a published test
   script or numbered workflow. Each configuration question needs its own
   source URL. Leave unavailable arrays empty.
3. Run `pnpm sap:product-scope:import <manifest.json>`. The importer validates
   URLs, identity uniqueness, ordered steps, and question keys. It upserts only
   the records in that manifest; other products and older releases remain.
4. Run `pnpm sap:product-scope:recon <manifest.json>`. This checks that every
   record landed with the expected content hash and reports coverage by
   product, solution, and release. The public sample is imported by the Vercel
   build after database migration, so public starter records are present after
   deployment. Partner manifests should use this same import and recon path.
5. Review the Aptus catalog's coverage counters and sample detail pages.
   Check at least one source link, one generated diagram, and one missing-step
   item before treating a release as ready for assessment use.

## Source mapping

| Source | Identity | Steps and diagrams | Configuration/discovery |
| --- | --- | --- | --- |
| S/4HANA Public Edition | SAP scope code + catalog release | Existing Process Steps/BPD assets and Aptus flow | Existing BDC import and confirmed Aptus questions |
| SuccessFactors Best Practices | SAP scope ID + module + its own release | Test script and process diagram when published and imported | Configuration workbook/guide; do not call these S/4 BDC |
| Ariba | Named process or capability + product release; SAP scope ID only if explicitly published | Numbered workflow, test script, or official flow when available | Site configuration guide; no implied BDC parity |
| Other SAP products | Product's own published identity and release | Only source-backed ordered activities | Only source-backed questions |

The public sample currently contains four SuccessFactors Recruiting entries
and two Ariba invoicing workflows. It is an initial verified slice, not a
complete SuccessFactors, Ariba, or all-SAP inventory. A completeness claim
requires an authoritative list per product/module and release, an imported
count matched to that list, and review of items without steps or diagrams.

On 2026-09-30, SAP for Me / Signavio Process Navigator visibly listed recent
scenario versions for SuccessFactors Career and Talent Development (2605),
Learning (2511), Talent Intelligence Hub (2605), Employee Central (2605),
Employee Central Payroll (2411), and Compensation (2511), plus SAP Business
Network for Supply Chain (2608). These are a known intake backlog. The
recently-updated list is not an authoritative complete module list, and no
scope counts for those scenarios have been imported or claimed here.

## Consolidation rule for later assessments

The catalog is the shared source for product selection and process views.
S/4HANA's existing assessment and BDC flows continue to use their established
tables. A later multi-product assessment should reference the
`ProductScopeItem.id` for non-S/4 entries, preserving their product/release
identity; it must not join them to S/4 records by bare code. Diagram nodes
should resolve from the same imported step list used by the catalog detail.
