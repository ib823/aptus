import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PortalNav } from "@/components/layout/PortalNav";
import { MFA_REQUIRED_ROLES } from "@/constants/config";
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

  return (
    <div className="min-h-screen bg-muted/40">
      <PortalNav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
