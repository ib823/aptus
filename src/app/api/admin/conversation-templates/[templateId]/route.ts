/** PUT: Update a conversation template (admin only) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { validateQuestionFlow } from "@/lib/conversation/tree-engine";
import { ERROR_CODES } from "@/types/api";
import type { QuestionFlow } from "@/types/conversation";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { z } from "zod";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const updateSchema = z.object({
  questionFlow: z.object({
    rootQuestionId: z.string(),
    questions: z.array(z.unknown()),
  }).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { templateId } = await params;

  const existing = await prisma.conversationTemplate.findUnique({
    where: { id: templateId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Template not found" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  if (parsed.data.questionFlow) {
    const flow = parsed.data.questionFlow as unknown as QuestionFlow;
    const validation = validateQuestionFlow(flow);
    if (!validation.valid) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid question flow: ${validation.errors.join("; ")}` } },
        { status: 400 },
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.questionFlow !== undefined) {
    updateData.questionFlow = parsed.data.questionFlow as unknown as InputJsonValue;
  }
  if (parsed.data.isActive !== undefined) {
    updateData.isActive = parsed.data.isActive;
  }

  const template = await prisma.conversationTemplate.update({
    where: { id: templateId },
    data: updateData,
  });

  return NextResponse.json({ data: template });
}
