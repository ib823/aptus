/**
 * ABeam Workbench — /d session-ended terminal.
 *
 * Distinct from /d/expired only in tone: this is the friendly end of a session
 * the reviewer (or their consultant) closed deliberately, not a dead credential.
 * It reveals nothing a holder of the link doesn't already know.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestTerminal } from "@/components/affirm/external/GuestTerminal";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DiscoveryEndedPage() {
  if (!isNeutralDiscoveryEnabled()) notFound();
  return (
    <GuestTerminal
      eyebrow="Process Discovery"
      heading="You've signed out"
      body="Your review is saved. Open your invitation link again whenever you'd like to carry on."
    />
  );
}
