/**
 * 2608 WS8 — every non-S/4 API this product actually calls, joined to the Hub
 * artefact that says whether SAP still supports it.
 *
 * WHY THIS EXISTS. WS2 taught the importers to read an artefact's `State` from
 * the Business Accelerator Hub, and WS3 surfaced DEPRECATED in the catalogue
 * UI. Both answer "what is the state of this artefact?". Neither answers the
 * question that actually costs us money: **is anything we call deprecated?**
 * Nothing connected a connector's endpoint path to a Hub artefact id, so the
 * Ariba connector sat on two DEPRECATED v1 APIs for a full release and the
 * catalogue that knew it had no way to say so.
 *
 * This is that join. One entry per thing the product calls, naming where it is
 * called from, so `scripts/recon-connectors-2608.ts` can fail CI when a wired
 * API is not ACTIVE.
 *
 * TWO GRANULARITIES, DELIBERATELY. Ariba REST APIs are Hub artefacts one for
 * one — `sourcing_event` is both the thing we call and the thing SAP
 * deprecates, so those entries carry an `apiId` and the check is exact.
 * SuccessFactors is not like that: the connector calls OData *entity sets*
 * under a single `/odata/v2` root, and the Hub publishes *API documents*
 * ("Employment Information") that each describe several entities. `User` is
 * documented across more than one. Asserting `User → ECEmployeeProfile` would
 * be a guess dressed as a mapping, so those entries carry a `packageId` and an
 * `entitySet` instead and the check is at package level. An unmapped entry is
 * reported as unmapped rather than quietly passing.
 *
 * States are not stored here. They are read at check time from
 * `sap-references/api-hub-catalog.json` (harvested from the Hub), so this file
 * records what we depend on and the harvest records what SAP says about it.
 * Nothing here is a claim about SAP's current state.
 */

/** Hub lifecycle states, as the catalogue publishes them. */
export type HubArtefactState = "ACTIVE" | "DEPRECATED" | "DECOMMISSIONED";

export interface WiredApi {
  /** Stable key for this dependency. */
  key: string;
  product: "ariba" | "successfactors" | "fieldglass" | "s4-private";
  /** Hub content package the artefact lives in. */
  packageId: string;
  /**
   * Hub artefact id, when the thing we call IS an artefact. Null when we call
   * an OData entity set inside a package instead — see the header.
   */
  apiId: string | null;
  /** OData entity set, when `apiId` is null. */
  entitySet?: string;
  label: string;
  /** Where in this repository the call is wired. Kept current by hand. */
  wiredAt: string;
  /**
   * The artefact that replaces this one, when the Hub says this one is
   * deprecated. Only ever an id the harvest actually contains — never inferred
   * from a name pattern (that is what `hub-successors.ts` exists to avoid).
   */
  successorApiId?: string;
  /** Why this entry is here, when that is not obvious from the label. */
  note?: string;
}

export const WIRED_APIS: readonly WiredApi[] = [
  // ── SAP Ariba (REST, one artefact per endpoint) ────────────────────────
  {
    key: "ariba.sourcing-events",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "sourcing_event_v2",
    label: "Event Management API 2.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.sourcing-events",
    note: "Migrated in WS8 from sourcing_event v1.0.0, which the Hub marks DEPRECATED.",
  },
  {
    key: "ariba.sourcing-projects",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "sourcing_project_management_v2",
    label: "Sourcing Project Management API 2.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.sourcing-projects",
    note: "Migrated in WS8 from sourcing_project_management v1.0.0, DEPRECATED on the Hub.",
  },
  {
    key: "ariba.suppliers",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "supplierdatapagination_v4",
    label: "Supplier Data API With Pagination 4.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.suppliers",
    note: "v2 and v3 are DEPRECATED and supplierdataaccess with them; v4 is the one to stay on.",
  },
  {
    key: "ariba.contracts",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "retrieve_contract_workspaces",
    label: "Retrieve Contract Workspaces 1.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.contracts",
    note: "The contract-workspace path covers three artefacts (retrieve / modify / state_change); we only read.",
  },
  {
    key: "ariba.analytical-views",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "analytics_reporting_view",
    label: "Analytical Reporting — View Management 1.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.analytical-views",
  },
  {
    key: "ariba.sourcing-reporting-views",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "sourcing_reporting_view",
    label: "Operational Reporting for Sourcing — View Management 1.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.sourcing-reporting-views",
    note: "WS8 split the old ambiguous 'operational reporting' endpoint; this is the sourcing half.",
  },
  {
    key: "ariba.procurement-reporting-views",
    product: "ariba",
    packageId: "SAPAribaOpenAPIs",
    apiId: "procurement_reporting_view_v2",
    label: "Operational Reporting for Procurement 2.0.0",
    wiredAt: "src/lib/sap-public/ariba-connector.ts · ARIBA_ENDPOINTS.procurement-reporting-views",
    note: "The procurement half. v1 (procurement_eventstatus) is DEPRECATED, so this pins v2 explicitly.",
  },

  // ── SAP SuccessFactors (OData entity sets under one /odata/v2 root) ────
  {
    key: "sf.users",
    product: "successfactors",
    packageId: "SuccessFactorsEmployeeCentral",
    apiId: null,
    entitySet: "User",
    label: "Employee Central — User",
    wiredAt: "src/lib/sap-public/tdd-connector.ts · SUCCESSFACTORS_OPERATIONS.users",
    note: "Platform entity documented across several Hub artefacts; no single artefact id to bind to.",
  },
  {
    key: "sf.employment",
    product: "successfactors",
    packageId: "SuccessFactorsEmployeeCentral",
    apiId: null,
    entitySet: "EmpEmployment",
    label: "Employee Central — EmpEmployment",
    wiredAt: "src/lib/sap-public/tdd-connector.ts · SUCCESSFACTORS_OPERATIONS.employment",
  },
  {
    key: "sf.job-requisitions",
    product: "successfactors",
    packageId: "SuccessFactorsRecruiting",
    apiId: null,
    entitySet: "JobRequisition",
    label: "Recruiting — JobRequisition",
    wiredAt: "src/lib/sap-public/tdd-connector.ts · SUCCESSFACTORS_OPERATIONS.jobRequisitions",
  },
  {
    key: "sf.candidates",
    product: "successfactors",
    packageId: "SuccessFactorsRecruiting",
    apiId: null,
    entitySet: "Candidate",
    label: "Recruiting — Candidate",
    wiredAt: "src/lib/sap-public/tdd-connector.ts · SUCCESSFACTORS_OPERATIONS.candidates",
  },
  {
    key: "sf.onboarding-processes",
    product: "successfactors",
    packageId: "SuccessFactorsOnboarding",
    apiId: null,
    entitySet: "ONB2Process",
    label: "Onboarding — ONB2Process",
    wiredAt: "src/lib/sap-public/tdd-connector.ts · SUCCESSFACTORS_OPERATIONS.onboardingProcesses",
  },
];

/** Packages a wired dependency lives in — what the package-level check walks. */
export const WIRED_PACKAGES: readonly string[] = [...new Set(WIRED_APIS.map((a) => a.packageId))];

/** The wired entries that bind to a single Hub artefact and can be checked exactly. */
export function artefactBoundApis(): WiredApi[] {
  return WIRED_APIS.filter((a) => a.apiId !== null);
}

/** The wired entries that can only be checked at package level, and why. */
export function packageBoundApis(): WiredApi[] {
  return WIRED_APIS.filter((a) => a.apiId === null);
}
