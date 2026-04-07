import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

/**
 * Inline, non-blocking onboarding nudge rendered above the dashboard.
 * Reads OnboardingProgress and shows a compact "X of Y steps complete"
 * banner with a deep-link to the wizard. Renders nothing when the user
 * has no progress row, has completed onboarding, or has prior activity
 * (we treat seasoned users as already onboarded to avoid noise).
 */
export async function OnboardingChecklistBanner() {
  const user = await getCurrentUser();
  if (!user) return null;

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
    select: { isComplete: true, completedSteps: true, skippedSteps: true, currentStep: true },
  });

  // Existing users with stakeholder activity are treated as onboarded
  if (!progress) {
    const activity = await prisma.assessmentStakeholder.count({ where: { userId: user.id } });
    if (activity > 0) return null;
  }

  if (progress?.isComplete) return null;

  const completedCount = (progress?.completedSteps?.length ?? 0) + (progress?.skippedSteps?.length ?? 0);
  // Total steps is role-dependent; we surface just "X done" rather than guessing the denominator
  const isStarted = completedCount > 0;

  return (
    <div className="mb-6 rounded-lg border bg-card p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {isStarted ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isStarted ? "Pick up where you left off" : "Get started with Aptus"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {isStarted
              ? `You've completed ${completedCount} setup step${completedCount === 1 ? "" : "s"} so far.`
              : "A short guided tour helps you set up your first assessment."}
          </p>
        </div>
      </div>
      <a
        href="/onboarding"
        className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline shrink-0"
      >
        {isStarted ? "Resume" : "Start"}
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}
