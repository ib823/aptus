/**
 * <GuestShell> — the top-bar + footer chrome present on every Affirm external
 * screen (design S0 global chrome). Token-only, server-rendered.
 *
 * The top bar shows the wordmark always, and the grantee identity only once a
 * session is active (home/stream/process/affirm/summary) — landing/verify/
 * terminal pass no grantee. The footer always carries the confidential line.
 * The design's dev "Inspect" toggle is intentionally omitted (design-tool only).
 */

import type { ReactNode } from "react";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-8 text-[20px]" : "size-6 text-[15px]";
  const word = size === "lg" ? "text-[22px]" : "text-base";
  return (
    <span className="flex items-center gap-2">
      <span
        className={`flex items-center justify-center rounded font-serif font-semibold leading-none text-white bg-navy ${box}`}
      >
        A
      </span>
      <span className={`font-serif font-medium text-navy ${word}`}>ABeam Workbench</span>
    </span>
  );
}

export function GuestShell({
  children,
  granteeName,
  granteeRole,
  clientName,
}: {
  children: ReactNode;
  granteeName?: string | null;
  granteeRole?: string | null;
  clientName?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="ax-no-print sticky top-0 z-40 flex h-14 flex-none items-center justify-between border-b border-border-default bg-paper px-[clamp(16px,4vw,32px)]">
        <Wordmark size="md" />
        {granteeName ? (
          <span className="text-[13px] text-ink-soft">
            <span className="font-semibold text-ink">{granteeName}</span>
            {granteeRole ? ` · ${granteeRole}` : ""}
          </span>
        ) : null}
      </header>

      <div className="flex-1">{children}</div>

      <footer className="ax-no-print mt-auto border-t border-border-default bg-cream px-[clamp(16px,4vw,32px)] py-5">
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          <span>
            Prepared by ABeam Consulting · Confidential
            {clientName ? ` — for ${clientName} executive review` : " — for executive review"}
          </span>
          <span className="text-ink-disabled">·</span>
          <span className="text-navy">PDPA notice</span>
          <span className="text-navy">Terms</span>
        </div>
      </footer>
    </div>
  );
}
