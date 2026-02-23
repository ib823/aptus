/** Phase 21: Workshop minutes generation */

import { prisma } from "@/lib/db/prisma";
import { renderMinutesMarkdown } from "./minutes-renderer";
import { computeVoteTally, type VoteInput } from "./vote-tally";
import type { AgendaItem } from "@/types/workshop";
import type { InputJsonValue } from "@prisma/client/runtime/library";

/**
 * Generate workshop minutes from session data.
 * Creates or updates the WorkshopMinutes record.
 */
export async function generateMinutes(sessionId: string, _generatedBy: string) {
  const session = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    include: {
      attendees: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      votes: true,
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) throw new Error("Session not found");

  // Build attendees for the renderer
  const attendees = session.attendees.map((a) => ({
    name: a.user.name ?? a.user.email,
    role: a.role,
    joinedAt: a.joinedAt.toISOString(),
  }));

  // Build decisions summary: group votes by processStepId
  const votesByStep = new Map<string, VoteInput[]>();
  for (const vote of session.votes) {
    const existing = votesByStep.get(vote.processStepId) ?? [];
    existing.push({ userId: vote.userId, classification: vote.classification });
    votesByStep.set(vote.processStepId, existing);
  }

  const stepIds = [...votesByStep.keys()];
  const steps = stepIds.length > 0
    ? await prisma.processStep.findMany({
        where: { id: { in: stepIds } },
        select: { id: true, actionTitle: true },
      })
    : [];
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  // Get finalized responses
  const responses = await prisma.stepResponse.findMany({
    where: { assessmentId: session.assessmentId, processStepId: { in: stepIds } },
    select: { processStepId: true, fitStatus: true },
  });
  const responseMap = new Map(responses.map((r) => [r.processStepId, r.fitStatus]));

  // Tally counts for statistics
  let fitCount = 0;
  let configureCount = 0;
  let gapCount = 0;
  let naCount = 0;
  let consensusSum = 0;

  const decisions = stepIds.map((stepId) => {
    const step = stepMap.get(stepId);
    const votes = votesByStep.get(stepId) ?? [];
    const tally = computeVoteTally(stepId, votes);
    const classification = responseMap.get(stepId) ?? tally.consensus ?? "PENDING";

    switch (classification) {
      case "FIT": fitCount++; break;
      case "CONFIGURE": configureCount++; break;
      case "GAP": gapCount++; break;
      case "NA": naCount++; break;
    }
    consensusSum += tally.consensusPercentage;

    return {
      processStepId: stepId,
      stepTitle: step?.actionTitle ?? stepId,
      classification,
      totalVotes: tally.totalVotes,
      consensusPercentage: tally.consensusPercentage,
    };
  });

  // Build action items for the renderer
  const actionItems = session.actionItems.map((item) => ({
    title: item.title,
    assignedToName: item.assignedToName ?? undefined,
    dueDate: item.dueDate?.toISOString().slice(0, 10) ?? undefined,
    priority: item.priority,
    status: item.status,
  }));

  // Build agenda from session JSON
  const rawAgenda = (session.agenda ?? []) as Array<Record<string, unknown>>;
  const agenda: AgendaItem[] = rawAgenda.map((item, i) => ({
    id: String(item.id ?? `agenda-${i}`),
    title: String(item.title ?? "Untitled"),
    scopeItemId: item.scopeItemId ? String(item.scopeItemId) : undefined,
    duration: typeof item.duration === "number" ? item.duration : undefined,
    status: (item.status as AgendaItem["status"]) ?? "completed",
    order: typeof item.order === "number" ? item.order : i,
  }));

  // Statistics
  const totalStepsReviewed = votesByStep.size;
  const averageConsensus = totalStepsReviewed > 0
    ? Math.round(consensusSum / totalStepsReviewed)
    : 0;

  const statistics = {
    totalStepsReviewed,
    fitCount,
    configureCount,
    gapCount,
    naCount,
    averageConsensus,
  };

  // Render markdown
  const markdownContent = renderMinutesMarkdown({
    title: session.title,
    sessionCode: session.sessionCode,
    facilitatorName: session.facilitatorName,
    scheduledAt: session.scheduledAt?.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    completedAt: session.completedAt?.toISOString(),
    attendees,
    decisions,
    actionItems,
    agenda,
    statistics,
  });

  // Detailed summaries for DB storage (richer than what the renderer uses)
  const attendeesSummary = session.attendees.map((a) => ({
    name: a.user.name ?? a.user.email,
    role: a.role,
    joinedAt: a.joinedAt.toISOString(),
    leftAt: a.leftAt?.toISOString() ?? null,
  }));

  const decisionsSummary = decisions;
  const actionItemsSummary = actionItems;
  const statisticsSummary = {
    ...statistics,
    totalVotes: session.votes.length,
    participationRate: session.attendees.length > 0
      ? Math.round((new Set(session.votes.map((v) => v.userId)).size / session.attendees.length) * 100)
      : 0,
    duration: session.duration ?? 0,
    attendeeCount: session.attendees.length,
  };

  // Upsert minutes record
  const minutes = await prisma.workshopMinutes.upsert({
    where: { sessionId },
    update: {
      content: markdownContent,
      attendeesSummary: JSON.parse(JSON.stringify(attendeesSummary)) as InputJsonValue,
      decisionsSummary: JSON.parse(JSON.stringify(decisionsSummary)) as InputJsonValue,
      actionItemsSummary: JSON.parse(JSON.stringify(actionItemsSummary)) as InputJsonValue,
      agendaSummary: JSON.parse(JSON.stringify(agenda)) as InputJsonValue,
      statisticsSummary: JSON.parse(JSON.stringify(statisticsSummary)) as InputJsonValue,
      regeneratedAt: new Date(),
    },
    create: {
      sessionId,
      content: markdownContent,
      attendeesSummary: JSON.parse(JSON.stringify(attendeesSummary)) as InputJsonValue,
      decisionsSummary: JSON.parse(JSON.stringify(decisionsSummary)) as InputJsonValue,
      actionItemsSummary: JSON.parse(JSON.stringify(actionItemsSummary)) as InputJsonValue,
      agendaSummary: JSON.parse(JSON.stringify(agenda)) as InputJsonValue,
      statisticsSummary: JSON.parse(JSON.stringify(statisticsSummary)) as InputJsonValue,
    },
  });

  return minutes;
}
