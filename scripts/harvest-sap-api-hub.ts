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
 * Writes sap-references/api-hub-catalog.json in the shape
 * import-sap-api-catalog.ts already accepts, so the next step is:
 *
 *   pnpm tsx scripts/import-sap-api-catalog.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = process.env.HARVEST_BASE ?? "https://api.sap.com/odata/1.0/catalog.svc";
const OUT = process.env.HARVEST_OUT ?? "sap-references/api-hub-catalog.json";
const LIMIT = process.env.HARVEST_LIMIT ? Number(process.env.HARVEST_LIMIT) : Infinity;
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 6);
const PAGE = 500;

/** OData v2 string keys are single-quoted, and an inner quote is doubled. */
const odataKey = (name: string) => encodeURIComponent(name).replace(/'/g, "%27%27");

interface HubArtifact {
  Name: string;
  DisplayName?: string | null;
  Type?: string | null;
  SubType?: string | null;
  Description?: string | null;
  Version?: string | null;
  State?: string | null;
  URI?: string | null;
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
  const packages = await allPackages();

  console.log(`Reading artifacts for ${packages.length} packages (concurrency ${CONCURRENCY})…`);
  let done = 0;
  let walled = 0;
  const typeCounts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];

  await pooled(packages, CONCURRENCY, async (p) => {
    const arts = await get<HubArtifact>(
      `/ContentPackages('${odataKey(p.TechnicalName)}')/Artifacts?$format=json&$top=${PAGE}`,
    );
    done++;
    if (done % 50 === 0) process.stdout.write(`\r  packages read: ${done}/${packages.length}`);
    if (!arts) {
      walled++;
      return;
    }
    for (const a of arts) {
      typeCounts[a.Type ?? "UNKNOWN"] = (typeCounts[a.Type ?? "UNKNOWN"] ?? 0) + 1;
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
      artifactTypeCounts: typeCounts,
      apiRowsBeforeDedupe: rows.length,
      apiRows: apis.length,
      /*
       * A FLOOR, NOT A CENSUS. This finds APIs that belong to a package. The
       * `APIs` entity set — which would say how many exist in total — is behind
       * the OAuth wall, so the size of the gap cannot be measured from here.
       */
      completeness: "floor",
      note:
        "Lower bound on what SAP publishes. NOT evidence that any service is " +
        "available on any tenant — only a probe against a real system can say that.",
    },
    apis,
  };

  const outPath = resolve(process.cwd(), OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 1));

  console.log(`\nWrote ${apis.length} APIs (${rows.length} before dedupe) → ${OUT}`);
  console.log(`Packages: ${packages.length} read, ${walled} walled`);
  console.log("Artifact types:", JSON.stringify(typeCounts));
}

void main();
