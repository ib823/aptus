/** POST: Resolve or rate a help session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const CONSULTANT_ROLES = ["consultant", "solution_architect", "platform_admin", "partner_lead"];

const resolveSchema = z.object({
  action: z.enum(["resolve", "close", "rate"]),
  rating: z.number().min(1).max(5).optional(),
  ratingComment: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { sessionId } = await params;

  const session = await prisma.helpSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Session not found" } },
      { status: 404 },
    );
  }

  const isClient = session.clientUserId === user.id;
  const isConsultant = CONSULTANT_ROLES.includes(user.role);

  if (!isClient && !isConsultant) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Access denied" } },
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

  const parsed = resolveSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { action, rating, ratingComment } = parsed.data;

  if (action === "resolve") {
    await prisma.helpSession.update({
      where: { id: sessionId },
      data: { status: "resolved", resolvedAt: new Date() },
    });
  } else if (action === "close") {
    await prisma.helpSession.update({
      where: { id: sessionId },
      data: { status: "closed", closedAt: new Date() },
    });
  } else if (action === "rate") {
    if (!rating) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Rating (1-5) required" } },
        { status: 400 },
      );
    }
    await prisma.helpSession.update({
      where: { id: sessionId },
      data: { rating, ratingComment: ratingComment ?? null, status: "closed", closedAt: new Date() },
    });
  }

  return NextResponse.json({ data: { success: true } });
}
