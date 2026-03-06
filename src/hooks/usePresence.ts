"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface PresenceUser {
  userId: string;
  userName: string;
  userRole: string;
  userImage?: string | null;
  currentPage?: string | null;
  entityId?: string | null;
  lastSeenAt: string;
}

const HEARTBEAT_INTERVAL = 5000; // 5 seconds

/**
 * Hook to manage real-time user presence within an assessment context.
 */
export function usePresence(assessmentId: string, entityId?: string) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const authFailedRef = useRef(false);

  const redirectToSessionBridge = useCallback(() => {
    if (authFailedRef.current) return;
    authFailedRef.current = true;
    setActiveUsers([]);
    const callbackPath = pathname || "/assessments";
    router.replace(
      `/api/auth/bridge?callbackUrl=${encodeURIComponent(callbackPath)}`,
    );
  }, [pathname, router]);

  const fetchPresence = useCallback(async () => {
    if (authFailedRef.current) return;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/presence`);
      if (res.status === 401) {
        redirectToSessionBridge();
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setActiveUsers(json.data || []);
      }
    } catch {
      console.error("Failed to fetch presence");
    }
  }, [assessmentId, redirectToSessionBridge]);

  const sendHeartbeat = useCallback(async () => {
    if (authFailedRef.current) return;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPage: pathname,
          entityId: entityId || null,
        }),
      });
      if (res.status === 401) {
        redirectToSessionBridge();
      }
    } catch {
      // Silently fail heartbeats
    }
  }, [assessmentId, pathname, entityId, redirectToSessionBridge]);

  useEffect(() => {
    if (!assessmentId) return;

    // We only want to ping if the user is actually looking at the tab
    const performCycle = () => {
      if (document.visibilityState === "hidden") return;
      void sendHeartbeat();
      void fetchPresence();
    };

    // Initial sequence
    performCycle();

    const interval = setInterval(performCycle, HEARTBEAT_INTERVAL);

    // If the user comes back to the tab, fire immediately so it updates without waiting for the next interval tick.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        performCycle();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [assessmentId, sendHeartbeat, fetchPresence]);

  return { activeUsers };
}
