/**
 * Snapshot the live SAP scope-item catalog into a JSON fixture used by the
 * Phase 0 drift CI test (`tests/unit/curation-drift.test.ts`).
 *
 * The fixture is portable + works in CI without needing a seeded test DB.
 * Refresh the fixture only when there's been a deliberate catalog ingest —
 * arbitrary refreshes can mask drift bugs the test is meant to catch.
 *
 * Usage:
 *   $ pnpm catalog:snapshot
 *
 * Writes:
 *   tests/fixtures/catalog/scope-items.snapshot.json
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const items = await prisma.scopeItem.findMany({
    select: { id: true, version: true, name: true, country: true },
    orderBy: [{ version: "asc" }, { id: "asc" }],
  });

  const byVersion: Record<string, Array<{ id: string; name: string; country: string }>> = {};
  for (const it of items) {
    const v = it.version || "2602";
    if (!byVersion[v]) byVersion[v] = [];
    byVersion[v]!.push({ id: it.id, name: it.name, country: it.country });
  }

  const out = {
    snapshotAt: new Date().toISOString(),
    versions: byVersion,
    totalIds: items.length,
  };

  const dir = join(__dirname, "..", "tests", "fixtures", "catalog");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "scope-items.snapshot.json");
  writeFileSync(path, JSON.stringify(out, null, 2));

  console.log(`Snapshot wrote: ${items.length} scope items across ${Object.keys(byVersion).length} version(s) → ${path}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
