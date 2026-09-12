import type { ReactNode } from "react";

/**
 * NeedsYouRow — one thing that is waiting on the person reading it.
 *
 * The four-pixel left edge is the only place in the console where colour alone
 * distinguishes rows, and it is allowed to because it is not carrying the
 * meaning: the title says what happened and the accent only agrees. The chips
 * and the action carry the rest.
 *
 * `blocked` exists as a variant because "waiting on you" and "waiting on someone
 * else" are different rows on the same screen. Rendering them alike is how a
 * home screen becomes a list nobody reads.
 */

export type NeedsYouAccent = "action" | "info" | "blocked";

const EDGE: Readonly<Record<NeedsYouAccent, string>> = {
  action: "border-l-danger",
  info: "border-l-info",
  blocked: "border-l-warning",
};

const ACCENT_WORD: Readonly<Record<NeedsYouAccent, string>> = {
  action: "Needs you",
  info: "For information",
  blocked: "Waiting on someone else",
};

export interface NeedsYouRowProps {
  readonly accent: NeedsYouAccent;
  readonly title: string;
  readonly detail: string;
  readonly chips?: ReactNode;
  readonly action?: ReactNode;
}

export function NeedsYouRow({
  accent,
  title,
  detail,
  chips,
  action,
}: NeedsYouRowProps): ReactNode {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-4 border-l-4 ${EDGE[accent]} bg-paper p-4`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {/* The accent's meaning in words, for anyone who cannot see the edge. */}
        <span className="sr-only">{ACCENT_WORD[accent]}.</span>
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="text-xs text-ink-soft">{detail}</span>
        {chips === undefined ? null : <div className="flex flex-wrap gap-2 pt-1">{chips}</div>}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
