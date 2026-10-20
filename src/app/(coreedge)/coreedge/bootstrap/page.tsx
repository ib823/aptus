import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ClaimInstance } from "@/components/coreedge/actions/ClaimInstance";
import { BOOTSTRAP_REFUSAL_MESSAGES, bootstrapAvailability } from "@/lib/auth/bootstrap";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Claim a fresh instance's first platform administrator (roadmap P0.13).
 *
 * Nobody becomes administrator by signing in first any more. On an instance
 * with no administrator, the operator configures COREEDGE_BOOTSTRAP_TOKEN and
 * gives it to the person who should administer it; they sign in and present it
 * here. Everywhere else — production included, which has an administrator —
 * this screen says there is nothing to claim and offers no form.
 *
 * Renders for every signed-in user, like every /coreedge screen; what changes
 * is whether there is anything to claim, never the route. The rules, and the
 * audit of every attempt, are in lib/auth/bootstrap.ts.
 */

export const metadata: Metadata = { title: "Claim this instance" };

export default async function BootstrapPage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const availability = await bootstrapAvailability();

  return (
    <CoreEdgeShell
      current="/coreedge"
      title="Claim this instance"
      subtitle="The first platform administrator of a new instance is claimed with a one-time token"
    >
      {availability.open ? (
        <ClaimInstance />
      ) : (
        <p className="max-w-prose text-sm text-ink-soft">{BOOTSTRAP_REFUSAL_MESSAGES[availability.refusal]}</p>
      )}
    </CoreEdgeShell>
  );
}
