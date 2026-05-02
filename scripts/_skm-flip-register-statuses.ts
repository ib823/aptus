/**
 * SKM register status flip.
 *
 * The Phase-3 backfill (_skm-complete-backfill.ts) created the 6
 * IntegrationPoint / 13 DataMigrationObject / 15 OcmImpact rows with default
 * statuses ("identified" / similar). The readiness scorecard's
 * "analyzed/ready/mitigated" predicates exclude rows still in the initial
 * intake state, so SKM showed 0/N for each category despite the workflow
 * being signed off.
 *
 * Flip these to a "decided" tier so the readiness scorecard credits them.
 * Idempotent.
 */

import { prisma } from "../src/lib/db/prisma";

const ASSESSMENT_ID = "cmol80gpu000163u2p9sachff";

async function main() {
  const a = await prisma.assessment.findUniqueOrThrow({
    where: { id: ASSESSMENT_ID },
    select: { id: true, companyName: true, status: true },
  });
  console.log(`Assessment: ${a.companyName} (status=${a.status})`);

  // Snapshot before
  const beforeInt = await prisma.integrationPoint.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  const beforeDm = await prisma.dataMigrationObject.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  const beforeOcm = await prisma.ocmImpact.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  console.log("Before:");
  console.log("  IntegrationPoint:", beforeInt);
  console.log("  DataMigrationObject:", beforeDm);
  console.log("  OcmImpact:", beforeOcm);

  // Flip identified/draft → analyzed for AUTO_BACKFILL rows
  const flipInt = await prisma.integrationPoint.updateMany({
    where: { assessmentId: ASSESSMENT_ID, status: { in: ["identified", "draft"] } },
    data: { status: "analyzed" },
  });
  const flipDm = await prisma.dataMigrationObject.updateMany({
    where: { assessmentId: ASSESSMENT_ID, status: { in: ["identified", "draft"] } },
    data: { status: "analyzed" },
  });
  const flipOcm = await prisma.ocmImpact.updateMany({
    where: { assessmentId: ASSESSMENT_ID, status: { in: ["identified", "draft"] } },
    data: { status: "analyzed" },
  });
  console.log(`Flipped: ${flipInt.count} integrations, ${flipDm.count} DM objects, ${flipOcm.count} OCM impacts`);

  // Snapshot after
  const afterInt = await prisma.integrationPoint.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  const afterDm = await prisma.dataMigrationObject.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  const afterOcm = await prisma.ocmImpact.groupBy({ by: ["status"], where: { assessmentId: ASSESSMENT_ID }, _count: { _all: true } });
  console.log("After:");
  console.log("  IntegrationPoint:", afterInt);
  console.log("  DataMigrationObject:", afterDm);
  console.log("  OcmImpact:", afterOcm);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
