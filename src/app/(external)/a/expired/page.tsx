/**
 * GET /a/expired — polymorphic terminal state for the Affirm external surface.
 *
 * Renders ONE generic message regardless of the underlying reason (invalid /
 * revoked / superseded token, non-client-facing bundle, expired or idled
 * session, OTP lockout). We deliberately never oracle which condition applies
 * to a stranger — there is no reason query param and no per-reason copy.
 */

import { TerminalScreen } from "@/components/external/TerminalScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AffirmExpiredPage() {
  return (
    <TerminalScreen
      eyebrow="Link not active"
      heading="This link is no longer active"
      body="If you were expecting access, please refer to the invitation email from your ABeam consultant, or reply to it to request a new link."
    />
  );
}
