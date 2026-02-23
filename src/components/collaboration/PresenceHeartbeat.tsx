"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

export function PresenceHeartbeat({ assessmentId }: { assessmentId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function sendHeartbeat() {
      if (cancelled) return;
      try {
        await fetch(`/api/assessments/${assessmentId}/presence/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPage: pathname }),
        });
      } catch {
        // Silently fail
      }
    }

    void sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [assessmentId, pathname]);

  // Invisible component — only side effects
  return null;
}
