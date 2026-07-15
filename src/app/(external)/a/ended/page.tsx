/**
 * GET /a/ended — Affirm external "signed out" terminal.
 *
 * Pure static: no cookie, no session, no DB. Shown after an explicit sign-out.
 */

import { TerminalScreen } from "@/components/external/TerminalScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AffirmEndedPage() {
  return (
    <TerminalScreen
      align="center"
      eyebrow="Signed out"
      heading="Session ended"
      body="You've been signed out. You can return any time using the secure link in your invitation email."
    />
  );
}
