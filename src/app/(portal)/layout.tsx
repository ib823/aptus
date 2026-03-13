import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrganizationSubscription } from "@/lib/db/organizations";
import { PortalNav } from "@/components/layout/PortalNav";
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";
import { SubscriptionStatusBanner } from "@/components/commercial/SubscriptionStatusBanner";
import { MFA_REQUIRED_ROLES } from "@/constants/config";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { MobileBottomTabBar } from "@/components/pwa/MobileBottomTabBar";
import { PasskeyEnrollmentPrompt } from "@/components/auth/PasskeyEnrollmentPrompt";
import { GlobalHelpWidget } from "@/components/help/GlobalHelpWidget";
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

  // Check MFA status for external users
  const requiresMfa = (MFA_REQUIRED_ROLES as readonly string[]).includes(user.role);

  // Passkey login already satisfies MFA (sets mfaVerified=true on session)
  // so we only redirect for TOTP setup/verify when user hasn't used a passkey
  if (requiresMfa && !user.hasWebAuthn && !user.totpVerified) {
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
  const subscription = user.organizationId
    ? await getOrganizationSubscription(user.organizationId)
    : { status: "ACTIVE" as const, trialEndsAt: null };
  const { status: subscriptionStatus, trialEndsAt } = subscription;

  return (
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
  );
}
