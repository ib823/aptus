/** GET: Fetch messages for a help session */
/** POST: Send a message in a help session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const CONSULTANT_ROLES = ["consultant", "solution_architect", "platform_admin", "partner_lead"];

const sendSchema = z.object({
  content: z.string().min(1).max(5000),
});

async function canAccess(sessionId: string, userId: string, role: string) {
  const session = await prisma.helpSession.findUnique({
    where: { id: sessionId },
    select: { id: true, clientUserId: true, consultantUserId: true, status: true },
  });
  if (!session) return null;
  const isClient = session.clientUserId === userId;
  const isConsultant = CONSULTANT_ROLES.includes(role);
  if (!isClient && !isConsultant) return null;
  return { session, isClient, isConsultant };
}

export async function GET(
  _request: NextRequest,
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
  const access = await canAccess(sessionId, user.id, user.role);
  if (!access) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Session not found" } },
      { status: 404 },
    );
  }

  const messages = await prisma.helpMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      senderRole: true,
      content: true,
      readAt: true,
      createdAt: true,
    },
  });

  // Mark unread messages from the other party as read
  const myRole = access.isClient ? "client" : "consultant";
  await prisma.helpMessage.updateMany({
    where: {
      sessionId,
      senderRole: { not: myRole },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({
    data: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
    })),
  });
}

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
  const access = await canAccess(sessionId, user.id, user.role);
  if (!access) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Session not found" } },
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

  const parsed = sendSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Message content required" } },
      { status: 400 },
    );
  }

  const senderRole = access.isClient ? "client" : "consultant";

  const message = await prisma.helpMessage.create({
    data: {
      sessionId,
      senderId: user.id,
      senderRole,
      content: parsed.data.content,
    },
  });

  // If consultant is responding for the first time, claim the session
  if (access.isConsultant && !access.session.consultantUserId) {
    await prisma.helpSession.update({
      where: { id: sessionId },
      data: { consultantUserId: user.id, status: "active" },
    });
  }

  return NextResponse.json({
    data: {
      id: message.id,
      senderId: message.senderId,
      senderRole: message.senderRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      readAt: null,
    },
  }, { status: 201 });
}
