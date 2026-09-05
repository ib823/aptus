/**
 * Enumerate the SAP Business Accelerator Hub packages for ONE product and check
 * the list in (2608 WS2 — CCC PR-1 §2).
 *
 * WHY. The harvest walks every package and tags rows by the package's Products
 * field. That is right for a hub-wide floor, but the S/4HANA Cloud Public
 * catalogue the app shows needs a NAMED package set: "these 235 packages are
 * the product", so a recon can say "859 APIs in SAPS4HANACloud, 803 active /
 * 56 deprecated" against a list a reviewer can read, and a package SAP adds or
 * retires shows up as a diff, not a silent count change.
 *
 * HOW. Anonymous catalog.svc, the same door the harvest uses:
 *   ContentPackages?$select=…            (paged by $skip; the server caps a page at 1,000)
 *   → keep packages whose Products tag list contains exactly "SAPS4HANACloud"
 *   → ContentPackages('<name>')/Artifacts?$select=Name,Type,SubType,State,Version
 *     tallied by Type and State (never stored as rows here)
 *
 * The package `Category` (APIs, Events, CDSViews, SteamPunk = BAdIs + BO
 * interfaces, Integration, Build, Scenarios, LiveProcess, Analytics) is SAP's
 * own classification and is what the product page's tiles group by.
 *
 * Usage:
 *   pnpm sap:hub:discover-packages            # writes sap-references/hub-packages.s4public.json
 *   HUB_PRODUCT=SAPS4HANACloud pnpm sap:hub:discover-packages
 *   HUB_PACKAGES_OUT=path.json …
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = process.env.HARVEST_BASE ?? "https://api.sap.com/odata/1.0/catalog.svc";
const PRODUCT = process.env.HUB_PRODUCT ?? "SAPS4HANACloud";
const OUT = process.env.HUB_PACKAGES_OUT ?? "sap-references/hub-packages.s4public.json";
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 6);
const PAGE = 1000;

const odataKey = (name: string) => encodeURIComponent(name).replace(/'/g, "%27%27");

type HubPackage = {
  TechnicalName: string;
  DisplayName?: string | null;
  Version?: string | null;
  Category?: string | null;
  Products?: string | null;
  LineOfBusiness?: string | null;
  ModifiedAt?: string | null;
};
type HubArtifact = {
  Name: string;
  Type?: string | null;
  SubType?: string | null;
  State?: string | null;
  Version?: string | null;
};

export type HubPackageEntry = {
  technicalName: string;
  displayName: string | null;
  version: string | null;
  category: string | null;
  products: string[];
  lineOfBusiness: string | null;
  modifiedAt: string | null;
  artifacts: number;
  byType: Record<string, number>;
  byState: Record<string, number>;
  byTypeState: Record<string, number>;
};

export type HubPackageList = {
  _provenance: {
    source: string;
    method: string;
    product: string;
    harvestedAt: string;
    finishedAt: string;
    packagesScanned: number;
    packagesSelected: number;
    completeness: "floor";
    note: string;
  };
  byCategory: Record<
    string,
    { packages: number; artifacts: number; byType: Record<string, number>; byState: Record<string, number> }
  >;
  packages: HubPackageEntry[];
};

/** OData v2 date "/Date(1784094846654)/" → ISO string. */
export function odataDateToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /\/Date\((-?\d+)\)\//.exec(v);
  if (m) return new Date(Number(m[1])).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Every page of an OData v2 collection: follows d.__next, else $skip. */
export async function getAll<T>(path: string, pageSize = PAGE): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  let next: string | null = `${BASE}${path}${sep}$top=${pageSize}&$skip=0`;
  let skip = 0;
  while (next) {
    const res = await fetch(next, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.startsWith("<html")) throw new Error(`OAuth wall at ${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}`);
    const body = JSON.parse(text) as { d?: { results?: T[]; __next?: string } | T[] };
    const d = body.d;
    const results = Array.isArray(d) ? d : (d?.results ?? []);
    out.push(...results);
    if (!Array.isArray(d) && d?.__next) next = d.__next;
    else if (results.length === pageSize) {
      skip += pageSize;
      next = `${BASE}${path}${sep}$top=${pageSize}&$skip=${skip}`;
    } else next = null;
  }
  return out;
}

