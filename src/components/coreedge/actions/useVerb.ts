"use client";

import { useCallback, useState, useTransition } from "react";

/**
 * One console verb: press, wait, and say what happened.
 *
 * WHY A SHARED HOOK AND NOT THREE COPIES. Four controls across three screens
 * post to a route and have to behave identically while they do: stay disabled
 * so a double press cannot send two requests, keep the row's known state on the
 * screen rather than blanking it, and put the server's own sentence in front of
 * the person when it refuses. Three hand-written copies of that would drift,
 * and the one that drifted would be the destructive one.
 *
 * LOADING NEVER BLANKS A KNOWN STATE — the PR-2 contract. This returns a
 * `pending` flag and nothing else; it never owns the row's data, so a caller
 * cannot accidentally render a spinner where a status used to be.
 *
 * THE SERVER'S SENTENCE IS THE ONE SHOWN. Routes refuse with the same
 * DISABLED_REASONS strings the screens render, so a refusal that arrives from
 * the network reads exactly like a refusal the screen predicted — rather than
 * a second vocabulary for the same rule.
 */

export interface VerbState<T> {
  readonly pending: boolean;
  /** The server's refusal, verbatim, or null. */
  readonly error: string | null;
  /**
   * What the last successful call returned, or null.
   *
   * Some verbs hand back something that exists nowhere else — a claim link is
   * never stored, so the response body is the only place it will ever appear.
   * A caller that could not read it would have to re-request it, which for a
   * one-time link means issuing a second one.
   */
  readonly data: T | null;
  readonly run: (body: unknown) => void;
}

export function useVerb<T = unknown>(path: string, onDone?: () => void): VerbState<T> {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const run = useCallback(
    (body: unknown) => {
      // Guard here rather than only on the control: a keyboard user can press
      // Enter again before React has re-rendered the disabled state.
      if (sending) return;
      setSending(true);
      setError(null);
      setData(null);
      void (async () => {
        try {
          const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            const message =
              typeof payload === "object" && payload !== null && "error" in payload
                ? String((payload as { error?: { message?: string } }).error?.message ?? "")
                : "";
            setError(message === "" ? "That did not work. Nothing has changed." : message);
            return;
          }
          setData(
            typeof payload === "object" && payload !== null && "data" in payload
              ? ((payload as { data: T }).data ?? null)
              : null,
          );
          // `startTransition` around the refresh so the row keeps its current
          // values while the server re-renders them.
          startTransition(() => onDone?.());
        } catch {
          // A network failure is not a refusal, and saying "forbidden" here
          // would send someone to ask for permission they already have.
          setError("CoreEdge could not reach the server. Nothing has changed.");
        } finally {
          setSending(false);
        }
      })();
    },
    [path, onDone, sending],
  );

  return { pending: pending || sending, error, data, run };
}
