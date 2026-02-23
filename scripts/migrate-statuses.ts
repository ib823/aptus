/**
 * Phase 18: Status migration script
 *
 * Maps V1 assessment statuses to V2:
 *   "draft"       → "draft"
 *   "in_progress"  → "in_progress"
 *   "completed"    → "pending_validation"
 *   "reviewed"     → "validated"
 *   "signed_off"   → "signed_off"
 *
 * Also creates initial AssessmentPhaseProgress records for all 8 phases.
 *
 * Usage: npx tsx scripts/migrate-statuses.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const V1_TO_V2_STATUS_MAP: Record<string, string> = {
  draft: "draft",
  in_progress: "in_progress",
  completed: "pending_validation",
  reviewed: "validated",
  signed_off: "signed_off",
};

const PHASES = [
  "scoping",
  "process_review",
  "gap_resolution",
  "integration",
  "data_migration",
  "ocm",
  "validation",
  "sign_off",
] as const;

async function main() {
  console.log("=== Phase 18: Status Migration ===\n");

  let assessmentsMigrated = 0;
  let phaseRecordsCreated = 0;
  let transitionsLogged = 0;

  // 1. Find assessments with V1-only statuses that need mapping
  const v1OnlyStatuses = ["completed", "reviewed"];
  const assessmentsToMigrate = await prisma.assessment.findMany({
    where: {
      status: { in: v1OnlyStatuses },
      deletedAt: null,
    },
    select: { id: true, status: true, companyName: true },
  });

  console.log(`  Found ${assessmentsToMigrate.length} assessment(s) with V1-only statuses to migrate.`);

  for (const assessment of assessmentsToMigrate) {
    const newStatus = V1_TO_V2_STATUS_MAP[assessment.status];
    if (!newStatus || newStatus === assessment.status) continue;

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: newStatus },
    });

    await prisma.statusTransitionLog.create({
      data: {
        assessmentId: assessment.id,
        fromStatus: assessment.status,
        toStatus: newStatus,
        triggeredBy: "system",
        triggeredByRole: "platform_admin",
        reason: "Phase 18 V1→V2 status migration",
      },
    });

    await prisma.decisionLogEntry.create({
      data: {
        assessmentId: assessment.id,
        entityType: "assessment",
        entityId: assessment.id,
        action: "STATUS_TRANSITIONED",
        oldValue: { status: assessment.status },
        newValue: { status: newStatus, reason: "Phase 18 V1→V2 status migration" },
        actor: "system",
        actorRole: "platform_admin",
      },
    });

    assessmentsMigrated++;
    transitionsLogged++;
    console.log(`    ✓ ${assessment.companyName} (${assessment.id}): ${assessment.status} → ${newStatus}`);
  }

  // 2. Create AssessmentPhaseProgress records for all assessments that don't have them
  const allAssessments = await prisma.assessment.findMany({
    where: { deletedAt: null },
    select: { id: true, status: true },
  });

  console.log(`\n  Checking ${allAssessments.length} assessments for phase progress records...`);

  for (const assessment of allAssessments) {
    const existingPhases = await prisma.assessmentPhaseProgress.findMany({
      where: { assessmentId: assessment.id },
      select: { phase: true },
    });

    const existingPhaseSet = new Set(existingPhases.map((p) => p.phase));
    const missingPhases = PHASES.filter((p) => !existingPhaseSet.has(p));

    if (missingPhases.length === 0) continue;

    for (const phase of missingPhases) {
      await prisma.assessmentPhaseProgress.create({
        data: {
          assessmentId: assessment.id,
          phase,
          status: "not_started",
          completionPct: 0,
        },
      });
      phaseRecordsCreated++;
    }

    console.log(`    ✓ ${assessment.id}: created ${missingPhases.length} phase progress records`);
  }

  console.log("\n=== Migration Complete ===");
  console.log(`  Assessments migrated:    ${assessmentsMigrated}`);
  console.log(`  Transitions logged:      ${transitionsLogged}`);
  console.log(`  Phase records created:   ${phaseRecordsCreated}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
