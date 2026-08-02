/**
 * Affirm-set route-group layout — sole job is to import the responsive
 * stylesheet alongside the existing workbench chrome.
 *
 * The responsive pass targets only /affirm/* surfaces (process-flow
 * strip, choice rows, tiers, steppers, release bar). Loading the CSS
 * here keeps the rules out of the rest of the workbench's selector
 * tree.
 */

import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import "./affirm-responsive.css";
import { AffirmLearnProvider } from "@/components/affirm/learn/AffirmLearnProvider";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessAffirm } from "@/lib/workbench/rbac";

/**
 * THE ENTRY GATE. Affirm had none: the (workbench) layout checks for a session,
 * so every role in the platform could open this workspace — including `viewer`,
 * which holds no privilege anywhere else.
 *
 * `notFound` rather than a redirect to a "no access" screen, matching how the
 * rest of the Workbench refuses: a role that may not be here does not need to
 * learn the shape of what it is missing.
 */
export default async function AffirmLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (!canAccessAffirm(user.role)) notFound();

  return <AffirmLearnProvider>{children}</AffirmLearnProvider>;
}
