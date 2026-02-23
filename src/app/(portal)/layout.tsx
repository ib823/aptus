import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PortalNav } from "@/components/layout/PortalNav";
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";
import { SubscriptionStatusBanner } from "@/components/commercial/SubscriptionStatusBanner";
import { MFA_REQUIRED_ROLES } from "@/constants/config";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { MobileBottomTabBar } from "@/components/pwa/MobileBottomTabBar";
import type { SubscriptionStatus } from "@/types/commercial";
import type { ReactNode } from "react";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Check MFA status for external users
  const requiresMfa = (MFA_REQUIRED_ROLES as readonly string[]).includes(user.role);

  if (requiresMfa && !user.totpVerified) {
    redirect("/mfa/setup");
  }

  if (requiresMfa && !user.mfaVerified) {
    redirect("/mfa/verify");
  }

  // Internal users with MFA enabled but not verified this session
  if (!requiresMfa && user.mfaEnabled && !user.mfaVerified) {
    redirect("/mfa/verify");
  }

  // Fetch org subscription status for banner
  let subscriptionStatus: SubscriptionStatus = "ACTIVE";
  let trialEndsAt: string | null = null;
  if (user.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });
    if (org) {
      subscriptionStatus = org.subscriptionStatus as SubscriptionStatus;
      trialEndsAt = org.trialEndsAt?.toISOString() ?? null;
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <OfflineIndicator />
      <PortalNav user={user} />
      {subscriptionStatus !== "ACTIVE" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <SubscriptionStatusBanner
            status={subscriptionStatus}
            trialEndsAt={trialEndsAt}
          />
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 md:pb-8">
        <OnboardingGuard>
          {children}
        </OnboardingGuard>
      </main>
      <MobileBottomTabBar />
    </div>
  );
}
