/** PUT: Resolve a comment */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
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

  const { id: assessmentId, commentId } = await params;

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, assessmentId },
  });

  if (!comment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" } },
      { status: 404 },
    );
  }

  if (comment.status === "RESOLVED") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Comment is already resolved" } },
      { status: 400 },
    );
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      status: "RESOLVED",
      resolvedById: user.id,
      resolvedAt: new Date(),
    },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: updated });
}
