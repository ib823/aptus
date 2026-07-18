/**
 * ABeam Workbench — Present chrome (brief §7 V5 + §8).
 *
 * "Full-bleed 1920 canvas: top strip (client name + stream + step counter mono)
 * → the focused view → facilitator bar. No browser chrome feel."
 *
 * §8's Present rules: hide top nav, breadcrumbs, sidebars, search bars (replaced
 * by jump-to in the facilitator bar). Show: facilitator bar, oversized type,
 * one focal block, keyboard hints (subtle, bottom-left, fade after 4s).
 *
 * So this is not DiscoveryShell with a flag — it is the opposite shell. The
 * only thing it keeps from Explore's chrome is the mode switch, because a
 * facilitator must be able to leave (and `E`/`X` do it without the mouse).
 */

import type { ReactNode } from "react";
import type { DiscoveryMode } from "@/lib/discovery/mode";
import { ModeSwitch } from "./ModeSwitch";
import { PresentKeyboardHints } from "./PresentKeyboardHints";

export interface PresentShellProps {
  children: ReactNode;
  clientName: string;
  /** Stream or section context, mono in the top strip. */
  context?: string | null;
  /** e.g. "3 / 61" — mono step/process counter. */
  counter?: string | null;
  mode: DiscoveryMode;
  /** The facilitator bar (§6/23), sticky at the bottom. */
  facilitatorBar?: ReactNode;
}

export function PresentShell({
  children,
  clientName,
  context,
  counter,
  mode,
  facilitatorBar,
}: PresentShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Top strip — no nav, no breadcrumb, no search (§8). */}
      <header className="flex flex-none items-center gap-4 px-12 pt-8">
        <p className="font-mono text-[13px] uppercase tracking-[0.04em] text-ink-soft">
          {clientName}
          {context ? <span className="text-ink-soft"> · {context}</span> : null}
        </p>
        {counter ? (
          <p className="font-mono text-[13px] text-ink-soft" aria-live="polite">
            {counter}
          </p>
        ) : null}
        <div className="ml-auto">
          <ModeSwitch mode={mode} />
        </div>
      </header>

      {/* One focal block. Padding matches §2's 48px outer margin. */}
      <main id="main" className="flex-1 px-12 pb-[100px] pt-8">
        {children}
      </main>

      <PresentKeyboardHints />

      {facilitatorBar}
    </div>
  );
}
