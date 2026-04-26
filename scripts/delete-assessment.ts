/**
 * Hard-delete an Assessment + all dependent rows (cascade across 28 tables).
 *
 * IRREVERSIBLE. Reads DATABASE_URL from env. Defaults to dry-run; pass
 * --confirm to actually execute.
 *
 * Usage:
 *   npx tsx scripts/delete-assessment.ts <assessment-id>            # dry-run
 *   npx tsx scripts/delete-assessment.ts <assessment-id> --confirm  # delete
 *
 * Examples:
 *   # Dry-run against local DB
 *   npx tsx scripts/delete-assessment.ts cmoe2y0hu00016333lpm280vk
 *
 *   # Actual delete against production (pull env first)
 *   vercel env pull .env.delete --environment=production
 *   set -a; source .env.delete; set +a
 *   npx tsx scripts/delete-assessment.ts <id> --confirm
 *   rm .env.delete
 *
 * Originally created 2026-04-26 to delete the original Bursa Malaysia
 * assessment (cmoe2y0hu00016333lpm280vk). Generalized for reuse.
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const RAW_ID = args.find((a) => !a.startsWith("--"));
const DRY_RUN = !args.includes("--confirm");

if (!RAW_ID) {
  console.error("✗ Missing assessment ID.\n");
  console.error("Usage:");
  console.error("  npx tsx scripts/delete-assessment.ts <assessment-id>            # dry-run");
  console.error("  npx tsx scripts/delete-assessment.ts <assessment-id> --confirm  # delete");
  process.exit(1);
}

// Narrowed type for downstream — process.exit() doesn't propagate as `never`
// in this TS config so we re-assign through a typed const.
const ASSESSMENT_ID: string = RAW_ID;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log(`\n${DRY_RUN ? "🔍 DRY RUN" : "🔥 LIVE DELETE"} — assessment cascade-delete`);
  console.log(`   Assessment ID: ${ASSESSMENT_ID}`);
  console.log(`   Target DB:     ${(process.env.DATABASE_URL ?? "").replace(/:[^@]+@/, ":***@")}\n`);

  const assessment = await prisma.assessment.findUnique({
    where: { id: ASSESSMENT_ID },
    select: { id: true, companyName: true, status: true, deletedAt: true },
  });

  if (!assessment) {
    console.log(`✗ Assessment ${ASSESSMENT_ID} not found. Nothing to delete.`);
    return;
  }

  console.log(`✓ Found assessment:`);
  console.log(`     companyName: ${assessment.companyName}`);
  console.log(`     status:      ${assessment.status}`);
  console.log(`     deletedAt:   ${assessment.deletedAt ?? "(not soft-deleted)"}\n`);

  // Count rows in every dependent table BEFORE delete
  const counts = await countDependents(ASSESSMENT_ID);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  console.log(`Dependent rows (will be deleted):`);
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`     ${n.toString().padStart(6)} ${table}`);
  }
  console.log(`     ${"------".padStart(6)}`);
  console.log(`     ${total.toString().padStart(6)} TOTAL across ${Object.values(counts).filter((n) => n > 0).length} tables\n`);

  if (DRY_RUN) {
    console.log("🔍 Dry-run complete. Re-run with --confirm to actually delete.\n");
    return;
  }

  console.log("🔥 Proceeding with hard-delete...\n");

  // Delete in dependency order (children first, parents last). Single
  // transaction so partial failures don't leave the DB half-deleted.
  await prisma.$transaction(async (tx) => {
    const w = { assessmentId: ASSESSMENT_ID };

    await tx.activityFeedEntry.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.editingLock.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.presenceRecord.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.conflict.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.comment.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.statusTransitionLog.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.workshopSession.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.assessmentPhaseProgress.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.ocmImpact.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.dataMigrationObject.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.integrationPoint.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.clientRequirement.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.remainingItem.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.functionalAreaOverview.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.processFlowDiagram.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.assessmentSignOff.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.decisionLogEntry.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.gapResolution.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.stepResponse.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.configSelection.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.scopeSelection.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.assessmentStakeholder.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.reportGeneration.deleteMany({ where: w }).catch(noopOnMissingTable);
    // SignOffProcess.snapshotId → AssessmentSnapshot, so process before snapshot
    await tx.signOffProcess.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.assessmentSnapshot.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.handoffPackage.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.almExportRecord.deleteMany({ where: w }).catch(noopOnMissingTable);
    await tx.offlineSyncQueue.deleteMany({ where: w }).catch(noopOnMissingTable);

    // Finally the Assessment itself
    await tx.assessment.delete({ where: { id: ASSESSMENT_ID } });
  });

  console.log("✓ Delete transaction committed.\n");

  // Re-count to confirm
  const afterCounts = await countDependents(ASSESSMENT_ID!);
  const afterTotal = Object.values(afterCounts).reduce((s, n) => s + n, 0);
  const stillExists = await prisma.assessment.findUnique({ where: { id: ASSESSMENT_ID } });

  console.log(`Verification:`);
  console.log(`     Assessment row:           ${stillExists ? "❌ STILL EXISTS" : "✓ deleted"}`);
  console.log(`     Dependent rows remaining: ${afterTotal === 0 ? "✓ 0" : `❌ ${afterTotal} still present`}`);
  console.log("");
}

async function countDependents(id: string): Promise<Record<string, number>> {
  const w = { assessmentId: id };
  const safe = async <T>(p: Promise<T>): Promise<T | 0> => p.catch(() => 0 as unknown as T);

  return {
    activityFeedEntry:        await safe(prisma.activityFeedEntry.count({ where: w })),
    editingLock:              await safe(prisma.editingLock.count({ where: w })),
    presenceRecord:           await safe(prisma.presenceRecord.count({ where: w })),
    conflict:                 await safe(prisma.conflict.count({ where: w })),
    comment:                  await safe(prisma.comment.count({ where: w })),
    statusTransitionLog:      await safe(prisma.statusTransitionLog.count({ where: w })),
    workshopSession:          await safe(prisma.workshopSession.count({ where: w })),
    assessmentPhaseProgress:  await safe(prisma.assessmentPhaseProgress.count({ where: w })),
    ocmImpact:                await safe(prisma.ocmImpact.count({ where: w })),
    dataMigrationObject:      await safe(prisma.dataMigrationObject.count({ where: w })),
    integrationPoint:         await safe(prisma.integrationPoint.count({ where: w })),
    clientRequirement:        await safe(prisma.clientRequirement.count({ where: w })),
    remainingItem:            await safe(prisma.remainingItem.count({ where: w })),
    functionalAreaOverview:   await safe(prisma.functionalAreaOverview.count({ where: w })),
    processFlowDiagram:       await safe(prisma.processFlowDiagram.count({ where: w })),
    assessmentSignOff:        await safe(prisma.assessmentSignOff.count({ where: w })),
    decisionLogEntry:         await safe(prisma.decisionLogEntry.count({ where: w })),
    gapResolution:            await safe(prisma.gapResolution.count({ where: w })),
    stepResponse:             await safe(prisma.stepResponse.count({ where: w })),
    configSelection:          await safe(prisma.configSelection.count({ where: w })),
    scopeSelection:           await safe(prisma.scopeSelection.count({ where: w })),
    assessmentStakeholder:    await safe(prisma.assessmentStakeholder.count({ where: w })),
    reportGeneration:         await safe(prisma.reportGeneration.count({ where: w })),
    assessmentSnapshot:       await safe(prisma.assessmentSnapshot.count({ where: w })),
    signOffProcess:           await safe(prisma.signOffProcess.count({ where: w })),
    handoffPackage:           await safe(prisma.handoffPackage.count({ where: w })),
    almExportRecord:          await safe(prisma.almExportRecord.count({ where: w })),
    offlineSyncQueue:         await safe(prisma.offlineSyncQueue.count({ where: w })),
  } as Record<string, number>;
}

function noopOnMissingTable(err: unknown): void {
  // Some tables may not exist in older DBs (e.g., pre-migration environments).
  // Swallow only the "table does not exist" error; re-throw anything else.
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("does not exist")) return;
  throw err;
}

main()
  .catch((err) => {
    console.error("\n❌ FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
