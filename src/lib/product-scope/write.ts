import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ProductScopeRecord } from "./manifest";

export function productScopeSourceHash(record: ProductScopeRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

/** Shared write path for the local importer and the admin-only production import. */
export async function upsertProductScopeRecords(database: PrismaClient, records: ProductScopeRecord[]): Promise<void> {
  for (const record of records) {
    const { productKey, solutionKey, release, country, language, scopeCode } = record;
    const identity = { productKey, solutionKey, release, country, language, scopeCode };
    const content = {
      scopeKind: record.scopeKind,
      title: record.title,
      description: record.description ?? null,
      sourceUrl: record.sourceUrl,
      sourceKind: record.sourceKind,
      visibility: record.visibility,
      sourceHash: productScopeSourceHash(record),
      processSteps: record.processSteps.map((step) => ({
        sequence: step.sequence, title: step.title,
        ...(step.role ? { role: step.role } : {}),
        ...(step.sourceUrl ? { sourceUrl: step.sourceUrl } : {}),
      })),
      configQuestions: record.configQuestions,
      processSourceUrl: record.processSourceUrl ?? null,
      configSourceUrl: record.configSourceUrl ?? null,
    };
    await database.productScopeItem.upsert({
      where: { productKey_solutionKey_release_country_language_scopeCode: identity },
      create: { ...identity, ...content },
      update: { ...content, importedAt: new Date() },
    });
  }
}
