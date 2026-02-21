/** GET: Activity feed for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;
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
