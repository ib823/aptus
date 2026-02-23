import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { WorkshopModeLayout } from "@/components/workshop/WorkshopModeLayout";
import { getCurrentUser } from "@/lib/auth/session";
import type { AgendaItem } from "@/types/workshop";

interface WorkshopSessionPageProps {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function WorkshopSessionPage({ params }: WorkshopSessionPageProps) {
  const { id: assessmentId, sessionId } = await params;
  const user = await getCurrentUser();

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: {
      id: true,
      title: true,
      sessionCode: true,
      status: true,
      facilitatorId: true,
      agenda: true,
    },
  });

  if (!session) notFound();

  // Parse agenda
  const agendaRaw = (session.agenda ?? []) as Array<Record<string, unknown>>;
  const agenda: AgendaItem[] = agendaRaw.map((item, i) => ({
    id: String(item.id ?? `agenda-${i}`),
    title: String(item.title ?? "Untitled"),
    scopeItemId: item.scopeItemId ? String(item.scopeItemId) : undefined,
    duration: typeof item.duration === "number" ? item.duration : undefined,
    status: (item.status as AgendaItem["status"]) ?? "pending",
    order: typeof item.order === "number" ? item.order : i,
  }));

  // Load steps from agenda scope items
  const scopeItemIds = agenda
    .map((a) => a.scopeItemId)
    .filter((id): id is string => !!id);

  const steps = scopeItemIds.length > 0
    ? await prisma.processStep.findMany({
        where: { scopeItemId: { in: scopeItemIds } },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          actionTitle: true,
          scopeItemId: true,
          processFlowGroup: true,
          stepResponses: {
            where: { assessmentId },
            select: { fitStatus: true },
            take: 1,
          },
          scopeItem: { select: { nameClean: true } },
        },
      })
    : [];

  const stepsData = steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    actionTitle: s.actionTitle,
    scopeItemId: s.scopeItemId,
    processFlowName: s.processFlowGroup ?? undefined,
    scopeItemName: s.scopeItem.nameClean,
    fitStatus: s.stepResponses[0]?.fitStatus ?? "PENDING",
  }));

  // Load attendees
  const attendees = await prisma.workshopAttendee.findMany({
    where: { sessionId },
    select: {
      id: true,
      role: true,
      connectionStatus: true,
      isPresenter: true,
      user: { select: { name: true } },
    },
  });

  const attendeesData = attendees.map((a) => ({
    id: a.id,
    name: a.user.name ?? "Unknown",
    role: a.role,
    connectionStatus: a.connectionStatus,
    isPresenter: a.isPresenter,
  }));

  // Load action items
  const actionItems = await prisma.workshopActionItem.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });

  const actionItemsData = actionItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    assignedToName: item.assignedToName,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate?.toISOString() ?? null,
  }));

  const isFacilitator = user?.id === session.facilitatorId || user?.role === "platform_admin";

  return (
    <WorkshopModeLayout
      assessmentId={assessmentId}
      sessionId={session.id}
      sessionTitle={session.title}
      sessionCode={session.sessionCode}
      sessionStatus={session.status}
      isFacilitator={isFacilitator}
      steps={stepsData}
      agenda={agenda}
      initialAttendees={attendeesData}
      initialActionItems={actionItemsData}
    />
  );
}
