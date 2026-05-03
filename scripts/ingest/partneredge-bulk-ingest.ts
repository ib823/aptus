/**
 * Bulk ingest of PartnerEdge S/4HANA Customer Evolution Program assets.
 *
 * Reads `<conversionDir>/partneredge_index.json` and ingests each PDF
 * as a `BrownfieldGuide` row via the same TOC-extraction logic the
 * generic PDF guide adapter uses. Adds `assetType`, `sourceProgram`,
 * `sapPublishedDate` metadata captured by chrome-claude during the
 * PartnerEdge fetch.
 *
 * Source provenance: chrome-claude with the user's PartnerEdge session
 * (Ikmal Baharudin / S-User S0025693350 / ABeam Consulting Malaysia).
 *
 * Idempotent — re-runs are sha256-keyed via the existing PDF guide adapter.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/partneredge-bulk-ingest.ts \
 *       /workspaces/aptus/Conversion/partneredge_index.json
 */

import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { runPdfGuideIngest } from "./brownfield-pdf-guide-adapter";
import { prisma } from "../../src/lib/db/prisma";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Generic binary ingest for non-PDF assets (PPTX, XLSX, etc.).
 * Stores the raw bytes + metadata; no TOC parsing.
 */
async function ingestBinaryAsset(
  filePath: string,
  mimeType: string,
  opts: { title: string; sourceUrl?: string; catalogId: string; notes?: string },
): Promise<{ guideId: string; reused: boolean }> {
  const buf = await readFile(filePath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const existing = await prisma.brownfieldGuide.findUnique({ where: { sha256 } });
  if (existing) {
    return { guideId: existing.id, reused: true };
  }
  const created = await prisma.brownfieldGuide.create({
    data: {
      catalogVersionId: opts.catalogId,
      title: opts.title,
      sourceDocument: filePath.split(/[/\\]/).pop() ?? filePath,
      sourceUrl: opts.sourceUrl ?? null,
      mimeType,
      fileSizeBytes: buf.byteLength,
      sha256,
      content: buf,
      notes: opts.notes ?? null,
    },
  });
  return { guideId: created.id, reused: false };
}

interface IndexAsset {
  filename: string;
  title: string;
  sourceUrl: string;
  fileSizeBytes: number;
  assetType: string;
  sapPublishedDate: string | null;
  description: string;
}

interface IndexFile {
  source: string;
  fetchedAt: string;
  fetchedBy: string;
  filesLocation?: string;
  assets: IndexAsset[];
}

interface IngestResult {
  filename: string;
  title: string;
  status: "ingested" | "reused" | "error";
  guideId?: string;
  sectionCount?: number;
  error?: string;
}

const SOURCE_PROGRAM = "SAP Customer Evolution Program (S/4HANA Movement)";

async function main(): Promise<void> {
  const indexPath = process.argv[2] ?? "/workspaces/aptus/Conversion/partneredge_index.json";
  console.log(`[partneredge-bulk] Reading ${indexPath}`);
  const raw = await readFile(indexPath, "utf8");
  const idx = JSON.parse(raw) as IndexFile;
  console.log(`[partneredge-bulk] Source: ${idx.source}`);
  console.log(`[partneredge-bulk] Fetched: ${idx.fetchedAt} by ${idx.fetchedBy}`);
  console.log(`[partneredge-bulk] Assets to ingest: ${idx.assets.length}`);

  const filesDir = idx.filesLocation ?? dirname(indexPath);
  const results: IngestResult[] = [];

  // Resolve catalog (latest active)
  const catalog = await prisma.brownfieldCatalogVersion.findFirst({
    where: { isActive: true },
    orderBy: { ingestedAt: "desc" },
    select: { id: true },
  });
  if (!catalog) throw new Error("No active BrownfieldCatalogVersion. Ingest a SIC archive first.");

  for (const asset of idx.assets) {
    const pdfPath = join(filesDir, asset.filename);
    console.log(``);
    console.log(`[partneredge-bulk] [${results.length + 1}/${idx.assets.length}] ${asset.filename}`);
    try {
      const isPdf = asset.filename.toLowerCase().endsWith(".pdf");
      const isPptx = asset.filename.toLowerCase().endsWith(".pptx");
      const isXlsx = asset.filename.toLowerCase().endsWith(".xlsx");

      const notes =
        `Source: ${idx.source}\n` +
        `Fetched: ${idx.fetchedAt} by ${idx.fetchedBy}\n` +
        `Asset type: ${asset.assetType}\n` +
        `SAP-published date: ${asset.sapPublishedDate ?? "(not stated)"}\n` +
        `\nDescription: ${asset.description}`;

      let result: { guideId: string; reused: boolean; sectionCount?: number };
      if (isPdf) {
        const opts: Parameters<typeof runPdfGuideIngest>[1] = {
          title: asset.title,
          sourceUrl: asset.sourceUrl,
          catalogId: catalog.id,
          notes,
        };
        result = await runPdfGuideIngest(pdfPath, opts);
      } else if (isPptx) {
        result = await ingestBinaryAsset(pdfPath, PPTX_MIME, {
          title: asset.title,
          sourceUrl: asset.sourceUrl,
          catalogId: catalog.id,
          notes,
        });
      } else if (isXlsx) {
        result = await ingestBinaryAsset(pdfPath, XLSX_MIME, {
          title: asset.title,
          sourceUrl: asset.sourceUrl,
          catalogId: catalog.id,
          notes,
        });
      } else {
        throw new Error(
          `Unsupported file extension for ${asset.filename}. Expected .pdf, .pptx, or .xlsx.`,
        );
      }

      // Patch the row with the PartnerEdge-specific metadata fields the
      // generic adapters don't know about
      await prisma.brownfieldGuide.update({
        where: { id: result.guideId },
        data: {
          assetType: asset.assetType,
          sourceProgram: SOURCE_PROGRAM,
          sapPublishedDate: asset.sapPublishedDate ? new Date(asset.sapPublishedDate) : null,
        },
      });

      results.push({
        filename: asset.filename,
        title: asset.title,
        status: result.reused ? "reused" : "ingested",
        guideId: result.guideId,
        sectionCount: result.sectionCount ?? 0,
      });
    } catch (err) {
      results.push({
        filename: asset.filename,
        title: asset.title,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Summary
  const ingested = results.filter((r) => r.status === "ingested").length;
  const reused = results.filter((r) => r.status === "reused").length;
  const errored = results.filter((r) => r.status === "error").length;
  const totalSections = results.reduce((s, r) => s + (r.sectionCount ?? 0), 0);

  console.log(``);
  console.log(`[partneredge-bulk] Done.`);
  console.log(`  Ingested      : ${ingested}`);
  console.log(`  Reused (sha)  : ${reused}`);
  console.log(`  Errors        : ${errored}`);
  console.log(`  TOC sections  : ${totalSections} total across all guides`);
  if (errored > 0) {
    console.log(`  Error details:`);
    for (const r of results.filter((r) => r.error)) {
      console.log(`    - ${r.filename}: ${r.error}`);
    }
  }

  // Write a per-run summary log
  const logPath = "/workspaces/aptus/logs/partneredge-ingest-summary.json";
  await writeFile(
    logPath,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        source: idx.source,
        fetchedAt: idx.fetchedAt,
        fetchedBy: idx.fetchedBy,
        sourceProgram: SOURCE_PROGRAM,
        assetCount: idx.assets.length,
        ingested,
        reused,
        errored,
        totalSections,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`[partneredge-bulk] Summary log: ${logPath}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[partneredge-bulk] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
