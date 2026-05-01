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
        background: "var(--aptus-bg)",
      }}
    >
      <AptusTopbar user={user} onSearch={cmdk.open} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "64px 1fr",
          minHeight: 0, // allow grid child to scroll
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
        </main>
      </div>
    </div>
  );
}
