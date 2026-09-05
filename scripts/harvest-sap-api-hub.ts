/**
 * Harvest the SAP Business Accelerator Hub catalogue — anonymously, no login.
 *
 * ============================================================================
 * WHY THIS EXISTS, WHEN TWO OTHER PATHS ALREADY DID
 * ============================================================================
 * `import-sap-api-catalog.ts` (Path B) reads a file a human downloads from
 * api.sap.com after logging in. `ingest-sap-api-hub-oauth.ts` (Path C) is a
 * deferred live refresh needing BTP client credentials, and its header records:
 *
 *   "Anonymous access to api.sap.com is blocked by an SPA + OAuth wall —
 *    verified empirically on 2026-04-30."
 *
 * That is TRUE OF THE ROUTE IT TRIED and false in general. The `APIs` entity
 * set is walled. `ContentPackages` is NOT, and every package exposes its
 * `Artifacts` — including the APIs. Probed 2026-07-30: of 46 entity sets on
 * /odata/1.0/catalog.svc, seven answer anonymously, and ContentPackages is one.
 *
 * So the catalogue was reachable the whole time, one navigation property away
 * from the door someone found locked. No SAP account, no BTP instance.
 *
 * ============================================================================
 * A FLOOR, NOT A CENSUS — AND THE DIFFERENCE IS NOT COSMETIC
 * ============================================================================
 * This walks packages, so it finds APIs THAT BELONG TO A PACKAGE. An API in no
 * public package will not appear, and the size of that gap CANNOT BE MEASURED
 * from outside the wall — the entity set that would answer it is the walled one.
 *
 * The output therefore records `completeness: "floor"`. It is a lower bound on
 * what SAP publishes, which is the same thing the probe vocabulary means by
 * "Activated is what we observed, not what exists".
 *
 * NOTHING HERE IS EVIDENCE THAT A SERVICE IS AVAILABLE ON ANY TENANT. It is
 * what SAP publishes. Only a probe against a real system can say more, and for
 * on-premise, RISE, Ariba, SuccessFactors and ECC no such system exists yet.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *   pnpm tsx scripts/harvest-sap-api-hub.ts
 *   HARVEST_LIMIT=50 pnpm tsx scripts/harvest-sap-api-hub.ts     # quick pilot
 *   HARVEST_OUT=path/to.json pnpm tsx scripts/harvest-sap-api-hub.ts
 *
 * Writes sap-references/api-hub-catalog.json as `{ _provenance, apis: [...] }`,
 * which the importer reads, so the next step is:
 *
 *   pnpm sap:catalog:import
 *
 * THAT SENTENCE USED TO SAY "in the shape import-sap-api-catalog.ts already
 * accepts", and it was wrong from the day it was written: the importer knew
 * `value` and `d.results` envelopes but not `apis`, so step two failed every
 * time with "Unrecognized JSON shape". Nothing caught it because nothing ran
 * the chain — the tests over the harvested file call the tag mappers directly.
 * Both sides are now pinned by tests that parse the committed artifact.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = process.env.HARVEST_BASE ?? "https://api.sap.com/odata/1.0/catalog.svc";
const OUT = process.env.HARVEST_OUT ?? "sap-references/api-hub-catalog.json";
const LIMIT = process.env.HARVEST_LIMIT ? Number(process.env.HARVEST_LIMIT) : Infinity;
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 6);
const PAGE = 500;
/**
 * 2608 WS2 — the checked-in product package list (scripts/discover-hub-packages.ts).
 * These packages are read FIRST and always, so the S/4HANA Cloud Public set is
 * complete in every harvest even if the hub-wide walk is limited or a page is
 * lost; every other package still follows, because the hub-wide floor (edition
 * tagging for Private / on-prem) is what api-hub-catalog.json is for.
 */
const PRODUCT_PACKAGES = process.env.HUB_PACKAGES ?? "sap-references/hub-packages.s4public.json";