function tally<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

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

export function hasProductTag(products: string | null | undefined, product: string): boolean {
  return (products ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(product);
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Hub package discovery — ${BASE} · product ${PRODUCT}`);
  const all = await getAll<HubPackage>(
    "/ContentPackages?$format=json&$select=TechnicalName,DisplayName,Version,Category,Products,LineOfBusiness,ModifiedAt",
  );
  const selected = all.filter((p) => hasProductTag(p.Products, PRODUCT));
  console.log(`  packages scanned ${all.length} · tagged ${PRODUCT}: ${selected.length}`);

  let done = 0;
  const entries = await pooled(selected, CONCURRENCY, async (p): Promise<HubPackageEntry> => {
    const arts = await getAll<HubArtifact>(
      `/ContentPackages('${odataKey(p.TechnicalName)}')/Artifacts?$format=json&$select=Name,Type,SubType,State,Version`,
    );
    done++;
    if (done % 25 === 0) process.stdout.write(`\r  packages read: ${done}/${selected.length}`);
    return {
      technicalName: p.TechnicalName,
      displayName: p.DisplayName ?? null,
      version: p.Version ?? null,
      category: p.Category ?? null,
      products: (p.Products ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      lineOfBusiness: p.LineOfBusiness ?? null,
      modifiedAt: odataDateToIso(p.ModifiedAt),
      artifacts: arts.length,
      byType: tally(arts, (a) => a.Type ?? "UNKNOWN"),
      byState: tally(arts, (a) => a.State ?? "NULL"),
      byTypeState: tally(arts, (a) => `${a.Type ?? "UNKNOWN"}|${a.State ?? "NULL"}`),
    };
  });
  process.stdout.write("\n");
  entries.sort(
    (a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.technicalName.localeCompare(b.technicalName),
  );

  const byCategory: HubPackageList["byCategory"] = {};
  for (const e of entries) {
    const c = (byCategory[e.category ?? "UNCATEGORISED"] ??= { packages: 0, artifacts: 0, byType: {}, byState: {} });
    c.packages++;
    c.artifacts += e.artifacts;
    for (const [k, v] of Object.entries(e.byType)) c.byType[k] = (c.byType[k] ?? 0) + v;
    for (const [k, v] of Object.entries(e.byState)) c.byState[k] = (c.byState[k] ?? 0) + v;
  }

  const payload: HubPackageList = {
    _provenance: {
      source: BASE,
      method: `anonymous ContentPackages (paged) filtered to Products tag "${PRODUCT}" → ContentPackages('<name>')/Artifacts tallied by Type and State`,
      product: PRODUCT,
      harvestedAt: startedAt,
      finishedAt: new Date().toISOString(),
      packagesScanned: all.length,
      packagesSelected: selected.length,
      completeness: "floor",
      note:
        "The named package set for one product. Counts are what SAP publishes in these packages — " +
        "NOT evidence that anything is available on a tenant. Regenerate with pnpm sap:hub:discover-packages; " +
        "review the diff of `packages[]` before committing.",
    },
    byCategory,
    packages: entries,
  };
  const outPath = resolve(process.cwd(), OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 1) + "\n");
  console.log(`Wrote ${entries.length} packages → ${OUT}`);
  for (const [k, v] of Object.entries(byCategory))
    console.log(
      `  ${k.padEnd(12)} packages ${String(v.packages).padStart(4)} · artifacts ${String(v.artifacts).padStart(6)} · ${JSON.stringify(v.byState)}`,
    );
}

if (process.argv[1] && /discover-hub-packages\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
