import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

interface OnboardingGuardProps {
  children: React.ReactNode;
}

/**
 * Server component that redirects users to onboarding if they haven't completed it.
 * Placed in the portal layout to gate all authenticated pages.
 */
export async function OnboardingGuard({ children }: OnboardingGuardProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  // If no progress record, user hasn't started onboarding
  // If progress exists but isComplete is false, resume onboarding
  if (!progress || !progress.isComplete) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
