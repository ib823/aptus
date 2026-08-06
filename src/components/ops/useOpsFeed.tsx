"use client";

/**
 * Read one Operations Center feed.
 *
 * WHY THE SCREENS FETCH RATHER THAN BEING SERVER-RENDERED. Every one of these
 * endpoints already decides what is true and attaches a `provenance` block
 * saying what it cannot see. A server component could reach past that straight
 * into Prisma — and the moment it does, the screen and the API can disagree
 * about what the data supports, which is the one failure this workspace exists
 * to prevent. Consuming the payload and nothing else makes that drift
 * unexpressible rather than merely discouraged.
 *
 * It also means the guard is enforced once, in `requireOperations`, on the path
 * the screen actually uses.
 *
 * THREE OUTCOMES, NEVER TWO. Loading, loaded, and failed are distinct states and
 * none of them is "empty". A fetch that failed must never render as a feed with
 * nothing in it — on a monitoring screen that is the difference between "your
 * integration is quiet" and "we cannot see your integration".
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type OpsFeed<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  /** The request itself failed, or the server refused. NOT an empty feed. */
  | { state: "error"; message: string };

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

/**
 * Windows the Operations Center offers.
 *
 * Every feed already accepts `?hours=` and clamps it (opsWindowHours, capped at
 * 30 days) — the screens simply never sent one, so all four were hard-wired to
 * the server's 24-hour default with no way to widen it. During an investigation
 * "was this happening last week?" was an unanswerable question on a monitoring
 * console, which is the one question such a console exists for.
 */
export const OPS_WINDOWS = [
  { hours: 24, label: "24 hours" },
  { hours: 24 * 7, label: "7 days" },
  { hours: 24 * 30, label: "30 days" },
] as const;

export const DEFAULT_OPS_WINDOW_HOURS = 24;

/**
 * How often a mounted feed re-reads itself. One minute: fast enough that a
 * monitoring screen left open on a wall does not show yesterday, slow enough
 * that the deployment is not paying for a dashboard nobody is watching.
 * Every screen renders the interval beside its "as at" (see FeedAsAt) — an
 * auto-refresh the reader does not know about is indistinguishable from data
 * that never goes stale.
 */
export const OPS_REFRESH_MS = 60_000;

export function useOpsFeed<T>(
  path: string,
  hours: number = DEFAULT_OPS_WINDOW_HOURS,
): { feed: OpsFeed<T>; reload: () => void; fetchedAt: Date | null } {
  const [feed, setFeed] = useState<OpsFeed<T>>({ state: "loading" });
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);
  // Which (path, hours) the current data belongs to. A CHANGED key must show
  // loading — keeping the old feed up would render another query's answer under
  // this query's controls. A refresh of the SAME key keeps the data on screen:
  // flashing a monitoring wall to "Loading…" once a minute reads as an outage.
  const keyRef = useRef<string | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    const key = `${path}|${hours}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      setFeed({ state: "loading" });
      setFetchedAt(null);
    }

    void (async () => {
      try {
        // The window is a query param, not a body: these are GETs and the
        // server clamps whatever arrives.
        const url = `${path}${path.includes("?") ? "&" : "?"}hours=${hours}`;
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
        if (!live) return;

        if (!res.ok || body.data === undefined) {
          setFeed({
            state: "error",
            // The server's own message where it gave one: it is written for the
            // caller and says what to do. A generic string here would discard
            // that and leave an operator guessing.
            message: body.error?.message ?? `The feed could not be read (HTTP ${res.status}).`,
          });
          return;
        }
        setFeed({ state: "ready", data: body.data });
        setFetchedAt(new Date());
      } catch {
        if (!live) return;
        setFeed({
          state: "error",
          message: "The feed could not be reached. This says nothing about the integration itself.",
        });
      }
    })();

    return () => {
      live = false;
    };
  }, [path, nonce, hours]);

  // The auto-refresh itself. A failed refresh renders the error state rather
  // than silently keeping stale data up — on a monitoring screen, "we cannot
  // see the integration" and "the integration is quiet" must never look alike.
  useEffect(() => {
    const timer = setInterval(() => setNonce((n) => n + 1), OPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return { feed, reload, fetchedAt };
}

/**
 * The freshness line every Ops screen renders: when the feed was last read and
 * how often it re-reads itself. The pairing is deliberate — a timestamp alone
 * invites "is that stale?", an interval alone invites "since when?".
 */
export function FeedAsAt({ fetchedAt }: { fetchedAt: Date | null }) {
  if (!fetchedAt) return null;
  return (
    <div
      style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 11.5,
        color: "var(--ink-muted)",
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
      }}
    >
      as at {fetchedAt.toLocaleTimeString("en-GB")} · refreshes every minute
    </div>
  );
}

/** Relative time that never rounds a real gap away. */
export function sinceLabel(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** Thousands separators, so a four-figure count is readable at a glance. */
export function count(n: number): string {
  return n.toLocaleString("en-GB");
}

/**
 * The window control itself.
 *
 * A plain select rather than a segmented control: three options, and a native
 * select is keyboard- and screen-reader-correct without any of the roving
 * tabindex work a custom widget would need to get right.
 */
export function OpsWindowPicker({
  hours,
  onChange,
  id = "ops-window",
}: {
  hours: number;
  onChange: (hours: number) => void;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
    >
      <span style={{ color: "var(--ink-secondary)" }}>Window</span>
      <select
        id={id}
        value={hours}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          fontSize: 12.5,
          padding: "3px 7px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: "var(--surface-paper)",
          color: "var(--ink-primary)",
        }}
      >
        {OPS_WINDOWS.map((w) => (
          <option key={w.hours} value={w.hours}>
            {w.label}
          </option>
        ))}
      </select>
    </label>
  );
}
