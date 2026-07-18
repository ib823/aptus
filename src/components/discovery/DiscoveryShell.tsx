/**
 * ABeam Workbench — Neutral Process Discovery guest chrome (brief §7).
 *
 * "cream bg; slim top bar (56px paper, 1px bottom border) — Wordmark md left,
 * mode switch center-right, client name + engagement label right. Footer line
 * every view: 'Prepared by ABeam Consulting · product-agnostic process
 * discovery · Confidential'. Content column max-w 1040."
 *
 * The Wordmark is reused from the Affirm shell — it is surface-neutral. The rest
 * is discovery-specific: GuestShell's footer reads "…Confidential — for {client}
 * executive review", where the brief mandates the discovery line verbatim, and
 * the discovery top bar carries an eyebrow GuestShell has no concept of. Adding
 * three props to a shipped component to serve another surface's chrome would
 * make it a config bag; this keeps both readable.
 *
 * The mode switch (§6/22) ships here as of PR-3, closing D8. It is omitted on
 * the pre-session surfaces (landing, verify, terminals) — switching mode before
 * you have a session to view is meaningless.
 */

import type { ReactNode } from "react";
import { Wordmark } from "@/components/affirm/external/GuestShell";
import type { DiscoveryMode } from "@/lib/discovery/mode";
import { ModeSwitch } from "./ModeSwitch";

export interface DiscoveryShellProps {
  children: ReactNode;
  /** The engagement's client label — from the session, never a fixture. */
  clientName?: string | null;
  engagementLabel?: string | null;
  granteeName?: string | null;
  granteeRole?: string | null;
  /** Omit to hide the switch (pre-session surfaces). */
  mode?: DiscoveryMode;
}

export function DiscoveryShell({
  children,
  clientName,
  engagementLabel,
  granteeName,
  granteeRole,
  mode,
}: DiscoveryShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="ax-no-print sticky top-0 z-30 flex h-14 flex-none items-center gap-5 border-b border-border-default bg-paper px-[clamp(16px,4vw,24px)]">
        <Wordmark size="md" />
        <span className="hidden h-5 w-px bg-border-default sm:block" aria-hidden="true" />
        <p className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted sm:block">
          Neutral Process Discovery
        </p>

        <div className="ml-auto flex items-center gap-4 text-right leading-tight">
          {mode ? <ModeSwitch mode={mode} /> : null}
          {clientName ? (
            <span className="block">
              <span className="block text-[13px] font-semibold text-ink">{clientName}</span>
              {engagementLabel ? (
                <span className="block text-[11px] text-ink-muted">{engagementLabel}</span>
              ) : null}
            </span>
          ) : null}
          {granteeName ? (
            <span className="hidden text-[13px] text-ink-soft sm:block">
              <span className="font-semibold text-ink">{granteeName}</span>
              {granteeRole ? ` · ${granteeRole}` : ""}
            </span>
          ) : null}
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1040px] flex-1 px-8 pb-20 pt-10">
        {children}
      </main>

      <footer className="ax-no-print mt-auto border-t border-border-default bg-cream px-8 py-4">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.04em] text-ink-muted">
          Prepared by ABeam Consulting · product-agnostic process discovery · Confidential
        </p>
      </footer>
    </div>
  );
}
