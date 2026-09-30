import { prisma } from "@/lib/db/prisma";
import { resolveSapContentRelease } from "@/lib/sap-content/release";

export interface CatalogRow {
  id: string;
  origin: "S4" | "PRODUCT";
  visibility: string;
  product: string;
  solution: string;
  release: string;
  code: string;
  kind: "SCOPE_ITEM" | "PROCESS";
  title: string;
  hasSteps: boolean;
  hasQuestions: boolean;
  hasDiagram: boolean;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** One Aptus view over the established S/4 catalogue and new product content. */
export async function getProductScopeCatalog(includeRestricted = false): Promise<CatalogRow[]> {
  const { release } = resolveSapContentRelease();
  const [s4, other, bdc, masterSteps] = await Promise.all([
    prisma.scopeItem.findMany({
      where: { catalogVersion: { version: release, edition: "PUBLIC" }, lifecycleStatus: "ACTIVE" },
      select: { id: true, scopeCode: true, nameClean: true, functionalArea: true, totalSteps: true },
      orderBy: { scopeCode: "asc" },
    }),
    prisma.productScopeItem.findMany({
      where: includeRestricted ? {} : { visibility: "PUBLIC" },
      orderBy: [{ productKey: "asc" }, { solutionKey: "asc" }, { scopeCode: "asc" }],
    }),
    prisma.affirmScopeItem.findMany({ where: { hasBdcCoverage: true }, select: { id: true } }),
    prisma.sapProcessStep.groupBy({
      by: ["scopeItemCode"], where: { contentRelease: { release } }, _count: { _all: true },
    }),
  ]);
  const bdcCodes = new Set(bdc.map((item) => item.id));
  const masterCodes = new Set(masterSteps.map((item) => item.scopeItemCode));
  return [
    ...s4.map((item): CatalogRow => ({
      id: item.id, origin: "S4", visibility: "PUBLIC", product: "S/4HANA Cloud Public Edition",
      solution: item.functionalArea, release, code: item.scopeCode, kind: "SCOPE_ITEM",
      title: item.nameClean, hasSteps: masterCodes.has(item.scopeCode) || item.totalSteps > 0,
      hasQuestions: bdcCodes.has(item.scopeCode), hasDiagram: masterCodes.has(item.scopeCode) || item.totalSteps > 0,
    })),
    ...other.map((item): CatalogRow => ({
      id: item.id, origin: "PRODUCT", visibility: item.visibility, product: item.productKey,
      solution: item.solutionKey, release: item.release, code: item.scopeCode,
      kind: item.scopeKind === "PROCESS" ? "PROCESS" : "SCOPE_ITEM",
      title: item.title, hasSteps: arrayLength(item.processSteps) > 0,
      hasQuestions: arrayLength(item.configQuestions) > 0,
      hasDiagram: arrayLength(item.processSteps) > 0,
    })),
  ];
}
