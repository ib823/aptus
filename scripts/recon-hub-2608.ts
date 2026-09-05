/**
 * RECON — SAP Business Accelerator Hub catalogue at 2608 (WS2, CCC PR-1 §3).
 *
 * Reconciles what the repository carries about the S/4HANA Cloud Public Hub
 * content against the figures verified live on 2026-09-05 (master prompt /
 * CCC note / currency assessment), from three sources:
 *
 *   packages   sap-references/hub-packages.s4public.json  (scripts/discover-hub-packages.ts)
 *   harvest    sap-references/api-hub-catalog.json + hub-harvest/*.json (scripts/harvest-sap-api-hub.ts)
 *   database   --db: SapApiReference / SapHubContent rows the importers wrote
 *
 * HARD GATES (exit 1): APIs in SAPS4HANACloud outside 859 ±5, or fewer than 50
 * of them DEPRECATED, or the events package outside 147 ±1% — the numbers the
 * CCC note fixes. Everything else is checked at ±1 % where it is an artefact
 * count SAP publishes per package, and reported as informational where the
 * product page counts something the anonymous catalogue cannot see the same way
 * (Integration / Build package tallies, VPUC).
 *
 * Usage:  pnpm sap:hub:recon-2608 [--db] [--json]
 * Exit:   0 green · 1 findings · 2 a source file is missing/unreadable
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const PACKAGES = "sap-references/hub-packages.s4public.json";
const API_CATALOG = "sap-references/api-hub-catalog.json";
const HARVEST_DIR = "sap-references/hub-harvest";
const MAIN_PACKAGE = "SAPS4HANACloud";
const EVENTS_PACKAGE = "SAPS4HANACloudBusinessEvents";
const TOLERANCE = 0.01;

/** Verified 2026-09-05 (CCC-2608-catalogue-refresh.md · Hub Catalogue Live tab). */
export const HUB_FACTS_2608 = {
  packageVersion: "2608",
  apis: 859,
  apisActive: 803,
  apisDeprecated: 56,
  apisMinDeprecated: 50, // CCC gate: "fail if … deprecated < 50"
  apisTolerance: 5, // CCC gate: "APIs ≠ 859 ±5"
  bySubType: { ODATAV4: 365, ODATA: 205, SOAP: 289 }, // 342+23 · 188+17 · 273+16
  events: 147,
  eventsActive: 139,
  eventsDeprecated: 8,
  cdsViews: 9288,
  badis: 1715,
  boInterfaces: 221,
  processBlueprintPackages: 16, // product page "Process Blueprints 16" = Category Scenarios packages
  analyticsPackages: 6,
  // Product-page figures the anonymous catalogue counts differently — informational.
  productPage: { integrations: 158, build: 91, vpuc: 5, liveProcess: null as number | null },
} as const;

type Fact = {
  name: string;
  expected: number | string;
  observed: number | string | null;
  ok: boolean;
  gate: "hard" | "soft" | "info";
};

type PackageList = {
  _provenance: { harvestedAt: string; packagesScanned: number; packagesSelected: number; product: string };
  byCategory: Record<
    string,
    { packages: number; artifacts: number; byType: Record<string, number>; byState: Record<string, number> }
  >;
  packages: {
    technicalName: string;
    version: string | null;
    category: string | null;
    artifacts: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
    byTypeState: Record<string, number>;
  }[];
};

function within(expected: number, observed: number | null, tol = TOLERANCE): boolean {
  return observed !== null && Math.abs(observed - expected) <= Math.max(1, Math.round(expected * tol));
}
function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, rel), "utf8")) as T;
}

