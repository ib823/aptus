/**
 * Phase 10 — single source of truth for report-time pinning.
 *
 * Built once per report request and threaded through every generator
 * (PDF, XLSX, JSON). Eliminates drift between generators that happened
 * before — e.g. PDF citing an older scope-item name than XLSX.
 *
 * Carries:
 *   - protocolVersionId / catalogVersionId for footer "produced under" stamp
 *   - currentSnapshotId for cache invalidation
 *   - generationTimestamp (frozen at request entry, never recomputed)
 *   - actor (for audit footer + cache row)
 */

import { prisma } from "@/lib/db/prisma";

export interface ReportContext {
  assessmentId: string;
  generatedAt: Date;
  generatedBy: string;
  protocolVersionId: string | null;
  protocolVersionName: string | null;
  protocolVersionVersion: string | null;
  catalogVersionId: string | null;
  catalogVersion: string | null;
  catalogEdition: string | null;
  snapshotId: string | null;
  isFrozen: boolean; // true when assessment is signed_off+
}

export async function buildReportContext(
  assessmentId: string,
  generatedBy: string,
): Promise<ReportContext> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      id: true,
      status: true,
      catalogVersionId: true,
      catalogVersion: { select: { version: true, edition: true } },
      currentSnapshotId: true,
    },
  });

  // Resolve the active protocol pinned to this assessment's catalog
  const protocol = assessment.catalogVersionId
    ? await prisma.classificationProtocol.findFirst({
        where: { isActive: true, catalogVersionId: assessment.catalogVersionId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, version: true },
      })
    : null;

  return {
    assessmentId: assessment.id,
    generatedAt: new Date(),
    generatedBy,
    protocolVersionId: protocol?.id ?? null,
    protocolVersionName: protocol?.name ?? null,
    protocolVersionVersion: protocol?.version ?? null,
    catalogVersionId: assessment.catalogVersionId,
    catalogVersion: assessment.catalogVersion?.version ?? null,
    catalogEdition: assessment.catalogVersion?.edition ?? null,
    snapshotId: assessment.currentSnapshotId,
    isFrozen: assessment.status === "signed_off",
  };
}

/** One-line provenance footer string for PDF + XLSX surfaces. */
export function provenanceFooter(ctx: ReportContext): string {
  const parts: string[] = [];
  if (ctx.protocolVersionName && ctx.protocolVersionVersion) {
    parts.push(`Protocol: ${ctx.protocolVersionName} v${ctx.protocolVersionVersion}`);
  }
  if (ctx.catalogVersion) {
    parts.push(`Catalog: ${ctx.catalogVersion}/${ctx.catalogEdition ?? "PUBLIC"}`);
  }
  parts.push(`Generated: ${ctx.generatedAt.toISOString()}`);
  parts.push(`By: ${ctx.generatedBy}`);
  return parts.join(" · ");
}
