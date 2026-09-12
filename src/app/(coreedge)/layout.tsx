/**
 * CoreEdge Console — the `/coreedge/*` route group.
 *
 * TWO GATES, AND THEY WORK DIFFERENTLY ON PURPOSE.
 *
 *   · No session → redirect. There is nothing to render for someone who is not
 *     signed in, and every other route group in this app does the same.
 *   · A session with the "wrong" role → RENDER ANYWAY. This is the rule the
 *     whole console is built around: "every /coreedge route renders for every
 *     signed-in user, and only the actions change, each disabled one carrying
 *     its reason."
 *
 * WHY ROLE NEVER REDIRECTS HERE, when `(operations)` and `(studio)` both swap in
 * a RoleGatedEmptyState: a person who cannot approve access still needs to see
 * that the request exists, what state it is in, and who can act on it. Bouncing
 * them leaves them unable to discover the screen, let alone who to ask — and
 * "Ask in #coreedge-support" becomes the only route to learning the product has
 * a Requests page at all. The actions inside carry their reasons instead
 * (A6's "Rules and disabled reasons", rendered by DecisionBar).
 *
 * `.coreedge` IS APPLIED HERE, once, on the group. PR-1 scoped the whole token
 * layer under that class rather than at :root, because these names collide with
 * what the portal, Workbench, presales, affirm and discovery already ship —
 * `--ink-disabled` alone differs (#C4C4C4 outside, #6B6B6B inside). Every
 * CoreEdge surface is inside this element, and nothing outside it is.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "CoreEdge", template: "%s — CoreEdge" },
  description: "One app, one data feed, one environment — and whether it works.",
};

export default async function CoreEdgeLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  // No role check. See the header: role changes the actions, never the route.
  return <div className="coreedge min-h-screen">{children}</div>;
}
