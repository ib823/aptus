/**
 * Shared database steps for the 2608 loaders (WS1).
 *
 * Loaders use a RAW PrismaClient, not the app's extended client: they must see
 * every release (to delete/replace their own rows) and they scope explicitly.
 */

import type { PrismaClient } from "@prisma/client";

import { loadManifest, manifestSha256, verifyManifest } from "../manifest-2608";
import type { SapContentSources } from "../sap-content-sources";

export type Gate = { ok: true; manifestHash: string; fileCount: number } | { ok: false; findings: string[] };

/** The same integrity check recon runs — no loader writes on a red drop. */
export function integrityGate(sources: SapContentSources): Gate {
  if (!sources.manifest || !sources.dropDir)
    return { ok: false, findings: [`release ${sources.release} has no landed drop`] };
  const manifest = loadManifest(sources.manifest);
  const r = verifyManifest(manifest, sources.dropDir);
  if (!r.ok) return { ok: false, findings: r.findings };
  return { ok: true, manifestHash: manifestSha256(sources.manifest), fileCount: manifest.files.length };
}

/** Upsert the SapContentRelease row for a drop (idempotent). */
export async function ensureContentRelease(
  prisma: PrismaClient,
  sources: SapContentSources,
  gate: Extract<Gate, { ok: true }>,
): Promise<{ id: string; release: string; localisation: string; catalogVersionId: string | null }> {
  const row = await prisma.sapContentRelease.upsert({
    where: { release_localisation: { release: sources.release, localisation: sources.localisation } },
    create: {
      release: sources.release,
      localisation: sources.localisation,
      manifestHash: gate.manifestHash,
      manifestPath: sources.manifest,
      fileCount: gate.fileCount,
      notes: `Created by the 2608 loaders from ${sources.manifest}.`,
    },
    update: { manifestHash: gate.manifestHash, manifestPath: sources.manifest, fileCount: gate.fileCount },
    select: { id: true, release: true, localisation: true, catalogVersionId: true },
  });
  return row;
}

/**
 * Upsert the ScopeCatalogVersion for a release (AD-3: parallel rows, never
 * mutate 2602). Created INACTIVE: `isActive` is what makes a version the default
 * for new assessments and lists it in the picker; WS7 flips it. Re-running never
 * changes isActive.
 */
export async function ensureCatalogVersion(
  prisma: PrismaClient,
  release: string,
  manifestHash: string,
  contentReleaseId: string,
): Promise<{ id: string; isActive: boolean }> {
  const row = await prisma.scopeCatalogVersion.upsert({
    where: { version_edition: { version: release, edition: "PUBLIC" } },
    create: {
      version: release,
      edition: "PUBLIC",
      releaseDate: release === "2608" ? new Date("2026-08-01") : null,
      sourceArchiveHash: manifestHash,
      notes: `SAP S/4HANA Cloud Public Edition ${release} (SAP Cloud ERP) · MY — loaded from sap-references/${release}/ (Availability & Dependencies + Process-Steps). Inactive until the release flip (WS7).`,
      isActive: false,
    },
    update: { sourceArchiveHash: manifestHash },
    select: { id: true, isActive: true },
  });
  await prisma.sapContentRelease.update({ where: { id: contentReleaseId }, data: { catalogVersionId: row.id } });
  return row;
}
