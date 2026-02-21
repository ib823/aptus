/**
 * One-time migration: Move binary files from PostgreSQL BYTEA to Vercel Blob.
 *
 * Idempotent — only processes rows where blobUrl IS NULL.
 * Safe to re-run if interrupted.
 *
 * Requires:
 *   BLOB_READ_WRITE_TOKEN — Vercel Blob store token
 *   DATABASE_URL          — PostgreSQL connection string
 *
 * Usage:
 *   tsx scripts/migrate-blobs-to-vercel.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";

const prisma = new PrismaClient();

const BATCH_SIZE = 10;

function contentTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsm")) return "application/vnd.ms-excel.sheet.macroEnabled.12";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".rtf")) return "application/rtf";
  return "application/octet-stream";
}

async function migrateSetupGuides(): Promise<number> {
  console.log("\n--- Migrating SetupGuide PDFs ---");
  let migrated = 0;

  // Process in batches to control memory
  while (true) {
    const guides = await prisma.setupGuide.findMany({
      where: { blobUrl: null, pdfBlob: { not: null } },
      select: { id: true, scopeItemId: true, filename: true, pdfBlob: true },
      take: BATCH_SIZE,
    });

    if (guides.length === 0) break;

    for (const guide of guides) {
      if (!guide.pdfBlob) continue;
      const blobPath = `sap-catalog/setup-guide/${guide.scopeItemId}/${guide.filename}`;
      const { url } = await put(blobPath, Buffer.from(guide.pdfBlob), {
        access: "private",
        contentType: contentTypeForFilename(guide.filename),
      });
      await prisma.setupGuide.update({
        where: { id: guide.id },
        data: { blobUrl: url },
      });
      migrated++;
      if (migrated % 25 === 0) console.log(`  Setup guides: ${migrated} migrated`);
    }
  }

  console.log(`  Setup guides total: ${migrated}`);
  return migrated;
}

async function migrateGeneralFiles(): Promise<number> {
  console.log("\n--- Migrating GeneralFile blobs ---");
  let migrated = 0;

  while (true) {
    const files = await prisma.generalFile.findMany({
      where: { blobUrl: null, blob: { not: null } },
      select: { id: true, filename: true, fileType: true, blob: true },
      take: BATCH_SIZE,
    });

    if (files.length === 0) break;

    for (const file of files) {
      if (!file.blob) continue;
      const blobPath = `sap-catalog/general/${file.id}/${file.filename}`;
      const { url } = await put(blobPath, Buffer.from(file.blob), {
        access: "private",
        contentType: contentTypeForFilename(file.filename),
      });
      await prisma.generalFile.update({
        where: { id: file.id },
        data: { blobUrl: url },
      });
      migrated++;
      if (migrated % 25 === 0) console.log(`  General files: ${migrated} migrated`);
    }
  }

  console.log(`  General files total: ${migrated}`);
  return migrated;
}

async function migrateOtherFiles(): Promise<number> {
  console.log("\n--- Migrating OtherFile blobs ---");
  let migrated = 0;

  while (true) {
    const files = await prisma.otherFile.findMany({
      where: { blobUrl: null, blob: { not: null } },
      select: { id: true, filename: true, blob: true },
      take: BATCH_SIZE,
    });

    if (files.length === 0) break;

    for (const file of files) {
      if (!file.blob) continue;
      const blobPath = `sap-catalog/other/${file.id}/${file.filename}`;
      const { url } = await put(blobPath, Buffer.from(file.blob), {
        access: "private",
        contentType: contentTypeForFilename(file.filename),
      });
      await prisma.otherFile.update({
        where: { id: file.id },
        data: { blobUrl: url },
      });
      migrated++;
    }
  }

  console.log(`  Other files total: ${migrated}`);
  return migrated;
}

async function migrateReadmeFiles(): Promise<number> {
  console.log("\n--- Migrating ReadmeFile blobs ---");
  let migrated = 0;

  while (true) {
    const files = await prisma.readmeFile.findMany({
      where: { blobUrl: null, blob: { not: null } },
      select: { id: true, filename: true, blob: true },
      take: BATCH_SIZE,
    });

    if (files.length === 0) break;

    for (const file of files) {
      if (!file.blob) continue;
      const blobPath = `sap-catalog/readme/${file.id}/${file.filename}`;
      const { url } = await put(blobPath, Buffer.from(file.blob), {
        access: "private",
        contentType: contentTypeForFilename(file.filename),
      });
      await prisma.readmeFile.update({
        where: { id: file.id },
        data: { blobUrl: url },
      });
      migrated++;
    }
  }

  console.log(`  Readme files total: ${migrated}`);
  return migrated;
}

async function main(): Promise<void> {
  console.log("=== Migrating binary files from PostgreSQL to Vercel Blob ===\n");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN environment variable is required");
    process.exit(1);
  }

  // Pre-flight counts
  const setupNull = await prisma.setupGuide.count({ where: { blobUrl: null, pdfBlob: { not: null } } });
  const generalNull = await prisma.generalFile.count({ where: { blobUrl: null, blob: { not: null } } });
  const otherNull = await prisma.otherFile.count({ where: { blobUrl: null, blob: { not: null } } });
  const readmeNull = await prisma.readmeFile.count({ where: { blobUrl: null, blob: { not: null } } });

  console.log("Pending migration:");
  console.log(`  SetupGuide:  ${setupNull}`);
  console.log(`  GeneralFile: ${generalNull}`);
  console.log(`  OtherFile:   ${otherNull}`);
  console.log(`  ReadmeFile:  ${readmeNull}`);
  console.log(`  Total:       ${setupNull + generalNull + otherNull + readmeNull}`);

  const s = await migrateSetupGuides();
  const g = await migrateGeneralFiles();
  const o = await migrateOtherFiles();
  const r = await migrateReadmeFiles();

  console.log("\n=== Migration complete ===");
  console.log(`Total migrated: ${s + g + o + r}`);

  // Verification
  const remainSetup = await prisma.setupGuide.count({ where: { blobUrl: null } });
  const remainGeneral = await prisma.generalFile.count({ where: { blobUrl: null } });
  const remainOther = await prisma.otherFile.count({ where: { blobUrl: null } });
  const remainReadme = await prisma.readmeFile.count({ where: { blobUrl: null } });

  console.log("\nRemaining without blobUrl:");
  console.log(`  SetupGuide:  ${remainSetup}`);
  console.log(`  GeneralFile: ${remainGeneral}`);
  console.log(`  OtherFile:   ${remainOther}`);
  console.log(`  ReadmeFile:  ${remainReadme}`);

  if (remainSetup + remainGeneral + remainOther + remainReadme === 0) {
    console.log("\nAll rows migrated successfully!");
    console.log("\nNext steps:");
    console.log("  1. Verify downloads: curl -I https://aptus-sandy.vercel.app/api/catalog/setup-guide/J60");
    console.log("  2. NULL out old binary columns to reclaim space:");
    console.log("     UPDATE \"SetupGuide\" SET \"pdfBlob\" = NULL;");
    console.log("     UPDATE \"GeneralFile\" SET blob = NULL;");
    console.log("     UPDATE \"OtherFile\" SET blob = NULL;");
    console.log("     UPDATE \"ReadmeFile\" SET blob = NULL;");
    console.log("     VACUUM FULL;");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
