# Architecture

## Goal

One code base that is developed side by side on the BTP ABAP environment and runs on-stack in
S/4HANA Public Edition and S/4HANA Private Edition / on-premise 2023 and 2025, so that the same
tested product can be installed at many clients with configuration, not code changes.

## Layers

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Application: RAP business objects, Fiori apps, jobs, Excel, PDF     │  core profile
 ├─────────────────────────────────────────────────────────────────────┤
 │ Engine: allocation, spreading, money, workflow guard (no SAP APIs)  │  core profile
 ├─────────────────────────────────────────────────────────────────────┤
 │ Connector interfaces: actuals, master data, plan write, budget ctrl │  core profile
 ├───────────────────────────────┬─────────────────────────────────────┤
 │ Demo / Excel connector        │ On-stack S/4 connector              │
 │ (MY1 and any system)          │ (built and tested in S/4)           │
 │ core profile                  │ s4 profile                          │
 └───────────────────────────────┴─────────────────────────────────────┘
```

- **Engine and application** use only objects released on every target. The release gate enforces
  this on every change (`tools/portability_check.py --profile core`).
- **Connector interfaces** are plain ABAP interfaces owned by this product. The application talks
  only to them.
- **Connectors** implement the interfaces. The demo/Excel connector runs everywhere and feeds MY1.
  The on-stack connector uses S/4-only released CDS views and is built and tested in an S/4 system.
- A **connector contract suite** (ABAP Unit, written against the interfaces) runs against every
  connector, so the S/4 connector is proven by the same tests the demo connector passes.

## Release facts the design depends on

From SAP's Cloudification Repository (commit `cd34bed`, 16 October 2026):

| Object | BTP | Public | Private 2023 | Private 2025 | Consequence |
|---|---|---|---|---|---|
| `I_GLAccountLineItem`, `I_JournalEntryItem`, `I_ActualPlanJournalEntryItem`, `I_FinancialPlanningEntryItem` | no | yes | yes | yes | Actuals and plan data only in the S/4 connector |
| `I_CostCenter`, `I_CostCenterHierarchyNode`, `I_GLAccountHierarchyNode`, `I_ProfitCenter`, `I_CompanyCode` | no | yes | yes | yes | Master data and hierarchies only in the S/4 connector |
| `I_Currency`, `I_ExchangeRateRawData`, `CL_EXCHANGE_RATES`, `I_FiscalYearPeriodForVariant` | yes | yes | yes | yes | Usable in the core |
| `XCO_CP_XLSX`, `CL_APJ_RT_API`, `CL_BGMC_PROCESS_FACTORY`, `CL_NUMBERRANGE_RUNTIME`, `CL_FP_ADS_UTIL` | yes | yes | yes | yes | Excel, jobs, background processing, numbering, PDF in the core |
| `CL_RFC_DESTINATION_PROVIDER`, `CL_HTTP_DESTINATION_PROVIDER` | yes | yes | no | no | Not used; outbound calls are not needed on-stack |
| `CL_AIC_ISLM_COMPL_API_FACTORY` (ABAP AI SDK) | yes | yes | no | yes | Optional feature, off where not released |

Budget control objects differ by product (released budget/funds objects: BTP 5, Public 46,
Private 2023 37, Private 2025 120). In Public Edition, cost-centre/project budget availability control
and public-sector availability control cannot run in parallel. Budget control therefore sits behind
its own connector interface with per-product implementations.

## Writing plan data to S/4

`API_FINPLANNINGDATA_SRV` (Financial Plan Data - Write, SAP_COM_0087) replaces all values inside its
replacement scope: values in scope that are not in the upload are set to zero. No released local ABAP
API for writing plan data was found. The release step therefore uses an explicit scope preflight, an
idempotency key and a sequence fence (see `DESIGN-RULES.md`, release).

## Moving code

- MY1 package `ZIKMAL_PLAN` is under `ZLOCAL` (local software component, not transportable).
- Git is the master copy. Code reaches an S/4 system with abapGit (this folder has the abapGit
  layout; for abapGit the folder becomes the repository root, e.g. `git subtree split`).
- Commercial distribution to many customers later needs an SAP add-on route (partner agreement).

## Hosting constraints

- No BTP region in Malaysia. Malaysian public-sector official data must be hosted onshore (JDN cloud
  security guideline v2.0), so on-stack deployment in the client's onshore S/4 is the default.
- MY1 runs in eu10 (Frankfurt): development and demo data only.
