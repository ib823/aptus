/**
 * Tenant service discovery: what a tenant's own SAP Gateway catalogue lists,
 * and what CoreEdge may do with each entry (roadmap P1.2).
 *
 * WHY. Discover knew only SAP's published catalogue, so a customer's own
 * services (a Z* RAP service, a YY1_* key-user CDS view) could be found only
 * by someone who already knew their path. A Gateway system lists the services
 * it serves in its catalogue service; this module reads that list's answer,
 * and the connector (tdd-connector.ts, listGatewayCatalogue) sends the
 * requests, through the console pipeline's callSap like every other console
 * read.
 *
 * THE LISTING IS "WHAT THIS USER'S CATALOGUE REPORTS", NEVER "EVERYTHING THE
 * SYSTEM HAS". Whether the V2 ServiceCollection lists only the services the
 * caller is authorised for, or every registered one, is not documented by SAP
 * [unverified], and nor are the property names of an entry beyond `ID`. So
 * only `ID` is required; the others are read when present, every string is
 * capped, and an entry that does not parse is dropped and counted.
 *
 * NO URL FROM THE LISTING IS EVER REQUESTED. `ServiceUrl` is tenant-supplied
 * and may name any host. Paging uses CoreEdge's own `$skip`, never the
 * server's `__next`; a listed address becomes a PATH only when it is on the
 * connection's own origin (or relative) and passes validateServicePath, and
 * the host of every later call comes from the connection, as it always has
 * (sap-url.ts).
 *
 * SAP API POLICY §1.2. A tenant's catalogue lists many SAP services that are
 * not Published APIs (Fiori UI services, C_*_SRV). Each entry is classified
 * (classifyService), and only a Published or a customer-built one is offered
 * an action.
 *
 * CLIENT-SAFE. No server imports, so Discover's panel renders the same
 * classes and badges the API stored.
 */

import { z } from "zod";

import { validateServicePath, type ODataVersion } from "./service-path";

/** The OData V2 catalogue service (SAP Help, "Catalog Service", version 2): its service id is /IWFND/SG_MED_CATALOG_0002. */
export const V2_CATALOGUE_PATH = "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2";
/** The OData V4 catalogue's service group (SAP Help, "Service Catalog", OData V4) [partially verified]. */
export const V4_CATALOGUE_PATH = "/sap/opu/odata4/iwfnd/config/default/iwfnd/catalog/0002";

/**
 * EVERY LIMIT OF ONE LISTING. A catalogue body is tenant-supplied, read on a
 * 2 GB instance every organisation shares: each page is read through
 * bodyPrefix (decoded bytes, so a compression bomb stops at the bound), at
 * most `maxPages` of them, within `deadlineMs` in all, and the listing stops
 * at `maxEntries`. What is stored is checked against `storedBytes` before it
 * is written.
 */
export const LISTING_LIMITS = {
  pageSize: 500,
  maxPages: 10,
  maxEntries: 5_000,
  pageBytes: 2 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  deadlineMs: 20_000,
  storedBytes: 1024 * 1024,
} as const;

export type ListingLimits = { readonly [K in keyof typeof LISTING_LIMITS]: number };

/** How the catalogue answered, as a whole. */
export const CATALOGUE_STATUSES = ["OK", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "TRUNCATED", "ERROR"] as const;
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number];

/** How the V4 service-group catalogue answered; NOT_TRIED on S/4HANA Cloud Public Edition or without the opt-in. */
export type V4CatalogueStatus = "NOT_TRIED" | "OK" | "UNAUTHORIZED" | "NOT_FOUND" | "ERROR";

/**
 * What an entry is, for SAP API Policy §1.2 (see classifyService):
 *   PUBLISHED            on the Business Accelerator Hub, one of CoreEdge's
 *                        curated services, or named in SAP's communication
 *                        scenario documentation (2608)
 *   CUSTOMER_KEY_USER    YY1_*: key-user extensibility
 *   CUSTOMER_DEVELOPER   Z* or Y*: developer extensibility
 *   SAP_UNPUBLISHED      an SAP service that is not a Published API
 *   UNKNOWN_NAMESPACE    /NS/… in a namespace SAP's sources do not name:
 *                        a partner's or the customer's
 */
export const SERVICE_CLASSES = [
  "PUBLISHED",
  "CUSTOMER_KEY_USER",
  "CUSTOMER_DEVELOPER",
  "SAP_UNPUBLISHED",
  "UNKNOWN_NAMESPACE",
] as const;
export type ServiceClass = (typeof SERVICE_CLASSES)[number];

