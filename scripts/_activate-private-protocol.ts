/**
 * Gap 1 — activate the AI-drafted Private 2025-FPS1 protocol.
 *
 * Flips isActive=true on the AI-drafted protocol, sets the placeholder to
 * deprecated. Run only AFTER the validation gauntlet output is acceptable.
 *
 * Idempotent — re-runs are no-ops.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REAL = { name: "SAP 2025-FPS1 Private — AI-drafted v1", version: "1.0.0-rc1" };
const PLACEHOLDER = { name: "SAP 2025-FPS1 Private placeholder", version: "0.1.0-placeholder" };

async function main(): Promise<void> {
  // Activate real
  const real = await prisma.classificationProtocol.update({
    where: { name_version: REAL },
    data: { isActive: true, deprecatedAt: null },
    select: { id: true, name: true, version: true, isActive: true },
  });
  console.log(`✓ Activated: ${real.name} v${real.version}  isActive=${real.isActive}`);

  // Deprecate placeholder
  const placeholder = await prisma.classificationProtocol.update({
    where: { name_version: PLACEHOLDER },
    data: { isActive: false, deprecatedAt: new Date() },
    select: { id: true, name: true, version: true, isActive: true, deprecatedAt: true },
  });
  console.log(`✓ Deprecated: ${placeholder.name} v${placeholder.version}  isActive=${placeholder.isActive}  deprecatedAt=${placeholder.deprecatedAt?.toISOString()}`);

  // Confirm only one active for this catalog
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
  });
  if (priv) {
    const activeCount = await prisma.classificationProtocol.count({
      where: { catalogVersionId: priv.id, isActive: true },
    });
    console.log(`\nActive protocols for PRIVATE/2025-FPS1: ${activeCount} (expect 1)`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
