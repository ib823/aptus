"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NotificationItem } from "@/components/notifications/NotificationItem";

interface NotificationData {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  deepLink: string | null;
  sentAt: string;
}

interface NotificationPanelProps {
  onClose?: (() => void) | undefined;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "read" } : n)),
    );
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "PUT" });
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: "read" })),
    );
  };

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="w-80 max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              &times;
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                id={n.id}
                type={n.type}
                title={n.title}
                body={n.body}
                status={n.status}
                deepLink={n.deepLink}
                sentAt={n.sentAt}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
