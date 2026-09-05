/**
 * Seed the SapContentRelease row for a landed drop (2608 WS0).
 *
 * Reads sap-references/<release>/MANIFEST.json, runs the same integrity check
 * as recon-2608 (every file present, sha256 + bytes match, no zips) and only
 * then upserts one SapContentRelease row keyed on (release, localisation) with
 * the manifest's sha256 as manifestHash. Links it to the ScopeCatalogVersion
 * for the same release/edition PUBLIC when that row already exists; never
 * creates one (that is the catalogue loader's job, WS1).
 *
 * Never writes to prod data without a green RECON — this script IS the gate:
 * a failed integrity check exits 1 before any Prisma call.
 *
 * Usage:
 *   pnpm sap:2608:seed-release            # release from SAP_CONTENT_RELEASE or --release
 *   pnpm sap:2608:seed-release --dry-run
 */

import { PrismaClient } from "@prisma/client";

import { verifyManifest, manifestSha256, loadManifest } from "./lib/manifest-2608";
import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { isSapContentReleaseCode, resolveSapContentRelease } from "../src/lib/sap-content/release";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const flagIdx = args.indexOf("--release");
  const requested = flagIdx >= 0 ? args[flagIdx + 1] : resolveSapContentRelease().release;
  if (!isSapContentReleaseCode(requested)) {
    console.error(`unknown release "${String(requested)}"`);
    return 2;
  }
  const sources = sapContentSourcesFor(requested);
  if (!sources.manifest || !sources.dropDir) {
    console.error(`release ${requested} has no landed drop / MANIFEST.json — nothing to seed`);
    return 2;
  }

  const manifest = loadManifest(sources.manifest);
  const integrity = verifyManifest(manifest, sources.dropDir);
  if (!integrity.ok) {
    console.error(`RECON integrity FAILED for ${sources.manifest}:`);
    for (const f of integrity.findings) console.error(`  ! ${f}`);
    return 1;
  }
  const hash = manifestSha256(sources.manifest);
  console.log(`manifest ${sources.manifest}: ${integrity.verified} file(s) verified, sha256 ${hash}`);

  if (dryRun) {
    console.log("dry-run: no database write");
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    const catalogVersion = await prisma.scopeCatalogVersion.findUnique({
      where: { version_edition: { version: requested, edition: "PUBLIC" } },
      select: { id: true },
    });
    const row = await prisma.sapContentRelease.upsert({
      where: { release_localisation: { release: requested, localisation: sources.localisation } },
      create: {
        release: requested,
        localisation: sources.localisation,
        manifestHash: hash,
        manifestPath: sources.manifest,
        fileCount: manifest.files.length,
        catalogVersionId: catalogVersion?.id ?? null,
        notes: `Seeded by scripts/seed-sap-content-release.ts from ${sources.manifest} (generated ${manifest.generated}).`,
      },
      update: {
        manifestHash: hash,
        manifestPath: sources.manifest,
        fileCount: manifest.files.length,
        loadedAt: new Date(),
        ...(catalogVersion ? { catalogVersionId: catalogVersion.id } : {}),
      },
    });
    console.log(
      `SapContentRelease ${row.release} · ${row.localisation} → id ${row.id}` +
        (catalogVersion
          ? ` (linked to ScopeCatalogVersion ${catalogVersion.id})`
          : " (no ScopeCatalogVersion for this release yet)"),
    );
    return 0;
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
