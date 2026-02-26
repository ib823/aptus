/** GET: Process steps filtered by activity */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scopeItemId: string; activityId: string }> },
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

  const { scopeItemId, activityId } = await params;

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid query parameters" } },
      { status: 400 },
    );
  }

  const limit = parsed.data.limit;

  const steps = await prisma.processStep.findMany({
    where: { scopeItemId, activityId },
    orderBy: { sequence: "asc" },
    take: limit + 1,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      scopeItemId: true,
      sequence: true,
      actionTitle: true,
      actionInstructionsHtml: true,
      actionExpectedResult: true,
      stepType: true,
      processFlowGroup: true,
      activityTitle: true,
      activityTargetUrl: true,
      activityId: true,
      solutionProcessFlowName: true,
      stepCategory: true,
      isClassifiable: true,
    },
  });

  const hasMore = steps.length > limit;
  if (hasMore) steps.pop();

  return NextResponse.json({
    data: steps,
    nextCursor: hasMore ? steps[steps.length - 1]?.id ?? null : null,
    hasMore,
  });
}
