/** GET: List comments, POST: Create comment */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { parseMentions } from "@/lib/collaboration/mention-parser";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

export const preferredRegion = "sin1";

const CreateCommentSchema = z.object({
  targetType: z.enum(["STEP", "GAP", "SCOPE_ITEM", "INTEGRATION", "DATA_MIGRATION", "OCM"]),
  targetId: z.string().min(1),
  content: z.string().min(1).max(10000),
  parentCommentId: z.string().optional(),
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
  const sp = request.nextUrl.searchParams;
  const targetType = sp.get("targetType") ?? undefined;
  const targetId = sp.get("targetId") ?? undefined;
  const status = sp.get("status") ?? undefined;
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 100);
  const cursor = sp.get("cursor") ?? undefined;

  const where: Record<string, unknown> = { assessmentId, parentCommentId: null };
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (status) where.status = status;

  const comments = await prisma.comment.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      resolvedBy: { select: { id: true, name: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = comments.length > limit;
  const data = hasMore ? comments.slice(0, limit) : comments;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}

export async function POST(
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

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const { targetType, targetId, content, parentCommentId } = parsed.data;
  const { userIds: mentionIds, contentHtml } = parseMentions(content);

  // Validate parent comment if provided
  if (parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentCommentId, assessmentId },
    });
    if (!parent) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.NOT_FOUND, message: "Parent comment not found" } },
        { status: 404 },
      );
    }
  }

  const comment = await prisma.comment.create({
    data: {
      assessmentId,
      targetType,
      targetId,
      authorId: user.id,
      content,
      contentHtml,
      mentions: mentionIds,
      parentCommentId: parentCommentId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
    },
  });

  // Notify mentioned users
  if (mentionIds.length > 0) {
    dispatchNotification({
      type: "comment_mention",
      assessmentId,
      title: `${user.name} mentioned you in a comment`,
      body: content.substring(0, 200),
      deepLink: `/assessments/${assessmentId}?comment=${comment.id}`,
      recipientUserIds: mentionIds.filter((id) => id !== user.id),
    }).catch(() => { /* fire-and-forget */ });
  }

  // Notify parent comment author for replies
  if (parentCommentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentCommentId },
      select: { authorId: true },
    });
    if (parentComment && parentComment.authorId !== user.id) {
      dispatchNotification({
        type: "comment_reply",
        assessmentId,
        title: `${user.name} replied to your comment`,
        body: content.substring(0, 200),
        deepLink: `/assessments/${assessmentId}?comment=${comment.id}`,
        recipientUserIds: [parentComment.authorId],
      }).catch(() => { /* fire-and-forget */ });
    }
  }

  return NextResponse.json({ data: comment }, { status: 201 });
}
