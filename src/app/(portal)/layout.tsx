import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrganizationSubscription } from "@/lib/db/organizations";
import { PortalNav } from "@/components/layout/PortalNav";
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";
import { SubscriptionStatusBanner } from "@/components/commercial/SubscriptionStatusBanner";
// Passkey enrollment is offered as a soft, dismissable prompt below — never a hard gate
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { MobileBottomTabBar } from "@/components/pwa/MobileBottomTabBar";
import { PasskeyEnrollmentPrompt } from "@/components/auth/PasskeyEnrollmentPrompt";
import { GlobalHelpWidget } from "@/components/help/GlobalHelpWidget";
import { TourProvider } from "@/components/tour/TourProvider";
import type { UserRole } from "@/types/assessment";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch org subscription status for banner
  const subscription = user.organizationId
    ? await getOrganizationSubscription(user.organizationId)
    : { status: "ACTIVE" as const, trialEndsAt: null };
  const { status: subscriptionStatus, trialEndsAt } = subscription;

  return (
    <TourProvider userRole={user.role as UserRole}>
      <div className="min-h-screen" style={{ background: "var(--sapBackgroundColor, #f5f6f7)" }}>
        <OfflineIndicator />
        <PortalNav user={user} />
        {subscriptionStatus !== "ACTIVE" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <SubscriptionStatusBanner
              status={subscriptionStatus}
              trialEndsAt={trialEndsAt}
              upgradeHref="/settings/subscription"
            />
          </div>
        )}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 md:pb-8">
          <PasskeyEnrollmentPrompt hasWebAuthn={user.hasWebAuthn} />
          <OnboardingGuard>{children}</OnboardingGuard>
        </main>
        <GlobalHelpWidget userRole={user.role} />
        <MobileBottomTabBar role={user.role} />
      </div>
    </TourProvider>
  );
}
