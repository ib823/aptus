/** Verify that a reviewed manifest is present in Aptus with matching content. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseProductScopeManifest } from "../src/lib/product-scope/manifest";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: pnpm sap:product-scope:recon <manifest.json>");
  const records = parseProductScopeManifest(JSON.parse(await readFile(path.resolve(input), "utf8")));
  const prisma = new PrismaClient();
  let missing = 0;
  let drift = 0;
  try {
    for (const record of records) {
      const identity = {
        productKey: record.productKey, solutionKey: record.solutionKey, release: record.release,
        country: record.country, language: record.language, scopeCode: record.scopeCode,
      };
      const landed = await prisma.productScopeItem.findUnique({
        where: { productKey_solutionKey_release_country_language_scopeCode: identity },
        select: { sourceHash: true },
      });
      if (!landed) { missing++; continue; }
      const expectedHash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
      if (landed.sourceHash !== expectedHash) drift++;
    }
    const all = await prisma.productScopeItem.findMany({
      select: { productKey: true, solutionKey: true, release: true, processSteps: true, configQuestions: true, processSourceUrl: true },
    });
    const groups = new Map<string, { total: number; steps: number; questions: number; diagrams: number }>();
    for (const item of all) {
      const key = `${item.productKey}/${item.solutionKey}/${item.release}`;
      const group = groups.get(key) ?? { total: 0, steps: 0, questions: 0, diagrams: 0 };
      group.total++;
      if (Array.isArray(item.processSteps) && item.processSteps.length) group.steps++;
      if (Array.isArray(item.configQuestions) && item.configQuestions.length) group.questions++;
      if ((Array.isArray(item.processSteps) && item.processSteps.length) || item.processSourceUrl) group.diagrams++;
      groups.set(key, group);
    }
    console.table([...groups].map(([source, coverage]) => ({ source, ...coverage })));
    console.log(`Manifest: ${records.length}; missing: ${missing}; content drift: ${drift}`);
    if (missing || drift) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
