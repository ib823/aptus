/** GET: Role-filtered activity feed */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getVisibleAssessmentWhere } from "@/lib/auth/assessment-visibility";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const cursor = searchParams.get("cursor") ?? undefined;

  const entries = await prisma.activityFeedEntry.findMany({
    where: {
      assessment: getVisibleAssessmentWhere(user),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      assessmentId: true,
      actorName: true,
      actorRole: true,
      actionType: true,
      summary: true,
      entityType: true,
      createdAt: true,
      assessment: { select: { companyName: true } },
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