/** One service as the catalogue listed it, parsed and capped, before it is classified. */
export interface CatalogueEntry {
  /** The catalogue's own key: `<TECHNICAL NAME>_<4-digit version>` for V2; group, service and version for V4. */
  readonly id: string;
  /** The technical service name (V2) or the service group (V4), with its namespace when it has one. */
  readonly technicalName: string;
  /** Four digits. */
  readonly version: string;
  readonly odataVersion: ODataVersion;
  /** The address the catalogue gave, unvalidated: never requested (servicePathFromEntry). */
  readonly serviceUrl: string | null;
  readonly title: string | null;
}

/** One stored entry of a listing (TenantServiceListing.entries): no credential, no host, no URL. */
export interface ListingEntry {
  readonly id: string;
  readonly technicalName: string;
  readonly version: string;
  readonly odataVersion: ODataVersion;
  /** Validated and on the connection's origin, or null: an entry without one gets no Register action. */
  readonly path: string | null;
  readonly title: string | null;
  readonly class: ServiceClass;
  /** The catalogue row it is, when the catalogue has one. */
  readonly catalogueExternalId: string | null;
  /** The communication scenarios SAP lists it under, newest content release, exact matches only. */
  readonly scenarioIds: readonly string[];
}

/* ── caps ─────────────────────────────────────────────────────────────── */

const MAX_ID = 160;
const MAX_TITLE = 200;
const MAX_URL = 2_048;
/** A Gateway service name, with an optional /NAMESPACE/ prefix. */
const TECHNICAL_NAME = /^(?:\/[A-Za-z0-9_]{1,30}\/)?[A-Za-z0-9_]{1,120}$/;
/** A V2 catalogue id: the technical name and a four-digit version. */
const V2_ID = /^((?:\/[A-Za-z0-9_]{1,30}\/)?[A-Za-z0-9_]{1,120}?)_(\d{4})$/;
const V4_NAME = /^[A-Za-z0-9_]{1,120}$/;
const DIGITS = /^\d{1,4}$/;

/** A title as text: control characters out, capped. Rendered as text, never as markup or a link. */
function capText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (clean === "") return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function version4(value: unknown): string | null {
  const text = typeof value === "number" && Number.isInteger(value) ? String(value) : typeof value === "string" ? value.trim() : null;
  if (text === null || !DIGITS.test(text) || Number(text) === 0) return null;
  return text.padStart(4, "0");
}

/* ── the V2 ServiceCollection ─────────────────────────────────────────── */

/**
 * The fields read from a V2 entry. Unknown fields are not read at all (zod
 * strips them), so a hostile entry's extra keys — `__proto__` among them —
 * never reach an object this module builds.
 */
const V2_ENTRY = z.object({
  ID: z.string().min(1).max(MAX_ID),
  TechnicalServiceName: z.string().max(MAX_ID).optional(),
  TechnicalServiceVersion: z.union([z.string().max(8), z.number()]).optional(),
  ServiceUrl: z.string().max(MAX_URL).optional(),
  Title: z.string().optional(),
  Description: z.string().optional(),
});

export interface ParsedPage {
  /** The page's entries, at most `pageSize` (a hostile page that sends more is cut). */
  readonly entries: CatalogueEntry[];
  /** Entries present but not usable: no ID, a malformed one, a field past its cap. */
  readonly dropped: number;
  /** How many entries the page carried, before the cut: a page shorter than the size asked is the last. */
  readonly listed: number;
}

/** The array an OData V2 JSON answer carries its entries in (`d.results`, or `d` itself in the oldest form). */
function v2Results(json: unknown): unknown[] | null {
  if (!json || typeof json !== "object") return null;
  const d = (json as { d?: unknown }).d;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    const results = (d as { results?: unknown }).results;
    if (Array.isArray(results)) return results;
  }
  return null;
}

/**
 * One page of `ServiceCollection?$format=json`, or null when the text is not
 * such a page. JSON.parse is native and does not recurse in JavaScript, and
 * the walk below reads only `d.results[i]`'s known fields, so a deeply nested
 * or very wide body costs its parse and no more.
 */
export function parseServiceCollectionPage(text: string, pageSize: number = LISTING_LIMITS.pageSize): ParsedPage | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const results = v2Results(json);
  if (results === null) return null;
  const entries: CatalogueEntry[] = [];
  let dropped = 0;
  for (const raw of results.slice(0, pageSize)) {
    const entry = v2Entry(raw);
    if (entry) entries.push(entry);
    else dropped += 1;
  }
  return { entries, dropped, listed: results.length };
}

