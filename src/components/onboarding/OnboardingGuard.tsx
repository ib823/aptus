interface OnboardingGuardProps {
  children: React.ReactNode;
}

/**
 * Onboarding is now non-blocking. The wizard at /onboarding is reachable via
 * the dashboard checklist banner (`OnboardingChecklistBanner`); this component
 * is kept as a passthrough so the layout stays stable while the redirect is
 * removed. Delete it once nothing imports it.
 */
export function OnboardingGuard({ children }: OnboardingGuardProps) {
  return <>{children}</>;
}
