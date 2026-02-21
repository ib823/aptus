/** GET: Fetch conversation templates + session state for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { id: assessmentId, scopeItemId } = await params;

  const [templates, session] = await Promise.all([
    prisma.conversationTemplate.findMany({
      where: { scopeItemId, isActive: true },
      orderBy: { version: "desc" },
    }),
    prisma.conversationSession.findFirst({
      where: {
        assessmentId,
        userId: user.id,
        scopeItemId,
        status: "in_progress",
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    data: {
      templates,
      session,
    },
  });
}
