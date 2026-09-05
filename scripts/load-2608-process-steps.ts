/**
 * WS1 — load the 2608 "Process Steps, Business Roles" master (19,158 rows,
 * 661 scope items) into SapProcessStep, scoped to the 2608 SapContentRelease.
 *
 * This is the versioned SOURCE, not the rendered flow: AffirmProcessFlow /
 * AffirmProcessStep (the MY flows the app shows) stay the 2602 snapshot until
 * WS5 re-derives them from this table. ProcessStep (BPD test-case steps) is
 * a different artefact and is not touched either.
 *
 * Idempotent: the release's rows are deleted and re-created in one transaction.
 *
 * Usage:  pnpm sap:2608:load-process-steps [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { ensureContentRelease, integrityGate } from "./lib/sap-2608/db";
import { parseProcessSteps } from "./lib/sap-2608/parse";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const gate = integrityGate(SOURCES);
  if (!gate.ok) {
    console.error("load-2608-process-steps: refused — manifest integrity findings:");
    for (const f of gate.findings) console.error(`  ! ${f}`);
    return 1;
  }
  const rows = await parseProcessSteps(SOURCES);
  const items = new Set(rows.map((r) => r.scopeItemCode));
  const my = rows.filter((r) => r.availableInMy);
  console.log(
    `load-2608-process-steps — ${rows.length} rows · ${items.size} scope items · MY ${my.length} rows / ${new Set(my.map((r) => r.scopeItemCode)).size} items · Fiori ids ${new Set(rows.map((r) => r.fioriAppId).filter(Boolean)).size} · roles ${new Set(rows.map((r) => r.businessRoleId).filter(Boolean)).size}`,
  );
  if (dryRun) {
    console.log("  dry-run: no database write");
    return 0;
  }
  const prisma = new PrismaClient();
  try {
    const release = await ensureContentRelease(prisma, SOURCES, gate);
    await prisma.$transaction(
      async (tx) => {
        const del = await tx.sapProcessStep.deleteMany({ where: { releaseId: release.id } });
        if (del.count) console.log(`  replaced ${del.count} existing 2608 row(s)`);
        for (let i = 0; i < rows.length; i += 1000) {
          await tx.sapProcessStep.createMany({
            data: rows.slice(i, i + 1000).map((r) => ({
              releaseId: release.id,
              scopeItemCode: r.scopeItemCode,
              scopeItemName: r.scopeItemName,
              lob: r.lob,
              businessArea: r.businessArea,
              sequence: r.sequence,
              activity: r.activity,
              fioriAppTitle: r.fioriAppTitle || null,
              fioriAppId: r.fioriAppId || null,
              fioriSemanticObject: r.fioriSemanticObject || null,
              fioriSemanticAction: r.fioriSemanticAction || null,
              businessRoleDescription: r.businessRoleDescription || null,
              businessRoleId: r.businessRoleId || null,
              countries: r.countries,
              availableInMy: r.availableInMy,
              isGlobal: r.isGlobal,
            })),
          });
        }
      },
      { timeout: 120_000 },
    );
    const after = await prisma.sapProcessStep.count({ where: { releaseId: release.id } });
    const afterItems = await prisma.sapProcessStep.groupBy({ by: ["scopeItemCode"], where: { releaseId: release.id } });
    const affirm2602 = await prisma.affirmProcessStep.count();
    console.log(
      `  db 2608 SapProcessStep: ${after} rows · ${afterItems.length} items · AffirmProcessStep (2602 snapshot) untouched: ${affirm2602}`,
    );
    return after === rows.length ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
