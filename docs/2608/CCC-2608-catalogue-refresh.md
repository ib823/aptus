# CCC — Refresh the SAP catalogue baseline from 2602 to 2608 (SAP Cloud ERP)

Paste into Claude Code at the repo root (github.com/ib823/aptus, branch main). Work in one branch `feat/catalogue-2608-refresh`, one PR per section, RECON first, no prod writes until the recon is green.

## Context (verified live 2026-09-05)
- SAP S/4HANA Cloud Public Edition (marketing name now **SAP Cloud ERP**) current release is **2608**. Cadence is 2 majors/yr (Feb/Aug) + feature deliveries .1–.4; there was no 2605. Hub package `SAPS4HANACloud` is on Version `2608` (ModifiedAt 2026-07-15).
- Hub package `SAPS4HANACloud`: **859 artefacts = 803 ACTIVE + 56 DEPRECATED** (ODATAV4 342+23, ODATA 188+17, SOAP 273+16). Product view "All" = 943 (includes associated REST packages e.g. Subscription Billing). `SAPS4HANACloudBusinessEvents`: 147 (139 ACTIVE, 8 DEPRECATED).
- Product-page counts: CDS views 9,288 · BAdIs 1,715 · BO interfaces 221 · Integrations 158 · Build 91 · Process Blueprints 16 (Hub subtab "Solution Variants") · VPUC 5 · Analytics 6.
- Inventory-relevant deprecations: `API_PURCHASEORDER_PROCESS_SRV` (V2, wired in `src/lib/sap-public`) → successor `CE_PURCHASEORDER_0001` (V4, SAP_COM_0053). `API_PURCHASEREQ_PROCESS_SRV` → `CE_PURCHASEREQUISITION_0001`. `API_OUTBOUND_DELIVERY_SRV` / `API_INBOUND_DELIVERY_SRV` / `API_CUSTOMER_RETURNS_DELIVERY_SRV` → `_0002`. `API_MAINTENANCEORDER` → `CE_API_MAINTENANCEORDER_0002`. Fixed-asset SOAP (`FIXEDASSETCREATEMAIN/SUB`, `FIXEDASSETCHANGE`, `CO_FAA_MD_ESR_*_CONF`) + comm scenario `SAP_COM_0563` deprecated in 2608 → OData V4 `API_FIXEDASSET_G4BA` via `SAP_COM_0A93` (acq/ret/reval `SAP_COM_0A95`, usage object `SAP_COM_0A96`). `API_CV_ATTACHMENT` needs additional authorisations in 2608. New comm scenario `SAP_COM_0882` (Joule).
- Full 56-name deprecated list, scope-item deltas and SSCUI deltas: `aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx` (tabs Hub Catalogue Live, Scope Delta, SSCUI Delta). 2608 source files: `AB Workbench/2608/`.

## PR-1 — Hub loader: persist State/Version, product-scoped packages
1. In the Hub import path (`hub-content.ts` / `HUB_IMPORT_FILE`), persist per artefact: `State` (ACTIVE|DEPRECATED), `Version`, `ModifiedAt`, `SubType`, and the package `Version` ("2608") as `catalogueRelease`.
2. Stop filtering `ContentPackages` by `substringof('SAPS4HANACloud',Products)` — catalog.svc ignores it (returns unrelated packages). Enumerate packages from a checked-in `sap-references/hub-packages.s4public.json` (APIs `SAPS4HANACloud`, events `SAPS4HANACloudBusinessEvents`, + the CDS/BAdI/BO/Integration/Build/LiveProcess/VPUC/Analytics packages already discovered on 2026-07-21).
3. RECON script: counts by type/state vs the figures above; fail if APIs ≠ 859 ±5 or deprecated < 50.
4. Gate: unit tests for the State mapping; `byStatus` sums unchanged for ACTIVATED/NEEDS_SETUP rows.

## PR-2 — Deprecation surfaced in /sap-explorer
1. New tenant-independent badge `DEPRECATED` (grey-red) with tooltip "Deprecated by SAP — successor: <name>"; successor from a checked-in map `sap-references/api-successors.json` (seed with the pairs above; extend from Hub `Successors` where the logged-in export provides it).
2. Coverage tiles headline itemCount and show "of which N deprecated". Events tile: 147 (8 deprecated).
3. "Probe all" skips DEPRECATED unless `includeDeprecated=true`; deprecated never counts as ACTIVATED in the summary chips.
4. Update the placeholder tiles: Integrations 158 · Build 91 · Process Blueprints 16 · VPUC 5 · Analytics 6 · CDS 9,288 · BAdI 1,715 · BO 221 ("Not loaded · N published (2608)").

## PR-3 — PO connector to OData V4
1. Replace `API_PURCHASEORDER_PROCESS_SRV` with `CE_PURCHASEORDER_0001` (`/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001/`, comm scenario SAP_COM_0053). Keep V2 behind a flag for one release.
2. discover/probe/preview/write parity tests against the TDD tenant (read-only by default; write stays fail-closed).
3. Re-test attachments (`API_CV_ATTACHMENT_SRV`) after the tenant's 2608 upgrade — note the new authorisation requirement.

## PR-4 — Scope catalogue 2602 → 2608
1. Load `AB Workbench/2608/Availability_Dependencies_EN_XX.xlsx` into the scope-item catalogue with `release=2608`; add 13 (5RP, 7ED, 7Z1, 82X, 830, 839, 83B, 83D, 83I, 83S, 85O, 86C, 88K); mark 6 OBSOLETE (1QR, 21T, 2RP, 3FY, 6VB, 7ZH) with successors; mark 9 DEPRECATION_PLANNED (1RK→7MI, 20N, 2OQ→6V2, 4AI→7YM, 4N6→7YH, 6AV→7DO, BH1→4HH, BH2→4HH, BJ2→4HI).
2. SSCUI grounding: load the `2608` sheet of `AB Workbench/2608/SSCUI_List_EN_XX.xlsm` (4,328 IDs; +106/−5). Re-validate the 14 shorthand citations from Content Reconciliation D1 against 2608 real IDs.
3. Process-Steps: reload `BP_CLD_ENTPR_2608_Process-Steps_EN_XX.xlsx` (19,158 rows, 661 items). Keep the 2602 load as a versioned snapshot; the app shows the release of the content it grounds on.
4. Naming: UI copy "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608"; keep technical names in catalogue rows.

## PR-5 — Neutral discovery library re-harvest (flag-off)
1. Re-run the P1 flow extractor against the 2608 Process-Steps file; regenerate `discovery-library.client.json` / `.consultant.json` / `MANIFEST.json` (new hashes); CI vendor-term guard must stay green.
2. Tag the 6 obsolete SAP-base processes `sap_status: retired-2608` (keep as neutral processes); create candidates for the 13 new items with `origin: sap-base-2608`.

## Invariants / gates
- No prod write before RECON is green and reviewed. Preview deploy per PR. Existing 3,982-test suite green. Product-agnostic CI grep green. The catalogue must always display the SAP content release it grounds on.
