/** POST: Create a conversation template (admin only) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { validateQuestionFlow } from "@/lib/conversation/tree-engine";
import { ERROR_CODES } from "@/types/api";
import type { QuestionFlow } from "@/types/conversation";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { z } from "zod";

const createSchema = z.object({
  scopeItemId: z.string().min(1),
  processStepId: z.string().min(1),
  questionFlow: z.object({
    rootQuestionId: z.string(),
    questions: z.array(z.unknown()),
  }),
  language: z.string().default("en"),
});
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const flow = parsed.data.questionFlow as unknown as QuestionFlow;
  const validation = validateQuestionFlow(flow);
  if (!validation.valid) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invalid question flow: ${validation.errors.join("; ")}` } },
      { status: 400 },
    );
  }

  // Deactivate existing templates for this scope+step+language
  await prisma.conversationTemplate.updateMany({
    where: {
      scopeItemId: parsed.data.scopeItemId,
      processStepId: parsed.data.processStepId,
      language: parsed.data.language,
      isActive: true,
    },
    data: { isActive: false },
  });

  // Get next version number
  const latestTemplate = await prisma.conversationTemplate.findFirst({
    where: {
      scopeItemId: parsed.data.scopeItemId,
      processStepId: parsed.data.processStepId,
      language: parsed.data.language,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const template = await prisma.conversationTemplate.create({
    data: {
      scopeItemId: parsed.data.scopeItemId,
      processStepId: parsed.data.processStepId,
      questionFlow: parsed.data.questionFlow as unknown as InputJsonValue,
      language: parsed.data.language,
      version: (latestTemplate?.version ?? 0) + 1,
      createdBy: auth.user.email,
      isActive: true,
    },
  });

  return NextResponse.json({ data: template }, { status: 201 });
}
