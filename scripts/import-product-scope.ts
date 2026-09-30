/** Import a reviewed SAP public/partner manifest without deleting older releases. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseProductScopeManifest } from "../src/lib/product-scope/manifest";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: pnpm sap:product-scope:import <manifest.json>");
  const absolutePath = path.resolve(input);
  const records = parseProductScopeManifest(JSON.parse(await readFile(absolutePath, "utf8")));
  const prisma = new PrismaClient();
  try {
    for (const record of records) {
      const sourceHash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
      const { productKey, solutionKey, release, country, language, scopeCode } = record;
      const identity = { productKey, solutionKey, release, country, language, scopeCode };
      const content = {
        scopeKind: record.scopeKind,
        title: record.title,
        description: record.description ?? null,
        sourceUrl: record.sourceUrl,
        sourceKind: record.sourceKind,
        sourceHash,
        processSteps: record.processSteps.map((step) => ({
          sequence: step.sequence, title: step.title,
          ...(step.role ? { role: step.role } : {}),
          ...(step.sourceUrl ? { sourceUrl: step.sourceUrl } : {}),
        })),
        configQuestions: record.configQuestions,
        processSourceUrl: record.processSourceUrl ?? null,
        configSourceUrl: record.configSourceUrl ?? null,
      };
      await prisma.productScopeItem.upsert({
        where: { productKey_solutionKey_release_country_language_scopeCode: identity },
        create: { ...identity, ...content },
        update: content,
      });
    }
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
