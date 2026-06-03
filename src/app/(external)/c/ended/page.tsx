/**
 * GET /c/ended — terminal confirmation page after logout.
 *
 * Pure static. Requires no cookie, no session, no DB. The /c/* headers in
 * next.config.ts still apply (Cache-Control: no-store, Referrer-Policy:
 * no-referrer) which is intentional — we don't want the rendered HTML
 * cached by intermediaries even though it carries no sensitive data.
 *
 * Visuals match the /c/expired card (brief §3.9) via the shared
 * <TerminalScreen> shell: cream surface, centered wordmark, serif heading.
 */

import { TerminalScreen } from '@/components/external/TerminalScreen';

export default function PresalesEndedPage() {
  return (
    <TerminalScreen
      align="center"
      eyebrow="Signed out"
      heading="Session ended"
      body="You have been signed out. You can close this tab."
    />
  );
}
