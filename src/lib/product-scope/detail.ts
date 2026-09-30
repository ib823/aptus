import { prisma } from "@/lib/db/prisma";
import { resolveSapContentRelease } from "@/lib/sap-content/release";
import { productScopeQuestion, productScopeStep } from "./manifest";

export interface ScopeDetail {
  id: string;
  product: string;
  solution: string;
  release: string;
  code: string;
  title: string;
  kind: "SCOPE_ITEM" | "PROCESS";
  description: string | null;
  sourceUrl: string | null;
  sourceKind: string;
  processSourceUrl: string | null;
  configSourceUrl: string | null;
  steps: { sequence: number; title: string; role?: string }[];
  questions: { key: string; question: string; sourceUrl?: string }[];
}

export async function getScopeDetail(origin: string, id: string): Promise<ScopeDetail | null> {
  if (origin === "product") {
    const item = await prisma.productScopeItem.findUnique({ where: { id } });
    if (!item) return null;
    const steps = productScopeStep.array().safeParse(item.processSteps);
    const questions = productScopeQuestion.array().safeParse(item.configQuestions);
    return {
      id: item.id, product: item.productKey, solution: item.solutionKey,
      release: item.release, code: item.scopeCode, title: item.title,
      kind: item.scopeKind === "PROCESS" ? "PROCESS" : "SCOPE_ITEM",
      description: item.description, sourceUrl: item.sourceUrl, sourceKind: item.sourceKind,
      processSourceUrl: item.processSourceUrl, configSourceUrl: item.configSourceUrl,
      steps: steps.success ? steps.data.map((step) => ({
        sequence: step.sequence, title: step.title, ...(step.role ? { role: step.role } : {}),
      })) : [],
      questions: questions.success ? questions.data : [],
    };
  }
  if (origin !== "s4") return null;
  const release = resolveSapContentRelease().release;
  const item = await prisma.scopeItem.findUnique({
    where: { id }, include: { catalogVersion: { select: { version: true, edition: true, sourceArchiveUrl: true } } },
  });
  if (!item || item.catalogVersion.version !== release || item.catalogVersion.edition !== "PUBLIC") return null;
  const [master, bdc] = await Promise.all([
    prisma.sapProcessStep.findMany({
      where: { scopeItemCode: item.scopeCode, contentRelease: { release } },
      orderBy: { sequence: "asc" }, select: { sequence: true, activity: true, businessRoleDescription: true },
    }),
    prisma.affirmQuestion.findMany({
      where: { scopeItemRefs: { has: item.scopeCode }, status: "confirmed" },
      select: { id: true, consultantWording: true, sapVerbatim: true },
    }),
  ]);
  return {
    id: item.id, product: "S/4HANA Cloud Public Edition", solution: item.functionalArea,
    release, code: item.scopeCode, title: item.nameClean, kind: "SCOPE_ITEM",
    description: null, sourceUrl: item.catalogVersion.sourceArchiveUrl,
    sourceKind: "SAP Best Practices import", processSourceUrl: null, configSourceUrl: null,
    steps: master.map((step) => ({ sequence: step.sequence, title: step.activity, ...(step.businessRoleDescription ? { role: step.businessRoleDescription } : {}) })),
    questions: bdc.map((question) => ({ key: question.id, question: question.consultantWording || question.sapVerbatim || "" })).filter((question) => question.question),
  };
}
