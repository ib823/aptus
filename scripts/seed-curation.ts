/**
 * Phase 9 — AD-10 seed migration.
 *
 * Pulls the existing TS-locked curation constants into the new DB tables:
 *   - SCOPE_ITEM_METADATA → ScopeItemCuration
 *   - PROCESS_LANDSCAPES → ProcessChain
 *   - PRESETS → ScopePreset
 *   - GAP_PRONE_AREAS (from upgrade-triggers.ts) → GapProneArea
 *
 * Idempotent — re-running upserts each row by its natural key.
 *
 * Usage:
 *   $ pnpm tsx scripts/seed-curation.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { SCOPE_ITEM_METADATA } from "../src/constants/scope-item-metadata";
import { PROCESS_LANDSCAPES } from "../src/constants/process-chains";
import { PRESETS } from "../src/constants/presets";

// Mirror of GAP_PRONE_AREAS from src/lib/scope/upgrade-triggers.ts:77-87.
// Once the curation table is the SoT, the heuristic engine reads from DB
// and this mirror disappears.
const GAP_PRONE_AREAS = [
  { name: "Human Resources",        matchPattern: "human resources",     rationaleMd: "HR functionality typically requires SuccessFactors EC + talent suite (separate licenses) in 2602.", severity: "high" },
  { name: "Sourcing/Procurement",   matchPattern: "sourcing|procurement", rationaleMd: "Strategic sourcing (E-RFQ/RFP) and supplier portal need Ariba (separate license).",                  severity: "high" },
  { name: "Tax/Reporting",          matchPattern: "tax|reporting",       rationaleMd: "Corporate tax computation (Form C, capital allowances) requires 3rd-party tax tool.",                 severity: "medium" },
];

async function seedScopeItemCuration(prisma: PrismaClient): Promise<number> {
  let count = 0;
  // Only seed for scope items that exist in the catalog (foreign-key safety).
  const catalog = new Set((await prisma.scopeItem.findMany({ select: { id: true } })).map((r) => r.id));

  for (const [scopeItemId, meta] of Object.entries(SCOPE_ITEM_METADATA)) {
    if (!catalog.has(scopeItemId)) {
      console.log(`  SKIP ${scopeItemId} — not in catalog`);
      continue;
    }
    const m = meta as unknown as Record<string, unknown>;
    await prisma.scopeItemCuration.upsert({
      where: { scopeItemId },
      create: {
        scopeItemId,
        modulesJson:        (m.modules as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        masterDataJson:     (m.masterData as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        dependenciesJson:   (m.dependencies as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        activityPatternsJson: (m.activityPatterns as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        implicationsJson:   (m.implications as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        curatedBy: "seed-curation.ts",
      },
      update: {
        modulesJson:        (m.modules as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        masterDataJson:     (m.masterData as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        dependenciesJson:   (m.dependencies as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        activityPatternsJson: (m.activityPatterns as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        implicationsJson:   (m.implications as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
    count++;
  }
  return count;
}

async function seedProcessChains(prisma: PrismaClient): Promise<number> {
  let count = 0;
  let order = 0;
  for (const landscape of PROCESS_LANDSCAPES) {
    for (const chain of landscape.chains) {
      await prisma.processChain.upsert({
        where: { area_name: { area: landscape.area, name: chain.name } },
        create: {
          area: landscape.area,
          name: chain.name,
          description: chain.description ?? null,
          scopeItemIdsOrdered: chain.steps.map((s) => s.scopeItemId),
          sortOrder: order++,
        },
        update: {
          description: chain.description ?? null,
          scopeItemIdsOrdered: chain.steps.map((s) => s.scopeItemId),
          sortOrder: order++,
        },
      });
      count++;
    }
  }
  return count;
}

async function seedPresets(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const [key, preset] of Object.entries(PRESETS)) {
    const defaultIds = preset.scopeItems.filter((i) => i.defaultSelected).map((i) => i.id);
    const optionalIds = preset.scopeItems.filter((i) => !i.defaultSelected).map((i) => i.id);
    await prisma.scopePreset.upsert({
      where: { key },
      create: {
        key,
        name: preset.name,
        description: preset.description,
        defaultScopeItemIds: defaultIds,
        optionalScopeItemIds: optionalIds,
        modulesJson: preset.modules as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: preset.name,
        description: preset.description,
        defaultScopeItemIds: defaultIds,
        optionalScopeItemIds: optionalIds,
        modulesJson: preset.modules as unknown as Prisma.InputJsonValue,
      },
    });
    count++;
  }
  return count;
}

async function seedGapProneAreas(prisma: PrismaClient): Promise<number> {
  let count = 0;
  let order = 0;
  for (const area of GAP_PRONE_AREAS) {
    // Idempotent: name is unique enough as a logical key for upsert.
    const existing = await prisma.gapProneArea.findFirst({ where: { name: area.name } });
    if (existing) {
      await prisma.gapProneArea.update({
        where: { id: existing.id },
        data: { matchPattern: area.matchPattern, rationaleMd: area.rationaleMd, severity: area.severity },
      });
    } else {
      await prisma.gapProneArea.create({
        data: { ...area, sortOrder: order++ },
      });
    }
    count++;
  }
  return count;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log("Seeding curation tables from TS constants...");

  const a = await seedScopeItemCuration(prisma);
  console.log(`  ScopeItemCuration: ${a} rows`);
  const b = await seedProcessChains(prisma);
  console.log(`  ProcessChain: ${b} rows`);
  const c = await seedPresets(prisma);
  console.log(`  ScopePreset: ${c} rows`);
  const d = await seedGapProneAreas(prisma);
  console.log(`  GapProneArea: ${d} rows`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
