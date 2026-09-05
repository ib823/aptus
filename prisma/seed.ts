/**
 * Prisma seed entry point. Invoked via `pnpm db:seed`.
 *
 * Each seeder lives in `prisma/seeds/` and is idempotent — re-running the
 * script does not duplicate data. Seeders return a summary; this script
 * prints them and exits with a non-zero code only if a seeder throws.
 *
 * Test/fixture data (deterministic scenario seeds for vitest / Playwright)
 * lives under `tests/seed/` instead; this file is for baseline data the
 * running application depends on.
 */

import { PrismaClient } from "@prisma/client";
import { seedConversationTemplates } from "./seeds/conversation-templates";
import { seedValueStream } from "./seeds/value-stream";
import { seedValueStream2608 } from "./seeds/value-stream/dataset-2608";
import { seedProcessFlow } from "./seeds/value-stream/process-flow";
import { seedChapters } from "./seeds/value-stream/chapters";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[seed] starting");

  const conversation = await seedConversationTemplates(prisma);
  console.log(
    `[seed] conversation templates: ${conversation.created} created, ${conversation.skipped} skipped, ${conversation.scopeItemsWithNoSteps} scope items had no ProcessStep rows`,
  );

  const vs = await seedValueStream(prisma);
  console.log(
    `[seed] value-stream affirm-set: ${vs.streams} streams, ${vs.subProcesses} sub-processes, ${vs.scopeItems} scope items, ${vs.questions} questions (${vs.excluded} excluded, ${vs.flagged} flagged config-how-to)`,
  );

  // 2608 WS5 — additive: S4H_706 Process Automation as a new stream + re-levelled
  // S&P questions, tagged with the 2608 SapContentRelease row. Skipped (not
  // failed) when that row is absent, so a 2602-only database still seeds.
  try {
    const vs2608 = await seedValueStream2608(prisma);
    console.log(
      `[seed] value-stream 2608 delta: ${vs2608.streams} stream, ${vs2608.questions} questions (S4H_706), ${vs2608.relevelled} re-levelled`,
    );
  } catch (err) {
    if (err instanceof Error && /no SapContentRelease row for 2608/.test(err.message)) {
      console.log("[seed] value-stream 2608 delta: skipped — run `pnpm sap:2608:seed-release` first");
    } else {
      throw err;
    }
  }

  const pf = await seedProcessFlow(prisma);
  console.log(
    `[seed] process flow (MY 2602): ${pf.flows} flows, ${pf.steps} steps`,
  );

  const ch = await seedChapters(prisma);
  console.log(
    `[seed] affirm chapters: ${ch.items} items, ${ch.chapters} chapters, ${ch.reviewed} reviewed`,
  );

  console.log("[seed] done");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