function v2Entry(raw: unknown): CatalogueEntry | null {
  const parsed = V2_ENTRY.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  /*
   * THE NAME AND VERSION COME FROM THE KEY. SAP documents the key's form —
   * `ServiceCollection('%2FIWFND%2FSG_MED_CATALOG_0002')` is the catalogue's
   * own entry, `<technical name>_<version>` with its namespace — and not the
   * other properties' names. Only a key without a version suffix falls back
   * to TechnicalServiceName and TechnicalServiceVersion.
   */
  const match = V2_ID.exec(e.ID);
  const technicalName = match ? match[1]! : e.TechnicalServiceName;
  const version = match ? match[2]! : (version4(e.TechnicalServiceVersion) ?? "0001");
  if (!technicalName || !TECHNICAL_NAME.test(technicalName) || Number(version) === 0) return null;
  return {
    id: match ? e.ID.toUpperCase() : `${technicalName.toUpperCase()}_${version}`,
    technicalName: technicalName.toUpperCase(),
    version,
    odataVersion: "V2",
    serviceUrl: e.ServiceUrl ?? null,
    title: capText(e.Title, MAX_TITLE) ?? capText(e.Description, MAX_TITLE),
  };
}

/* ── the V4 service groups ────────────────────────────────────────────── */

const V4_SERVICE = z.object({
  ServiceId: z.string().min(1).max(MAX_ID),
  ServiceVersion: z.union([z.string().max(8), z.number()]).optional(),
  ServiceUrl: z.string().max(MAX_URL).optional(),
  Description: z.string().optional(),
});
const V4_GROUP = z.object({
  GroupId: z.string().min(1).max(MAX_ID),
  Description: z.string().optional(),
  DefaultSystem: z.object({ Services: z.array(z.unknown()).optional() }).optional(),
});

/**
 * One page of the V4 catalogue's `ServiceGroups?$expand=DefaultSystem($expand=Services)`,
 * or null when the text is not one. Each service of each group is an entry;
 * its address is read from `ServiceUrl` only, never guessed from the names
 * (a V4 binding's path is not derivable from them: P0.8).
 */
export function parseV4ServiceGroups(text: string, maxEntries: number = LISTING_LIMITS.pageSize): ParsedPage | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const groups = json && typeof json === "object" ? (json as { value?: unknown }).value : undefined;
  if (!Array.isArray(groups)) return null;
  const entries: CatalogueEntry[] = [];
  let dropped = 0;
  let listed = 0;
  for (const rawGroup of groups) {
    if (entries.length >= maxEntries) break;
    const group = V4_GROUP.safeParse(rawGroup);
    if (!group.success || !V4_NAME.test(group.data.GroupId)) {
      dropped += 1;
      continue;
    }
    for (const rawService of group.data.DefaultSystem?.Services ?? []) {
      listed += 1;
      if (entries.length >= maxEntries) break;
      const service = V4_SERVICE.safeParse(rawService);
      const version = service.success ? version4(service.data.ServiceVersion) : null;
      if (!service.success || !V4_NAME.test(service.data.ServiceId) || version === null) {
        dropped += 1;
        continue;
      }
      const groupId = group.data.GroupId.toUpperCase();
      entries.push({
        id: `${groupId}/${service.data.ServiceId.toUpperCase()}/${version}`,
        technicalName: groupId,
        version,
        odataVersion: "V4",
        serviceUrl: service.data.ServiceUrl ?? null,
        title: capText(service.data.Description, MAX_TITLE) ?? capText(group.data.Description, MAX_TITLE),
      });
    }
  }
  return { entries, dropped, listed };
}

/* ── an entry's path ──────────────────────────────────────────────────── */

/**
 * The service path CoreEdge may store for an entry, or null.
 *
 *   - `ServiceUrl` is parsed by the WHATWG parser, relative to `requestUrl`
 *     (the catalogue request it came from, on the connection's own host), so
 *     a relative address resolves as a browser would and a `..` cannot climb
 *     out of the root unnoticed: the parser removes it, and the result is
 *     judged.
 *   - Only an http(s) address on the connection's ORIGIN is kept, and only
 *     its path: a query (`sap-client`) and a fragment are dropped, because
 *     CoreEdge places the client itself. A connection whose base URL has a
 *     path of its own keeps only paths under it, without it.
 *   - Without `ServiceUrl`, an OData V2 entry's path follows Gateway's
 *     documented convention, `/sap/opu/odata/<namespace or sap>/<name>`, with
 *     `;v=` for a version past 0001. A V4 entry's never does: its binding is
 *     not derivable from its names.
 *   - Whatever came out must pass validateServicePath, the rule every
 *     registered path passes.
 */
