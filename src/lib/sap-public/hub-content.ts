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
import type { SapServiceAddressBasis, SapServiceDefinition } from "@/lib/sap-public/tdd-connector";

export type HubContentType =
  | "API"
  | "DATA_PRODUCT"
  | "INTEGRATION_ADAPTER"
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
 *   PROBE_FAILED — a probe RAN and could not reach a verdict (5xx, network
 *                 failure, timeout). Also unknown, but for a different reason and
 *                 with a different fix: NOT_CHECKED means nobody has looked,
 *                 PROBE_FAILED means we looked and the attempt failed. Folding
 *                 the two together hid every tenant-side outage behind "not
 *                 probed yet" and left a re-run with nothing to prioritise.
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
  | "PROBE_FAILED"
  | "NOT_PROBEABLE"
  | "AVAILABLE"
  | "REFERENCE"
  /**
   * 2608 WS3 — SAP has deprecated this artefact (Hub State = DEPRECATED).
   * TENANT-INDEPENDENT and resolved before any probe: a deprecated API that
   * still answers 200 is DEPRECATED, never ACTIVATED, so the summary can never
   * count SAP's own retirements as readiness. The successor, when SAP names
   * one, rides on the row (successorExternalId).
   */
  | "DEPRECATED";

/** Every status bucket, in display order. The scorecard, facets and byStatus all iterate THIS. */
export const HUB_STATUSES: HubStatus[] = [
  "ACTIVATED",
  "NEEDS_SETUP",
  "NOT_FOUND",
  "NOT_CHECKED",
  "PROBE_FAILED",
  "NOT_PROBEABLE",
  "AVAILABLE",
  "REFERENCE",
  "DEPRECATED",
];

/** Tooltip for a DEPRECATED badge — names the SAP successor when one is recorded. */
export function deprecationTooltip(successor: string | null | undefined): string {
  return successor ? `Deprecated by SAP — successor: ${successor}` : "Deprecated by SAP — no successor named yet";
}

/**
 * P0.8 — THE LINE EVERY DEPRECATED ROW SHOWS, in the row itself and not only in
 * a tooltip. The successor was carried on the payload but rendered only as the
 * badge's `title`, which a touch screen never shows and a reader scanning the
 * list never sees, so a deprecated API read like any other row with a red pill.
 *
 * When SAP names a successor (the row's column, else the committed map) the
 * line names it. When it does not, the line says so and where to look — it
 * never invents one: the anonymous Hub feed carries no successor field, and
 * hub-successors.ts exists to refuse inferring one from a name.
 */
export function deprecationHint(successor: string | null | undefined): string {
  return successor
    ? `deprecated by SAP — successor: ${successor}; build on it, not on this`
    : "deprecated by SAP — no successor is recorded; check its api.sap.com page before building on it";
}

export interface HubContentTypeMeta {
  label: string;
  /** runtime = probeable endpoint; reference = design-time content. */
  kind: "runtime" | "reference";
  /** The "why it matters" blurb shown at the group header. */
  whyItMatters: string;
}

