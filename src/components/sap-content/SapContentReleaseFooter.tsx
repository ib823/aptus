/**
 * "SAP content release 2608 · MY" — the one-line provenance footer for every
 * page that grounds on SAP content (2608 WS0, docs/2608/BUILD-LOG.md).
 *
 * Server component, no client state: it reads the release from the env at
 * render time (src/lib/sap-content/release.ts), so flipping
 * SAP_CONTENT_RELEASE changes every footer at once. Tokens only — no hex.
 *
 * Mounted by the Workbench and Aptus shells and the /a and /c external
 * layouts. Do NOT mount under /d (neutral discovery): the vendor-term guard
 * forbids the word "SAP" on that surface by design.
 */

import { getSapContentRelease } from "@/lib/sap-content/release";

type Props = {
  className?: string;
};

export function SapContentReleaseFooter({ className }: Props) {
  const { label, release, localisation } = getSapContentRelease();
  return (
    <footer
      data-testid="sap-content-release-footer"
      data-release={release}
      data-localisation={localisation}
      className={["px-4 py-2 text-xs text-muted-foreground", className].filter(Boolean).join(" ")}
    >
      {label}
    </footer>
  );
}
