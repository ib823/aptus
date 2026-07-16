/**
 * ABeam Workbench — the polymorphic terminal for /d.
 *
 * Every dead end lands here with ONE message: bad token, revoked grant,
 * superseded grant, engagement no longer client-facing, ended/expired/idled
 * session, OTP lockout. It never reveals which — a terminal that explains itself
 * is an enumeration tool.
 *
 * Reuses GuestTerminal, which takes all its copy as props.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestTerminal } from "@/components/affirm/external/GuestTerminal";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DiscoveryExpiredPage() {
  if (!isNeutralDiscoveryEnabled()) notFound();
  return (
    <GuestTerminal
      eyebrow="Process Discovery"
      heading="This link is no longer active"
      body="Your access may have expired, or a newer invitation may have replaced it. Your ABeam contact can send you a fresh link."
    />
  );
}
