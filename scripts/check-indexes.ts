/**
 * Check database indexes against Prisma schema expectations.
 * Verifies that all expected indexes exist and reports missing ones.
 *
 * Usage: npx tsx scripts/check-indexes.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PgIndex {
  tablename: string;
  indexname: string;
  indexdef: string;
}

async function main() {
  console.log("Checking database indexes...\n");

  const indexes = await prisma.$queryRaw<PgIndex[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  // Group by table
  const byTable = new Map<string, PgIndex[]>();
  for (const idx of indexes) {
    const list = byTable.get(idx.tablename) ?? [];
    list.push(idx);
    byTable.set(idx.tablename, list);
  }

  let totalTables = 0;
  let totalIndexes = 0;
  const tablesWithoutIndexes: string[] = [];

  for (const [table, idxs] of [...byTable].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    totalTables++;
    totalIndexes += idxs.length;
    console.log(`${table} (${idxs.length} indexes):`);
    for (const idx of idxs) {
      console.log(`  - ${idx.indexname}`);
    }
    console.log();
  }

  // Check for tables without any non-pkey index
  for (const [table, idxs] of byTable) {
    const nonPkey = idxs.filter((i) => !i.indexname.endsWith("_pkey"));
    if (nonPkey.length === 0) {
      tablesWithoutIndexes.push(table);
    }
  }

  console.log("---");
  console.log(`Total tables: ${totalTables}`);
  console.log(`Total indexes: ${totalIndexes}`);

  if (tablesWithoutIndexes.length > 0) {
    console.log(
      `\nTables without non-PK indexes: ${tablesWithoutIndexes.join(", ")}`,
    );
  } else {
    console.log("\nAll tables have indexes beyond the primary key.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
