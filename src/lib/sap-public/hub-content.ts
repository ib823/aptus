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

/**
 * Probe-outcome-driven status. A badge asserts ONLY what a live probe
 * established — un-probed is UNKNOWN (NOT_CHECKED), never a confirmed negative.
 *   ACTIVATED   — probed, live 200 (authorized/reachable)
 *   NEEDS_SETUP — probed, 403/401 (published for this edition; the tenant hasn't
 *                 authorized the SAP_COM_xxxx arrangement). Confirmed negative.
 *   NOT_FOUND   — probed, 404 (service path absent on this tenant). Distinct from 403.
 *   NOT_CHECKED — PROBEABLE (OData) runtime item that hasn't been probed yet.
 *                 UNKNOWN, not a negative — run Probe-all / open it to resolve.
 *   NOT_PROBEABLE — runtime item with NO OData endpoint to probe (SOAP, async,
 *                 apiType null / sap-s4-*). A terminal, honest "can't check here".
 *   AVAILABLE   — EVENT (subscribe-only; no read endpoint, so never probed).
 *   REFERENCE   — design-time content; not a tenant endpoint.
 */
export type HubStatus =
  | "ACTIVATED"
  | "NEEDS_SETUP"
  | "NOT_FOUND"
  | "NOT_CHECKED"
  | "NOT_PROBEABLE"
  | "AVAILABLE"
  | "REFERENCE";

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
 *
 * RECONCILED WITH THE COMMITTED ARTIFACTS (2026-07 snapshot). The previous
 * values contradicted both the drop files this repo ships and the tiles' own
 * help text: SCENARIO said 16 while SCENARIO.json holds 308 and NA_HELP says
 * "Scenarios (308)"; LIVEPROCESS said 0 while 43 were loaded — a tile showing
 * 43 loaded of ~0 published; PROCESS_BLUEPRINT said 15 while its NA_NOTE says
 * it is not a separate content type at all. A drift REFERENCE that disagrees
 * with the data on the same screen measures nothing.
 */
export const S4_PUBLIC_PUBLISHED_COUNTS: Record<HubContentType, number> = {
  API: 862,
  EVENT: 151,
  CDS_VIEW: 8983,
  BADI: 1665,
  BO_INTERFACE: 221,
  INTEGRATION: 158,
  BUILD: 77,
  // Not a separate published type — covered under Scenarios & Live Processes
  // (see ContentTypeTiles.NA_NOTE). Zero here, "n/a by design" on the tile.
  PROCESS_BLUEPRINT: 0,
  LIVEPROCESS: 43,
  SCENARIO: 308,
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
 * A probe result persisted on SapHubContent.rawMetadataJson by the admin
 * Probe-all action (no schema migration). `http` is the $metadata status; `at`
 * is the ISO timestamp; read/write come from the shared deriveReadWrite.
 *
 * PERSISTED SHAPE — tenant-scoped, so one tenant's activations are NEVER served
 * for another: rawMetadataJson.probes = { [tenantKey]: StoredProbe }. A legacy
 * singular rawMetadataJson.probe (pre-tenant-scoping) is read as the DEFAULT
 * tenant's result so the first Probe-all run survives without re-probing.
 */
export interface StoredProbe {
  http?: number;
  at?: string;
  read?: boolean;
  write?: boolean;
}

function coerceProbe(v: unknown): StoredProbe | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const out: StoredProbe = {};
  if (typeof p.http === "number") out.http = p.http;
  if (typeof p.at === "string") out.at = p.at;
  if (typeof p.read === "boolean") out.read = p.read;
  if (typeof p.write === "boolean") out.write = p.write;
  return out;
}

/**
 * Read the persisted probe FOR A SPECIFIC TENANT (or null if that tenant was
 * not probed). Never falls back to another tenant's data. `defaultTenantKey`
 * enables the legacy read: a pre-tenant-scoping singular `probe` is treated as
 * the default tenant's result only.
 */