/** OData v2 string keys are single-quoted, and an inner quote is doubled. */
const odataKey = (name: string) => encodeURIComponent(name).replace(/'/g, "%27%27");

/**
 * The Hub's artifact-type names, mapped to the content types this repository
 * stores (`HubContentType` in lib/sap-public/hub-content).
 *
 * DELIBERATELY PARTIAL, AND THE REMAINDER IS REPORTED. The Hub emits 23 types;
 * these seven plus API cover 30,599 of 32,084 artifacts. The rest — Data Products,
 * Value and Message Mappings, Business Objects, Integration Adapters, Policy
 * Templates and friends — have no content type here yet, so they are counted
 * under `unmappedArtifactTypes` in the output rather than silently discarded.
 * Adding one is a matter of extending HubContentType first; guessing a mapping
 * would file real SAP content under the wrong heading.
 *
 * "API" is absent on purpose: APIs go to api-hub-catalog.json for
 * SapApiReference, which is a different table with edition tagging of its own.
 */
const HUB_TYPE_MAP: Record<string, string> = {
  IFlow: "INTEGRATION",
  Event: "EVENT",
  Scenario: "SCENARIO",
  BOInterface: "BO_INTERFACE",
  BADI: "BADI",
};

/**
 * Types kept as COUNTS ONLY, in sap-references/hub-artifact-counts.json.
 *
 * CDS views (12,100) and Builds (6,755) are 59% of the Hub's artifacts and the
 * least individually actionable — nobody browses twelve thousand CDS views, and
 * a developer who needs one queries their own system, where it either exists or
 * does not. Committing 7.3MB of rows for content nothing probes would dominate
 * the repository and, for the two that are statically imported, the serverless
 * bundle as well. The counts file already carries them with provenance.
 */
const COUNT_ONLY_TYPES = new Set(["CDSVIEW", "Build"]);

interface HubArtifact {
  Name: string;
  DisplayName?: string | null;
  Type?: string | null;
  SubType?: string | null;
  Description?: string | null;
  Version?: string | null;
  State?: string | null;
  URI?: string | null;
  ModifiedAt?: string | null;
}

interface HubPackage {
  TechnicalName: string;
  DisplayName?: string | null;
  Products?: string | null;
  Category?: string | null;
  LineOfBusiness?: string | null;
  Version?: string | null;
}

/**
 * One GET, with retries.
 *
 * Returns null for the OAuth wall specifically, so a walled resource is a
 * KNOWN state rather than an error — the same distinction the console draws
 * between "not set up" and "failed", and for the same reason: they have
 * different fixes.
 */
async function get<T>(path: string, attempt = 0): Promise<T[] | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.startsWith("<html")) return null; // OAuth wall — not an error
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = JSON.parse(text) as { d?: { results?: T[] } };
    return body.d?.results ?? [];
  } catch (err) {
    if (attempt >= 3) {
      console.warn(`  ! ${path} failed after ${attempt} retries: ${String(err).slice(0, 80)}`);
      return null;
    }
    // Backoff, so a transient blip does not become a hole in the catalogue that
    // looks exactly like "SAP publishes nothing here".
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    return get<T>(path, attempt + 1);
  }
}

/** OData v2 "/Date(1784094846654)/" → ISO string (null when absent/unparseable). */
export function odataDateToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /\/Date\((-?\d+)\)\//.exec(v);
  if (m) return new Date(Number(m[1])).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * EVERY page of a collection, not the first 500.
 *
 * The artifacts call used to be a single `$top=500` GET. SAPS4HANACloud has 859
 * APIs, S4HANACloudBADI 1,715 BAdIs: both were silently cut at 500 and the
 * committed catalogue carried 500 of each with nothing saying so. Follows
 * d.__next when the server sends one, else pages by $skip until a short page.
 */
async function getAllPages<T>(path: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await get<T>(`${path}&$top=${PAGE}&$skip=${skip}`);
    if (page === null) return skip === 0 ? null : out;
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** The checked-in product package list, or [] when absent (hub-wide walk only). */
function productPackages(): HubPackage[] {
  const file = resolve(process.cwd(), PRODUCT_PACKAGES);
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    packages?: {
      technicalName: string;
      displayName: string | null;
      version: string | null;
      category: string | null;
      products: string[];
      lineOfBusiness: string | null;
    }[];
  };
  return (parsed.packages ?? []).map((p) => ({
    TechnicalName: p.technicalName,
    DisplayName: p.displayName,
    Products: p.products.join(","),
    Category: p.category,
    LineOfBusiness: p.lineOfBusiness,
    Version: p.version,
  }));
}

async function allPackages(): Promise<HubPackage[]> {
  const out: HubPackage[] = [];
  for (let skip = 0; out.length < LIMIT; skip += PAGE) {
    const page = await get<HubPackage>(
      `/ContentPackages?$format=json&$top=${PAGE}&$skip=${skip}` +
        `&$select=TechnicalName,DisplayName,Products,Category,LineOfBusiness,Version`,
    );
    if (!page || page.length === 0) break;
    out.push(...page);
    process.stdout.write(`\r  packages: ${out.length}`);
    if (page.length < PAGE) break;
  }
  process.stdout.write("\n");
  return out.slice(0, LIMIT === Infinity ? undefined : LIMIT);
}

