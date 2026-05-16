/**
 * Seed: ConversationTemplate baselines.
 *
 * Phase 22 (Conversation Mode) ships with an empty ConversationTemplate
 * table. Without at least one template per scope item, the conversation UI
 * has nothing to display. This seed plants a single generic "fit / gap /
 * configure" flow against the first ProcessStep of each scope item so the
 * feature is exercisable end-to-end. Admins can author scope/step-specific
 * templates via /admin/conversation-templates afterwards.
 *
 * Idempotent: looks up the unique (scopeItemId, processStepId, language)
 * key; skips if already present. Safe to run multiple times.
 */

import type { PrismaClient } from "@prisma/client";
import type { QuestionFlow } from "../../src/types/conversation";

const SEED_AUTHOR = "system@seed";
const DEFAULT_LANGUAGE = "en";

const GENERIC_FLOW: QuestionFlow = {
  rootQuestionId: "q1",
  questions: [
    {
      id: "q1",
      text: "Does your organization currently perform this process exactly as described in the SAP standard?",
      helpText:
        "Answer 'Yes' only if your current process matches the SAP best practice without modification.",
      answers: [
        { id: "yes", text: "Yes, exactly as described", classification: "FIT" },
        { id: "minor", text: "Yes, with minor adjustments", nextQuestionId: "q2" },
        { id: "different", text: "No, we do it significantly differently", nextQuestionId: "q3" },
        { id: "absent", text: "We don't perform this process at all", classification: "NA" },
      ],
    },
    {
      id: "q2",
      text: "Are the adjustments achievable through standard SAP configuration (no custom code)?",
      helpText:
        "Configuration includes setting up tables, defining attributes, and adjusting rules through the SAP IMG. It excludes custom code or third-party tools.",
      answers: [
        { id: "yes", text: "Yes — configuration only", classification: "CONFIGURE" },
        { id: "no", text: "No — custom development is required", classification: "GAP" },
      ],
    },
    {
      id: "q3",
      text: "Could your business process be adapted to the SAP standard, or is the difference essential?",
      helpText:
        "Some process differences are accidental (legacy workarounds); others are essential to your business model and cannot be changed.",
      answers: [
        { id: "adapt", text: "We could adapt our process", classification: "CONFIGURE" },
        { id: "essential", text: "The difference is essential to our business", classification: "GAP" },
      ],
    },
  ],
};

export async function seedConversationTemplates(prisma: PrismaClient): Promise<{
  created: number;
  skipped: number;
  scopeItemsWithNoSteps: number;
}> {
  const scopeItems = await prisma.scopeItem.findMany({
    select: { id: true, scopeCode: true },
  });

  let created = 0;
  let skipped = 0;
  let scopeItemsWithNoSteps = 0;

  for (const scopeItem of scopeItems) {
    const firstStep = await prisma.processStep.findFirst({
      where: { scopeItemId: scopeItem.id },
      orderBy: { sequence: "asc" },
      select: { id: true },
    });

    if (!firstStep) {
      scopeItemsWithNoSteps += 1;
      continue;
    }

    const existing = await prisma.conversationTemplate.findUnique({
      where: {
        scopeItemId_processStepId_language: {
          scopeItemId: scopeItem.id,
          processStepId: firstStep.id,
          language: DEFAULT_LANGUAGE,
        },
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.conversationTemplate.create({
      data: {
        scopeItemId: scopeItem.id,
        processStepId: firstStep.id,
        language: DEFAULT_LANGUAGE,
        version: 1,
        questionFlow: GENERIC_FLOW as unknown as object,
        createdBy: SEED_AUTHOR,
        isActive: true,
      },
    });
    created += 1;
  }

  return { created, skipped, scopeItemsWithNoSteps };
}
