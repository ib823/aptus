/**
 * GET /a/expired — S3 polymorphic terminal.
 *
 * ONE generic message regardless of the underlying reason (invalid / revoked /
 * superseded / non-client-facing / expired / OTP lockout). Never oracles which
 * applies. Restyled to the Executive Surface design.
 */

import { GuestTerminal } from "@/components/affirm/external/GuestTerminal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AffirmExpiredPage() {
  return (
    <GuestTerminal
      eyebrow="ABeam Workbench"
      heading="This link is no longer active"
      body="Your review window has closed. Your ABeam consultant can send you a fresh link whenever you're ready to continue."
    />
  );
}
