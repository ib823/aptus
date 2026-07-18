/**
 * ABeam Workbench — Neutral Process Discovery external layout.
 *
 * Mirrors the Affirm external layout: a passthrough that imports the shared
 * guest stylesheet. Fonts, providers and the skip link come from the root
 * layout — nothing is re-declared here.
 *
 * The stylesheet is REUSED from the Affirm surface rather than copied: it is
 * generic (an `ax-*` utility prefix with no Affirm semantics) and carries the
 * pieces this surface needs — `.ax-touch` (44px targets under 1023px),
 * `.ax-input` (16px inputs under 767px, iOS zoom defeat), `.ax-skeleton`,
 * `.ax-shake`, `.ax-no-print`. Its header scopes it to guest surfaces so it
 * never reaches /c; /d is such a surface.
 */

import "../a/affirm-external.css";

export default function DiscoveryExternalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
