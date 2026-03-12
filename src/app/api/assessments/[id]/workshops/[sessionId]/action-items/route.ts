/** GET: List action items, POST: Create action item */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";

const CreateActionItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().optional(),
  assignedToName: z.string().max(200).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  relatedStepId: z.string().optional(),
  relatedScopeItemId: z.string().optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const items = await prisma.workshopActionItem.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });

  const data = items.map((item) => ({
    ...item,
    dueDate: item.dueDate?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return NextResponse.json({ data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = CreateActionItemSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const item = await prisma.workshopActionItem.create({
    data: {
      sessionId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assignedTo: parsed.data.assignedTo ?? null,
      assignedToName: parsed.data.assignedToName ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      priority: parsed.data.priority ?? "medium",
      relatedStepId: parsed.data.relatedStepId ?? null,
      relatedScopeItemId: parsed.data.relatedScopeItemId ?? null,
    },
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
