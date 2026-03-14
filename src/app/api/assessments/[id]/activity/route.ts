/** GET: Activity feed for an assessment */

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
  const { user } = access;
  const sp = request.nextUrl.searchParams;
  const actionType = sp.get("actionType") ?? undefined;
  const actorId = sp.get("actorId") ?? undefined;
  const areaCode = sp.get("areaCode") ?? undefined;
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 100);
  const cursor = sp.get("cursor") ?? undefined;

  const where: Record<string, unknown> = { assessmentId };
  if (actionType) where.actionType = actionType;
  if (actorId) where.actorId = actorId;
  if (areaCode) where.areaCode = areaCode;

  const entries = await prisma.activityFeedEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = entries.length > limit;
  const data = hasMore ? entries.slice(0, limit) : entries;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}