export function readStoredProbe(raw: unknown, tenantKey: string, defaultTenantKey?: string): StoredProbe | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const probes = root.probes;
  if (probes && typeof probes === "object") {
    return coerceProbe((probes as Record<string, unknown>)[tenantKey]);
  }
  // Legacy singular slot → the default tenant's result ONLY (no cross-tenant leak).
  if (defaultTenantKey && tenantKey === defaultTenantKey) return coerceProbe(root.probe);
  return null;
}

/**
 * Merge a tenant's probe into rawMetadataJson.probes[tenantKey], preserving every
 * sibling key (source/apiId/steps), every OTHER tenant's entry, and the legacy
 * `probe` slot. This is the ONLY sanctioned write path for a stored probe.
 */
export function mergeStoredProbe(raw: unknown, tenantKey: string, probe: StoredProbe): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  const existingProbes =
    base.probes && typeof base.probes === "object" && !Array.isArray(base.probes)
      ? (base.probes as Record<string, unknown>)
      : {};
  base.probes = { ...existingProbes, [tenantKey]: probe };
  return base;
}

/**
 * Whether an item has a live OData endpoint we can $metadata-probe. Mirror of
 * hubApiToService returning non-null: only API / CDS_VIEW carrying an OData
 * apiType are probeable. SOAP, apiType null, sap-s4-*, and non-runtime types are
 * NOT probeable — there is no endpoint to check, so their status is terminal.
 */
export function isProbeable(item: { contentType: HubContentType; apiType: string | null }): boolean {
  return (
    (item.contentType === "API" || item.contentType === "CDS_VIEW") &&
    (item.apiType === "ODATAV2" || item.apiType === "ODATAV4")
  );
}

/**
 * Map a runtime service's live-probe HTTP outcome to a status. `undefined`
 * means the service was NOT probed → NOT_CHECKED (unknown), never a negative.
 * Only a real HTTP code asserts anything; inconclusive results (0 / 5xx) stay
 * NOT_CHECKED so a badge never over-claims what the probe did not establish.
 */
export function httpToRuntimeStatus(http: number | undefined): HubStatus {
  if (http === undefined) return "NOT_CHECKED";
  if (http === 200) return "ACTIVATED";
  if (http === 403 || http === 401) return "NEEDS_SETUP"; // published, not authorized
  if (http === 404) return "NOT_FOUND"; // path absent on this tenant
  return "NOT_CHECKED"; // 0 / 5xx / anything inconclusive — don't over-claim
}

/**
 * Resolve the honest status badge from live-probe OUTCOMES (not just a 200 set).
 *   reference type   → REFERENCE
 *   EVENT            → AVAILABLE (subscribe-only; no read endpoint, never probed)
 *   runtime, probed  → ACTIVATED / NEEDS_SETUP / NOT_FOUND per httpToRuntimeStatus
 *   runtime, un-probed → NOT_CHECKED (UNKNOWN — never NEEDS_SETUP)
 *
 * `probeOutcomes` maps externalId → the HTTP status of its live probe. Only
 * probed services appear; absence means un-probed → NOT_CHECKED. This is what
 * kills the list-vs-detail contradiction: a badge can only assert a confirmed
 * probe result, never a fabricated "Needs setup" for a service never tested.
 */
export function resolveHubStatus(
  item: HubItemForStatus,
  probeOutcomes?: Map<string, number>,
): HubStatus {
  if (!isRuntimeType(item.contentType)) return "REFERENCE";
  // Events are consumed by subscription (CloudEvents), not a readable OData
  // endpoint — nothing to $metadata-probe, so they never reach ACTIVATED.
  // AVAILABLE here means "published, subscribe-only; tenant subscription NOT
  // verified" — never "available in your tenant".
  // TODO: runtime probe — verify a tenant's event subscription (channel/binding)
  //       and promote from AVAILABLE only on a confirmed subscription.
  if (item.contentType === "EVENT") return "AVAILABLE";
  // A stored/live probe outcome is authoritative for any runtime item — even a
  // SOAP row we somehow probed reports its real HTTP result.
  const http = probeOutcomes?.get(item.externalId);
  if (http !== undefined) return httpToRuntimeStatus(http);
  // No outcome: distinguish "probeable but not probed yet" (NOT_CHECKED — run
  // Probe-all / open it) from "no OData endpoint at all" (NOT_PROBEABLE —
  // terminal; SOAP/async/null apiType). Never conflate the two.
  return isProbeable(item) ? "NOT_CHECKED" : "NOT_PROBEABLE";
}

