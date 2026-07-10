/**
 * Phase 13.6 — SAP API Business Hub LIVE ingest (DEFERRED — Path C).
 *
 * STATUS: Not active. The primary Path B importer is
 * scripts/import-sap-api-catalog.ts which reads a CSV/JSON export.
 *
 * This script remains in the repo for the future "Path C — continuous live
 * refresh" flow. It REQUIRES SAP API Hub OAuth credentials (client_credentials
 * flow via SAP BTP service instance). Anonymous access to api.sap.com is
 * blocked by an SPA + OAuth wall — verified empirically on 2026-04-30.
 *
 * To enable Path C in the future:
 *   1. Register an SAP BTP service instance for the API Business Hub
 *   2. Set SAP_API_HUB_CLIENT_ID + SAP_API_HUB_CLIENT_SECRET env vars
 *   3. Update fetchWithRetry below to perform OAuth client_credentials
 *   4. Probe api.sap.com discovery endpoints to find the live shape
 *
 * ============================================================================
 * ASSUMPTION LEDGER — verify before relying on production output
 * ============================================================================
 * I, the author of this script, do NOT have internet access from the sandbox
 * where this was authored. Every endpoint URL + JSON shape below is based on
 * documented SAP patterns but is UNVERIFIED against the live api.sap.com.
 *
 * If the live API has shifted shape, adjust the constants + parser functions
 * marked with `// VERIFY:` comments. None of the schema changes when you do.
 *
 * Known + documented:
 *   - api.sap.com hosts the SAP Business Accelerator Hub
 *   - Public reads of the API catalog typically don't require auth
 *   - APIs carry productCategory / productLine tags identifying the SAP product
 *   - Per-API metadata is downloadable as OpenAPI (JSON) or EDMX (XML)
 *
 * Unverified:
 *   - Exact discovery endpoint URL + pagination shape
 *   - Exact field names for edition tagging
 *   - Whether scope-item linkage is on the discovery response or only on
 *     per-API detail pages (script handles both via two-pass design)
 *
 * Configurable via env (override anything that turns out wrong):
 *   SAP_API_HUB_BASE_URL           default: "https://api.sap.com"
 *   SAP_API_HUB_DISCOVERY_PATH     default: "/api-business-hub/odata/v1/APIs"
 *   SAP_API_HUB_API_KEY            optional Bearer token (raises rate limits)
 *   SAP_API_HUB_DRY_RUN            "1" → fetch-and-print, no DB writes
 *   SAP_API_HUB_LIMIT              integer cap on APIs ingested (testing)
 *   SAP_API_HUB_DELAY_MS           default 100 — between requests
 *   SAP_API_HUB_MAX_RETRIES        default 5 — for 429/5xx responses
 *
 * Usage:
 *   pnpm tsx scripts/ingest-sap-api-hub.ts
 *   SAP_API_HUB_DRY_RUN=1 pnpm tsx scripts/ingest-sap-api-hub.ts   # smoke
 *   SAP_API_HUB_LIMIT=10 pnpm tsx scripts/ingest-sap-api-hub.ts    # quick test
 *
 * Idempotent — re-runs upsert by apiId, refresh stale entries via ETag.
 * ============================================================================
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { S4_PUBLIC_PUBLISHED_COUNTS } from "../src/lib/sap-public/hub-content";

const prisma = new PrismaClient();

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.SAP_API_HUB_BASE_URL ?? "https://api.sap.com";
const DISCOVERY_PATH =
  process.env.SAP_API_HUB_DISCOVERY_PATH ?? "/api-business-hub/odata/v1/APIs";
const API_KEY = process.env.SAP_API_HUB_API_KEY ?? "";
const DRY_RUN = process.env.SAP_API_HUB_DRY_RUN === "1";
const LIMIT = process.env.SAP_API_HUB_LIMIT
  ? parseInt(process.env.SAP_API_HUB_LIMIT, 10)
  : null;
const DELAY_MS = parseInt(process.env.SAP_API_HUB_DELAY_MS ?? "100", 10);
const MAX_RETRIES = parseInt(process.env.SAP_API_HUB_MAX_RETRIES ?? "5", 10);

const USER_AGENT = "Aptus-SAP-API-Hub-Ingest/1.0 (+https://ab-workbench.vercel.app)";

// ── Types — what we expect back from api.sap.com ────────────────────────────
// VERIFY: shape based on documented OData catalog pattern; live response
// may differ. The parser tolerates extra fields and missing optional fields.
interface ApiHubDiscoveryResponse {
  d?: {
    results?: Array<ApiHubEntry>;
    __next?: string; // OData v2 pagination
  };
  value?: Array<ApiHubEntry>;       // OData v4 pagination shape
  "@odata.nextLink"?: string;       // OData v4 pagination link
}

interface ApiHubEntry {
  // Identity — at least one of these will exist
  ID?: string;
  Id?: string;
  Name?: string;
  ApiId?: string;
  // Display
  Title?: string;
  ShortText?: string;
  Description?: string;
  // Classification
  ReleaseStatus?: string;     // "Released" | "Beta" | "Deprecated"
  Category?: string;
  ProductCategory?: string;   // "SAP S/4HANA Cloud" | "SAP S/4HANA Cloud, private edition" | etc.
  ProductLine?: string;       // alternate name SAP uses inconsistently
  // Linkage
  BusinessScenarios?: Array<{ ScopeItemId?: string }> | string[];
  ScopeItemIds?: string[];
  CommunicationScenarios?: string[];
  // Provenance
  RegistrationTime?: string;
  EntityKey?: string;
  __metadata?: { uri?: string; etag?: string };
}

// ── HTTP helper with retry/backoff ──────────────────────────────────────────
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res;
      // Retry on 429 + 5xx
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(30000, 1000 * Math.pow(2, attempt));
        console.warn(`  HTTP ${res.status} from ${url} — backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }
      // 4xx (other) → don't retry
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
    } catch (err) {
      lastErr = err as Error;
      const backoff = Math.min(30000, 1000 * Math.pow(2, attempt));
      console.warn(`  Network error: ${(err as Error).message} — backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
  throw lastErr ?? new Error(`fetchWithRetry exhausted ${MAX_RETRIES} retries for ${url}`);
}

// ── Edition mapping ─────────────────────────────────────────────────────────
// VERIFY: SAP's productCategory / productLine vocabulary. These strings are
// inferred from publicly documented SAP product names; double-check against
// a sample API entry once the live ingest succeeds.
function mapEditionFromApiTags(entry: ApiHubEntry): {
  appliesToPublic: boolean;
  appliesToPrivate: boolean;
  appliesToOnPrem: boolean;
} {
  const tags = [entry.ProductCategory, entry.ProductLine, entry.Category]
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());

  // Pattern matching — a single API often appears under multiple product names
  let appliesToPublic = false;
  let appliesToPrivate = false;
  let appliesToOnPrem = false;

  for (const tag of tags) {
    // Private Edition patterns
    if (
      tag.includes("private edition") ||
      tag.includes("private cloud") ||
      tag.includes("rise with sap") ||
      tag.includes("s/4hana cloud, private")
    ) {
      appliesToPrivate = true;
    }
    // Public Edition patterns (be careful: "S/4HANA Cloud" without qualifier
    // historically meant Public, but post-2023 SAP started using just "S/4HANA
    // Cloud" for both editions in some contexts. We require an explicit
    // Public marker OR the absence of an explicit Private/On-Prem marker.)
    if (
      tag.includes("public edition") ||
      tag.includes("public cloud") ||
      tag.includes("s/4hana cloud, public") ||
      tag.includes("multi-tenant")
    ) {
      appliesToPublic = true;
    }
    // On-Prem patterns
    if (
      tag.includes("on premise") ||
      tag.includes("on-premise") ||
      tag.includes("on-prem")
    ) {
      appliesToOnPrem = true;
    }
  }

  // Default heuristic: bare "SAP S/4HANA Cloud" with no qualifier → Public
  // (matches historical SAP convention; safer to under-tag than over-tag)
  if (!appliesToPublic && !appliesToPrivate && !appliesToOnPrem) {
    for (const tag of tags) {
      if (tag.includes("s/4hana cloud") && !tag.includes("private")) {
        appliesToPublic = true;
        break;
      }
    }
  }

  return { appliesToPublic, appliesToPrivate, appliesToOnPrem };
}

function extractScopeItemCodes(entry: ApiHubEntry): string[] {
  const codes = new Set<string>();
  if (Array.isArray(entry.ScopeItemIds)) {
    for (const c of entry.ScopeItemIds) if (typeof c === "string") codes.add(c.toUpperCase());
  }
  if (Array.isArray(entry.BusinessScenarios)) {
    for (const s of entry.BusinessScenarios) {
      if (typeof s === "string") codes.add(s.toUpperCase());
      else if (s && typeof s === "object" && typeof s.ScopeItemId === "string") {
        codes.add(s.ScopeItemId.toUpperCase());
      }
    }
  }
  return Array.from(codes).sort();
}

function extractCommunicationScenarios(entry: ApiHubEntry): string[] {
  return Array.isArray(entry.CommunicationScenarios)
    ? entry.CommunicationScenarios.filter((s): s is string => typeof s === "string")
    : [];
}

function extractStatus(entry: ApiHubEntry): string {
  const raw = entry.ReleaseStatus ?? "";
  // Normalize SAP's inconsistent capitalisation
  const lower = raw.toLowerCase();
  if (lower.includes("released")) return "Released";
  if (lower.includes("beta")) return "Beta";
  if (lower.includes("deprecat")) return "Deprecated";
  return raw || "Unknown";
}

function extractApiId(entry: ApiHubEntry): string | null {
  return entry.ApiId ?? entry.ID ?? entry.Id ?? entry.Name ?? null;
}

function extractApiName(entry: ApiHubEntry): string {
  return entry.Title ?? entry.Name ?? entry.ApiId ?? entry.ID ?? "(unnamed)";
}

function extractDescription(entry: ApiHubEntry): string {
  return entry.Description ?? entry.ShortText ?? "";
}

function buildApiHubUrl(apiId: string): string {
  // VERIFY: canonical link format
  return `${BASE_URL}/api/${encodeURIComponent(apiId)}`;
}

// ── Pagination handler ──────────────────────────────────────────────────────
async function* paginateDiscovery(): AsyncGenerator<ApiHubEntry, void, void> {
  let nextUrl: string | null = `${BASE_URL}${DISCOVERY_PATH}?$top=100&$format=json`;
  let pageCount = 0;
  let totalSeen = 0;

  while (nextUrl !== null) {
    pageCount++;
    console.log(`  Fetching page ${pageCount}: ${nextUrl}`);
    const res = await fetchWithRetry(nextUrl);
    const json: ApiHubDiscoveryResponse = await res.json();

    // OData v2 (`d.results`) vs v4 (`value`) — handle both
    const results = json.d?.results ?? json.value ?? [];
    if (!Array.isArray(results)) {
      console.warn(`  Unexpected response shape (no results array). Stopping pagination.`);
      return;
    }
    if (results.length === 0) return;

    for (const entry of results) {
      yield entry;
      totalSeen++;
      if (LIMIT !== null && totalSeen >= LIMIT) {
        console.log(`  Hit SAP_API_HUB_LIMIT=${LIMIT}, stopping early`);
        return;
      }
    }

    // Resolve next page link
    const oDataV4Next = json["@odata.nextLink"];
    const oDataV2Next = json.d?.__next;
    nextUrl = oDataV4Next ?? oDataV2Next ?? null;
    // Some SAP endpoints return relative nextLinks
    if (nextUrl && nextUrl.startsWith("/")) {
      nextUrl = `${BASE_URL}${nextUrl}`;
    }

    await sleep(DELAY_MS);
  }
}

// =====================================================================
// Path C extension — SPECULATIVE / UNVERIFIED (do NOT treat as available)
// =====================================================================
// A scaffold for a hypothetical "bulk-export the Business Accelerator Hub
// catalogue over OAuth" API, writing every content type into SapHubContent.
// Additive to the API-only pass above (SapApiReference, untouched).
//
// WARNING — there is NO known sanctioned SAP service that bulk-exports the
// public api.sap.com content catalogue over OAuth. A BTP "apiportal/apiaccess"
// instance is SAP Integration Suite — API Management (runtime proxying of YOUR
// APIs), not a catalogue download. The paths + field names below are GUESSES
// based on general OData patterns and have never been run against a real
// endpoint. The SUPPORTED population path is the manual per-type export →
// sap:hub:import (see docs/runbooks/sap-hub-content-ingest.md).
//
// Kept only as a placeholder should SAP ever publish such an API. If a real
// endpoint is identified, resolve every `// VERIFY:` marker against its live
// response first.
//
// Gated:  SAP_API_HUB_INGEST_CONTENT=1  plus the OAuth env below.
//   SAP_API_HUB_TOKEN_URL / SAP_API_HUB_CLIENT_ID / SAP_API_HUB_CLIENT_SECRET

const HUB_CONTENT_INGEST = process.env.SAP_API_HUB_INGEST_CONTENT === "1";

// Our enum value → the hub's content-API collection path (VERIFY paths).
const CONTENT_TYPE_PATHS: Array<{ type: string; path: string }> = [
  { type: "API", path: "/api-business-hub/odata/v1/APIs" },
  { type: "EVENT", path: "/api-business-hub/odata/v1/Events" },
  { type: "CDS_VIEW", path: "/api-business-hub/odata/v1/CDSViews" },
  { type: "BADI", path: "/api-business-hub/odata/v1/BAdIs" },
  { type: "BO_INTERFACE", path: "/api-business-hub/odata/v1/BusinessObjectInterfaces" },
  { type: "INTEGRATION", path: "/api-business-hub/odata/v1/IntegrationFlows" },
  { type: "BUILD", path: "/api-business-hub/odata/v1/BuildContent" },
  { type: "PROCESS_BLUEPRINT", path: "/api-business-hub/odata/v1/ProcessBlueprints" },
  { type: "LIVEPROCESS", path: "/api-business-hub/odata/v1/LiveProcesses" },
  { type: "SCENARIO", path: "/api-business-hub/odata/v1/Scenarios" },
  { type: "VPUC", path: "/api-business-hub/odata/v1/PartnerUseCases" },
  { type: "ANALYTICS", path: "/api-business-hub/odata/v1/AnalyticsContent" },
];

/** OAuth2 client_credentials token from the BTP API-Hub service instance. */
async function fetchHubOAuthToken(): Promise<string> {
  const tokenUrl = process.env.SAP_API_HUB_TOKEN_URL;
  const clientId = process.env.SAP_API_HUB_CLIENT_ID;
  const clientSecret = process.env.SAP_API_HUB_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error("Path C content ingest needs SAP_API_HUB_TOKEN_URL + CLIENT_ID + CLIENT_SECRET");
  }
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const json = (await res.json()) as { access_token?: unknown };
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`OAuth token request failed: HTTP ${res.status}`);
  }
  return json.access_token;
}

