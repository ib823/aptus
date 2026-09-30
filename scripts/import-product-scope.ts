/** Import a reviewed SAP public/partner manifest without deleting older releases. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseProductScopeManifest } from "../src/lib/product-scope/manifest";
import { upsertProductScopeRecords } from "../src/lib/product-scope/write";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: pnpm sap:product-scope:import <manifest.json>");
  const absolutePath = path.resolve(input);
  const records = parseProductScopeManifest(JSON.parse(await readFile(absolutePath, "utf8")));
  const prisma = new PrismaClient();
  try {
    await upsertProductScopeRecords(prisma, records);
    const byProduct = Object.groupBy(records, (record) => record.productKey);
    for (const [product, items] of Object.entries(byProduct)) {
      console.log(`${product}: ${items?.length ?? 0} imported; ${items?.filter((item) => item.processSteps.length).length ?? 0} with steps`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
