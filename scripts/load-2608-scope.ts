/**
 * WS1 — load the 2608 scope-item catalogue from Availability & Dependencies.
 *
 * Creates ScopeCatalogVersion PUBLIC/2608 (INACTIVE — AD-3 parallel rows; WS7
 * flips the default) and one ScopeItem per code, stamped with the 2608
 * SapContentRelease:
 *
 *   ACTIVE               every code on the A&D "Scope" sheet            (679)
 *   DEPRECATION_PLANNED  …of which those on SAP's What's New list         (9, successors recorded)
 *   OBSOLETE             codes on the "Retired Scope Items" sheet that the
 *                        2602→2608 diff removed (scope-lifecycle-2608.json)  (6)
 *   RETIRED              every other code on the "Retired Scope Items" sheet (137)
 *   ANOMALY              codes in Process-Steps but not in A&D               (0 today)
 *
 * totalSteps = number of MY-available Process-Steps rows for the code (the
 * localisation this drop is cut for); 0 for retired/obsolete codes.
 * purpose/overview/prerequisites HTML stay "" — A&D does not carry them and
 * inventing them is not an option (BPD-derived text is WS5, 9 items only).
 *
 * Idempotent: upsert on (scopeCode, catalogVersionId); rows of the 2608
 * catalogue no longer produced by the files are deleted and reported.
 * Never touches a 2602 row. Refuses to run on a red manifest.
 *
 * Usage:  pnpm sap:2608:load-scope [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { ensureCatalogVersion, ensureContentRelease, integrityGate } from "./lib/sap-2608/db";
import { parseAvailabilityDependencies, parseProcessSteps, type AdScopeItem } from "./lib/sap-2608/parse";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);

type LifecycleEntry = { code: string; name: string; successors: string[]; note?: string };
type LifecycleFile = {
  release: string;
  added: string[];
  obsolete: LifecycleEntry[];
  deprecationPlanned: LifecycleEntry[];
};

export type LifecycleStatus = "ACTIVE" | "DEPRECATION_PLANNED" | "OBSOLETE" | "RETIRED" | "ANOMALY";

export type PlannedScopeItem = {
  scopeCode: string;
  name: string;
  lifecycleStatus: LifecycleStatus;
  successorScopeCodes: string[];
  lifecycleNote: string | null;
  ad: AdScopeItem | null;
  totalSteps: number;
};

export function loadLifecycleFile(dropDir: string): LifecycleFile {
  const file = path.resolve(process.cwd(), dropDir, "scope-lifecycle-2608.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as LifecycleFile;
  if (parsed.release !== RELEASE) throw new Error(`${file}: release ${parsed.release} != ${RELEASE}`);
  return parsed;
}

/** Pure: A&D + Process-Steps + the lifecycle list → the rows to write. Exposed for tests. */
export function planScopeItems(
  ad: Awaited<ReturnType<typeof parseAvailabilityDependencies>>,
  processStepCodes: Map<string, { total: number; my: number }>,
  lifecycle: LifecycleFile,
): { rows: PlannedScopeItem[]; findings: string[] } {
  const findings: string[] = [];
  const rows: PlannedScopeItem[] = [];
  const deprecation = new Map(lifecycle.deprecationPlanned.map((e) => [e.code, e]));
  const obsolete = new Map(lifecycle.obsolete.map((e) => [e.code, e]));

  for (const item of ad.items.values()) {
    const dep = deprecation.get(item.code);
    const steps = processStepCodes.get(item.code);
    rows.push({
      scopeCode: item.code,
      name: item.name,
      lifecycleStatus: dep ? "DEPRECATION_PLANNED" : "ACTIVE",
      successorScopeCodes: dep?.successors ?? [],
      lifecycleNote: dep ? `Deprecation planned (SAP What's New 2608). ${dep.note ?? ""}`.trim() : null,
      ad: item,
      totalSteps: steps?.my ?? 0,
    });
  }
  for (const code of deprecation.keys())
    if (!ad.items.has(code)) findings.push(`deprecation-planned code ${code} is not in the A&D Scope sheet`);

  const retiredSeen = new Set<string>();
  for (const r of ad.retired) {
    if (ad.items.has(r.code)) {
      findings.push(`retired code ${r.code} is ALSO on the Scope sheet — left ACTIVE, not RETIRED`);
      continue;
    }
    if (retiredSeen.has(r.code)) continue;
    retiredSeen.add(r.code);
    const ob = obsolete.get(r.code);
    rows.push({
      scopeCode: r.code,
      name: r.name,
      lifecycleStatus: ob ? "OBSOLETE" : "RETIRED",
      successorScopeCodes: ob?.successors ?? [],
      lifecycleNote: ob
        ? `Removed from A&D in 2608 (was in 2602). ${ob.note ?? ""}`.trim()
        : 'On the A&D 2608 "Retired Scope Items" sheet.',
      ad: null,
      totalSteps: 0,
    });
  }
  for (const code of obsolete.keys())
    if (!retiredSeen.has(code)) findings.push(`obsolete code ${code} is not on the Retired Scope Items sheet`);

  for (const [code, counts] of processStepCodes) {
    if (ad.items.has(code) || retiredSeen.has(code)) continue;
    rows.push({
      scopeCode: code,
      name: `(${code} — in Process-Steps only)`,
      lifecycleStatus: "ANOMALY",
      successorScopeCodes: [],
      lifecycleNote: `In BP_CLD_ENTPR_2608_Process-Steps (${counts.total} rows) but not in Availability & Dependencies 2608 — check in Process Navigator.`,
      ad: null,
      totalSteps: counts.my,
    });
  }
  return { rows, findings };
}

