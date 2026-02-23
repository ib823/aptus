/** Phase 21: Workshop session lifecycle management */

import { prisma } from "@/lib/db/prisma";
import { generateWorkshopQR } from "./qr-code";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logActivity } from "@/lib/collaboration/activity-logger";

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 for readability
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateUniqueSessionCode(retries: number = 5): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const code = generateSessionCode();
    const existing = await prisma.workshopSession.findUnique({
      where: { sessionCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique session code after max retries");
}

export interface CreateWorkshopInput {
  title: string;
  description?: string | undefined;
  scheduledAt?: Date | undefined;
  facilitatorId: string;
  facilitatorName: string;
  agenda?: Array<{ scopeItemId: string; processStepIds?: string[]; title: string }> | undefined;
}

export async function createWorkshopSession(
  assessmentId: string,
  data: CreateWorkshopInput,
) {
  const sessionCode = await generateUniqueSessionCode();

  const session = await prisma.workshopSession.create({
    data: {
      assessmentId,
      sessionCode,
      title: data.title,
      description: data.description ?? null,
      status: "scheduled",
      facilitatorId: data.facilitatorId,
      facilitatorName: data.facilitatorName,
      scheduledAt: data.scheduledAt ?? null,
      agenda: data.agenda ? JSON.parse(JSON.stringify(data.agenda)) : null,
    },
  });

  // Notify stakeholders
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    select: { userId: true },
  });

  dispatchNotification({
    type: "workshop_invite",
    assessmentId,
    title: `Workshop scheduled: ${data.title}`,
    body: `A workshop has been scheduled${data.scheduledAt ? ` for ${data.scheduledAt.toLocaleDateString()}` : ""}. Code: ${sessionCode}`,
    deepLink: `/assessment/${assessmentId}/workshops`,
    recipientUserIds: stakeholders.map((s) => s.userId).filter((id) => id !== data.facilitatorId),
  }).catch(() => { /* fire-and-forget */ });

  logActivity({
    assessmentId,
    actorId: data.facilitatorId,
    actorName: data.facilitatorName,
    actorRole: "facilitator",
    actionType: "commented",
    summary: `scheduled workshop "${data.title}"`,
    entityType: "workshop",
    entityId: session.id,
  }).catch(() => { /* fire-and-forget */ });

  return session;
}

export async function startWorkshopSession(
  sessionId: string,
  facilitatorId: string,
) {
  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, facilitatorId: true, sessionCode: true, assessmentId: true, title: true },
  });

  if (!session) throw new Error("Session not found");
  if (session.status !== "scheduled") throw new Error("Session must be in scheduled status to start");
  if (session.facilitatorId !== facilitatorId) throw new Error("Only the facilitator can start the session");

  const qrCodeUrl = await generateWorkshopQR(session.sessionCode);

  const updated = await prisma.workshopSession.update({
    where: { id: sessionId },
    data: {
      status: "in_progress",
      startedAt: new Date(),
      qrCodeUrl,
    },
  });

  // Notify stakeholders
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId: session.assessmentId },
    select: { userId: true },
  });

  dispatchNotification({
    type: "workshop_starting",
    assessmentId: session.assessmentId,
    title: `Workshop starting: ${session.title}`,
    body: `Join with code ${session.sessionCode}`,
    deepLink: `/workshops/join?code=${session.sessionCode}`,
    recipientUserIds: stakeholders.map((s) => s.userId).filter((id) => id !== facilitatorId),
  }).catch(() => { /* fire-and-forget */ });

  return updated;
}

export async function endWorkshopSession(
  sessionId: string,
  facilitatorId: string,
) {
  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, facilitatorId: true, startedAt: true, assessmentId: true },
  });

  if (!session) throw new Error("Session not found");
  if (session.status !== "in_progress") throw new Error("Session must be active to end");
  if (session.facilitatorId !== facilitatorId) throw new Error("Only the facilitator can end the session");

  const now = new Date();
  const duration = session.startedAt
    ? Math.round((now.getTime() - session.startedAt.getTime()) / 60000)
    : null;

  // Mark all attendees as disconnected
  await prisma.workshopAttendee.updateMany({
    where: { sessionId, connectionStatus: "connected" },
    data: { connectionStatus: "disconnected", leftAt: now },
  });

  const attendeeCount = await prisma.workshopAttendee.count({
    where: { sessionId },
  });

  const updated = await prisma.workshopSession.update({
    where: { id: sessionId },
    data: {
      status: "completed",
      completedAt: now,
      duration,
      attendeeCount,
    },
  });

  return updated;
}

export async function cancelWorkshopSession(sessionId: string) {
  return prisma.workshopSession.update({
    where: { id: sessionId },
    data: { status: "cancelled" },
  });
}
