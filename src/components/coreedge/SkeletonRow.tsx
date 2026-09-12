import type { ReactNode } from "react";

/**
 * SkeletonRow — the placeholder for something that has NEVER loaded.
 *
 * THE RULE IT ENFORCES: loading never blanks a known state. The handoff is
 * explicit — "skeletons appear only where nothing has ever loaded", and there is
 * no "checking" status because that "would be a nineteenth vocabulary entry for
 * a transient". A lane that was Live two seconds ago is still Live while its
 * re-check runs; replacing it with a pulsing grey bar throws away the only
 * information the user had and tells them nothing in exchange.
 *
 * `KeepLastKnown` below is the other half of that rule, and the one that
 * actually gets used most.
 *
 * The pulse runs on --dur-skeleton (1200ms), which A2 deliberately keeps off the
 * --dur-* scale: those are transition durations for things that finish, and a
 * loading pulse is a loop.
 */

export interface SkeletonRowProps {
  /** How many lines to stand in for. */
  readonly lines?: number;
  /** Relative widths, so a skeleton does not imply uniform content. */
  readonly widths?: readonly string[];
  readonly variant?: "row" | "card" | "trace";
}

const PULSE = "motion-safe:animate-[coreedge-skeleton_var(--dur-skeleton)_var(--ease-calm)_infinite]";

export function SkeletonRow({
  lines = 1,
  widths = ["100%"],
  variant = "row",
}: SkeletonRowProps): ReactNode {
  const gap = variant === "card" ? "gap-3" : "gap-2";
  return (
    <div
      className={`flex flex-col ${gap}`}
      // A skeleton is not content. It is announced once, as a status, rather
      // than as a row of empty cells.
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`block h-[1em] rounded-[var(--radius-input)] bg-ink-tint ${PULSE}`}
          style={{ width: widths[i % widths.length] ?? "100%" }}
        />
      ))}
    </div>
  );
}

export interface KeepLastKnownProps<T> {
  /** The fresh value, or undefined while a refresh is in flight. */
  readonly value: T | undefined;
  /** What was true before. Rendered, dimmed, while `value` is undefined. */
  readonly lastKnown: T | undefined;
  readonly children: (value: T, stale: boolean) => ReactNode;
  /** Shown ONLY when neither a value nor a last-known one exists. */
  readonly fallback: ReactNode;
}

/**
 * The mechanism behind "loading never blanks a known state".
 *
 * A refresh in flight renders the last known value, marked stale, rather than a
 * skeleton. The skeleton is reached only when there is genuinely nothing to
 * show — which is what `fallback` is for.
 */
export function KeepLastKnown<T>({
  value,
  lastKnown,
  children,
  fallback,
}: KeepLastKnownProps<T>): ReactNode {
  if (value !== undefined) return children(value, false);
  if (lastKnown !== undefined) {
    return (
      <span className="opacity-70" aria-busy="true">
        {children(lastKnown, true)}
      </span>
    );
  }
  return fallback;
}
