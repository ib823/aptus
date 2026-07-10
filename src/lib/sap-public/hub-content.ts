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
  return activatedIds?.has(item.externalId) ? "ACTIVATED" : "AVAILABLE";
}

/**
 * Derive a probeable OData service from an API row, or null if it has no stable
 * runtime endpoint. Only OData V2 APIs use the reliable
 * /sap/opu/odata/sap/<id> convention; V4/SOAP/events/grouped-CDS are not probed
 * here (they'd need per-item service-group metadata), so they stay AVAILABLE.
 */
export function hubApiToService(item: {
  contentType: HubContentType;
  apiType: string | null;
  externalId: string;
  title: string;
  packageId: string | null;
  communicationScenarios: string[];
}): SapServiceDefinition | null {
  if (item.contentType !== "API" || item.apiType !== "ODATAV2") return null;
  return {
    key: item.externalId,
    label: item.title,
    scenario: item.communicationScenarios[0] ?? "",
    path: `/sap/opu/odata/sap/${item.externalId}`,
    domain: item.packageId ?? "",
  };
}
