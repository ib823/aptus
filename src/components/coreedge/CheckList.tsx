import type { ReactNode } from "react";

import { OWNER_LABELS, type StatusOwner } from "@/lib/coreedge/status-vocabulary";

/**
 * CheckList — the conditions behind a decision, each with its own verdict.
 *
 * Used for the reviewer's four checks and the write-access conditions. Every
 * line carries a glyph for the same reason chips do, and every failing line
 * names an owner: a checklist that says "failed" without saying whose job it is
 * has moved the problem rather than explained it.
 *
 * `running` is a state here and NOT a lane status — a check in flight is a fact
 * about this panel, not about the lane, which keeps its last known status
 * throughout.
 */

export type CheckState = "pass" | "fail" | "running" | "skipped";

const MARK: Readonly<Record<CheckState, { glyph: string; className: string; label: string }>> = {
  pass: { glyph: "✓", className: "text-success", label: "passed" },
  fail: { glyph: "✕", className: "text-danger", label: "failed" },
  running: { glyph: "…", className: "text-ink-muted", label: "checking" },
  skipped: { glyph: "–", className: "text-ink-muted", label: "skipped" },
};

export interface Check {
  readonly state: CheckState;
  readonly title: string;
  readonly detail?: string;
  readonly owner?: StatusOwner;
}

export interface CheckListProps {
  readonly checks: readonly Check[];
  readonly caption?: string;
}

export function CheckList({ checks, caption }: CheckListProps): ReactNode {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-warm)] bg-ink-tint p-4">
      {caption === undefined ? null : (
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{caption}</p>
      )}
      <ul className="flex flex-col gap-2">
        {checks.map((check) => {
          const mark = MARK[check.state];
          return (
            <li key={check.title} className="flex items-start gap-3">
              <span aria-hidden="true" className={`${mark.className} font-semibold leading-normal`}>
                {mark.glyph}
              </span>
              <span className="flex min-w-0 flex-col gap-[0.125em]">
                <span className="text-sm text-ink">
                  {check.title}
                  <span className="sr-only"> — {mark.label}</span>
                </span>
                {check.detail === undefined ? null : (
                  <span className="text-xs text-ink-soft">{check.detail}</span>
                )}
                {/*
                  Only a failing check names an owner. A passing one has nobody
                  to chase, and printing a name beside it invites the reader to
                  chase them anyway.
                */}
                {check.state === "fail" && check.owner !== undefined ? (
                  <span className="text-xs text-ink-muted">{OWNER_LABELS[check.owner]} fixes this</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
