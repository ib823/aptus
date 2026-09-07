# aptus data-acquisition — targets 1, 2, 3, 6

Run 2026-09-07 against `docs/2608/DATA-ACQUISITION-BRIEF.md`. Content release 2608,
SAP S/4HANA Cloud Public Edition. Every file carries its own provenance block; this
note is the map, not a substitute for reading them.

## Rules, and how they were kept

- **No scraping of api.sap.com.** The only api.sap.com traffic in this run is the
  anonymous OData catalogue service `catalog.svc`, via `ContentPackages → Artifacts` —
  the route already implemented in `scripts/harvest-sap-api-hub.ts`, which the brief
  says to extend rather than replace. No Hub UI was driven, no page was scripted.
- The Fiori Apps Library and help.sap.com were read through **their own published data
  services** (`SingleApp.xsodata`, `http.svc/pagecontent`), anonymously, not by scraping
  rendered DOM.
- **Never infer a link SAP did not publish.** Every mapping row in target 2 is
  `link_source = PUBLISHED`; there is not one `DERIVED` row in this drop.
- **Empty is data.** No cell was filled with a plausible value. Where a column is empty
  on every row, the provenance says which source would carry it and why it is absent.

## What landed

| file | rows | what it is |
|---|---|---|
| `sap-references/fiori-apps/apps-2608.tsv` | 5,854 | every app FAL publishes for release S37 (= "S/4HANA Cloud 2608"), one row per app |
| `sap-references/comm-scenarios/comm-scenarios.tsv` | 496 | communication scenarios, with the interface ids each one carries |
| `sap-references/comm-scenarios/scope-item-comm-scenarios.tsv` | 1,149 | the scope item ↔ communication scenario bridge, all PUBLISHED |
| `sap-references/comm-scenarios/comm-scenario-name-sources.tsv` | 62 | the page each non-empty scenario name came from |
| `sap-references/restrictions/not-supported.tsv` | 539 | verbatim statements of non-support, one row per statement, each citing its topic |
| `sap-references/hub-harvest/DATA_PRODUCT.json` | 334 | matches `_provenance.unmappedArtifactTypes.DataProduct` exactly |
| `sap-references/hub-harvest/INTEGRATION_ADAPTER.json` | 91 | matches `_provenance.unmappedArtifactTypes.IntegrationAdapter` exactly |
| `harvest-sap-api-hub.ts.patch` | — | the six-line `HUB_TYPE_MAP` extension that produces the two files above |

## Acceptance tests

- **Target 1.** F1577 *Manage Checkbooks* and F1578 *Manage Outgoing Checks* are both
  present. F1577 carries `J60|1WQ|J59`, F1578 carries `J60|1WQ`, and both carry
  `SAP_FIN_BC_AP_CHECK_PC` — the catalog id target 5 says aptus cannot resolve today.
  The blind spot was real and it is closed: SAP *had* attached these apps to scope items,
  in the Fiori Apps Library, just not in the process-step master.
- **Target 2.** 1RO *Integration of Core Master Data* — a pure integration enablement
  item — resolves to SAP_COM_0008, 0009, 0539 and 0540. 78L resolves too. Every one of
  the 1,149 rows carries evidence naming the source table row.

## The three things worth knowing before you use this

**1. The scope-item ↔ API bridge existed all along, and it is one page.**
SAP publishes *Available Interfaces for Your Selected Scope* (SAP_S4HANA_BEST_PRACTICES,
version 2608) as an eight-column table: Scope Item ID · Description · Interface ID ·
Interface Description · Interface Type · Communication Scenario ID · New This Release ·
Link to Set-Up Instructions. 5,658 rows, 354 scope items, 487 scenarios. The brief says
"which APIs does scope item X need?" has no evidence path — it has one, and this is it.

**2. Four columns of `comm-scenarios.tsv` are empty on every row, and they should be.**
`direction`, `auth_methods`, `inbound_services`, `outbound_services`: SAP does not publish
these anywhere reachable without a tenant or a signed-in Process Navigator session. They
are empty because SAP did not publish them, not because the scenarios lack them.

`comm_scenario_name` is filled on 62 of 496. A second pass recovered ~240 more names from
per-scope-item Set-Up Instructions and search hits, and **it was thrown away**: in those
pages the text beside a `SAP_COM_` id is as often a scope item name, an interface name or
a column label as it is the scenario name, and nothing published separates them. Spot
checks caught `SAP_COM_0104 = BAPI_REPMANCONF1_CANCEL` and `SAP_COM_0A95 =
SAP_FIN_BC_AA_POST_REG_PC`. A wrong name in a bid is worse than a blank one.

**3. The not-supported register is the Help-portal slice only.**
55 deliverables, 12,959 topics read, 539 statements kept from 659 matches. The brief's own
example — the RE-FX exclusion from the Malaysian e-invoice solution — is **not in the
file**. It was not on any help.sap.com page reachable without authentication. That class
of statement lives in KBAs on me.sap.com, which needs a signed-in session. Target 9 is
where that gap closes; this file does not pretend to close it.

## Not done

Targets 4, 5, 7, 8, 9. Note that target 5 is now cheap: `apps-2608.tsv` already carries
`business_catalog_ids` and `business_role_ids` for 5,692 and 5,644 apps, and the FAL
entity set `BusinessCatalogPerApp` (9,487 rows for S37) inverts directly into the catalog
master. Target 1's walk is most of target 5's walk.
