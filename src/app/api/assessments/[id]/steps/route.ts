/** GET: Step responses for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  scopeItemId: z.string().optional(),
  fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]).optional(),
  stepType: z.enum([
    "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
    "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP",
  ]).optional(),
});

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

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid query parameters" } },
      { status: 400 },
    );
  }

  const { cursor, limit, scopeItemId, fitStatus, stepType } = parsed.data;

  const where: Record<string, unknown> = { assessmentId };
  if (fitStatus) where.fitStatus = fitStatus;
  if (scopeItemId || stepType) {
    const processStepWhere: Record<string, unknown> = {};
    if (scopeItemId) processStepWhere.scopeItemId = scopeItemId;
    if (stepType) processStepWhere.stepType = stepType;
    where.processStep = processStepWhere;
  }

  const entries = await prisma.stepResponse.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      assessmentId: true,
      processStepId: true,
      fitStatus: true,
      clientNote: true,
      currentProcess: true,
      respondent: true,
      respondedAt: true,
      createdAt: true,
      updatedAt: true,
      processStep: {
        select: {
          id: true,
          scopeItemId: true,
          sequence: true,
          actionTitle: true,
          stepType: true,
          processFlowGroup: true,
        },
      },
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
