/**
 * Phase 4 — AD-2 backfill: extract vendor-supplied verdicts that were
 * imported into ClientRequirement.solutionProviderResponse (the legacy
 * shape) and reify them as proper VendorResponse rows.
 *
 * Heuristic for distinguishing vendor-supplied vs Aptus-classified rows:
 *   - The Bursa importer wrote vendor classifications with prefixes "NM - "
 *     (Not Met) and "UD - " (Under Development), plus original "FM - " /
 *     "PM - " from A5/A6 source files.
 *   - The Aptus orchestrator (classify-batch.ts) writes the canonical
 *     "O - Out Of The Box", "C - Configuration", "G - Gap",
 *     "N/A - Out of Scope".
 * Anything matching the legacy NM/UD/FM/PM prefix is treated as
 * vendor-supplied. Everything else stays untouched.
 *
 * Idempotent — checks for existing VendorResponse rows before creating.
 *
 * Usage:
 *   $ pnpm tsx scripts/backfill-vendor-responses.ts
 */

import { PrismaClient } from "@prisma/client";

const VENDOR_PREFIX = /^(NM|UD|FM|PM)\b/;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const assessmentsWithLegacyVendorRows = await prisma.assessment.findMany({
    where: {
      clientRequirements: {
        some: {
          solutionProviderResponse: { not: null },
        },
      },
    },
    select: { id: true, companyName: true },
  });

  let totalVendorRows = 0;
  let totalSubmissionsCreated = 0;

  for (const assessment of assessmentsWithLegacyVendorRows) {
    // Find requirements with legacy vendor-prefix verdicts (NM/UD/FM/PM)
    const candidateReqs = await prisma.clientRequirement.findMany({
      where: { assessmentId: assessment.id, solutionProviderResponse: { not: null } },
      select: {
        id: true, solutionProviderResponse: true, solutionProviderRemarks: true,
        complianceStatus: true,
      },
    });

    const vendorReqs = candidateReqs.filter((r) =>
      VENDOR_PREFIX.test((r.solutionProviderResponse ?? "").trim()),
    );

    if (vendorReqs.length === 0) {
      console.log(`SKIP ${assessment.id} (${assessment.companyName}) — no legacy vendor-prefix rows`);
      continue;
    }

    // Idempotency — has a vendor submission already been backfilled for this assessment?
    const existing = await prisma.vendorSubmission.findFirst({
      where: { assessmentId: assessment.id, vendorName: "Pre-rebuild backfill" },
    });
    if (existing) {
      console.log(`SKIP ${assessment.id} — vendor submission already backfilled (id=${existing.id})`);
      continue;
    }

    // Create one synthetic VendorSubmission per assessment
    const submission = await prisma.vendorSubmission.create({
      data: {
        assessmentId: assessment.id,
        vendorName: "Pre-rebuild backfill",
        submittedAt: new Date(),
        notes: "Backfilled by scripts/backfill-vendor-responses.ts. Original vendor name unknown; legacy NM/UD/FM/PM prefix indicated vendor-supplied verdict before Phase 4 separation.",
        importedBy: "backfill-vendor-responses.ts",
      },
    });
    totalSubmissionsCreated++;

    let count = 0;
    for (const r of vendorReqs) {
      await prisma.vendorResponse.create({
        data: {
          requirementId: r.id,
          submissionId: submission.id,
          verdict: r.solutionProviderResponse!,
          remarksMd: r.solutionProviderRemarks ?? null,
          vendorMetaJson: r.complianceStatus ? { complianceStatus: r.complianceStatus } : Prisma.JsonNull,
          importedAt: new Date(),
        },
      });
      count++;
    }
    totalVendorRows += count;
    console.log(`Backfilled ${count} VendorResponse rows for assessment ${assessment.id} (${assessment.companyName})`);
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`VendorSubmissions created: ${totalSubmissionsCreated}`);
  console.log(`VendorResponse rows created: ${totalVendorRows}`);

  await prisma.$disconnect();
}

import { Prisma } from "@prisma/client";

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
