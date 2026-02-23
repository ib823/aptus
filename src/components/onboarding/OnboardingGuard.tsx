import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

interface OnboardingGuardProps {
  children: React.ReactNode;
}

/**
 * Server component that redirects users to onboarding if they haven't completed it.
 * Placed in the portal layout to gate all authenticated pages.
 * Skips redirect when already on /onboarding to avoid infinite loops.
 */
export async function OnboardingGuard({ children }: OnboardingGuardProps) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Don't redirect if already on the onboarding page
  if (pathname.startsWith("/onboarding")) {
    return <>{children}</>;
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  if (!progress) {
    // Check if this is an established user (has assessments or stakeholder records)
    const activity = await prisma.assessmentStakeholder.count({
      where: { userId: user.id },
    });

    if (activity > 0) {
      // Auto-complete onboarding for existing users
      await prisma.onboardingProgress.create({
        data: {
          userId: user.id,
          role: user.role,
          currentStep: 0,
          completedSteps: [],
          skippedSteps: [],
          isComplete: true,
        },
      });
      return <>{children}</>;
    }

    // New user with no activity — redirect to onboarding
    redirect("/onboarding");
  }

  // If progress exists but isComplete is false, resume onboarding
  if (!progress.isComplete) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
