/** GET: Step responses for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(2000).default(50),
  scopeItemId: z.string().optional(),
  fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]).optional(),
  stepType: z.enum([
    "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
    "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP",
  ]).optional(),
  grouped: z.string().optional(),
  summary: z.enum(["true", "false"]).optional(),
});

interface StepCursorParts {
  id: string;
  createdAt: Date;
}

function encodeStepCursor(input: StepCursorParts): string {
  return Buffer.from(
    JSON.stringify({
      id: input.id,
      createdAt: input.createdAt.toISOString(),
    }),
  ).toString("base64url");
}

function decodeStepCursor(cursor: string | undefined): StepCursorParts | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      id?: string;
      createdAt?: string;
    };
    if (!parsed.id || !parsed.createdAt) return undefined;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return undefined;
    return { id: parsed.id, createdAt };
  } catch {
    return undefined;
  }
}
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
  const decodedCursor = decodeStepCursor(cursor);
  if (cursor && !decodedCursor) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid cursor" } },
      { status: 400 },
    );
  }
  const summaryMode = parsed.data.summary === "true";

  const where: Prisma.StepResponseWhereInput = { assessmentId };
  if (fitStatus) where.fitStatus = fitStatus;
  if (scopeItemId || stepType) {
    const processStepWhere: Prisma.ProcessStepWhereInput = {};
    if (scopeItemId) processStepWhere.scopeItemId = scopeItemId;
    if (stepType) processStepWhere.stepType = stepType;
    where.processStep = processStepWhere;
  }
  if (decodedCursor) {
    const existingAnd = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [
      ...existingAnd,
      {
        OR: [
          { createdAt: { lt: decodedCursor.createdAt } },
          {
            createdAt: decodedCursor.createdAt,
            id: { lt: decodedCursor.id },
          },
        ],
      },
    ];
  }

  const entries = await prisma.stepResponse.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: summaryMode
      ? {
          id: true,
          createdAt: true,
          processStepId: true,
          fitStatus: true,
          clientNote: true,
          currentProcess: true,
          confidence: true,
          processStep: {
            select: {
              isClassifiable: true,
              groupKey: true,
            },
          },
        }
      : {
          id: true,
          createdAt: true,
          assessmentId: true,
          processStepId: true,
          fitStatus: true,
          clientNote: true,
          currentProcess: true,
          respondent: true,
          respondedAt: true,
          updatedAt: true,
          confidence: true,
          evidenceUrls: true,
          reviewedBy: true,
          reviewedAt: true,
          isPropagated: true,
          propagatedFrom: true,
          processStep: {
            select: {
              id: true,
              scopeItemId: true,
              sequence: true,
              actionTitle: true,
              stepType: true,
              processFlowGroup: true,
              stepCategory: true,
              isClassifiable: true,
              groupKey: true,
              groupLabel: true,
            },
          },
        },
  });

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();
  const cursorEntry = entries.at(-1);
  const nextCursor = hasMore && cursorEntry
    ? encodeStepCursor({
        id: cursorEntry.id,
        createdAt: cursorEntry.createdAt,
      })
    : null;

  // Compute classifiable step counts
  const totalSteps = entries.length;
  const classifiableSteps = entries.filter((e) => e.processStep?.isClassifiable !== false).length;
  const reviewedClassifiable = entries.filter(
    (e) => e.processStep?.isClassifiable !== false && e.fitStatus !== "PENDING",
  ).length;

  // Optional grouped response
  if (parsed.data.grouped === "true") {
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = entry.processStep?.groupKey ?? "ungrouped";
      const existing = groups.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    return NextResponse.json({
      data: Object.fromEntries(groups),
      totalSteps,
      classifiableSteps,
      reviewedClassifiable,
      nextCursor,
      hasMore,
    });
  }

  return NextResponse.json({
    data: entries,
    totalSteps,
    classifiableSteps,
    reviewedClassifiable,
    nextCursor,
    hasMore,
  });
}
