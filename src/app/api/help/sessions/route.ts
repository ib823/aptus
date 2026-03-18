/** GET: List help sessions (consultants see all, clients see own) */
/** POST: Create a new help session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { resolveRecipients } from "@/lib/notifications/recipient-resolver";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const createSchema = z.object({
  assessmentId: z.string().optional(),
  currentPage: z.string().optional(),
  category: z.enum(["question", "stuck", "bug", "general"]).default("general"),
  message: z.string().min(1).max(5000),
});

const CONSULTANT_ROLES = ["consultant", "solution_architect", "platform_admin", "partner_lead"];

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const isConsultant = CONSULTANT_ROLES.includes(user.role);

  // Consultants see all open/active sessions; clients see only their own
  const sessions = await prisma.helpSession.findMany({
    where: isConsultant
      ? { status: { in: ["open", "active"] } }
      : { clientUserId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, senderRole: true, createdAt: true, readAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Enrich with client name
  const clientIds = [...new Set(sessions.map((s) => s.clientUserId))];
  const clients = await prisma.user.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, name: true, email: true },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const enriched = sessions.map((s) => {
    const client = clientMap.get(s.clientUserId);
    const lastMsg = s.messages[0];
    return {
      id: s.id,
      clientName: client?.name ?? client?.email ?? "Unknown",
      clientEmail: client?.email ?? "",
      assessmentId: s.assessmentId,
      currentPage: s.currentPage,
      category: s.category,
      status: s.status,
      lastMessage: lastMsg?.content?.substring(0, 100) ?? null,
      lastMessageRole: lastMsg?.senderRole ?? null,
      lastMessageAt: lastMsg?.createdAt?.toISOString() ?? null,
      unread: lastMsg && !lastMsg.readAt && lastMsg.senderRole !== (isConsultant ? "consultant" : "client"),
      createdAt: s.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ data: enriched });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Check for existing open session from this user
  const existing = await prisma.helpSession.findFirst({
    where: { clientUserId: user.id, status: { in: ["open", "active"] } },
  });

  if (existing) {
    // Append message to existing session instead
    await prisma.helpMessage.create({
      data: {
        sessionId: existing.id,
        senderId: user.id,
        senderRole: "client",
        content: parsed.data.message,
      },
    });

    return NextResponse.json({ data: { sessionId: existing.id, reused: true } });
  }

  // Create new session + first message in transaction
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.helpSession.create({
      data: {
        clientUserId: user.id,
        assessmentId: parsed.data.assessmentId ?? null,
        currentPage: parsed.data.currentPage ?? null,
        category: parsed.data.category,
        status: "open",
      },
    });

    await tx.helpMessage.create({
      data: {
        sessionId: s.id,
        senderId: user.id,
        senderRole: "client",
        content: parsed.data.message,
      },
    });

    return s;
  });

  // Notify consultants (fire-and-forget)
  if (parsed.data.assessmentId) {
    resolveRecipients(parsed.data.assessmentId, "help_request", { excludeUserId: user.id }).then((recipients) => {
      if (recipients.length > 0) {
        dispatchNotification({
          type: "help_request",
          assessmentId: parsed.data.assessmentId,
          title: "Help requested",
          body: `${user.name ?? user.email}: ${parsed.data.message.substring(0, 80)}`,
          deepLink: `/admin/help`,
          recipientUserIds: recipients,
          priority: "high",
        }).catch((err) => console.error("[NOTIFY] help_request failed:", err));
      }
    }).catch((err) => console.error("[NOTIFY] resolve help_request failed:", err));
  }

  return NextResponse.json({ data: { sessionId: session.id, reused: false } }, { status: 201 });
}
