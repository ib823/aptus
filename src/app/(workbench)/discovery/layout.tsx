/**
 * Neutral Process Discovery — consultant workbench chrome.
 *
 * Auth and the top bar come from the (workbench) group layout, which already
 * redirects unauthenticated users to /presales/login and wraps everything in
 * WorkbenchShell. No new auth surface, per the plan.
 *
 * The siderail lives here rather than in WorkbenchShell because that shell is
 * shared with Affirm and presales and deliberately has no sidebar — adding one
 * there would change two shipped surfaces to serve a third.
 *
 * Flag-gated exactly like /d: unset ⇒ the whole section 404s.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DiscoverySiderail } from "@/components/discovery/workbench/DiscoverySiderail";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessDiscovery } from "@/lib/workbench/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "Process Discovery — ABeam Workbench", template: "%s — Process Discovery" },
};

/**
 * Flag first, then role. The flag decides whether this section EXISTS on a
 * deployment; the role decides whether this caller may see it. Checking the
 * flag first keeps the 404 for a disabled section identical for every role,
 * so the refusal does not leak which deployments have Discovery turned on.
 */
export default async function DiscoveryWorkbenchLayout({ children }: { children: ReactNode }) {
  if (!isNeutralDiscoveryEnabled()) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (!canAccessDiscovery(user.role)) notFound();

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      <DiscoverySiderail />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