// VERIFY: field names per content type. Tolerant to missing optional fields.
function mapContentEntry(type: string, e: Record<string, unknown>): {
  externalId: string;
  title: string;
  description: string;
  packageId: string | null;
  status: string;
  apiType: string | null;
  communicationScenarios: string[];
  itemCount: number | null;
  hubUrl: string;
} | null {
  const s = (v: unknown): string => (v == null ? "" : String(v));
  const externalId = s(e.Id ?? e.ID ?? e.Name ?? e.ApiId ?? e.EntityId).trim();
  if (!externalId) return null;
  const arr = Array.isArray(e.CommunicationScenarios)
    ? e.CommunicationScenarios.filter((x): x is string => typeof x === "string")
    : [];
  const count = Number(e.Count ?? e.ItemCount);
  return {
    externalId,
    title: s(e.Title ?? e.Name ?? externalId),
    description: s(e.Description ?? e.ShortText),
    packageId: s(e.PackageId ?? e.LineOfBusiness ?? e.Category) || null,
    status: s(e.ReleaseStatus ?? e.Status) || "Released",
    apiType: type === "API" || type === "CDS_VIEW" ? s(e.ApiType ?? e.Protocol) || null : null,
    communicationScenarios: arr,
    itemCount: Number.isFinite(count) && count > 0 ? Math.trunc(count) : null,
    hubUrl: s(e.Url ?? e.Link) || `${BASE_URL}/content/${encodeURIComponent(externalId)}`,
  };
}

