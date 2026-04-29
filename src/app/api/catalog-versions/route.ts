/**
 * GET /api/catalog-versions
 *
 * Returns the list of active SAP catalog versions, used by the new-assessment
 * Edition + Version picker (Phase 13.4) and admin surfaces.
 *
 * Output is grouped by edition so the UI can render a cascading picker:
 *   { editions: [{ edition: "PUBLIC", versions: [{ id, version, isActive, ingestedAt, scopeItemCount }, ...] }, ...] }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const versions = await prisma.scopeCatalogVersion.findMany({
    where: { isActive: true },
    select: {
      id: true,
      version: true,
      edition: true,
      ingestedAt: true,
      releaseDate: true,
      _count: { select: { scopeItems: true } },
    },
    orderBy: [{ edition: "asc" }, { ingestedAt: "desc" }],
  });

  // Group by edition (preserve ingest order within each)
  const byEdition = new Map<
    string,
    Array<{ id: string; version: string; ingestedAt: Date; releaseDate: Date | null; scopeItemCount: number }>
  >();
  for (const v of versions) {
    if (!byEdition.has(v.edition)) byEdition.set(v.edition, []);
    byEdition.get(v.edition)!.push({
      id: v.id,
      version: v.version,
      ingestedAt: v.ingestedAt,
      releaseDate: v.releaseDate,
      scopeItemCount: v._count.scopeItems,
    });
  }

  const editions = Array.from(byEdition.entries()).map(([edition, vers]) => ({
    edition,
    versions: vers,
  }));

  return NextResponse.json({ editions });
}
