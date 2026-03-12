/** PUT: Update comment, DELETE: Delete comment */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { parseMentions } from "@/lib/collaboration/mention-parser";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";

const UpdateCommentSchema = z.object({
  content: z.string().min(1).max(10000),
});
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, commentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, assessmentId },
  });

  if (!comment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" } },
      { status: 404 },
    );
  }

  // Only the author or platform_admin can edit
  if (comment.authorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You can only edit your own comments" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = UpdateCommentSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const { userIds: mentionIds, contentHtml } = parseMentions(parsed.data.content);

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content: parsed.data.content,
      contentHtml,
      mentions: mentionIds,
      isEdited: true,
      editedAt: new Date(),
    },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, commentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, assessmentId },
  });

  if (!comment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" } },
      { status: 404 },
    );
  }

  // Only the author or platform_admin can delete
  if (comment.authorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You can only delete your own comments" } },
      { status: 403 },
    );
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });

  return NextResponse.json({ data: { deleted: true } });
}
