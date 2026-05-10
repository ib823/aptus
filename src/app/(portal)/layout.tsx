import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getOrganizationSubscription } from "@/lib/db/organizations";
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";
import { SubscriptionStatusBanner } from "@/components/commercial/SubscriptionStatusBanner";
// Passkey enrollment is offered as a soft, dismissable prompt below — never a hard gate
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { PasskeyEnrollmentPrompt } from "@/components/auth/PasskeyEnrollmentPrompt";
import { TourProvider } from "@/components/tour/TourProvider";
import { AptusShell } from "@/components/aptus";
import { NavigationFailsafe } from "@/components/layout/NavigationFailsafe";
import type { UserRole } from "@/types/assessment";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Portal layout — App-3: redesigned with the Aptus app shell.
 *
 * Replaces the old `<PortalNav>` with the new `<AptusShell>` (56 px topbar +
 * 64 px side rail + 1280-px content area, per spec §6.1). Preserves the
 * existing providers (TourProvider, OnboardingGuard, OfflineIndicator,
 * PasskeyEnrollmentPrompt) so authentication, onboarding gates, offline UX,
 * and passkey prompts keep working unchanged.
 *
 * Removed (handled differently in the new design):
 *   - <PortalNav>            → replaced by <AptusTopbar> + <AptusSideRail>
 *   - <GlobalHelpWidget>     → replaced by Help item in side rail
 *   - <MobileBottomTabBar>   → mobile is out of scope per spec §10.3 (v1)
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // MFA step-up gate. Triggered when a user has a passkey enrolled AND either
  // the org policy is "required" OR they personally opted in (mfaEnabled), AND
  // the current session hasn't satisfied the second factor yet. The verify-mfa
  // page runs the WebAuthn authenticate flow, marks the session, then bounces
  // the user back to where they came from via ?next.
  // Users without a passkey are not blocked here — see lib/auth/permissions.ts.
  if (isMfaRequired(user)) {
    const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
    const next = encodeURIComponent(pathname);
    redirect(`/verify-mfa?next=${next}`);
  }

  // Fetch org subscription status for banner
  const subscription = user.organizationId
    ? await getOrganizationSubscription(user.organizationId)
    : { status: "ACTIVE" as const, trialEndsAt: null };
  const { status: subscriptionStatus, trialEndsAt } = subscription;

  // Build the AptusUserMenu user shape from the current session
  const initials = (user.email || "U")
    .split("@")[0]
    ?.slice(0, 2)
    .toUpperCase() ?? "U";
  const aptusUser = {
    name: user.email?.split("@")[0] ?? "User",
    email: user.email ?? "",
    initials,
  };

  const banner = subscriptionStatus !== "ACTIVE" ? (
    <SubscriptionStatusBanner
      status={subscriptionStatus}
      trialEndsAt={trialEndsAt}
      upgradeHref="/settings/subscription"
    />
  ) : null;

  return (
    <TourProvider userRole={user.role as UserRole}>
      <NavigationFailsafe />
      <OfflineIndicator />
      <AptusShell user={aptusUser} banner={banner}>
        <PasskeyEnrollmentPrompt hasWebAuthn={user.hasWebAuthn} />
        <OnboardingGuard>{children}</OnboardingGuard>
      </AptusShell>
    </TourProvider>
  );
}
