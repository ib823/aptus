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

  // If no progress record, user hasn't started onboarding
  // If progress exists but isComplete is false, resume onboarding
  if (!progress || !progress.isComplete) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
