/** POST: Start a workshop session. Facilitator or platform_admin only. */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { resolveRecipients } from "@/lib/notifications/recipient-resolver";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { generateWorkshopQR } from "@/lib/workshop/qr-code";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, status: true, facilitatorId: true, sessionCode: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  // Only facilitator or platform_admin can start
  if (session.facilitatorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only the facilitator can start the workshop" } },
      { status: 403 },
    );
  }

  if (session.status !== "scheduled") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Workshop can only be started from scheduled status" } },
      { status: 400 },
    );
  }

  // Generate QR code for the join link
  const qrCodeUrl = await generateWorkshopQR(session.sessionCode);

  const updated = await prisma.workshopSession.update({
    where: { id: session.id },
    data: {
      status: "in_progress",
      startedAt: new Date(),
      qrCodeUrl,
    },
  });

  await logDecision({
    assessmentId,
    entityType: "workshop_session",
    entityId: session.id,
    action: "WORKSHOP_STARTED",
    oldValue: { status: "scheduled" },
    newValue: { status: "in_progress", startedAt: updated.startedAt },
    actor: user.email,
    actorRole: user.role,
  });

  // Notify stakeholders workshop is starting
  resolveRecipients(assessmentId, "workshop_starting", { excludeUserId: user.id }).then(recipients => {
    if (recipients.length > 0) {
      dispatchNotification({
        type: "workshop_starting",
        assessmentId,
        title: "Workshop starting now",
        body: `The workshop is now live`,
        deepLink: `/assessment/${assessmentId}/workshops/${sessionId}`,
        metadata: { sessionId },
        recipientUserIds: recipients,
        priority: "high",
      }).catch(err => console.error("[NOTIFY] workshop_starting failed:", err));
    }
  }).catch(err => console.error("[NOTIFY] resolve workshop_starting failed:", err));

  return NextResponse.json({ data: { id: updated.id, status: updated.status, startedAt: updated.startedAt, qrCodeUrl } });
}
