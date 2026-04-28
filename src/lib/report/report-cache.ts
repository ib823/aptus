/**
 * Phase 10 — AD-7: report cache for signed-off assessments.
 *
 * Reports for assessments in signed_off status are immutable evidence.
 * Each generated artifact is cached in ReportGeneration keyed by:
 *   (assessmentId, reportType, snapshotId, protocolVersionId, catalogVersionId)
 *
 * On request:
 *   - Live (mutable) assessments → always regenerate. No cache.
 *   - signed_off assessments → look up the cache row; if it exists + the
 *     pinned cache key matches the current snapshot, serve the cached
 *     fileUrl. Otherwise generate + cache.
 *
 * Cache rows are NEVER overwritten — a new pin combination creates a new row.
 * This preserves the full history of every report variant generated.
 */

import { prisma } from "@/lib/db/prisma";
import { createHash } from "crypto";
import type { ReportContext } from "./report-context";

export interface CachedReport {
  fileUrl: string | null;
  fileSize: number | null;
  fileName: string | null;
  generatedAt: Date;
  contentHash: string | null;
  fromCache: boolean;
}

/**
 * Look up an existing cache row matching the current pin combination.
 * Returns null if no cache hit.
 */
export async function lookupCachedReport(
  ctx: ReportContext,
  reportType: string,
): Promise<CachedReport | null> {
  if (!ctx.isFrozen) return null;

  const row = await prisma.reportGeneration.findFirst({
    where: {
      assessmentId: ctx.assessmentId,
      reportType,
      snapshotId: ctx.snapshotId,
      protocolVersionId: ctx.protocolVersionId,
      catalogVersionId: ctx.catalogVersionId,
      status: "completed",
      fileUrl: { not: null },
    },
    orderBy: { generatedAt: "desc" },
  });

  if (!row?.fileUrl) return null;

  return {
    fileUrl: row.fileUrl,
    fileSize: row.fileSize,
    fileName: row.fileName,
    generatedAt: row.generatedAt,
    contentHash: row.contentHash,
    fromCache: true,
  };
}

/**
 * Record a freshly-generated report into the cache. Always creates a new row
 * (rows are immutable history). Returns the new row id.
 */
export async function recordGeneratedReport(
  ctx: ReportContext,
  args: {
    reportType: string;
    fileUrl: string | null;
    fileSize: number;
    fileName: string;
    bytes: Uint8Array; // for content-hash computation
  },
): Promise<string> {
  const contentHash = createHash("sha256").update(args.bytes).digest("hex");

  const row = await prisma.reportGeneration.create({
    data: {
      assessmentId: ctx.assessmentId,
      reportType: args.reportType,
      status: "completed",
      fileUrl: args.fileUrl,
      fileSize: args.fileSize,
      fileName: args.fileName,
      generatedBy: ctx.generatedBy,
      generatedAt: ctx.generatedAt,
      // Phase 10 — pin the cache row to the catalog/protocol/snapshot triple.
      snapshotId: ctx.snapshotId,
      protocolVersionId: ctx.protocolVersionId,
      catalogVersionId: ctx.catalogVersionId,
      contentHash,
    },
  });
  return row.id;
}