function countBy(rows: PlannedScopeItem[]): Record<LifecycleStatus, number> {
  const out: Record<LifecycleStatus, number> = {
    ACTIVE: 0,
    DEPRECATION_PLANNED: 0,
    OBSOLETE: 0,
    RETIRED: 0,
    ANOMALY: 0,
  };
  for (const r of rows) out[r.lifecycleStatus]++;
  return out;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const gate = integrityGate(SOURCES);
  if (!gate.ok) {
    console.error("load-2608-scope: refused — manifest integrity findings:");
    for (const f of gate.findings) console.error(`  ! ${f}`);
    return 1;
  }

  const [ad, steps] = await Promise.all([parseAvailabilityDependencies(SOURCES), parseProcessSteps(SOURCES)]);
  const stepCounts = new Map<string, { total: number; my: number }>();
  for (const s of steps) {
    const c = stepCounts.get(s.scopeItemCode) ?? { total: 0, my: 0 };
    c.total++;
    if (s.availableInMy) c.my++;
    stepCounts.set(s.scopeItemCode, c);
  }
  const lifecycle = loadLifecycleFile(SOURCES.dropDir!);
  const { rows, findings } = planScopeItems(ad, stepCounts, lifecycle);
  const by = countBy(rows);

  console.log(
    `load-2608-scope — A&D ${ad.items.size} codes / ${ad.rowCount} rows · retired sheet ${ad.retired.length} · process-steps ${stepCounts.size} codes`,
  );
  console.log(
    `  plan: ${rows.length} rows → ACTIVE ${by.ACTIVE} · DEPRECATION_PLANNED ${by.DEPRECATION_PLANNED} · OBSOLETE ${by.OBSOLETE} · RETIRED ${by.RETIRED} · ANOMALY ${by.ANOMALY}`,
  );
  console.log(`  MY-available (A&D): ${[...ad.items.values()].filter((i) => i.availableInMy).length}`);
  for (const f of findings) console.log(`  ! ${f}`);
  if (dryRun) {
    console.log("  dry-run: no database write");
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    const contentRelease = await ensureContentRelease(prisma, SOURCES, gate);
    const catalog = await ensureCatalogVersion(prisma, RELEASE, gate.manifestHash, contentRelease.id);
    console.log(
      `  SapContentRelease ${contentRelease.id} · ScopeCatalogVersion PUBLIC/${RELEASE} ${catalog.id} (isActive=${catalog.isActive})`,
    );

    let created = 0;
    let updated = 0;
    const existing = new Set(
      (await prisma.scopeItem.findMany({ where: { catalogVersionId: catalog.id }, select: { scopeCode: true } })).map(
        (r) => r.scopeCode,
      ),
    );
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await prisma.$transaction(
        batch.map((r) => {
          const common = {
            name: r.name,
            nameClean: r.name,
            version: RELEASE,
            country: r.ad?.availableInMy ? "MY" : "XX",
            totalSteps: r.totalSteps,
            functionalArea: r.ad?.lobs[0] ?? (r.lifecycleStatus === "ANOMALY" ? "Unknown" : "Retired"),
            subArea: r.ad?.businessAreas[0] ?? (r.lifecycleStatus === "ANOMALY" ? "Unknown" : "Retired"),
            lifecycleStatus: r.lifecycleStatus,
            successorScopeCodes: r.successorScopeCodes,
            lifecycleNote: r.lifecycleNote,
            provisioning: r.ad?.provisioning ?? null,
            availableInMy: r.ad ? r.ad.availableInMy : null,
            myAvailableSince: r.ad?.myAvailableSince ?? null,
            lobs: r.ad?.lobs ?? [],
            businessAreas: r.ad?.businessAreas ?? [],
            requiredScopeCodes: r.ad?.requiredScopeCodes ?? [],
            sapComponent: r.ad?.component || null,
            licenseRequired: r.ad?.licenseRequired || null,
            releaseId: contentRelease.id,
          };
          if (existing.has(r.scopeCode)) updated++;
          else created++;
          return prisma.scopeItem.upsert({
            where: { scopeCode_catalogVersionId: { scopeCode: r.scopeCode, catalogVersionId: catalog.id } },
            create: {
              scopeCode: r.scopeCode,
              catalogVersionId: catalog.id,
              purposeHtml: "",
              overviewHtml: "",
              prerequisitesHtml: "",
              language: "EN",
              ...common,
            },
            update: common,
          });
        }),
      );
    }
    const produced = new Set(rows.map((r) => r.scopeCode));
    const stale = [...existing].filter((c) => !produced.has(c));
    if (stale.length) {
      const del = await prisma.scopeItem.deleteMany({
        where: { catalogVersionId: catalog.id, scopeCode: { in: stale } },
      });
      console.log(
        `  removed ${del.count} stale 2608 row(s): ${stale.slice(0, 10).join(", ")}${stale.length > 10 ? ", …" : ""}`,
      );
    }
    const dbBy = await prisma.scopeItem.groupBy({
      by: ["lifecycleStatus"],
      where: { catalogVersionId: catalog.id },
      _count: { _all: true },
    });
    console.log(`  written: ${created} created · ${updated} updated`);
    console.log(`  db PUBLIC/${RELEASE}: ${dbBy.map((g) => `${g.lifecycleStatus} ${g._count._all}`).join(" · ")}`);
    const untouched2602 = await prisma.scopeItem.count({ where: { releaseId: null } });
    console.log(`  2602-era rows (releaseId null) untouched: ${untouched2602}`);
    return findings.length ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /load-2608-scope\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