async function ingestAllHubContent(token: string): Promise<void> {
  console.log(`\n[sap-api-hub] Path C — ingesting ALL content types → SapHubContent`);
  console.log(`[sap-api-hub] Scope: S/4HANA Cloud PUBLIC edition, released content only.`);
  console.log(`[sap-api-hub] NOTE: the per-type paths + field names below are documented`);
  console.log(`[sap-api-hub] SAP patterns and have NOT been verified against the live content`);
  console.log(`[sap-api-hub] API. Confirm the '// VERIFY:' constants on this first run.\n`);
  const authFetch = (url: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": USER_AGENT } });

  for (const { type, path } of CONTENT_TYPE_PATHS) {
    let nextUrl: string | null = `${BASE_URL}${path}?$top=200&$format=json`;
    let count = 0;
    while (nextUrl) {
      const res = await authFetch(nextUrl);
      if (!res.ok) {
        console.warn(`  ${type}: HTTP ${res.status} — skipping (VERIFY path ${path})`);
        break;
      }
      const json = (await res.json()) as ApiHubDiscoveryResponse & { value?: Array<Record<string, unknown>> };
      const rows = (json.d?.results ?? json.value ?? []) as Array<Record<string, unknown>>;
      for (const e of rows) {
        const m = mapContentEntry(type, e);
        if (!m) continue;
        if (!DRY_RUN) {
          await prisma.sapHubContent.upsert({
            where: { contentType_externalId: { contentType: type as never, externalId: m.externalId } },
            create: { contentType: type as never, appliesToPublic: true, rawMetadataJson: e as Prisma.InputJsonValue, ...m },
            update: { rawMetadataJson: e as Prisma.InputJsonValue, ...m },
          });
        }
        count++;
      }
      const v2 = json.d?.__next;
      const v4 = json["@odata.nextLink"];
      nextUrl = v4 ?? v2 ?? null;
      if (nextUrl && nextUrl.startsWith("/")) nextUrl = `${BASE_URL}${nextUrl}`;
      await sleep(DELAY_MS);
    }
    const expected = S4_PUBLIC_PUBLISHED_COUNTS[type as keyof typeof S4_PUBLIC_PUBLISHED_COUNTS] ?? 0;
    const drift = expected > 0 ? ` (published ~${expected})` : "";
    console.log(`  ${type.padEnd(18)} ${String(count).padStart(6)}${drift}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`[sap-api-hub] BASE_URL=${BASE_URL}`);
  console.log(`[sap-api-hub] DISCOVERY_PATH=${DISCOVERY_PATH}`);
  console.log(`[sap-api-hub] AUTH=${API_KEY ? "Bearer-token" : "anonymous"}`);
  console.log(`[sap-api-hub] DRY_RUN=${DRY_RUN}`);
  console.log(`[sap-api-hub] LIMIT=${LIMIT ?? "(none)"}`);
  console.log(`[sap-api-hub] DELAY_MS=${DELAY_MS}`);
  console.log("");

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let publicCount = 0;
  let privateCount = 0;
  let onPremCount = 0;
  let bothEditions = 0;

  try {
    for await (const entry of paginateDiscovery()) {
      const apiId = extractApiId(entry);
      if (!apiId) {
        console.warn(`  Skip entry with no apiId:`, JSON.stringify(entry).slice(0, 120));
        skipped++;
        continue;
      }

      const editions = mapEditionFromApiTags(entry);
      const status = extractStatus(entry);
      const data = {
        apiId,
        apiName: extractApiName(entry),
        description: extractDescription(entry),
        status,
        category: entry.Category ?? null,
        appliesToPublic: editions.appliesToPublic,
        appliesToPrivate: editions.appliesToPrivate,
        appliesToOnPrem: editions.appliesToOnPrem,
        scopeItemCodes: extractScopeItemCodes(entry),
        communicationScenarios: extractCommunicationScenarios(entry),
        apiHubUrl: buildApiHubUrl(apiId),
        rawMetadataJson: entry as unknown as Prisma.InputJsonValue,
        etag: entry.__metadata?.etag ?? null,
        lastFetchedAt: new Date(),
      };

      if (editions.appliesToPublic) publicCount++;
      if (editions.appliesToPrivate) privateCount++;
      if (editions.appliesToOnPrem) onPremCount++;
      if (editions.appliesToPublic && editions.appliesToPrivate) bothEditions++;

      if (DRY_RUN) {
        console.log(`  DRY: ${apiId} (${status}) public=${editions.appliesToPublic} private=${editions.appliesToPrivate} scopes=[${data.scopeItemCodes.join(",") || "—"}]`);
        inserted++;
        continue;
      }

      // Upsert keyed by apiId. Note: returns a count we can use to track new vs update.
      const existing = await prisma.sapApiReference.findUnique({
        where: { apiId },
        select: { id: true, etag: true, status: true },
      });
      if (existing) {
        // ETag short-circuit — if both have an etag and they match, skip the update
        if (existing.etag && data.etag && existing.etag === data.etag) {
          await prisma.sapApiReference.update({
            where: { id: existing.id },
            data: { lastFetchedAt: data.lastFetchedAt },
          });
          unchanged++;
        } else {
          await prisma.sapApiReference.update({
            where: { id: existing.id },
            data,
          });
          updated++;
        }
      } else {
        await prisma.sapApiReference.create({ data });
        inserted++;
      }
    }
  } catch (err) {
    console.error(`\n[sap-api-hub] FATAL: ${(err as Error).message}`);
    console.error(`[sap-api-hub] Partial run — inserted=${inserted} updated=${updated} unchanged=${unchanged} skipped=${skipped}`);
    console.error(`[sap-api-hub] Re-run is safe (idempotent via apiId upsert).`);
    process.exit(1);
  }

  console.log("\n[sap-api-hub] === Ingest complete ===");
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Unchanged (etag match): ${unchanged}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total seen: ${inserted + updated + unchanged}`);
  console.log("");
  console.log(`  Edition tagging:`);
  console.log(`    appliesToPublic:  ${publicCount}`);
  console.log(`    appliesToPrivate: ${privateCount}`);
  console.log(`    appliesToOnPrem:  ${onPremCount}`);
  console.log(`    Both Pub+Priv:    ${bothEditions}`);

  // Path C extension — pull ALL content types into SapHubContent (opt-in).
  if (HUB_CONTENT_INGEST) {
    const token = await fetchHubOAuthToken();
    await ingestAllHubContent(token);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