export function servicePathFromEntry(
  entry: Pick<CatalogueEntry, "technicalName" | "version" | "odataVersion" | "serviceUrl">,
  connection: { readonly baseUrl: string },
  requestUrl?: string,
): string | null {
  let base: URL;
  try {
    base = new URL(connection.baseUrl);
  } catch {
    return null;
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  let path: string | null = null;
  if (entry.serviceUrl) {
    let url: URL;
    try {
      url = new URL(entry.serviceUrl, requestUrl ?? `${base.origin}${prefix}/`);
    } catch {
      return null;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== base.origin) return null;
    if (url.username !== "" || url.password !== "") return null;
    path = url.pathname;
    if (prefix !== "") {
      if (!path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`)) return null;
      path = path.slice(prefix.length);
    }
  } else if (entry.odataVersion === "V2") {
    const ns = /^\/([^/]+)\/(.+)$/.exec(entry.technicalName);
    const root = ns ? `/sap/opu/odata/${ns[1]}/${ns[2]}` : `/sap/opu/odata/sap/${entry.technicalName}`;
    path = entry.version === "0001" ? root : `${root};v=${entry.version}`;
  }
  if (path === null) return null;
  const check = validateServicePath(path);
  return check.ok ? check.path : null;
}

/* ── classification ───────────────────────────────────────────────────── */

/**
 * The namespaces SAP's own sources use for services: every upper-case
 * namespace among the interface ids of the 2608 "Available Interfaces for
 * Your Selected Scope" table (sap-references/comm-scenarios/comm-scenarios.tsv;
 * tests/unit/sap/tenant-discovery.test.ts holds the two in step), and
 * Gateway's and the Fiori launchpad's own (/IWBEP/, /UI2/), which serve the
 * catalogue and launchpad services every Gateway system lists.
 */
export const SAP_NAMESPACES: ReadonlySet<string> = new Set([
  "BSNAGT",
  "CPD",
  "IWBEP",
  "IWFND",
  "IWXBE",
  "SAPSLL",
  "SCMB",
  "SCMTMS",
  "SCWM",
  "SDF",
  "SHCM",
  "SPE",
  "UI2",
]);

/** Which kind of customer extension a technical name is, by SAP's reserved prefixes; null for anything else. */
export function customerBuilt(technicalName: string): "KEY_USER" | "DEVELOPER" | null {
  const name = technicalName.toUpperCase();
  if (name.startsWith("/")) return null;
  if (name.startsWith("YY1_")) return "KEY_USER";
  if (name.startsWith("Z") || name.startsWith("Y")) return "DEVELOPER";
  return null;
}

/** The namespace of a technical name (`/CPD/SC_…` → CPD), or null. */
export function namespaceOf(technicalName: string): string | null {
  return /^\/([^/]+)\//.exec(technicalName)?.[1]?.toUpperCase() ?? null;
}

/** What classification knows besides the entry: SAP's published sources, by technical id. */
export interface ClassificationIndex {
  /** Technical ids (V2 `<NAME>_<version>`, V4 `<GROUP>_G4BA`) of the product's catalogue rows and curated services. */
  readonly published: ReadonlySet<string>;
  /** Technical ids SAP's communication scenario table names (newest release). */
  readonly inScenarioTable: ReadonlySet<string>;
}

/** The technical id an entry is known by in SAP's sources: the V2 catalogue key, the V4 group with `_G4BA`. */
export function sourceIdOf(entry: Pick<CatalogueEntry, "id" | "technicalName" | "odataVersion">): string {
  return entry.odataVersion === "V2" ? entry.id.toUpperCase() : `${entry.technicalName.toUpperCase()}_G4BA`;
}

/**
 * The §1.2 class of an entry, checked in order:
 *   1. YY1_* is customer-built (key user);
 *   2. Z* or Y* is customer-built (developer);
 *   3. /NS/… in a namespace SAP's sources use is SAP's: Published when its
 *      id is in those sources, otherwise not a Published API;
 *   4. any other /NS/… is an unknown namespace (a partner's or the customer's);
 *   5. anything else in SAP's sources is Published;
 *   6. anything else is an SAP service that is not a Published API.
 * SAP's 2608 table counts as Published: it is SAP's product documentation
 * (API Policy §1.1, "identified in product-specific Documentation").
 */
export function classifyService(
  entry: Pick<CatalogueEntry, "id" | "technicalName" | "odataVersion">,
  index: ClassificationIndex,
): ServiceClass {
  const own = customerBuilt(entry.technicalName);
  if (own === "KEY_USER") return "CUSTOMER_KEY_USER";
  if (own === "DEVELOPER") return "CUSTOMER_DEVELOPER";
  const id = sourceIdOf(entry);
  const known = index.published.has(id) || index.inScenarioTable.has(id);
  const ns = namespaceOf(entry.technicalName);
  if (ns !== null && !SAP_NAMESPACES.has(ns) && !known) return "UNKNOWN_NAMESPACE";
  return known ? "PUBLISHED" : "SAP_UNPUBLISHED";
}

/** Customer-built, either kind. */
export function isCustomerClass(c: ServiceClass): boolean {
  return c === "CUSTOMER_KEY_USER" || c === "CUSTOMER_DEVELOPER";
}

/* ── what is stored ───────────────────────────────────────────────────── */

const STORED_ENTRY = z.object({
  id: z.string().max(MAX_ID * 2 + 16),
  technicalName: z.string().max(MAX_ID),
  version: z.string().regex(/^\d{4}$/),
  odataVersion: z.enum(["V2", "V4"]),
  path: z.string().max(200).nullable(),
  title: z.string().max(MAX_TITLE).nullable(),
  class: z.enum(SERVICE_CLASSES),
  catalogueExternalId: z.string().max(MAX_ID).nullable(),
  scenarioIds: z.array(z.string().max(64)).max(200),
});

/**
 * A stored listing's entries as this build reads them: an entry that does not
 * parse (written by a later build, or edited by hand) is left out rather than
 * rendered half-understood.
 */
export function readStoredEntries(value: unknown): ListingEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ListingEntry[] = [];
  for (const raw of value.slice(0, LISTING_LIMITS.maxEntries)) {
    const parsed = STORED_ENTRY.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * The entries cut to what may be stored: at most `storedBytes` as JSON. The
 * last ones go first; the caller marks the listing truncated when any did.
 */
export function entriesWithinStoredBound(
  entries: readonly ListingEntry[],
  maxBytes: number = LISTING_LIMITS.storedBytes,
): { entries: ListingEntry[]; cut: number } {
  const out: ListingEntry[] = [];
  let bytes = 2;
  const encoder = new TextEncoder();
  for (const e of entries) {
    const size = encoder.encode(JSON.stringify(e)).byteLength + 1;
    if (bytes + size > maxBytes) break;
    bytes += size;
    out.push(e);
  }
  return { entries: out, cut: entries.length - out.length };
}

/** The groups the screen shows, in its order. */
export interface ListingGroups<T> {
  readonly customerBuilt: T[];
  readonly published: T[];
  readonly sapUnpublished: T[];
  readonly unknown: T[];
}

export function groupListing<T extends { readonly class: ServiceClass }>(entries: readonly T[]): ListingGroups<T> {
  return {
    customerBuilt: entries.filter((e) => isCustomerClass(e.class)),
    published: entries.filter((e) => e.class === "PUBLISHED"),
    sapUnpublished: entries.filter((e) => e.class === "SAP_UNPUBLISHED"),
    unknown: entries.filter((e) => e.class === "UNKNOWN_NAMESPACE"),
  };
}

/** The §1.2 sentence beside every entry that is not a Published API and not the customer's own. */
export const NOT_PUBLISHED_SENTENCE =
  "SAP API Policy §1.2: customer and third-party applications must not call SAP APIs that are not Published APIs. These services are listed by your system, but SAP does not publish them for integration, so CoreEdge offers no action for them.";

/** What the screen says when the catalogue could not be read (Q1: it names no communication scenario to activate). */
export function catalogueStatusSentence(status: CatalogueStatus): string {
  switch (status) {
    case "OK":
      return "The service catalogue answered.";
    case "UNAUTHORIZED":
      return "This connection's user cannot read the system's service catalogue, so CoreEdge cannot list its services. You can still register a service from its description: upload its $metadata file under From a file.";
    case "NOT_FOUND":
      return "The system answered that it has no service catalogue at this address, so CoreEdge cannot list its services. You can still register a service from its description: upload its $metadata file under From a file.";
    case "TIMEOUT":
      return "The service catalogue did not answer in time. Try again later, or register a service from its description under From a file.";
    case "TRUNCATED":
      return "The service catalogue listed more than CoreEdge reads in one listing, or stopped part-way, so this list is incomplete.";
    case "ERROR":
      return "The service catalogue could not be read. Try again later, or register a service from its description under From a file.";
  }
}
