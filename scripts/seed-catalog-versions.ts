/**
 * Phase 1 — AD-3 backfill seed.
 *
 * Creates the canonical PUBLIC_2602 ScopeCatalogVersion row and points
 * every existing ScopeItem + Assessment at it. Idempotent — safe to re-run.
 *
 * Run after `prisma db push` adds the new column. After this runs,
 * a follow-up migration can flip catalogVersionId to non-nullable on both
 * tables.
 *
 * Usage:
 *   $ pnpm tsx scripts/seed-catalog-versions.ts
 */

import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  // Idempotent upsert of the canonical PUBLIC_2602 version.
  const baseline = await prisma.scopeCatalogVersion.upsert({
    where: { version_edition: { version: "2602", edition: "PUBLIC" } },
    create: {
      version: "2602",
      edition: "PUBLIC",
      releaseDate: new Date("2026-02-01"), // SAP 2602 release window
      notes: "Backfilled from pre-versioning era — every ScopeItem and Assessment that existed before Phase 1 is pinned to this version.",
      isActive: true,
    },
    update: {}, // no-op if exists
  });

  console.log(`PUBLIC_2602 catalog version id: ${baseline.id}`);

  // Backfill every ScopeItem with NULL catalogVersionId.
  const siResult = await prisma.scopeItem.updateMany({
    where: { catalogVersionId: null },
    data: { catalogVersionId: baseline.id },
  });
  console.log(`Backfilled ${siResult.count} ScopeItem rows`);

  // Backfill every Assessment with NULL catalogVersionId.
  const aResult = await prisma.assessment.updateMany({
    where: { catalogVersionId: null },
    data: { catalogVersionId: baseline.id },
  });
  console.log(`Backfilled ${aResult.count} Assessment rows`);

  // Verify zero remaining nulls.
  const siRemaining = await prisma.scopeItem.count({ where: { catalogVersionId: null } });
  const aRemaining = await prisma.assessment.count({ where: { catalogVersionId: null } });
  console.log(`Post-backfill: ${siRemaining} ScopeItems + ${aRemaining} Assessments still NULL (should be 0)`);

  if (siRemaining > 0 || aRemaining > 0) {
    console.error("WARN: backfill incomplete — investigate before flipping FK to non-nullable.");
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