export const HUB_CONTENT_TYPES: HubContentType[] = [
  "API",
  "DATA_PRODUCT",
  "INTEGRATION_ADAPTER",
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
      "SAP's published extension POINTS — where a tenant COULD add custom fields and expose custom OData services. Those tenant-specific extensions are not discovered here: this catalogue mirrors SAP's published content, and nothing enumerates a tenant's own services yet.",
  },
  BO_INTERFACE: {
    label: "Business Object Interfaces",
    kind: "reference",
    whyItMatters:
      "SAP's published business-object interfaces — the design-time surface behind a tenant's custom fields and custom OData services. A tenant's actual extensions are not listed here; nothing enumerates them yet.",
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
  // 2608 WS13 — the two types the harvest counted and refused to carry until now.
  DATA_PRODUCT: {
    label: "Data Products",
    kind: "reference",
    whyItMatters: "Published data products — design-time contracts for analytical consumption, not tenant endpoints.",
  },
  INTEGRATION_ADAPTER: {
    label: "Integration Adapters",
    kind: "reference",
    whyItMatters: "SAP Integration Suite adapters — what a middleware tier can connect with, not what a tenant has.",
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

/** The SAP content release the published figures below were read for. */
export const S4_PUBLIC_PUBLISHED_RELEASE = "2608";

/**
 * Published SAP Business Accelerator Hub figures for S/4HANA Cloud PUBLIC
 * Edition at release 2608, used as a drift reference by the tiles, the
 * catalogue-health endpoint and the ingest report — NOT as data. They move
 * with each SAP release, so consumers compare "within drift", never for
 * equality. CDS/BAdI/BO are stored as grouped rows carrying itemCount, so the
 * report compares the summed itemCount against these totals.
 *
 * SOURCES (2608 WS3, verified 2026-09-05 — docs/2608/BUILD-LOG.md):
 *   - API, EVENT, CDS_VIEW, BADI, BO_INTERFACE, SCENARIO, LIVEPROCESS: the
 *     anonymous catalogue enumeration checked in as
 *     sap-references/hub-packages.s4public.json (scripts/recon-hub-2608.ts
 *     gates 859 ±5 / 147 / 9,288 / 1,715 / 221 / 16 scenario packages).
 *   - INTEGRATION 158, BUILD 91, VPUC 5, ANALYTICS 6, PROCESS_BLUEPRINT 16: the
 *     logged-in product page (CCC-2608-catalogue-refresh.md), which counts a
 *     view the anonymous walk cannot see the same way (142 / 29 / 0 exact-tag
 *     packages). PROCESS_BLUEPRINT is the Hub's "Process Blueprints" tab (URL
 *     …/businessprocess/solutionvariants, labelled Solution Variants) — 16 in
 *     2608, so it is no longer "n/a by design".
 */
export const S4_PUBLIC_PUBLISHED_COUNTS: Record<HubContentType, number> = {
  API: 859,
  EVENT: 147,
  CDS_VIEW: 9288,
  BADI: 1715,
  BO_INTERFACE: 221,
  INTEGRATION: 158,
  BUILD: 91,
  PROCESS_BLUEPRINT: 16,
  LIVEPROCESS: 41,
  SCENARIO: 308,
  VPUC: 5,
  ANALYTICS: 6,
  /*
   * 2608 WS13 — ZERO IS THE MEASURED ANSWER, not a count nobody has taken.
   *
   * The Hub publishes 334 data products and 91 integration adapters, and
   * sap-references/hub-harvest/ carries every one of them. Cross-referenced
   * against the 235 packages in hub-packages.s4public.json, the number that
   * belong to SAP S/4HANA Cloud Public Edition is 0 and 0. They are real Hub
   * content owned by other products, which is exactly why the drift report
   * should expect none of them here.
   */
  DATA_PRODUCT: 0,
  INTEGRATION_ADAPTER: 0,
};

/** Deprecated counts SAP publishes at 2608 for the types that carry a Hub State (drift reference). */
export const S4_PUBLIC_PUBLISHED_DEPRECATED: Partial<Record<HubContentType, number>> = {
  API: 56,
  EVENT: 8,
  CDS_VIEW: 424,
  BADI: 24, // SteamPunk package: 24 deprecated across BAdIs + BO interfaces
};

export function isRuntimeType(type: HubContentType): boolean {
  return HUB_CONTENT_TYPE_META[type].kind === "runtime";
}

export interface HubItemForStatus {
  contentType: HubContentType;
  apiType: string | null;
  externalId: string;
  /** Hub State as published ("ACTIVE" | "DEPRECATED" | …); null/undefined = unknown → no effect. */
  hubState?: string | null | undefined;
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
 * A STORED PROBE IS A MEMORY, NOT A STATUS, once it is old enough.
 *
 * Discover rendered a 403 recorded on 29 July as "Needs setup" on 11 September,
 * while the same service answered 200 to a data read that day. The vocabulary
 * was honest about WHAT the probe found and silent about WHEN; six weeks on, the
 * badge was asserting a fact about a tenant that had since been fixed. Past
 * this age a stored outcome no longer sets a badge — the row reads NOT_CHECKED,
 * with the old date carried beside it so the reader knows there IS a memory
 * and can re-probe. The overlay (?dataProbe=1) and Probe-all write fresh
 * timestamps and are unaffected.
 *
 * An UNDATED probe (written before `at` existed) cannot be aged and keeps its
 * verdict; the UI says the date is unrecorded rather than inventing one.
 */
export const PROBE_MAX_AGE_DAYS = 30;

export function isProbeStale(at: string | undefined, now: Date = new Date()): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t > PROBE_MAX_AGE_DAYS * 86_400_000;
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
 * WHOSE PROBE THIS IS — the key a stored result is filed under.
 *
 * THE BUG THIS CLOSES IS A CROSS-TENANT LEAK, and it is worth stating exactly,
 * because the shape of the data hides it. `SapHubContent` has NO
 * `organizationId`: it is `@@unique([contentType, externalId])`, one global row
 * per SAP content item, shared by every organization on the deployment. Probe
 * results are merged into `rawMetadataJson.probes[…]` on those shared rows.
 *
 * The key used to be the bare tenant key. But `SapConnection` is
 * `@@unique([organizationId, product, key])` — a tenant key is unique WITHIN an
 * organization, not across them. Two clients may both call a connection
 * "x5m-100", and nothing prevents it. When they did, they shared one slot on a
 * shared row: the second probe overwrote the first, and the first client's
 * Discover then showed the SECOND client's verdicts about the SECOND client's
 * SAP system, labelled as its own tenant. Which services are live on a named
 * client's estate is that client's information, and the page it appears on
 * argues that "a badge only asserts what a probe established".
 *
 * `requireAdmin` on the probe route never prevented this — it only made the
 * collision rarer by limiting who could trigger one.
 *
 * SO THE OWNER IS PART OF THE KEY. A connection-backed tenant is filed under
 * its organization and product as well as its name; a DEPLOYMENT tenant keeps
 * its bare key, because that one genuinely is deployment-wide and every
 * organization reading it is reading the same true thing. Conflating those two
 * kinds of tenant is what caused this.
 *
 * ONE FUNCTION, THREE CALL SITES: the write in probe-all and the two reads.
 * A storage key derived independently in each place is a key that drifts, and
 * a drifted key here reads as "Not checked" at best and as someone else's
 * tenant at worst.
 */
export function probeStorageKey(input: {
  /** Which registry the tenant came from — `resolveReadTenant` reports it. */
  readonly source: "deployment" | "connection";
  readonly organizationId: string | null;
  readonly product: string;
  readonly tenantKey: string;
}): string {
  if (input.source === "deployment") return input.tenantKey;
  // A connection with no organization cannot exist; if one is ever passed,
  // file it somewhere unreadable rather than in the shared bare-key slot.
  const owner = input.organizationId ?? "unknown-org";
  return `org:${owner}:${input.product}:${input.tenantKey}`;
}

/**
 * Merge a tenant's probe into rawMetadataJson.probes[tenantKey], preserving every
 * sibling key (source/apiId/steps), every OTHER tenant's entry, and the legacy
 * `probe` slot. This is the DEFINITION of a stored-probe write.
 *
 * It preserves what is in the value it is given, and only that — so a writer
 * that hands it a copy read minutes earlier erases whatever other tenants stored
 * since (audit A23). The persisted write is therefore `persistStoredProbe`
 * (hub-probe-store.ts), which performs this same merge inside the database on
 * the row's current value; its tests use this function as the oracle.
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
 * P0.8 — SAP'S `sap-s4-*` WRAPPER LISTINGS HAVE NO ADDRESS OF THEIR OWN.
 *
 * The Hub lists some S/4 services under a wrapper id
 * ("sap-s4-CE_RETAILSEASON_0001-v1") instead of the service's technical name,
 * and the import gives them an OData apiType like any other row. Building an
 * address from the wrapper id produces /sap/opu/odata/sap/sap-s4-…-v1 or the
 * odata4 equivalent — malformed by construction. The comments here and on
 * classifyApiTypeById said these were not probeable, but nothing checked the
 * prefix once an apiType was present, so 148 production rows were offered as
 * probeable and counted as services with an endpoint.
 *
 * The wrapped id inside is NOT assumed to be the address either: that would
 * be another guess, and none of the 362 wrapped ids in the committed snapshot
 * appears as a row of its own to check it against.
 */
export function isWrapperApiId(externalId: string): boolean {
  return /^sap-s4-/i.test(externalId.trim());
}

/**
 * Which product family's address rules apply to a catalogue row (P0.8).
 *   s4             — every S/4 edition: per-service addresses
 *   successfactors — one OData V2 root for every API (SF_ODATA_V2_ROOT)
 *   none           — ECC, Ariba, anything else: no address is derived
 * The same split as hubCatalogueScope (dynamic-catalog.ts), kept pure here so
 * the client-safe status resolver can use it.
 */
export type CatalogueAddressFamily = "s4" | "successfactors" | "none";

export function catalogueAddressFamily(product: { key: string; edition: string | null }): CatalogueAddressFamily {
  if (product.key === "ecc") return "none";
  if (product.edition) return "s4";
  if (product.key === "successfactors") return "successfactors";
  return "none";
}

/**
 * SuccessFactors serves every OData V2 API from ONE root, and the entity sets
 * under it are what tell the APIs apart (tdd-connector's SUCCESSFACTORS_SERVICES
 * models its curated services the same way).
 */
export const SF_ODATA_V2_ROOT = "/odata/v2";

export type CatalogueAddressBasis = SapServiceAddressBasis;

export interface CatalogueAddress {
  path: string;
  protocol: "ODATAV2" | "ODATAV4";
  basis: CatalogueAddressBasis;
}

/**
 * THE ONE PLACE A CATALOGUE ROW BECOMES AN ADDRESS, or null when it has none.
 *
 *   S/4 OData V2  → /sap/opu/odata/sap/<apiId>             (convention)
 *   S/4 OData V4  → KNOWN_V4_SERVICE_PATHS[apiId]           (known-binding)
 *                   else deriveV4Path(apiId)                (derived — a guess)
 *   SF  OData V2  → /odata/v2                               (product-root)
 *   wrapper rows, SOAP, REST, events, reference content, SF V4, ECC, Ariba → null
 *
 * A V4 address of either basis is "unverified" on a system until a probe of
 * that exact address answers 200 there (catalogue-address-verification.ts).
 */
export function catalogueAddress(
  item: { contentType: HubContentType; apiType: string | null; externalId: string },
  family: CatalogueAddressFamily = "s4",
): CatalogueAddress | null {
  if (item.contentType !== "API" && item.contentType !== "CDS_VIEW") return null;
  if (family === "successfactors") {
    // CDS views and V4 APIs are not under the V2 root; their own roots are not
    // derivable from a Hub id, so they get no address rather than a guess.
    if (item.contentType === "API" && item.apiType === "ODATAV2") {
      return { path: SF_ODATA_V2_ROOT, protocol: "ODATAV2", basis: "product-root" };
    }
    return null;
  }
  if (family !== "s4") return null;
  if (isWrapperApiId(item.externalId)) return null;
  if (item.apiType === "ODATAV2") {
    return { path: `/sap/opu/odata/sap/${item.externalId}`, protocol: "ODATAV2", basis: "convention" };
  }
  if (item.apiType === "ODATAV4") {
    const known = KNOWN_V4_SERVICE_PATHS[item.externalId];
    return known
      ? { path: known, protocol: "ODATAV4", basis: "known-binding" }
      : { path: deriveV4Path(item.externalId), protocol: "ODATAV4", basis: "derived" };
  }
  return null;
}

/**
 * Whether an item has a live OData endpoint of ITS OWN that we can
 * $metadata-probe: an S/4 row with an address (catalogueAddress). SOAP, apiType
 * null, `sap-s4-*` wrappers and non-runtime types are NOT probeable — there is
 * no endpoint to check, so their status is terminal. Nor is a SuccessFactors
 * row: its address is the shared /odata/v2 root, and a 200 from the root says
 * nothing about one API's entity sets.
 */
export function isProbeable(
  item: { contentType: HubContentType; apiType: string | null; externalId: string },
  family: CatalogueAddressFamily = "s4",
): boolean {
  return family === "s4" && catalogueAddress(item, family) !== null;
}

/**
 * Map a runtime service's live-probe HTTP outcome to a status. `undefined`
 * means the service was NOT probed → NOT_CHECKED (unknown), never a negative.
 * Only a real HTTP code asserts anything; inconclusive results (0 / 5xx) stay
 * NOT_CHECKED so a badge never over-claims what the probe did not establish.
 */
export function httpToRuntimeStatus(http: number | undefined): HubStatus {
  if (http === undefined) return "NOT_CHECKED"; // nobody has looked yet
  if (http === 200) return "ACTIVATED";
  if (http === 403 || http === 401) return "NEEDS_SETUP"; // published, not authorized
  if (http === 404) return "NOT_FOUND"; // path absent on this tenant
  /*
   * WE LOOKED AND THE ATTEMPT FAILED — 0 (network/timeout), 5xx, anything
   * inconclusive. Still not a negative about the capability, so it must never
   * read as NEEDS_SETUP or NOT_FOUND. But it is not "not checked" either: that
   * conflation meant a tenant returning 500 for a whole run was indistinguishable
   * from one that had never been probed, so nothing surfaced the outage and a
   * re-run could not tell which rows were worth retrying.
   */
  return "PROBE_FAILED";
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
  family: CatalogueAddressFamily = "s4",
): HubStatus {
  // 2608 WS3 — SAP's own retirement wins over everything, tenant or not: a
  // deprecated service that still answers 200 must never read as ACTIVATED.
  if (item.hubState === "DEPRECATED") return "DEPRECATED";
  if (!isRuntimeType(item.contentType)) return "REFERENCE";
  // Events are consumed by subscription (CloudEvents), not a readable OData
  // endpoint — nothing to $metadata-probe, so they never reach ACTIVATED.
  // AVAILABLE here means "published, subscribe-only; tenant subscription NOT
  // verified" — never "available in your tenant".
  // TODO: runtime probe — verify a tenant's event subscription (channel/binding)
  //       and promote from AVAILABLE only on a confirmed subscription.
  if (item.contentType === "EVENT") return "AVAILABLE";
  // P0.8 — a wrapper row's stored outcome is the answer to a MALFORMED address
  // (Probe-all reached these rows before they were excluded), so it says
  // nothing about the service and must not set a badge.
  if (isWrapperApiId(item.externalId)) return "NOT_PROBEABLE";
  // A stored/live probe outcome is authoritative for any other runtime item —
  // even a SOAP row we somehow probed reports its real HTTP result.
  const http = probeOutcomes?.get(item.externalId);
  if (http !== undefined) return httpToRuntimeStatus(http);
  // No outcome: distinguish "probeable but not probed yet" (NOT_CHECKED — run
  // Probe-all / open it) from "no OData endpoint at all" (NOT_PROBEABLE —
  // terminal; SOAP/async/null apiType). Never conflate the two.
  return isProbeable(item, family) ? "NOT_CHECKED" : "NOT_PROBEABLE";
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
 *
 * P0.8: the one V4 address this repo has checked against a real system
 * (CE_PURCHASEORDER_0001) is NOT what this produces, so a derived address is
 * labelled "unverified" on every screen until a probe of it answers 200 on the
 * system in question, and that answer is recorded per connection.
 */
export function deriveV4Path(externalId: string): string {
  const m = externalId.match(/^(.*?)_(\d+)$/);
  const base = (m?.[1] ?? externalId).toLowerCase();
  const version = m?.[2] ?? "0001";
  return `/sap/opu/odata4/sap/${base}/srvd_a2x/sap/${base}/${version}`;
}

/**
 * 2608 WS4 — V4 service bindings this repo has VERIFIED (the derived candidate
 * above is wrong for them: the service group and definition differ from the
 * apiId). Consulted before deriveV4Path. Add a row only with its source.
 *   CE_PURCHASEORDER_0001 — CCC-2608-catalogue-refresh.md PR-3 §1 (SAP_COM_0053).
 */
export const KNOWN_V4_SERVICE_PATHS: Readonly<Record<string, string>> = {
  CE_PURCHASEORDER_0001: "/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001",
};

/**
 * The Hub apiId (== SapHubContent.externalId) a curated service stands for.
 * V4 paths end in a version segment, so the declared hubApiId wins; a V2
 * path's last segment IS the apiId.
 */
export function serviceApiId(service: Pick<SapServiceDefinition, "path" | "hubApiId">): string {
  return service.hubApiId ?? pathToApiId(service.path);
}

/**
 * Derive an OData service from a runtime row, or null if it has no address
 * (catalogueAddress decides, for the row's product family). OData V2 uses the
 * reliable /sap/opu/odata/sap/<id> path; OData V4 uses a BEST-EFFORT derived
 * path (deriveV4Path) so a tenant-exposed V4 service can still reach ACTIVATED
 * on a live 200 (else it stays AVAILABLE). SOAP, events, grouped-CDS package
 * rows, null-type rows and `sap-s4-*` wrappers have none. `addressBasis` says
 * which rule produced the path.
 */
export function hubApiToService(
  item: {
    contentType: HubContentType;
    apiType: string | null;
    externalId: string;
    title: string;
    packageId: string | null;
    communicationScenarios: string[];
  },
  family: CatalogueAddressFamily = "s4",
): SapServiceDefinition | null {
  const address = catalogueAddress(item, family);
  if (!address) return null;
  return {
    key: item.externalId,
    label: item.title,
    scenario: item.communicationScenarios[0] ?? "",
    path: address.path,
    domain: item.packageId ?? "",
    protocol: address.protocol,
    hubApiId: item.externalId,
    addressBasis: address.basis,
  };
}
