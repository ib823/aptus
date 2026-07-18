/**
 * ABeam Workbench — the per-view frame: breadcrumb + context chip + heading.
 *
 * The .dc's breadcrumb falls through to an empty string on half its views
 * (Sessions, Facilitation, Sources, Outputs, Health) — a bug, not a design.
 * Every view here passes its own.
 */

import type { ReactNode } from "react";
import { ContextChip, type ContextKind } from "./ContextChip";

export interface WorkbenchViewProps {
  breadcrumb: string;
  title: string;
  caption?: ReactNode;
  context?: ContextKind;
  client?: string | null | undefined;
  actions?: ReactNode;
  children: ReactNode;
  /** C6 renders its guard banner full-bleed, above the padding. */
  banner?: ReactNode;
}

export function WorkbenchView({
  breadcrumb,
  title,
  caption,
  context = "library",
  client,
  actions,
  children,
  banner,
}: WorkbenchViewProps) {
  return (
    <div className="flex min-h-full flex-col bg-cream">
      {banner}
      <div className="flex flex-1 flex-col px-6 py-5">
        <div className="mb-3.5 flex flex-wrap items-center gap-4">
          <nav aria-label="Breadcrumb">
            <p className="font-mono text-[11px] text-ink-soft">
              Workbench <span aria-hidden="true">▸</span> {breadcrumb}
            </p>
          </nav>
          <ContextChip kind={context} client={client} />
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </div>

        <div className="mb-3.5 flex flex-wrap items-baseline gap-2.5">
          <h1 className="font-serif text-base font-medium text-navy">{title}</h1>
          {caption ? <p className="text-xs text-ink-soft">{caption}</p> : null}
        </div>

        {children}
      </div>
    </div>
  );
}
