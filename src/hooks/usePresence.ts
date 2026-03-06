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

    // 1. Maintain the heartbeat (sending presence)
    const performHeartbeat = () => {
      if (document.visibilityState === "hidden") return;
      void sendHeartbeat();
    };

    performHeartbeat(); // Initial
    const heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_INTERVAL);

    // 2. Initial fetch for presence data
    void fetchPresence();

    // 3. Connect to the Server-Sent Events stream for real-time updates
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectSSE = () => {
      if (document.visibilityState === "hidden") return;
      
      try {
        eventSource = new EventSource(`/api/assessments/${assessmentId}/stream`);

        eventSource.addEventListener("ping", () => {
          // When the server broadcasts a ping, it means there was generic activity or a heartbeat cycle
          void fetchPresence();
        });

        eventSource.onerror = () => {
          eventSource?.close();
          // Attempt to reconnect if SSE fails, falling back on the standard heartbeat
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch {
        // Silently fail if EventSource isn't supported
      }
    };

    connectSSE();

    // Handle tab visibility to save resources
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        performHeartbeat();
        void fetchPresence();
        if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
          connectSSE();
        }
      } else {
        // Close SSE when tab is hidden to save Vercel connection limits
        if (eventSource) {
          eventSource.close();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [assessmentId, sendHeartbeat, fetchPresence]);

  return { activeUsers };
}