function packageFacts(list: PackageList): { facts: Fact[]; notes: string[] } {
  const F = HUB_FACTS_2608;
  const facts: Fact[] = [];
  const notes: string[] = [];
  const main = list.packages.find((p) => p.technicalName === MAIN_PACKAGE);
  const events = list.packages.find((p) => p.technicalName === EVENTS_PACKAGE);
  const cat = (c: string) => list.byCategory[c] ?? { packages: 0, artifacts: 0, byType: {}, byState: {} };

  facts.push({
    name: `packages · ${MAIN_PACKAGE} version`,
    expected: F.packageVersion,
    observed: main?.version ?? null,
    ok: main?.version === F.packageVersion,
    gate: "hard",
  });
  const apis = main?.artifacts ?? null;
  facts.push({
    name: `packages · APIs in ${MAIN_PACKAGE}`,
    expected: `${F.apis} ±${F.apisTolerance}`,
    observed: apis,
    ok: apis !== null && Math.abs(apis - F.apis) <= F.apisTolerance,
    gate: "hard",
  });
  const dep = main?.byState.DEPRECATED ?? 0;
  facts.push({
    name: `packages · …of which DEPRECATED`,
    expected: `${F.apisDeprecated} (≥ ${F.apisMinDeprecated})`,
    observed: dep,
    ok: dep >= F.apisMinDeprecated,
    gate: "hard",
  });
  facts.push({
    name: `packages · …of which ACTIVE`,
    expected: F.apisActive,
    observed: main?.byState.ACTIVE ?? null,
    ok: within(F.apisActive, main?.byState.ACTIVE ?? null),
    gate: "soft",
  });
  const ev = events?.artifacts ?? null;
  facts.push({
    name: `packages · events in ${EVENTS_PACKAGE}`,
    expected: F.events,
    observed: ev,
    ok: within(F.events, ev),
    gate: "hard",
  });
  facts.push({
    name: `packages · events DEPRECATED`,
    expected: F.eventsDeprecated,
    observed: events?.byState.DEPRECATED ?? null,
    ok: (events?.byState.DEPRECATED ?? null) === F.eventsDeprecated,
    gate: "soft",
  });
  facts.push({
    name: "packages · CDS views (Category CDSViews)",
    expected: F.cdsViews,
    observed: cat("CDSViews").artifacts,
    ok: within(F.cdsViews, cat("CDSViews").artifacts),
    gate: "soft",
  });
  facts.push({
    name: "packages · BAdIs (SteamPunk · BADI)",
    expected: F.badis,
    observed: cat("SteamPunk").byType.BADI ?? 0,
    ok: within(F.badis, cat("SteamPunk").byType.BADI ?? 0),
    gate: "soft",
  });
  facts.push({
    name: "packages · BO interfaces (SteamPunk · BOInterface)",
    expected: F.boInterfaces,
    observed: cat("SteamPunk").byType.BOInterface ?? 0,
    ok: within(F.boInterfaces, cat("SteamPunk").byType.BOInterface ?? 0),
    gate: "soft",
  });
  facts.push({
    name: "packages · Process Blueprints (Category Scenarios packages)",
    expected: F.processBlueprintPackages,
    observed: cat("Scenarios").packages,
    ok: cat("Scenarios").packages === F.processBlueprintPackages,
    gate: "soft",
  });
  facts.push({
    name: "packages · Analytics packages",
    expected: F.analyticsPackages,
    observed: cat("Analytics").packages,
    ok: cat("Analytics").packages === F.analyticsPackages,
    gate: "soft",
  });
  facts.push({
    name: "packages · Integration packages (product page 158)",
    expected: F.productPage.integrations,
    observed: cat("Integration").packages,
    ok: true,
    gate: "info",
  });
  facts.push({
    name: "packages · Build packages (product page 91)",
    expected: F.productPage.build,
    observed: cat("Build").packages,
    ok: true,
    gate: "info",
  });
  facts.push({
    name: "packages · LiveProcess packages",
    expected: "n/a",
    observed: cat("LiveProcess").packages,
    ok: true,
    gate: "info",
  });
  facts.push({
    name: "packages · VPUC (product page 5)",
    expected: F.productPage.vpuc,
    observed: cat("VPUC").packages,
    ok: true,
    gate: "info",
  });
  notes.push(
    `package list: ${list.packages.length} packages tagged ${list._provenance.product} out of ${list._provenance.packagesScanned} scanned · harvested ${list._provenance.harvestedAt.slice(0, 10)}`,
  );
  notes.push(
    "Integration/Build/VPUC: the product page counts a logged-in view (associated packages included); the anonymous exact-tag enumeration is a floor — informational, not gated",
  );
  return { facts, notes };
}

