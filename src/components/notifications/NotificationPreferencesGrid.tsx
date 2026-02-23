"use client";

import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  FORCED_IN_APP_TYPES,
  type NotificationType,
} from "@/types/notification";

interface Preference {
  notificationType: string;
  channelEmail: boolean;
  channelInApp: boolean;
  channelPush: boolean;
}

const CHANNELS = [
  { key: "channelInApp" as const, label: "In-App" },
  { key: "channelEmail" as const, label: "Email" },
  { key: "channelPush" as const, label: "Push" },
] as const;

export function NotificationPreferencesGrid() {
  const [preferences, setPreferences] = useState<Map<string, Preference>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const json = await res.json();
        const prefs = (json.data ?? []) as Preference[];
        const map = new Map<string, Preference>();
        for (const p of prefs) {
          map.set(p.notificationType, p);
        }
        setPreferences(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleToggle = async (
    notificationType: NotificationType,
    channel: "channelEmail" | "channelInApp" | "channelPush",
    value: boolean,
  ) => {
    // Prevent disabling forced in_app types
    if (channel === "channelInApp" && !value && FORCED_IN_APP_TYPES.includes(notificationType)) {
      return;
    }

    const current = preferences.get(notificationType) ?? {
      notificationType,
      channelEmail: true,
      channelInApp: true,
      channelPush: false,
    };

    const updated = { ...current, [channel]: value };

    // Optimistic update
    setPreferences((prev) => {
      const next = new Map(prev);
      next.set(notificationType, updated);
      return next;
    });

    setSaving(true);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationType,
          channelEmail: updated.channelEmail,
          channelInApp: updated.channelInApp,
          channelPush: updated.channelPush,
        }),
      });
    } catch {
      // Revert on failure
      fetchPreferences();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading preferences...</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
              Notification Type
            </th>
            {CHANNELS.map((ch) => (
              <th
                key={ch.key}
                className="text-center py-3 px-4 font-medium text-muted-foreground w-24"
              >
                {ch.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_NOTIFICATION_TYPES.map((type) => {
            const pref = preferences.get(type);
            const isForced = FORCED_IN_APP_TYPES.includes(type);

            return (
              <tr key={type} className="border-b hover:bg-muted/40">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span>{NOTIFICATION_TYPE_LABELS[type]}</span>
                    {isForced && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        Required
                      </Badge>
                    )}
                  </div>
                </td>
                {CHANNELS.map((ch) => {
                  const value = pref?.[ch.key] ?? (ch.key === "channelPush" ? false : true);
                  const isLocked = ch.key === "channelInApp" && isForced;

                  return (
                    <td key={ch.key} className="text-center py-3 px-4">
                      <Switch
                        checked={value}
                        onCheckedChange={(v) => handleToggle(type, ch.key, v)}
                        disabled={isLocked || saving}
                        aria-label={`${NOTIFICATION_TYPE_LABELS[type]} ${ch.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
