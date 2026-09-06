/**
 * WS1 — load the 2608 SSCUI list (sheet "2608", 4,328 configuration activity
 * IDs) into ConfigActivity, stamped with the 2608 SapContentRelease.
 *
 * The 2602 rows (releaseId null, 4,703 from the SAP ZIP's config workbook) are
 * never touched: the app's reads are release-scoped (lib/db/content-release-scope),
 * so 2602 users keep seeing exactly what they saw. Idempotent: the release's
 * rows are deleted and re-created in one transaction. Columns are resolved by
 * header name (the 2602 loader was positional; the sheet was re-cut).
 *
 * ImgActivity (sheet "IMG Activity TRAN in BC") is NOT loaded: it has no
 * releaseId column and nothing in src/ reads it. Recorded in the build log.
 *
 * Usage:  pnpm sap:2608:load-sscui [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { ensureContentRelease, integrityGate } from "./lib/sap-2608/db";
import { parseSscuiList } from "./lib/sap-2608/parse";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const gate = integrityGate(SOURCES);
  if (!gate.ok) {
    console.error("load-2608-sscui: refused — manifest integrity findings:");
    for (const f of gate.findings) console.error(`  ! ${f}`);
    return 1;
  }
  const rows = await parseSscuiList(SOURCES);
  const ids = new Set(rows.map((r) => r.activityId));
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category || "(blank)", (byCategory.get(r.category || "(blank)") ?? 0) + 1);
  const selfService = rows.filter((r) => r.selfService).length;
  console.log(
    `load-2608-sscui — ${rows.length} rows · ${ids.size} distinct activity IDs · self-service ${selfService} · categories ${[...byCategory].map(([k, v]) => `${k} ${v}`).join(", ")}`,
  );
  const dupes = rows.length - ids.size;
  if (dupes) console.log(`  ! ${dupes} duplicate activity ID row(s) — kept as separate rows, like the 2602 load`);
  if (dryRun) {
    console.log("  dry-run: no database write");
    return 0;
  }
  const prisma = new PrismaClient();
  try {
    const release = await ensureContentRelease(prisma, SOURCES, gate);
    const before2602 = await prisma.configActivity.count({ where: { releaseId: null } });
    /*
     * The timeout is not optional here. Prisma's interactive transactions
     * default to 5 seconds, which is ample against a local Postgres and far
     * too little against a managed one: 4,328 rows in batches of 500 is nine
     * round trips, and over a network to Neon that ran 5.2s and the
     * transaction expired mid-load. It rolled back cleanly, but the loader is
     * meant to be run against production — the environment where it is
     * slowest is the one that matters. `load-2608-process-steps.ts` already
     * carries the same allowance for the same reason.
     */
    await prisma.$transaction(async (tx) => {
      const del = await tx.configActivity.deleteMany({ where: { releaseId: release.id } });
      if (del.count) console.log(`  replaced ${del.count} existing 2608 row(s)`);
      for (let i = 0; i < rows.length; i += 500) {
        await tx.configActivity.createMany({
          data: rows.slice(i, i + 500).map((r) => ({
            scopeItemId: r.scopeItemId,
            scopeItemDescription: r.scopeItemDescription || null,
            applicationArea: r.applicationArea,
            applicationSubarea: r.applicationSubarea,
            configItemName: r.configItemName,
            configItemId: r.configItemId,
            activityDescription: r.activityDescription,
            selfService: r.selfService,
            configApproach: r.configApproach || null,
            category: r.category,
            activityId: r.activityId,
            localizationScope: r.localizationScope || null,
            countrySpecific: r.countrySpecific || null,
            alternateActivityId: r.alternateActivityId || null,
            componentId: r.componentId || null,
            redoInProduction: r.redoInProduction || null,
            deleteCustomerRecords: r.deleteCustomerRecords || null,
            additionalInfo: r.additionalInfo || null,
            fileUploadEnabled: r.fileUploadEnabled || null,
            rawScopeItemIds: r.mainScopeItemIds !== r.scopeItemId ? r.mainScopeItemIds : null,
            releaseId: release.id,
          })),
        });
      }
    }, { maxWait: 30_000, timeout: 120_000 });
    const after = await prisma.configActivity.count({ where: { releaseId: release.id } });
    const after2602 = await prisma.configActivity.count({ where: { releaseId: null } });
    console.log(`  db 2608 ConfigActivity: ${after} · 2602-era rows untouched: ${before2602} → ${after2602}`);
    return after === rows.length && after2602 === before2602 ? 0 : 1;
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
