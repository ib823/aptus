/**
 * SAP Capability Catalogue — content-type metadata + honest status resolution.
 *
 * Every content type SAP publishes on the Business Accelerator Hub for S/4HANA
 * Cloud Public Edition, split into:
 *   - runtime types (API / EVENT / CDS_VIEW) — a tenant either serves them now
 *     (ACTIVATED, proven by a live 200) or SAP publishes them but the tenant
 *     hasn't activated the communication arrangement yet (AVAILABLE).
 *   - reference types (everything else) — design-time content, not a tenant
 *     endpoint (REFERENCE): show its purpose + a link back to api.sap.com.
 *
 * ACTIVATED is NEVER inferred — only a live $metadata 200 sets it.
 */
import type { SapServiceDefinition } from "@/lib/sap-public/tdd-connector";

export type HubContentType =
  | "API"
  | "EVENT"
  | "CDS_VIEW"
  | "BADI"
  | "BO_INTERFACE"
  | "INTEGRATION"
  | "BUILD"
  | "PROCESS_BLUEPRINT"
  | "LIVEPROCESS"
  | "SCENARIO"
  | "VPUC"
  | "ANALYTICS";

export type HubStatus = "ACTIVATED" | "AVAILABLE" | "REFERENCE";

export interface HubContentTypeMeta {
  label: string;
  /** runtime = probeable endpoint; reference = design-time content. */
  kind: "runtime" | "reference";
  /** The "why it matters" blurb shown at the group header. */
  whyItMatters: string;
}

export const HUB_CONTENT_TYPES: HubContentType[] = [
  "API",
  "EVENT",
  "CDS_VIEW",
  "BADI",
  "BO_INTERFACE",
  "INTEGRATION",
  "BUILD",
  "PROCESS_BLUEPRINT",
  "LIVEPROCESS",
  "SCENARIO",
  "VPUC",
  "ANALYTICS",
];

export const HUB_CONTENT_TYPE_META: Record<HubContentType, HubContentTypeMeta> = {
  API: {
    label: "APIs",
    kind: "runtime",
    whyItMatters: "OData v2/v4 + SOAP — pull and write live business data.",
  },
  EVENT: {
    label: "Events",
    kind: "runtime",
    whyItMatters: "CloudEvents you subscribe to for change-data / push notifications.",
  },
  CDS_VIEW: {
    label: "CDS Views",
    kind: "runtime",
    whyItMatters: "Released VDM views — read + analytics, consumed via OData.",
  },
  BADI: {
    label: "BAdIs",
    kind: "reference",
    whyItMatters:
      "The extension map — how a tenant grows custom fields and custom OData APIs your connector then pulls.",
  },
  BO_INTERFACE: {
    label: "Business Object Interfaces",
    kind: "reference",
    whyItMatters:
      "The extension map — business-object interfaces behind custom fields and custom OData APIs your connector then pulls.",
  },
  INTEGRATION: {
    label: "Integrations",
    kind: "reference",
    whyItMatters:
      "Integration blueprints — SAP's exact endpoints/mappings per connection; copy the pattern to build connectors faster (runs on SAP Integration Suite).",
  },
  BUILD: {
    label: "Build Automations",
    kind: "reference",
    whyItMatters:
      "Proven automations (mass GL upload, mass PO closure) — feature ideas for the accelerator menu (runs on SAP Build).",
  },
  PROCESS_BLUEPRINT: {
    label: "Process Blueprints",
    kind: "reference",
    whyItMatters:
      "The standard SAP end-to-end processes — the Fit-to-Standard baseline to compare a client against.",
  },
  LIVEPROCESS: {
    label: "Live Processes",
    kind: "reference",
    whyItMatters:
      "The standard SAP end-to-end processes — the Fit-to-Standard baseline to compare a client against.",
  },
  SCENARIO: {
    label: "Scenarios",
    kind: "reference",
    whyItMatters:
      "The standard SAP end-to-end processes — the Fit-to-Standard baseline to compare a client against.",
  },
  VPUC: {
    label: "Partner Use Cases",
    kind: "reference",
    whyItMatters: "Validated partner use cases — competitive / market intel for our catalogue.",
  },
  ANALYTICS: {
    label: "Analytics",
    kind: "reference",
    whyItMatters: "Prebuilt SAC dashboard / planning designs — inform our reporting (need SAC to run).",
  },
};

