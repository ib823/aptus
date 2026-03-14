/** GET: List conflicts for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const entityType = sp.get("entityType") ?? undefined;
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 100);
  const cursor = sp.get("cursor") ?? undefined;

  const where: Record<string, unknown> = { assessmentId };
  if (status) where.status = status;
  if (entityType) where.entityType = entityType;

  const conflicts = await prisma.conflict.findMany({
    where,
    include: {
      resolvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = conflicts.length > limit;
  const data = hasMore ? conflicts.slice(0, limit) : conflicts;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}