/**
 * Qualifier shown alongside an AVAILABLE badge. EVENTs are "subscribe" (no read
 * endpoint); everything else has no qualifier.
 */
export function hubAvailabilityQualifier(contentType: HubContentType): "subscribe" | null {
  return contentType === "EVENT" ? "subscribe" : null;
}

/**
 * Classify an apiId's protocol from its technical-id conventions, or null when
 * genuinely unknown (honest — a null row shows no protocol chip, stays
 * AVAILABLE). Only assigns a type that yields a VALID probe path; never V2/V4
 * for a `sap-s4-*` wrapper id (its /sap/opu/odata/sap/… path would be broken).
 *   *_IN / *_OUT / *REQUEST / *CONFIRMATION → SOAP (async messaging; not probeable)
 *   *_CDS_*                                 → OData V4
 *   CE_*                                    → OData V4 (public-edition A2X services)
 *   *_SRV[_NNNN]                            → OData V2 (traditional ABAP services)
 *   else                                    → null
 */
export function classifyApiTypeById(apiId: string): "ODATAV2" | "ODATAV4" | "SOAP" | null {
  const id = apiId.trim();
  if (!id) return null;
  if (/^sap-s4-/i.test(id)) return null; // wrapper id — no valid odata path
  if (/(_IN|_OUT)$/i.test(id) || /(REQUEST|CONFIRMATION)$/i.test(id)) return "SOAP";
  if (/_CDS_/.test(id)) return "ODATAV4";
  if (/^CE_/.test(id)) return "ODATAV4";
  if (/_SRV(_\d+)?$/i.test(id)) return "ODATAV2";
  return null;
}

/**
 * Best-effort OData V4 service path from an apiId (BEST-EFFORT, flagged): V4
 * services bind under /sap/opu/odata4/sap/<group>/srvd_a2x/sap/<def>/<version>
 * and the Hub apiId doesn't map 1:1, so this is a candidate only — a 404 keeps
 * the row AVAILABLE, only a live 200 makes it ACTIVATED. Never fabricated.
 */
export function deriveV4Path(externalId: string): string {
  const m = externalId.match(/^(.*?)_(\d+)$/);
  const base = (m?.[1] ?? externalId).toLowerCase();
  const version = m?.[2] ?? "0001";
  return `/sap/opu/odata4/sap/${base}/srvd_a2x/sap/${base}/${version}`;
}

/**
 * Derive a probeable OData service from a runtime row, or null if it has no
 * probeable endpoint. OData V2 uses the reliable /sap/opu/odata/sap/<id> path;
 * OData V4 uses a BEST-EFFORT derived path (deriveV4Path) so a tenant-exposed V4
 * service can still reach ACTIVATED on a live 200 (else it stays AVAILABLE).
 * SOAP, events, grouped-CDS package rows, and null-type rows are not probeable.
 */
export function hubApiToService(item: {
  contentType: HubContentType;
  apiType: string | null;
  externalId: string;
  title: string;
  packageId: string | null;
  communicationScenarios: string[];
}): SapServiceDefinition | null {
  if (item.contentType !== "API" && item.contentType !== "CDS_VIEW") return null;
  let path: string | null = null;
  if (item.apiType === "ODATAV2") path = `/sap/opu/odata/sap/${item.externalId}`;
  else if (item.apiType === "ODATAV4") path = deriveV4Path(item.externalId); // best-effort
  if (!path) return null;
  return {
    key: item.externalId,
    label: item.title,
    scenario: item.communicationScenarios[0] ?? "",
    path,
    domain: item.packageId ?? "",
  };
}
