/** GET: Get workshop minutes, POST: Generate/regenerate minutes */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { computeVoteTally } from "@/lib/workshop/vote-tally";
import { renderMinutesMarkdown } from "@/lib/workshop/minutes-renderer";
import { ERROR_CODES } from "@/types/api";
import type { WorkshopMinutesData, AgendaItem } from "@/types/workshop";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
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

  const { id: assessmentId, sessionId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const minutes = await prisma.workshopMinutes.findUnique({
    where: { sessionId },
  });

  if (!minutes) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Minutes not yet generated" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      ...minutes,
      generatedAt: minutes.generatedAt.toISOString(),
      regeneratedAt: minutes.regeneratedAt?.toISOString() ?? null,
      exportedAt: minutes.exportedAt?.toISOString() ?? null,
    },
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
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

  const { id: assessmentId, sessionId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: {
      id: true,
      title: true,
      sessionCode: true,
      facilitatorName: true,
      facilitatorId: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      agenda: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  // Only facilitator or admin can generate minutes
  if (session.facilitatorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only the facilitator can generate minutes" } },
      { status: 403 },
    );
  }

  // Gather data
  const [attendees, votes, actionItems] = await Promise.all([
    prisma.workshopAttendee.findMany({
      where: { sessionId },
      select: {
        role: true,
        joinedAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.workshopVote.findMany({
      where: { sessionId },
      select: { processStepId: true, userId: true, classification: true },
    }),
    prisma.workshopActionItem.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Get unique step IDs and compute tallies
  const stepIds = [...new Set(votes.map((v) => v.processStepId))];
  const stepInfo = await prisma.processStep.findMany({
    where: { id: { in: stepIds } },
    select: { id: true, actionTitle: true },
  });
  const stepMap = new Map(stepInfo.map((s) => [s.id, s.actionTitle]));

  const decisions = stepIds.map((stepId) => {
    const stepVotes = votes.filter((v) => v.processStepId === stepId);
    const tally = computeVoteTally(stepId, stepVotes);
    return {
      processStepId: stepId,
      stepTitle: stepMap.get(stepId) ?? stepId,
      classification: tally.consensus ?? "NO_CONSENSUS",
      totalVotes: tally.totalVotes,
      consensusPercentage: tally.consensusPercentage,
    };
  });

  // Statistics
  let fitCount = 0;
  let configureCount = 0;
  let gapCount = 0;
  let naCount = 0;
  let totalConsensus = 0;
  for (const d of decisions) {
    switch (d.classification) {
      case "FIT": fitCount++; break;
      case "CONFIGURE": configureCount++; break;
      case "GAP": gapCount++; break;
      case "NA": naCount++; break;
    }
    totalConsensus += d.consensusPercentage;
  }

  const agenda = Array.isArray(session.agenda) ? (session.agenda as unknown as AgendaItem[]) : [];

  const minutesData: WorkshopMinutesData = {
    title: session.title,
    sessionCode: session.sessionCode,
    facilitatorName: session.facilitatorName,
    scheduledAt: session.scheduledAt?.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    completedAt: session.completedAt?.toISOString(),
    attendees: attendees.map((a) => ({
      name: a.user.name,
      role: a.role,
      joinedAt: a.joinedAt.toISOString(),
    })),
    decisions,
    actionItems: actionItems.map((ai) => ({
      title: ai.title,
      assignedToName: ai.assignedToName ?? undefined,
      dueDate: ai.dueDate?.toISOString(),
      status: ai.status,
      priority: ai.priority,
    })),
    agenda,
    statistics: {
      totalStepsReviewed: decisions.length,
      fitCount,
      configureCount,
      gapCount,
      naCount,
      averageConsensus: decisions.length > 0 ? Math.round(totalConsensus / decisions.length) : 0,
    },
  };

  const content = renderMinutesMarkdown(minutesData);

  const existing = await prisma.workshopMinutes.findUnique({
    where: { sessionId },
  });

  const summaryJson = (obj: unknown) => JSON.parse(JSON.stringify(obj)) as InputJsonValue;

  let minutes;
  if (existing) {
    minutes = await prisma.workshopMinutes.update({
      where: { sessionId },
      data: {
        content,
        attendeesSummary: summaryJson(minutesData.attendees),
        decisionsSummary: summaryJson(minutesData.decisions),
        actionItemsSummary: summaryJson(minutesData.actionItems),
        agendaSummary: summaryJson(minutesData.agenda),
        statisticsSummary: summaryJson(minutesData.statistics),
        regeneratedAt: new Date(),
      },
    });
  } else {
    minutes = await prisma.workshopMinutes.create({
      data: {
        sessionId,
        content,
        attendeesSummary: summaryJson(minutesData.attendees),
        decisionsSummary: summaryJson(minutesData.decisions),
        actionItemsSummary: summaryJson(minutesData.actionItems),
        agendaSummary: summaryJson(minutesData.agenda),
        statisticsSummary: summaryJson(minutesData.statistics),
      },
    });
  }

  return NextResponse.json({
    data: {
      ...minutes,
      generatedAt: minutes.generatedAt.toISOString(),
      regeneratedAt: minutes.regeneratedAt?.toISOString() ?? null,
      exportedAt: minutes.exportedAt?.toISOString() ?? null,
    },
  }, { status: existing ? 200 : 201 });
}
