/** Verify that a reviewed manifest is present in Aptus with matching content. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseProductScopeManifest } from "../src/lib/product-scope/manifest";

async function main() {
  const [input, ...flags] = process.argv.slice(2);
  if (!input) throw new Error("Usage: pnpm sap:product-scope:recon <manifest.json> [--complete --expected-count N]");
  const complete = flags.includes("--complete");
  const countFlag = flags.indexOf("--expected-count");
  const expectedCount = countFlag >= 0 ? Number(flags[countFlag + 1]) : null;
  if (complete && (expectedCount === null || !Number.isSafeInteger(expectedCount) || expectedCount < 1)) {
    throw new Error("--complete requires the authoritative source count: --expected-count N");
  }
  const records = parseProductScopeManifest(JSON.parse(await readFile(path.resolve(input), "utf8")));
  if (complete && records.length !== expectedCount) {
    throw new Error(`Source count ${expectedCount} does not match ${records.length} manifest records`);
  }
  const prisma = new PrismaClient();
  let missing = 0;
  let drift = 0;
  let unexpected = 0;
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
      select: { productKey: true, solutionKey: true, release: true, country: true, language: true,
        scopeCode: true, processSteps: true, configQuestions: true, processSourceUrl: true },
    });
    if (complete) {
      // A complete source snapshot must account for every stored identity in
      // its product/solution/release/country/language groups, not merely prove
      // that its own rows were imported. Other groups and releases remain valid.
      const sourceGroups = new Map<string, Set<string>>();
      for (const record of records) {
        const group = [record.productKey, record.solutionKey, record.release, record.country, record.language].join("/");
        const codes = sourceGroups.get(group) ?? new Set<string>();
        codes.add(record.scopeCode);
        sourceGroups.set(group, codes);
      }
      for (const item of all) {
        const group = [item.productKey, item.solutionKey, item.release, item.country, item.language].join("/");
        const codes = sourceGroups.get(group);
        if (codes && !codes.has(item.scopeCode)) unexpected++;
      }
    }
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
    console.log(`Manifest: ${records.length}; missing: ${missing}; content drift: ${drift}` +
      (complete ? `; unexpected in covered source groups: ${unexpected}; source count: ${expectedCount}` : "; source completeness: not asserted"));
    if (missing || drift || unexpected) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
