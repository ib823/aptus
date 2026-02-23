import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { WorkshopListClient } from "./WorkshopListClient";

interface WorkshopListPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkshopListPage({ params }: WorkshopListPageProps) {
  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, companyName: true },
  });

  if (!assessment) notFound();

  const sessions = await prisma.workshopSession.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sessionCode: true,
      status: true,
      facilitatorName: true,
      scheduledAt: true,
      startedAt: true,
      completedAt: true,
      attendeeCount: true,
      duration: true,
      _count: { select: { actionItems: true, votes: true } },
      minutes: { select: { id: true } },
    },
  });

  const data = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    sessionCode: s.sessionCode,
    status: s.status,
    facilitatorName: s.facilitatorName,
    scheduledAt: s.scheduledAt?.toISOString() ?? null,
    startedAt: s.startedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    attendeeCount: s.attendeeCount,
    duration: s.duration,
    actionItemCount: s._count.actionItems,
    voteCount: s._count.votes,
    hasMinutes: !!s.minutes,
  }));

  return (
    <div className="px-4">
      <WorkshopListClient assessmentId={assessment.id} sessions={data} />
    </div>
  );
}
