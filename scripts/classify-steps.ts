/**
 * Batch classification script — backfills ProcessStep records with
 * stepCategory, isClassifiable, groupKey, groupLabel.
 *
 * Usage: npx tsx scripts/classify-steps.ts
 */
import { PrismaClient } from "@prisma/client";
import { classifyStep, isStepClassifiable, deriveGroupKey, deriveGroupLabel } from "../src/lib/assessment/step-classifier";

const prisma = new PrismaClient();
const BATCH_SIZE = 100;

async function main() {
  const total = await prisma.processStep.count();
  console.log(`Found ${total} process steps to classify`);

  let processed = 0;
  let cursor: string | undefined;

  while (processed < total) {
    const steps = await prisma.processStep.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        stepType: true,
        activityTitle: true,
        activityId: true,
      },
    });

    if (steps.length === 0) break;

    const updates = steps.map((step) => {
      const stepCategory = classifyStep(step.stepType);
      const classifiable = isStepClassifiable(stepCategory);
      const groupKey = deriveGroupKey({ stepCategory, activityTitle: step.activityTitle });
      const groupLabel = deriveGroupLabel({ stepCategory, activityTitle: step.activityTitle });

      return prisma.processStep.update({
        where: { id: step.id },
        data: {
          stepCategory,
          isClassifiable: classifiable,
          groupKey,
          groupLabel,
        },
      });
    });

    await prisma.$transaction(updates);

    processed += steps.length;
    cursor = steps[steps.length - 1]!.id;
    console.log(`Classified ${processed}/${total} steps`);
  }

  console.log("Done — all steps classified.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
