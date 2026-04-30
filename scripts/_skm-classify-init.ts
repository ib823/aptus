/**
 * SKM classification — one-time setup: create the ClassificationPass row
 * that all subsequent SKM verdicts will be pinned to.
 *
 * Idempotent — re-runs return the existing pass.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ASSESSMENT_COMPANY = "Suruhanjaya Koperasi Malaysia";
const ACTOR = "claude-code-cli";
const ACTOR_ROLE = "ai";

async function main(): Promise<void> {
  const skm = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, catalogVersionId: true },
  });
  if (!skm || !skm.catalogVersionId) {
    throw new Error("SKM assessment not found or not catalog-pinned");
  }

  const protocol = await prisma.classificationProtocol.findFirst({
    where: { isActive: true, catalogVersionId: skm.catalogVersionId },
    select: { id: true, name: true, version: true },
  });
  if (!protocol) {
    throw new Error("No active protocol for SKM catalog");
  }

  // Resume an existing in-flight pass if one exists, else create
  const existing = await prisma.classificationPass.findFirst({
    where: { assessmentId: skm.id, completedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, _count: { select: { verdicts: true } } },
  });
  if (existing) {
    console.log(`Resuming SKM pass ${existing.id} (started ${existing.startedAt.toISOString()}, ${existing._count.verdicts} verdicts so far)`);
    console.log(`SKM_PASS_ID=${existing.id}`);
    await prisma.$disconnect();
    return;
  }

  const pass = await prisma.classificationPass.create({
    data: {
      assessmentId: skm.id,
      protocolVersionId: protocol.id,
      catalogVersionId: skm.catalogVersionId,
      actor: ACTOR,
      actorRole: ACTOR_ROLE,
    },
    select: { id: true, startedAt: true },
  });
  console.log(`Created SKM pass ${pass.id} at ${pass.startedAt.toISOString()}`);
  console.log(`Protocol: ${protocol.name} v${protocol.version}`);
  console.log(`SKM_PASS_ID=${pass.id}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
