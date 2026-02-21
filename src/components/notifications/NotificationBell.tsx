"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

async function fetchCount(): Promise<number> {
  try {
    const res = await fetch("/api/notifications/unread-count");
    if (res.ok) {
      const json = await res.json();
      return json.data?.count ?? 0;
    }
  } catch {
    // Silently fail — polling will retry
  }
  return 0;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const prevOpenRef = useRef(open);

  // Poll for unread count on an interval. The setInterval callback
  // (not invoked synchronously inside the effect) satisfies the lint rule.
  useEffect(() => {
    let cancelled = false;

    // Initial fetch via microtask to avoid synchronous setState in effect
    void fetchCount().then((count) => {
      if (!cancelled) setUnreadCount(count);
    });

    const interval = setInterval(() => {
      void fetchCount().then((count) => {
        if (!cancelled) setUnreadCount(count);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Refresh count when panel closes (open transitions from true to false)
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (wasOpen && !open) {
      void fetchCount().then((count) => {
        setUnreadCount(count);
      });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 p-0"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
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
