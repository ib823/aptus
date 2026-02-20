import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSelectedScopeItemsWithProgress, getOverallReviewProgress } from "@/lib/db/process-steps";
import { prisma } from "@/lib/db/prisma";
import { ReviewClient } from "@/components/review/ReviewClient";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      status: true,
    },
  });

  if (!assessment) notFound();

  const [scopeItems, overallProgress] = await Promise.all([
    getSelectedScopeItemsWithProgress(assessmentId),
    getOverallReviewProgress(assessmentId),
  ]);

  return (
    <ReviewClient
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      userRole={user.role}
      scopeItems={scopeItems}
      initialProgress={overallProgress}
    />
  );
}
