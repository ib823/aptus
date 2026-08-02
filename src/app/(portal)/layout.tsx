import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, requiresMfaEnrollment } from "@/lib/auth/permissions";
import { getOrganizationSubscription } from "@/lib/db/organizations";
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";
import { SubscriptionStatusBanner } from "@/components/commercial/SubscriptionStatusBanner";
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
 *   - <MobileBottomTabBar>   → mobile is out of scope per spec §10.3 (v1)
 *   - <GlobalHelpWidget>     → NOT replaced. See below.
 *
 * WHAT HAPPENED TO THE HELP WIDGET. This comment used to say it was "replaced by
 * Help item in side rail". There is no Help item in the side rail: the user menu
 * has "Help & docs", which opens the Console manual. Static documentation is not
 * a replacement for a live channel to a consultant, and the swap left the rest of
 * the feature stranded — /api/help/* still serves, and /admin/help still renders a
 * consultant queue, but GlobalHelpWidget was the only thing that could CREATE a
 * session and it is mounted nowhere. So the queue cannot receive work.
 *
 * Left in place rather than deleted, because which way to resolve it is a product
 * call: re-mount the widget, or retire the queue and the routes with it. The
 * queue now says why it is empty instead of implying nobody has asked.
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

  const pathname = (await headers()).get("x-pathname") ?? "/dashboard";

  // MFA step-up gate. Required org policy also blocks users with no passkey,
  // but lets /settings/security render so they can enroll instead of looping.
  if (isMfaRequired(user)) {
    const next = encodeURIComponent(pathname);
    if (requiresMfaEnrollment(user)) {
      if (!pathname.startsWith("/settings/security")) {
        redirect(`/settings/security?mfa=required&next=${next}`);
      }
    } else {
      redirect(`/verify-mfa?next=${next}`);
    }
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