/** Run tasks with a fixed worker count — polite to SAP, and bounded in memory. */
async function pooled<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    }),
  );
  return results;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`SAP Hub harvest — ${BASE}`);
  console.log("Reading content packages…");
  const product = productPackages();
  const walked = await allPackages();
  // Product packages first, then everything the walk found that is not already listed.
  const listed = new Set(product.map((p) => p.TechnicalName));
  const packages = [...product, ...walked.filter((p) => !listed.has(p.TechnicalName))];
  console.log(`  product list ${PRODUCT_PACKAGES}: ${product.length} package(s) · hub-wide walk: ${walked.length}`);

  console.log(`Reading artifacts for ${packages.length} packages (concurrency ${CONCURRENCY})…`);
  let done = 0;
  let walled = 0;
  const typeCounts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  /** Mappable non-API artifacts, grouped into the per-type drop targets. */
  const byHubType: Record<string, Record<string, unknown>[]> = {};
  /** Types the Hub publishes that this repository has no content type for. */
  const unmappedTypes: Record<string, number> = {};

  await pooled(packages, CONCURRENCY, async (p) => {
    const arts = await getAllPages<HubArtifact>(
      `/ContentPackages('${odataKey(p.TechnicalName)}')/Artifacts?$format=json` +
        `&$select=Name,DisplayName,Type,SubType,Description,Version,State,URI,ModifiedAt`,
    );
    done++;
    if (done % 50 === 0) process.stdout.write(`\r  packages read: ${done}/${packages.length}`);
    if (!arts) {
      walled++;
      return;
    }
    for (const a of arts) {
      typeCounts[a.Type ?? "UNKNOWN"] = (typeCounts[a.Type ?? "UNKNOWN"] ?? 0) + 1;

      /*
       * EVERY MAPPABLE TYPE IS KEPT NOW, NOT JUST APIs.
       *
       * This walk always SAW all of it — 32,084 artifacts across 23 types —
       * and threw away 27,487 of them on the next line, because the filter
       * was `Type !== "API"`. The catalogue held 14% of what one run had
       * already fetched, and nothing said so: the type counts were recorded
       * in provenance while the rows were dropped.
       *
       * Unmappable types are still skipped, but they are COUNTED and named
       * in the output, so "we do not carry this" is a visible statement
       * rather than a silence.
       */
      const hubType = a.Type ? HUB_TYPE_MAP[a.Type] : undefined;
      if (a.Type && COUNT_ONLY_TYPES.has(a.Type)) {
        // Counted in typeCounts above and carried by hub-artifact-counts.json.
        // Not "unmapped" — a deliberate choice, so it must not be reported as a gap.
      } else if (hubType && a.Name) {
        (byHubType[hubType] ??= []).push({
          externalId: a.Name,
          title: a.DisplayName ?? a.Name,
          description: a.Description ?? "",
          // Line of business, matching how the API slice populates packageId.
          packageId: p.LineOfBusiness ?? null,
          status: a.State ?? null,
          apiType: a.SubType ?? null,
          hubUrl: a.URI ?? null,
          // Harvested from SAP, not authored here. The importer refuses to let
          // an illustrative row overwrite one of these.
          illustrative: false,
          product: p.Products ?? null,
          packageTechnicalName: p.TechnicalName,
          version: a.Version ?? null,
          // 2608 WS2 — the Hub's lifecycle fields, verbatim (CCC PR-1 §1).
          hubState: a.State ?? null,
          hubVersion: a.Version ?? null,
          hubModifiedAt: odataDateToIso(a.ModifiedAt),
          hubSubType: a.SubType ?? null,
          // The OWNING PACKAGE's Version is the Hub's content release ("2608").
          catalogueRelease: p.Version ?? null,
        });
      } else if (a.Type && a.Type !== "API") {
        unmappedTypes[a.Type] = (unmappedTypes[a.Type] ?? 0) + 1;
      }

      if (a.Type !== "API" || !a.Name) continue;
      rows.push({
        apiId: a.Name,
        apiName: a.DisplayName ?? a.Name,
        // SubType is ODATA | ODATAV4 | REST | DELTAAPI. normalizeApiType in the
        // importer maps bare "odata" to ODATAV2, which is the v2 convention.
        apiType: a.SubType ?? null,
        status: a.State ?? null,
        description: a.Description ?? null,
        // The importer's edition rules read THIS field. "SAP S/4HANA" tags
        // on-premise; "…PrivateEdition" tags private; "S/4HANA Cloud" tags
        // public. It is the package, not the artifact, that carries it.
        product: p.Products ?? null,
        packageId: p.TechnicalName,
        packageTitle: p.DisplayName ?? null,
        lineOfBusiness: p.LineOfBusiness ?? null,
        version: a.Version ?? null,
        apiHubUrl: a.URI ?? null,
        // 2608 WS2 — the Hub's lifecycle fields, verbatim (CCC PR-1 §1).
        hubState: a.State ?? null,
        hubVersion: a.Version ?? null,
        hubModifiedAt: odataDateToIso(a.ModifiedAt),
        hubSubType: a.SubType ?? null,
        catalogueRelease: p.Version ?? null,
      });
    }
  });
  process.stdout.write("\n");

  // Deduplicate: one API can appear in several packages. Keep the first, but
  // remember every package, so nothing silently claims a single home.
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const id = String(r.apiId);
    const seen = byId.get(id);
    if (!seen) {
      byId.set(id, { ...r, packageIds: [r.packageId] });
      continue;
    }
    (seen.packageIds as string[]).push(String(r.packageId));
    // A product tag on one package and not another must not be lost.
    if (!seen.product && r.product) seen.product = r.product;
  }
  const apis = [...byId.values()];

  const payload = {
    /*
     * PROVENANCE, BECAUSE "IS THE CATALOGUE CURRENT?" HAD NO ANSWER.
     * Nothing recorded which Hub snapshot produced the existing rows or when,
     * so the question could only be answered from memory.
     */
    _provenance: {
      source: BASE,
      method: "anonymous ContentPackages → Artifacts navigation",
      harvestedAt: startedAt,
      finishedAt: new Date().toISOString(),
      packagesRead: packages.length,
      packagesWalled: walled,
      productPackageList: product.length ? { file: PRODUCT_PACKAGES, packages: product.length } : null,
      artifactPaging: `every page (${PAGE} per request, $skip until short page)`,
      artifactTypeCounts: typeCounts,
      apiRowsBeforeDedupe: rows.length,
      apiRows: apis.length,
      /*
       * A FLOOR, NOT A CENSUS. This finds APIs that belong to a package. The
       * `APIs` entity set — which would say how many exist in total — is behind
       * the OAuth wall, so the size of the gap cannot be measured from here.
       */
      completeness: "floor",
      /**
       * Types the Hub publishes that this repository cannot file. Named rather
       * than dropped, so "we do not carry Data Products" is a statement someone
       * can act on instead of an absence nobody notices.
       */
      unmappedArtifactTypes: unmappedTypes,
      note:
        "Lower bound on what SAP publishes. NOT evidence that any service is " +
        "available on any tenant — only a probe against a real system can say that.",
    },
    apis,
  };

  const outPath = resolve(process.cwd(), OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 1));

  /*
   * A SEPARATE DIRECTORY FROM THE CURATED DROP TARGETS, for two reasons found
   * the hard way by writing into them first.
   *
   * 1. IT CLOBBERS. hub-content/*.json hold hand-curated rows keyed by GROUPED
   *    identifiers — `S4HANACloudBADI` standing for a thousand BAdIs, and
   *    similar summary rows for integrations and builds. The harvest emits
   *    INDIVIDUAL artifacts with different ids, so writing over those files
   *    silently destroyed 158 integrations, 77 builds and 19 CDS groupings.
   *    Different vocabularies, both legitimate; neither should erase the other.
   *
   * 2. IT WOULD BLOAT THE FUNCTION. hub-content-bundled.ts STATICALLY IMPORTS
   *    several of those files so the admin Rebuild endpoint works without a DB
   *    secret leaving Vercel. A static import is a bundling instruction — 4,439
   *    integrations would be baked into every serverless function. The existing
   *    guard already excludes high-volume types for exactly this reason; this
   *    keeps that guard intact by never being imported at all.
   *
   * Deduplicated by externalId within a type: one artifact can belong to
   * several packages, exactly as an API can.
   */
  const perTypeDir = resolve(process.cwd(), dirname(OUT), "hub-harvest");
  mkdirSync(perTypeDir, { recursive: true });
  const written: Record<string, number> = {};
  for (const [type, items] of Object.entries(byHubType)) {
    const seen = new Map<string, Record<string, unknown>>();
    for (const item of items) if (!seen.has(String(item.externalId))) seen.set(String(item.externalId), item);
    const deduped = [...seen.values()];
    writeFileSync(resolve(perTypeDir, `${type}.json`), JSON.stringify(deduped, null, 1));
    written[type] = deduped.length;
  }

  console.log(`\nWrote ${apis.length} APIs (${rows.length} before dedupe) → ${OUT}`);
  console.log(`Packages: ${packages.length} read, ${walled} walled`);
  console.log("Artifact types seen:", JSON.stringify(typeCounts));
  console.log("Per-type files written:", JSON.stringify(written));
  if (Object.keys(unmappedTypes).length > 0) {
    // Loud, because this is the list of things the catalogue still cannot hold.
    console.log("NOT carried (no content type for these):", JSON.stringify(unmappedTypes));
  }
}

if (process.argv[1] && /harvest-sap-api-hub\.ts$/.test(process.argv[1])) void main();
