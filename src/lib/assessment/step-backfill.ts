/** Phase 12: Backfill step metadata (classification + parsed content + groups) */

import { prisma } from "@/lib/db/prisma";
import { classifyStep, isStepClassifiable, deriveGroupKey, deriveGroupLabel } from "@/lib/assessment/step-classifier";
import { parseStepContent } from "@/lib/assessment/content-parser";
import type { Prisma } from "@prisma/client";

const BATCH_SIZE = 100;

/**
 * Backfill all ProcessSteps with stepCategory, isClassifiable, groupKey, groupLabel, and parsedContent.
 * Processes in batches of 100 to avoid memory issues.
 */
export async function backfillStepMetadata(): Promise<{ processed: number; batches: number }> {
  let processed = 0;
  let batches = 0;
  let cursor: string | undefined;

  while (true) {
    const steps = await prisma.processStep.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        stepType: true,
        activityTitle: true,
        actionInstructionsHtml: true,
        actionExpectedResult: true,
      },
      orderBy: { id: "asc" },
    });

    if (steps.length === 0) break;

    const updates: Prisma.PrismaPromise<unknown>[] = steps.map((step) => {
      const stepCategory = classifyStep(step.stepType);
      const classifiable = isStepClassifiable(stepCategory);
      const groupKey = deriveGroupKey({ stepCategory, activityTitle: step.activityTitle });
      const groupLabel = deriveGroupLabel({ stepCategory, activityTitle: step.activityTitle });
      const parsedContent = parseStepContent(step.actionInstructionsHtml);

      return prisma.processStep.update({
        where: { id: step.id },
        data: {
          stepCategory,
          isClassifiable: classifiable,
          groupKey,
          groupLabel,
          parsedContent: parsedContent as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await prisma.$transaction(updates);

    processed += steps.length;
    batches++;
    cursor = steps[steps.length - 1]?.id;

    if (steps.length < BATCH_SIZE) break;
  }

  return { processed, batches };
}
