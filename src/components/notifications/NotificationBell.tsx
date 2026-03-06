"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

type CountResult = {
  count: number;
  unauthorized: boolean;
};

async function fetchCount(): Promise<CountResult> {
  try {
    const res = await fetch("/api/notifications/unread-count");
    if (res.status === 401) {
      return { count: 0, unauthorized: true };
    }
    if (res.ok) {
      const json = await res.json();
      return { count: json.data?.count ?? 0, unauthorized: false };
    }
  } catch {
    // Silently fail — polling will retry
  }
  return { count: 0, unauthorized: false };
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const prevOpenRef = useRef(open);
  const router = useRouter();
  const pathname = usePathname();

  const handleUnauthorized = useRef<() => void>(() => undefined);
  handleUnauthorized.current = () => {
    if (authFailed) return;
    setAuthFailed(true);
    setOpen(false);
    const callbackPath = pathname || "/assessments";
    router.replace(
      `/api/auth/bridge?callbackUrl=${encodeURIComponent(callbackPath)}`,
    );
  };

  // SSE enhancement: connect to stream for real-time updates
  useEffect(() => {
    if (authFailed) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        eventSource = new EventSource("/api/notifications/stream");

        eventSource.addEventListener("unread_count", (event) => {
          try {
            const data = JSON.parse(event.data);
            if (typeof data.count === "number") {
              setUnreadCount(data.count);
            }
          } catch {
            // Invalid data
          }
        });

        eventSource.addEventListener("reconnect", () => {
          eventSource?.close();
          // Reconnect after a short delay
          reconnectTimeout = setTimeout(connect, 1000);
        });

        eventSource.onerror = () => {
          eventSource?.close();
          // Don't reconnect if auth has failed
          if (authFailed) return;
          // Reconnect after a delay — SSE is additive, polling is fallback
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch {
        // EventSource not available — polling fallback will cover it
      }
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [authFailed]);

  // Polling fallback — always runs regardless of SSE
  useEffect(() => {
    if (authFailed) return;

    let cancelled = false;

    void fetchCount().then((result) => {
      if (cancelled) return;
      if (result.unauthorized) {
        handleUnauthorized.current();
        return;
      }
      setUnreadCount(result.count);
    });

    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void fetchCount().then((result) => {
        if (cancelled) return;
        if (result.unauthorized) {
          handleUnauthorized.current();
          return;
        }
        setUnreadCount(result.count);
      });
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchCount().then((result) => {
          if (cancelled) return;
          if (result.unauthorized) {
            handleUnauthorized.current();
            return;
          }
          setUnreadCount(result.count);
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authFailed]);

  // Refresh count when panel closes (open transitions from true to false)
  useEffect(() => {
    if (authFailed) return;

    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (wasOpen && !open) {
      void fetchCount().then((result) => {
        if (result.unauthorized) {
          handleUnauthorized.current();
          return;
        }
        setUnreadCount(result.count);
      });
    }
  }, [authFailed, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 p-0"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="w-4 h-4 text-slate-500 hover:text-slate-700" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
