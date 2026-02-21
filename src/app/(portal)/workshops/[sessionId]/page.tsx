import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { WorkshopModeLayout } from "@/components/workshop/WorkshopModeLayout";
import type { AgendaItem } from "@/types/workshop";

interface WorkshopPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function WorkshopPage({ params }: WorkshopPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { sessionId } = await params;

  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      assessmentId: true,
      title: true,
      sessionCode: true,
      status: true,
      facilitatorId: true,
      agenda: true,
      currentStepId: true,
      currentScopeItemId: true,
    },
  });

  if (!session) notFound();

  const isFacilitator = session.facilitatorId === user.id || user.role === "platform_admin";

  // Get attendees
  const attendees = await prisma.workshopAttendee.findMany({
    where: { sessionId },
    select: {
      id: true,
      role: true,
      connectionStatus: true,
      isPresenter: true,
      user: { select: { id: true, name: true } },
    },
  });

  // Get steps for the assessment (if scope items are assigned, use those)
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId: session.assessmentId, selected: true },
    select: { scopeItemId: true },
    take: 100,
  });

  const scopeItemIds = scopeSelections.map((s) => s.scopeItemId);
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  const steps = await prisma.processStep.findMany({
    where: { scopeItemId: { in: scopeItemIds } },
    select: {
      id: true,
      sequence: true,
      actionTitle: true,
      scopeItemId: true,
      processFlowGroup: true,
      stepResponses: {
        where: { assessmentId: session.assessmentId },
        select: { fitStatus: true },
        take: 1,
      },
    },
    orderBy: [{ scopeItemId: "asc" }, { sequence: "asc" }],
    take: 500,
  });

  const serializedSteps = steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    actionTitle: s.actionTitle,
    scopeItemId: s.scopeItemId,
    scopeItemName: scopeMap.get(s.scopeItemId),
    processFlowName: s.processFlowGroup ?? undefined,
    fitStatus: s.stepResponses[0]?.fitStatus ?? "PENDING",
  }));

  const agenda = Array.isArray(session.agenda) ? (session.agenda as unknown as AgendaItem[]) : [];

  // Get action items
  const actionItems = await prisma.workshopActionItem.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const serializedActionItems = actionItems.map((ai) => ({
    id: ai.id,
    title: ai.title,
    description: ai.description,
    assignedToName: ai.assignedToName,
    status: ai.status,
    priority: ai.priority,
    dueDate: ai.dueDate?.toISOString() ?? null,
  }));

  return (
    <WorkshopModeLayout
      assessmentId={session.assessmentId}
      sessionId={session.id}
      sessionTitle={session.title}
      sessionCode={session.sessionCode}
      sessionStatus={session.status}
      isFacilitator={isFacilitator}
      steps={serializedSteps}
      agenda={agenda}
      initialAttendees={attendees.map((a) => ({
        id: a.id,
        name: a.user.name,
        role: a.role,
        connectionStatus: a.connectionStatus,
        isPresenter: a.isPresenter,
      }))}
      initialActionItems={serializedActionItems}
    />
  );
}
