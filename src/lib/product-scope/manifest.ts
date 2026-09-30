import { z } from "zod";

const httpsUrl = z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS source URL");

export const productScopeStep = z.object({
  sequence: z.int().positive(),
  title: z.string().trim().min(3),
  role: z.string().trim().optional(),
  sourceUrl: httpsUrl.optional(),
});

export const productScopeQuestion = z.object({
  key: z.string().trim().min(1),
  question: z.string().trim().min(5),
  sourceUrl: httpsUrl,
});

export const productScopeRecord = z.object({
  productKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  solutionKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  release: z.string().trim().min(1),
  country: z.string().regex(/^[A-Z]{2}$/).default("XX"),
  language: z.string().regex(/^[A-Z]{2}$/).default("EN"),
  scopeCode: z.string().trim().min(2),
  scopeKind: z.enum(["SCOPE_ITEM", "PROCESS"]),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  sourceUrl: httpsUrl,
  sourceKind: z.enum(["SAP_HELP", "PROCESS_NAVIGATOR", "PARTNER_EXPORT"]),
  processSteps: z.array(productScopeStep),
  configQuestions: z.array(productScopeQuestion),
  processSourceUrl: httpsUrl.optional(),
  configSourceUrl: httpsUrl.optional(),
});

export type ProductScopeRecord = z.infer<typeof productScopeRecord>;

export function parseProductScopeManifest(raw: unknown): ProductScopeRecord[] {
  const records = z.array(productScopeRecord).parse(raw);
  const identities = new Set<string>();
  for (const record of records) {
    const identity = [record.productKey, record.solutionKey, record.release,
      record.country, record.language, record.scopeCode].join("/");
    if (identities.has(identity)) throw new Error(`Duplicate product scope identity: ${identity}`);
    identities.add(identity);
    record.processSteps.forEach((step, index) => {
      if (step.sequence !== index + 1) {
        throw new Error(`${identity}: process steps must be ordered and numbered from 1`);
      }
    });
    const questionKeys = new Set<string>();
    for (const question of record.configQuestions) {
      if (questionKeys.has(question.key)) throw new Error(`${identity}: duplicate question ${question.key}`);
      questionKeys.add(question.key);
    }
  }
  return records;
}
