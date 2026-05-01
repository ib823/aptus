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

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  // Off-canvas sidebar state for mobile (≤768px). Auto-closes on route change
  // so navigating from the sidebar dismisses the overlay.
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  // Lock body scroll while the off-canvas sidebar is open so the page behind
  // the backdrop doesn't scroll under user touch. Cleaned up on close + unmount.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);
  return (
    <div
      className="aptus-app"
      style={{
        minHeight: "100vh",
        width: "100%",
        // hard cap against CSS Grid min-content blowout: an undeclared grid
        // column track defaults to `auto` (= max-content) and would force
        // the entire shell to its widest descendant's width. minmax(0, 1fr)
        // forces the track to allow shrinking below its content size.
        maxWidth: "100vw",
        display: "grid",
        gridTemplateRows: "56px 1fr",
        gridTemplateColumns: "minmax(0, 1fr)",
        background: "var(--aptus-bg)",
        overflowX: "hidden",
      }}
    >
      <AptusTopbar
        user={user}
        onSearch={cmdk.open}
        onMenuToggle={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen}
      />

      <div
        className="a-shell-body"
        style={{
          display: "grid",
          // Same fix one level down: `1fr` is shorthand for `minmax(auto, 1fr)`.
          // Use `minmax(0, 1fr)` so the content column can shrink below its
          // intrinsic max-content width.
          gridTemplateColumns: "64px minmax(0, 1fr)",
          minHeight: 0, // allow grid child to scroll
          minWidth: 0,  // allow grid child to shrink
        }}
      >
        {/* Mobile-only backdrop: closes the sidebar on tap-outside.
            Hidden on desktop via `display: none` when menuOpen is false. */}
        {menuOpen && (
          <div
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            style={{
              position: "fixed",
              inset: "56px 0 0 0",
              background: "rgba(0,0,0,0.4)",
              zIndex: 30,
            }}
          />
        )}
        <div className={`a-siderail-mobile${menuOpen ? " a-open" : ""}`}>
          <AptusSideRail />
        </div>

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
