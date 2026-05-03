/**
 * Always-On Business Function Disposition ingest — parses the SAP Note 2240360
 * attachment `ALWAYS_ON_BFS_S4H_<release>.txt` (one BF technical name per line)
 * into BusinessFunctionDisposition rows with disposition="ALWAYS_ON".
 *
 * The release tag is parsed from the filename: ALWAYS_ON_BFS_S4H_2025.txt → "S4H_2025".
 * If the filename doesn't match, pass --release-tag explicitly.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-bfr-adapter.ts \
 *       "/workspaces/aptus/Conversion/ALWAYS_ON_BFS_S4H_2025 (1).txt"
 *   $ pnpm tsx scripts/ingest/brownfield-bfr-adapter.ts <txt-path> --release-tag S4H_2025 --catalog-id <id>
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import { prisma } from "../../src/lib/db/prisma";

function parseReleaseTagFromFilename(path: string): string | null {
  const base = basename(path);
  const m = /ALWAYS_ON_BFS_(S4H_\d+(?:_FPS\d+)?)/i.exec(base);
  return m ? m[1]!.toUpperCase() : null;
}

export async function runBfrIngest(
  txtPath: string,
  options: { releaseTag?: string; catalogId?: string } = {},
): Promise<void> {
  console.log(`[brownfield-bfr] Reading ${txtPath}`);
  const text = await readFile(txtPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  console.log(`[brownfield-bfr] Parsed ${lines.length} business function names`);

  const releaseTag =
    options.releaseTag ?? parseReleaseTagFromFilename(txtPath);
  if (!releaseTag) {
    throw new Error(
      "Could not derive release tag from filename. Pass --release-tag explicitly.",
    );
  }
  console.log(`[brownfield-bfr] Release tag: ${releaseTag}`);

  let resolvedCatalogId = options.catalogId ?? null;
  if (!resolvedCatalogId) {
    const latest = await prisma.brownfieldCatalogVersion.findFirst({
      where: { isActive: true },
      orderBy: { ingestedAt: "desc" },
    });
    if (!latest) {
      throw new Error(
        "No active BrownfieldCatalogVersion exists. Run brownfield-sic-adapter.ts first or pass --catalog-id.",
      );
    }
    resolvedCatalogId = latest.id;
    console.log(`[brownfield-bfr] Pinning to catalog ${latest.id} (${latest.label ?? "no label"})`);
  }

  // Dedup BF names within the file (defensive — SAP sometimes duplicates).
  const unique = Array.from(new Set(lines));

  const data = unique.map((bfId) => ({
    catalogVersionId: resolvedCatalogId,
    businessFunctionId: bfId,
    disposition: "ALWAYS_ON",
    sourceReleaseTag: releaseTag,
  }));

  const result = await prisma.businessFunctionDisposition.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(
    `[brownfield-bfr] Inserted ${result.count} BusinessFunctionDisposition rows (file unique: ${unique.length})`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-bfr-adapter.ts")) {
  const args = process.argv.slice(2);
  const txtPath = args[0];
  if (!txtPath) {
    console.error(
      "Usage: tsx scripts/ingest/brownfield-bfr-adapter.ts <txt-path> [--release-tag S4H_2025] [--catalog-id <id>]",
    );
    process.exit(1);
  }
  const releaseIdx = args.indexOf("--release-tag");
  const catalogIdx = args.indexOf("--catalog-id");
  const opts: { releaseTag?: string; catalogId?: string } = {};
  const rt = releaseIdx >= 0 ? args[releaseIdx + 1] : undefined;
  const ci = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;
  if (rt) opts.releaseTag = rt;
  if (ci) opts.catalogId = ci;
  runBfrIngest(txtPath, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[brownfield-bfr] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
