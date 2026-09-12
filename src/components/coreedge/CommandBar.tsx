"use client";

import { useState, type ReactNode } from "react";

/**
 * CommandBar — ask a question, get an answer or a place to go.
 *
 * THE ANSWER IS NOT OPTIMISTIC AND NEVER GUESSED. The only thing echoed
 * instantly is the text the user typed, which the build brief permits precisely
 * because it is theirs and not a claim about the system. Everything else waits
 * for the server.
 *
 * `answered` and `empty` are separate states because "no lane matches that" and
 * "here is the lane" are different answers, and a search that renders nothing
 * for both leaves the user unsure whether it worked. A console whose search
 * quietly fails is one people stop trusting for anything.
 */

export interface CommandResult {
  readonly href: string;
  readonly label: string;
  readonly detail?: string;
}

export interface CommandBarProps {
  readonly onQuery: (query: string) => void;
  /** A direct answer, where the question had one. */
  readonly answer?: string;
  readonly results?: readonly CommandResult[];
  readonly searching?: boolean;
  readonly variant?: "inline" | "overlay";
}

export function CommandBar({
  onQuery,
  answer,
  results,
  searching = false,
  variant = "inline",
}: CommandBarProps): ReactNode {
  // The user's own text, echoed immediately. The permitted optimism.
  const [query, setQuery] = useState("");

  const idle = query.trim() === "";
  const empty = !idle && !searching && results !== undefined && results.length === 0;

  return (
    <div
      className={
        variant === "overlay"
          ? "flex w-full max-w-xl flex-col gap-3 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-4 shadow-[var(--shadow-overlay)]"
          : "flex w-full flex-col gap-2"
      }
    >
      <label className="sr-only" htmlFor="coreedge-command">
        Search lanes, apps and data feeds
      </label>
      <input
        id="coreedge-command"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onQuery(e.target.value);
        }}
        placeholder="Search lanes, apps and data feeds"
        className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
      />

      {/* One live region for every outcome, so a screen reader hears the change. */}
      <div aria-live="polite" className="flex flex-col gap-2">
        {searching ? <p className="text-xs text-ink-muted">Searching…</p> : null}

        {answer === undefined ? null : (
          <p className="text-sm text-ink">{answer}</p>
        )}

        {empty ? (
          <p className="text-sm text-ink-soft">Nothing matches that.</p>
        ) : null}

        {results === undefined || results.length === 0 ? null : (
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  className="flex flex-col gap-[0.125em] rounded-[var(--radius-input)] px-2 py-2 hover:bg-ink-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
                >
                  <span className="text-sm text-ink">{r.label}</span>
                  {r.detail === undefined ? null : (
                    <span className="text-xs text-ink-muted">{r.detail}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
