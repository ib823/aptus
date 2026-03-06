"use client";

import { useEffect, useRef } from "react";
import { getSSEManager } from "@/lib/collaboration/sse-manager";

/**
 * Thin React hook for subscribing to SSE events via the shared SSE Manager.
 *
 * @param assessmentId - The assessment to subscribe to
 * @param eventType - The SSE event type (e.g., "locks_updated", "comments_updated")
 * @param callback - Called when the event fires
 * @param enabled - Whether the subscription is active (default true)
 */
export function useSSE(
  assessmentId: string,
  eventType: string,
  callback: () => void,
  enabled = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!assessmentId || !enabled) return;

    const unsubscribe = getSSEManager().subscribe(
      assessmentId,
      eventType,
      () => callbackRef.current(),
    );

    return unsubscribe;
  }, [assessmentId, eventType, enabled]);
}
