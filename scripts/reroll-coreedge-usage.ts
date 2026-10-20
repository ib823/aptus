/**
 * One-off, safe to re-run: re-roll every CoreEdge usage day the audit feed
 * still holds whole, under the counting rules now deployed.
 *
 * WHEN TO RUN IT. Once, AFTER a change to `rollupDay`'s rules is deployed —
 * not before, or the nightly run still on the old code writes yesterday back
 * under the old rules. The nightly runner re-rolls only yesterday, so every
 * older day otherwise keeps the figures the old rules gave it for as long as
 * the Usage screen shows it.
 *
 * NOT AROUND 03:45 UTC, while the northbound-retention cron (vercel.json) is
 * running. That sweep cuts into the oldest day this re-rolls; the re-roll
 * checks before each day how far retention has got and stops there, but a day
 * read at the very moment the sweep is deleting from it would be rolled from
 * what was left.
 *
 * WHAT IT TOUCHES. Every day from the first one the retained feed holds whole
 * through yesterday: each is made to match its audit rows, in one transaction
 * per day. Days older than that are left exactly as they are, because their
 * audit rows are gone and no figure for them can be recomputed. Rows under the
 * `-deployment-` sentinel are removed on every day, since it is never an
 * organization. Re-running writes the same rows again.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/reroll-coreedge-usage.ts
 */

import { rerollRetainedUsage } from "@/lib/commercial/coreedge-usage";
import { prisma } from "@/lib/db/prisma";

async function main(): Promise<void> {
  const result = await rerollRetainedUsage();
  console.log(
    result.from
      ? `Re-rolled ${result.daysRerolled} day(s), ${result.from.slice(0, 10)} through yesterday; ${result.rowsWritten} organization-day row(s) written.`
      : "The audit feed holds no whole day; nothing was re-rolled.",
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
