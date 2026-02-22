/**
 * Batch content parsing script — backfills ProcessStep records with parsedContent JSON.
 *
 * Usage: npx tsx scripts/parse-step-content.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseStepContent } from "../src/lib/assessment/content-parser";

const prisma = new PrismaClient();
const BATCH_SIZE = 100;

async function main() {
  const total = await prisma.processStep.count({
    where: { actionInstructionsHtml: { not: "" } },
  });
  console.log(`Found ${total} process steps with content to parse`);

  let processed = 0;
  let cursor: string | undefined;

  while (processed < total) {
    const steps = await prisma.processStep.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: { actionInstructionsHtml: { not: "" } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        actionInstructionsHtml: true,
      },
    });

    if (steps.length === 0) break;

    const updates = steps.map((step) => {
      const parsed = parseStepContent(step.actionInstructionsHtml);
      return prisma.processStep.update({
        where: { id: step.id },
        data: {
          parsedContent: JSON.parse(JSON.stringify(parsed)),
        },
      });
    });

    await prisma.$transaction(updates);

    processed += steps.length;
    cursor = steps[steps.length - 1]!.id;
    console.log(`Parsed ${processed}/${total} steps`);
  }

  console.log("Done — all step content parsed.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
