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

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[seed] starting");

  const conversation = await seedConversationTemplates(prisma);
  console.log(
    `[seed] conversation templates: ${conversation.created} created, ${conversation.skipped} skipped, ${conversation.scopeItemsWithNoSteps} scope items had no ProcessStep rows`,
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