function harvestFacts(): { facts: Fact[]; notes: string[] } {
  const F = HUB_FACTS_2608;
  const facts: Fact[] = [];
  const notes: string[] = [];
  const cat = readJson<{
    _provenance: { harvestedAt: string; packagesRead: number; artifactPaging?: string; productPackageList?: unknown };
    apis: Record<string, unknown>[];
  }>(API_CATALOG);
  const main = cat.apis.filter(
    (a) =>
      a.packageId === MAIN_PACKAGE ||
      (Array.isArray(a.packageIds) && (a.packageIds as string[]).includes(MAIN_PACKAGE)),
  );
  const byState = new Map<string, number>();
  const bySub = new Map<string, number>();
  for (const a of main) {
    byState.set(
      String(a.hubState ?? a.status ?? "NULL"),
      (byState.get(String(a.hubState ?? a.status ?? "NULL")) ?? 0) + 1,
    );
    bySub.set(
      String(a.hubSubType ?? a.apiType ?? "NULL"),
      (bySub.get(String(a.hubSubType ?? a.apiType ?? "NULL")) ?? 0) + 1,
    );
  }
  facts.push({
    name: `harvest · APIs in ${MAIN_PACKAGE} (api-hub-catalog.json)`,
    expected: `${F.apis} ±${F.apisTolerance}`,
    observed: main.length,
    ok: Math.abs(main.length - F.apis) <= F.apisTolerance,
    gate: "hard",
  });
  facts.push({
    name: "harvest · …DEPRECATED (hubState)",
    expected: `${F.apisDeprecated} (≥ ${F.apisMinDeprecated})`,
    observed: byState.get("DEPRECATED") ?? 0,
    ok: (byState.get("DEPRECATED") ?? 0) >= F.apisMinDeprecated,
    gate: "hard",
  });
  for (const [sub, exp] of Object.entries(F.bySubType))
    facts.push({
      name: `harvest · …${sub}`,
      expected: exp,
      observed: bySub.get(sub) ?? 0,
      ok: within(exp, bySub.get(sub) ?? 0),
      gate: "soft",
    });
  const withRelease = main.filter((a) => a.catalogueRelease === F.packageVersion).length;
  facts.push({
    name: `harvest · …catalogueRelease = ${F.packageVersion}`,
    expected: main.length,
    observed: withRelease,
    ok: withRelease === main.length,
    gate: "hard",
  });
  const withModified = main.filter((a) => typeof a.hubModifiedAt === "string").length;
  facts.push({
    name: "harvest · …hubModifiedAt present",
    expected: main.length,
    observed: withModified,
    ok: withModified === main.length,
    gate: "soft",
  });
  const events = readJson<Record<string, unknown>[]>(`${HARVEST_DIR}/EVENT.json`).filter(
    (r) => r.packageTechnicalName === EVENTS_PACKAGE,
  );
  const evDep = events.filter((r) => r.hubState === "DEPRECATED").length;
  facts.push({
    name: `harvest · events in ${EVENTS_PACKAGE} (hub-harvest/EVENT.json)`,
    expected: F.events,
    observed: events.length,
    ok: within(F.events, events.length),
    gate: "hard",
  });
  facts.push({
    name: "harvest · …events DEPRECATED",
    expected: F.eventsDeprecated,
    observed: evDep,
    ok: evDep === F.eventsDeprecated,
    gate: "soft",
  });
  const badi = readJson<Record<string, unknown>[]>(`${HARVEST_DIR}/BADI.json`).filter(
    (r) => r.catalogueRelease === F.packageVersion,
  ).length;
  const bo = readJson<Record<string, unknown>[]>(`${HARVEST_DIR}/BO_INTERFACE.json`).filter(
    (r) => r.catalogueRelease === F.packageVersion,
  ).length;
  facts.push({
    name: "harvest · BAdIs at release 2608",
    expected: F.badis,
    observed: badi,
    ok: within(F.badis, badi),
    gate: "soft",
  });
  facts.push({
    name: "harvest · BO interfaces at release 2608",
    expected: F.boInterfaces,
    observed: bo,
    ok: within(F.boInterfaces, bo),
    gate: "soft",
  });
  notes.push(
    `harvest: ${cat.apis.length} APIs hub-wide from ${cat._provenance.packagesRead} packages · harvested ${cat._provenance.harvestedAt.slice(0, 10)} · paging: ${String(cat._provenance.artifactPaging ?? "single page (pre-WS2)")}`,
  );
  return { facts, notes };
}

