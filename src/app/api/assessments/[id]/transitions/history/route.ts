/** GET: Status transition history (cursor paginated) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

  const entries = await prisma.statusTransitionLog.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      triggeredBy: true,
      triggeredByRole: true,
      reason: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();

  return NextResponse.json({
    data: entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id ?? null : null,
    hasMore,
  });
}
