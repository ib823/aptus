"use client";

/**
 * AptusShell — top-level wrapper that composes the new Aptus app shell.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  AptusTopbar (56 px, sticky)             │
 *   ├──────┬───────────────────────────────────┤
 *   │ Side │  Content (max-width 1280)         │
 *   │ Rail │  scrollable                       │
 *   │ 64px │                                   │
 *   └──────┴───────────────────────────────────┘
 *
 * Wraps children in `.aptus-app` so the new design tokens activate. Existing
 * SAP-Horizon-styled pages keep working — the new tokens add to the cascade
 * but don't override any class-based styles those pages already use.
 *
 * Spec §6.1.
 */

import { AptusCmdKProvider, useAptusCmdK } from "./AptusCmdK";
import { AptusSideRail } from "./AptusSideRail";
import { AptusTopbar } from "./AptusTopbar";
import type { AptusUserMenuUser } from "./AptusUserMenu";
import { SapContentReleaseFooter } from "@/components/sap-content/SapContentReleaseFooter";

interface AptusShellProps {
  user: AptusUserMenuUser;
  /** Optional banner row (e.g., subscription status) rendered above the content. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function AptusShell({ user, banner, children }: AptusShellProps) {
  return (
    <AptusCmdKProvider>
      <ShellInner user={user} banner={banner}>
        {children}
      </ShellInner>
    </AptusCmdKProvider>
  );
}

/** Inner shell — split out so we can call useAptusCmdK() (must be inside provider). */
function ShellInner({ user, banner, children }: AptusShellProps) {
  const cmdk = useAptusCmdK();
  return (
    <div
      className="aptus-app"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "56px 1fr",
        // Declare a flexible column so the implicit auto-track doesn't
        // size to max-content (which would force the whole shell wider
        // than the viewport at narrow widths). minmax(0, 1fr) lets the
        // column shrink below intrinsic content width.
        gridTemplateColumns: "minmax(0, 1fr)",
        background: "var(--aptus-bg)",
      }}
    >
      <AptusTopbar user={user} onSearch={cmdk.open} />

      <div
        style={{
          display: "grid",
          // `1fr` is shorthand for `minmax(auto, 1fr)`; `auto` = min-content
          // = the same blowout trap. `minmax(0, 1fr)` lets the content
          // column shrink below its intrinsic width.
          gridTemplateColumns: "64px minmax(0, 1fr)",
          minHeight: 0,  // allow grid child to scroll
          minWidth: 0,   // allow grid child to shrink
        }}
      >
        <AptusSideRail />

        <main
          style={{
            overflowY: "auto",
            background: "var(--aptus-bg)",
          }}
        >
          {banner && (
            <div style={{ padding: "16px 24px 0", maxWidth: 1280, margin: "0 auto" }}>
              {banner}
            </div>
          )}
          <div
            style={{
              padding: "32px 24px 64px",
              maxWidth: 1280,
              margin: "0 auto",
            }}
          >
            {children}
          </div>
          <SapContentReleaseFooter className="mx-auto max-w-[1280px]" />
        </main>
      </div>
    </div>
  );
}