export function isHubContentType(value: string): value is HubContentType {
  return (HUB_CONTENT_TYPES as string[]).includes(value);
}

/**
 * The apiId that identifies an OData service: the last path segment. This is the
 * join key between a probed service and a SapHubContent row —
 *   curated  "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV" → apiId
 *   dynamic   SapHubContent.externalId (== apiId)
 * so an exposed service maps back to its row by externalId, regardless of the
 * curated service's display key ("purchase-orders").
 */
export function pathToApiId(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/**
 * Published SAP Business Accelerator Hub figures for S/4HANA Cloud PUBLIC
 * Edition, used only as a drift reference by the ingest report — NOT as data.
 * Values move with each SAP release, so the report compares "within drift", not
 * for exact equality. CDS/BAdI/BO are stored as grouped rows carrying itemCount,
 * so the report compares the summed itemCount against these totals.
 * (PROCESS_BLUEPRINT + LIVEPROCESS are ~15 combined; assigned to the former.)
 */
export const S4_PUBLIC_PUBLISHED_COUNTS: Record<HubContentType, number> = {
  API: 862,
  EVENT: 147,
  CDS_VIEW: 8983,
  BADI: 1665,
  BO_INTERFACE: 207,
  INTEGRATION: 158,
  BUILD: 78,
  PROCESS_BLUEPRINT: 15,
  LIVEPROCESS: 0,
  SCENARIO: 16,
  VPUC: 5,
  ANALYTICS: 6,
};

export function isRuntimeType(type: HubContentType): boolean {
  return HUB_CONTENT_TYPE_META[type].kind === "runtime";
}

export interface HubItemForStatus {
  contentType: HubContentType;
  apiType: string | null;
  externalId: string;
}

/**
 * Resolve the honest status badge.
 *   reference type                → REFERENCE
 *   EVENT                         → AVAILABLE (subscribe-only; no read endpoint,
 *                                   so never ACTIVATED — see hubAvailabilityQualifier)
 *   runtime + live $metadata 200  → ACTIVATED
 *   runtime, otherwise            → AVAILABLE (published, not confirmed active)
 *
 * `activatedIds` is the set of externalIds whose live probe returned 200.
 * Items not in the set (not probeable / not probed) stay AVAILABLE —
 * ACTIVATED is never inferred.
 */
export function resolveHubStatus(
  item: HubItemForStatus,
  activatedIds?: Set<string>,
): HubStatus {
  if (!isRuntimeType(item.contentType)) return "REFERENCE";
  // Events are consumed by subscription (CloudEvents), not a readable OData
  // endpoint — there is nothing to probe, so they can never reach ACTIVATED.
  if (item.contentType === "EVENT") return "AVAILABLE";
  return activatedIds?.has(item.externalId) ? "ACTIVATED" : "AVAILABLE";
}

/**
 * Qualifier shown alongside an AVAILABLE badge. EVENTs are "subscribe" (no read
 * endpoint); everything else has no qualifier.
 */
export function hubAvailabilityQualifier(contentType: HubContentType): "subscribe" | null {
  return contentType === "EVENT" ? "subscribe" : null;
}

/**
 * Derive a probeable OData service from a runtime row, or null if it has no
 * stable runtime endpoint. An API OR a CDS_VIEW exposed as OData V2 uses the
 * reliable /sap/opu/odata/sap/<id> convention and is probeable — so an active
 * CDS view can reach ACTIVATED. V4/SOAP, events, and grouped-CDS package rows
 * (apiType "CDS") have no single probeable endpoint, so they stay AVAILABLE.
 */
export function hubApiToService(item: {
  contentType: HubContentType;
  apiType: string | null;
  externalId: string;
  title: string;
  packageId: string | null;
  communicationScenarios: string[];
}): SapServiceDefinition | null {
  const probeable = (item.contentType === "API" || item.contentType === "CDS_VIEW") && item.apiType === "ODATAV2";
  if (!probeable) return null;
  // TODO(phase-later): /sap/opu/odata/sap/<externalId> is a convention that
  // won't resolve for every CDS view (many are bound under service groups /
  // different roots). Until the real service-binding path is derived, an
  // unresolved view simply probes 404 → stays AVAILABLE (never fabricated).
  return {
    key: item.externalId,
    label: item.title,
    scenario: item.communicationScenarios[0] ?? "",
    path: `/sap/opu/odata/sap/${item.externalId}`,
    domain: item.packageId ?? "",
  };
}