async function dbFacts(): Promise<{ facts: Fact[]; notes: string[] }> {
  const F = HUB_FACTS_2608;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    // catalogueRelease is the OWNING PACKAGE's version, and other packages share
    // "2608" (BYD, S4HANACloudABAPPlatform). The 859 gate is per package, so scope
    // by the harvested packageId(s) kept in rawMetadataJson — as the file gates do.
    const atRelease = await prisma.sapApiReference.findMany({
      where: { catalogueRelease: F.packageVersion },
      select: { hubState: true, rawMetadataJson: true },
    });
    const inMain = atRelease.filter((r) => {
      const raw = (r.rawMetadataJson ?? {}) as { packageId?: unknown; packageIds?: unknown };
      return raw.packageId === MAIN_PACKAGE || (Array.isArray(raw.packageIds) && raw.packageIds.includes(MAIN_PACKAGE));
    });
    const apis = inMain.length;
    const apisDep = inMain.filter((r) => r.hubState === "DEPRECATED").length;
    const atReleaseTotal = atRelease.length;
    const withSucc = await prisma.sapApiReference.count({
      where: { hubState: "DEPRECATED", successorExternalId: { not: null } },
    });
    const events = await prisma.sapHubContent.count({
      where: { contentType: "EVENT", catalogueRelease: F.packageVersion },
    });
    const eventsDep = await prisma.sapHubContent.count({
      where: { contentType: "EVENT", catalogueRelease: F.packageVersion, hubState: "DEPRECATED" },
    });
    const badis = await prisma.sapHubContent.count({
      where: { contentType: "BADI", catalogueRelease: F.packageVersion },
    });
    const bos = await prisma.sapHubContent.count({
      where: { contentType: "BO_INTERFACE", catalogueRelease: F.packageVersion },
    });
    const po = await prisma.sapApiReference.findUnique({
      where: { apiId: "API_PURCHASEORDER_PROCESS_SRV" },
      select: { hubState: true, successorExternalId: true },
    });
    const facts: Fact[] = [
      {
        name: `db · SapApiReference in ${MAIN_PACKAGE} at ${F.packageVersion}`,
        expected: `${F.apis} ±${F.apisTolerance}`,
        observed: apis,
        ok: Math.abs(apis - F.apis) <= F.apisTolerance,
        gate: "hard",
      },
      {
        name: `db · SapApiReference at catalogueRelease ${F.packageVersion} (all packages at 2608)`,
        expected: "≥ 859",
        observed: atReleaseTotal,
        ok: atReleaseTotal >= F.apis,
        gate: "info",
      },
      {
        name: "db · …hubState DEPRECATED",
        expected: `${F.apisDeprecated} (≥ ${F.apisMinDeprecated})`,
        observed: apisDep,
        ok: apisDep >= F.apisMinDeprecated,
        gate: "hard",
      },
      {
        name: "db · deprecated APIs carrying a SAP-named successor",
        expected: "≥ 1",
        observed: withSucc,
        ok: withSucc >= 1,
        gate: "soft",
      },
      {
        name: "db · API_PURCHASEORDER_PROCESS_SRV",
        expected: "DEPRECATED → CE_PURCHASEORDER_0001",
        observed: po ? `${po.hubState} → ${po.successorExternalId}` : "missing",
        ok: po?.hubState === "DEPRECATED" && po.successorExternalId === "CE_PURCHASEORDER_0001",
        gate: "soft",
      },
      {
        name: `db · SapHubContent EVENT at ${F.packageVersion}`,
        expected: F.events,
        observed: events,
        ok: within(F.events, events),
        gate: "hard",
      },
      {
        name: "db · …events DEPRECATED",
        expected: F.eventsDeprecated,
        observed: eventsDep,
        ok: eventsDep === F.eventsDeprecated,
        gate: "soft",
      },
      {
        name: `db · SapHubContent BADI at ${F.packageVersion}`,
        expected: F.badis,
        observed: badis,
        ok: within(F.badis, badis),
        gate: "soft",
      },
      {
        name: `db · SapHubContent BO_INTERFACE at ${F.packageVersion}`,
        expected: F.boInterfaces,
        observed: bos,
        ok: within(F.boInterfaces, bos),
        gate: "soft",
      },
    ];
    return { facts, notes: [] };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const json = args.has("--json");
  let list: PackageList;
  try {
    list = readJson<PackageList>(PACKAGES);
  } catch (err) {
    console.error(`RECON hub 2608 — cannot read ${PACKAGES}: ${(err as Error).message}`);
    return 2;
  }
  const facts: Fact[] = [];
  const notes: string[] = [];
  const p = packageFacts(list);
  facts.push(...p.facts);
  notes.push(...p.notes);
  try {
    const h = harvestFacts();
    facts.push(...h.facts);
    notes.push(...h.notes);
  } catch (err) {
    facts.push({
      name: "harvest files readable",
      expected: "yes",
      observed: (err as Error).message,
      ok: false,
      gate: "hard",
    });
  }
  if (args.has("--db")) {
    const d = await dbFacts();
    facts.push(...d.facts);
    notes.push(...d.notes);
  }
  const findings = facts
    .filter((f) => !f.ok)
    .map((f) => `${f.gate.toUpperCase()} DRIFT: ${f.name} — expected ${f.expected}, observed ${String(f.observed)}`);
  const ok = findings.length === 0;
  if (json) {
    console.log(JSON.stringify({ facts, notes, findings, ok }, null, 2));
  } else {
    console.log(
      `RECON hub 2608 — ${PACKAGES} · ${API_CATALOG} · ${HARVEST_DIR}/${args.has("--db") ? " · database" : ""}`,
    );
    const w = Math.max(...facts.map((f) => f.name.length));
    for (const f of facts)
      console.log(
        `  ${f.gate === "info" ? "INFO" : f.ok ? "OK  " : "FAIL"} ${f.name.padEnd(w)}  expected ${String(f.expected).padStart(14)}  observed ${String(f.observed)}`,
      );
    for (const n of notes) console.log(`  · ${n}`);
    if (findings.length) {
      for (const f of findings) console.log(`  ! ${f}`);
      console.log("  result:    DRIFT");
    } else console.log("  result:    GREEN — Hub catalogue matches the 2608 facts");
  }
  return ok ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
