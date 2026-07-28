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

import { useCallback, useEffect, useState } from "react";

export type OpsFeed<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  /** The request itself failed, or the server refused. NOT an empty feed. */
  | { state: "error"; message: string };

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

export function useOpsFeed<T>(path: string): { feed: OpsFeed<T>; reload: () => void } {
  const [feed, setFeed] = useState<OpsFeed<T>>({ state: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setFeed({ state: "loading" });

    void (async () => {
      try {
        const res = await fetch(path, { cache: "no-store" });
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
  }, [path, nonce]);

  return { feed, reload };
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
